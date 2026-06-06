import { join } from 'path';
import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { getSubtaskKey, featureDir } from '../core/file-helpers.js';
import { commitAndPush } from '../core/git.js';
import { Shell } from '../core/shell.js';
import { loadConfig } from '../config.js';

export async function fixSecurityCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Fix Security: ${ctx.ticketId}`);

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

  Logger.info('Running npm audit fix (non-breaking)...');
  Shell.exec('npm audit fix --audit-level=high', { cwd: ctx.repoRoot });

  const auditResult = Shell.execSilent('npm audit --json', ctx.repoRoot);
  let highCount = 0;

  try {
    const auditData = JSON.parse(auditResult.stdout);
    const vulnerabilities = auditData.vulnerabilities || {};
    highCount = Object.values(vulnerabilities).filter(
      (v: any) => v.severity === 'high' || v.severity === 'critical'
    ).length;
  } catch {
    highCount = 0;
  }

  if (highCount > 0) {
    Logger.info(
      `${highCount} HIGH/CRITICAL vulnerabilities remain — invoking fix-security agent...`
    );

    const agentConfig = config.agents['fix-security'];
    if (agentConfig) {
      const variables = {
        TICKET_ID: ctx.ticketId,
        AUDIT_JSON: auditResult.stdout,
      };
      await runAgent(ctx, agentConfig, variables);
    }
  } else {
    Logger.info('No HIGH/CRITICAL vulnerabilities — agent not needed.');
  }

  const finalAuditResult = Shell.execSilent(
    'npm audit --audit-level=high',
    ctx.repoRoot
  );
  if (finalAuditResult.exitCode !== 0) {
    const securityReviewPath = join(
      featureDir(ctx.repoRoot, ctx.ticketId),
      'SECURITY_REVIEW.md'
    );
    const fs = await import('fs/promises');
    let hasAcceptedRisks = false;

    try {
      const reviewContent = await fs.readFile(securityReviewPath, 'utf8');
      hasAcceptedRisks = reviewContent.includes('## Accepted Risks');
    } catch {
      // File doesn't exist
    }

    if (hasAcceptedRisks) {
      Logger.info(
        'Remaining vulnerabilities documented in SECURITY_REVIEW.md as accepted risks.'
      );
    } else {
      Logger.error('');
      Logger.error(
        `${highCount} HIGH/CRITICAL vulnerabilities unresolved and not documented.`
      );
      Logger.error('  Run npm audit --audit-level=high for details.');
      process.exit(1);
    }
  }

  const hasChanges = commitAndPush(
    `fix: resolve security vulnerabilities [${ctx.ticketId}]`
  );

  if (hasChanges) {
    Logger.info('Fix committed and pushed.');
    if (ctx.jira.baseUrl && ctx.jira.email && ctx.jira.apiToken) {
      await jira.addComment(
        ctx.ticketId,
        `Resolved security vulnerabilities. Pushed to branch. Re-run deploy-ship to check CI.`
      );
    }
  } else {
    Logger.info('No changes to commit — already clean.');
  }

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'Done').catch(() => {});
  }

  Logger.info('');
  Logger.info('fix-security complete.');
  Logger.info(`  Next: ai-dev ${ctx.ticketId} deploy-ship`);
}
