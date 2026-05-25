import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface VyasaUiStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly apiEndpoint: string;
  readonly domainName?: string;
}

export class VyasaUiStack extends cdk.Stack {
  public readonly distributionId: string;
  public readonly distributionDomainName: string;
  public readonly uiBucketName: string;

  constructor(scope: Construct, id: string, props: VyasaUiStackProps) {
    super(scope, id, props);

    const { config, apiEndpoint, domainName } = props;

    const uiBucket = new s3.Bucket(this, 'VyasaUiBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy:
        config.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.envName !== 'prod',
      lifecycleRules: [
        {
          id: 'expire-old-versions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });
    this.uiBucketName = uiBucket.bucketName;

    // CloudFront access logging requires ACLs on the log bucket.
    // objectOwnership BUCKET_OWNER_PREFERRED + disabling BlockPublicAcls
    // allows CloudFront's log delivery principal to write via ACL.
    const accessLogsBucket = new s3.Bucket(this, 'VyasaUiAccessLogsBucket', {
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      }),
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'expire-logs',
          expiration: cdk.Duration.days(config.logRetentionDays),
        },
      ],
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'VyasaUiOAC', {
      originAccessControlName: `vyasa-ui-oac-${config.envName}`,
      description: `Vyasa UI ${config.envName} OAC`,
    });

    uiBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [uiBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
          },
        },
      })
    );

    const priceClassMap: Record<string, cloudfront.PriceClass> = {
      PriceClass_100: cloudfront.PriceClass.PRICE_CLASS_100,
      PriceClass_200: cloudfront.PriceClass.PRICE_CLASS_200,
      PriceClass_All: cloudfront.PriceClass.PRICE_CLASS_ALL,
    };
    const priceClass =
      priceClassMap[config.cloudFrontPriceClass] ??
      cloudfront.PriceClass.PRICE_CLASS_100;

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(uiBucket, {
      originAccessControl: oac,
    });

    // Strip the https:// prefix at CloudFormation resolution time.
    // apiEndpoint is a cross-stack CFn token, so JS .replace() won't work —
    // Fn.select(1, Fn.split('://', url)) yields the hostname reliably.
    const apiHost = cdk.Fn.select(1, cdk.Fn.split('://', apiEndpoint));

    const apiOrigin = new origins.HttpOrigin(apiHost, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      connectionAttempts: 3,
      connectionTimeout: cdk.Duration.seconds(10),
      readTimeout: cdk.Duration.seconds(60),
    });

    // CloudFront Function: rewrite /api/foo -> /foo before forwarding to
    // the API Gateway origin. The Lambda routes have no /api prefix.
    const apiRewriteFn = new cloudfront.Function(this, 'ApiPrefixRewrite', {
      functionName: `vyasa-api-rewrite-${config.envName}-v2`,
      code: cloudfront.FunctionCode.fromInline(
        `
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\\/api/, '') || '/';
  return request;
}
      `.trim()
      ),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const certificate = domainName
      ? new acm.Certificate(this, 'VyasaUiCertificate', {
          domainName,
          validation: acm.CertificateValidation.fromDns(),
        })
      : undefined;

    const distribution = new cloudfront.Distribution(
      this,
      'VyasaUiDistribution',
      {
        comment: `Vyasa Intelligence UI — ${config.envName}`,
        priceClass,
        defaultRootObject: 'index.html',
        enableLogging: true,
        logBucket: accessLogsBucket,
        logFilePrefix: 'cf-access-logs/',
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        domainNames: domainName ? [domainName] : undefined,
        certificate,
        defaultBehavior: {
          origin: s3Origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        additionalBehaviors: {
          '/api/*': {
            origin: apiOrigin,
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            functionAssociations: [
              {
                function: apiRewriteFn,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ],
          },
        },
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
      }
    );

    this.distributionId = distribution.distributionId;
    this.distributionDomainName = distribution.distributionDomainName;

    new logs.LogGroup(this, 'VyasaUiDeployLogGroup', {
      logGroupName: `/vyasa/ui-deploy-${config.envName}-v2`,
      retention: config.logRetentionDays as logs.RetentionDays,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'VyasaUiDistributionId', {
      value: distribution.distributionId,
      exportName: `${id}-DistributionId`,
      description: 'CloudFront distribution ID for Vyasa UI',
    });

    new cdk.CfnOutput(this, 'VyasaUiDistributionDomain', {
      value: distribution.distributionDomainName,
      exportName: `${id}-DistributionDomain`,
      description: 'CloudFront domain name for Vyasa UI',
    });

    new cdk.CfnOutput(this, 'VyasaUiBucketName', {
      value: uiBucket.bucketName,
      exportName: `${id}-UiBucketName`,
      description: 'S3 bucket for Vyasa UI static assets',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    cdk.Tags.of(this).add('Service', 'vyasa-ui');
    cdk.Tags.of(this).add('CostCenter', 'learning');
  }
}
