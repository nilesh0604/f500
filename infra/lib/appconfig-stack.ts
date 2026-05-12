import * as cdk from 'aws-cdk-lib';
import * as appconfig from 'aws-cdk-lib/aws-appconfig';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface AppConfigStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Stack for AWS AppConfig - Feature Flags and Application Configuration
 *
 * This stack provides:
 * - Feature flags for gradual rollout of new features
 * - Dynamic configuration that can be updated without deployment
 * - Environment-specific configuration profiles
 *
 * @see Phase 5: CD Pipeline — Deployment (Weeks 7–8)
 */
export class AppConfigStack extends cdk.Stack {
  public readonly application: appconfig.CfnApplication;
  public readonly appConfigEnvironment: appconfig.CfnEnvironment;
  public readonly featureFlagsConfigurationProfile: appconfig.CfnConfigurationProfile;
  public readonly dynamicConfigProfile: appconfig.CfnConfigurationProfile;

  constructor(scope: Construct, id: string, props: AppConfigStackProps) {
    super(scope, id, props);

    const { config } = props;
    const isProd = config.envName === 'prod';

    // Create AppConfig Application
    this.application = new appconfig.CfnApplication(this, 'OrderFlowApp', {
      name: `orderflow-${config.envName}`,
      description: `OrderFlow application configuration for ${config.envName} environment`,
    });

    // Create AppConfig Environment
    this.appConfigEnvironment = new appconfig.CfnEnvironment(
      this,
      'OrderFlowEnv',
      {
        applicationId: this.application.ref,
        name: config.envName,
        description: `${config.envName} environment configuration`,
      }
    );

    // Feature Flags Configuration Profile
    this.featureFlagsConfigurationProfile =
      new appconfig.CfnConfigurationProfile(this, 'FeatureFlagsProfile', {
        applicationId: this.application.ref,
        name: 'feature-flags',
        description: 'Feature flags for gradual feature rollout',
        locationUri: 'hosted',
        type: 'AWS.AppConfig.FeatureFlags',
      });

    // Dynamic Configuration Profile (for non-feature-flag configs)
    this.dynamicConfigProfile = new appconfig.CfnConfigurationProfile(
      this,
      'DynamicConfigProfile',
      {
        applicationId: this.application.ref,
        name: 'dynamic-config',
        description: 'Dynamic runtime configuration',
        locationUri: 'hosted',
      }
    );

    // Define feature flags with initial values
    const featureFlagsConfig = {
      flags: {
        newOrderWorkflow: {
          name: 'newOrderWorkflow',
          description: 'Enable new order processing workflow',
          _createdAt: new Date().toISOString(),
          attributes: {
            enabled: isProd ? false : true,
            // Gradual rollout percentage (0-100)
            rolloutPercentage: isProd ? 0 : 100,
          },
        },
        enhancedNotifications: {
          name: 'enhancedNotifications',
          description: 'Enable enhanced notification templates',
          _createdAt: new Date().toISOString(),
          attributes: {
            enabled: isProd ? false : true,
            rolloutPercentage: isProd ? 0 : 100,
          },
        },
        realTimeOrderTracking: {
          name: 'realTimeOrderTracking',
          description: 'Enable real-time order status tracking',
          _createdAt: new Date().toISOString(),
          attributes: {
            enabled: isProd ? false : true,
            rolloutPercentage: isProd ? 0 : 100,
          },
        },
        paymentRetryLogic: {
          name: 'paymentRetryLogic',
          description: 'Enable automatic payment retry on failure',
          _createdAt: new Date().toISOString(),
          attributes: {
            enabled: true, // Critical feature always enabled
            maxRetries: 3,
            retryDelaySeconds: 5,
          },
        },
        orderAnalytics: {
          name: 'orderAnalytics',
          description: 'Enable order analytics collection',
          _createdAt: new Date().toISOString(),
          attributes: {
            enabled: isProd ? false : true,
            rolloutPercentage: isProd ? 10 : 100,
            samplingRate: 0.1, // Sample 10% of orders
          },
        },
      },
      version: '1',
    };

    // Create hosted configuration version for feature flags
    new appconfig.CfnHostedConfigurationVersion(this, 'FeatureFlagsVersion', {
      applicationId: this.application.ref,
      configurationProfileId: this.featureFlagsConfigurationProfile.ref,
      content: JSON.stringify(featureFlagsConfig),
      contentType: 'application/json',
    });

    // Dynamic configuration
    const dynamicConfig = {
      orderService: {
        maxConcurrentOrders: isProd ? 1000 : 100,
        orderTimeoutMinutes: 30,
        enableOrderValidation: true,
      },
      notificationService: {
        batchSize: isProd ? 100 : 10,
        retryAttempts: 3,
        enableWebSockets: true,
      },
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeoutSeconds: 30,
        halfOpenMaxCalls: 3,
      },
      rateLimiting: {
        requestsPerSecond: isProd ? 10000 : 1000,
        burstCapacity: isProd ? 500 : 50,
      },
    };

