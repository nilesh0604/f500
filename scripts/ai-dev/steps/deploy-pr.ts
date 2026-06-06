import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import { getSubtaskKey, writePrNumber } from '../core/file-helpers.js';
import { fetchMain, currentBranch, changedFiles } from '../core/git.js';
import { Shell } from '../core/shell.js';
import { loadConfig } from '../config.js';
import { getCIStatus } from '../core/ci-status.js';

export async function deployPrCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Deploy PR: ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  await checkPrerequisite(ctx, 'deploy-pr');

  const subtaskKey = await getSubtaskKey(
    ctx.repoRoot,
    ctx.ticketId,
    'deploy-pr'
  );
  Logger.info(`  Subtask: ${subtaskKey || 'N/A'}`);

  const existingPrResult = Shell.execSilent('gh pr view --json number');
  const existingPr = existingPrResult.stdout.trim();

  if (existingPr) {
    const existingUrlResult = Shell.execSilent('gh pr view --json url');
    const existingUrl = JSON.parse(existingUrlResult.stdout)?.url;
    Logger.info(`PR already exists: ${existingUrl}`);
    Logger.info(`  PR #${existingPr} — skipping duplicate creation.`);
    Logger.info('');
    Logger.info(`Next: ai-dev ${ctx.ticketId} deploy-ship`);
    return;
  }

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'In Progress').catch(() => {});
  }

  fetchMain();

  const branch = currentBranch();
  const changedFilesList = changedFiles('main').join(',');

  const agentConfig = config.agents.deploy;
  if (agentConfig) {
    const variables = {
      TICKET_ID: ctx.ticketId,
      BRANCH: branch,
      CHANGED_FILES: changedFilesList,
    };
    await runAgent(ctx, agentConfig, variables);
  }

  const prResult = Shell.execSilent('gh pr view --json number');
  let prNumber: number | null = null;

  try {
    prNumber = JSON.parse(prResult.stdout)?.number;
  } catch {
    prNumber = null;
  }

  if (!prNumber) {
    if (subtaskKey) {
      await jira.addComment(
        subtaskKey,
        'Deploy agent failed to open a PR. Re-run needed.'
      );
    }
    Logger.error('PR was not created by the agent. Re-run this step.');
    process.exit(1);
  }

  const prUrlResult = Shell.execSilent(`gh pr view ${prNumber} --json url`);
  const prUrl =
    JSON.parse(prUrlResult.stdout)?.url ||
    `https://github.com/owner/repo/pull/${prNumber}`;

  await writePrNumber(ctx.repoRoot, ctx.ticketId, prNumber);

  let ciStatus = 'unknown';
  let ciWait = 0;
  while (ciStatus === 'unknown' && ciWait < 60) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    ciWait += 10;
    ciStatus = getCIStatus(prNumber);
  }

  const commentBody = `AI Pipeline — PR Opened

Ticket: ${ctx.ticketId}
Branch: ${branch}
PR: ${prUrl} (#${prNumber})
CI initial status: ${ciStatus}

---
Review the PR. When you are satisfied:
  ai-dev ${ctx.ticketId} deploy-ship`;

  if (subtaskKey) {
    await jira.addComment(subtaskKey, commentBody);
    await jira.addComment(
      ctx.ticketId,
      `PR opened: ${prUrl}\n\nRun deploy-ship to monitor CI and fix failures automatically.`
    );
    await jira.transitionTo(subtaskKey, 'In Review').catch(() => {});
  }

  Logger.info('');
  Logger.info(`PR opened: ${prUrl}`);
  Logger.info(`  PR #${prNumber}`);
  Logger.info(`  CI status: ${ciStatus}`);
  if (subtaskKey) {
    Logger.info(`  Subtask: ${ctx.jira.baseUrl}/browse/${subtaskKey}`);
  }
  Logger.info('');
  Logger.info(`Next: ai-dev ${ctx.ticketId} deploy-ship`);
}
