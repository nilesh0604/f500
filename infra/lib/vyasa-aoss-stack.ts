import * as cdk from 'aws-cdk-lib';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'node:path';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface VyasaAossStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

export class VyasaAossStack extends cdk.Stack {
  public readonly collectionArn: string;
  public readonly collectionName: string;
  public readonly bedrockKbRole: iam.Role;

  constructor(scope: Construct, id: string, props: VyasaAossStackProps) {
    super(scope, id, props);

    const { config } = props;
    const collectionName = `vyasa-kb-${config.envName}`;
    this.collectionName = collectionName;

    // Create the Bedrock KB IAM role here so its ARN is available for AOSS access policy
    this.bedrockKbRole = new iam.Role(this, 'BedrockKbRole', {
      roleName: `vyasa-rag-kb-role-${config.envName}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });
    this.bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );
    // Derive corpus bucket ARN from the deterministic naming convention (no cross-stack reference)
    const corpusBucketArn = `arn:aws:s3:::vyasa-rag-corpus-${config.envName}-${this.account}`;
    this.bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [corpusBucketArn, `${corpusBucketArn}/*`],
      })
    );

    const encryptionPolicy = new oss.CfnSecurityPolicy(this, 'Encryption', {
      name: `vyasa-enc-${config.envName}`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/${collectionName}`],
          },
        ],
        AWSOwnedKey: true,
      }),
    });

    const networkPolicy = new oss.CfnSecurityPolicy(this, 'Network', {
      name: `vyasa-net-${config.envName}`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
            },
            {
              ResourceType: 'dashboard',
              Resource: [`collection/${collectionName}`],
            },
          ],
          AllowFromPublic: true,
        },
      ]),
    });

    const collection = new oss.CfnCollection(this, 'Collection', {
      name: collectionName,
      type: 'VECTORSEARCH',
      description: 'Vyasa RAG vector store',
    });
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);

    new oss.CfnAccessPolicy(this, 'DataAccess', {
      name: `vyasa-access-${config.envName}`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems',
              ],
            },
            {
              ResourceType: 'index',
              Resource: [`index/${collectionName}/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument',
              ],
            },
          ],
          Principal: [this.bedrockKbRole.roleArn],
        },
      ]),
    });

    this.bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['aoss:APIAccessAll'],
        resources: [collection.attrArn],
      })
    );

    this.collectionArn = collection.attrArn;

    // Lambda custom resource: creates the AOSS vector index via SigV4-signed HTTPS PUT
    // Bedrock KB requires the index to exist before KB creation
    const indexLambdaRole = new iam.Role(this, 'AossIndexLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });
    indexLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['aoss:APIAccessAll'],
        resources: [collection.attrArn],
      })
    );

    // Asset Lambda: SigV4-signed HTTPS PUT to create the AOSS vector index
    const indexFn = new lambda.Function(this, 'AossIndexFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: indexLambdaRole,
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(path.join(__dirname, 'aoss-index-creator')),
      environment: {
        COLLECTION_ENDPOINT: cdk.Fn.select(
          2,
          cdk.Fn.split('/', collection.attrCollectionEndpoint)
        ),
        INDEX_NAME: `vyasa-index-${config.envName}`,
      },
    });

    // Also grant the indexLambdaRole data-access to the collection
    new oss.CfnAccessPolicy(this, 'IndexLambdaAccess', {
      name: `vyasa-idx-access-${config.envName}`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
              Permission: ['aoss:DescribeCollectionItems'],
            },
            {
              ResourceType: 'index',
              Resource: [`index/${collectionName}/*`],
              Permission: ['aoss:CreateIndex', 'aoss:DescribeIndex'],
            },
          ],
          Principal: [indexLambdaRole.roleArn],
        },
      ]),
    });

    const indexProvider = new cr.Provider(this, 'AossIndexProvider', {
      onEventHandler: indexFn,
    });
    const indexResource = new cdk.CustomResource(this, 'AossVectorIndex', {
      serviceToken: indexProvider.serviceToken,
    });
    indexResource.node.addDependency(collection);

    new cdk.CfnOutput(this, 'CollectionArn', {
      value: collection.attrArn,
      exportName: `${id}-CollectionArn`,
    });
    new cdk.CfnOutput(this, 'CollectionName', {
      value: collectionName,
      exportName: `${id}-CollectionName`,
    });
  }
}
