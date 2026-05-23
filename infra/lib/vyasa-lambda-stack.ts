import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as path from 'node:path';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface VyasaLambdaStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vectorIndexArn: string;
  readonly vectorBucketName: string;
  readonly vectorIndexName: string;
  readonly bedrockKbRole: iam.IRole;
}

export class VyasaLambdaStack extends cdk.Stack {
  public readonly functionUrl: string;
  public readonly lambdaFunction: lambda.Function;
  public readonly sessionsTable: dynamodb.Table;
  public readonly rateLimitsTable: dynamodb.Table;
  public readonly corpusBucket: s3.Bucket;
  public readonly promptsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: VyasaLambdaStackProps) {
    super(scope, id, props);

    const { config } = props;

    // S3 Bucket for Mahabharata corpus (knowledge base data source)
    this.corpusBucket = new s3.Bucket(this, 'CorpusBucket', {
      bucketName: `vyasa-rag-corpus-${config.envName}-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      intelligentTieringConfigurations: [
        {
          name: 'ArchiveOldChunks',
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
        },
      ],
      removalPolicy:
        config.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.envName !== 'prod',
    });

    // S3 Bucket for versioned prompts (system, ReAct, reflection)
    this.promptsBucket = new s3.Bucket(this, 'PromptsBucket', {
      bucketName: `vyasa-rag-prompts-${config.envName}-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        config.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.envName !== 'prod',
    });

    // DynamoDB table for sessions (with TTL)
    this.sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: `vyasa-rag-sessions-${config.envName}`,
      partitionKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: config.envName === 'prod',
      removalPolicy:
        config.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB table for rate limiting
    this.rateLimitsTable = new dynamodb.Table(this, 'RateLimitsTable', {
      tableName: `vyasa-rag-rate-limits-${config.envName}`,
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy:
        config.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    const bedrockKbRole = props.bedrockKbRole;

    // Lambda custom resource: creates Bedrock KB + data source via SDK
    // (CloudFormation AWS::Bedrock::KnowledgeBase schema doesn't support S3_VECTORS yet)
    const kbCreatorRole = new iam.Role(this, 'KbCreatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });
    kbCreatorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:CreateKnowledgeBase',
          'bedrock:DeleteKnowledgeBase',
          'bedrock:GetKnowledgeBase',
          'bedrock:CreateDataSource',
          'bedrock:DeleteDataSource',
          'bedrock:ListDataSources',
        ],
        resources: ['*'],
      })
    );
    kbCreatorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [bedrockKbRole.roleArn],
      })
    );

    const kbCreatorFn = new lambda.Function(this, 'KbCreatorFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: kbCreatorRole,
      timeout: cdk.Duration.minutes(10),
      code: lambda.Code.fromAsset(path.join(__dirname, 'bedrock-kb-creator')),
      environment: {
        KB_NAME: `vyasa-rag-kb-${config.envName}`,
        KB_ROLE_ARN: bedrockKbRole.roleArn,
        EMBEDDING_MODEL_ARN: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        VECTOR_BUCKET_ARN: `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${props.vectorBucketName}`,
        VECTOR_INDEX_ARN: props.vectorIndexArn,
        CORPUS_BUCKET_ARN: this.corpusBucket.bucketArn,
        DS_NAME: `vyasa-rag-corpus-${config.envName}`,
      },
    });

    const kbProvider = new cr.Provider(this, 'KbProvider', {
      onEventHandler: kbCreatorFn,
    });

    const kbResource = new cdk.CustomResource(this, 'VyasaKnowledgeBase', {
      serviceToken: kbProvider.serviceToken,
      properties: {
        KbName: `vyasa-rag-kb-${config.envName}`,
        VectorIndexArn: props.vectorIndexArn,
      },
    });

    const kbId = kbResource.getAttString('KbId');
    const dsId = kbResource.getAttString('DsId');

    // CloudWatch Log Group for Lambda
    const logGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/vyasa-rag-${config.envName}`,
      retention: config.logRetentionDays as logs.RetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda function for Vyasa RAG service
    this.lambdaFunction = new lambda.Function(this, 'VyasaRagFunction', {
      functionName: `vyasa-rag-${config.envName}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'main.handler',
      code: lambda.Code.fromAsset('../dist/apps/vyasa-rag-service'),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        LOG_LEVEL: config.envName === 'prod' ? 'info' : 'debug',
        SESSIONS_TABLE: this.sessionsTable.tableName,
        RATE_LIMITS_TABLE: this.rateLimitsTable.tableName,
        PROMPTS_BUCKET: this.promptsBucket.bucketName,
        BEDROCK_KB_ID: kbId,
        BEDROCK_DS_ID: dsId,
        BEDROCK_MODEL_ARN:
          'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0',
        EMBEDDING_MODEL_ARN:
          'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0',
        MAX_AGENT_ITERATIONS: '3',
        SESSION_TTL_DAYS: '7',
        RATE_LIMIT_PER_MINUTE: '10',
        RATE_LIMIT_PER_HOUR: '100',
        GLOBAL_RATE_LIMIT: '100',
      },
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // API Gateway HTTP API (replaces Function URL — no public access block restriction)
    const httpApi = new apigwv2.HttpApi(this, 'VyasaHttpApi', {
      apiName: `vyasa-rag-api-${config.envName}`,
      description: 'Vyasa RAG HTTP API',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const lambdaInt = new apigwv2int.HttpLambdaIntegration(
      'VyasaLambdaInt',
      this.lambdaFunction
    );

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: lambdaInt,
    });

    this.functionUrl = httpApi.apiEndpoint;

    // IAM permissions for Lambda
    // DynamoDB permissions
    this.sessionsTable.grantReadWriteData(this.lambdaFunction);
    this.rateLimitsTable.grantReadWriteData(this.lambdaFunction);

    // S3 permissions
    this.corpusBucket.grantRead(this.lambdaFunction);
    this.promptsBucket.grantRead(this.lambdaFunction);

    // Bedrock permissions
    this.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Retrieve',
          'bedrock:RetrieveAndGenerate',
          'bedrock:StartIngestionJob',
          'bedrock:GetIngestionJob',
        ],
        resources: ['*'],
      })
    );

    // CloudWatch Alarms for Lambda
    const errorMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensionsMap: {
        FunctionName: this.lambdaFunction.functionName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
      alarmName: `vyasa-rag-errors-${config.envName}`,
      alarmDescription: 'Alarm when Lambda error count > 1 per minute',
      metric: errorMetric,
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    const durationMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Duration',
      dimensionsMap: {
        FunctionName: this.lambdaFunction.functionName,
      },
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });

    new cloudwatch.Alarm(this, 'LatencyP99Alarm', {
      alarmName: `vyasa-rag-latency-${config.envName}`,
      alarmDescription: 'Alarm when p99 latency > 5 seconds',
      metric: durationMetric,
      threshold: 5000,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Cost budget alarm (at 80% of $10 budget)
    const costMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      statistic: 'Maximum',
      period: cdk.Duration.days(1),
    });

    new cloudwatch.Alarm(this, 'CostBudgetAlarm', {
      alarmName: `vyasa-rag-budget-${config.envName}`,
      alarmDescription:
        'Alarm when monthly cost exceeds $8 (80% of $10 budget)',
      metric: costMetric,
      threshold: 8,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Outputs
    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl,
      exportName: `${id}-FunctionUrl`,
      description: 'Lambda Function URL for Vyasa RAG API',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: this.lambdaFunction.functionName,
      exportName: `${id}-LambdaFunctionName`,
      description: 'Lambda function name',
    });

    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: this.sessionsTable.tableName,
      exportName: `${id}-SessionsTableName`,
      description: 'DynamoDB sessions table name',
    });

    new cdk.CfnOutput(this, 'CorpusBucketName', {
      value: this.corpusBucket.bucketName,
      exportName: `${id}-CorpusBucketName`,
      description: 'S3 corpus bucket name',
    });

    new cdk.CfnOutput(this, 'PromptsBucketName', {
      value: this.promptsBucket.bucketName,
      exportName: `${id}-PromptsBucketName`,
      description: 'S3 prompts bucket name',
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: kbId,
      exportName: `${id}-KnowledgeBaseId`,
      description: 'Bedrock Knowledge Base ID (S3 Vectors store)',
    });

    new cdk.CfnOutput(this, 'DataSourceId', {
      value: dsId,
      exportName: `${id}-DataSourceId`,
      description: 'Bedrock KB data source ID',
    });

    // Tags
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    cdk.Tags.of(this).add('Service', 'vyasa-rag');
    cdk.Tags.of(this).add('CostCenter', 'learning');
  }
}
