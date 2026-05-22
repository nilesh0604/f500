/**
 * Unit tests for Context Assembler
 */

import {
  assembleContext,
  mergeContexts,
  estimateTokens,
  truncateContext,
} from '../../src/services/context-assembler';
import { RetrievalResult } from '../../src/types';

describe('ContextAssembler', () => {
  describe('assembleContext', () => {
    const mockResults: RetrievalResult[] = [
      {
        content: 'Karna was a great warrior',
        metadata: {
          source: 'doc1.txt',
          book: 'Adi Parva',
          chapter: 'Sambhava',
        },
        score: 0.95,
      },
      {
        content: 'He was the son of Kunti',
        metadata: {
          source: 'doc2.txt',
          book: 'Adi Parva',
          chapter: 'Sambhava',
        },
        score: 0.9,
      },
      {
        content: 'Born to the Sun god',
        metadata: {
          source: 'doc3.txt',
          book: 'Adi Parva',
          chapter: 'Sambhava',
        },
        score: 0.7, // Below 75% threshold (0.95 * 0.75 = 0.7125)
      },
      {
        content: 'Raised by charioteer',
        metadata: { source: 'doc4.txt' },
        score: 0.6, // Below threshold
      },
    ];

    it('should filter results by 75% threshold', () => {
      const result = assembleContext(mockResults);

      // Max score = 0.95, threshold = 0.7125
      // Should include first two (0.95, 0.9), exclude last two (0.7, 0.6)
      expect(result.filteredCount).toBe(2);
      expect(result.totalCount).toBe(4);
    });

    it('should format chunks with source attribution', () => {
      const result = assembleContext([mockResults[0]]);

      expect(result.context).toContain('[Adi Parva - Sambhava]');
      expect(result.context).toContain('Karna was a great warrior');
    });

    it('should use source filename when metadata missing', () => {
      const resultWithFallback = assembleContext([
        {
          content: 'Test content',
          metadata: { source: 'path/to/document.txt' },
          score: 0.9,
        },
      ]);

      expect(resultWithFallback.context).toContain('[document.txt]');
    });

    it('should join chunks with double newline', () => {
      const result = assembleContext([mockResults[0], mockResults[1]]);

      expect(result.context).toContain('\n\n');
    });

    it('should handle empty results', () => {
      const result = assembleContext([]);

      expect(result.context).toBe('');
      expect(result.filteredCount).toBe(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('mergeContexts', () => {
    it('should merge multiple contexts', () => {
      const contexts = ['Context 1', 'Context 2'];
      const merged = mergeContexts(contexts);

      expect(merged).toContain('Context 1');
      expect(merged).toContain('Context 2');
      expect(merged).toContain('---');
    });

    it('should deduplicate identical contexts', () => {
      const contexts = ['Same context', 'Same context'];
      const merged = mergeContexts(contexts);

      // Should only appear once
      const matches = merged.match(/Same context/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      // 1 token ≈ 4 characters
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcdabcd')).toBe(2);
      expect(estimateTokens('abc')).toBe(1); // Ceiling
    });

    it('should handle empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('truncateContext', () => {
    it('should not truncate short context', () => {
      const shortContext = 'Short text';
      const result = truncateContext(shortContext, 1000);

      expect(result).toBe(shortContext);
    });

    it('should truncate long context', () => {
      const longContext = 'a'.repeat(10000); // ~2500 tokens
      const result = truncateContext(longContext, 500);

      expect(result).toContain('[Content truncated]');
      expect(estimateTokens(result)).toBeLessThan(600);
    });

    it('should truncate at paragraph boundary when possible', () => {
      const contextWithParagraphs =
        'Paragraph 1\n\nParagraph 2\n\nParagraph 3 with more content';
      const result = truncateContext(contextWithParagraphs, 10);

      // Should try to cut at paragraph boundary
      expect(result.endsWith('\n\n[Content truncated]')).toBe(true);
    });
  });
});
