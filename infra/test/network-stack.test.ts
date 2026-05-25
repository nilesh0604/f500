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

  it('creates public and private subnets (no isolated)', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 4);
  });

  it('creates no NAT gateway for dev (0 NAT)', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('exports VpcId', () => {
    template.hasOutput('VpcId', {});
  });

  it('exports VpcCidr', () => {
    template.hasOutput('VpcCidr', {});
  });
});
