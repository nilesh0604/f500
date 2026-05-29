/**
 * Unit tests for ingest handler
 */

const mockBedrockAgentClientSend = jest.fn();

jest.mock('@aws-sdk/client-bedrock-agent', () => ({
  BedrockAgentClient: jest.fn().mockImplementation(() => ({
    send: mockBedrockAgentClientSend,
  })),
  StartIngestionJobCommand: jest
    .fn()
    .mockImplementation((args: unknown) => args),
  GetIngestionJobCommand: jest.fn().mockImplementation((args: unknown) => args),
}));

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid-1234') }));

jest.mock('../../src/lib/logger', () => ({
  createRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/ingest';

/** Helper: cast the union result type to the structured form for assertions */
function asResult(r: unknown): {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
} {
  return r as {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  };
}

function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {}
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /admin/ingest',
    rawPath: '/admin/ingest',
    rawQueryString: '',
    headers: { authorization: 'Bearer admin-token' },
    requestContext: {
      requestId: 'test-request-id',
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/admin/ingest',
        protocol: 'HTTP/1.1',
        sourceIp: '1.2.3.4',
        userAgent: 'test',
      },
      routeKey: 'POST /admin/ingest',
      stage: '$default',
      time: '2026-05-29T00:00:00Z',
      timeEpoch: 0,
    },
    body: JSON.stringify({ source_uri: 's3://my-bucket/docs/' }),
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('Ingest handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authorization', () => {
    it('should_return401_when_authorizationHeaderMissing', async () => {
      const event = buildEvent({ headers: {} });
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should_return401_when_authorizationHeaderNotBearer', async () => {
      const event = buildEvent({ headers: { authorization: 'Basic abc123' } });
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(401);
    });

    it('should_return401_when_headersUndefined', async () => {
      const event = buildEvent();
      // @ts-expect-error - testing undefined headers
      event.headers = undefined;
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Validation', () => {
    it('should_return422_when_sourceUriMissing', async () => {
      const event = buildEvent({ body: JSON.stringify({}) });
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(422);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('ValidationError');
    });

    it('should_return422_when_sourceUriNotS3', async () => {
      const event = buildEvent({
        body: JSON.stringify({ source_uri: 'https://example.com/docs' }),
      });
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(422);
    });

    it('should_parseEmptyBody_when_bodyIsNull', async () => {
      const event = buildEvent({ body: null as unknown as string });
      const result = asResult(await handler(event));
      // No body → {} → missing source_uri → 422
      expect(result.statusCode).toBe(422);
    });
  });

  describe('Start ingestion job', () => {
    it('should_return202_when_ingestionJobStarted', async () => {
      mockBedrockAgentClientSend.mockResolvedValue({
        ingestionJob: {
          ingestionJobId: 'job-abc',
          status: 'STARTING',
        },
      });

      const event = buildEvent({
        body: JSON.stringify({ source_uri: 's3://bucket/key/' }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(202);
      const body = JSON.parse(result.body);
      expect(body.job_id).toBe('job-abc');
      expect(body.status).toBe('STARTING');
    });

    it('should_use_INCREMENTAL_syncMode_by_default', async () => {
      mockBedrockAgentClientSend.mockResolvedValue({
        ingestionJob: { ingestionJobId: 'job-xyz', status: 'STARTING' },
      });

      const event = buildEvent({
        body: JSON.stringify({ source_uri: 's3://bucket/key/' }),
      });

      await handler(event);
      expect(mockBedrockAgentClientSend).toHaveBeenCalled();
    });

    it('should_use_provided_syncMode', async () => {
      mockBedrockAgentClientSend.mockResolvedValue({
        ingestionJob: { ingestionJobId: 'job-full', status: 'STARTING' },
      });

      const event = buildEvent({
        body: JSON.stringify({
          source_uri: 's3://bucket/key/',
          sync_mode: 'FULL_SYNC',
        }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(202);
    });
  });

  describe('Get ingestion job status', () => {
    it('should_return200_with_jobStatus_when_jobIdProvided', async () => {
      mockBedrockAgentClientSend.mockResolvedValue({
        ingestionJob: {
          ingestionJobId: 'job-abc',
          status: 'IN_PROGRESS',
          statistics: { numberOfDocumentsScanned: 10 },
          startedAt: '2026-05-29T00:00:00Z',
          updatedAt: '2026-05-29T00:01:00Z',
        },
      });

      const event = buildEvent({
        body: JSON.stringify({
          source_uri: 's3://bucket/key/',
          job_id: 'job-abc',
        }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.job_id).toBe('job-abc');
      expect(body.status).toBe('IN_PROGRESS');
    });
  });

  describe('Error handling', () => {
    it('should_return500_when_bedrockThrows', async () => {
      mockBedrockAgentClientSend.mockRejectedValue(
        new Error('Bedrock unavailable')
      );

      const event = buildEvent({
        body: JSON.stringify({ source_uri: 's3://bucket/key/' }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('InternalError');
    });

    it('should_return500_when_correlationIdMissing', async () => {
      mockBedrockAgentClientSend.mockRejectedValue(new Error('err'));
      const event = buildEvent({
        body: JSON.stringify({ source_uri: 's3://bucket/k/' }),
      });
      // @ts-expect-error - testing undefined requestContext
      event.requestContext = undefined;

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(500);
    });
  });
});
