import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { EventStack } from '../lib/event-stack';
import { environments } from '../config/environments';

describe('EventStack', () => {
  let app: cdk.App;
  let stack: EventStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new EventStack(app, 'TestEvents', {
      config: environments['dev'],
    });
    template = Template.fromStack(stack);
  });

  it('creates a custom EventBridge event bus', () => {
    template.hasResourceProperties('AWS::Events::EventBus', {
      Name: 'orderflow-dev',
    });
  });

  it('creates an event archive', () => {
    template.resourceCountIs('AWS::Events::Archive', 1);
  });

  it('creates OrderCreated queue with DLQ', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'orderflow-dev-order-created',
      SqsManagedSseEnabled: true,
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'orderflow-dev-order-created-dlq',
    });
  });

  it('creates OrderStatusChanged queue with DLQ', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'orderflow-dev-order-status-changed',
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'orderflow-dev-order-status-changed-dlq',
    });
  });

  it('creates EventBridge rule for OrderCreated', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'orderflow-dev-order-created',
      EventPattern: {
        source: ['orderflow.order-service'],
        'detail-type': ['OrderCreated'],
      },
    });
  });

  it('creates EventBridge rule for OrderStatusChanged', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'orderflow-dev-order-status-changed',
      EventPattern: {
        source: ['orderflow.order-service'],
        'detail-type': ['OrderStatusChanged'],
      },
    });
  });

  it('creates exactly 4 SQS queues (2 main + 2 DLQs)', () => {
    template.resourceCountIs('AWS::SQS::Queue', 4);
  });

  it('exports EventBusName', () => {
    template.hasOutput('EventBusName', {});
  });

  it('exports OrderCreatedQueueUrl', () => {
    template.hasOutput('OrderCreatedQueueUrl', {});
  });
});
