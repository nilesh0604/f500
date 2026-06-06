import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { getSubtaskKey } from '../core/file-helpers.js';
import { commitAndPush, fetchMain, changedFiles } from '../core/git.js';
import { Shell } from '../core/shell.js';
import { loadConfig } from '../config.js';

export async function fixLintCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Fix Lint: ${ctx.ticketId}`);

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

  Logger.info('Running eslint --fix + prettier --write...');
  Shell.exec('npm run lint -- --fix --quiet', { cwd: ctx.repoRoot });

  const changedTsFiles = changedFiles('main').filter((f: string) =>
    /\.(ts|tsx|js|jsx|json|md)$/.test(f)
  );

  for (const file of changedTsFiles) {
    Shell.exec(`npx prettier --write "${file}"`, { cwd: ctx.repoRoot });
  }

  const lintResult = Shell.execSilent(
    'npm run lint -- --format=compact',
    ctx.repoRoot
  );
  const errorCount = (lintResult.stdout.match(/ error /g) || []).length;

  if (errorCount > 0) {
    Logger.info(
      `Auto-fix left ${errorCount} error(s) — invoking fix-lint agent...`
    );

    const errorOutput = lintResult.stdout
      .split('\n')
      .filter(line => line.includes(' error '))
      .slice(0, 50)
      .join('\n');

    const agentConfig = config.agents['fix-lint'];
    if (agentConfig) {
      const variables = {
        TICKET_ID: ctx.ticketId,
        CHANGED_FILES: changedFiles('main').join(','),
        REMAINING_ERRORS: errorOutput,
      };
      await runAgent(ctx, agentConfig, variables);
    }
  } else {
    Logger.info('Auto-fix resolved all lint errors — agent not needed.');
  }

  const finalLintResult = Shell.execSilent(
    'npm run lint -- --quiet',
    ctx.repoRoot
  );
  if (finalLintResult.exitCode !== 0) {
    Logger.error(
      'ESLint still failing after fix attempt. Manual intervention required.'
    );
    process.exit(1);
  }

  const postChangedFiles = changedFiles('main').filter((f: string) =>
    /\.(ts|tsx|js|jsx|json|md)$/.test(f)
  );

  for (const file of postChangedFiles) {
    Shell.exec(`npx prettier --write "${file}"`, { cwd: ctx.repoRoot });
  }

  const hasChanges = commitAndPush(
    `fix: resolve lint violations [${ctx.ticketId}]`
  );

  if (hasChanges) {
    Logger.info('Fix committed and pushed.');
    if (ctx.jira.baseUrl && ctx.jira.email && ctx.jira.apiToken) {
      await jira.addComment(
        ctx.ticketId,
        `Fixed lint/prettier violations. Pushed to branch. Re-run deploy-ship to check CI.`
      );
    }
  } else {
    Logger.info('No changes to commit — already clean.');
  }

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'Done').catch(() => {});
  }

  Logger.info('');
  Logger.info('fix-lint complete.');
  Logger.info(`  Next: ai-dev ${ctx.ticketId} deploy-ship`);
}
