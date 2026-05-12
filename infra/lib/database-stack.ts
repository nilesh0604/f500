import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface DatabaseStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vpc: ec2.Vpc;
  readonly dbSecurityGroup: ec2.SecurityGroup;
  readonly redisSecurityGroup: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  public readonly dbSecret: secretsmanager.Secret;
  public readonly dbEndpoint: string;
  public readonly dbPort: string;
  public readonly dbIdentifier: string;
  public readonly redisEndpoint: string;
  public readonly redisPort: string;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { config, vpc, dbSecurityGroup, redisSecurityGroup } = props;

    const isolatedSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });

    const dbSubnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      vpc,
      description: `OrderFlow ${config.envName} DB subnet group`,
      vpcSubnets: isolatedSubnets,
      removalPolicy: config.dbDeletionProtection
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    this.dbSecret = new secretsmanager.Secret(this, 'DbCredentials', {
      secretName: `/orderflow/${config.envName}/db-credentials`,
      description: 'OrderFlow PostgreSQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'orderflow_user' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
        passwordLength: 32,
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: new ec2.InstanceType(config.dbInstanceClass),
      vpc,
      vpcSubnets: isolatedSubnets,
      subnetGroup: dbSubnetGroup,
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      databaseName: 'orderflow',
      allocatedStorage: config.dbAllocatedStorage,
      maxAllocatedStorage: config.dbMaxAllocatedStorage,
      multiAz: config.dbMultiAz,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(config.envName === 'prod' ? 7 : 1),
      deleteAutomatedBackups: config.envName !== 'prod',
      deletionProtection: config.dbDeletionProtection,
      removalPolicy: config.dbDeletionProtection
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      storageEncrypted: true,
      monitoringInterval: config.enableDetailedMonitoring
        ? cdk.Duration.seconds(60)
        : undefined,
      enablePerformanceInsights: config.enableDetailedMonitoring,
      performanceInsightRetention: config.enableDetailedMonitoring
        ? rds.PerformanceInsightRetention.DEFAULT
        : undefined,
      parameterGroup: new rds.ParameterGroup(this, 'DbParameterGroup', {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_16_3,
        }),
        parameters: {
          log_connections: '1',
          log_disconnections: '1',
          log_duration: '0',
          log_min_duration_statement: '1000',
          shared_preload_libraries: 'pg_stat_statements',
        },
      }),
    });

    this.dbEndpoint = dbInstance.instanceEndpoint.hostname;
    this.dbPort = dbInstance.instanceEndpoint.port.toString();
    this.dbIdentifier = dbInstance.instanceIdentifier;

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      'RedisSubnetGroup',
      {
        description: `OrderFlow ${config.envName} Redis subnet group`,
        subnetIds: isolatedSubnets.subnetIds,
        cacheSubnetGroupName: `orderflow-${config.envName}-redis`,
      }
    );

    const redisCluster = new elasticache.CfnReplicationGroup(
      this,
      'RedisCluster',
      {
        replicationGroupDescription: `OrderFlow ${config.envName} Redis`,
        numCacheClusters: config.redisNumReplicas + 1,
        cacheNodeType: config.redisNodeType,
        engine: 'redis',
        engineVersion: '7.1',
        cacheSubnetGroupName: redisSubnetGroup.ref,
        securityGroupIds: [redisSecurityGroup.securityGroupId],
        atRestEncryptionEnabled: true,
        transitEncryptionEnabled: true,
        automaticFailoverEnabled: config.redisNumReplicas > 0,
        multiAzEnabled: config.redisNumReplicas > 0,
        autoMinorVersionUpgrade: true,
        snapshotRetentionLimit: config.envName === 'prod' ? 7 : 1,
      }
    );
    redisCluster.addDependency(redisSubnetGroup);

    this.redisEndpoint = redisCluster.attrPrimaryEndPointAddress;
    this.redisPort = redisCluster.attrPrimaryEndPointPort;

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.dbEndpoint,
      exportName: `${id}-DbEndpoint`,
      description: 'RDS PostgreSQL endpoint',
    });
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisEndpoint,
      exportName: `${id}-RedisEndpoint`,
      description: 'ElastiCache Redis endpoint',
    });
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: this.dbSecret.secretArn,
      exportName: `${id}-DbSecretArn`,
      description: 'DB credentials secret ARN',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
