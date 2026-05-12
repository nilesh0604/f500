#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { environments } from '../config/environments';
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

const app = new cdk.App();

const envName = app.node.tryGetContext('env') ?? 'dev';
const config = environments[envName];

if (!config) {
  throw new Error(
    `Unknown environment: "${envName}". Valid values: ${Object.keys(environments).join(', ')}`
  );
}

const env: cdk.Environment = {
  account: config.account || process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region || process.env.CDK_DEFAULT_REGION,
};

const stackPrefix = `OrderFlow-${config.envName.charAt(0).toUpperCase() + config.envName.slice(1)}`;

const networkStack = new NetworkStack(app, `${stackPrefix}-Network`, {
  env,
  config,
  description: `OrderFlow ${envName} — VPC, subnets, security groups`,
  terminationProtection: config.envName === 'prod',
});

const databaseStack = new DatabaseStack(app, `${stackPrefix}-Database`, {
  env,
  config,
  vpc: networkStack.vpc,
  dbSecurityGroup: networkStack.dbSecurityGroup,
  redisSecurityGroup: networkStack.redisSecurityGroup,
  description: `OrderFlow ${envName} — RDS PostgreSQL & ElastiCache Redis`,
  terminationProtection: config.envName === 'prod',
});
databaseStack.addDependency(networkStack);

const eventStack = new EventStack(app, `${stackPrefix}-Events`, {
  env,
  config,
  description: `OrderFlow ${envName} — EventBridge, SQS queues, DLQs`,
  terminationProtection: config.envName === 'prod',
});

const securityStack = new SecurityStack(app, `${stackPrefix}-Security`, {
  env,
  config,
  vpc: networkStack.vpc,
  description: `OrderFlow ${envName} — WAF, Secrets Manager, IAM roles`,
  terminationProtection: config.envName === 'prod',
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
  description: `OrderFlow ${envName} — ECS Fargate cluster, services, ALB`,
  terminationProtection: config.envName === 'prod',
});
ecsStack.addDependency(networkStack);
ecsStack.addDependency(databaseStack);
ecsStack.addDependency(eventStack);
ecsStack.addDependency(securityStack);

const cdnStack = new CDNStack(app, `${stackPrefix}-CDN`, {
  env,
  config,
  albDnsName: ecsStack.albDnsName,
  description: `OrderFlow ${envName} — CloudFront CDN, S3 frontend bucket`,
  terminationProtection: config.envName === 'prod',
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
  description: `OrderFlow ${envName} — CloudWatch dashboards, alarms`,
  terminationProtection: config.envName === 'prod',
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
    description: `OrderFlow ${envName} — Phase 6 Observability (X-Ray, Synthetics, SLO alarms)`,
    terminationProtection: config.envName === 'prod',
  }
);
observabilityStack.addDependency(ecsStack);
observabilityStack.addDependency(databaseStack);
observabilityStack.addDependency(eventStack);

const appConfigStack = new AppConfigStack(app, `${stackPrefix}-AppConfig`, {
  env,
  config,
  description: `OrderFlow ${envName} — AppConfig feature flags and dynamic config`,
  terminationProtection: config.envName === 'prod',
});

const rollbackStack = new RollbackStack(app, `${stackPrefix}-Rollback`, {
  env,
  config,
  clusterName: ecsStack.clusterName,
  orderServiceName: ecsStack.orderServiceName,
  notificationServiceName: ecsStack.notificationServiceName,
  description: `OrderFlow ${envName} — Auto-rollback Lambda and CloudWatch alarms`,
  terminationProtection: config.envName === 'prod',
});
rollbackStack.addDependency(ecsStack);

cdk.Tags.of(app).add('Project', 'orderflow');
cdk.Tags.of(app).add('Environment', envName);
cdk.Tags.of(app).add('ManagedBy', 'cdk');
