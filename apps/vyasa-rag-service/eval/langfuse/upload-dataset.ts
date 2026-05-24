/**
 * Upload golden dataset to Langfuse
 * One-time setup script for creating dataset and items
 */

import * as fs from 'fs';
import * as path from 'path';
import { initLangfuse, flushLangfuse } from './client';
import { logger } from '../../src/lib/logger';

interface TestCase {
  id: string;
  category: string;
  query: string;
  expected_answer: string;
  expected_citations: string[];
  required_facts: string[];
  difficulty: string;
  tags: string[];
}

interface Dataset {
  version: string;
  description: string;
  test_cases: TestCase[];
  categories?: Record<string, string>;
}

const DATASET_NAME = 'vyasa-mahabharata-qa-v1';

/**
 * Load golden dataset from file
 */
function loadDataset(): Dataset {
  const datasetPath = path.join(__dirname, '../datasets/golden-dataset.json');
  const content = fs.readFileSync(datasetPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Upload dataset to Langfuse
 */
async function uploadDataset(): Promise<void> {
  const langfuse = initLangfuse();
  const dataset = loadDataset();

  logger.info('Starting dataset upload', {
    name: DATASET_NAME,
    items: dataset.test_cases.length,
  });

  // Create dataset (idempotent - safe to re-run)
  try {
    await langfuse.createDataset({
      name: DATASET_NAME,
      description: `${dataset.description} (v${dataset.version})`,
      metadata: {
        version: dataset.version,
        categories: Object.keys(dataset.categories || {}),
      },
    });
    logger.info('Dataset created', { name: DATASET_NAME });
  } catch (error) {
    // Dataset may already exist
    logger.info('Dataset may already exist', { name: DATASET_NAME });
  }

  // Upload items with stable IDs (enables upsert)
  let uploaded = 0;
  let failed = 0;

  for (const testCase of dataset.test_cases) {
    try {
      await langfuse.createDatasetItem({
        datasetName: DATASET_NAME,
        id: testCase.id, // Stable ID for idempotency
        input: testCase.query,
        expectedOutput: testCase.expected_answer,
        metadata: {
          category: testCase.category,
          difficulty: testCase.difficulty,
          required_facts: testCase.required_facts,
          expected_citations: testCase.expected_citations,
          tags: testCase.tags,
        },
      });
      uploaded++;
      logger.debug('Uploaded dataset item', { id: testCase.id });
    } catch (error) {
      failed++;
      logger.error('Failed to upload dataset item', {
        id: testCase.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  await flushLangfuse();

  logger.info('Dataset upload complete', {
    uploaded,
    failed,
    total: dataset.test_cases.length,
  });

  if (failed > 0) {
    process.exit(1);
  }
}

// CLI usage
if (require.main === module) {
  uploadDataset().catch(error => {
    logger.error('Upload failed', { error });
    process.exit(1);
  });
}

export { uploadDataset, DATASET_NAME };
