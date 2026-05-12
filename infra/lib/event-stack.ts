import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface EventStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

export class EventStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly orderCreatedQueue: sqs.Queue;
  public readonly orderCreatedDlq: sqs.Queue;
  public readonly orderStatusChangedQueue: sqs.Queue;
  public readonly orderStatusChangedDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: EventStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.eventBus = new events.EventBus(this, 'OrderFlowEventBus', {
      eventBusName: `orderflow-${config.envName}`,
      description: `OrderFlow ${config.envName} event bus`,
    });

    new events.Archive(this, 'EventArchive', {
      sourceEventBus: this.eventBus,
      archiveName: `orderflow-${config.envName}-archive`,
      description: `Archive for OrderFlow ${config.envName} events`,
      retention: cdk.Duration.days(config.logRetentionDays),
      eventPattern: { source: ['orderflow.order-service'] },
    });

    this.orderCreatedDlq = new sqs.Queue(this, 'OrderCreatedDlq', {
      queueName: `orderflow-${config.envName}-order-created-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    this.orderCreatedQueue = new sqs.Queue(this, 'OrderCreatedQueue', {
      queueName: `orderflow-${config.envName}-order-created`,
      visibilityTimeout: cdk.Duration.seconds(config.sqsVisibilityTimeout),
      retentionPeriod: cdk.Duration.days(config.sqsMessageRetentionDays),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.orderCreatedDlq,
        maxReceiveCount: config.sqsMaxReceiveCount,
      },
    });

    this.orderStatusChangedDlq = new sqs.Queue(this, 'OrderStatusChangedDlq', {
      queueName: `orderflow-${config.envName}-order-status-changed-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    this.orderStatusChangedQueue = new sqs.Queue(
      this,
      'OrderStatusChangedQueue',
      {
        queueName: `orderflow-${config.envName}-order-status-changed`,
        visibilityTimeout: cdk.Duration.seconds(config.sqsVisibilityTimeout),
        retentionPeriod: cdk.Duration.days(config.sqsMessageRetentionDays),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        deadLetterQueue: {
          queue: this.orderStatusChangedDlq,
          maxReceiveCount: config.sqsMaxReceiveCount,
        },
      }
    );

    new events.Rule(this, 'OrderCreatedRule', {
      eventBus: this.eventBus,
      ruleName: `orderflow-${config.envName}-order-created`,
      description: 'Route OrderCreated events to SQS',
      eventPattern: {
        source: ['orderflow.order-service'],
        detailType: ['OrderCreated'],
      },
      targets: [
        new targets.SqsQueue(this.orderCreatedQueue, {
          messageGroupId: undefined,
        }),
      ],
    });

    new events.Rule(this, 'OrderStatusChangedRule', {
      eventBus: this.eventBus,
      ruleName: `orderflow-${config.envName}-order-status-changed`,
      description: 'Route OrderStatusChanged events to SQS',
      eventPattern: {
        source: ['orderflow.order-service'],
        detailType: ['OrderStatusChanged'],
      },
      targets: [
        new targets.SqsQueue(this.orderStatusChangedQueue, {
          messageGroupId: undefined,
        }),
      ],
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      exportName: `${id}-EventBusName`,
      description: 'EventBridge event bus name',
    });
    new cdk.CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      exportName: `${id}-EventBusArn`,
      description: 'EventBridge event bus ARN',
    });
    new cdk.CfnOutput(this, 'OrderCreatedQueueUrl', {
      value: this.orderCreatedQueue.queueUrl,
      exportName: `${id}-OrderCreatedQueueUrl`,
      description: 'OrderCreated SQS queue URL',
    });
    new cdk.CfnOutput(this, 'OrderStatusChangedQueueUrl', {
      value: this.orderStatusChangedQueue.queueUrl,
      exportName: `${id}-OrderStatusChangedQueueUrl`,
      description: 'OrderStatusChanged SQS queue URL',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
