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
}

export const config: EnvironmentConfig = {
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
