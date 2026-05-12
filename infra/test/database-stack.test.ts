import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { environments } from '../config/environments';

describe('DatabaseStack', () => {
  let app: cdk.App;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const networkStack = new NetworkStack(app, 'TestNetwork', {
      config: environments['dev'],
    });
    const dbStack = new DatabaseStack(app, 'TestDatabase', {
      config: environments['dev'],
      vpc: networkStack.vpc,
      dbSecurityGroup: networkStack.dbSecurityGroup,
      redisSecurityGroup: networkStack.redisSecurityGroup,
    });
    template = Template.fromStack(dbStack);
  });

  it('creates a PostgreSQL RDS instance', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      DBName: 'orderflow',
      StorageEncrypted: true,
      MultiAZ: false,
      DeletionProtection: false,
    });
  });

  it('creates a DB subnet group in isolated subnets', () => {
    template.resourceCountIs('AWS::RDS::DBSubnetGroup', 1);
  });

  it('creates a DB credentials secret', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/orderflow/dev/db-credentials',
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: JSON.stringify({
          username: 'orderflow_user',
        }),
        GenerateStringKey: 'password',
      }),
    });
  });

  it('creates RDS parameter group with logging params', () => {
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({
        log_connections: '1',
        log_disconnections: '1',
      }),
    });
  });

  it('creates Redis subnet group', () => {
    template.hasResourceProperties(
      'AWS::ElastiCache::SubnetGroup',
      Match.objectLike({
        CacheSubnetGroupName: 'orderflow-dev-redis',
      })
    );
  });

  it('creates Redis replication group with encryption', () => {
    template.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      AtRestEncryptionEnabled: true,
      TransitEncryptionEnabled: true,
      Engine: 'redis',
    });
  });

  it('exports DbEndpoint and RedisEndpoint', () => {
    template.hasOutput('DbEndpoint', {});
    template.hasOutput('RedisEndpoint', {});
  });

  describe('production environment', () => {
    let prodTemplate: Template;

    beforeEach(() => {
      const prodApp = new cdk.App();
      const prodNetwork = new NetworkStack(prodApp, 'ProdNetwork', {
        config: environments['prod'],
      });
      const prodDb = new DatabaseStack(prodApp, 'ProdDatabase', {
        config: environments['prod'],
        vpc: prodNetwork.vpc,
        dbSecurityGroup: prodNetwork.dbSecurityGroup,
        redisSecurityGroup: prodNetwork.redisSecurityGroup,
      });
      prodTemplate = Template.fromStack(prodDb);
    });

    it('enables Multi-AZ for production', () => {
      prodTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: true,
        DeletionProtection: true,
      });
    });
  });
});
