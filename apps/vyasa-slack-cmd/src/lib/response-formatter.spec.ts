import { formatRagResponse, buildErrorResponse } from './response-formatter';
import type { Citation } from '@orderflow/shared-types/rag';

// AC: AC-1, AC-5, EDGE-5 — response formatting and truncation
describe('formatRagResponse', () => {
  it('should_return_in_channel_message_with_replace_original_when_answer_provided', () => {
    const result = formatRagResponse('Karna was a great warrior.', []);

    expect(result.response_type).toBe('in_channel');
    expect(result.replace_original).toBe(true);
    expect(result.text).toContain('Karna was a great warrior.');
  });

  // EDGE-5 — Oversized RAG response truncated at 2900 chars
  it('should_truncate_response_at_2900_chars_when_answer_exceeds_limit', () => {
    const longAnswer = 'x'.repeat(3000);
    const result = formatRagResponse(longAnswer, []);

    // 2900 chars of 'x' + 1 ellipsis char (…)
    expect(result.text.length).toBe(2901);
    expect(result.text.endsWith('\u2026')).toBe(true);
  });

  it('should_not_truncate_response_when_answer_is_exactly_2900_chars', () => {
    const answer = 'y'.repeat(2900);
    const result = formatRagResponse(answer, []);

    expect(result.text).toBe(answer);
    expect(result.text).not.toContain('\u2026');
  });

  it('should_include_sources_suffix_when_citations_are_provided', () => {
    const citations: Citation[] = [
      { title: 'Mahabharata', book: 'Adi Parva', chapter: '1' },
    ];
    const result = formatRagResponse('Some answer.', citations);

    expect(result.text).toContain('_Sources:');
    expect(result.text).toContain('Adi Parva');
    expect(result.text).toContain('Ch.1');
  });

  it('should_not_include_sources_when_citations_array_is_empty', () => {
    const result = formatRagResponse('Some answer.', []);

    expect(result.text).not.toContain('_Sources:');
    expect(result.text).toBe('Some answer.');
  });

  it('should_limit_citations_to_first_3_when_more_than_3_are_provided', () => {
    const citations: Citation[] = [
      { title: 'T1', book: 'Book 1' },
      { title: 'T2', book: 'Book 2' },
      { title: 'T3', book: 'Book 3' },
      { title: 'T4', book: 'Book 4' },
    ];
    const result = formatRagResponse('Answer', citations);

    expect(result.text).toContain('Book 1');
    expect(result.text).toContain('Book 2');
    expect(result.text).toContain('Book 3');
    expect(result.text).not.toContain('Book 4');
  });

  it('should_use_citation_title_as_fallback_when_no_book_or_chapter_present', () => {
    const citations: Citation[] = [{ title: 'Mahabharata Text' }];
    const result = formatRagResponse('Answer', citations);

    expect(result.text).toContain('Mahabharata Text');
  });

  // Branch: labels.length === 0 after filter (all labels are empty strings)
  it('should_not_include_sources_when_all_citation_labels_are_empty_strings', () => {
    const citations: Citation[] = [{ title: '' }];
    const result = formatRagResponse('Answer', citations);

    expect(result.text).not.toContain('_Sources:');
    expect(result.text).toBe('Answer');
  });
});

// AC: AC-5 — User-friendly error message via ephemeral response
describe('buildErrorResponse', () => {
  it('should_return_ephemeral_response_with_given_message_when_called', () => {
    const result = buildErrorResponse(
      'Vyasa is temporarily unavailable \u2014 please try again.'
    );

    expect(result.response_type).toBe('ephemeral');
    expect(result.text).toBe(
      'Vyasa is temporarily unavailable \u2014 please try again.'
    );
    expect(result.replace_original).toBeUndefined();
  });
});
