import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import {
  getSubtaskKey,
  featureDir,
  readFileIfExists,
  writeFileWithDir,
  readMarker,
  writeMarker,
} from '../core/file-helpers.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

export async function resolveCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Resolving Open Questions: ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);

  try {
    // Get the requirements subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'requirements'
    );
    if (!subtaskKey) {
      Logger.error('Error: Requirements subtask not found. Run init first.');
      process.exit(1);
    }

    Logger.info(`  Subtask: ${subtaskKey}`);
    Logger.info('');

    // Check requirements file exists
    const reqFile = join(
      featureDir(ctx.repoRoot, ctx.ticketId),
      'requirements.md'
    );
    let reqContent: string;

    try {
      reqContent = (await readFileIfExists(reqFile)) ?? '';
    } catch {
      Logger.error(
        'Error: requirements.md not found. Run requirements step first.'
      );
      process.exit(1);
    }

    // Check for old format
    if (!reqContent.includes('## Design Decisions')) {
      Logger.error(
        'Error: requirements.md uses the old ## Open Questions format.'
      );
      Logger.error(
        '  Re-run the requirements step to generate the structured ## Design Decisions format.'
      );
      process.exit(1);
    }

    // Fetch comments from Jira
    Logger.info('Fetching comments from Jira...');
    const comments = await jira.getComments(subtaskKey);

    // Find latest comment with Q1:, Q2: answers
    const latestAnswers = extractLatestAnswers(comments);

    if (!latestAnswers) {
      Logger.warn('No answers yet. Waiting for PO to reply in Jira.');
      Logger.info(`  ${ctx.jira.baseUrl}/browse/${subtaskKey}`);
      process.exit(1);
    }

    Logger.info('Answers found. Updating requirements.md...');

    // Build answers file: lines of "qnum|answer text"
    const answers = parseAnswers(latestAnswers);

    if (answers.size === 0) {
      Logger.warn('No valid answers found in comments');
      process.exit(1);
    }

    // Apply answers to requirements using AWK-like logic
    const updatedContent = applyAnswersToRequirements(reqContent, answers);

    // Write updated content
    await writeFileWithDir(reqFile, updatedContent);

    // Check if any Q blocks remain without a Decision: line
    if (hasUnresolvedQuestions(updatedContent)) {
      // Increment round counter and post remaining unresolved blocks
      const roundFile = join(
        featureDir(ctx.repoRoot, ctx.ticketId),
        '.questions-round'
      );
      let round = 1;
      try {
        round = parseInt(
          (await readMarker(ctx.repoRoot, ctx.ticketId, 'questions-round')) ||
            '1'
        );
      } catch {
        // Default to 1
      }
      round++;
      await writeMarker(
        ctx.repoRoot,
        ctx.ticketId,
        'questions-round',
        round.toString()
      );

      // Extract new questions
      const newQuestions = extractUnresolvedQuestions(updatedContent);
      const newQuestionsPlain = stripMarkdown(newQuestions);

      const newComment = `⚠️  Open Questions — Round ${round}

Previous answers applied. New questions arose:

Please reply using the same format:
  Q1: [your answer]
  Q2: [your answer]
  ...

----
${newQuestionsPlain}`;

      await jira.addComment(subtaskKey, newComment);

      Logger.info(`Posted round ${round} questions`);
    } else {
      // All resolved - upload and transition
      await jira.uploadAttachment(subtaskKey, reqFile);

      const resolvedComment = `✅ All questions resolved!

Decisions have been incorporated into requirements.md

----
Ready for Design phase. Transition this subtask to Done, then run:
  ai-dev ${ctx.ticketId} design`;

      await jira.addComment(subtaskKey, resolvedComment);

      Logger.success('All questions resolved and incorporated');
      Logger.info('');
      Logger.info('Next: Transition subtask to Done, then run:');
      Logger.info(`  ai-dev ${ctx.ticketId} design`);
    }
  } catch (error) {
    Logger.error(`Resolve step failed: ${error}`);
    throw error;
  }
}

function extractLatestAnswers(comments: any[]): string | null {
  // Process comments in reverse order
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    const body = extractTextFromJiraComment(comment.body);

    // Check if this comment contains Q1:, Q2: format
    if (body && /^Q\d+:/m.test(body)) {
      return body;
    }
  }

  return null;
}

function extractTextFromJiraComment(body: any): string {
  if (!body || !body.content) return '';

  const extractText = (content: any[]): string => {
    let text = '';
    for (const node of content) {
      if (node.type === 'text') {
        text += node.text || '';
      } else if (node.type === 'paragraph' && node.content) {
        text += extractText(node.content);
      } else if (node.content) {
        text += extractText(node.content);
      } else if (node.text) {
        text += node.text;
      }
    }
    return text;
  };

  return extractText(
    Array.isArray(body.content) ? body.content : [body.content]
  );
}

function parseAnswers(text: string): Map<number, string> {
  const answers = new Map<number, string>();
  const lines = text.split('\n');

  let currentQ = 0;
  let currentAnswer = '';

  for (const line of lines) {
    const match = line.match(/^Q\s*(\d+)\s*:\s*(.*)/i);
    if (match) {
      if (currentQ > 0 && currentAnswer) {
        answers.set(currentQ, currentAnswer.trim());
      }
      currentQ = parseInt(match[1], 10);
      currentAnswer = match[2] || '';
    } else if (currentQ > 0 && line.trim()) {
      currentAnswer += '\n' + line;
    }
  }

  if (currentQ > 0 && currentAnswer) {
    answers.set(currentQ, currentAnswer.trim());
  }

  return answers;
}

