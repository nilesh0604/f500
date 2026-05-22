/**
 * Evaluation runner for Vyasa RAG
 * Executes golden dataset against the service and generates reports
 */

import * as fs from 'fs';
import * as path from 'path';
import { runAgent, buildChatResponse } from '../src/services/agent';
import { evaluateResponse } from './metrics/evaluator';
import { TestCase, EvaluationResult, Session, Message } from '../src/types';
import { logger } from '../src/lib/logger';

interface Dataset {
  version: string;
  description: string;
  test_cases: TestCase[];
  statistics: {
    total: number;
    by_difficulty: Record<string, number>;
    by_category: Record<string, number>;
  };
}

interface RunConfig {
  datasetPath: string;
  outputPath: string;
  sampleSize?: number;
  categories?: string[];
  difficulties?: string[];
}

interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScore: number;
  avgLatency: number;
  byCategory: Record<
    string,
    { total: number; passed: number; avgScore: number }
  >;
  byDifficulty: Record<
    string,
    { total: number; passed: number; avgScore: number }
  >;
}

/**
 * Load golden dataset
 */
function loadDataset(datasetPath: string): Dataset {
  const content = fs.readFileSync(datasetPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Filter test cases based on config
 */
function filterTestCases(cases: TestCase[], config: RunConfig): TestCase[] {
  let filtered = [...cases];

  if (config.categories && config.categories.length > 0) {
    filtered = filtered.filter(tc => config.categories!.includes(tc.category));
  }

  if (config.difficulties && config.difficulties.length > 0) {
    filtered = filtered.filter(tc =>
      config.difficulties!.includes(tc.difficulty)
    );
  }

  if (config.sampleSize && config.sampleSize < filtered.length) {
    // Stratified sampling - ensure representation from each category
    const byCategory: Record<string, TestCase[]> = {};
    for (const tc of filtered) {
      if (!byCategory[tc.category]) byCategory[tc.category] = [];
      byCategory[tc.category].push(tc);
    }

    const perCategory = Math.floor(
      config.sampleSize / Object.keys(byCategory).length
    );
    filtered = [];

    for (const cases of Object.values(byCategory)) {
      const shuffled = cases.sort(() => 0.5 - Math.random());
      filtered.push(...shuffled.slice(0, perCategory));
    }

    // Fill remaining if needed
    while (filtered.length < config.sampleSize) {
      const remaining = cases.filter(tc => !filtered.includes(tc));
      if (remaining.length === 0) break;
      filtered.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }
  }

  return filtered;
}

/**
 * Execute a single test case
 */
async function executeTest(testCase: TestCase): Promise<EvaluationResult> {
  const startTime = Date.now();

  try {
    // Create empty session for test
    const sessionMessages: Message[] = [];

    // Run the agent
    const agentResult = await runAgent(
      testCase.query,
      sessionMessages,
      `eval-${testCase.id}`
    );

    // Build response
    const response = buildChatResponse(
      `eval-session-${testCase.id}`,
      agentResult
    );

    const latencyMs = Date.now() - startTime;

    // Evaluate
    return evaluateResponse(testCase, response, latencyMs, agentResult.trace);
  } catch (error) {
    logger.error(`Test ${testCase.id} failed`, { error });

    // Return failed result
    return {
      testId: testCase.id,
      query: testCase.query,
      expectedAnswer: testCase.expected_answer,
      actualAnswer:
        'ERROR: ' + (error instanceof Error ? error.message : 'Unknown error'),
      metrics: {
        latencyMs: Date.now() - startTime,
        tokensUsed: 0,
        iterationsUsed: 0,
        accuracy: 0,
        completeness: 0,
      },
      overallScore: 0,
      passed: false,
      citations: [],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate summary statistics
 */
function calculateSummary(results: EvaluationResult[]): RunSummary {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = total > 0 ? passed / total : 0;
  const avgScore =
    total > 0 ? results.reduce((sum, r) => sum + r.overallScore, 0) / total : 0;
  const avgLatency =
    total > 0
      ? results.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / total
      : 0;

  // By category
  const byCategory: RunSummary['byCategory'] = {};
  for (const result of results) {
    // Get category from original test case (not stored in result, would need to look up)
    // For now, group by simple categorization
    const category = result.testId.includes('edge') ? 'edge_cases' : 'general';
    if (!byCategory[category]) {
      byCategory[category] = { total: 0, passed: 0, avgScore: 0 };
    }
    byCategory[category].total++;
    if (result.passed) byCategory[category].passed++;
    byCategory[category].avgScore += result.overallScore;
  }

  // Calculate averages
  for (const cat of Object.values(byCategory)) {
    cat.avgScore = cat.total > 0 ? cat.avgScore / cat.total : 0;
  }

  // By difficulty
  const byDifficulty: RunSummary['byDifficulty'] = {};
  for (const result of results) {
    const difficulty = result.passed ? 'passed' : 'failed';
    if (!byDifficulty[difficulty]) {
      byDifficulty[difficulty] = { total: 0, passed: 0, avgScore: 0 };
    }
    byDifficulty[difficulty].total++;
    if (result.passed) byDifficulty[difficulty].passed++;
    byDifficulty[difficulty].avgScore += result.overallScore;
  }

  for (const diff of Object.values(byDifficulty)) {
    diff.avgScore = diff.total > 0 ? diff.avgScore / diff.total : 0;
  }

  return {
    total,
    passed,
    failed,
    passRate,
    avgScore,
    avgLatency,
    byCategory,
    byDifficulty,
  };
}

/**
 * Generate HTML report
 */
function generateHtmlReport(
  results: EvaluationResult[],
  summary: RunSummary
): string {
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;

  return `<!DOCTYPE html>
<html>
<head>
  <title>Vyasa RAG Evaluation Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    h1, h2 { color: #333; }
    .summary { background: #f5f5f5; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .metric { display: inline-block; margin: 0.5rem 1rem; }
    .metric-value { font-size: 2rem; font-weight: bold; color: #2563eb; }
    .metric-label { font-size: 0.9rem; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f9fafb; font-weight: 600; }
    .pass { color: #059669; }
    .fail { color: #dc2626; }
    .score-high { color: #059669; }
    .score-medium { color: #d97706; }
    .score-low { color: #dc2626; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Vyasa RAG Evaluation Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="summary">
    <h2>Summary</h2>
    <div class="metric">
      <div class="metric-value">${(summary.passRate * 100).toFixed(1)}%</div>
      <div class="metric-label">Pass Rate</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.avgScore.toFixed(2)}</div>
      <div class="metric-label">Avg Score</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.total}</div>
      <div class="metric-label">Total Tests</div>
    </div>
    <div class="metric">
      <div class="metric-value ${passedCount === summary.total ? 'pass' : ''}">${passedCount}</div>
      <div class="metric-label">Passed</div>
    </div>
    <div class="metric">
      <div class="metric-value ${failedCount > 0 ? 'fail' : ''}">${failedCount}</div>
      <div class="metric-label">Failed</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.avgLatency.toFixed(0)}ms</div>
      <div class="metric-label">Avg Latency</div>
    </div>
  </div>

  <h2>Detailed Results</h2>
  <table>
    <thead>
      <tr>
        <th>Test ID</th>
        <th>Query</th>
        <th>Status</th>
        <th>Score</th>
        <th>Accuracy</th>
        <th>Citations</th>
        <th>Latency</th>
      </tr>
    </thead>
    <tbody>
      ${results
        .map(
          r => `
        <tr>
          <td>${r.testId}</td>
          <td>${r.query.substring(0, 50)}...</td>
          <td class="${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'}</td>
          <td class="${r.overallScore > 0.8 ? 'score-high' : r.overallScore > 0.6 ? 'score-medium' : 'score-low'}">${r.overallScore.toFixed(2)}</td>
          <td>${(r.metrics.accuracy || 0).toFixed(2)}</td>
          <td>${r.citations.length}</td>
          <td>${r.metrics.latencyMs}ms</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <h2>Failed Tests</h2>
  ${
    results
      .filter(r => !r.passed)
      .map(
        r => `
    <div style="margin: 1rem 0; padding: 1rem; border: 1px solid #e5e5e5; border-radius: 8px;">
      <h3>${r.testId}: ${r.query}</h3>
      <p><strong>Expected:</strong> ${r.expectedAnswer}</p>
      <p><strong>Actual:</strong> ${r.actualAnswer.substring(0, 200)}...</p>
      <p><strong>Score:</strong> ${r.overallScore.toFixed(2)} | 
         <strong>Accuracy:</strong> ${(r.metrics.accuracy || 0).toFixed(2)} | 
         <strong>Completeness:</strong> ${(r.metrics.completeness || 0).toFixed(2)}</p>
    </div>
  `
      )
      .join('') || '<p>No failed tests!</p>'
  }
</body>
</html>`;
}

/**
 * Run evaluation
 */
export async function runEvaluation(config: RunConfig): Promise<void> {
  logger.info('Starting evaluation', { config });

  // Load dataset
  const dataset = loadDataset(config.datasetPath);
  logger.info(`Loaded dataset with ${dataset.test_cases.length} test cases`);

  // Filter test cases
  const testCases = filterTestCases(dataset.test_cases, config);
  logger.info(`Running ${testCases.length} test cases`);

  // Execute tests
  const results: EvaluationResult[] = [];
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    logger.info(`Running test ${i + 1}/${testCases.length}: ${testCase.id}`);

    const result = await executeTest(testCase);
    results.push(result);

    // Small delay to avoid rate limiting
    if (i < testCases.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Calculate summary
  const summary = calculateSummary(results);

  // Save results
  const outputDir = path.dirname(config.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // JSON report
  const jsonReport = {
    timestamp: new Date().toISOString(),
    config,
    summary,
    results,
  };
  fs.writeFileSync(config.outputPath, JSON.stringify(jsonReport, null, 2));

  // HTML report
  const htmlPath = config.outputPath.replace('.json', '.html');
  fs.writeFileSync(htmlPath, generateHtmlReport(results, summary));

  logger.info('Evaluation complete', {
    total: summary.total,
    passed: summary.passed,
    passRate: summary.passRate,
    outputPath: config.outputPath,
    htmlPath,
  });

  // Print summary to console
  console.log('\n=== EVALUATION SUMMARY ===');
  console.log(`Total Tests: ${summary.total}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`);
  console.log(`Avg Score: ${summary.avgScore.toFixed(2)}`);
  console.log(`Avg Latency: ${summary.avgLatency.toFixed(0)}ms`);
  console.log(`\nReports saved to:`);
  console.log(`  JSON: ${config.outputPath}`);
  console.log(`  HTML: ${htmlPath}`);
  console.log('========================\n');
}

// CLI usage
if (require.main === module) {
  const config: RunConfig = {
    datasetPath: process.argv[2] || './eval/datasets/golden-dataset.json',
    outputPath: process.argv[3] || './eval/reports/eval-results.json',
    sampleSize: process.env.SAMPLE_SIZE
      ? parseInt(process.env.SAMPLE_SIZE, 10)
      : undefined,
  };

  runEvaluation(config).catch(error => {
    console.error('Evaluation failed:', error);
    process.exit(1);
  });
}
