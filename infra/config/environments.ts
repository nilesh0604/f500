export interface EnvironmentConfig {
  readonly envName: string;
  readonly account: string;
  readonly region: string;

  readonly vpcCidr: string;
  readonly maxAzs: number;
  readonly natGateways: number;

  readonly cloudFrontPriceClass: string;
  readonly vyasaDomainName?: string;

  readonly logRetentionDays: number;
  readonly enableDetailedMonitoring: boolean;

  readonly tags: Record<string, string>;

  readonly enableVpcFlowLogs: boolean;
}

const prodConfig: EnvironmentConfig = {
  envName: 'prod',
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

  vpcCidr: '10.0.0.0/16',
  maxAzs: 2,
  natGateways: 1,

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

  enableVpcFlowLogs: false,
};

const devConfig: EnvironmentConfig = {
  envName: 'dev',
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

  vpcCidr: '10.1.0.0/16',
  maxAzs: 2,
  natGateways: 0,

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

  enableVpcFlowLogs: false,
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
  logRetentionDays: 30,
  enableDetailedMonitoring: false,
  enableVpcFlowLogs: false,
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
