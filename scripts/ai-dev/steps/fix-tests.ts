import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import {
  getSubtaskKey,
  featureDir,
  readFileIfExists,
} from '../core/file-helpers.js';
import { commitAndPush } from '../core/git.js';
import { Shell } from '../core/shell.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

export async function fixTestsCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Fix Tests: ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  const subtaskKey = await getSubtaskKey(
    ctx.repoRoot,
    ctx.ticketId,
    'deploy-pr'
  );
  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'In Progress').catch(() => {});
  }

  const reqPath = join(config.featureDocsDir, ctx.ticketId, 'requirements.md');
  const requirements = await readFileIfExists(reqPath);

  if (!requirements) {
    Logger.warn(
      'Warning: requirements.md not found — agent will run without spec context.'
    );
  }

  const maxAttempts = 2;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    const testResult = Shell.execSilent(
      'npm run test:affected -- --no-coverage',
      ctx.repoRoot
    );
    const hasFailures = /FAIL /.test(testResult.stdout);

    if (!hasFailures) {
      Logger.info('All tests passing.');
      break;
    }

    Logger.info(
      `Attempt ${attempt}/${maxAttempts} — invoking fix-tests agent...`
    );

    const agentConfig = config.agents['fix-tests'];
    if (agentConfig) {
      const variables = {
        TICKET_ID: ctx.ticketId,
        REQUIREMENTS_PATH: reqPath,
        JEST_FAILURES: testResult.stdout,
      };
      await runAgent(ctx, agentConfig, variables);
    }
  }

  const finalResult = Shell.execSilent(
    'npm run test:affected -- --no-coverage',
    ctx.repoRoot
  );
  if (/FAIL /.test(finalResult.stdout)) {
    Logger.error('');
    Logger.error(`Tests still failing after ${maxAttempts} attempt(s).`);
    Logger.error('Cannot auto-fix — manual intervention needed.');
    Logger.error('');

    const failureLines = finalResult.stdout
      .split('\n')
      .filter(line => /FAIL |●/.test(line))
      .slice(0, 20)
      .join('\n');
    console.log(failureLines);
    process.exit(1);
  }

  const hasChanges = commitAndPush(
    `fix: resolve test failures (spec-driven) [${ctx.ticketId}]`
  );

  if (hasChanges) {
    Logger.info('Fix committed and pushed.');
    if (ctx.jira.baseUrl && ctx.jira.email && ctx.jira.apiToken) {
      await jira.addComment(
        ctx.ticketId,
        `Fixed test failures. Pushed to branch. Re-run deploy-ship to check CI.`
      );
    }
  } else {
    Logger.info('No changes to commit — already clean.');
  }

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'Done').catch(() => {});
  }

  Logger.info('');
  Logger.info('fix-tests complete.');
  Logger.info(`  Next: ai-dev ${ctx.ticketId} deploy-ship`);
}
