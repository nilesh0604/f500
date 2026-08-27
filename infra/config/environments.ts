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

export const config: EnvironmentConfig = {
  envName: 'prod',
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',

  vpcCidr: '10.0.0.0/16',
  maxAzs: 2,
  natGateways: 1,

  cloudFrontPriceClass: 'PriceClass_100',
  // Domain is externalized to avoid hardcoding personal domains in source.
  // Set VYASA_DOMAIN_NAME env var at deploy time (e.g. in CDK environment).
  vyasaDomainName: process.env.VYASA_DOMAIN_NAME ?? '',
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
