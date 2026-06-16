/**
 * Receiver Lambda handler — spec compliance tests.
 * Uses jest.resetModules() + jest.doMock() per test to flush the module-level
 * cachedSigningSecret and guarantee fresh AWS client instances.
 */
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

type HandlerFn = (
  event: APIGatewayProxyEventV2
) => Promise<{ statusCode: number; body: string }>;

const SECRET_VALUE = JSON.stringify({ signing_secret: 'test-signing-secret' });

let mockSecretsManagerSend: jest.Mock;
let mockLambdaSend: jest.Mock;
let mockVerifySlackSignature: jest.Mock;
let mockValidateResponseUrl: jest.Mock;
let handler: HandlerFn;

function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {}
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /',
    rawPath: '/',
    rawQueryString: '',
    headers: {
      'x-slack-signature': 'v0=valid',
      'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: 'command=%2Fvyasa&text=Who+was+Karna%3F&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT123&user_id=U123&channel_id=C123&team_id=T123&trigger_id=trig1',
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000',
      apiId: 'api1',
      domainName: 'test.lambda-url.us-east-1.on.aws',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/',
        protocol: 'HTTP/1.1',
        sourceIp: '1.2.3.4',
        userAgent: 'Slackbot',
      },
      requestId: 'req1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    ...overrides,
  } as unknown as APIGatewayProxyEventV2;
}

beforeEach(() => {
  jest.resetModules();

  mockSecretsManagerSend = jest
    .fn()
    .mockResolvedValue({ SecretString: SECRET_VALUE });
  mockLambdaSend = jest.fn().mockResolvedValue({});
  mockVerifySlackSignature = jest.fn().mockReturnValue(true);
  mockValidateResponseUrl = jest.fn();

  jest.doMock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest
      .fn()
      .mockImplementation(() => ({ send: mockSecretsManagerSend })),
    GetSecretValueCommand: jest.fn().mockImplementation((a: unknown) => a),
  }));
  jest.doMock('@aws-sdk/client-lambda', () => ({
    LambdaClient: jest
      .fn()
      .mockImplementation(() => ({ send: mockLambdaSend })),
    InvokeCommand: jest.fn().mockImplementation((a: unknown) => a),
  }));
  jest.doMock('../lib/slack-verifier', () => ({
    verifySlackSignature: mockVerifySlackSignature,
  }));
  jest.doMock('../lib/response-url-validator', () => ({
    validateResponseUrl: mockValidateResponseUrl,
  }));
  jest.doMock('../lib/logger', () => ({
    createRequestLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }));

  process.env.SLACK_SECRET_ARN =
    'arn:aws:secretsmanager:us-east-1:000:secret:test';
  process.env.WORKER_LAMBDA_ARN =
    'arn:aws:lambda:us-east-1:000:function:worker';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  handler = require('../handlers/receiver').handler as HandlerFn;
});

afterEach(() => {
  delete process.env.SLACK_SECRET_ARN;
  delete process.env.WORKER_LAMBDA_ARN;
});

