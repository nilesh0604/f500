import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getAllSubtaskKeys,
  writeMarker,
  markerExists,
  readPrNumber,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { commitAndPush } from '../core/git.js';
import { Shell } from '../core/shell.js';

export async function validateCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Validating ${ctx.ticketId} before deployment`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'validate');

    // Get all subtask keys
    const subtaskKeys = await getAllSubtaskKeys(ctx.repoRoot, ctx.ticketId);

    Logger.info('Checking all code steps are complete...');
    const codeSteps = [
      'code-impl',
      'code-test',
      'code-quality',
      'code-security',
      'code-perf',
    ];
    let allStepsComplete = true;

    for (const step of codeSteps) {
      const subtaskKey = subtaskKeys[step as keyof typeof subtaskKeys];
      if (!subtaskKey) {
        Logger.error(`Subtask for ${step} not found`);
        allStepsComplete = false;
        continue;
      }

      const status = await jira.getStatus(subtaskKey);
      if (status !== 'Done') {
        Logger.error(`${step} is not Done (status: ${status})`);
        allStepsComplete = false;
      }
    }

    if (!allStepsComplete) {
      throw new Error(
        'Not all code steps are complete. Please complete all steps before validation.'
      );
    }

    // Run build check
    Logger.info('Running build check...');
    const buildResult = Shell.exec('npm run build', {
      cwd: ctx.repoRoot,
      silent: true,
    });

    if (buildResult.exitCode !== 0) {
      Logger.error('Build failed');
      Logger.error(buildResult.stderr);
      throw new Error('Build validation failed');
    }
    Logger.success('Build check passed');

    // Run lint check
    Logger.info('Running lint check...');
    try {
      const lintResult = Shell.exec('npm run lint', {
        cwd: ctx.repoRoot,
        silent: true,
      });

      if (lintResult.exitCode !== 0) {
        Logger.warn('Lint issues found but not blocking deployment');
      } else {
        Logger.success('Lint check passed');
      }
    } catch {
      Logger.warn('Lint script not found, skipping');
    }

    // Run tests
    Logger.info('Running tests...');
    const testResult = Shell.exec('npm test', {
      cwd: ctx.repoRoot,
      silent: true,
    });

    if (testResult.exitCode !== 0) {
      Logger.error('Tests failed');
      Logger.error(testResult.stderr);
      throw new Error('Test validation failed');
    }
    Logger.success('All tests passed');

    // Check for uncommitted changes
    Logger.info('Checking for uncommitted changes...');
    const hasChanges = commitAndPush(
      `chore(${ctx.ticketId}): Final validation commit`
    );

    if (hasChanges) {
      Logger.info('Uncommitted changes were pushed');
    } else {
      Logger.info('No uncommitted changes found');
    }

    // Write validation marker
    await writeMarker(
      ctx.repoRoot,
      ctx.ticketId,
      'validate-passed',
      new Date().toISOString()
    );
    Logger.success('Validation marker created');

    // Update Jira with validation results
    const validateSubtaskKey = subtaskKeys['validate'];
    if (validateSubtaskKey) {
      const comment = `h2. Validation Complete

All checks have passed successfully. Ready for deployment.

h3. Validation Results:
* [x] All code steps complete
* [x] Build successful
* [x] All tests passing
* [x] No blocking lint issues
* [x] Code committed and pushed

h3. Next Steps:
# Run: {code}ai-dev ${ctx.ticketId} deploy-pr{code} to deploy to PR environment

h3. Deployment Checklist:
* [ ] Review changes in PR
* [ ] Manual testing complete
* [ ] Stakeholder approval received
* [ ] Ready for production deployment`;

      await jira.addComment(validateSubtaskKey, comment);
      await jira.transitionTo(validateSubtaskKey, 'Done');
    }

    Logger.banner('Validation Successful');
    console.log(
      `
✅ All validation checks passed!
Ready for deployment.

Next command:
  ai-dev ${ctx.ticketId} deploy-pr
    `.trim()
    );
  } catch (error) {
    Logger.error(`Validation failed: ${error}`);

    // Add error comment to Jira if possible
    try {
      const subtaskKeys = await getAllSubtaskKeys(ctx.repoRoot, ctx.ticketId);
      const validateSubtaskKey = subtaskKeys['validate'];
      if (validateSubtaskKey) {
        await jira.addComment(
          validateSubtaskKey,
          `Validation failed: ${error}`
        );
      }
    } catch {
      // Ignore if we can't comment
    }

    throw error;
  }
}
