import { Shell } from '../core/shell.js';
import { Logger } from '../core/logger.js';

export interface AwsIdentity {
  account: string;
  userId: string;
  arn: string;
}

export interface CfnStack {
  stackName: string;
  stackId: string;
  stackStatus: string;
  creationTime: string;
  lastUpdatedTime?: string;
  description?: string;
  parameters: Record<string, string>;
  outputs: Record<string, string>;
  tags: Record<string, string>;
}

export interface S3SyncOptions {
  delete?: boolean;
  exclude?: string[];
  include?: string[];
  dryRun?: boolean;
}

export interface CloudFrontInvalidationOptions {
  paths: string[];
  callerReference?: string;
}

export class AwsClient {
  private region: string;

  constructor(region?: string) {
    this.region = region || process.env.AWS_REGION || 'us-east-1';
  }

  private execAws(args: string[]): string {
    const envArgs = ['--region', this.region];
    const result = Shell.execSilent(`aws ${[...envArgs, ...args].join(' ')}`);
    if (result.exitCode !== 0) {
      throw new Error(`AWS CLI command failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  private execAwsJson(args: string[]): any {
    const result = Shell.execSilent(
      `aws ${args.join(' ')} --region ${this.region} --output json`
    );
    if (result.exitCode !== 0) {
      throw new Error(`AWS CLI command failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout.trim());
  }

  stsGetCallerIdentity(): AwsIdentity {
    Logger.debug('Getting AWS caller identity');
    const identity = this.execAwsJson(['sts', 'get-caller-identity']);

    return {
      account: identity.Account,
      userId: identity.UserId,
      arn: identity.Arn,
    };
  }

  cfnDescribeStack(stackName: string): CfnStack | null {
    try {
      Logger.debug(`Describing CloudFormation stack: ${stackName}`);
      const stack = this.execAwsJson([
        'cloudformation',
        'describe-stacks',
        '--stack-name',
        stackName,
      ]);

      const s = stack.Stacks[0];
      if (!s) return null;

      return {
        stackName: s.StackName,
        stackId: s.StackId,
        stackStatus: s.StackStatus,
        creationTime: s.CreationTime,
        lastUpdatedTime: s.LastUpdatedTime,
        description: s.Description,
        parameters: (s.Parameters || []).reduce((acc: any, p: any) => {
          acc[p.ParameterKey] = p.ParameterValue;
          return acc;
        }, {}),
        outputs: (s.Outputs || []).reduce((acc: any, o: any) => {
          acc[o.OutputKey] = o.OutputValue;
          return acc;
        }, {}),
        tags: (s.Tags || []).reduce((acc: any, t: any) => {
          acc[t.Key] = t.Value;
          return acc;
        }, {}),
      };
    } catch (error) {
      Logger.debug(`Stack ${stackName} not found or error occurred`);
      return null;
    }
  }

  cfnListStacks(statusFilter?: string): CfnStack[] {
    Logger.debug('Listing CloudFormation stacks');
    const args = ['cloudformation', 'list-stacks'];
    if (statusFilter) {
      args.push('--stack-status-filter', statusFilter);
    }

    const response = this.execAwsJson(args);

    return (response.StackSummaries || [])
      .filter((s: any) => s.StackStatus !== 'DELETE_COMPLETE')
      .map((s: any) => ({
        stackName: s.StackName,
        stackId: s.StackId,
        stackStatus: s.StackStatus,
        creationTime: s.CreationTime,
        lastUpdatedTime: s.LastUpdatedTime,
        description: s.TemplateDescription,
        parameters: {},
        outputs: {},
        tags: {},
      }));
  }

  cfnDeployStack(
    stackName: string,
    templateFile: string,
    options?: {
      parameters?: Record<string, string>;
      capabilities?: string[];
      notificationArns?: string[];
      roleArn?: string;
      tags?: Record<string, string>;
    }
  ): void {
    Logger.info(`Deploying CloudFormation stack: ${stackName}`);

    const args = [
      'cloudformation',
      'deploy',
      '--stack-name',
      stackName,
      '--template-file',
      templateFile,
      '--capabilities',
      'CAPABILITY_IAM',
      'CAPABILITY_NAMED_IAM',
      '--no-fail-on-empty-changeset',
    ];

    if (options?.parameters) {
      for (const [key, value] of Object.entries(options.parameters)) {
        args.push('--parameter-overrides', `${key}=${value}`);
      }
    }

    if (options?.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        args.push('--tags', `Key=${key},Value=${value}`);
      }
    }

    this.execAws(args);
    Logger.success(`Stack deployment completed: ${stackName}`);
  }