// AC: AC-6 — Health check endpoint
describe('GET /health', () => {
  it('should_return_200_with_status_payload_when_health_check_requested', async () => {
    const event = makeEvent({
      requestContext: {
        http: {
          method: 'GET',
          path: '/health',
          protocol: 'HTTP/1.1',
          sourceIp: '1.2.3.4',
          userAgent: 'monitor',
        },
      } as APIGatewayProxyEventV2['requestContext'],
      rawPath: '/health',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('vyasa-slack-cmd');
    expect(body.timestamp).toBeDefined();
  });

  // Branch: path === '/health/' (trailing slash variant)
  it('should_return_200_when_health_check_uses_trailing_slash', async () => {
    const event = makeEvent({
      requestContext: {
        http: {
          method: 'GET',
          path: '/health/',
          protocol: 'HTTP/1.1',
          sourceIp: '1.2.3.4',
          userAgent: 'monitor',
        },
      } as APIGatewayProxyEventV2['requestContext'],
      rawPath: '/health/',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('ok');
  });
});

describe('POST / — method guard', () => {
  it('should_return_405_when_http_method_is_not_get_or_post', async () => {
    const event = makeEvent({
      requestContext: {
        http: {
          method: 'DELETE',
          path: '/',
          protocol: 'HTTP/1.1',
          sourceIp: '1.2.3.4',
          userAgent: 'test',
        },
      } as APIGatewayProxyEventV2['requestContext'],
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(405);
  });
});

// AC: AC-2 — Slack signature verification failure → HTTP 401
describe('POST / — signature verification', () => {
  it('should_return_401_when_signature_verification_fails', async () => {
    mockVerifySlackSignature.mockReturnValue(false);

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('invalid_signature');
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('should_return_500_when_secrets_manager_call_fails', async () => {
    mockSecretsManagerSend.mockRejectedValue(
      new Error('SecretsManager unavailable')
    );

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('should_return_500_when_slack_secret_arn_env_var_is_not_configured', async () => {
    delete process.env.SLACK_SECRET_ARN;

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(mockSecretsManagerSend).not.toHaveBeenCalled();
  });
});

// AC: AC-3 — Blank / whitespace-only query → ephemeral usage hint
describe('POST / — blank query handling', () => {
  it('should_return_usage_hint_when_query_is_blank', async () => {
    const event = makeEvent({
      body: 'command=%2Fvyasa&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcmd&user_id=U1&channel_id=C1&team_id=T1&trigger_id=trig1',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response_type).toBe('ephemeral');
    expect(body.text).toContain('/vyasa <your question>');
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  // EDGE-4 — whitespace-only query must be trimmed and treated as blank
  it('should_return_usage_hint_when_query_is_whitespace_only', async () => {
    const event = makeEvent({
      body: 'command=%2Fvyasa&text=++++&response_url=https%3A%2F%2Fhooks.slack.com%2Fcmd&user_id=U1&channel_id=C1&team_id=T1&trigger_id=trig1',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response_type).toBe('ephemeral');
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });
});

// ERR-PATH — invalid response_url → 400
describe('POST / — response_url validation', () => {
  it('should_return_400_when_response_url_is_invalid', async () => {
    mockValidateResponseUrl.mockImplementation(() => {
      throw new Error(
        'Invalid response_url: must originate from https://hooks.slack.com'
      );
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('invalid_response_url');
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });
});

// AC: AC-4 — Immediate 200 ack before async work; worker invoked async
describe('POST / — async acknowledgement', () => {
  it('should_return_200_ack_immediately_when_valid_question_submitted', async () => {
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response_type).toBe('in_channel');
    expect(body.text).toContain('Asking Vyasa');
  });

  it('should_invoke_worker_lambda_with_event_invocation_type_when_valid_question', async () => {
    await handler(makeEvent());

    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    const invokeArg = mockLambdaSend.mock.calls[0][0] as {
      InvocationType: string;
      Payload: Buffer;
    };
    expect(invokeArg.InvocationType).toBe('Event');
    const workerPayload = JSON.parse(invokeArg.Payload.toString());
    expect(workerPayload.question).toBe('Who was Karna?');
    expect(workerPayload.response_url).toBe(
      'https://hooks.slack.com/commands/T123'
    );
  });

  it('should_return_500_when_worker_lambda_arn_is_not_configured', async () => {
    delete process.env.WORKER_LAMBDA_ARN;

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('should_return_500_when_worker_lambda_invocation_fails', async () => {
    mockLambdaSend.mockRejectedValue(new Error('Lambda unreachable'));

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
  });
});

// EDGE-3 — base64-encoded body (Lambda Function URL may send this)
describe('POST / — base64-encoded body', () => {
  it('should_decode_base64_body_and_process_normally_when_is_base64_encoded_is_true', async () => {
    const raw =
      'command=%2Fvyasa&text=Who+was+Karna%3F&response_url=https%3A%2F%2Fhooks.slack.com%2Fcmd&user_id=U1&channel_id=C1&team_id=T1&trigger_id=trig1';
    const encoded = Buffer.from(raw).toString('base64');
    const event = makeEvent({ body: encoded, isBase64Encoded: true });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.text).toContain('Asking Vyasa');
  });

  it('should_treat_null_body_as_empty_string_when_event_body_is_null', async () => {
    const event = makeEvent({
      body: null as unknown as string,
      isBase64Encoded: false,
    });

    // null body → empty rawBody → verifySlackSignature called with '' → returns mocked true
    // but parseSlashPayload gets '' → text is '' → usage hint
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });
});

// Branch coverage — uncovered ??-fallback branches in header reading and URL parsing
describe('POST / — header fallback branches', () => {
  it('should_use_uppercase_X-Slack-Signature_header_when_lowercase_is_absent', async () => {
    const event = makeEvent({
      headers: {
        'X-Slack-Signature': 'v0=uppercase-sig',
        'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      },
    });

    const result = await handler(event);

    // Signature is extracted from uppercase header and passed to verifySlackSignature
    expect(mockVerifySlackSignature).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'v0=uppercase-sig',
      expect.any(String)
    );
    expect(result.statusCode).toBe(200);
  });

  it('should_use_empty_string_when_both_signature_headers_are_absent', async () => {
    const event = makeEvent({ headers: {} });
    mockVerifySlackSignature.mockReturnValue(false);

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  it('should_parse_payload_with_missing_optional_fields_using_empty_string_fallback', async () => {
    // Body missing user_id, channel_id, team_id, trigger_id — tests ?? '' branches in parseSlashPayload
    const event = makeEvent({
      body: 'command=%2Fvyasa&text=Who+was+Karna%3F&response_url=https%3A%2F%2Fhooks.slack.com%2Fcmd',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
  });
});

// Branch coverage — signing secret caching (line 35 true-branch)
describe('POST / — signing secret caching', () => {
  it('should_use_cached_signing_secret_on_second_invocation_without_calling_secrets_manager', async () => {
    // First call populates the cache
    await handler(makeEvent());
    expect(mockSecretsManagerSend).toHaveBeenCalledTimes(1);

    // Second call in same module instance should reuse cache
    await handler(makeEvent());
    // Secrets Manager should NOT be called again — cached branch hit
    expect(mockSecretsManagerSend).toHaveBeenCalledTimes(1);
  });
});

// Branch coverage — SecretString null fallback (line 43: ?? '{}')
describe('POST / — secrets manager null SecretString', () => {
  it('should_parse_empty_object_when_SecretString_is_undefined', async () => {
    // SecretString is undefined → JSON.parse('{}') → signing_secret is undefined → cachedSigningSecret = undefined
    mockSecretsManagerSend.mockResolvedValue({ SecretString: undefined });

    const result = await handler(makeEvent());

    // verifySlackSignature called with undefined secret but mocked to return true
    expect(result.statusCode).toBe(200);
  });
});
