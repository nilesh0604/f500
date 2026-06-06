import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { loadConfig } from '../config.js';
import { Shell } from '../core/shell.js';

interface TicketOutput {
  summary: string;
  description: string;
  type: string;
  priority?: string;
  labels?: string[];
}

export async function createCommand(
  ctx: PipelineContext,
  idea: string
): Promise<void> {
  if (!idea) {
    Logger.error('Usage: ai-dev <PROJECT_KEY> create "your idea here"');
    Logger.error('  Example: ai-dev OF create "add session timeout to chat"');
    process.exit(1);
  }

  const projectKey = ctx.ticketId || 'OF';
  Logger.banner(`Creating ticket from idea`);
  Logger.info(`  Project: ${projectKey}`);
  Logger.info(`  Idea:    ${idea}`);
  Logger.info('');

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Get agent config for ticket creation
    const agentConfig = config.agents['ticket-creator'];
    if (!agentConfig) {
      throw new Error('Ticket creator agent not found in config');
    }

    // Run the agent to generate ticket details
    Logger.info('Analyzing codebase and generating ticket...');
    const agentOutput = await runAgent(ctx, agentConfig, {
      IDEA: idea,
      PROJECT_KEY: projectKey,
    });

    // Extract JSON from agent output (between markers)
    const ticketJson = extractJsonFromOutput(agentOutput);
    if (!ticketJson) {
      Logger.error('Could not parse ticket from agent output.');
      Logger.error('Agent output (last 50 lines):');
      const lines = agentOutput.split('\n').slice(-50).join('\n');
      console.error(lines);
      process.exit(1);
    }

    // Parse and validate the ticket output
    const ticket: TicketOutput = JSON.parse(ticketJson);
    if (!ticket.summary) {
      throw new Error('Missing required field: summary');
    }

    // Map type to Jira issue type name
    let jiraIssueType: string;
    switch (ticket.type) {
      case 'feature':
        jiraIssueType = 'Story';
        break;
      case 'bug':
        jiraIssueType = 'Bug';
        break;
      case 'chore':
        jiraIssueType = 'Task';
        break;
      default:
        jiraIssueType = 'Task';
        break;
    }

    // Map priority to Jira priority name
    let jiraPriority: string;
    switch (ticket.priority) {
      case 'Critical':
        jiraPriority = 'Highest';
        break;
      case 'High':
        jiraPriority = 'High';
        break;
      case 'Medium':
        jiraPriority = 'Medium';
        break;
      case 'Low':
        jiraPriority = 'Low';
        break;
      default:
        jiraPriority = 'Medium';
        break;
    }

    Logger.info('Generated ticket:');
    Logger.info(`  Type:     ${jiraIssueType}`);
    Logger.info(`  Summary:  ${ticket.summary}`);
    Logger.info(`  Priority: ${jiraPriority}`);
    Logger.info(`  Labels:   ${ticket.labels?.join(',') || ''}`);
    Logger.info('');

    // Get the issue type ID
    let issueTypeId = await jira.getIssueTypeId(projectKey, jiraIssueType);
    if (!issueTypeId) {
      // Fallback to Task
      issueTypeId = await jira.getIssueTypeId(projectKey, 'Task');
      if (!issueTypeId) {
        throw new Error(
          `Could not find any valid issue type for project '${projectKey}'`
        );
      }
    }

    // Create the ticket in Jira
    const response = await jira.request<{ key: string }>(
      'POST',
      '/rest/api/3/issue',
      {
        fields: {
          project: { key: projectKey },
          issuetype: { id: issueTypeId },
          summary: ticket.summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: ticket.description,
                  },
                ],
              },
            ],
          },
          priority: { name: jiraPriority },
          labels: ticket.labels || [],
        },
      }
    );

    const newTicketKey = response.key;
    Logger.success(`Created issue: ${newTicketKey}`);
    Logger.info(`View: ${ctx.jira.baseUrl}/browse/${newTicketKey}`);
  } catch (error) {
    Logger.error(`Failed to create ticket: ${error}`);
    throw error;
  }
}

function extractJsonFromOutput(output: string): string | null {
  const startMarker = '---JSON_OUTPUT_START---';
  const endMarker = '---JSON_OUTPUT_END---';

  const startIndex = output.indexOf(startMarker);
  const endIndex = output.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  const jsonSection = output.substring(
    startIndex + startMarker.length,
    endIndex
  );

  // Remove the marker lines and clean up
  const lines = jsonSection.split('\n');
  const jsonLines = lines.filter(line => !line.includes('---JSON_OUTPUT'));

  return jsonLines.join('\n').trim();
}
