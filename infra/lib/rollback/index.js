/**
 * Auto-Rollback Lambda Function
 *
 * Triggered by CloudWatch alarms when error rate spikes above threshold.
 * Automatically rolls back ECS services to the previous stable task definition.
 *
 * @see Phase 5: CD Pipeline — Deployment (Weeks 7–8)
 */

const {
  ECSClient,
  DescribeServicesCommand,
  UpdateServiceCommand,
  DescribeTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
} = require('@aws-sdk/client-ecs');
const {
  CloudWatchClient,
  putMetricDataCommand,
} = require('@aws-sdk/client-cloudwatch');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const ecs = new ECSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatch = new CloudWatchClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Lambda handler for auto-rollback
 * @param {Object} event - CloudWatch alarm event
 */
exports.handler = async event => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Extract alarm details
    const alarmName = event.alarmName || event.detail?.alarmName;
    const alarmState = event.detail?.state?.value || 'ALARM';
    const serviceInfo = parseAlarmName(alarmName);

    if (!serviceInfo) {
      console.log('Could not parse service info from alarm name:', alarmName);
      return { statusCode: 400, body: 'Invalid alarm name format' };
    }

    // Only proceed if alarm is in ALARM state
    if (alarmState !== 'ALARM') {
      console.log(`Alarm state is ${alarmState}, skipping rollback`);
      return { statusCode: 200, body: 'Alarm not in ALARM state' };
    }

    const { clusterName, serviceName, environment } = serviceInfo;

    // Check if rollback is already in progress
    const rollbackInProgress = await isRollbackInProgress(
      clusterName,
      serviceName
    );
    if (rollbackInProgress) {
      console.log(`Rollback already in progress for ${serviceName}`);
      return { statusCode: 200, body: 'Rollback already in progress' };
    }

    // Get current service details
    const serviceDetails = await getServiceDetails(clusterName, serviceName);
    const currentTaskDefArn = serviceDetails.taskDefinition;

    // Find previous stable task definition
    const previousTaskDef = await findPreviousTaskDefinition(
      serviceName,
      currentTaskDefArn
    );

    if (!previousTaskDef) {
      console.log('No previous task definition found for rollback');
      await notifyRollbackFailure(
        serviceName,
        environment,
        'No previous task definition found'
      );
      return { statusCode: 404, body: 'No previous task definition found' };
    }

    // Execute rollback
    console.log(
      `Rolling back ${serviceName} from ${currentTaskDefArn} to ${previousTaskDef}`
    );

    const rollbackResult = await executeRollback(
      clusterName,
      serviceName,
      previousTaskDef
    );

    // Record rollback metrics
    await recordRollbackMetrics(serviceName, environment, 'SUCCESS');

    // Send notifications
    await notifyRollbackSuccess(
      serviceName,
      environment,
      currentTaskDefArn,
      previousTaskDef
    );

    console.log(`Rollback completed successfully for ${serviceName}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Rollback successful',
        service: serviceName,
        previousTaskDef,
        rollbackResult,
      }),
    };
  } catch (error) {
    console.error('Rollback failed:', error);

    // Record failure metrics
    await recordRollbackMetrics(serviceName, environment, 'FAILED').catch(
      () => {}
    );

    // Notify about failure
    await notifyRollbackFailure(serviceName, environment, error.message).catch(
      () => {}
    );

    throw error;
  }
};

/**
 * Parse service information from alarm name
 * Expected format: orderflow-{env}-{service}-error-rate-alarm
 */
function parseAlarmName(alarmName) {
  if (!alarmName) return null;

  const match = alarmName.match(
    /orderflow-(\w+)-(\w+)-(?:error-rate|high-errors)/
  );
  if (!match) return null;

  const [, environment, serviceShortName] = match;

  const serviceNameMap = {
    order: 'orderflow-{env}-order-service',
    notif: 'orderflow-{env}-notification-svc',
    notification: 'orderflow-{env}-notification-svc',
  };

  const clusterName = `orderflow-${environment}`;
  const serviceName = (
    serviceNameMap[serviceShortName] || `orderflow-{env}-${serviceShortName}`
  ).replace('{env}', environment);

  return {
    clusterName,
    serviceName,
    environment,
    serviceShortName,
  };
}

/**
 * Check if a rollback is already in progress for the service
 */
async function isRollbackInProgress(clusterName, serviceName) {
  try {
    const command = new DescribeServicesCommand({
      cluster: clusterName,
      services: [serviceName],
    });

    const response = await ecs.send(command);
    const service = response.services[0];

    if (!service) return false;

    // Check if deployment is already in progress
    const inProgressDeployment = service.deployments.find(
      d => d.status === 'IN_PROGRESS' && d.rolloutState === 'IN_PROGRESS'
    );

    return !!inProgressDeployment;
  } catch (error) {
    console.error('Error checking rollback status:', error);
    return false;
  }
}

/**
 * Get current service details
 */
async function getServiceDetails(clusterName, serviceName) {
  const command = new DescribeServicesCommand({
    cluster: clusterName,
    services: [serviceName],
  });

  const response = await ecs.send(command);
  const service = response.services[0];

  if (!service) {
    throw new Error(
      `Service ${serviceName} not found in cluster ${clusterName}`
    );
  }

  return {
    taskDefinition: service.taskDefinition,
    desiredCount: service.desiredCount,
    runningCount: service.runningCount,
  };
}

/**
 * Find the previous stable task definition for rollback
 */
async function findPreviousTaskDefinition(serviceName, currentTaskDefArn) {
  try {
    // Extract family from current task definition
    const currentTaskDef = await describeTaskDefinition(currentTaskDefArn);
    const family = currentTaskDef.family;

    // List all task definitions for this family
    const listCommand = new ListTaskDefinitionsCommand({
      familyPrefix: family,
      sort: 'DESC',
      maxResults: 10,
      status: 'ACTIVE',
    });

    const listResponse = await ecs.send(listCommand);
    const taskDefArns = listResponse.taskDefinitionArns || [];

    // Find the first task definition that is not the current one
    for (const arn of taskDefArns) {
      if (arn !== currentTaskDefArn) {
        return arn;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding previous task definition:', error);
    return null;
  }
}

/**
 * Describe a task definition
 */
async function describeTaskDefinition(taskDefArn) {
  const command = new DescribeTaskDefinitionCommand({
    taskDefinition: taskDefArn,
    include: ['TAGS'],
  });

  const response = await ecs.send(command);
  return response.taskDefinition;
}

/**
 * Execute the rollback by updating the ECS service
 */
async function executeRollback(clusterName, serviceName, previousTaskDef) {
  const updateCommand = new UpdateServiceCommand({
    cluster: clusterName,
    service: serviceName,
    taskDefinition: previousTaskDef,
    forceNewDeployment: true,
    // Ensure minimum healthy percent is maintained during rollback
    deploymentConfiguration: {
      minimumHealthyPercent: 100,
      maximumPercent: 200,
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
    },
  });

  const response = await ecs.send(updateCommand);
  return response.service;
}

/**
 * Record rollback metrics to CloudWatch
 */
async function recordRollbackMetrics(serviceName, environment, status) {
  const command = new putMetricDataCommand({
    Namespace: 'OrderFlow/Deployment',
    MetricData: [
      {
        MetricName: 'AutoRollback',
        Dimensions: [
          { Name: 'Service', Value: serviceName },
          { Name: 'Environment', Value: environment },
          { Name: 'Status', Value: status },
        ],
        Value: status === 'SUCCESS' ? 1 : 0,
        Unit: 'Count',
        Timestamp: new Date(),
      },
    ],
  });

  await cloudwatch.send(command);
}

/**
 * Notify about successful rollback via SNS
 */
async function notifyRollbackSuccess(
  serviceName,
  environment,
  fromTaskDef,
  toTaskDef
) {
  const topicArn = process.env.SNS_ROLLBACK_TOPIC_ARN;
  if (!topicArn) {
    console.log('SNS topic not configured, skipping notification');
    return;
  }

  const message = {
    type: 'AUTO_ROLLBACK_SUCCESS',
    service: serviceName,
    environment: environment,
    timestamp: new Date().toISOString(),
    details: {
      fromTaskDefinition: fromTaskDef,
      toTaskDefinition: toTaskDef,
    },
    message: `✅ Auto-rollback successful for ${serviceName} in ${environment}`,
  };

  const command = new PublishCommand({
    TopicArn: topicArn,
    Subject: `Rollback Successful: ${serviceName} (${environment})`,
    Message: JSON.stringify(message, null, 2),
    MessageAttributes: {
      severity: { DataType: 'String', StringValue: 'HIGH' },
      service: { DataType: 'String', StringValue: serviceName },
      environment: { DataType: 'String', StringValue: environment },
    },
  });

  await sns.send(command);
}

/**
 * Notify about failed rollback via SNS
 */
async function notifyRollbackFailure(serviceName, environment, reason) {
  const topicArn = process.env.SNS_ROLLBACK_TOPIC_ARN;
  if (!topicArn) {
    console.log('SNS topic not configured, skipping notification');
    return;
  }

  const message = {
    type: 'AUTO_ROLLBACK_FAILED',
    service: serviceName,
    environment: environment,
    timestamp: new Date().toISOString(),
    reason: reason,
    message: `❌ Auto-rollback failed for ${serviceName} in ${environment}: ${reason}`,
  };

  const command = new PublishCommand({
    TopicArn: topicArn,
    Subject: `CRITICAL: Rollback Failed for ${serviceName} (${environment})`,
    Message: JSON.stringify(message, null, 2),
    MessageAttributes: {
      severity: { DataType: 'String', StringValue: 'CRITICAL' },
      service: { DataType: 'String', StringValue: serviceName },
      environment: { DataType: 'String', StringValue: environment },
    },
  });

  await sns.send(command);
}
