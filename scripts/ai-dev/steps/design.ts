import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getSubtaskKey,
  featureDir,
  writeFileWithDir,
  readFileIfExists,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { join, dirname } from 'path';
import { readFile } from 'fs/promises';

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
    let requirements: string;
    try {
      requirements = await jira.downloadAttachment(
        reqSubtaskKey,
        'requirements.md'
      );
      await writeFileWithDir(requirementsPath, requirements);
      Logger.success('requirements.md synced from Jira (local copy updated)');
    } catch {
      const local = await readFileIfExists(requirementsPath);
      if (!local) {
        throw new Error(
          `Attachment 'requirements.md' not found on ${reqSubtaskKey} and no local copy exists. Re-run: ai-dev ${ctx.ticketId} requirements`
        );
      }
      Logger.warn(
        'requirements.md not found in Jira — using local copy. Run "requirements" again to upload it.'
      );
      requirements = local;
    }

    // Get ticket info
    const ticket = await jira.getIssue(ctx.ticketId);

    // Gather brownfield context for the design agent
    const brownfieldContext = await gatherBrownfieldContext(ctx.repoRoot);

    // Prepare variables for the agent
    const variables = {
      TICKET_ID: ctx.ticketId,
      TICKET_SUMMARY: ticket.fields.summary,
      REQUIREMENTS: requirements,
      FEATURE_DIR: featureDir(ctx.repoRoot, ctx.ticketId),
      REPO_ROOT: ctx.repoRoot,
      BROWNFIELD_CONTEXT: brownfieldContext,
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

async function gatherBrownfieldContext(repoRoot: string): Promise<string> {
  const parts: string[] = [];

  parts.push('## Existing Shared Types (libs/shared-types/src/)');
  parts.push('');
  parts.push('### Index');
  try {
    const indexPath = join(repoRoot, 'libs/shared-types/src/index.ts');
    parts.push('```typescript');
    parts.push(await readFile(indexPath, 'utf8'));
    parts.push('```');
  } catch {
    parts.push('_shared-types not found_');
  }

  parts.push('');
  parts.push('### Order Types');
  try {
    const orderTypesPath = join(
      repoRoot,
      'libs/shared-types/src/lib/order.types.ts'
    );
    parts.push('```typescript');
    parts.push(await readFile(orderTypesPath, 'utf8'));
    parts.push('```');
  } catch {
    // skip
  }

  parts.push('');
  parts.push('### Event Types');
  try {
    const eventTypesPath = join(
      repoRoot,
      'libs/shared-types/src/lib/event.types.ts'
    );
    parts.push('```typescript');
    parts.push(await readFile(eventTypesPath, 'utf8'));
    parts.push('```');
  } catch {
    // skip
  }

  parts.push('');
  parts.push('### Auth Types');
  try {
    const authTypesPath = join(
      repoRoot,
      'libs/shared-types/src/lib/auth.types.ts'
    );
    parts.push('```typescript');
    parts.push(await readFile(authTypesPath, 'utf8'));
    parts.push('```');
  } catch {
    // skip
  }

  parts.push('');
  parts.push('## Existing Service Patterns (vyasa-rag-service)');
  parts.push('');

  parts.push('### Handler Structure');
  try {
    const handlersDir = join(repoRoot, 'apps/vyasa-rag-service/src/handlers');
    const handlerFiles = ['index.ts', 'rag-handler.ts'];
    for (const file of handlerFiles) {
      const filePath = join(handlersDir, file);
      try {
        parts.push(`#### ${file}`);
        parts.push('```typescript');
        const content = await readFile(filePath, 'utf8');
        const trimmed =
          content.length > 1500
            ? content.substring(0, 1500) + '\n// ... (truncated)'
            : content;
        parts.push(trimmed);
        parts.push('```');
        parts.push('');
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  parts.push('');
  parts.push('### Service Layer');
  try {
    const servicesDir = join(repoRoot, 'apps/vyasa-rag-service/src/services');
    const serviceFiles = ['rag-service.ts', 'query-planner.ts'];
    for (const file of serviceFiles) {
      const filePath = join(servicesDir, file);
      try {
        parts.push(`#### ${file}`);
        parts.push('```typescript');
        const content = await readFile(filePath, 'utf8');
        const trimmed =
          content.length > 1500
            ? content.substring(0, 1500) + '\n// ... (truncated)'
            : content;
        parts.push(trimmed);
        parts.push('```');
        parts.push('');
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  parts.push('');
  parts.push('### Error Handling Patterns');
  try {
    const libDir = join(repoRoot, 'apps/vyasa-rag-service/src/lib');
    const errorFiles = ['error.ts', 'errors.ts'];
    for (const file of errorFiles) {
      const filePath = join(libDir, file);
      try {
        parts.push(`#### ${file}`);
        parts.push('```typescript');
        parts.push(await readFile(filePath, 'utf8'));
        parts.push('```');
        parts.push('');
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return parts.join('\n');
}
