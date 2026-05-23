import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'node:path';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface VyasaVectorStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

export class VyasaVectorStack extends cdk.Stack {
  public readonly vectorBucketName: string;
  public readonly vectorIndexArn: string;
  public readonly vectorIndexName: string;
  public readonly bedrockKbRole: iam.Role;

  constructor(scope: Construct, id: string, props: VyasaVectorStackProps) {
    super(scope, id, props);

    const { config } = props;
    this.vectorBucketName = `vyasa-vectors-${config.envName}-${this.account}`;
    this.vectorIndexName = `vyasa-index-${config.envName}`;

    // Bedrock KB IAM role
    this.bedrockKbRole = new iam.Role(this, 'BedrockKbRole', {
      roleName: `vyasa-rag-kb-role-${config.envName}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    const corpusBucketArn = `arn:aws:s3:::vyasa-rag-corpus-${config.envName}-${this.account}`;
    this.bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );
    this.bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [corpusBucketArn, `${corpusBucketArn}/*`],
      })
    );
    this.bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3vectors:GetIndex',
          's3vectors:QueryVectors',
          's3vectors:PutVectors',
          's3vectors:GetVectors',
          's3vectors:DeleteVectors',
          's3vectors:ListVectors',
        ],
        resources: [
          `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${this.vectorBucketName}`,
          `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${this.vectorBucketName}/index/${this.vectorIndexName}`,
        ],
      })
    );

    // Lambda custom resource: creates the S3 vector bucket + index via SDK
    const vectorLambdaRole = new iam.Role(this, 'VectorCreatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });
    vectorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3vectors:CreateVectorBucket',
          's3vectors:DeleteVectorBucket',
          's3vectors:CreateIndex',
          's3vectors:DeleteIndex',
          's3vectors:ListIndexes',
          's3vectors:GetIndex',
        ],
        resources: ['*'],
      })
    );

    const vectorFn = new lambda.Function(this, 'VectorCreatorFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: vectorLambdaRole,
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(path.join(__dirname, 's3vector-creator')),
      environment: {
        VECTOR_BUCKET_NAME: this.vectorBucketName,
        INDEX_NAME: this.vectorIndexName,
        DIMENSIONS: '1024',
      },
    });

    const vectorProvider = new cr.Provider(this, 'VectorProvider', {
      onEventHandler: vectorFn,
    });

    const vectorResource = new cdk.CustomResource(this, 'S3VectorIndex', {
      serviceToken: vectorProvider.serviceToken,
      properties: {
        VectorBucketName: this.vectorBucketName,
        IndexName: this.vectorIndexName,
        NonFilterableKeys: 'AMAZON_BEDROCK_TEXT,AMAZON_BEDROCK_METADATA',
      },
    });

    this.vectorIndexArn = vectorResource.getAttString('IndexArn');

    new cdk.CfnOutput(this, 'VectorBucketName', {
      value: this.vectorBucketName,
      exportName: `${id}-VectorBucketName`,
    });
    new cdk.CfnOutput(this, 'VectorIndexName', {
      value: this.vectorIndexName,
      exportName: `${id}-VectorIndexName`,
    });
    new cdk.CfnOutput(this, 'VectorIndexArn', {
      value: this.vectorIndexArn,
      exportName: `${id}-VectorIndexArn`,
    });
  }
}