function applyAnswersToRequirements(
  content: string,
  answers: Map<number, string>
): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let inDesignDecisions = false;
  let currentQuestion = 0;
  let questionBuffer: string[] = [];
  let existingDecision = '';

  for (const line of lines) {
    if (line.startsWith('## Design Decisions')) {
      inDesignDecisions = true;
      result.push(line);
      continue;
    }

    if (
      inDesignDecisions &&
      line.startsWith('## ') &&
      !line.includes('Design Decisions')
    ) {
      // Flush any pending question
      if (currentQuestion > 0) {
        flushQuestion(
          result,
          questionBuffer,
          answers.get(currentQuestion) || existingDecision
        );
        questionBuffer = [];
        currentQuestion = 0;
        existingDecision = '';
      }
      inDesignDecisions = false;
      result.push(line);
      continue;
    }

    if (inDesignDecisions && line.match(/^### Q\d+/)) {
      // Flush previous question
      if (currentQuestion > 0) {
        flushQuestion(
          result,
          questionBuffer,
          answers.get(currentQuestion) || existingDecision
        );
      }

      // Start new question
      const match = line.match(/### Q(\d+)/);
      currentQuestion = match ? parseInt(match[1], 10) : 0;
      questionBuffer = [line];
      existingDecision = '';
      continue;
    }

    if (
      inDesignDecisions &&
      currentQuestion > 0 &&
      line.startsWith('Decision:')
    ) {
      existingDecision = line.substring(10).trim();
      questionBuffer.push(line);
      continue;
    }

    if (inDesignDecisions && currentQuestion > 0) {
      questionBuffer.push(line);
      continue;
    }

    result.push(line);
  }

  // Flush last question if needed
  if (currentQuestion > 0) {
    flushQuestion(
      result,
      questionBuffer,
      answers.get(currentQuestion) || existingDecision
    );
  }

  return result.join('\n');
}

function flushQuestion(
  result: string[],
  buffer: string[],
  decision: string
): void {
  // Add all non-empty lines from buffer
  let i = buffer.length - 1;
  while (i >= 0 && buffer[i].trim() === '') {
    i--;
  }

  for (let j = 0; j <= i; j++) {
    result.push(buffer[j]);
  }

  // Check if there was a Decision line in the buffer
  const hadDecisionLine = buffer.some(line => line.startsWith('Decision:'));

  if (decision) {
    result.push(`Decision: ${decision}`);
  } else if (hadDecisionLine) {
    // Preserve empty Decision line if it existed
    result.push('Decision:');
  }

  result.push('');
}

function hasUnresolvedQuestions(content: string): boolean {
  // Check for old format
  if (content.includes('## Open Questions')) {
    return true;
  }

  // Check for Design Decisions section
  const lines = content.split('\n');
  let inDesignDecisions = false;
  const questions: number[] = [];
  const decisions: Record<number, boolean> = {};

  for (const line of lines) {
    if (line.startsWith('## Design Decisions')) {
      inDesignDecisions = true;
      continue;
    }

    if (
      inDesignDecisions &&
      line.startsWith('## ') &&
      !line.includes('Design Decisions')
    ) {
      inDesignDecisions = false;
      break;
    }

    if (inDesignDecisions && line.match(/^### Q\d+/)) {
      const match = line.match(/### Q(\d+)/);
      if (match) {
        questions.push(parseInt(match[1], 10));
        decisions[questions[questions.length - 1]] = false;
      }
    }

    if (inDesignDecisions && line.startsWith('Decision:')) {
      if (questions.length > 0) {
        const decisionText = line.substring('Decision:'.length).trim();
        decisions[questions[questions.length - 1]] = decisionText.length > 0;
      }
    }
  }

  // Return true if any question lacks a decision
  return questions.some(q => !decisions[q]);
}

function extractUnresolvedQuestions(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let inDesignDecisions = false;
  let inQuestion = false;
  let questionBuffer = '';
  let hasDecision = false;

  for (const line of lines) {
    if (line.startsWith('## Design Decisions')) {
      inDesignDecisions = true;
      continue;
    }

    if (
      inDesignDecisions &&
      line.startsWith('## ') &&
      !line.includes('Design Decisions')
    ) {
      if (questionBuffer && !hasDecision) {
        result.push(questionBuffer);
      }
      break;
    }

    if (inDesignDecisions && line.match(/^### Q\d+/)) {
      if (questionBuffer && !hasDecision) {
        result.push(questionBuffer);
      }
      questionBuffer = line + '\n';
      inQuestion = true;
      hasDecision = false;
      continue;
    }

    if (inDesignDecisions && inQuestion && line.startsWith('Decision:')) {
      const decisionText = line.substring('Decision:'.length).trim();
      hasDecision = decisionText.length > 0;
      continue;
    }

    if (inDesignDecisions && inQuestion) {
      questionBuffer += line + '\n';
    }
  }

  // Check last question
  if (questionBuffer && !hasDecision) {
    result.push(questionBuffer);
  }

  return result.join('\n').replace(/\n\s*$/gm, '');
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

export {
  extractLatestAnswers,
  parseAnswers,
  applyAnswersToRequirements,
  hasUnresolvedQuestions,
  extractUnresolvedQuestions,
  stripMarkdown,
};
