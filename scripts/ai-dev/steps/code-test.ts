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

export async function codeTestCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running code tests for ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'code-test');

    // Get the code-test subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'code-test'
    );
    if (!subtaskKey) {
      throw new Error('Code test subtask not found. Did you run init?');
    }

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress');

    // Get agent config
    const agentConfig = config.agents['code-test'];
    if (!agentConfig) {
      throw new Error('Code test agent not found in config');
    }

    // Read design and implementation for context
    const featureDirPath = featureDir(ctx.repoRoot, ctx.ticketId);
    const requirementsPath = join(featureDirPath, 'requirements.md');
    const designPath = join(featureDirPath, 'design.md');
    const tddPath = join(featureDirPath, 'TDD.md');
    const implPath = join(featureDirPath, 'implementation.md');
    const implChecklistPath = join(featureDirPath, 'IMPL_CHECKLIST.md');

    const requirements = await readFileIfExists(requirementsPath);
    const design = await readFileIfExists(designPath);
    const tdd = await readFileIfExists(tddPath);
    const implementation = await readFileIfExists(implPath);
    const implChecklist = await readFileIfExists(implChecklistPath);

    if (!implementation) {
      throw new Error(
        'Implementation document not found. Did you run code-impl step?'
      );
    }

    // Get changed files from git
    const { Shell } = await import('../core/shell.js');
    let changedFiles = '';

    // Try to get changed files from last commit
    const gitResult = Shell.exec(
      `git diff --name-only HEAD~1..HEAD -- "apps/*/src/**" "libs/*/src/**" 2>/dev/null | head -20`,
      { cwd: ctx.repoRoot, silent: true }
    );
    if (gitResult.exitCode === 0 && gitResult.stdout.trim()) {
      changedFiles = gitResult.stdout.trim();
    } else {
      // Fall back to untracked files in the feature directory
      const untrackedResult = Shell.exec(
        `git ls-files --others --exclude-standard "${featureDirPath}/" 2>/dev/null | head -20`,
        { cwd: ctx.repoRoot, silent: true }
      );
      changedFiles = untrackedResult.stdout.trim();
    }

    // Get ticket info
    const ticket = await jira.getIssue(ctx.ticketId);

    // Prepare variables for the agent
    const variables = {
      TICKET_ID: ctx.ticketId,
      TICKET_SUMMARY: ticket.fields.summary,
      REQUIREMENTS_PATH: requirementsPath,
      REQUIREMENTS: requirements || '',
      TDD_PATH: tddPath,
      TDD: tdd || '',
      IMPL_CHECKLIST_PATH: implChecklistPath,
      IMPL_CHECKLIST: implChecklist || '',
      IMPLEMENTATION: implementation,
      CHANGED_FILES: changedFiles,
      FEATURE_DIR: featureDirPath,
      REPO_ROOT: ctx.repoRoot,
    };

    // Run the code test agent
    Logger.info('Running test generation...');
    const result = await runAgent(ctx, agentConfig, variables);
    const output = result.summary;

    // Save test output
    const testPath = join(config.featureDocsDir, ctx.ticketId, 'tests.md');
    await writeFileWithDir(testPath, output);
    Logger.success(`Test documentation saved to: ${testPath}`);

    // Extract test files created
    const testFiles = extractTestFiles(output);

    // Run tests if they exist
    let testResults: any = null;
    if (testFiles.length > 0) {
      testResults = await runTests(ctx.repoRoot);
    }

    // Update Jira with summary
    const comment = `h2. Tests Created

Test suite has been created for the implementation.

h3. Test Files Created:
${testFiles.length > 0 ? testFiles.map(f => `* ${f}`).join('\n') : '* No test files created'}

h3. Test Results:
${testResults ? formatTestResults(testResults) : '* Tests not run'}

h3. Coverage:
${testResults && testResults.coverage ? `* Coverage: ${testResults.coverage}%` : '* Coverage not measured'}

h3. Next Steps:
# Review and run tests locally
# Fix any failing tests
# Run: {code}ai-dev ${ctx.ticketId} code-quality{code} for quality checks

h3. Files:
* Tests: [tests.md|${testPath.replace(ctx.repoRoot + '/', '')}]
* Implementation: [implementation.md|${implPath.replace(ctx.repoRoot + '/', '')}]`;

    await jira.addComment(subtaskKey, comment);

    // Upload test file as attachment
    await jira.uploadAttachment(subtaskKey, testPath);

    // Commit and push test files
    if (testFiles.length > 0) {
      const commitMsg = `test(${ctx.ticketId}): Add tests for ${ticket.fields.summary}`;
      const hasChanges = commitAndPush(commitMsg);
      if (hasChanges) {
        Logger.success('Test files committed and pushed');
      }
    }

    // Save test results
    if (testResults) {
      const resultsPath = join(
        config.featureDocsDir,
        ctx.ticketId,
        'test-results.json'
      );
      await writeFileWithDir(resultsPath, JSON.stringify(testResults, null, 2));
    }

    // Transition to Done if not in code alias mode
    if (!ctx.codeAliasMode) {
      await jira.transitionTo(subtaskKey, 'Done');
    }

    Logger.success('Code test step completed');

    if (!ctx.codeAliasMode) {
      console.log(
        `
Next command:
  ai-dev ${ctx.ticketId} code-quality
      `.trim()
      );
    }
  } catch (error) {
    Logger.error(`Code test step failed: ${error}`);
    throw error;
  }
}

