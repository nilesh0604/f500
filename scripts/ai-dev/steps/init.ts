import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { checkoutNewBranch, currentBranch } from '../core/git.js';
import {
  ensureFeatureDir,
  getSubtaskKey,
  saveSubtaskKey,
  writeMarker,
  writePrNumber,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { STEPS_ORDERED } from '../types.js';

export async function initCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Initializing ticket ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // 1. Parse the ticket
    Logger.info('Parsing Jira ticket...');
    const ticket = await jira.getIssue(ctx.ticketId);
    Logger.success(`Found ticket: ${ticket.fields.summary}`);

    // 2. Create feature branch
    const branchName = `feature/${ctx.ticketId}-${ticket.fields.summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`;

    Logger.info(`Creating branch: ${branchName}`);
    checkoutNewBranch(branchName);

    // 3. Create feature directory
    await ensureFeatureDir(ctx.repoRoot, ctx.ticketId);

    // 4. Create subtasks
    Logger.info('Creating subtasks...');
    const subtaskKeys: Record<string, string> = {};

    const stepsToCreate = STEPS_ORDERED;

    for (const step of stepsToCreate) {
      const existing = await getSubtaskKey(
        ctx.repoRoot,
        ctx.ticketId,
        step as any
      );
      if (existing) {
        subtaskKeys[step] = existing;
        Logger.info(`Subtask ${step} already exists: ${existing}, skipping`);
        continue;
      }

      const summary = `${step} for ${ctx.ticketId}`;
      const description = `Subtask for ${step} execution on ${ctx.ticketId}: ${ticket.fields.summary}`;

      try {
        const subtaskKey = await jira.createSubtask(
          ctx.ticketId,
          summary,
          description
        );
        subtaskKeys[step] = subtaskKey;
        await saveSubtaskKey(
          ctx.repoRoot,
          ctx.ticketId,
          step as any,
          subtaskKey
        );
        Logger.success(`Created subtask ${step}: ${subtaskKey}`);
      } catch (error) {
        Logger.error(`Failed to create subtask ${step}: ${error}`);
        throw error;
      }
    }

    // 5. Create initial marker files
    await writeMarker(ctx.repoRoot, ctx.ticketId, 'branch', branchName);
    await writeMarker(
      ctx.repoRoot,
      ctx.ticketId,
      'ticket-summary',
      ticket.fields.summary
    );

    // 6. Add initialization comment to Jira
    const comment = `h2. AI-Dev Pipeline Initialized

*Branch:* ${branchName}
*Subtasks Created:* ${Object.keys(subtaskKeys).length}

h3. Next Steps:
# Run: {code}ai-dev ${ctx.ticketId} requirements{code}
# This will start the requirements gathering phase

h3. Pipeline Steps:
${STEPS_ORDERED.map(step => `* ${step}`).join('\n')}`;

    await jira.addComment(ctx.ticketId, comment);
    Logger.success('Added initialization comment to Jira');

    // 7. Summary
    Logger.banner('Initialization Complete');
    console.log(
      `
Ticket: ${ctx.ticketId} - ${ticket.fields.summary}
Branch: ${branchName}
Directory: docs/features/${ctx.ticketId}

Next command:
  ai-dev ${ctx.ticketId} requirements
    `.trim()
    );
  } catch (error) {
    Logger.error(`Initialization failed: ${error}`);

    // Add error comment to Jira if possible
    try {
      await jira.addComment(
        ctx.ticketId,
        `AI-Dev initialization failed: ${error}`
      );
    } catch {
      // Ignore if we can't comment
    }

    throw error;
  }
}
