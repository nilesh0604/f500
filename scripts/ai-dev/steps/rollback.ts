import { PipelineContext } from '../types.js';
import { Logger } from '../core/logger.js';
import { Shell } from '../core/shell.js';
import { AwsClient } from '../clients/aws.js';
import { JiraClient } from '../clients/jira-client.js';
import { markerFile, featureDir } from '../core/file-helpers.js';
import { join } from 'path';

export async function rollbackCommand(ctx: PipelineContext): Promise<void> {
  const { ticketId, repoRoot, jira } = ctx;

  Logger.banner(`Rollback: ${ticketId}`);
  console.log('');

  console.log('[1/4] Validating AWS credentials...');
  const aws = new AwsClient();
  try {
    const identity = aws.stsGetCallerIdentity();
    console.log(`  Account: ${identity.account}`);
  } catch {
    throw new Error(
      'AWS credentials not configured or expired.\n' +
        '  Run: aws configure  OR  export AWS_PROFILE=<profile>'
    );
  }

  const releaseMarkerPath = markerFile(
    repoRoot,
    ticketId,
    'last-known-good-commit'
  );
  let rollbackCommit: string;

  const markerResult = Shell.execSilent(`cat ${releaseMarkerPath} 2>/dev/null`);
  if (markerResult.exitCode === 0 && markerResult.stdout.trim()) {
    rollbackCommit = markerResult.stdout.trim();
    console.log(
      `  Using release marker: ${rollbackCommit.substring(0, 8)} (saved by last release run)`
    );
  } else {
    console.log('  No release marker found — falling back to HEAD~1');
    const headResult = Shell.execSilent('git rev-parse HEAD~1', repoRoot);
    rollbackCommit = headResult.stdout.trim();
  }

  if (!rollbackCommit) {
    throw new Error(
      'Cannot determine rollback target.\n' +
        '  Ensure you are on main and have at least 2 commits.'
    );
  }

  console.log(`  Rolling back to commit: ${rollbackCommit.substring(0, 8)}`);
  console.log('');

  console.log('[2/4] Switching to main...');
  Shell.exec('git checkout main', { cwd: repoRoot });
  Shell.exec('git pull origin main', { cwd: repoRoot });

  console.log('[3/4] Checking out previous infra and app state...');

  const checkoutResult = Shell.exec(
    `git checkout ${rollbackCommit} -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true`,
    { cwd: repoRoot }
  );

  if (checkoutResult.exitCode !== 0) {
    throw new Error(
      `Could not checkout state from ${rollbackCommit.substring(0, 8)}.\n` +
        '  The commit may not include the paths infra/, apps/vyasa-rag-service/, apps/vyasa-ui/'
    );
  }

  const infraDir = join(repoRoot, 'infra');
  console.log('  Deploying CDK stacks with rollback state...');
  const deployResult = Shell.exec(
    'npx cdk deploy OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi --require-approval never',
    { cwd: infraDir }
  );

  Shell.exec(
    'git checkout HEAD -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true',
    { cwd: repoRoot }
  );

  if (deployResult.exitCode !== 0) {
    const jiraClient = new JiraClient(jira);
    await jiraClient.addComment(
      ticketId,
      `❌ Rollback FAILED for ${ticketId}. CDK deploy with state ${rollbackCommit.substring(0, 8)} failed. Manual AWS Console intervention required.`
    );
    throw new Error('Rollback CDK deploy failed.');
  }

  console.log('[4/4] Updating Jira...');
  const jiraClient = new JiraClient(jira);
  await jiraClient.addComment(
    ticketId,
    `⏪ Rollback executed for ${ticketId}. Reverted CDK stacks to commit ${rollbackCommit.substring(0, 8)}. Infrastructure redeployed to previous known-good state. Re-investigate the issue before re-running release.`
  );
  await jiraClient.transitionTo(ticketId, 'In Progress');

  console.log('');
  console.log('======================================');
  console.log(` ROLLBACK COMPLETE: ${ticketId}`);
  console.log('======================================');
  console.log('');
  console.log(`  Reverted to: ${rollbackCommit.substring(0, 8)}`);
  console.log(`  Ticket:      ${jira.baseUrl}/browse/${ticketId}`);
  console.log('');
  console.log('Investigate the smoke test failure, fix the issue, then:');
  console.log(`  npx tsx scripts/ai-dev/cli.ts ${ticketId} release`);
}
