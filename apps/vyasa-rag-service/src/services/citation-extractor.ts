/**
 * Citation Extraction Service
 * Deduplicates and formats citations from retrieved documents
 */

import { RetrievalResult, Citation } from '../types';
import { logger } from '../lib/logger';

/**
 * Extract citations from retrieval results
 * - Deduplicates by title
 * - Formats with book/chapter metadata
 * - Sorted by relevance
 */
export function extractCitations(results: RetrievalResult[]): Citation[] {
  if (results.length === 0) {
    return [];
  }

  // Create unique citations keyed by book+chapter
  const citationMap = new Map<string, Citation>();

  for (const result of results) {
    const key = `${result.metadata.book || 'Unknown'}-${result.metadata.chapter || 'Unknown'}`;

    // Keep the one with highest score if duplicate
    const existing = citationMap.get(key);
    if (!existing || result.score > (existing.score || 0)) {
      const citation = formatCitation(result);
      citationMap.set(key, citation);
    }
  }

  // Convert to array and sort by score
  const citations = Array.from(citationMap.values()).sort((a, b) =>
    (b.score || 0) > (a.score || 0) ? 1 : -1
  );

  logger.debug('Extracted citations', {
    inputResults: results.length,
    uniqueCitations: citations.length,
  });

  return citations;
}

/**
 * Format a retrieval result as a citation
 */
function formatCitation(result: RetrievalResult): Citation {
  const { metadata, score } = result;

  const titleParts: string[] = [];

  if (metadata.book || metadata.chapter) {
    titleParts.push('Mahabharata');
    if (metadata.book) {
      titleParts.push(metadata.book);
    }
    if (metadata.chapter) {
      titleParts.push(metadata.chapter);
    }
  } else {
    const filename = metadata.source.split('/').pop() || metadata.source;
    titleParts.push(filename);
  }

  return {
    title: titleParts.join(' - '),
    book: metadata.book,
    chapter: metadata.chapter,
    verse: metadata.verse,
    score,
  };
}

/**
 * Deduplicate citations by title
 * Keeps the highest scoring citation for each unique title
 */
export function deduplicateCitations(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();

  for (const citation of citations) {
    const key = citation.title;
    const existing = seen.get(key);

    if (!existing || (citation.score || 0) > (existing.score || 0)) {
      seen.set(key, citation);
    }
  }

  return Array.from(seen.values());
}

/**
 * Merge citations from multiple retrieval iterations
 */
export function mergeCitations(citationsArrays: Citation[][]): Citation[] {
  const allCitations = citationsArrays.flat();
  return deduplicateCitations(allCitations);
}

/**
 * Format citations for display in response
 */
export function formatCitationsForDisplay(citations: Citation[]): string {
  if (citations.length === 0) {
    return '';
  }

  const formatted = citations.map((c, i) => {
    let ref = `[${i + 1}] ${c.title}`;
    if (c.verse) {
      ref += ` (${c.verse})`;
    }
    return ref;
  });

  return '\n\nSources:\n' + formatted.join('\n');
}