    // Create hosted configuration version for dynamic config
    new appconfig.CfnHostedConfigurationVersion(this, 'DynamicConfigVersion', {
      applicationId: this.application.ref,
      configurationProfileId: this.dynamicConfigProfile.ref,
      content: JSON.stringify(dynamicConfig),
      contentType: 'application/json',
    });

    // Deployment strategy for gradual rollout
    const deploymentStrategy = new appconfig.CfnDeploymentStrategy(
      this,
      'CanaryDeploymentStrategy',
      {
        name: `orderflow-${config.envName}-canary`,
        description: 'Canary deployment strategy for gradual rollout',
        deploymentDurationInMinutes: 15,
        growthFactor: 25, // 25% traffic increase per step
        growthType: 'LINEAR',
        replicateTo: 'NONE',
        finalBakeTimeInMinutes: isProd ? 10 : 5,
      }
    );

    // Create a deployment to the environment
    new appconfig.CfnDeployment(this, 'FeatureFlagsDeployment', {
      applicationId: this.application.ref,
      environmentId: this.appConfigEnvironment.ref,
      configurationProfileId: this.featureFlagsConfigurationProfile.ref,
      configurationVersion: '1',
      deploymentStrategyId: deploymentStrategy.ref,
    });

    // IAM role for services to access AppConfig
    const appConfigAccessRole = new iam.Role(this, 'AppConfigAccessRole', {
      roleName: `orderflow-${config.envName}-appconfig-access`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for ECS tasks to access AppConfig',
    });

    appConfigAccessRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'appconfig:GetConfiguration',
          'appconfig:GetLatestConfiguration',
          'appconfig:StartConfigurationSession',
        ],
        resources: [
          `arn:aws:appconfig:${this.region}:${this.account}:application/${this.application.ref}`,
          `arn:aws:appconfig:${this.region}:${this.account}:application/${this.application.ref}/environment/${this.appConfigEnvironment.ref}`,
          `arn:aws:appconfig:${this.region}:${this.account}:application/${this.application.ref}/configurationprofile/${this.featureFlagsConfigurationProfile.ref}`,
          `arn:aws:appconfig:${this.region}:${this.account}:application/${this.application.ref}/configurationprofile/${this.dynamicConfigProfile.ref}`,
        ],
      })
    );

    // CloudWatch alarms for AppConfig deployment monitoring
    if (isProd) {
      new cdk.CfnOutput(this, 'FeatureFlagsConfigId', {
        value: this.featureFlagsConfigurationProfile.ref,
        exportName: `${id}-FeatureFlagsConfigId`,
        description: 'Feature flags configuration profile ID',
      });

      new cdk.CfnOutput(this, 'DynamicConfigId', {
        value: this.dynamicConfigProfile.ref,
        exportName: `${id}-DynamicConfigId`,
        description: 'Dynamic config profile ID',
      });
    }

    new cdk.CfnOutput(this, 'AppConfigApplicationId', {
      value: this.application.ref,
      exportName: `${id}-AppConfigAppId`,
      description: 'AppConfig application ID',
    });

    new cdk.CfnOutput(this, 'AppConfigEnvironmentId', {
      value: this.appConfigEnvironment.ref,
      exportName: `${id}-AppConfigEnvId`,
      description: 'AppConfig environment ID',
    });

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
