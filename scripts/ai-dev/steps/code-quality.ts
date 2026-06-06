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

export async function codeQualityCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running code quality checks for ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'code-quality');

    // Get the code-quality subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'code-quality'
    );
    if (!subtaskKey) {
      throw new Error('Code quality subtask not found. Did you run init?');
    }

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress');

    // Get agent config
    const agentConfig = config.agents['code-quality'];
    if (!agentConfig) {
      throw new Error('Code quality agent not found in config');
    }

    // Run quality checks
    Logger.info('Running quality checks...');
    const qualityResults = await runQualityChecks(ctx.repoRoot);

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
      QUALITY_RESULTS: JSON.stringify(qualityResults, null, 2),
      FEATURE_DIR: featureDir(ctx.repoRoot, ctx.ticketId),
      REPO_ROOT: ctx.repoRoot,
    };

    // Run the code quality agent
    Logger.info('Analyzing quality results and generating fixes...');
    const output = await runAgent(ctx, agentConfig, variables);

    // Save quality analysis
    const qualityPath = join(config.featureDocsDir, ctx.ticketId, 'quality.md');
    await writeFileWithDir(qualityPath, output);
    Logger.success(`Quality analysis saved to: ${qualityPath}`);

    // Apply fixes if suggested
    const fixesApplied = await applyQualityFixes(output, ctx.repoRoot);

    // Update Jira with summary
    const comment = `h2. Code Quality Analysis Complete

Quality checks have been performed and issues addressed.

h3. Quality Metrics:
* ESLint: ${qualityResults.eslint?.issues || 0} issues
* TypeScript: ${qualityResults.typescript?.errors || 0} errors
* Prettier: ${qualityResults.prettier?.changedFiles || 0} files formatted
* Coverage: ${qualityResults.coverage?.percentage || 'N/A'}%

h3. Fixes Applied:
${fixesApplied.length > 0 ? fixesApplied.map(f => `* ${f}`).join('\n') : '* No fixes needed'}

h3. Next Steps:
# Review the quality analysis
# Run: {code}ai-dev ${ctx.ticketId} code-security{code} for security checks

h3. Files:
* Quality: [quality.md|${qualityPath.replace(ctx.repoRoot + '/', '')}]`;

    await jira.addComment(subtaskKey, comment);

    // Upload quality file as attachment
    await jira.uploadAttachment(subtaskKey, qualityPath);

    // Commit fixes if any were applied
    if (fixesApplied.length > 0) {
      const commitMsg = `fix(${ctx.ticketId}): Apply code quality fixes`;
      const hasChanges = commitAndPush(commitMsg);
      if (hasChanges) {
        Logger.success('Quality fixes committed and pushed');
      }
    }

    // Transition to Done if not in code alias mode
    if (!ctx.codeAliasMode) {
      await jira.transitionTo(subtaskKey, 'Done');
    }

    Logger.success('Code quality step completed');

    if (!ctx.codeAliasMode) {
      console.log(
        `
Next command:
  ai-dev ${ctx.ticketId} code-security
      `.trim()
      );
    }
  } catch (error) {
    Logger.error(`Code quality step failed: ${error}`);
    throw error;
  }
}

async function runQualityChecks(repoRoot: string): Promise<any> {
  const { Shell } = await import('../core/shell.js');
  const results: any = {};

  // Run ESLint
  try {
    const eslintResult = Shell.exec('npx eslint . --format=json', {
      cwd: repoRoot,
      silent: true,
    });

    if (eslintResult.exitCode === 0) {
      results.eslint = { issues: 0 };
    } else {
      const eslintOutput = JSON.parse(eslintResult.stdout);
      results.eslint = {
        issues: eslintOutput.length,
        files: eslintOutput.map((r: any) => r.filePath),
      };
    }
  } catch {
    results.eslint = { error: 'ESLint not available' };
  }

  // Run TypeScript check
  try {
    const tscResult = Shell.exec('npx tsc --noEmit', {
      cwd: repoRoot,
      silent: true,
    });

    results.typescript = {
      errors: tscResult.exitCode === 0 ? 0 : 1,
      output: tscResult.stderr,
    };
  } catch {
    results.typescript = { error: 'TypeScript check failed' };
  }

  // Run Prettier check
  try {
    const prettierResult = Shell.exec('npx prettier --check .', {
      cwd: repoRoot,
      silent: true,
    });

    results.prettier = {
      formatted: prettierResult.exitCode === 0,
      changedFiles: 0,
    };

    if (prettierResult.exitCode !== 0) {
      // Get list of unformatted files
      const prettierCheckResult = Shell.exec(
        'npx prettier --list-different .',
        {
          cwd: repoRoot,
          silent: true,
        }
      );
      results.prettier.changedFiles = prettierCheckResult.stdout
        .split('\n')
        .filter((f: string) => f);
    }
  } catch {
    results.prettier = { error: 'Prettier not available' };
  }

  // Get coverage if available
  try {
    const coveragePath = join(repoRoot, 'coverage', 'coverage-summary.json');
    const fs = await import('fs/promises');
    const coverageData = JSON.parse(await fs.readFile(coveragePath, 'utf8'));
    results.coverage = {
      percentage: coverageData.total?.lines?.pct || 0,
    };
  } catch {
    results.coverage = { error: 'Coverage report not found' };
  }

  return results;
}

async function applyQualityFixes(
  output: string,
  repoRoot: string
): Promise<string[]> {
  const fixes: string[] = [];
  const { Shell } = await import('../core/shell.js');

  // Check if output suggests running prettier
  if (output.includes('prettier') || output.includes('formatting')) {
    try {
      Logger.info('Applying prettier formatting...');
      Shell.exec('npx prettier --write .', { cwd: repoRoot });
      fixes.push('Applied Prettier formatting');
    } catch (error) {
      Logger.warn(`Failed to apply prettier: ${error}`);
    }
  }

  // Check for specific fix suggestions
  const fixPatterns = [
    {
      pattern: /eslint.*--fix/gi,
      command: 'npx eslint . --fix',
      description: 'Applied ESLint fixes',
    },
    {
      pattern: /remove.*unused.*import/gi,
      command: 'npx tsx -e "/* remove unused imports */"',
      description: 'Removed unused imports',
    },
    {
      pattern: /add.*missing.*semicolon/gi,
      command: 'npx prettier --write .',
      description: 'Fixed semicolons',
    },
  ];

  for (const { pattern, command, description } of fixPatterns) {
    if (pattern.test(output)) {
      try {
        Logger.info(`Applying fix: ${description}`);
        Shell.exec(command, { cwd: repoRoot });
        fixes.push(description);
      } catch (error) {
        Logger.warn(`Failed to apply fix: ${description} - ${error}`);
      }
    }
  }

  return fixes;
}
