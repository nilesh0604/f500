import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface ECSStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vpc: ec2.Vpc;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly serviceSecurityGroup: ec2.SecurityGroup;
  readonly dbSecret: secretsmanager.Secret;
  readonly redisEndpoint: string;
  readonly redisPort: string;
  readonly orderCreatedQueue: sqs.Queue;
  readonly orderStatusChangedQueue: sqs.Queue;
  readonly eventBusName: string;
  readonly jwtSecret: secretsmanager.Secret;
}

export class ECSStack extends cdk.Stack {
  public readonly clusterName: string;
  public readonly orderServiceName: string;
  public readonly notificationServiceName: string;
  public readonly albDnsName: string;
  public readonly albFullName: string;

  constructor(scope: Construct, id: string, props: ECSStackProps) {
    super(scope, id, props);

    const {
      config,
      vpc,
      albSecurityGroup,
      serviceSecurityGroup,
      dbSecret,
      redisEndpoint,
      redisPort,
      orderCreatedQueue,
      orderStatusChangedQueue,
      eventBusName,
      jwtSecret,
    } = props;

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `orderflow-${config.envName}`,
      vpc,
      containerInsights: config.enableDetailedMonitoring,
    });
    this.clusterName = cluster.clusterName;

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `orderflow-${config.envName}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      deletionProtection: config.envName === 'prod',
    });
    this.albDnsName = alb.loadBalancerDnsName;
    this.albFullName = alb.loadBalancerFullName;

    const httpListener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,
    });

    const orderServiceLogGroup = new logs.LogGroup(
      this,
      'OrderServiceLogGroup',
      {
        logGroupName: `/orderflow/${config.envName}/order-service`,
        retention:
          logs.RetentionDays[this.retentionDaysKey(config.logRetentionDays)],
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    const notificationSvcLogGroup = new logs.LogGroup(
      this,
      'NotificationSvcLogGroup',
      {
        logGroupName: `/orderflow/${config.envName}/notification-svc`,
        retention:
          logs.RetentionDays[this.retentionDaysKey(config.logRetentionDays)],
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    const orderServiceExecutionRole = new iam.Role(
      this,
      'OrderSvcExecutionRole',
      {
        roleName: `orderflow-${config.envName}-order-exec`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      }
    );
    dbSecret.grantRead(orderServiceExecutionRole);
    jwtSecret.grantRead(orderServiceExecutionRole);

    const orderServiceTaskRole = new iam.Role(this, 'OrderSvcTaskRole', {
      roleName: `orderflow-${config.envName}-order-task`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [
          `arn:aws:events:${this.region}:${this.account}:event-bus/${eventBusName}`,
        ],
      })
    );
    orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      })
    );
    orderServiceTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/orderflow/${config.envName}/*`,
        ],
      })
    );

    const orderServiceTaskDef = new ecs.FargateTaskDefinition(
      this,
      'OrderServiceTaskDef',
      {
        family: `orderflow-${config.envName}-order-service`,
        cpu: config.orderServiceCpu,
        memoryLimitMiB: config.orderServiceMemory,
        executionRole: orderServiceExecutionRole,
        taskRole: orderServiceTaskRole,
        runtimePlatform: {
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
        },
      }
    );

    const orderServiceContainer = orderServiceTaskDef.addContainer(
      'order-service',
      {
        image: ecs.ContainerImage.fromRegistry(
          `${this.account}.dkr.ecr.${this.region}.amazonaws.com/orderflow/order-service:latest`
        ),
        containerName: 'order-service',
        essential: true,
        portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: 'order-service',
          logGroup: orderServiceLogGroup,
        }),
        environment: {
          NODE_ENV: config.envName === 'prod' ? 'production' : config.envName,
          PORT: '3000',
          REDIS_HOST: redisEndpoint,
          REDIS_PORT: redisPort,
          EVENT_BUS_NAME: eventBusName,
          AWS_REGION: this.region,
          LOG_LEVEL: config.envName === 'prod' ? 'info' : 'debug',
        },
        secrets: {
          DATABASE_URL: ecs.Secret.fromSecretsManager(dbSecret, 'connection'),
          JWT_PRIVATE_KEY: ecs.Secret.fromSecretsManager(
            jwtSecret,
            'privateKey'
          ),
        },
        healthCheck: {
          command: [
            'CMD-SHELL',
            'wget -qO- http://localhost:3000/health || exit 1',
          ],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
          startPeriod: cdk.Duration.seconds(60),
        },
      }
    );
    void orderServiceContainer;

    const notificationSvcExecutionRole = new iam.Role(
      this,
      'NotifSvcExecutionRole',
      {
        roleName: `orderflow-${config.envName}-notif-exec`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      }
    );
    jwtSecret.grantRead(notificationSvcExecutionRole);

    const notificationSvcTaskRole = new iam.Role(this, 'NotifSvcTaskRole', {
      roleName: `orderflow-${config.envName}-notif-task`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    notificationSvcTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:ChangeMessageVisibility',
        ],
        resources: [
          orderCreatedQueue.queueArn,
          orderStatusChangedQueue.queueArn,
        ],
      })
    );
    notificationSvcTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      })
    );
    notificationSvcTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/orderflow/${config.envName}/*`,
        ],
      })
    );

    const notificationSvcTaskDef = new ecs.FargateTaskDefinition(
      this,
      'NotificationSvcTaskDef',
      {
        family: `orderflow-${config.envName}-notification-svc`,
        cpu: config.notificationSvcCpu,
        memoryLimitMiB: config.notificationSvcMemory,
        executionRole: notificationSvcExecutionRole,
        taskRole: notificationSvcTaskRole,
        runtimePlatform: {
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
        },
      }
    );

    const notifContainer = notificationSvcTaskDef.addContainer(
      'notification-svc',
      {
        image: ecs.ContainerImage.fromRegistry(
          `${this.account}.dkr.ecr.${this.region}.amazonaws.com/orderflow/notification-svc:latest`
        ),
        containerName: 'notification-svc',
        essential: true,
        portMappings: [{ containerPort: 3001, protocol: ecs.Protocol.TCP }],
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: 'notification-svc',
          logGroup: notificationSvcLogGroup,
        }),
        environment: {
          NODE_ENV: config.envName === 'prod' ? 'production' : config.envName,
          PORT: '3001',
          REDIS_HOST: redisEndpoint,
          REDIS_PORT: redisPort,
          ORDER_CREATED_QUEUE_URL: orderCreatedQueue.queueUrl,
          ORDER_STATUS_CHANGED_QUEUE_URL: orderStatusChangedQueue.queueUrl,
          AWS_REGION: this.region,
          LOG_LEVEL: config.envName === 'prod' ? 'info' : 'debug',
        },
        healthCheck: {
          command: [
            'CMD-SHELL',
            'wget -qO- http://localhost:3001/health || exit 1',
          ],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
          startPeriod: cdk.Duration.seconds(60),
        },
      }
    );
    void notifContainer;

    const privateSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    });

    const orderService = new ecs.FargateService(this, 'OrderService', {
      serviceName: `orderflow-${config.envName}-order-service`,
      cluster,
      taskDefinition: orderServiceTaskDef,
      desiredCount: config.orderServiceDesiredCount,
      vpcSubnets: privateSubnets,
      securityGroups: [serviceSecurityGroup],
      enableExecuteCommand: config.envName !== 'prod',
      circuitBreaker: { rollback: true },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    this.orderServiceName = orderService.serviceName;

    const orderScaling = orderService.autoScaleTaskCount({
      minCapacity: config.orderServiceMinCapacity,
      maxCapacity: config.orderServiceMaxCapacity,
    });
    orderScaling.scaleOnCpuUtilization('OrderServiceCpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });
    orderScaling.scaleOnMemoryUtilization('OrderServiceMemoryScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    const notificationService = new ecs.FargateService(
      this,
      'NotificationService',
      {
        serviceName: `orderflow-${config.envName}-notification-svc`,
        cluster,
        taskDefinition: notificationSvcTaskDef,
        desiredCount: config.notificationSvcDesiredCount,
        vpcSubnets: privateSubnets,
        securityGroups: [serviceSecurityGroup],
        enableExecuteCommand: config.envName !== 'prod',
        circuitBreaker: { rollback: true },
        deploymentController: {
          type: ecs.DeploymentControllerType.ECS,
        },
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
      }
    );
    this.notificationServiceName = notificationService.serviceName;

    const notifScaling = notificationService.autoScaleTaskCount({
      minCapacity: config.notificationSvcMinCapacity,
      maxCapacity: config.notificationSvcMaxCapacity,
    });
    notifScaling.scaleOnCpuUtilization('NotifSvcCpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });
    notifScaling.scaleOnMemoryUtilization('NotifSvcMemoryScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    orderScaling.scaleOnSchedule('OrderSvcScaleOut', {
      schedule: appscaling.Schedule.cron({ hour: '8', minute: '0' }),
      minCapacity: Math.max(
        config.orderServiceMinCapacity,
        Math.ceil(config.orderServiceMaxCapacity * 0.5)
      ),
    });
    orderScaling.scaleOnSchedule('OrderSvcScaleIn', {
      schedule: appscaling.Schedule.cron({ hour: '22', minute: '0' }),
      minCapacity: config.orderServiceMinCapacity,
    });

    notifScaling.scaleOnSchedule('NotifSvcScaleOut', {
      schedule: appscaling.Schedule.cron({ hour: '8', minute: '0' }),
      minCapacity: Math.max(
        config.notificationSvcMinCapacity,
        Math.ceil(config.notificationSvcMaxCapacity * 0.5)
      ),
    });
    notifScaling.scaleOnSchedule('NotifSvcScaleIn', {
      schedule: appscaling.Schedule.cron({ hour: '22', minute: '0' }),
      minCapacity: config.notificationSvcMinCapacity,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'OrderServiceTg',
      {
        targetGroupName: `orderflow-${config.envName}-order-tg`,
        vpc,
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: '/health',
          interval: cdk.Duration.seconds(30),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          timeout: cdk.Duration.seconds(5),
        },
        deregistrationDelay: cdk.Duration.seconds(30),
        targets: [orderService],
      }
    );

    const notifTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'NotifSvcTg',
      {
        targetGroupName: `orderflow-${config.envName}-notif-tg`,
        vpc,
        port: 3001,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: '/health',
          interval: cdk.Duration.seconds(30),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          timeout: cdk.Duration.seconds(5),
        },
        deregistrationDelay: cdk.Duration.seconds(30),
        targets: [notificationService],
      }
    );

    httpListener.addTargetGroups('OrderServiceDefault', {
      targetGroups: [targetGroup],
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/v1/*', '/health', '/ready']),
      ],
      priority: 10,
    });

    httpListener.addTargetGroups('NotifSvcRoute', {
      targetGroups: [notifTargetGroup],
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/ws/*', '/socket.io/*']),
      ],
      priority: 20,
    });

    httpListener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      exportName: `${id}-AlbDnsName`,
      description: 'ALB DNS name',
    });
    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      exportName: `${id}-ClusterName`,
      description: 'ECS cluster name',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }

  private retentionDaysKey(days: number): keyof typeof logs.RetentionDays {
    const map: Record<number, keyof typeof logs.RetentionDays> = {
      1: 'ONE_DAY',
      3: 'THREE_DAYS',
      5: 'FIVE_DAYS',
      7: 'ONE_WEEK',
      14: 'TWO_WEEKS',
      30: 'ONE_MONTH',
      60: 'TWO_MONTHS',
      90: 'THREE_MONTHS',
      180: 'SIX_MONTHS',
      365: 'ONE_YEAR',
    };
    return map[days] ?? 'ONE_MONTH';
  }
}
