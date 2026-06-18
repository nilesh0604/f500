/**
 * Worker Lambda handler — spec compliance tests.
 * Mocks axios (HTTP) and response-formatter to test observable behaviour only.
 */
import type { SlackWorkerPayload } from '@orderflow/shared-types';
import type { Citation } from '@orderflow/shared-types/rag';

jest.mock('axios');
jest.mock('../lib/logger', () => ({
  createRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));
jest.mock('../lib/response-url-validator');
jest.mock('../lib/response-formatter');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const axios = require('axios') as { post: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateResponseUrl } = require('../lib/response-url-validator') as {
  validateResponseUrl: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { formatRagResponse, buildErrorResponse } =
  require('../lib/response-formatter') as {
    formatRagResponse: jest.Mock;
    buildErrorResponse: jest.Mock;
  };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handler } = require('../handlers/worker') as {
  handler: (event: SlackWorkerPayload) => Promise<void>;
};

const VALID_RESPONSE_URL = 'https://hooks.slack.com/commands/T123/456/abc';

function makePayload(
  overrides: Partial<SlackWorkerPayload> = {}
): SlackWorkerPayload {
  return {
    question: 'Who was Karna?',
    response_url: VALID_RESPONSE_URL,
    correlation_id: 'corr-id-001',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VYASA_API_BASE_URL =
    'https://lkbzhoe1pj.execute-api.us-east-1.amazonaws.com';

  (validateResponseUrl as jest.Mock).mockImplementation(() => undefined);
  (formatRagResponse as jest.Mock).mockReturnValue({
    response_type: 'in_channel',
    replace_original: true,
    text: 'Formatted RAG answer',
  });
  (buildErrorResponse as jest.Mock).mockReturnValue({
    response_type: 'ephemeral',
    text: 'Vyasa is temporarily unavailable \u2014 please try again.',
  });
});

afterEach(() => {
  delete process.env.VYASA_API_BASE_URL;
});

// AC: AC-1 — Valid question → RAG answer posted to response_url
describe('handler — successful RAG invocation', () => {
  it('should_post_formatted_rag_answer_to_response_url_when_rag_service_succeeds', async () => {
    const citations: Citation[] = [{ title: 'Adi Parva', book: 'Adi Parva' }];
    const ragData = {
      session_id: 'sess1',
      response: 'Karna was a hero.',
      citations,
    };

    axios.post
      .mockResolvedValueOnce({ data: ragData }) // RAG API call
      .mockResolvedValueOnce({}); // response_url POST

    await handler(makePayload());

    expect(axios.post).toHaveBeenCalledTimes(2);

    // First call: RAG API
    const [ragUrl, ragBody] = (axios.post as jest.Mock).mock.calls[0] as [
      string,
      unknown,
    ];
    expect(ragUrl).toContain('/chat');
    expect((ragBody as { message: string }).message).toBe('Who was Karna?');

    // Second call: Slack response_url with formatted answer
    const [slackUrl, slackBody] = (axios.post as jest.Mock).mock.calls[1] as [
      string,
      { response_type: string },
    ];
    expect(slackUrl).toBe(VALID_RESPONSE_URL);
    expect(slackBody.response_type).toBe('in_channel');
  });
});

// AC: AC-5 — RAG service error → ephemeral error message posted to Slack
describe('handler — RAG service failure', () => {
  it('should_post_ephemeral_error_to_response_url_when_rag_service_throws', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('Connection refused')) // RAG API fails
      .mockResolvedValueOnce({}); // response_url POST succeeds

    await handler(makePayload());

    expect(axios.post).toHaveBeenCalledTimes(2);
    const [, errorBody] = (axios.post as jest.Mock).mock.calls[1] as [
      string,
      { response_type: string },
    ];
    expect(errorBody.response_type).toBe('ephemeral');
  });

  it('should_not_expose_internal_error_details_when_rag_service_fails', async () => {
    axios.post
      .mockRejectedValueOnce(
        new Error('DB connection string: postgres://user:secret@host')
      )
      .mockResolvedValueOnce({});

    await handler(makePayload());

    const [, errorBody] = (axios.post as jest.Mock).mock.calls[1] as [
      string,
      { text: string },
    ];
    expect(errorBody.text).not.toContain('postgres://');
    expect(errorBody.text).not.toContain('secret');
  });

  it('should_gracefully_handle_response_url_post_failure_after_rag_error', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('RAG timeout')) // RAG API fails
      .mockRejectedValueOnce(new Error('Slack 503')); // response_url POST also fails

    // Must not throw — Lambda handler should swallow all errors
    await expect(handler(makePayload())).resolves.toBeUndefined();
  });

  it('should_gracefully_handle_response_url_post_failure_after_rag_success', async () => {
    const ragData = { session_id: 'sess1', response: 'Answer', citations: [] };

    axios.post
      .mockResolvedValueOnce({ data: ragData })
      .mockRejectedValueOnce(new Error('Slack 503'));

    await expect(handler(makePayload())).resolves.toBeUndefined();
  });
});

// Branch: ragData.citations ?? [] — covers when API response omits citations field
describe('handler — RAG response without citations field', () => {
  it('should_use_empty_citations_array_when_rag_response_omits_citations', async () => {
    const ragData = {
      session_id: 'sess1',
      response: 'Answer without citations',
    };

    axios.post
      .mockResolvedValueOnce({ data: ragData })
      .mockResolvedValueOnce({});

    await handler(makePayload());

    expect(formatRagResponse).toHaveBeenCalledWith(
      'Answer without citations',
      []
    );
  });
});

// ERR-PATH — invalid response_url → silently return without making RAG call
describe('handler — invalid response_url', () => {
  it('should_return_without_calling_rag_api_when_response_url_is_invalid', async () => {
    (validateResponseUrl as jest.Mock).mockImplementation(() => {
      throw new Error(
        'Invalid response_url: must originate from https://hooks.slack.com'
      );
    });

    await handler(makePayload({ response_url: 'https://evil.com/steal' }));

    expect(axios.post).not.toHaveBeenCalled();
  });
});
