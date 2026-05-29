import { createHash, createHmac } from 'node:crypto';
import { request } from 'node:https';

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}
function hexHash(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function signedRequest(
  method,
  endpoint,
  path,
  body,
  region,
  credentials
) {
  const now = new Date();
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '')
      .slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash = hexHash(body);
  const headers = {
    host: endpoint,
    'content-type': 'application/json',
    'x-amz-date': amzDate,
    'x-amz-content-sha256': bodyHash,
    ...(credentials.sessionToken
      ? { 'x-amz-security-token': credentials.sessionToken }
      : {}),
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k}:${headers[k]}\n`)
    .join('');
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');
  const scope = `${dateStamp}/${region}/aoss/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hexHash(canonicalRequest)}`;
  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 'aoss');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { ...headers, Authorization: authHeader };
}

export async function handler(event) {
  console.log('Event:', JSON.stringify(event));
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId || 'aoss-index' };
  }

  const endpoint = process.env.COLLECTION_ENDPOINT;
  const indexName = process.env.INDEX_NAME;
  const region = process.env.AWS_REGION;

  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };

  const body = JSON.stringify({
    settings: { index: { knn: true } },
    mappings: {
      properties: {
        embedding: {
          type: 'knn_vector',
          dimension: 1024,
          method: { name: 'hnsw', space_type: 'l2', engine: 'faiss' },
        },
        text: { type: 'text' },
        metadata: { type: 'text' },
      },
    },
  });

  const path = `/${indexName}`;
  const headers = await signedRequest(
    'PUT',
    endpoint,
    path,
    body,
    region,
    credentials
  );

  await new Promise((resolve, reject) => {
    const req = request(
      { hostname: endpoint, path, method: 'PUT', headers },
      res => {
        let data = '';
        res.on('data', c => {
          data += c;
        });
        res.on('end', () => {
          console.log(`AOSS PUT ${indexName}: ${res.statusCode} ${data}`);
          // 200 = created, 400 with resource_already_exists_exception = already exists (ok)
          if (res.statusCode >= 400) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error?.type === 'resource_already_exists_exception') {
                resolve(data);
              } else {
                reject(new Error(`${res.statusCode}: ${data}`));
              }
            } catch {
              reject(new Error(`${res.statusCode}: ${data}`));
            }
          } else {
            resolve(data);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  return { PhysicalResourceId: indexName };
}
