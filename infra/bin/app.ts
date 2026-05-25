#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getConfig } from '../config/environments';
import { NetworkStack } from '../lib/network-stack';
import { VyasaLambdaStack } from '../lib/vyasa-lambda-stack';
import { VyasaVectorStack } from '../lib/vyasa-vector-stack';
import { VyasaUiStack } from '../lib/vyasa-ui-stack';

const app = new cdk.App();

const config = getConfig();

const env: cdk.Environment = {
  account: config.account || process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region || process.env.CDK_DEFAULT_REGION,
};

const stackPrefix =
  config.envName === 'prod' ? 'OrderFlow' : `OrderFlow-${config.envName}`;

// Network stack (kept for VPC if needed by other services)
const networkStack = new NetworkStack(app, `${stackPrefix}-Network`, {
  env,
  config,
  description: 'OrderFlow — VPC, subnets, security groups',
  terminationProtection: false,
});

// Vyasa Vector Store stack
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

// Vyasa RAG Lambda stack
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

const vyasaApiEndpoint =
  process.env.VYASA_API_ENDPOINT ?? vyasaStack.functionUrl;

// Vyasa UI stack
const vyasaUiStack = new VyasaUiStack(app, `${stackPrefix}-VyasaUi`, {
  env,
  config,
  apiEndpoint: vyasaApiEndpoint,
  domainName: config.vyasaDomainName,
  description: 'OrderFlow — Vyasa Intelligence UI (S3 + CloudFront)',
  terminationProtection: false,
});

cdk.Tags.of(app).add('Project', 'orderflow');
cdk.Tags.of(app).add('Environment', config.envName);
cdk.Tags.of(app).add('ManagedBy', 'cdk');
