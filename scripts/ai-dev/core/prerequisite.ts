import { StepName, PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from './logger.js';
import { markerExists, getSubtaskKey } from './file-helpers.js';
import { loadConfig } from '../config.js';

// Mapping of each step to its prerequisite step
const PREREQUISITE_MAP: Record<StepName, StepName | null> = {
  requirements: null, // Only checks subtasks file exists
  design: 'requirements',
  'code-impl': 'design',
  'code-test': 'code-impl',
  'code-quality': 'code-test',
  'code-security': 'code-quality',
  'code-perf': 'code-security',
  validate: 'code-perf',
  'deploy-pr': null, // Checks .validate-passed marker
  'deploy-ship': null, // Checks .pr_number file
};

export async function checkPrerequisite(
  ctx: PipelineContext,
  step: StepName
): Promise<void> {
  Logger.debug(`Checking prerequisite for ${step}`);

  const prerequisiteStep = PREREQUISITE_MAP[step];

  if (prerequisiteStep === null) {
    // Steps with no prerequisite step have special checks
    await checkSpecialPrerequisites(ctx, step);
    return;
  }

  // Check that the prerequisite step is marked as Done in Jira
  const jira = new JiraClient(ctx.jira);
  const prerequisiteKey = await getSubtaskKey(
    ctx.repoRoot,
    ctx.ticketId,
    prerequisiteStep
  );

  if (!prerequisiteKey) {
    throw new Error(
      `Prerequisite step '${prerequisiteStep}' not found. Please run: ai-dev ${ctx.ticketId} ${prerequisiteStep}`
    );
  }

  const status = await jira.getStatus(prerequisiteKey);
  if (status !== 'Done') {
    throw new Error(
      `Prerequisite step '${prerequisiteStep}' (${prerequisiteKey}) is not Done. Current status: ${status}`
    );
  }

  // Run step-specific additional checks
  await checkStepSpecificPrerequisites(ctx, step, prerequisiteKey);
}

async function checkSpecialPrerequisites(
  ctx: PipelineContext,
  step: StepName
): Promise<void> {
  switch (step) {
    case 'requirements':
      // Check that subtasks file exists (created by init)
      const subtasksKey = await getSubtaskKey(
        ctx.repoRoot,
        ctx.ticketId,
        'requirements'
      );
      if (!subtasksKey) {
        throw new Error(
          'Requirements subtask not found. Please run: ai-dev init to initialize the ticket'
        );
      }
      break;

    case 'deploy-pr':
      // Check that validation passed
      const validatePassed = await markerExists(
        ctx.repoRoot,
        ctx.ticketId,
        'validate-passed'
      );
      if (!validatePassed) {
        throw new Error(
          'Validation has not passed. Please run: ai-dev validate before deploying to PR'
        );
      }
      break;

    case 'deploy-ship':
      // Check that PR exists and is merged
      const prNumber = await readPrNumber(ctx.repoRoot, ctx.ticketId);
      if (!prNumber) {
        throw new Error(
          'No PR number found. Please run: ai-dev deploy-pr first'
        );
      }
      // Additional check for PR merged status will be in deploy-ship step
      break;
  }
}

async function checkStepSpecificPrerequisites(
  ctx: PipelineContext,
  step: StepName,
  prerequisiteKey: string
): Promise<void> {
  const jira = new JiraClient(ctx.jira);

  switch (step) {
    case 'design':
      // Check that requirements have no open questions
      const hasOpenQuestions = await checkForOpenQuestions(
        jira,
        prerequisiteKey
      );
      if (hasOpenQuestions) {
        throw new Error(
          'Requirements still have open questions. Please resolve them before proceeding to design'
        );
      }
      break;

    case 'code-impl':
      // Check that design document exists
      const config = await loadConfig(ctx.repoRoot);
      const designDocPath = `${config.featureDocsDir}/${ctx.ticketId}/design.md`;
      const fs = await import('fs/promises');
      try {
        await fs.access(designDocPath);
      } catch {
        throw new Error(
          'Design document not found. Please complete the design step first'
        );
      }
      break;

    case 'code-test':
      // Check that implementation checklist is complete
      const implComplete = await checkImplementationChecklist(
        jira,
        prerequisiteKey
      );
      if (!implComplete) {
        throw new Error(
          'Implementation checklist is not complete. Please finish all implementation tasks before writing tests'
        );
      }
      break;

    case 'code-quality':
      // Check that tests are passing
      const testsPassing = await checkTestsPass(prerequisiteKey);
      if (!testsPassing) {
        throw new Error(
          'Tests are not passing. Please fix failing tests before running quality checks'
        );
      }
      break;

    case 'code-security':
      // No additional checks beyond code-quality being done
      break;

    case 'code-perf':
      // No additional checks beyond code-security being done
      break;

    case 'validate':
      // Check that all code steps are done
      const codeSteps: StepName[] = [
        'code-impl',
        'code-test',
        'code-quality',
        'code-security',
        'code-perf',
      ];
      for (const codeStep of codeSteps) {
        const subtaskKey = await getSubtaskKey(
          ctx.repoRoot,
          ctx.ticketId,
          codeStep
        );
        if (!subtaskKey) {
          throw new Error(
            `Code step '${codeStep}' not found. Please complete all code steps before validation`
          );
        }
        const status = await jira.getStatus(subtaskKey);
        if (status !== 'Done') {
          throw new Error(
            `Code step '${codeStep}' (${subtaskKey}) is not Done. Current status: ${status}`
          );
        }
      }
      break;
  }
}

async function checkForOpenQuestions(
  jira: JiraClient,
  requirementsKey: string
): Promise<boolean> {
  const comments = await jira.getComments(requirementsKey);

  // Look for comments with unanswered questions
  for (const comment of comments) {
    const body = JSON.stringify(comment.body);
    if (body.includes('Q:') && !body.includes('Decision:')) {
      return true;
    }
  }

  return false;
}

async function checkImplementationChecklist(
  jira: JiraClient,
  implKey: string
): Promise<boolean> {
  const comments = await jira.getComments(implKey);

  // Look for implementation checklist comment
  for (const comment of comments) {
    const body = JSON.stringify(comment.body);
    if (body.includes('IMPL_CHECKLIST')) {
      // Check if all items are marked as done
      const lines = body.split('\n');
      let totalItems = 0;
      let completedItems = 0;

      for (const line of lines) {
        if (line.includes('- [ ]')) totalItems++;
        if (line.includes('- [x]')) completedItems++;
      }

      return totalItems > 0 && totalItems === completedItems;
    }
  }

  // If no checklist found, assume implementation is not complete
  return false;
}

async function checkTestsPass(implKey: string): Promise<boolean> {
  // This would typically check CI status or run tests locally
  // For now, we'll check if there's a comment indicating tests pass
  const fs = await import('fs/promises');
  const config = await loadConfig(process.cwd());

  try {
    const testResultPath = `${config.featureDocsDir}/${implKey.split('-')[1]}/test-results.json`;
    const content = await fs.readFile(testResultPath, 'utf8');
    const results = JSON.parse(content);
    return results.success === true;
  } catch {
    // If no test results found, assume tests haven't been run
    return false;
  }
}

async function readPrNumber(
  repoRoot: string,
  ticketId: string
): Promise<number | null> {
  const { join } = await import('path');
  const fs = await import('fs/promises');
  const filePath = join(repoRoot, 'docs', 'features', ticketId, '.pr_number');

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const num = parseInt(content.trim(), 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export function getPrerequisiteStep(step: StepName): StepName | null {
  return PREREQUISITE_MAP[step];
}

export function getAllGatedSteps(): StepName[] {
  return Object.keys(PREREQUISITE_MAP) as StepName[];
}
