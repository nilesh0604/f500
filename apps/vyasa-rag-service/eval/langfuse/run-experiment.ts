/**
 * Run Langfuse experiment for RAG evaluation
 * Executes dataset against live API and captures baseline scores
 */

import { initLangfuse, flushLangfuse } from './client';
import { runRagTaskForExperiment } from './task-adapter';
import { DATASET_NAME } from './upload-dataset';
import { logger } from '../../src/lib/logger';
import { calculateAnswerRelevance } from './answer-relevance';

interface ExperimentConfig {
  datasetName: string;
  runName?: string;
  description?: string;
  limit?: number;
}

/**
 * Run evaluation experiment against live API
 */
async function runExperiment(config: ExperimentConfig): Promise<void> {
  const runName =
    config.runName || `rag-eval-${new Date().toISOString().split('T')[0]}`;
  const description =
    config.description || 'RAG quality evaluation against live API';

  logger.info('Starting experiment', {
    dataset: config.datasetName,
    runName,
    description,
  });

  try {
    const langfuse = initLangfuse();

    // Fetch dataset
    const dataset = await langfuse.getDataset(config.datasetName);
    let items = await dataset.items;

    logger.info('Loaded dataset items', {
      count: items.length,
      dataset: config.datasetName,
    });

    // Apply limit if specified
    if (config.limit && config.limit < items.length) {
      items = items.slice(0, config.limit);
      logger.info('Limited to subset of items', { limit: config.limit });
    }

    // Run experiment
    logger.info('Executing experiment runs', { itemCount: items.length });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(`Running ${i + 1}/${items.length}: ${item.id}`);

      try {
        // Create a trace for this dataset item
        const trace = langfuse.trace({
          name: `rag-eval-${item.id}`,
          metadata: {
            runName,
            dataset: config.datasetName,
            itemId: item.id,
            itemIndex: i,
            totalItems: items.length,
          },
          sessionId: runName,
        });

        // Run the task
        const result = await runRagTaskForExperiment({
          id: item.id,
          input: item.input as string,
          expectedOutput: item.expectedOutput as string | undefined,
          metadata: item.metadata as Record<string, unknown> | undefined,
        });

        // Add generation observation to trace
        trace.generation({
          name: 'rag-response',
          input: item.input,
          output: result.output,
          metadata: {
            citations: result.citations,
            ...result.metadata,
          },
        });

        // Update trace with run info
        trace.update({
          metadata: {
            runName,
            runDescription: description,
            dataset: config.datasetName,
            itemIndex: i,
            totalItems: items.length,
          },
        });

        // Post corrected Answer Relevance score (1 - noncommittal).
        // The Langfuse LLM eval job stores raw noncommittal flag (0=committal,
        // 1=noncommittal) as "Answer Relevance", which is inverted.
        // This corrected score maps committal answers to 1 (high relevance).
        const answerRelevance = calculateAnswerRelevance(
          result.output,
          item.input as string
        );
        langfuse.score({
          traceId: trace.id,
          name: 'Answer Relevance',
          value: answerRelevance,
          comment:
            'Corrected score: 1 = committal/relevant, 0 = noncommittal.' +
            ' Fixes inverted Langfuse LLM eval job rubric.',
        });

        // Link trace to dataset item
        await item.link(trace, runName);

        // Small delay to avoid rate limiting
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        logger.error(`Failed to run item ${item.id}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with next item
      }
    }

    await flushLangfuse();

    logger.info('Experiment complete', {
      runName,
      dataset: config.datasetName,
      itemsProcessed: items.length,
    });

    console.log('\n=== EXPERIMENT COMPLETE ===');
    console.log(`Run Name: ${runName}`);
    console.log(`Dataset: ${config.datasetName}`);
    console.log(`Items: ${items.length}`);
    console.log(`\nView results in Langfuse UI:`);
    const host = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';
    console.log(`  ${host}/datasets/${config.datasetName}`);
    console.log('========================\n');
  } catch (error) {
    logger.error('Experiment failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1], 10)
    : undefined;
  const smokeTest = args.includes('--smoke');

  const config: ExperimentConfig = {
    datasetName: DATASET_NAME,
    runName: `rag-baseline-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
    description: smokeTest
      ? 'Smoke test - 3 items'
      : 'Baseline evaluation against live API',
    limit: smokeTest ? 3 : limit,
  };

  runExperiment(config).catch(error => {
    logger.error('Experiment failed', { error });
    process.exit(1);
  });
}

export { runExperiment };
