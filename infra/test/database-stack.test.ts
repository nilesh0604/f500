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

  it('does not create Redis resources when enableRedis is false', () => {
    template.resourceCountIs('AWS::ElastiCache::SubnetGroup', 0);
    template.resourceCountIs('AWS::ElastiCache::ReplicationGroup', 0);
  });

  it('exports DbEndpoint but not RedisEndpoint when Redis is disabled', () => {
    template.hasOutput('DbEndpoint', {});
    template.resourceCountIs('AWS::ElastiCache::ReplicationGroup', 0);
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

    it('has DeletionProtection enabled for production', () => {
      prodTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: true,
      });
    });
  });
});
