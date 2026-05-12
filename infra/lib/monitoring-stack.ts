import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface MonitoringStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly orderServiceName: string;
  readonly notificationServiceName: string;
  readonly clusterName: string;
  readonly albFullName: string;
  readonly dbIdentifier: string;
  readonly orderCreatedQueueName: string;
  readonly orderCreatedDlqName: string;
  readonly orderStatusChangedQueueName: string;
  readonly orderStatusChangedDlqName: string;
}

export class MonitoringStack extends cdk.Stack {
  public readonly alarmTopicArn: string;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const {
      config,
      orderServiceName,
      notificationServiceName,
      clusterName,
      albFullName,
      dbIdentifier,
      orderCreatedQueueName,
      orderCreatedDlqName,
      orderStatusChangedQueueName,
      orderStatusChangedDlqName,
    } = props;

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `orderflow-${config.envName}-alarms`,
      displayName: `OrderFlow ${config.envName} Alarms`,
    });
    this.alarmTopicArn = alarmTopic.topicArn;

    if (config.envName !== 'dev') {
      alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(
          `alerts+${config.envName}@orderflow.example.com`
        )
      );
    }

    const orderSvcCpuAlarm = new cloudwatch.Alarm(
      this,
      'OrderSvcHighCpuAlarm',
      {
        alarmName: `orderflow-${config.envName}-order-svc-high-cpu`,
        alarmDescription: 'Order service CPU utilization > 80%',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'CPUUtilization',
          dimensionsMap: {
            ClusterName: clusterName,
            ServiceName: orderServiceName,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 80,
        evaluationPeriods: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    orderSvcCpuAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
    });

    const orderSvcMemAlarm = new cloudwatch.Alarm(
      this,
      'OrderSvcHighMemAlarm',
      {
        alarmName: `orderflow-${config.envName}-order-svc-high-mem`,
        alarmDescription: 'Order service memory utilization > 85%',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'MemoryUtilization',
          dimensionsMap: {
            ClusterName: clusterName,
            ServiceName: orderServiceName,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 85,
        evaluationPeriods: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    orderSvcMemAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
    });

    const albErrorRateAlarm = new cloudwatch.Alarm(
      this,
      'AlbHighErrorRateAlarm',
      {
        alarmName: `orderflow-${config.envName}-alb-5xx-rate`,
        alarmDescription: 'ALB 5xx error rate > 1%',
        metric: new cloudwatch.MathExpression({
          expression: '(errors5xx / totalRequests) * 100',
          usingMetrics: {
            errors5xx: new cloudwatch.Metric({
              namespace: 'AWS/ApplicationELB',
              metricName: 'HTTPCode_Target_5XX_Count',
              dimensionsMap: { LoadBalancer: albFullName },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
            totalRequests: new cloudwatch.Metric({
              namespace: 'AWS/ApplicationELB',
              metricName: 'RequestCount',
              dimensionsMap: { LoadBalancer: albFullName },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          },
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    albErrorRateAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
    });

    const albP95LatencyAlarm = new cloudwatch.Alarm(
      this,
      'AlbHighLatencyAlarm',
      {
        alarmName: `orderflow-${config.envName}-alb-p95-latency`,
        alarmDescription: 'ALB p95 response time > 500ms',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'TargetResponseTime',
          dimensionsMap: { LoadBalancer: albFullName },
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 0.5,
        evaluationPeriods: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    albP95LatencyAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
    });

    const dbCpuAlarm = new cloudwatch.Alarm(this, 'DbHighCpuAlarm', {
      alarmName: `orderflow-${config.envName}-db-high-cpu`,
      alarmDescription: 'RDS CPU utilization > 70%',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 70,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbCpuAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
    });

    const dbConnectionsAlarm = new cloudwatch.Alarm(
      this,
      'DbConnectionsAlarm',
      {
        alarmName: `orderflow-${config.envName}-db-connections`,
        alarmDescription: 'RDS connections > 80',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'DatabaseConnections',
          dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
          statistic: 'Maximum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 80,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    dbConnectionsAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
    });

    const dlqAlarmConfigs = [
      {
        id: 'OrderCreatedDlqAlarm',
        name: `orderflow-${config.envName}-order-created-dlq`,
        queueName: orderCreatedDlqName,
        description: 'Messages in OrderCreated DLQ',
      },
      {
        id: 'OrderStatusChangedDlqAlarm',
        name: `orderflow-${config.envName}-order-status-changed-dlq`,
        queueName: orderStatusChangedDlqName,
        description: 'Messages in OrderStatusChanged DLQ',
      },
    ];

    dlqAlarmConfigs.forEach(({ id, name, queueName, description }) => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: name,
        alarmDescription: description,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: queueName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction({
        bind: () => ({ alarmActionArn: alarmTopic.topicArn }),
      });
    });

    new cloudwatch.Dashboard(this, 'OrderFlowDashboard', {
      dashboardName: `OrderFlow-${config.envName}`,
      widgets: [
        [
          new cloudwatch.TextWidget({
            markdown: `# OrderFlow ${config.envName} — Operations Dashboard`,
            width: 24,
            height: 1,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'ALB Request Rate',
            width: 8,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'RequestCount',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
              }),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'ALB 5xx Error Count',
            width: 8,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_Target_5XX_Count',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
              }),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'ALB p95 Response Time',
            width: 8,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'TargetResponseTime',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'p95',
                period: cdk.Duration.minutes(1),
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'ECS — CPU Utilization',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ECS',
                metricName: 'CPUUtilization',
                dimensionsMap: {
                  ClusterName: clusterName,
                  ServiceName: orderServiceName,
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
                label: 'order-service',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ECS',
                metricName: 'CPUUtilization',
                dimensionsMap: {
                  ClusterName: clusterName,
                  ServiceName: notificationServiceName,
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
                label: 'notification-svc',
              }),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'ECS — Memory Utilization',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ECS',
                metricName: 'MemoryUtilization',
                dimensionsMap: {
                  ClusterName: clusterName,
                  ServiceName: orderServiceName,
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
                label: 'order-service',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ECS',
                metricName: 'MemoryUtilization',
                dimensionsMap: {
                  ClusterName: clusterName,
                  ServiceName: notificationServiceName,
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
                label: 'notification-svc',
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'RDS CPU & Connections',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'CPUUtilization',
                dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
              }),
            ],
            right: [
              new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'DatabaseConnections',
                dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
              }),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'SQS Queue Depths',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/SQS',
                metricName: 'ApproximateNumberOfMessagesVisible',
                dimensionsMap: { QueueName: orderCreatedQueueName },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(1),
                label: 'order-created',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/SQS',
                metricName: 'ApproximateNumberOfMessagesVisible',
                dimensionsMap: { QueueName: orderStatusChangedQueueName },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(1),
                label: 'order-status-changed',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/SQS',
                metricName: 'ApproximateNumberOfMessagesVisible',
                dimensionsMap: { QueueName: orderCreatedDlqName },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(1),
                label: 'order-created-dlq (ALERT)',
                color: '#d62728',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/SQS',
                metricName: 'ApproximateNumberOfMessagesVisible',
                dimensionsMap: { QueueName: orderStatusChangedDlqName },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(1),
                label: 'order-status-changed-dlq (ALERT)',
                color: '#d62728',
              }),
            ],
          }),
        ],
      ],
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      exportName: `${id}-AlarmTopicArn`,
      description: 'SNS alarm topic ARN',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