function extractTestFiles(output: string): string[] {
  const testFiles: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Look for test file patterns
    const patterns = [
      /Created test:\s*(.+)$/,
      /Test file:\s*(.+)$/,
      /`([^`]+\.(test|spec)\.(ts|js|tsx|jsx))`/,
      /`([^`]+\/__tests__\/[^`]+)`/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const file = match[1].trim();
        if (file && !testFiles.includes(file)) {
          testFiles.push(file);
        }
      }
    }
  }

  return testFiles;
}

async function runTests(repoRoot: string): Promise<any> {
  const { Shell } = await import('../core/shell.js');

  try {
    // Try npm test first
    const result = Shell.exec(
      'npm test -- --json --outputFile=test-results.json',
      {
        cwd: repoRoot,
        silent: true,
      }
    );

    if (result.exitCode === 0) {
      // Try to parse test results
      try {
        const fs = await import('fs/promises');
        const resultsPath = join(repoRoot, 'test-results.json');
        const results = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
        return {
          success: true,
          total: results.numTotalTests || 0,
          passed: results.numPassedTests || 0,
          failed: results.numFailedTests || 0,
          coverage: results.coverageMap?.total?.lines?.pct || null,
        };
      } catch {
        // Fall back to parsing stdout
        const stdout = result.stdout;
        const match = stdout.match(/(\d+)\s+passing,\s+(\d+)\s+failing/);
        if (match) {
          return {
            success: true,
            total: parseInt(match[1], 10) + parseInt(match[2], 10),
            passed: parseInt(match[1], 10),
            failed: parseInt(match[2], 10),
            coverage: null,
          };
        }
      }
    }

    // If npm test failed, try jest directly
    const jestResult = Shell.exec('npx jest --passWithNoTests --json', {
      cwd: repoRoot,
      silent: true,
    });

    if (jestResult.exitCode === 0) {
      const jestOutput = JSON.parse(jestResult.stdout);
      return {
        success: true,
        total: jestOutput.numTotalTests,
        passed: jestOutput.numPassedTests,
        failed: jestOutput.numFailedTests,
        coverage: jestOutput.coverageMap?.total?.lines?.pct || null,
      };
    }

    return {
      success: false,
      error: result.stderr || jestResult.stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatTestResults(results: any): string {
  if (!results.success) {
    return `* Tests failed: ${results.error}`;
  }

  if (results.total === 0) {
    return '* No tests found';
  }

  const status = results.failed > 0 ? '❌' : '✅';
  return `${status} ${results.passed}/${results.total} tests passing`;
}
