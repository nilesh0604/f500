export interface EnvironmentConfig {
  readonly envName: string;
  readonly account: string;
  readonly region: string;

  readonly vpcCidr: string;
  readonly maxAzs: number;
  readonly natGateways: number;

  readonly dbInstanceClass: string;
  readonly dbAllocatedStorage: number;
  readonly dbMaxAllocatedStorage: number;
  readonly dbMultiAz: boolean;
  readonly dbDeletionProtection: boolean;

  readonly redisNodeType: string;
  readonly redisNumReplicas: number;

  readonly orderServiceCpu: number;
  readonly orderServiceMemory: number;
  readonly orderServiceDesiredCount: number;
  readonly orderServiceMinCapacity: number;
  readonly orderServiceMaxCapacity: number;

  readonly notificationSvcCpu: number;
  readonly notificationSvcMemory: number;
  readonly notificationSvcDesiredCount: number;
  readonly notificationSvcMinCapacity: number;
  readonly notificationSvcMaxCapacity: number;

  readonly sqsVisibilityTimeout: number;
  readonly sqsMaxReceiveCount: number;
  readonly sqsMessageRetentionDays: number;

  readonly cloudFrontPriceClass: string;
  readonly domainName?: string;
  readonly certificateArn?: string;

  readonly logRetentionDays: number;
  readonly enableDetailedMonitoring: boolean;

  readonly tags: Record<string, string>;

  readonly secretsRotationDays: number;
  readonly enableWaf: boolean;
  readonly enableVpcFlowLogs: boolean;
}

const commonTags = (env: string) => ({
  Project: 'orderflow',
  ManagedBy: 'cdk',
  CostCenter: 'engineering',
  Environment: env,
});

export const environments: Record<string, EnvironmentConfig> = {
  dev: {
    envName: 'dev',
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

    vpcCidr: '10.0.0.0/16',
    maxAzs: 2,
    natGateways: 1,

    dbInstanceClass: 'db.t3.micro',
    dbAllocatedStorage: 20,
    dbMaxAllocatedStorage: 50,
    dbMultiAz: false,
    dbDeletionProtection: false,

    redisNodeType: 'cache.t3.micro',
    redisNumReplicas: 0,

    orderServiceCpu: 256,
    orderServiceMemory: 512,
    orderServiceDesiredCount: 1,
    orderServiceMinCapacity: 1,
    orderServiceMaxCapacity: 2,

    notificationSvcCpu: 256,
    notificationSvcMemory: 512,
    notificationSvcDesiredCount: 1,
    notificationSvcMinCapacity: 1,
    notificationSvcMaxCapacity: 2,

    sqsVisibilityTimeout: 30,
    sqsMaxReceiveCount: 3,
    sqsMessageRetentionDays: 4,

    cloudFrontPriceClass: 'PriceClass_100',
    logRetentionDays: 7,
    enableDetailedMonitoring: false,

    tags: { ...commonTags('dev'), Team: 'platform' },

    secretsRotationDays: 90,
    enableWaf: false,
    enableVpcFlowLogs: false,
  },

  staging: {
    envName: 'staging',
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

    vpcCidr: '10.1.0.0/16',
    maxAzs: 2,
    natGateways: 1,

    dbInstanceClass: 'db.t3.small',
    dbAllocatedStorage: 20,
    dbMaxAllocatedStorage: 100,
    dbMultiAz: false,
    dbDeletionProtection: false,

    redisNodeType: 'cache.t3.micro',
    redisNumReplicas: 0,

    orderServiceCpu: 512,
    orderServiceMemory: 1024,
    orderServiceDesiredCount: 1,
    orderServiceMinCapacity: 1,
    orderServiceMaxCapacity: 4,

    notificationSvcCpu: 512,
    notificationSvcMemory: 1024,
    notificationSvcDesiredCount: 1,
    notificationSvcMinCapacity: 1,
    notificationSvcMaxCapacity: 4,

    sqsVisibilityTimeout: 30,
    sqsMaxReceiveCount: 3,
    sqsMessageRetentionDays: 7,

    cloudFrontPriceClass: 'PriceClass_100',
    logRetentionDays: 14,
    enableDetailedMonitoring: true,

    tags: { ...commonTags('staging'), Team: 'platform' },

    secretsRotationDays: 90,
    enableWaf: true,
    enableVpcFlowLogs: true,
  },

  'pre-prod': {
    envName: 'pre-prod',
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

    vpcCidr: '10.2.0.0/16',
    maxAzs: 2,
    natGateways: 2,

    dbInstanceClass: 'db.t3.medium',
    dbAllocatedStorage: 50,
    dbMaxAllocatedStorage: 200,
    dbMultiAz: true,
    dbDeletionProtection: true,

    redisNodeType: 'cache.t3.small',
    redisNumReplicas: 1,

    orderServiceCpu: 1024,
    orderServiceMemory: 2048,
    orderServiceDesiredCount: 2,
    orderServiceMinCapacity: 2,
    orderServiceMaxCapacity: 8,

    notificationSvcCpu: 1024,
    notificationSvcMemory: 2048,
    notificationSvcDesiredCount: 2,
    notificationSvcMinCapacity: 2,
    notificationSvcMaxCapacity: 8,

    sqsVisibilityTimeout: 60,
    sqsMaxReceiveCount: 5,
    sqsMessageRetentionDays: 14,

    cloudFrontPriceClass: 'PriceClass_200',
    logRetentionDays: 30,
    enableDetailedMonitoring: true,

    tags: { ...commonTags('pre-prod'), Team: 'platform' },

    secretsRotationDays: 90,
    enableWaf: true,
    enableVpcFlowLogs: true,
  },

  prod: {
    envName: 'prod',
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

    vpcCidr: '10.3.0.0/16',
    maxAzs: 3,
    natGateways: 2,

    dbInstanceClass: 'db.t3.medium',
    dbAllocatedStorage: 100,
    dbMaxAllocatedStorage: 500,
    dbMultiAz: true,
    dbDeletionProtection: true,

    redisNodeType: 'cache.t3.small',
    redisNumReplicas: 1,

    orderServiceCpu: 1024,
    orderServiceMemory: 2048,
    orderServiceDesiredCount: 2,
    orderServiceMinCapacity: 2,
    orderServiceMaxCapacity: 10,

    notificationSvcCpu: 1024,
    notificationSvcMemory: 2048,
    notificationSvcDesiredCount: 2,
    notificationSvcMinCapacity: 2,
    notificationSvcMaxCapacity: 10,

    sqsVisibilityTimeout: 60,
    sqsMaxReceiveCount: 5,
    sqsMessageRetentionDays: 14,

    cloudFrontPriceClass: 'PriceClass_All',
    logRetentionDays: 90,
    enableDetailedMonitoring: true,

    tags: { ...commonTags('prod'), Team: 'platform' },

    secretsRotationDays: 90,
    enableWaf: true,
    enableVpcFlowLogs: true,
  },
};
