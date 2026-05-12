import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

const SLO_AVAILABILITY = 0.999;
const SLO_LATENCY_P95_MS = 200;
const SLO_ERROR_RATE_PCT = 0.1;
const ERROR_BUDGET_WINDOW_DAYS = 30;

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly orderServiceName: string;
  readonly notificationServiceName: string;
  readonly clusterName: string;
  readonly albFullName: string;
  readonly albDnsName: string;
  readonly dbIdentifier: string;
  readonly orderCreatedQueueName: string;
  readonly orderCreatedDlqName: string;
  readonly orderStatusChangedQueueName: string;
  readonly orderStatusChangedDlqName: string;
}

export class ObservabilityStack extends cdk.Stack {
  public readonly alarmTopicArn: string;
  public readonly p1TopicArn: string;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const {
      config,
      orderServiceName,
      notificationServiceName,
      clusterName,
      albFullName,
      albDnsName,
      dbIdentifier,
      orderCreatedQueueName,
      orderCreatedDlqName,
      orderStatusChangedQueueName,
      orderStatusChangedDlqName,
    } = props;

    const env = config.envName;

    // -----------------------------------------------------------------------
    // SNS Topics — severity-routed
    // -----------------------------------------------------------------------
    const p1Topic = new sns.Topic(this, 'P1AlarmTopic', {
      topicName: `orderflow-${env}-p1-critical`,
      displayName: `OrderFlow ${env} — P1 Critical`,
    });
    this.p1TopicArn = p1Topic.topicArn;

    const p2Topic = new sns.Topic(this, 'P2AlarmTopic', {
      topicName: `orderflow-${env}-p2-high`,
      displayName: `OrderFlow ${env} — P2 High`,
    });

    const p3Topic = new sns.Topic(this, 'P3AlarmTopic', {
      topicName: `orderflow-${env}-p3-medium`,
      displayName: `OrderFlow ${env} — P3 Medium`,
    });

    const p4Topic = new sns.Topic(this, 'P4AlarmTopic', {
      topicName: `orderflow-${env}-p4-low`,
      displayName: `OrderFlow ${env} — P4 Low`,
    });

    this.alarmTopicArn = p2Topic.topicArn;

    if (env !== 'dev') {
      const alertEmail = `alerts+${env}@orderflow.example.com`;
      [p1Topic, p2Topic, p3Topic, p4Topic].forEach(topic =>
        topic.addSubscription(new subscriptions.EmailSubscription(alertEmail))
      );
    }

