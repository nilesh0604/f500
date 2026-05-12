import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { SecurityStack } from '../lib/security-stack';
import { environments } from '../config/environments';

describe('SecurityStack', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const networkStack = new NetworkStack(app, 'TestNetwork', {
      config: environments['dev'],
    });
    securityStack = new SecurityStack(app, 'TestSecurity', {
      config: environments['dev'],
      vpc: networkStack.vpc,
    });
    template = Template.fromStack(securityStack);
  });

  it('creates JWT secret in Secrets Manager', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/orderflow/dev/jwt-secret',
    });
  });

  it('creates app config secret in Secrets Manager', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/orderflow/dev/app-config',
    });
  });

  it('creates order-service execution IAM role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'orderflow-dev-order-svc-execution',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          }),
        ]),
      }),
    });
  });

  it('creates order-service task IAM role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'orderflow-dev-order-svc-task',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          }),
        ]),
      }),
    });
  });

  it('creates notification-svc execution IAM role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'orderflow-dev-notif-svc-execution',
    });
  });

  it('creates notification-svc task IAM role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'orderflow-dev-notif-svc-task',
    });
  });

  it('does NOT create WAF for dev environment', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
  });

  it('exports JwtSecretArn', () => {
    template.hasOutput('JwtSecretArn', {});
  });

  describe('staging environment (WAF enabled)', () => {
    let stagingTemplate: Template;

    beforeEach(() => {
      const stagingApp = new cdk.App();
      const stagingNetwork = new NetworkStack(stagingApp, 'StagingNetwork', {
        config: environments['staging'],
      });
      const stagingStack = new SecurityStack(stagingApp, 'StagingSecurity', {
        config: environments['staging'],
        vpc: stagingNetwork.vpc,
      });
      stagingTemplate = Template.fromStack(stagingStack);
    });

    it('creates WAF WebACL for staging', () => {
      stagingTemplate.resourceCountIs('AWS::WAFv2::WebACL', 1);
    });

    it('WAF includes AWS managed common rule set', () => {
      stagingTemplate.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({ Name: 'AWSManagedRulesCommonRuleSet' }),
        ]),
      });
    });

    it('WAF includes SQLi rule set', () => {
      stagingTemplate.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({ Name: 'AWSManagedRulesSQLiRuleSet' }),
        ]),
      });
    });

    it('WAF includes rate limiting rule', () => {
      stagingTemplate.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([Match.objectLike({ Name: 'RateLimitRule' })]),
      });
    });

    it('exports WebAclArn for staging', () => {
      stagingTemplate.hasOutput('WebAclArn', {});
    });
  });
});
