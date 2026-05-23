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
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { RAGResult, RetrievalResult, Citation, TokenUsage } from '../types';
import { logger } from '../lib/logger';
import { traceFunction } from '../lib/tracer';
import { bedrockCircuitBreaker } from '../lib/circuit-breaker';

const agentRuntimeClient = new BedrockAgentRuntimeClient({});
const runtimeClient = new BedrockRuntimeClient({});

const KB_ID = process.env.BEDROCK_KB_ID || '';

interface BedrockUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

const MODEL_ARN =
  process.env.BEDROCK_MODEL_ARN ||
  'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0';

const MODEL_ID = MODEL_ARN.replace(/^arn:aws:bedrock:[^:]+::[^/]+\//, '');

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
              source: String(
                result.metadata?.['x-amz-bedrock-kb-source-uri'] || 'unknown'
              ),
              book: String(result.metadata?.['book'] || ''),
              chapter: String(result.metadata?.['chapter'] || ''),
              verse: String(result.metadata?.['verse'] || ''),
              page: result.metadata?.['page']
                ? parseInt(String(result.metadata['page']), 10)
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
            book:
              citation.retrievedReferences?.[0]?.metadata?.['book'] != null
                ? String(citation.retrievedReferences[0].metadata!['book'])
                : undefined,
            chapter:
              citation.retrievedReferences?.[0]?.metadata?.['chapter'] != null
                ? String(citation.retrievedReferences[0].metadata!['chapter'])
                : undefined,
          })) || [];

        // Extract token usage from response metadata or estimate
        const usage = (response as unknown as { usage?: BedrockUsage }).usage;
        const tokenUsage: TokenUsage = {
          prompt_tokens: usage?.inputTokens ?? 0,
          completion_tokens: usage?.outputTokens ?? 0,
          total_tokens: usage?.totalTokens ?? 0,
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

        const command = new ConverseCommand({
          modelId: MODEL_ID,
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
          ...(systemPrompt && {
            system: [{ text: systemPrompt }],
          }),
          inferenceConfig: { maxTokens: 2048 },
        });

        const response = await runtimeClient.send(command);
        const text =
          response.output?.message?.content
            ?.map(b => ('text' in b ? b.text : ''))
            .join('') || '';

        const tokenUsage: TokenUsage = {
          prompt_tokens: response.usage?.inputTokens || 0,
          completion_tokens: response.usage?.outputTokens || 0,
          total_tokens:
            (response.usage?.inputTokens || 0) +
            (response.usage?.outputTokens || 0),
        };

        return { text, tokenUsage };
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

  const command = new ConverseStreamCommand({
    modelId: MODEL_ID,
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    ...(systemPrompt && {
      system: [{ text: systemPrompt }],
    }),
    inferenceConfig: { maxTokens: 2048 },
  });

  const response = await runtimeClient.send(command);
  let inputTokens = 0;
  let outputTokens = 0;

  if (response.stream) {
    for await (const event of response.stream) {
      if (event.contentBlockDelta?.delta?.text) {
        yield event.contentBlockDelta.delta.text;
      }
      if (event.metadata?.usage) {
        inputTokens = event.metadata.usage.inputTokens || 0;
        outputTokens = event.metadata.usage.outputTokens || 0;
      }
    }
  }

  return {
    tokenUsage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}
