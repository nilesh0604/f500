import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface SecurityStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vpc: ec2.Vpc;
}

export class SecurityStack extends cdk.Stack {
  public readonly orderServiceTaskRole: iam.Role;
  public readonly notificationSvcTaskRole: iam.Role;
  public readonly orderServiceExecutionRole: iam.Role;
  public readonly notificationSvcExecutionRole: iam.Role;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly webAclArn: string | undefined;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `/orderflow/${config.envName}/jwt-secret`,
      description: 'JWT RS256 private key for OrderFlow',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ algorithm: 'RS256' }),
        generateStringKey: 'privateKey',
        passwordLength: 64,
        excludePunctuation: false,
      },
    });

    cdk.Tags.of(this.jwtSecret).add(
      'RotationPolicyDays',
      String(config.secretsRotationDays)
    );
    cdk.Tags.of(this.jwtSecret).add('DataClassification', 'Restricted');
    cdk.Tags.of(this.jwtSecret).add('ManagedRotation', 'manual-CICD');

    const appConfigSecret = new secretsmanager.Secret(this, 'AppConfigSecret', {
      secretName: `/orderflow/${config.envName}/app-config`,
      description: 'OrderFlow application configuration secrets',
      secretObjectValue: {
        ENVIRONMENT: cdk.SecretValue.unsafePlainText(config.envName),
      },
    });
    cdk.Tags.of(appConfigSecret).add('DataClassification', 'Confidential');
    cdk.Tags.of(appConfigSecret).add(
      'RotationPolicyDays',
      String(config.secretsRotationDays)
    );

    this.orderServiceExecutionRole = new iam.Role(
      this,
      'OrderServiceExecutionRole',
      {
        roleName: `orderflow-${config.envName}-order-svc-execution`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      }
    );
    this.jwtSecret.grantRead(this.orderServiceExecutionRole);
    appConfigSecret.grantRead(this.orderServiceExecutionRole);

    this.orderServiceTaskRole = new iam.Role(this, 'OrderServiceTaskRole', {
      roleName: `orderflow-${config.envName}-order-svc-task`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task role for OrderFlow order-service',
    });
    this.orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EventBridgePublish',
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: [
          `arn:aws:events:${this.region}:${this.account}:event-bus/orderflow-${config.envName}`,
        ],
      })
    );
    this.orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsRead',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/orderflow/${config.envName}/*`,
        ],
      })
    );
    this.orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'XRayWrite',
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      })
    );
    this.orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchMetrics',
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'cloudwatch:namespace': 'OrderFlow' },
        },
      })
    );

    this.notificationSvcExecutionRole = new iam.Role(
      this,
      'NotificationSvcExecutionRole',
      {
        roleName: `orderflow-${config.envName}-notif-svc-execution`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      }
    );
    this.jwtSecret.grantRead(this.notificationSvcExecutionRole);
    appConfigSecret.grantRead(this.notificationSvcExecutionRole);

    this.notificationSvcTaskRole = new iam.Role(
      this,
      'NotificationSvcTaskRole',
      {
        roleName: `orderflow-${config.envName}-notif-svc-task`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        description: 'Task role for OrderFlow notification-svc',
      }
    );
    this.notificationSvcTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SqsConsume',
        effect: iam.Effect.ALLOW,
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:ChangeMessageVisibility',
        ],
        resources: [
          `arn:aws:sqs:${this.region}:${this.account}:orderflow-${config.envName}-*`,
        ],
      })
    );
    this.notificationSvcTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsRead',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/orderflow/${config.envName}/*`,
        ],
      })
    );
    this.notificationSvcTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'XRayWrite',
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      })
    );

    if (config.enableWaf) {
      const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
        name: `orderflow-${config.envName}-web-acl`,
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: `orderflow-${config.envName}-web-acl`,
        },
        rules: [
          {
            name: 'AWSManagedRulesCommonRuleSet',
            priority: 1,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWSManagedRulesCommonRuleSet',
            },
          },
          {
            name: 'AWSManagedRulesSQLiRuleSet',
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesSQLiRuleSet',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          {
            name: 'RateLimitRule',
            priority: 3,
            action: { block: {} },
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: 'IP',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimitRule',
            },
          },
          {
            name: 'AWSManagedRulesKnownBadInputsRuleSet',
            priority: 4,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesKnownBadInputsRuleSet',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        ],
      });

      this.webAclArn = webAcl.attrArn;

      const wafLogGroup = new logs.LogGroup(this, 'WafLogGroup', {
        logGroupName: `aws-waf-logs-orderflow-${config.envName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      new wafv2.CfnLoggingConfiguration(this, 'WafLogging', {
        resourceArn: webAcl.attrArn,
        logDestinationConfigs: [wafLogGroup.logGroupArn],
      });

      const wafAccessLogsBucket = new s3.Bucket(this, 'WafAccessLogsBucket', {
        bucketName: `orderflow-${config.envName}-waf-logs-${this.account}`,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        lifecycleRules: [
          {
            id: 'expire-waf-logs',
            expiration: cdk.Duration.days(config.logRetentionDays),
          },
        ],
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });

      new cdk.CfnOutput(this, 'WafAccessLogsBucket', {
        value: wafAccessLogsBucket.bucketName,
        exportName: `${id}-WafAccessLogsBucket`,
        description: 'WAF access logs S3 bucket',
      });

      new cdk.CfnOutput(this, 'WebAclArn', {
        value: this.webAclArn,
        exportName: `${id}-WebAclArn`,
        description: 'WAF Web ACL ARN',
      });
    }

    new cdk.CfnOutput(this, 'JwtSecretArn', {
      value: this.jwtSecret.secretArn,
      exportName: `${id}-JwtSecretArn`,
      description: 'JWT secret ARN',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
