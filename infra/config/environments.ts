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
  readonly vyasaDomainName?: string;

  readonly logRetentionDays: number;
  readonly enableDetailedMonitoring: boolean;

  readonly tags: Record<string, string>;

  readonly secretsRotationDays: number;
  readonly enableWaf: boolean;
  readonly enableVpcFlowLogs: boolean;

  readonly enableRedis?: boolean;
  readonly enableNotificationSvc?: boolean;
  readonly skipObservability?: boolean;
  readonly skipMonitoring?: boolean;
  readonly skipRollback?: boolean;
  readonly skipAppConfig?: boolean;
  readonly skipCdn?: boolean;
  readonly usePublicSubnets?: boolean;
}

const prodConfig: EnvironmentConfig = {
  envName: 'prod',
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1', // ACM certs for CloudFront require us-east-1

  vpcCidr: '10.0.0.0/16',
  maxAzs: 2,
  natGateways: 1,

  dbInstanceClass: 'db.t3.small',
  dbAllocatedStorage: 50,
  dbMaxAllocatedStorage: 200,
  dbMultiAz: false,
  dbDeletionProtection: true,

  redisNodeType: 'cache.t3.small',
  redisNumReplicas: 1,

  orderServiceCpu: 1024,
  orderServiceMemory: 2048,
  orderServiceDesiredCount: 1,
  orderServiceMinCapacity: 1,
  orderServiceMaxCapacity: 10,

  notificationSvcCpu: 1024,
  notificationSvcMemory: 2048,
  notificationSvcDesiredCount: 1,
  notificationSvcMinCapacity: 1,
  notificationSvcMaxCapacity: 10,

  sqsVisibilityTimeout: 60,
  sqsMaxReceiveCount: 5,
  sqsMessageRetentionDays: 14,

  cloudFrontPriceClass: 'PriceClass_100',
  vyasaDomainName: 'vyasa.nshinde.xyz',
  logRetentionDays: 90,
  enableDetailedMonitoring: true,

  tags: {
    Project: 'orderflow',
    ManagedBy: 'cdk',
    CostCenter: 'engineering',
    Environment: 'prod',
    Team: 'platform',
  },

  secretsRotationDays: 90,
  enableWaf: true,
  enableVpcFlowLogs: true,
};

const devConfig: EnvironmentConfig = {
  envName: 'dev',
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

  vpcCidr: '10.1.0.0/16',
  maxAzs: 2,
  natGateways: 0,

  dbInstanceClass: 'db.t3.micro',
  dbAllocatedStorage: 20,
  dbMaxAllocatedStorage: 30,
  dbMultiAz: false,
  dbDeletionProtection: false,

  redisNodeType: 'cache.t3.micro',
  redisNumReplicas: 0,
  enableRedis: false,

  orderServiceCpu: 256,
  orderServiceMemory: 512,
  orderServiceDesiredCount: 1,
  orderServiceMinCapacity: 1,
  orderServiceMaxCapacity: 1,

  notificationSvcCpu: 256,
  notificationSvcMemory: 512,
  notificationSvcDesiredCount: 0,
  notificationSvcMinCapacity: 0,
  notificationSvcMaxCapacity: 1,
  enableNotificationSvc: false,

  sqsVisibilityTimeout: 60,
  sqsMaxReceiveCount: 5,
  sqsMessageRetentionDays: 14,

  cloudFrontPriceClass: 'PriceClass_100',
  logRetentionDays: 7,
  enableDetailedMonitoring: false,

  tags: {
    Project: 'orderflow',
    ManagedBy: 'cdk',
    CostCenter: 'engineering',
    Environment: 'dev',
    Team: 'platform',
  },

  secretsRotationDays: 90,
  enableWaf: false,
  enableVpcFlowLogs: false,

  skipObservability: true,
  skipMonitoring: true,
  skipRollback: true,
  skipAppConfig: true,
  skipCdn: true,
  usePublicSubnets: true,
};

export const getConfig = (): EnvironmentConfig => {
  const env = process.env['CDK_ENV'] ?? 'prod';
  return env === 'dev' ? devConfig : prodConfig;
};

export const config: EnvironmentConfig = getConfig();

const stagingConfig: EnvironmentConfig = {
  ...prodConfig,
  envName: 'staging',
  vpcCidr: '10.1.0.0/16',
  dbInstanceClass: 'db.t3.micro',
  dbAllocatedStorage: 20,
  dbMaxAllocatedStorage: 50,
  dbMultiAz: false,
  dbDeletionProtection: false,
  redisNodeType: 'cache.t3.micro',
  redisNumReplicas: 0,
  orderServiceCpu: 512,
  orderServiceMemory: 1024,
  orderServiceDesiredCount: 1,
  orderServiceMinCapacity: 1,
  orderServiceMaxCapacity: 3,
  notificationSvcCpu: 512,
  notificationSvcMemory: 1024,
  notificationSvcDesiredCount: 1,
  notificationSvcMinCapacity: 1,
  notificationSvcMaxCapacity: 3,
  logRetentionDays: 30,
  enableDetailedMonitoring: false,
  enableWaf: true,
  enableVpcFlowLogs: true,
  tags: {
    ...prodConfig.tags,
    Environment: 'staging',
  },
};

export const environments: Record<string, EnvironmentConfig> = {
  dev: devConfig,
  staging: stagingConfig,
  prod: prodConfig,
};
