import { join } from 'path';
import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { getSubtaskKey, readFileIfExists } from '../core/file-helpers.js';
import {
  commitAndPush,
  fetchMain,
  getMergeConflicts,
  forceWithLeasePush,
  abortRebase,
  continueRebase,
} from '../core/git.js';
import { Shell } from '../core/shell.js';
import { loadConfig } from '../config.js';

export async function fixConflictsCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Fix Conflicts: ${ctx.ticketId}`);

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

  const tddPath = join(config.featureDocsDir, ctx.ticketId, 'TDD.md');
  const reqPath = join(config.featureDocsDir, ctx.ticketId, 'requirements.md');

  Logger.info('Fetching origin/main...');
  fetchMain();

  Logger.info('Rebasing onto origin/main...');
  const rebaseResult = Shell.execSilent('git rebase origin/main', ctx.repoRoot);

  if (rebaseResult.exitCode === 0) {
    Logger.info('Rebase succeeded cleanly — no conflicts.');
    forceWithLeasePush();
    Logger.info('Pushed with --force-with-lease.');
    Logger.info('');
    Logger.info('fix-conflicts complete.');
    Logger.info(`  Next: ai-dev ${ctx.ticketId} deploy-ship`);
    return;
  }

  const conflictedFiles = getMergeConflicts();
  const conflictCount = conflictedFiles.length;

  if (conflictCount > 10) {
    abortRebase();
    Logger.error('');
    Logger.error(
      `${conflictCount} conflicted files — too risky for auto-resolution.`
    );
    Logger.error('Manual intervention required.');
    Logger.error('');
    Logger.error('Conflicted files:');
    console.log(conflictedFiles.join('\n'));
    process.exit(1);
  }

  Logger.info(
    `${conflictCount} conflicted file(s) — invoking fix-conflicts agent...`
  );

  const tdd = await readFileIfExists(tddPath);
  const requirements = await readFileIfExists(reqPath);

  const agentConfig = config.agents['fix-conflicts'];
  if (agentConfig) {
    const variables = {
      TICKET_ID: ctx.ticketId,
      TDD_PATH: tddPath,
      REQUIREMENTS_PATH: reqPath,
      CONFLICTED_FILES: conflictedFiles.join(','),
    };
    await runAgent(ctx, agentConfig, variables);
  }

  Logger.info('Staging resolved files and continuing rebase...');
  Shell.exec('git add -u', { cwd: ctx.repoRoot });

  const continueResult = continueRebase();
  if (!continueResult) {
    abortRebase();
    Logger.error('');
    Logger.error(
      'Error: Rebase continue failed — agent may not have resolved all conflicts.'
    );
    Logger.error('Run: git status');
    process.exit(1);
  }

  Logger.info('');
  Logger.info(
    "Running validate to confirm conflict resolution didn't break anything..."
  );
  const validateResult = Shell.execSilent('npm run validate', ctx.repoRoot);
  if (validateResult.exitCode !== 0) {
    Logger.error('');
    Logger.error('Error: Validation failed after conflict resolution.');
    Logger.error(
      'Conflict resolution introduced a breakage — manual fix required.'
    );
    process.exit(1);
  }

  if (conflictedFiles.includes('package.json')) {
    Logger.info('package.json was conflicted — regenerating lockfile...');
    Shell.exec('npm install', { cwd: ctx.repoRoot });
    Shell.exec('git add package-lock.json', { cwd: ctx.repoRoot });
    try {
      commitAndPush(
        `chore: regenerate lockfile after rebase [${ctx.ticketId}]`
      );
    } catch {
      // May fail if no changes
    }
  }

  forceWithLeasePush();
  Logger.info('Pushed with --force-with-lease.');

  if (ctx.jira.baseUrl && ctx.jira.email && ctx.jira.apiToken) {
    await jira.addComment(
      ctx.ticketId,
      `Resolved ${conflictCount} merge conflict(s), rebased onto main. Pushed with --force-with-lease. Re-run deploy-ship.`
    );
  }

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'Done').catch(() => {});
  }

  Logger.info('');
  Logger.info('fix-conflicts complete.');
  Logger.info(`  Next: ai-dev ${ctx.ticketId} deploy-ship`);
}