    // -----------------------------------------------------------------------
    // CloudWatch Log Groups — 30-day hot / retention metadata
    // -----------------------------------------------------------------------
    const orderSvcLogGroup = new logs.LogGroup(this, 'OrderServiceLogGroup', {
      logGroupName: `/orderflow/${env}/order-service`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const notifSvcLogGroup = new logs.LogGroup(this, 'NotifServiceLogGroup', {
      logGroupName: `/orderflow/${env}/notification-svc`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // -----------------------------------------------------------------------
    // X-Ray — sampling rules
    // -----------------------------------------------------------------------
    new xray.CfnSamplingRule(this, 'DefaultSamplingRule', {
      samplingRule: {
        ruleName: `orderflow-${env}-default`,
        priority: 10000,
        reservoirSize: 1,
        fixedRate: 0.05,
        urlPath: '*',
        host: '*',
        httpMethod: '*',
        serviceName: '*',
        serviceType: '*',
        resourceArn: '*',
        version: 1,
      },
    });

    new xray.CfnSamplingRule(this, 'ErrorSamplingRule', {
      samplingRule: {
        ruleName: `orderflow-${env}-errors`,
        priority: 1,
        reservoirSize: 10,
        fixedRate: 1.0,
        urlPath: '*',
        host: '*',
        httpMethod: '*',
        serviceName: `orderflow-${env}*`,
        serviceType: '*',
        resourceArn: '*',
        version: 1,
      },
    });

    // -----------------------------------------------------------------------
    // Infrastructure alarms — ECS CPU/Memory
    // -----------------------------------------------------------------------
    const makeAlarm = (
      id: string,
      alarmName: string,
      description: string,
      metric: cloudwatch.IMetric,
      threshold: number,
      evalPeriods: number,
      topic: sns.ITopic,
      compOp = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    ): cloudwatch.Alarm => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName,
        alarmDescription: description,
        metric,
        threshold,
        evaluationPeriods: evalPeriods,
        comparisonOperator: compOp,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction({
        bind: () => ({ alarmActionArn: topic.topicArn }),
      });
      alarm.addOkAction({ bind: () => ({ alarmActionArn: topic.topicArn }) });
      return alarm;
    };

    makeAlarm(
      'OrderSvcHighCpu',
      `orderflow-${env}-order-svc-high-cpu`,
      'P2: Order service CPU > 80%',
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          ClusterName: clusterName,
          ServiceName: orderServiceName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      80,
      3,
      p2Topic
    );

    makeAlarm(
      'OrderSvcHighMem',
      `orderflow-${env}-order-svc-high-mem`,
      'P3: Order service memory > 85%',
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'MemoryUtilization',
        dimensionsMap: {
          ClusterName: clusterName,
          ServiceName: orderServiceName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      85,
      3,
      p3Topic
    );

    makeAlarm(
      'NotifSvcHighCpu',
      `orderflow-${env}-notif-svc-high-cpu`,
      'P3: Notification service CPU > 80%',
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          ClusterName: clusterName,
          ServiceName: notificationServiceName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      80,
      3,
      p3Topic
    );

    // -----------------------------------------------------------------------
    // ALB alarms — error rate (P2) + p95 latency (P3)
    // -----------------------------------------------------------------------
    const albErrors5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensionsMap: { LoadBalancer: albFullName },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const albRequests = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: { LoadBalancer: albFullName },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    makeAlarm(
      'AlbHighErrorRate',
      `orderflow-${env}-alb-5xx-rate`,
      'P2: ALB 5xx error rate > 1%',
      new cloudwatch.MathExpression({
        expression: '(e5xx / FILL(req,1)) * 100',
        usingMetrics: { e5xx: albErrors5xx, req: albRequests },
        period: cdk.Duration.minutes(5),
      }),
      SLO_ERROR_RATE_PCT * 10,
      2,
      p2Topic
    );

    makeAlarm(
      'AlbHighLatency',
      `orderflow-${env}-alb-p95-latency`,
      'P3: ALB p95 latency > 500ms',
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensionsMap: { LoadBalancer: albFullName },
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      0.5,
      3,
      p3Topic
    );

    // -----------------------------------------------------------------------
    // SLO alarms — p95 < 200ms (SLO target)
    // -----------------------------------------------------------------------
    makeAlarm(
      'SloLatencyBreached',
      `orderflow-${env}-slo-p95-latency-breached`,
      `P2: SLO breached — p95 latency > ${SLO_LATENCY_P95_MS}ms`,
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensionsMap: { LoadBalancer: albFullName },
        statistic: 'p95',
        period: cdk.Duration.minutes(1),
      }),
      SLO_LATENCY_P95_MS / 1000,
      5,
      p2Topic
    );

    // -----------------------------------------------------------------------
    // Error budget burn-rate alarms (fast-burn / slow-burn)
    // Total error budget = (1 - SLO_AVAILABILITY) * window_minutes
    // -----------------------------------------------------------------------
    const totalBudgetMinutes =
      (1 - SLO_AVAILABILITY) * ERROR_BUDGET_WINDOW_DAYS * 24 * 60;

    makeAlarm(
      'FastBurnAlarm',
      `orderflow-${env}-error-budget-fast-burn`,
      'P1: Fast error budget burn — 2% in 1h (14.4× rate)',
      new cloudwatch.MathExpression({
        expression: '(e5xx / FILL(req,1)) * 100',
        usingMetrics: {
          e5xx: new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HTTPCode_Target_5XX_Count',
            dimensionsMap: { LoadBalancer: albFullName },
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
          req: new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'RequestCount',
            dimensionsMap: { LoadBalancer: albFullName },
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        },
        period: cdk.Duration.hours(1),
      }),
      (2 / 100) * (totalBudgetMinutes / 60) * 100,
      1,
      p1Topic
    );

    makeAlarm(
      'SlowBurnAlarm',
      `orderflow-${env}-error-budget-slow-burn`,
      'P2: Slow error budget burn — 5% in 6h',
      new cloudwatch.MathExpression({
        expression: '(e5xx / FILL(req,1)) * 100',
        usingMetrics: {
          e5xx: new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HTTPCode_Target_5XX_Count',
            dimensionsMap: { LoadBalancer: albFullName },
            statistic: 'Sum',
            period: cdk.Duration.hours(6),
          }),
          req: new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'RequestCount',
            dimensionsMap: { LoadBalancer: albFullName },
            statistic: 'Sum',
            period: cdk.Duration.hours(6),
          }),
        },
        period: cdk.Duration.hours(6),
      }),
      (5 / 100) * (totalBudgetMinutes / 360) * 100,
      1,
      p2Topic
    );

    // -----------------------------------------------------------------------
    // RDS alarms
    // -----------------------------------------------------------------------
    makeAlarm(
      'DbHighCpu',
      `orderflow-${env}-db-high-cpu`,
      'P3: RDS CPU > 70%',
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      70,
      3,
      p3Topic
    );

    makeAlarm(
      'DbConnections',
      `orderflow-${env}-db-connections`,
      'P3: RDS connections > 80',
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      80,
      2,
      p3Topic
    );

    // -----------------------------------------------------------------------
    // DLQ alarms — P1 (any message = data loss risk)
    // -----------------------------------------------------------------------
    [
      {
        id: 'OrderCreatedDlq',
        name: `orderflow-${env}-order-created-dlq`,
        queueName: orderCreatedDlqName,
      },
      {
        id: 'OrderStatusChangedDlq',
        name: `orderflow-${env}-order-status-changed-dlq`,
        queueName: orderStatusChangedDlqName,
      },
    ].forEach(({ id, name, queueName }) =>
      makeAlarm(
        `${id}Alarm`,
        name,
        `P1: Messages in ${queueName} DLQ`,
        new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: queueName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        1,
        1,
        p1Topic,
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
      )
    );

    // -----------------------------------------------------------------------
    // Anomaly detection — ALB request count
    // -----------------------------------------------------------------------
    const albRequestMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: { LoadBalancer: albFullName },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const anomalyDetector = new cloudwatch.CfnAnomalyDetector(
      this,
      'AlbRequestAnomalyDetector',
      {
        namespace: 'AWS/ApplicationELB',
        metricName: 'RequestCount',
        stat: 'Sum',
        dimensions: [{ name: 'LoadBalancer', value: albFullName }],
      }
    );

    const anomalyAlarm = new cloudwatch.Alarm(this, 'AlbRequestAnomalyAlarm', {
      alarmName: `orderflow-${env}-alb-request-anomaly`,
      alarmDescription: 'P3: ALB request count outside anomaly band (3σ)',
      metric: new cloudwatch.MathExpression({
        expression: 'ANOMALY_DETECTION_BAND(m1, 3)',
        usingMetrics: { m1: albRequestMetric },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 2,
      comparisonOperator:
        cloudwatch.ComparisonOperator
          .LESS_THAN_LOWER_OR_GREATER_THAN_UPPER_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    anomalyAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: p3Topic.topicArn }),
    });
    anomalyDetector.node.addDependency(anomalyAlarm);

    // -----------------------------------------------------------------------
    // Business metrics alarms — OrdersCreated anomaly
    // -----------------------------------------------------------------------
    const ordersCreatedMetric = new cloudwatch.Metric({
      namespace: 'OrderFlow/App',
      metricName: 'OrdersCreated',
      dimensionsMap: { Service: 'order-service' },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.CfnAnomalyDetector(this, 'OrdersCreatedAnomalyDetector', {
      namespace: 'OrderFlow/App',
      metricName: 'OrdersCreated',
      stat: 'Sum',
      dimensions: [{ name: 'Service', value: 'order-service' }],
    });

    // -----------------------------------------------------------------------
    // Synthetics Canaries
    // -----------------------------------------------------------------------
    const canaryBucket = new s3.Bucket(this, 'CanaryArtifactsBucket', {
      bucketName: `orderflow-${env}-canary-artifacts`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
    });

    const canaryRole = new iam.Role(this, 'CanaryExecutionRole', {
      roleName: `orderflow-${env}-canary-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'CloudWatchSyntheticsFullAccess'
        ),
      ],
      inlinePolicies: {
        canaryS3: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
              resources: [
                canaryBucket.bucketArn,
                `${canaryBucket.bucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudwatch:PutMetricData',
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    const healthCanaryScript = `
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const healthCheck = async () => {
  const urls = [
    'http://${albDnsName}/health',
    'http://${albDnsName}/ready',
  ];
  for (const url of urls) {
    await synthetics.executeHttpStep('GET ' + url, {
      hostname: '${albDnsName}',
      method: 'GET',
      path: url.replace('http://${albDnsName}', ''),
      port: 80,
      protocol: 'http:',
    }, async (res) => {
      if (res.statusCode !== 200) {
        throw new Error('Health check failed: ' + res.statusCode + ' for ' + url);
      }
      log.info('Health OK: ' + url);
    });
  }
};

exports.handler = async () => {
  return await healthCheck();
};
`.trim();

    const healthCanary = new synthetics.Canary(this, 'HealthCanary', {
      canaryName: `orderflow-${env}-health`,
      schedule: synthetics.Schedule.rate(cdk.Duration.minutes(1)),
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline(healthCanaryScript),
        handler: 'index.handler',
      }),
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0,
      artifactsBucketLocation: { bucket: canaryBucket },
      role: canaryRole,
      startAfterCreation: env !== 'dev',
      environmentVariables: { ALB_DNS: albDnsName },
    });

    const canaryFailAlarm = new cloudwatch.Alarm(
      this,
      'HealthCanaryFailAlarm',
      {
        alarmName: `orderflow-${env}-health-canary-failing`,
        alarmDescription: 'P1: Health canary is failing — service unreachable',
        metric: healthCanary.metricFailed({ period: cdk.Duration.minutes(1) }),
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      }
    );
    canaryFailAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: p1Topic.topicArn }),
    });

    // -----------------------------------------------------------------------
    // SLO Dashboard — combined view
    // -----------------------------------------------------------------------
    new cloudwatch.Dashboard(this, 'SLODashboard', {
      dashboardName: `OrderFlow-${env}-SLO`,
      widgets: [
        [
          new cloudwatch.TextWidget({
            markdown: [
              `# OrderFlow ${env} — SLO Dashboard`,
              `**Availability SLO:** ${SLO_AVAILABILITY * 100}%  |  `,
              `**Latency p95 SLO:** <${SLO_LATENCY_P95_MS}ms  |  `,
              `**Error Rate SLO:** <${SLO_ERROR_RATE_PCT}%  |  `,
              `**Error Budget Window:** ${ERROR_BUDGET_WINDOW_DAYS} days`,
            ].join(''),
            width: 24,
            height: 2,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'ALB Request Rate (Rate)',
            width: 8,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'RequestCount',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
                label: 'Requests/min',
              }),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'ALB 5xx Errors (Errors)',
            width: 8,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_Target_5XX_Count',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
                label: '5xx count',
                color: '#d62728',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_Target_4XX_Count',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
                label: '4xx count',
                color: '#ff7f0e',
              }),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'ALB Latency p50/p95/p99 (Duration)',
            width: 8,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'TargetResponseTime',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'p50',
                period: cdk.Duration.minutes(1),
                label: 'p50',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'TargetResponseTime',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'p95',
                period: cdk.Duration.minutes(1),
                label: 'p95',
                color: '#ff7f0e',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'TargetResponseTime',
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: 'p99',
                period: cdk.Duration.minutes(1),
                label: 'p99',
                color: '#d62728',
              }),
            ],
            leftAnnotations: [
              {
                value: SLO_LATENCY_P95_MS / 1000,
                label: 'p95 SLO',
                color: '#e377c2',
              },
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Error Budget Burn Rate',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.MathExpression({
                expression: '(e5xx / FILL(req, 1)) * 100',
                usingMetrics: {
                  e5xx: new cloudwatch.Metric({
                    namespace: 'AWS/ApplicationELB',
                    metricName: 'HTTPCode_Target_5XX_Count',
                    dimensionsMap: { LoadBalancer: albFullName },
                    statistic: 'Sum',
                    period: cdk.Duration.hours(1),
                  }),
                  req: new cloudwatch.Metric({
                    namespace: 'AWS/ApplicationELB',
                    metricName: 'RequestCount',
                    dimensionsMap: { LoadBalancer: albFullName },
                    statistic: 'Sum',
                    period: cdk.Duration.hours(1),
                  }),
                },
                label: 'Error rate % (1h)',
                period: cdk.Duration.hours(1),
              }),
            ],
            leftAnnotations: [
              {
                value: SLO_ERROR_RATE_PCT,
                label: 'SLO threshold',
                color: '#d62728',
              },
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'Business Metrics — Orders',
            width: 12,
            height: 6,
            left: [
              ordersCreatedMetric,
              new cloudwatch.Metric({
                namespace: 'OrderFlow/App',
                metricName: 'OrderStatusChanges',
                dimensionsMap: { Service: 'order-service' },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
                label: 'Status changes',
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'ECS CPU Utilization',
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
            title: 'ECS Memory Utilization',
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
                label: 'CPU %',
              }),
            ],
            right: [
              new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'DatabaseConnections',
                dimensionsMap: { DBInstanceIdentifier: dbIdentifier },
                statistic: 'Average',
                period: cdk.Duration.minutes(1),
                label: 'Connections',
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
                label: 'DLQ: order-created',
                color: '#d62728',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/SQS',
                metricName: 'ApproximateNumberOfMessagesVisible',
                dimensionsMap: { QueueName: orderStatusChangedDlqName },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(1),
                label: 'DLQ: order-status-changed',
                color: '#9467bd',
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Synthetics Canary Health',
            width: 12,
            height: 6,
            left: [
              healthCanary.metricSuccessPercent({
                period: cdk.Duration.minutes(5),
                label: 'Health canary success %',
              }),
            ],
            leftAnnotations: [
              { value: 100, label: '100% target', color: '#2ca02c' },
            ],
          }),
          new cloudwatch.AlarmStatusWidget({
            title: 'Active Alarms',
            width: 12,
            height: 6,
            alarms: [canaryFailAlarm],
          }),
        ],
      ],
    });

    // -----------------------------------------------------------------------
    // Log-level metric filters — ERROR count for order-service
    // -----------------------------------------------------------------------
    const orderSvcErrorFilter = new logs.MetricFilter(
      this,
      'OrderSvcErrorFilter',
      {
        logGroup: orderSvcLogGroup,
        filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'error'),
        metricNamespace: 'OrderFlow/App',
        metricName: 'OrderServiceErrors',
        metricValue: '1',
        defaultValue: 0,
        dimensions: { Service: 'order-service' },
      }
    );

    makeAlarm(
      'OrderSvcErrorRateAlarm',
      `orderflow-${env}-order-svc-error-rate`,
      'P2: order-service error log rate > 10/min',
      orderSvcErrorFilter.metric({
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      10,
      3,
      p2Topic
    );

    // -----------------------------------------------------------------------
    // CFN Outputs
    // -----------------------------------------------------------------------
    new cdk.CfnOutput(this, 'P1TopicArn', {
      value: p1Topic.topicArn,
      exportName: `${id}-P1TopicArn`,
    });
    new cdk.CfnOutput(this, 'P2TopicArn', {
      value: p2Topic.topicArn,
      exportName: `${id}-P2TopicArn`,
    });
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: p2Topic.topicArn,
      exportName: `${id}-AlarmTopicArn`,
      description: 'SNS alarm topic ARN (P2 default)',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
