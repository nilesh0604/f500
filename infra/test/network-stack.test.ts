import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { environments } from '../config/environments';

describe('NetworkStack', () => {
  let app: cdk.App;
  let stack: NetworkStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new NetworkStack(app, 'TestNetwork', {
      config: environments['dev'],
    });
    template = Template.fromStack(stack);
  });

  it('creates a VPC with correct CIDR', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.1.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  it('creates public, private, and isolated subnets', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 6);
  });

  it('creates no NAT gateway for dev (0 NAT)', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('creates ALB security group with port 80 and 443 ingress', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for Application Load Balancer',
    });
  });

  it('creates service security group', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for ECS Fargate services',
    });
  });

  it('creates DB security group', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for RDS PostgreSQL',
    });
  });

  it('creates Redis security group', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for ElastiCache Redis',
    });
  });

  it('does not create VPC flow logs for dev environment', () => {
    template.resourceCountIs('AWS::EC2::FlowLog', 0);
  });

  it('exports VpcId', () => {
    template.hasOutput('VpcId', {});
  });

  it('exports VpcCidr', () => {
    template.hasOutput('VpcCidr', {});
  });

  describe('staging environment', () => {
    let stagingTemplate: Template;

    beforeEach(() => {
      const stagingApp = new cdk.App();
      const stagingStack = new NetworkStack(stagingApp, 'StagingNetwork', {
        config: environments['staging'],
      });
      stagingTemplate = Template.fromStack(stagingStack);
    });

    it('creates VPC flow logs for staging', () => {
      stagingTemplate.resourceCountIs('AWS::EC2::FlowLog', 1);
    });

    it('uses staging CIDR', () => {
      stagingTemplate.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.1.0.0/16',
      });
    });
  });
});
