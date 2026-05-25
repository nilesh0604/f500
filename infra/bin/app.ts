#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from '../config/environments';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { EventStack } from '../lib/event-stack';
import { SecurityStack } from '../lib/security-stack';
import { ECSStack } from '../lib/ecs-stack';
import { CDNStack } from '../lib/cdn-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { AppConfigStack } from '../lib/appconfig-stack';
import { RollbackStack } from '../lib/rollback-stack';
import { VyasaLambdaStack } from '../lib/vyasa-lambda-stack';
import { VyasaVectorStack } from '../lib/vyasa-vector-stack';
import { VyasaUiStack } from '../lib/vyasa-ui-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: config.account || process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region || process.env.CDK_DEFAULT_REGION,
};

const stackPrefix = 'OrderFlow';

const networkStack = new NetworkStack(app, `${stackPrefix}-Network`, {
  env,
  config,
  description: 'OrderFlow — VPC, subnets, security groups',
  terminationProtection: true,
});

const databaseStack = new DatabaseStack(app, `${stackPrefix}-Database`, {
  env,
  config,
  vpc: networkStack.vpc,
  dbSecurityGroup: networkStack.dbSecurityGroup,
  redisSecurityGroup: networkStack.redisSecurityGroup,
  description: 'OrderFlow — RDS PostgreSQL & ElastiCache Redis',
  terminationProtection: true,
});
databaseStack.addDependency(networkStack);

const eventStack = new EventStack(app, `${stackPrefix}-Events`, {
  env,
  config,
  description: 'OrderFlow — EventBridge, SQS queues, DLQs',
  terminationProtection: true,
});

const securityStack = new SecurityStack(app, `${stackPrefix}-Security`, {
  env,
  config,
  vpc: networkStack.vpc,
  description: 'OrderFlow — WAF, Secrets Manager, IAM roles',
  terminationProtection: true,
});
securityStack.addDependency(networkStack);
securityStack.addDependency(databaseStack);

const ecsStack = new ECSStack(app, `${stackPrefix}-ECS`, {
  env,
  config,
  vpc: networkStack.vpc,
  albSecurityGroup: networkStack.albSecurityGroup,
  serviceSecurityGroup: networkStack.serviceSecurityGroup,
  dbSecret: databaseStack.dbSecret,
  redisEndpoint: databaseStack.redisEndpoint,
  redisPort: databaseStack.redisPort,
  orderCreatedQueue: eventStack.orderCreatedQueue,
  orderStatusChangedQueue: eventStack.orderStatusChangedQueue,
  eventBusName: eventStack.eventBus.eventBusName,
  jwtSecret: securityStack.jwtSecret,
  description: 'OrderFlow — ECS Fargate cluster, services, ALB',
  terminationProtection: true,
});
ecsStack.addDependency(networkStack);
ecsStack.addDependency(databaseStack);
ecsStack.addDependency(eventStack);
ecsStack.addDependency(securityStack);

const cdnStack = new CDNStack(app, `${stackPrefix}-CDN`, {
  env,
  config,
  albDnsName: ecsStack.albDnsName,
  description: 'OrderFlow — CloudFront CDN, S3 frontend bucket',
  terminationProtection: true,
});
cdnStack.addDependency(ecsStack);

const monitoringStack = new MonitoringStack(app, `${stackPrefix}-Monitoring`, {
  env,
  config,
  orderServiceName: ecsStack.orderServiceName,
  notificationServiceName: ecsStack.notificationServiceName,
  clusterName: ecsStack.clusterName,
  albFullName: ecsStack.albFullName,
  dbIdentifier: databaseStack.dbIdentifier,
  orderCreatedQueueName: eventStack.orderCreatedQueue.queueName,
  orderCreatedDlqName: eventStack.orderCreatedDlq.queueName,
  orderStatusChangedQueueName: eventStack.orderStatusChangedQueue.queueName,
  orderStatusChangedDlqName: eventStack.orderStatusChangedDlq.queueName,
  description: 'OrderFlow — CloudWatch dashboards, alarms',
  terminationProtection: true,
});
monitoringStack.addDependency(ecsStack);
monitoringStack.addDependency(databaseStack);
monitoringStack.addDependency(eventStack);

const observabilityStack = new ObservabilityStack(
  app,
  `${stackPrefix}-Observability`,
  {
    env,
    config,
    orderServiceName: ecsStack.orderServiceName,
    notificationServiceName: ecsStack.notificationServiceName,
    clusterName: ecsStack.clusterName,
    albFullName: ecsStack.albFullName,
    albDnsName: ecsStack.albDnsName,
    dbIdentifier: databaseStack.dbIdentifier,
    orderCreatedQueueName: eventStack.orderCreatedQueue.queueName,
    orderCreatedDlqName: eventStack.orderCreatedDlq.queueName,
    orderStatusChangedQueueName: eventStack.orderStatusChangedQueue.queueName,
    orderStatusChangedDlqName: eventStack.orderStatusChangedDlq.queueName,
    description: 'OrderFlow — Observability (X-Ray, Synthetics, SLO alarms)',
    terminationProtection: true,
  }
);
observabilityStack.addDependency(ecsStack);
observabilityStack.addDependency(databaseStack);
observabilityStack.addDependency(eventStack);

const appConfigStack = new AppConfigStack(app, `${stackPrefix}-AppConfig`, {
  env,
  config,
  description: 'OrderFlow — AppConfig feature flags and dynamic config',
  terminationProtection: true,
});

const rollbackStack = new RollbackStack(app, `${stackPrefix}-Rollback`, {
  env,
  config,
  clusterName: ecsStack.clusterName,
  orderServiceName: ecsStack.orderServiceName,
  notificationServiceName: ecsStack.notificationServiceName,
  description: 'OrderFlow — Auto-rollback Lambda and CloudWatch alarms',
  terminationProtection: true,
});
rollbackStack.addDependency(ecsStack);

const vyasaVectorStack = new VyasaVectorStack(
  app,
  `${stackPrefix}-VyasaVector`,
  {
    env,
    config,
    description: 'OrderFlow — Vyasa S3 Vectors store',
    terminationProtection: false,
  }
);

const vyasaStack = new VyasaLambdaStack(app, `${stackPrefix}-VyasaRag`, {
  env,
  config,
  vectorIndexArn: vyasaVectorStack.vectorIndexArn,
  vectorBucketName: vyasaVectorStack.vectorBucketName,
  vectorIndexName: vyasaVectorStack.vectorIndexName,
  bedrockKbRole: vyasaVectorStack.bedrockKbRole,
  description:
    'OrderFlow — Vyasa Intelligence Agentic RAG Service (Lambda + Bedrock)',
  terminationProtection: false,
});
vyasaStack.addDependency(vyasaVectorStack);

// OrderFlow-VyasaRag not yet migrated from OrderFlow-Prod-VyasaRag.
// Using the existing prod API endpoint directly until VyasaRag is redeployed.
const vyasaApiEndpoint =
  process.env.VYASA_API_ENDPOINT ??
  'https://no24fwwtcl.execute-api.us-east-1.amazonaws.com';

const vyasaUiStack = new VyasaUiStack(app, `${stackPrefix}-VyasaUi`, {
  env,
  config,
  apiEndpoint: vyasaApiEndpoint,
  domainName: config.vyasaDomainName,
  description: 'OrderFlow — Vyasa Intelligence UI (S3 + CloudFront)',
  terminationProtection: false,
});

cdk.Tags.of(app).add('Project', 'orderflow');
cdk.Tags.of(app).add('Environment', 'prod');
cdk.Tags.of(app).add('ManagedBy', 'cdk');
