/**
 * AWS SDK mocks for testing
 */

import { Session } from '../../src/types';

// Mock DynamoDB
export const mockDynamoDbClient = {
  send: jest.fn(),
};

export const mockDynamoDbDocumentClient = {
  send: jest.fn(),
};

export const mockGetItemCommand = jest.fn();
export const mockPutItemCommand = jest.fn();
export const mockUpdateItemCommand = jest.fn();

// Mock Bedrock
export const mockBedrockAgentRuntimeClient = {
  send: jest.fn(),
};

export const mockBedrockRuntimeClient = {
  send: jest.fn(),
};

export const mockRetrieveCommand = jest.fn();
export const mockRetrieveAndGenerateCommand = jest.fn();
export const mockInvokeModelCommand = jest.fn();

// Mock S3
export const mockS3Client = {
  send: jest.fn(),
};

export const mockGetObjectCommand = jest.fn();

// Jest manual mocks
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => mockDynamoDbClient),
  GetItemCommand: mockGetItemCommand,
  PutItemCommand: mockPutItemCommand,
  UpdateItemCommand: mockUpdateItemCommand,
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDynamoDbDocumentClient),
  },
  GetCommand: mockGetItemCommand,
  PutCommand: mockPutItemCommand,
  UpdateCommand: mockUpdateItemCommand,
}));

jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn(() => mockBedrockAgentRuntimeClient),
  RetrieveCommand: mockRetrieveCommand,
  RetrieveAndGenerateCommand: mockRetrieveAndGenerateCommand,
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => mockBedrockRuntimeClient),
  InvokeModelCommand: mockInvokeModelCommand,
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3Client),
  GetObjectCommand: mockGetObjectCommand,
}));

/**
 * Reset all mocks before each test
 */
export function resetAwsMocks(): void {
  mockDynamoDbClient.send.mockReset();
  mockDynamoDbDocumentClient.send.mockReset();
  mockBedrockAgentRuntimeClient.send.mockReset();
  mockBedrockRuntimeClient.send.mockReset();
  mockS3Client.send.mockReset();
}

/**
 * Setup mock responses for common operations
 */
export function setupMockSessionGet(sessionData?: Session): void {
  mockDynamoDbClient.send.mockResolvedValue({
    Item: sessionData
      ? {
          session_id: { S: sessionData.session_id },
          data: { S: JSON.stringify(sessionData) },
          ttl: { N: String(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60) },
          updated_at: { S: new Date().toISOString() },
        }
      : undefined,
  });
}

/**
 * Setup mock Bedrock KB retrieval response
 */
export function setupMockRetrievalResponse(
  results: Array<{
    content?: string;
    metadata?: Record<string, string>;
    score?: number;
  }>
): void {
  mockBedrockAgentRuntimeClient.send.mockResolvedValue({
    retrievalResults: results.map(r => ({
      content: { text: r.content || 'Test content' },
      metadata: r.metadata || {},
      score: r.score || 0.9,
    })),
  });
}

/**
 * Setup mock Bedrock generation response
 */
export function setupMockGenerationResponse(
  text: string,
  tokenUsage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  }
): void {
  const body = {
    content: [{ text }],
    usage: {
      input_tokens: tokenUsage?.prompt_tokens || 100,
      output_tokens: tokenUsage?.completion_tokens || 50,
    },
  };

  mockBedrockRuntimeClient.send.mockResolvedValue({
    body: {
      transformToString: jest.fn().mockResolvedValue(JSON.stringify(body)),
    },
  });
}

/**
 * Setup mock S3 prompt response
 */
export function setupMockPromptResponse(
  content: string,
  metadata?: Record<string, string>
): void {
  const frontmatter = metadata
    ? `---\n${Object.entries(metadata)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}\n---\n`
    : '';

  mockS3Client.send.mockResolvedValue({
    Body: {
      transformToString: jest.fn().mockResolvedValue(frontmatter + content),
    },
  });
}
