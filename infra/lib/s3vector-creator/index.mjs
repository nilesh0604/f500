import { S3VectorsClient, CreateVectorBucketCommand, CreateIndexCommand, DeleteIndexCommand, DeleteVectorBucketCommand, ListIndexesCommand } from '@aws-sdk/client-s3vectors';

const client = new S3VectorsClient({ region: process.env.AWS_REGION });

export async function handler(event) {
  console.log('Event:', JSON.stringify(event));

  const vectorBucketName = process.env.VECTOR_BUCKET_NAME;
  const indexName = process.env.INDEX_NAME;
  const dimensions = parseInt(process.env.DIMENSIONS || '1024', 10);

  if (event.RequestType === 'Delete') {
    try {
      // Delete index first, then bucket
      await client.send(new DeleteIndexCommand({ vectorBucketName, indexName }));
      console.log('Deleted index:', indexName);
    } catch (e) {
      console.log('Delete index skipped (may not exist):', e.message);
    }
    try {
      await client.send(new DeleteVectorBucketCommand({ vectorBucketName }));
      console.log('Deleted vector bucket:', vectorBucketName);
    } catch (e) {
      console.log('Delete bucket skipped (may not exist):', e.message);
    }
    return { PhysicalResourceId: event.PhysicalResourceId || `${vectorBucketName}/${indexName}` };
  }

  // Create vector bucket (idempotent)
  try {
    await client.send(new CreateVectorBucketCommand({ vectorBucketName }));
    console.log('Created vector bucket:', vectorBucketName);
  } catch (e) {
    if (e.name === 'BucketAlreadyExists' || e.name === 'BucketAlreadyOwnedByYou') {
      console.log('Vector bucket already exists:', vectorBucketName);
    } else {
      throw e;
    }
  }

  // Create index (idempotent)
  try {
    await client.send(new CreateIndexCommand({
      vectorBucketName,
      indexName,
      dataType: 'float32',
      dimension: dimensions,
      distanceMetric: 'euclidean',
      metadataConfiguration: {
        nonFilterableMetadataKeys: ['text', 'metadata'],
      },
    }));
    console.log('Created index:', indexName);
  } catch (e) {
    if (e.name === 'IndexAlreadyExistsException' || e.message?.includes('already exists')) {
      console.log('Index already exists:', indexName);
    } else {
      throw e;
    }
  }

  // Get index ARN
  const listResp = await client.send(new ListIndexesCommand({ vectorBucketName }));
  const idx = listResp.indexes?.find(i => i.indexName === indexName);
  const indexArn = idx?.indexArn || '';
  console.log('Index ARN:', indexArn);

  return {
    PhysicalResourceId: `${vectorBucketName}/${indexName}`,
    Data: { IndexArn: indexArn, VectorBucketName: vectorBucketName, IndexName: indexName },
  };
}
