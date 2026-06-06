import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getSubtaskKey,
  readPrNumber,
  incrementFixRetry,
} from '../core/file-helpers.js';
import { Shell } from '../core/shell.js';
import { getCIStatus, classifyCIFailure } from '../core/ci-status.js';

const MAX_RETRIES = 3;

const FIX_COMMANDS: Record<string, string> = {
  lint: 'fix-lint',
  types: 'fix-types',
  tests: 'fix-tests',
  build: 'fix-build',
  security: 'fix-security',
  conflicts: 'fix-conflicts',
};

export async function deployShipCommand(
  ctx: PipelineContext,
  autoMode: boolean = false
): Promise<void> {
  Logger.banner(`Deploy Ship: ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);

  await checkPrerequisite(ctx, 'deploy-ship');

  const prNumber = await readPrNumber(ctx.repoRoot, ctx.ticketId);
  if (!prNumber) {
    Logger.error('No PR number found. Run deploy-pr first.');
    process.exit(1);
  }

  const subtaskKey = await getSubtaskKey(
    ctx.repoRoot,
    ctx.ticketId,
    'deploy-ship'
  );
  Logger.info(`  PR #${prNumber}`);

  if (subtaskKey) {
    await jira.transitionTo(subtaskKey, 'In Progress').catch(() => {});
  }

  const ciStatus = getCIStatus(prNumber);

  switch (ciStatus) {
    case 'success': {
      const prUrlResult = Shell.execSilent(`gh pr view ${prNumber} --json url`);
      const prUrl =
        JSON.parse(prUrlResult.stdout)?.url ||
        `https://github.com/owner/repo/pull/${prNumber}`;
      Logger.success('All CI checks passed! PR is ready to merge.');
      Logger.info('');
      Logger.info(
        '  No auto-merge (Fortune 500 compliance — human approval required).'
      );
      Logger.info('  Merge command:');
      Logger.info(`    gh pr merge ${prNumber} --squash --delete-branch`);
      Logger.info('');
      Logger.info(`  PR: ${prUrl}`);

      if (subtaskKey) {
        await jira.addComment(
          subtaskKey,
          `✅ CI all-green. PR #${prNumber} ready to merge.\n\nMerge: gh pr merge ${prNumber} --squash --delete-branch`
        );
        await jira.transitionTo(subtaskKey, 'Done').catch(() => {});
      }
      break;
    }

    case 'pending':
      Logger.info('⏳ CI checks still running. Re-run when complete:');
      Logger.info(`  ai-dev ${ctx.ticketId} deploy-ship`);
      break;

    case 'unknown':
      Logger.warn('CI check data unavailable (gh pr checks returned no data).');
      Logger.warn(
        "This may mean checks haven't triggered yet, or gh is unauthenticated."
      );
      Logger.info(`Re-run in a moment: ai-dev ${ctx.ticketId} deploy-ship`);
      break;

    case 'failure': {
      const failureType = classifyCIFailure(prNumber);
      const retryCount = await incrementFixRetry(
        ctx.repoRoot,
        ctx.ticketId,
        failureType
      );

      if (retryCount >= MAX_RETRIES) {
        Logger.error(
          `Hard block: max retries (3) reached for '${failureType}' failures.`
        );
        Logger.error('Manual intervention required.');
        Logger.info('');
        Shell.exec(`gh pr checks ${prNumber}`);
        if (subtaskKey) {
          await jira.addComment(
            subtaskKey,
            `❌ Hard block: max retries (3) reached for ${failureType}. Manual fix required before re-running deploy-ship.`
          );
          await jira.transitionTo(subtaskKey, 'Blocked').catch(() => {});
        }
        process.exit(1);
      }

      Logger.error(
        `CI failed — type: ${failureType} (attempt ${retryCount}/${MAX_RETRIES})`
      );
      Logger.info('');
      Shell.exec(`gh pr checks ${prNumber}`);
      Logger.info('');

      if (failureType === 'unknown') {
        Logger.warn('Unknown failure — fetching raw logs...');
        const runListResult = Shell.execSilent(
          'gh run list --limit 1 --json databaseId'
        );
        try {
          const runData = JSON.parse(runListResult.stdout);
          if (runData[0]?.databaseId) {
            const runId = runData[0].databaseId;
            const logResult = Shell.execSilent(
              `gh run view ${runId} --log-failed`
            );
            console.log(logResult.stdout.split('\n').slice(0, 80).join('\n'));
          }
        } catch {
          // Ignore errors
        }
        Logger.info('');
        Logger.info('Manual intervention required. Fix and push, then re-run:');
        Logger.info(`  ai-dev ${ctx.ticketId} deploy-ship`);
        if (subtaskKey) {
          await jira.addComment(
            subtaskKey,
            '❌ CI failed with unclassifiable error. Manual fix required. See GitHub Actions logs.'
          );
          await jira.transitionTo(subtaskKey, 'Blocked').catch(() => {});
        }
        process.exit(1);
      }

      const fixDesc: Record<string, string> = {
        lint: 'ESLint / Prettier failures',
        types: 'TypeScript type errors',
        tests: 'Jest test failures',
        build: 'Build / compile errors',
        security: 'Security scan findings',
        conflicts: 'Merge conflicts with main',
      };

      Logger.info(`Suggested fix for ${fixDesc[failureType] || failureType}:`);

      if (!autoMode) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        await new Promise<void>(resolve => {
          rl.question('Apply fix now? (y/N): ', answer => {
            rl.close();
            if (answer.toLowerCase() !== 'y') {
              Logger.info('Skipped. Fix manually, push, then re-run:');
              Logger.info(`  ai-dev ${ctx.ticketId} deploy-ship`);
              process.exit(0);
            }
            resolve();
          });
        });
      }

      const fixCommand = FIX_COMMANDS[failureType];
      if (fixCommand) {
        const { fixLintCommand } = await import('./fix-lint.js');
        const { fixTypesCommand } = await import('./fix-types.js');
        const { fixTestsCommand } = await import('./fix-tests.js');
        const { fixBuildCommand } = await import('./fix-build.js');
        const { fixSecurityCommand } = await import('./fix-security.js');
        const { fixConflictsCommand } = await import('./fix-conflicts.js');

        const commands: Record<string, () => Promise<void>> = {
          'fix-lint': () => fixLintCommand(ctx),
          'fix-types': () => fixTypesCommand(ctx),
          'fix-tests': () => fixTestsCommand(ctx),
          'fix-build': () => fixBuildCommand(ctx),
          'fix-security': () => fixSecurityCommand(ctx),
          'fix-conflicts': () => fixConflictsCommand(ctx),
        };

        await commands[fixCommand]();
      }

      Logger.info('');
      Logger.info(`Re-running deploy-ship to verify CI...`);
      await deployShipCommand(ctx, autoMode);
      break;
    }
  }
}
