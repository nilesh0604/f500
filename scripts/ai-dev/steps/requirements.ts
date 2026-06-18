import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getSubtaskKey,
  featureDir,
  readFileIfExists,
  writeFileWithDir,
  writeMarker,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { join } from 'path';
import { Shell } from '../core/shell.js';

export async function requirementsCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Requirements Analysis: ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'requirements');

    // Get the requirements subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'requirements'
    );
    if (!subtaskKey) {
      throw new Error('Requirements subtask not found. Did you run init?');
    }

    Logger.info(`  Subtask: ${subtaskKey}`);
    Logger.info('');

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress').catch(() => {});

    // Get agent config
    const agentConfig = config.agents['requirements'];
    if (!agentConfig) {
      throw new Error('Requirements agent not found in config');
    }

    // Read ticket context
    const contextFile = join(
      featureDir(ctx.repoRoot, ctx.ticketId),
      '.ticket-context'
    );
    const context = (await readFileIfExists(contextFile)) ?? '';

    // Run the requirements agent
    Logger.info('Running requirements analysis...');
    const result = await runAgent(ctx, agentConfig, {
      TICKET_ID: ctx.ticketId,
      TICKET_CONTEXT: context,
    });
    const output = result.summary;

    // Verify output file was created; if not, write agent stdout as fallback
    const reqFile = join(
      featureDir(ctx.repoRoot, ctx.ticketId),
      'requirements.md'
    );

    let reqContent = (await readFileIfExists(reqFile)) ?? '';

    if (!reqContent && output) {
      // Agent ran in text-only mode (no Write tool access) — persist its stdout
      Logger.info(
        'Agent output captured; writing requirements.md from stdout...'
      );
      await writeFileWithDir(reqFile, output);
      reqContent = output;
    }

    if (!reqContent) {
      await jira.addComment(
        subtaskKey,
        'Requirements agent failed to produce output. Re-run needed.'
      );
      Logger.error('Error: requirements.md not created. Re-run this step.');
      process.exit(1);
    }

    // Count acceptance criteria and edge cases using grep-like logic
    const acCount = (
      reqContent.match(/^\*\*Given\*\*|^\d+\. \*\*Given\*\*/gm) || []
    ).length;
    const edgeCount = (reqContent.match(/^\d+\. What happens/gm) || []).length;

    // Post summary comment to Jira
    const commentBody = `AI Pipeline — Requirements Analysis Complete

Ticket: ${ctx.ticketId}
Acceptance Criteria: ${acCount} items (Given/When/Then format)
Edge Cases: ${edgeCount} identified

Full document attached: requirements.md

----
Review the requirements document. When satisfied, transition this subtask to Done to unlock the Design phase.`;

    await jira.addComment(subtaskKey, commentBody);

    // Upload requirements file as attachment
    await jira.uploadAttachment(subtaskKey, reqFile);

    // Parse and post unresolved Design Decision blocks if present
    const openQuestions = parseOpenQuestions(reqContent);

    if (openQuestions) {
      // Write questions round marker
      await writeMarker(ctx.repoRoot, ctx.ticketId, 'questions-round', '1');

      const questionsPlain = stripMarkdown(openQuestions);
      const questionsComment = `⚠️  Open Questions — Round 1

${questionsPlain}

----
Please answer these questions in the comments. Use the format:
### Q1: <question text>
Decision: <your decision>

After answering, run: ai-dev ${ctx.ticketId} resolve`;

      await jira.addComment(subtaskKey, questionsComment);

      Logger.info(
        `Found and posted ${openQuestions.split('### Q').length - 1} open questions`
      );
    }

    Logger.success('');
    Logger.success('Requirements analysis complete');
    Logger.info(`  Subtask: ${ctx.jira.baseUrl}/browse/${subtaskKey}`);

    if (openQuestions) {
      Logger.info('');
      Logger.info('Next: Answer questions in Jira, then run:');
      Logger.info(`  ai-dev ${ctx.ticketId} resolve`);
    } else {
      Logger.info('');
      Logger.info('Next: Transition subtask to Done, then run:');
      Logger.info(`  ai-dev ${ctx.ticketId} design`);
    }
  } catch (error) {
    Logger.error(`Requirements step failed: ${error}`);
    throw error;
  }
}

function parseOpenQuestions(content: string): string | null {
  const lines = content.split('\n');
  let inDesignDecisions = false;
  let inQuestion = false;
  let questionBlock = '';
  let hasDecision = false;
  const questions: string[] = [];

  for (const line of lines) {
    if (line.match(/^## Design Decisions/)) {
      inDesignDecisions = true;
      continue;
    }

    if (inDesignDecisions && line.match(/^## /)) {
      // End of Design Decisions section
      if (questionBlock && !hasDecision) {
        questions.push(questionBlock);
      }
      break;
    }

    if (inDesignDecisions && line.match(/^### Q\d+/)) {
      // Start of new question
      if (questionBlock && !hasDecision) {
        questions.push(questionBlock);
      }
      questionBlock = line + '\n';
      inQuestion = true;
      hasDecision = false;
    } else if (inDesignDecisions && line.match(/^Decision:/)) {
      hasDecision = true;
    } else if (inDesignDecisions && inQuestion) {
      questionBlock += line + '\n';
    }
  }

  // Check last question
  if (questionBlock && !hasDecision) {
    questions.push(questionBlock);
  }

  return questions.length > 0 ? questions.join('\n') : null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^### Q([0-9][0-9]*): /gm, 'Q$1: ')
    .replace(/^### /gm, '')
    .replace(/^## /gm, '')
    .replace(/^# /gm, '')
    .replace(/^[ \t]*$/gm, '')
    .trim();
}
