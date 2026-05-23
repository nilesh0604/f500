import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  DeleteKnowledgeBaseCommand,
  GetKnowledgeBaseCommand,
  CreateDataSourceCommand,
  DeleteDataSourceCommand,
  ListDataSourcesCommand,
} from '@aws-sdk/client-bedrock-agent';

const client = new BedrockAgentClient({ region: process.env.AWS_REGION });

export async function handler(event) {
  console.log('Event:', JSON.stringify(event));

  const kbName = process.env.KB_NAME;
  const kbRoleArn = process.env.KB_ROLE_ARN;
  const embeddingModelArn = process.env.EMBEDDING_MODEL_ARN;
  const vectorBucketArn = process.env.VECTOR_BUCKET_ARN;
  const vectorIndexArn = process.env.VECTOR_INDEX_ARN;
  const vectorIndexName = process.env.VECTOR_INDEX_NAME;
  const corpusBucketArn = process.env.CORPUS_BUCKET_ARN;
  const dsName = process.env.DS_NAME;

  if (event.RequestType === 'Delete') {
    const kbId = event.PhysicalResourceId;
    if (kbId && kbId !== 'PENDING') {
      try {
        // Delete data sources first
        const dsResp = await client.send(
          new ListDataSourcesCommand({ knowledgeBaseId: kbId })
        );
        for (const ds of dsResp.dataSourceSummaries || []) {
          await client.send(
            new DeleteDataSourceCommand({
              knowledgeBaseId: kbId,
              dataSourceId: ds.dataSourceId,
            })
          );
          console.log('Deleted data source:', ds.dataSourceId);
        }
        await client.send(
          new DeleteKnowledgeBaseCommand({ knowledgeBaseId: kbId })
        );
        console.log('Deleted KB:', kbId);
      } catch (e) {
        console.log('Delete KB skipped (may not exist):', e.message);
      }
    }
    return { PhysicalResourceId: kbId || 'DELETED' };
  }

  // Create or Update
  if (event.RequestType === 'Update') {
    // Return existing KB ID — Bedrock KB doesn't support in-place update of storage config
    return {
      PhysicalResourceId: event.PhysicalResourceId,
      Data: await getKbData(event.PhysicalResourceId),
    };
  }

  // Create
  const createResp = await client.send(
    new CreateKnowledgeBaseCommand({
      name: kbName,
      description: 'Mahabharata RAG knowledge base',
      roleArn: kbRoleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: { dimensions: 1024 },
          },
        },
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: {
          vectorBucketArn,
          indexArn: vectorIndexArn,
        },
      },
    })
  );

  const kbId = createResp.knowledgeBase.knowledgeBaseId;
  console.log('Created KB:', kbId);

  // Wait for KB to become ACTIVE
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const kb = await client.send(
      new GetKnowledgeBaseCommand({ knowledgeBaseId: kbId })
    );
    console.log('KB status:', kb.knowledgeBase.status);
    if (kb.knowledgeBase.status === 'ACTIVE') break;
    if (kb.knowledgeBase.status === 'FAILED')
      throw new Error(
        `KB failed: ${JSON.stringify(kb.knowledgeBase.failureReasons)}`
      );
  }

  // Create S3 data source
  const dsResp = await client.send(
    new CreateDataSourceCommand({
      knowledgeBaseId: kbId,
      name: dsName,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: { bucketArn: corpusBucketArn },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 500,
            overlapPercentage: 20,
          },
        },
      },
    })
  );

  const dsId = dsResp.dataSource.dataSourceId;
  console.log('Created data source:', dsId);

  return {
    PhysicalResourceId: kbId,
    Data: { KbId: kbId, DsId: dsId },
  };
}

async function getKbData(kbId) {
  try {
    const kb = await client.send(
      new GetKnowledgeBaseCommand({ knowledgeBaseId: kbId })
    );
    const dsResp = await client.send(
      new ListDataSourcesCommand({ knowledgeBaseId: kbId })
    );
    return {
      KbId: kbId,
      DsId: dsResp.dataSourceSummaries?.[0]?.dataSourceId || '',
    };
  } catch {
    return { KbId: kbId, DsId: '' };
  }
}
