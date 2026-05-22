/**
 * ReAct Agent Controller
 * Orchestrates the agentic RAG flow
 */

import {
  AgentResult,
  AgentStep,
  RetrievalResult,
  ChatResponse,
  TokenUsage,
  Message,
} from '../types';
import { retrieve, generate } from './bedrock-client';
import { decomposeQuery, reformulateQuery } from './query-planner';
import { assembleContext, mergeContexts } from './context-assembler';
import { extractCitations, mergeCitations } from './citation-extractor';
import { checkSufficiency, evaluateAnswer } from './reflection';
import { getSystemPrompt, getAgentPrompt } from './prompt-manager';
import { logger, logAgentStep } from '../lib/logger';
import { traceAgentStep } from '../lib/tracer';

const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '3', 10);

/**
 * Run the ReAct agent loop
 */
export async function runAgent(
  query: string,
  sessionMessages: Message[],
  correlationId: string
): Promise<AgentResult> {
  const trace: AgentStep[] = [];
  const allRetrievedResults: RetrievalResult[] = [];
  const allCitations: import('../types').Citation[][] = [];

  let totalTokenUsage: TokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  const requestLogger = logger.child({ correlationId });

  // Step 1: Initial thought - analyze query
  const thought1 = `Analyzing query: "${query}"`;
  trace.push({
    step: 1,
    type: 'thought',
    content: thought1,
    timestamp: new Date().toISOString(),
  });
  logAgentStep(requestLogger, 1, 'thought', thought1);

  // Step 2: Decompose query if needed
  const decomposition = await decomposeQuery(query);
  const subQueries = decomposition.subQueries;

  const action1 = `Decomposed into ${subQueries.length} sub-queries: ${subQueries.join(', ')}`;
  trace.push({
    step: 2,
    type: 'action',
    content: action1,
    tool: 'query-planner',
    tool_input: JSON.stringify(subQueries),
    timestamp: new Date().toISOString(),
  });
  logAgentStep(requestLogger, 2, 'action', action1, { subQueries });

  // Step 3-5: Iterative retrieval loop (max 3 iterations)
  let iteration = 0;
  let contexts: string[] = [];

  while (iteration < MAX_ITERATIONS && iteration < subQueries.length) {
    const currentQuery = subQueries[iteration];

    // Action: Retrieve
    const retrieveAction = `Retrieving context for: "${currentQuery}"`;
    trace.push({
      step: 3 + iteration * 2,
      type: 'action',
      content: retrieveAction,
      tool: 'retrieve',
      tool_input: currentQuery,
      timestamp: new Date().toISOString(),
    });
    logAgentStep(requestLogger, 3 + iteration * 2, 'action', retrieveAction);

    // Retrieve from KB
    const results = await retrieve(currentQuery);
    allRetrievedResults.push(...results);

    // Observation: Retrieved results
    const observation = `Retrieved ${results.length} documents`;
    trace.push({
      step: 4 + iteration * 2,
      type: 'observation',
      content: observation,
      timestamp: new Date().toISOString(),
    });
    logAgentStep(requestLogger, 4 + iteration * 2, 'observation', observation, {
      count: results.length,
    });

    // Assemble context for this iteration
    const { context } = assembleContext(results);
    if (context) {
      contexts.push(context);
      const citations = extractCitations(results);
      allCitations.push(citations);
    }

    iteration++;

    // Check if we have enough context
    if (iteration < MAX_ITERATIONS && iteration < subQueries.length) {
      const mergedContext = mergeContexts(contexts);
      const sufficiency = await checkSufficiency(query, mergedContext);

      if (sufficiency.sufficient) {
        const thoughtSufficient = `Context is sufficient (confidence: ${sufficiency.confidence})`;
        trace.push({
          step: 3 + iteration * 2,
          type: 'thought',
          content: thoughtSufficient,
          timestamp: new Date().toISOString(),
        });
        logAgentStep(
          requestLogger,
          3 + iteration * 2,
          'thought',
          thoughtSufficient
        );
        break;
      }
    }
  }

  // Step 6: Generate answer
  const finalContext = mergeContexts(contexts);
  const systemPrompt = await getSystemPrompt();
  const agentPrompt = await getAgentPrompt();

  const chatHistory = sessionMessages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const generationPrompt = `${agentPrompt}

Chat History:
${chatHistory}

Retrieved Context:
${finalContext}

Question: ${query}

Answer based on the context above. Cite sources using [Source: Title] format.`;

  const generationAction = 'Generating answer from retrieved context';
  trace.push({
    step: 3 + iteration * 2,
    type: 'action',
    content: generationAction,
    tool: 'generate',
    tool_input: 'answer generation',
    timestamp: new Date().toISOString(),
  });
  logAgentStep(requestLogger, 3 + iteration * 2, 'action', generationAction);

  const { text: answer, tokenUsage: genTokenUsage } = await generate(
    generationPrompt,
    systemPrompt
  );

  totalTokenUsage.prompt_tokens += genTokenUsage.prompt_tokens;
  totalTokenUsage.completion_tokens += genTokenUsage.completion_tokens;
  totalTokenUsage.total_tokens += genTokenUsage.total_tokens;

  // Step 7: Self-reflection
  const quality = await evaluateAnswer(query, answer, finalContext);

  const reflectionContent = `Answer quality: ${
    quality.complete ? 'complete' : 'incomplete'
  }, ${quality.accurate ? 'accurate' : 'needs review'} (confidence: ${quality.confidence})`;

  trace.push({
    step: 4 + iteration * 2,
    type: 'reflection',
    content: reflectionContent,
    timestamp: new Date().toISOString(),
  });
  logAgentStep(
    requestLogger,
    4 + iteration * 2,
    'reflection',
    reflectionContent,
    {
      complete: quality.complete,
      accurate: quality.accurate,
      confidence: quality.confidence,
    }
  );

  // Merge all citations
  const finalCitations = mergeCitations(allCitations);

  requestLogger.info('Agent execution complete', {
    iterations: iteration,
    totalRetrieved: allRetrievedResults.length,
    citations: finalCitations.length,
    tokenUsage: totalTokenUsage,
  });

  return {
    answer,
    citations: finalCitations,
    tokenUsage: totalTokenUsage,
    trace,
    iterations: iteration,
  };
}

/**
 * Build ChatResponse from agent result
 */
export function buildChatResponse(
  sessionId: string,
  agentResult: AgentResult
): ChatResponse {
  return {
    session_id: sessionId,
    response: agentResult.answer,
    citations: agentResult.citations,
    token_usage: agentResult.tokenUsage,
    agent_trace: agentResult.trace,
  };
}
