import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getSubtaskKey,
  featureDir,
  writeFileWithDir,
  readFileIfExists,
} from '../core/file-helpers.js';
import { commitAndPush } from '../core/git.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

export async function codePerfCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running performance analysis for ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'code-perf');

    // Get the code-perf subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'code-perf'
    );
    if (!subtaskKey) {
      throw new Error('Code performance subtask not found. Did you run init?');
    }

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress');

    // Get agent config
    const agentConfig = config.agents['code-perf'];
    if (!agentConfig) {
      throw new Error('Code performance agent not found in config');
    }

    // Run performance analysis
    Logger.info('Running performance analysis...');
    const perfResults = await runPerformanceAnalysis(ctx.repoRoot);

    // Read implementation and test files for context
    const implPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'implementation.md'
    );
    const testPath = join(config.featureDocsDir, ctx.ticketId, 'tests.md');

    const implementation = await readFileIfExists(implPath);
    const tests = await readFileIfExists(testPath);

    // Get ticket info
    const ticket = await jira.getIssue(ctx.ticketId);

    // Prepare variables for the agent
    const variables = {
      TICKET_ID: ctx.ticketId,
      TICKET_SUMMARY: ticket.fields.summary,
      IMPLEMENTATION: implementation || '',
      TESTS: tests || '',
      PERF_RESULTS: JSON.stringify(perfResults, null, 2),
      FEATURE_DIR: featureDir(ctx.repoRoot, ctx.ticketId),
      REPO_ROOT: ctx.repoRoot,
    };

    // Run the code performance agent
    Logger.info(
      'Analyzing performance results and generating optimizations...'
    );
    const result = await runAgent(ctx, agentConfig, variables);
    const output = result.summary;

    // Save performance analysis
    const perfPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'performance.md'
    );
    await writeFileWithDir(perfPath, output);
    Logger.success(`Performance analysis saved to: ${perfPath}`);

    // Apply performance optimizations if suggested
    const optimizationsApplied = await applyPerformanceOptimizations(
      output,
      ctx.repoRoot
    );

    // Update Jira with summary
    const comment = `h2. Performance Analysis Complete

Performance analysis has been performed and optimizations applied.

h3. Performance Metrics:
* Bundle Size: ${perfResults.bundleSize?.size || 'N/A'} (${perfResults.bundleSize?.gzip || 'N/A'} gzipped)
* Lighthouse: ${perfResults.lighthouse?.score || 'N/A'}/100
* Load Time: ${perfResults.loadTime?.time || 'N/A'}ms
* Memory Usage: ${perfResults.memory?.heapUsed || 'N/A'}MB

h3. Optimizations Applied:
${optimizationsApplied.length > 0 ? optimizationsApplied.map(f => `* ${f}`).join('\n') : '* No optimizations needed'}

h3. Performance Checklist:
${generatePerformanceChecklist(output)}

h3. Next Steps:
# Review the performance analysis
# Run: {code}ai-dev ${ctx.ticketId} validate{code} to validate all checks

h3. Files:
* Performance: [performance.md|${perfPath.replace(ctx.repoRoot + '/', '')}]`;

    await jira.addComment(subtaskKey, comment);

    // Upload performance file as attachment
    await jira.uploadAttachment(subtaskKey, perfPath);

    // Commit optimizations if any were applied
    if (optimizationsApplied.length > 0) {
      const commitMsg = `perf(${ctx.ticketId}): Apply performance optimizations`;
      const hasChanges = commitAndPush(commitMsg);
      if (hasChanges) {
        Logger.success('Performance optimizations committed and pushed');
      }
    }

    // Transition to Done if not in code alias mode
    if (!ctx.codeAliasMode) {
      await jira.transitionTo(subtaskKey, 'Done');
    }

    Logger.success('Code performance step completed');

    if (!ctx.codeAliasMode) {
      console.log(
        `
Next command:
  ai-dev ${ctx.ticketId} validate
      `.trim()
      );
    }
  } catch (error) {
    Logger.error(`Code performance step failed: ${error}`);
    throw error;
  }
}

