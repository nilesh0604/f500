import type { SlackMessageResponse } from '@orderflow/shared-types';
import type { Citation } from '@orderflow/shared-types/rag';

const MAX_TEXT_LENGTH = 2900;
const ELLIPSIS = '\u2026';

/**
 * Format a RAG answer and citation list into a Slack in_channel message.
 * Truncates to 2900 chars and appends a formatted sources line.
 */
export function formatRagResponse(
  answer: string,
  citations: Citation[]
): SlackMessageResponse {
  const truncated = truncateText(answer);
  const sourceSuffix = buildSourceSuffix(citations);

  return {
    response_type: 'in_channel',
    replace_original: true,
    text: sourceSuffix ? `${truncated}\n\n${sourceSuffix}` : truncated,
  };
}

/**
 * Build an ephemeral error response for Slack.
 */
export function buildErrorResponse(message: string): SlackMessageResponse {
  return { response_type: 'ephemeral', text: message };
}

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + ELLIPSIS;
}

function buildSourceSuffix(citations: Citation[]): string {
  if (citations.length === 0) return '';

  const labels = citations
    .slice(0, 3)
    .map(c => buildCitationLabel(c))
    .filter((l): l is string => l.length > 0);

  return labels.length > 0 ? `_Sources: ${labels.join(' \u00b7 ')}_` : '';
}

function buildCitationLabel(citation: Citation): string {
  const parts: string[] = [];
  if (citation.book) parts.push(citation.book);
  if (citation.chapter) parts.push(`Ch.${citation.chapter}`);
  return parts.length > 0 ? parts.join(' ') : citation.title;
}
