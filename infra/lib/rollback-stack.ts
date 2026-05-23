import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface RollbackStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly clusterName: string;
  readonly orderServiceName: string;
  readonly notificationServiceName: string;
}

/**
 * Stack for Auto-Rollback Infrastructure
 *
 * This stack provides:
 * - Lambda function for automatic rollback on error rate spikes
 * - CloudWatch alarms for error rate monitoring
 * - SNS topic for rollback notifications
 * - IAM roles and permissions
 *
 * @see Phase 5: CD Pipeline — Deployment (Weeks 7–8)
 */
export class RollbackStack extends cdk.Stack {
  public readonly rollbackFunction: lambda.Function;
  public readonly rollbackTopic: sns.Topic;
  public readonly orderServiceAlarm: cloudwatch.Alarm;
  public readonly notificationServiceAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: RollbackStackProps) {
    super(scope, id, props);

    const { config, clusterName, orderServiceName, notificationServiceName } =
      props;
    const isProd = config.envName === 'prod';

    // SNS Topic for rollback notifications
    this.rollbackTopic = new sns.Topic(this, 'RollbackNotifications', {
      topicName: `orderflow-${config.envName}-rollback-alerts`,
      displayName: `OrderFlow ${config.envName} Rollback Alerts`,
    });

    // Log group for rollback function
    const rollbackLogGroup = new logs.LogGroup(this, 'RollbackFunctionLogs', {
      logGroupName: `/orderflow/${config.envName}/rollback-lambda`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // IAM role for rollback Lambda
    const rollbackRole = new iam.Role(this, 'RollbackFunctionRole', {
      roleName: `orderflow-${config.envName}-rollback-lambda`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Add ECS permissions
    rollbackRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecs:DescribeServices',
          'ecs:DescribeTaskDefinition',
          'ecs:ListTaskDefinitions',
          'ecs:UpdateService',
        ],
        resources: ['*'], // Restricted by conditions below
        conditions: {
          StringEquals: {
            'ecs:cluster': clusterName,
          },
        },
      })
    );

    // Add CloudWatch permissions
    rollbackRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Add SNS permissions
    this.rollbackTopic.grantPublish(rollbackRole);

    // Rollback Lambda function
    this.rollbackFunction = new lambda.Function(this, 'RollbackFunction', {
      functionName: `orderflow-${config.envName}-auto-rollback`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('./lib/rollback'),
      role: rollbackRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        SNS_ROLLBACK_TOPIC_ARN: this.rollbackTopic.topicArn,
        CLUSTER_NAME: clusterName,
        ORDER_SERVICE_NAME: orderServiceName,
        NOTIFICATION_SERVICE_NAME: notificationServiceName,
      },
      logGroup: rollbackLogGroup,
    });

    // Error rate alarm for Order Service
    this.orderServiceAlarm = new cloudwatch.Alarm(
      this,
      'OrderServiceErrorAlarm',
      {
        alarmName: `orderflow-${config.envName}-order-error-rate-alarm`,
        alarmDescription: `High error rate detected in order-service (${config.envName})`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'HTTPCode_Target_5XX_Count',
          dimensionsMap: {
            TargetGroup: `targetgroup/orderflow-${config.envName}-order-tg`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        threshold: isProd ? 10 : 50, // Lower threshold for prod
        evaluationPeriods: isProd ? 2 : 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    // Error rate alarm for Notification Service
    this.notificationServiceAlarm = new cloudwatch.Alarm(
      this,
      'NotificationServiceErrorAlarm',
      {
        alarmName: `orderflow-${config.envName}-notif-error-rate-alarm`,
        alarmDescription: `High error rate detected in notification-svc (${config.envName})`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'HTTPCode_Target_5XX_Count',
          dimensionsMap: {
            TargetGroup: `targetgroup/orderflow-${config.envName}-notif-tg`,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        threshold: isProd ? 10 : 50,
        evaluationPeriods: isProd ? 2 : 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    // Add Lambda action to alarms (each needs unique ID)
    this.orderServiceAlarm.addAlarmAction(
      new cloudwatch_actions.LambdaAction(this.rollbackFunction)
    );
    this.notificationServiceAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(this.rollbackTopic)
    );

    // Also notify SNS topic on alarm
    this.orderServiceAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(this.rollbackTopic)
    );

    // Deployment health alarm (based on circuit breaker failures)
    const deploymentFailureAlarm = new cloudwatch.Alarm(
      this,
      'DeploymentFailureAlarm',
      {
        alarmName: `orderflow-${config.envName}-deployment-failure-alarm`,
        alarmDescription: `ECS deployment circuit breaker triggered (${config.envName})`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'DeploymentFailures',
          dimensionsMap: {
            ClusterName: clusterName,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    deploymentFailureAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(this.rollbackTopic)
    );

    // Subscribe Lambda to SNS topic for all alarm notifications
    this.rollbackTopic.addSubscription(
      new sns_subscriptions.LambdaSubscription(this.rollbackFunction)
    );

    // Outputs
    new cdk.CfnOutput(this, 'RollbackFunctionArn', {
      value: this.rollbackFunction.functionArn,
      exportName: `${id}-RollbackFunctionArn`,
      description: 'Auto-rollback Lambda function ARN',
    });

    new cdk.CfnOutput(this, 'RollbackTopicArn', {
      value: this.rollbackTopic.topicArn,
      exportName: `${id}-RollbackTopicArn`,
      description: 'Rollback SNS topic ARN',
    });

    new cdk.CfnOutput(this, 'OrderServiceAlarmName', {
      value: this.orderServiceAlarm.alarmName,
      exportName: `${id}-OrderServiceAlarmName`,
      description: 'Order service error alarm name',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
