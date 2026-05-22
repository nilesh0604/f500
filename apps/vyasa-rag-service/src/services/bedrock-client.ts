/**
 * Bedrock Knowledge Base and LLM client
 * Handles retrieval and generation with AWS Bedrock
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { RAGResult, RetrievalResult, Citation, TokenUsage } from '../types';
import { logger } from '../lib/logger';
import { traceFunction } from '../lib/tracer';
import { bedrockCircuitBreaker } from '../lib/circuit-breaker';

const agentRuntimeClient = new BedrockAgentRuntimeClient({});
const runtimeClient = new BedrockRuntimeClient({});

const KB_ID = process.env.BEDROCK_KB_ID || '';
const MODEL_ARN =
  process.env.BEDROCK_MODEL_ARN ||
  'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0';

/**
 * Retrieve documents from Bedrock Knowledge Base
 */
export async function retrieve(query: string): Promise<RetrievalResult[]> {
  return traceFunction(
    'bedrock-retrieve',
    async () => {
      return bedrockCircuitBreaker.execute(async () => {
        logger.debug('Retrieving from KB', { query: query.slice(0, 100) });

        const command = new RetrieveCommand({
          knowledgeBaseId: KB_ID,
          retrievalQuery: { text: query },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5,
            },
          },
        });

        const response = await agentRuntimeClient.send(command);

        const results: RetrievalResult[] =
          response.retrievalResults?.map(result => ({
            content: result.content?.text || '',
            metadata: {
              source:
                result.metadata?.['x-amz-bedrock-kb-source-uri'] || 'unknown',
              book: result.metadata?.['book'],
              chapter: result.metadata?.['chapter'],
              verse: result.metadata?.['verse'],
              page: result.metadata?.['page']
                ? parseInt(result.metadata['page'], 10)
                : undefined,
            },
            score: result.score || 0,
          })) || [];

        logger.debug('Retrieved results', { count: results.length });
        return results;
      });
    },
    { queryLength: query.length }
  );
}

/**
 * Retrieve and generate in single call
 */
export async function retrieveAndGenerate(
  query: string,
  sessionId?: string
): Promise<RAGResult> {
  return traceFunction(
    'bedrock-retrieve-and-generate',
    async () => {
      return bedrockCircuitBreaker.execute(async () => {
        logger.debug('Retrieve and generate', {
          query: query.slice(0, 100),
          sessionId,
        });

        const command = new RetrieveAndGenerateCommand({
          input: { text: query },
          retrieveAndGenerateConfiguration: {
            type: 'KNOWLEDGE_BASE',
            knowledgeBaseConfiguration: {
              knowledgeBaseId: KB_ID,
              modelArn: MODEL_ARN,
              retrievalConfiguration: {
                vectorSearchConfiguration: {
                  numberOfResults: 5,
                },
              },
            },
          },
          ...(sessionId && { sessionId }),
        });

        const response = await agentRuntimeClient.send(command);

        const citations: Citation[] =
          response.citations?.map(citation => ({
            title:
              citation.retrievedReferences?.[0]?.content?.text?.slice(0, 100) ||
              'Unknown',
            book: citation.retrievedReferences?.[0]?.metadata?.['book'],
            chapter: citation.retrievedReferences?.[0]?.metadata?.['chapter'],
          })) || [];

        const tokenUsage: TokenUsage = {
          prompt_tokens: response.sessionAttributes?.['prompt_tokens']
            ? parseInt(response.sessionAttributes['prompt_tokens'], 10)
            : 0,
          completion_tokens: response.sessionAttributes?.['completion_tokens']
            ? parseInt(response.sessionAttributes['completion_tokens'], 10)
            : 0,
          total_tokens: response.sessionAttributes?.['total_tokens']
            ? parseInt(response.sessionAttributes['total_tokens'], 10)
            : 0,
        };

        return {
          answer: response.output?.text || '',
          citations,
          context: '',
          tokenUsage,
          retrievedResults: [],
        };
      });
    },
    { queryLength: query.length, sessionId }
  );
}

/**
 * Generate text using Bedrock LLM
 */
export async function generate(
  prompt: string,
  systemPrompt?: string
): Promise<{ text: string; tokenUsage: TokenUsage }> {
  return traceFunction(
    'bedrock-generate',
    async () => {
      return bedrockCircuitBreaker.execute(async () => {
        logger.debug('Generating text', { promptLength: prompt.length });

        const messages = [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }],
          },
        ];

        const body = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 2048,
          messages,
          ...(systemPrompt && { system: systemPrompt }),
        };

        const command = new InvokeModelCommand({
          modelId: MODEL_ARN.replace(
            'arn:aws:bedrock:us-east-1::foundation-model/',
            ''
          ),
          body: JSON.stringify(body),
          contentType: 'application/json',
        });

        const response = await runtimeClient.send(command);
        const responseBody = JSON.parse(
          new TextDecoder().decode(response.body)
        );

        const tokenUsage: TokenUsage = {
          prompt_tokens: responseBody.usage?.input_tokens || 0,
          completion_tokens: responseBody.usage?.output_tokens || 0,
          total_tokens:
            (responseBody.usage?.input_tokens || 0) +
            (responseBody.usage?.output_tokens || 0),
        };

        return {
          text: responseBody.content?.[0]?.text || '',
          tokenUsage,
        };
      });
    },
    { promptLength: prompt.length }
  );
}

/**
 * Generate with streaming support
 */
export async function* generateStream(
  prompt: string,
  systemPrompt?: string
): AsyncGenerator<string, { tokenUsage: TokenUsage }, unknown> {
  logger.debug('Generating text stream', { promptLength: prompt.length });

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ],
    ...(systemPrompt && { system: systemPrompt }),
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ARN.replace(
      'arn:aws:bedrock:us-east-1::foundation-model/',
      ''
    ),
    body: JSON.stringify(body),
    contentType: 'application/json',
  });

  const response = await runtimeClient.send(command);

  // For non-streaming, just yield the full response
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const text = responseBody.content?.[0]?.text || '';

  // Yield chunks (simulate streaming)
  const chunkSize = 20;
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }

  return {
    tokenUsage: {
      prompt_tokens: responseBody.usage?.input_tokens || 0,
      completion_tokens: responseBody.usage?.output_tokens || 0,
      total_tokens:
        (responseBody.usage?.input_tokens || 0) +
        (responseBody.usage?.output_tokens || 0),
    },
  };
}
