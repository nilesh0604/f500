import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { getSubtaskKey } from '../core/file-helpers.js';
import { commitAndPush, fetchMain, changedFiles } from '../core/git.js';
import { Shell } from '../core/shell.js';
import { loadConfig } from '../config.js';

export async function fixTypesCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Fix Types: ${ctx.ticketId}`);

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

  fetchMain();

  const maxAttempts = 2;
  let attempt = 0;
  const changedFilesList = changedFiles('main').join(',');

  while (attempt < maxAttempts) {
    attempt++;

    const tscResult = Shell.execSilent('npx tsc --noEmit', ctx.repoRoot);
    const hasErrors = /error TS\d+/.test(tscResult.stdout);

    if (!hasErrors) {
      Logger.info('No TypeScript errors found.');
      break;
    }

    Logger.info(
      `Attempt ${attempt}/${maxAttempts} — invoking fix-types agent...`
    );

    const agentConfig = config.agents['fix-types'];
    if (agentConfig) {
      const variables = {
        TICKET_ID: ctx.ticketId,
        CHANGED_FILES: changedFilesList,
        TSC_ERRORS: tscResult.stdout,
      };
      await runAgent(ctx, agentConfig, variables);
    }
  }

  const finalResult = Shell.execSilent('npx tsc --noEmit', ctx.repoRoot);
  if (/error TS\d+/.test(finalResult.stdout)) {
    Logger.error('');
    Logger.error(`TypeScript errors remain after ${maxAttempts} attempt(s).`);
    Logger.error('Cannot auto-fix — manual intervention needed.');
    Logger.error('');
    console.log(finalResult.stdout.split('\n').slice(0, 20).join('\n'));
    process.exit(1);
  }

  const hasChanges = commitAndPush(
    `fix: resolve TypeScript type errors [${ctx.ticketId}]`
  );

  if (hasChanges) {
    Logger.info('Fix committed and pushed.');
    if (ctx.jira.baseUrl && ctx.jira.email && ctx.jira.apiToken) {
      await jira.addComment(
        ctx.ticketId,
        `Fixed TypeScript type errors. Pushed to branch. Re-run deploy-ship to check CI.`
      );
    }
  } else {
    Logger.info('No changes to commit — already clean.');
  }

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'Done').catch(() => {});
  }

  Logger.info('');
  Logger.info('fix-types complete.');
  Logger.info(`  Next: ai-dev ${ctx.ticketId} deploy-ship`);
}
