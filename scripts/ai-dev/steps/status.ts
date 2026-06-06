import { PipelineContext, StepName } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import {
  getAllSubtaskKeys,
  markerExists,
  readPrNumber,
  readMarker,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { GithubClient } from '../clients/github.js';

interface StepStatus {
  step: StepName;
  subtaskKey?: string;
  status: string;
  hasMarker?: boolean;
  extra?: string;
}

export async function statusCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Status for ticket ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);
  const github = new GithubClient();

  try {
    // Get all subtask keys
    const subtaskKeys = await getAllSubtaskKeys(ctx.repoRoot, ctx.ticketId);

    // Build status table
    const statuses: StepStatus[] = [];

    for (const step of config.steps) {
      const status: StepStatus = {
        step,
        subtaskKey: subtaskKeys[step] || undefined,
        status: 'Not Started',
      };

      if (status.subtaskKey) {
        try {
          status.status = await jira.getStatus(status.subtaskKey);
        } catch (error) {
          status.status = 'Error';
        }
      }

      // Check for special markers
      if (
        step === 'validate' &&
        (await markerExists(ctx.repoRoot, ctx.ticketId, 'validate-passed'))
      ) {
        status.hasMarker = true;
      }

      if (step === 'deploy-pr') {
        const prNumber = await readPrNumber(ctx.repoRoot, ctx.ticketId);
        if (prNumber) {
          status.extra = `PR #${prNumber}`;
          try {
            const prInfo = github.prInfo(prNumber);
            status.extra += ` (${prInfo.state})`;
          } catch {
            // PR might not exist anymore
          }
        }
      }

      statuses.push(status);
    }

    // Display status table
    console.log('\n┌─────────────────────┬──────────────┬─────────────────┐');
    console.log('│ Step                │ Subtask      │ Status          │');
    console.log('├─────────────────────┼──────────────┼─────────────────┤');

    for (const status of statuses) {
      const step = status.step.padEnd(19);
      const subtask = (status.subtaskKey || '-').padEnd(12);
      const statusText = status.status.padEnd(15);

      console.log(`│ ${step} │ ${subtask} │ ${statusText} │`);

      if (status.extra) {
        console.log(
          `│                     │              │ → ${status.extra} │`
        );
      }
    }

    console.log('└─────────────────────┴──────────────┴─────────────────┘');

    // Show additional info
    console.log('\nAdditional Information:');

    const branchName = await readMarker(ctx.repoRoot, ctx.ticketId, 'branch');
    if (branchName) {
      console.log(`  • Branch: ${branchName}`);
    }

    const ticketSummary = await readMarker(
      ctx.repoRoot,
      ctx.ticketId,
      'ticket-summary'
    );
    if (ticketSummary) {
      console.log(`  • Summary: ${ticketSummary}`);
    }

    // Show next step
    const currentStep = statuses.find(s => s.status === 'In Progress');
    if (currentStep) {
      console.log(`  \n🔶 Currently in progress: ${currentStep.step}`);
    } else {
      const nextStep = statuses.find(
        s => s.status === 'To Do' || s.status === 'Not Started'
      );
      if (nextStep) {
        console.log(`  \n➡️  Next step: ${nextStep.step}`);
        console.log(`      Run: ai-dev ${ctx.ticketId} ${nextStep.step}`);
      }
    }

    // Show completed steps
    const completedSteps = statuses.filter(s => s.status === 'Done');
    if (completedSteps.length > 0) {
      console.log(
        `  \n✅ Completed: ${completedSteps.map(s => s.step).join(', ')}`
      );
    }
  } catch (error) {
    Logger.error(`Failed to get status: ${error}`);
    throw error;
  }
}