  s3Sync(source: string, destination: string, options?: S3SyncOptions): void {
    Logger.info(`Syncing S3: ${source} -> ${destination}`);

    const args = ['s3', 'sync', source, destination];

    if (options?.delete) {
      args.push('--delete');
    }

    if (options?.exclude) {
      for (const pattern of options.exclude) {
        args.push('--exclude', pattern);
      }
    }

    if (options?.include) {
      for (const pattern of options.include) {
        args.push('--include', pattern);
      }
    }

    if (options?.dryRun) {
      args.push('--dryrun');
    }

    this.execAws(args);
    Logger.success('S3 sync completed');
  }

  s3Upload(
    bucket: string,
    key: string,
    filePath: string,
    contentType?: string
  ): void {
    Logger.info(`Uploading to S3: s3://${bucket}/${key}`);

    const args = ['s3', 'cp', filePath, `s3://${bucket}/${key}`];

    if (contentType) {
      args.push('--content-type', contentType);
    }

    this.execAws(args);
    Logger.success('S3 upload completed');
  }

  cfCreateInvalidation(
    distributionId: string,
    options: CloudFrontInvalidationOptions
  ): string {
    Logger.info(`Creating CloudFront invalidation for: ${distributionId}`);

    const invalidationPaths = options.paths.join(' ');
    const callerReference = options.callerReference || `ai-dev-${Date.now()}`;

    const args = [
      'cloudfront',
      'create-invalidation',
      '--distribution-id',
      distributionId,
      '--paths',
      invalidationPaths,
      '--caller-reference',
      callerReference,
    ];

    const result = this.execAwsJson(args);
    const invalidationId = result.Invalidation.Id;

    Logger.success(`Created invalidation: ${invalidationId}`);
    return invalidationId;
  }

  cfWaitForInvalidation(distributionId: string, invalidationId: string): void {
    Logger.info(`Waiting for invalidation to complete: ${invalidationId}`);

    this.execAws([
      'cloudfront',
      'wait',
      'invalidation-completed',
      '--distribution-id',
      distributionId,
      '--id',
      invalidationId,
    ]);

    Logger.success('Invalidation completed');
  }

  ecrGetLoginPassword(): string {
    Logger.debug('Getting ECR login password');
    return this.execAws(['ecr', 'get-login-password']);
  }

  secretsManagerGetSecret(secretName: string): string {
    Logger.debug(`Getting secret: ${secretName}`);
    const result = this.execAwsJson([
      'secretsmanager',
      'get-secret-value',
      '--secret-id',
      secretName,
    ]);
    return result.SecretString;
  }

  parameterStoreGetParameter(
    parameterName: string,
    withDecryption: boolean = false
  ): string {
    Logger.debug(`Getting parameter: ${parameterName}`);
    const args = ['ssm', 'get-parameter', '--name', parameterName];
    if (withDecryption) {
      args.push('--with-decryption');
    }
    const result = this.execAwsJson(args);
    return result.Parameter.Value;
  }

  lambdaInvoke(functionName: string, payload?: any): any {
    Logger.debug(`Invoking Lambda function: ${functionName}`);

    const args = ['lambda', 'invoke', '--function-name', functionName];
    if (payload) {
      args.push('--payload', JSON.stringify(payload));
    }
    args.push('--output', 'json');

    const result = this.execAwsJson(args);

    if (result.FunctionError) {
      throw new Error(`Lambda function error: ${result.Payload}`);
    }

    return JSON.parse(result.Payload);
  }

  batchSubmitJob(
    jobName: string,
    jobQueue: string,
    jobDefinition: string,
    command?: string[]
  ): string {
    Logger.info(`Submitting Batch job: ${jobName}`);

    const args = [
      'batch',
      'submit-job',
      '--job-name',
      jobName,
      '--job-queue',
      jobQueue,
      '--job-definition',
      jobDefinition,
    ];

    if (command) {
      args.push(
        '--container-overrides',
        JSON.stringify({
          command,
        })
      );
    }

    const result = this.execAwsJson(args);
    const jobId = result.jobId;

    Logger.success(`Submitted Batch job: ${jobId}`);
    return jobId;
  }

  batchWaitForJob(jobId: string): void {
    Logger.info(`Waiting for Batch job to complete: ${jobId}`);

    this.execAws(['batch', 'wait', 'jobs-completed', '--jobs', jobId]);

    Logger.success('Batch job completed');
  }
}
