import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getSubtaskKey,
  featureDir,
  writeFileWithDir,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

export async function designCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running design for ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'design');

    // Get the design subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'design'
    );
    if (!subtaskKey) {
      throw new Error('Design subtask not found. Did you run init?');
    }

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress');

    // Get agent config
    const agentConfig = config.agents['design'];
    if (!agentConfig) {
      throw new Error('Design agent not found in config');
    }

    // Get requirements subtask key
    const reqSubtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'requirements'
    );
    if (!reqSubtaskKey) {
      throw new Error('Requirements subtask not found. Did you run init?');
    }

    // Download PO-approved requirements.md from Jira and sync locally
    const requirementsPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'requirements.md'
    );
    Logger.info('Downloading PO-approved requirements.md from Jira...');
    const requirements = await jira.downloadAttachment(
      reqSubtaskKey,
      'requirements.md'
    );
    await writeFileWithDir(requirementsPath, requirements);
    Logger.success('requirements.md synced from Jira (local copy updated)');

    // Get ticket info
    const ticket = await jira.getIssue(ctx.ticketId);

    // Prepare variables for the agent
    const variables = {
      TICKET_ID: ctx.ticketId,
      TICKET_SUMMARY: ticket.fields.summary,
      REQUIREMENTS: requirements,
      FEATURE_DIR: featureDir(ctx.repoRoot, ctx.ticketId),
      REPO_ROOT: ctx.repoRoot,
    };

    // Run the design agent
    Logger.info('Running design analysis...');
    const output = await runAgent(ctx, agentConfig, variables);

    // Write design to file
    const designPath = join(config.featureDocsDir, ctx.ticketId, 'design.md');
    await writeFileWithDir(designPath, output);
    Logger.success(`Design saved to: ${designPath}`);

    // Update Jira with summary
    const comment = `h2. Technical Design Complete

Design document has been created with technical specifications and implementation approach.

h3. Key Components:
${extractKeyComponents(output)}

h3. Next Steps:
# Review the design document
# Run: {code}ai-dev ${ctx.ticketId} code-impl{code} to begin implementation

h3. Files:
* Design: [design.md|${designPath.replace(ctx.repoRoot + '/', '')}]
* Requirements: [requirements.md|${requirementsPath.replace(ctx.repoRoot + '/', '')}]`;

    await jira.addComment(subtaskKey, comment);

    // Upload design file as attachment
    await jira.uploadAttachment(subtaskKey, designPath);

    // Transition to Done
    await jira.transitionTo(subtaskKey, 'Done');

    Logger.success('Design step completed');
    console.log(
      `
Next command:
  ai-dev ${ctx.ticketId} code-impl
    `.trim()
    );
  } catch (error) {
    Logger.error(`Design step failed: ${error}`);
    throw error;
  }
}

function extractKeyComponents(designOutput: string): string {
  const components: string[] = [];
  const lines = designOutput.split('\n');
  let inComponentsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      trimmed.match(/^##? Components/i) ||
      trimmed.match(/^##? Architecture/i)
    ) {
      inComponentsSection = true;
      continue;
    }

    if (trimmed.startsWith('#') && !trimmed.match(/Components|Architecture/i)) {
      inComponentsSection = false;
      continue;
    }

    if (
      inComponentsSection &&
      (trimmed.match(/^[-*+]/) || trimmed.match(/^\d+\./))
    ) {
      components.push(trimmed);
    }
  }

  // If no structured components found, try to extract from the whole text
  if (components.length === 0) {
    // Look for component-like patterns
    const componentMatches = designOutput.match(
      /(?:component|module|service|class)[:\s]*([^#.\n]*)/gi
    );
    if (componentMatches) {
      return componentMatches
        .slice(0, 5)
        .map(c => `* ${c}`)
        .join('\n');
    }
  }

  return components.slice(0, 5).join('\n') || '* Design document created';
}
