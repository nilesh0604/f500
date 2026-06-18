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
import { commitAndPush } from '../core/git.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

export async function codeImplCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running code implementation for ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'code-impl');

    // Get the code-impl subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'code-impl'
    );
    if (!subtaskKey) {
      throw new Error(
        'Code implementation subtask not found. Did you run init?'
      );
    }

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress');

    // Get agent config
    const agentConfig = config.agents['code-impl'];
    if (!agentConfig) {
      throw new Error('Code implementation agent not found in config');
    }

    // Read design and requirements for context
    const designPath = join(config.featureDocsDir, ctx.ticketId, 'design.md');
    const requirementsPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'requirements.md'
    );

    const design = await readFileIfExists(designPath);
    const requirements = await readFileIfExists(requirementsPath);

    if (!design) {
      throw new Error('Design document not found. Did you run design step?');
    }

    // Get ticket info
    const ticket = await jira.getIssue(ctx.ticketId);

    // Prepare variables for the agent
    const variables = {
      TICKET_ID: ctx.ticketId,
      TICKET_SUMMARY: ticket.fields.summary,
      REQUIREMENTS: requirements || '',
      DESIGN: design,
      FEATURE_DIR: featureDir(ctx.repoRoot, ctx.ticketId),
      REPO_ROOT: ctx.repoRoot,
    };

    // Run the code implementation agent
    Logger.info('Running code implementation...');
    const result = await runAgent(ctx, agentConfig, variables);
    const output = result.summary;

    // Save implementation output
    const implPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'implementation.md'
    );
    await writeFileWithDir(implPath, output);
    Logger.success(`Implementation notes saved to: ${implPath}`);

    // Check if any files were created/modified
    const changes = extractFileChanges(output);

    // Update Jira with summary
    const comment = `h2. Code Implementation Complete

Implementation has been completed based on the technical design.

h3. Files Modified/Created:
${changes.length > 0 ? changes.map(f => `* ${f}`).join('\n') : '* No file changes reported'}

h3. Implementation Checklist:
IMPL_CHECKLIST
${generateImplementationChecklist(output)}

h3. Next Steps:
# Review the implementation
# Run: {code}ai-dev ${ctx.ticketId} code-test{code} to write tests

h3. Files:
* Implementation: [implementation.md|${implPath.replace(ctx.repoRoot + '/', '')}]
* Design: [design.md|${designPath.replace(ctx.repoRoot + '/', '')}]`;

    await jira.addComment(subtaskKey, comment);

    // Upload implementation file as attachment
    await jira.uploadAttachment(subtaskKey, implPath);

    // Commit and push changes if any
    if (changes.length > 0) {
      const summary = ticket.fields.summary
        .replace(/["\n\r]/g, ' ')
        .slice(0, 50);
      const commitMsg = `feat: ${summary}`;
      const hasChanges = commitAndPush(commitMsg);
      if (hasChanges) {
        Logger.success('Changes committed and pushed');
      }
    }

    // Transition to Done if not in code alias mode
    if (!ctx.codeAliasMode) {
      await jira.transitionTo(subtaskKey, 'Done');
    }

    Logger.success('Code implementation step completed');

    if (!ctx.codeAliasMode) {
      console.log(
        `
Next command:
  ai-dev ${ctx.ticketId} code-test
      `.trim()
      );
    }
  } catch (error) {
    Logger.error(`Code implementation step failed: ${error}`);
    throw error;
  }
}

function extractFileChanges(output: string): string[] {
  const changes: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Look for file creation/modification patterns
    const patterns = [
      /Created:\s*(.+)$/,
      /Modified:\s*(.+)$/,
      /Updated:\s*(.+)$/,
      /File:\s*(.+)$/,
      /`([^`]+\.(ts|js|tsx|jsx|json|md|css|scss))`/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const file = match[1].trim();
        if (file && !changes.includes(file)) {
          changes.push(file);
        }
      }
    }
  }

  return changes;
}

function generateImplementationChecklist(output: string): string {
  const checklist: string[] = [
    '- [ ] Code follows project coding standards',
    '- [ ] Error handling implemented',
    '- [ ] Logging added where appropriate',
    '- [ ] Code is self-documenting',
    '- [ ] No hardcoded values',
    '- [ ] Performance considerations addressed',
  ];

  // Look for specific implementation details in output
  if (output.includes('test')) {
    checklist.push('- [ ] Testable code structure');
  }

  if (output.includes('API') || output.includes('endpoint')) {
    checklist.push('- [ ] API endpoints documented');
    checklist.push('- [ ] Input validation added');
  }

  if (output.includes('database') || output.includes('DB')) {
    checklist.push('- [ ] Database queries optimized');
    checklist.push('- [ ] Transactions handled correctly');
  }

  if (output.includes('security') || output.includes('auth')) {
    checklist.push('- [ ] Security best practices followed');
    checklist.push('- [ ] Authorization implemented');
  }

  return checklist.join('\n');
}