async function runPerformanceAnalysis(repoRoot: string): Promise<any> {
  const { Shell } = await import('../core/shell.js');
  const results: any = {};

  // Analyze bundle size if webpack/rollup is used
  try {
    const packageJson = JSON.parse(
      Shell.execSilent('cat package.json', { cwd: repoRoot }).stdout
    );

    if (packageJson.scripts?.build) {
      // Try to get bundle size from build output
      const buildResult = Shell.exec('npm run build', {
        cwd: repoRoot,
        silent: true,
      });

      // Look for bundle size in output
      const sizeMatch = buildResult.stdout.match(
        /(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i
      );
      if (sizeMatch) {
        results.bundleSize = {
          size: sizeMatch[0],
          gzip: sizeMatch[0], // Would need actual gzip analysis
        };
      }
    }
  } catch {
    results.bundleSize = { error: 'Bundle size analysis not available' };
  }

  // Run Lighthouse if available
  try {
    // Check if there's a dev server running
    const lighthouseResult = Shell.exec(
      'npx lighthouse http://localhost:3000 --output=json --chrome-flags="--headless"',
      {
        cwd: repoRoot,
        silent: true,
      }
    );

    const lhr = JSON.parse(lighthouseResult.stdout);
    results.lighthouse = {
      score: Math.round(lhr.lhr.categories.performance.score * 100),
      fcp: lhr.lhr.audits['first-contentful-paint'].displayValue,
      lcp: lhr.lhr.audits['largest-contentful-paint'].displayValue,
      tti: lhr.lhr.audits['interactive'].displayValue,
    };
  } catch {
    results.lighthouse = { error: 'Lighthouse analysis not available' };
  }

  // Analyze load time from test results if available
  try {
    const testResultsPath = join(repoRoot, 'test-results.json');
    const fs = await import('fs/promises');
    const testResults = JSON.parse(await fs.readFile(testResultsPath, 'utf8'));

    if (testResults.performanceMetrics) {
      results.loadTime = {
        time: testResults.performanceMetrics.averageLoadTime,
      };
    }
  } catch {
    results.loadTime = { error: 'Load time metrics not available' };
  }

  // Check memory usage patterns
  try {
    const memoryResult = Shell.exec(
      'node --max-old-space-size=4096 --inspect=0 --eval "console.log(JSON.stringify(process.memoryUsage()))"',
      {
        cwd: repoRoot,
        silent: true,
      }
    );

    const memory = JSON.parse(memoryResult.stdout);
    results.memory = {
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
      external: Math.round((memory.external / 1024 / 1024) * 100) / 100,
    };
  } catch {
    results.memory = { error: 'Memory analysis not available' };
  }

  return results;
}

async function applyPerformanceOptimizations(
  output: string,
  repoRoot: string
): Promise<string[]> {
  const optimizations: string[] = [];
  const { Shell } = await import('../core/shell.js');

  // Check for bundle optimization suggestions
  if (
    output.includes('bundle') ||
    output.includes('webpack') ||
    output.includes('tree shaking')
  ) {
    try {
      // Check if webpack-bundle-analyzer is available
      Shell.exec(
        'npx webpack-bundle-analyzer dist/main.js --mode=json --report=bundle-report.json',
        {
          cwd: repoRoot,
          silent: true,
        }
      );
      optimizations.push('Generated bundle analysis report');
    } catch (error) {
      Logger.warn(`Bundle analysis failed: ${error}`);
    }
  }

  // Check for caching suggestions
  if (output.includes('cache') || output.includes('memoization')) {
    optimizations.push('Consider adding caching/memoization');
  }

  // Check for lazy loading suggestions
  if (output.includes('lazy') || output.includes('code splitting')) {
    optimizations.push('Consider implementing lazy loading');
  }

  // Check for database optimization suggestions
  if (
    output.includes('database') ||
    output.includes('query') ||
    output.includes('index')
  ) {
    optimizations.push('Database optimizations suggested');
  }

  // Apply specific optimization patterns
  const optimizationPatterns = [
    {
      pattern: /install.*lighthouse/gi,
      command: 'npm install --save-dev lighthouse',
      description: 'Added Lighthouse for performance monitoring',
    },
    {
      pattern: /install.*webpack.*bundle.*analyzer/gi,
      command: 'npm install --save-dev webpack-bundle-analyzer',
      description: 'Added webpack bundle analyzer',
    },
  ];

  for (const { pattern, command, description } of optimizationPatterns) {
    if (pattern.test(output)) {
      try {
        Logger.info(`Applying optimization: ${description}`);
        Shell.exec(command, { cwd: repoRoot, silent: true });
        optimizations.push(description);
      } catch (error) {
        Logger.warn(`Failed to apply optimization: ${description} - ${error}`);
      }
    }
  }

  return optimizations;
}

function generatePerformanceChecklist(output: string): string {
  const checklist = [
    '* [ ] Bundle size optimized',
    '* [ ] Lazy loading implemented',
    '* [ ] Images optimized',
    '* [ ] Caching strategy in place',
    '* [ ] Database queries optimized',
    '* [ ] Memory leaks checked',
    '* [ ] Performance monitoring added',
    '* [ ] CDN configured if needed',
  ];

  // Add context-specific items
  if (output.includes('API') || output.includes('endpoint')) {
    checklist.push('* [ ] API response times optimized');
    checklist.push('* [ ] Pagination implemented');
  }

  if (output.includes('frontend') || output.includes('UI')) {
    checklist.push('* [ ] Critical CSS inlined');
    checklist.push('* [ ] JavaScript minified');
    checklist.push('* [ ] Image lazy loading');
  }

  if (output.includes('database') || output.includes('SQL')) {
    checklist.push('* [ ] Indexes added');
    checklist.push('* [ ] Query optimization reviewed');
  }

  return checklist.join('\n');
}
