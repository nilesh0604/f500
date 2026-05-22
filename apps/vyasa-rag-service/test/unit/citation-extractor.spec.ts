/**
 * Unit tests for Citation Extractor
 */

import {
  extractCitations,
  deduplicateCitations,
  mergeCitations,
  formatCitationsForDisplay,
} from '../../src/services/citation-extractor';
import { RetrievalResult, Citation } from '../../src/types';

describe('CitationExtractor', () => {
  const mockResults: RetrievalResult[] = [
    {
      content: 'Karna was a great warrior',
      metadata: {
        source: 's3://bucket/adi-parva.txt',
        book: 'Adi Parva',
        chapter: 'Sambhava Parva',
        verse: '1.104',
      },
      score: 0.92,
    },
    {
      content: 'Son of Kunti',
      metadata: {
        source: 's3://bucket/adi-parva.txt',
        book: 'Adi Parva',
        chapter: 'Sambhava Parva',
        verse: '1.105',
      },
      score: 0.88,
    },
    {
      content: 'Raised by charioteer',
      metadata: {
        source: 's3://bucket/adi-parva.txt',
        book: 'Adi Parva',
        chapter: 'Sambhava Parva',
      },
      score: 0.85,
    },
    {
      content: 'Different book content',
      metadata: {
        source: 's3://bucket/udyoga-parva.txt',
        book: 'Udyoga Parva',
        chapter: 'Bhagavad-Yana',
      },
      score: 0.9,
    },
  ];

  describe('extractCitations', () => {
    it('should extract citations from retrieval results', () => {
      const citations = extractCitations(mockResults);

      expect(citations).toHaveLength(2); // Deduplicated by book+chapter
      expect(citations[0].book).toBeDefined();
      expect(citations[0].chapter).toBeDefined();
    });

    it('should deduplicate by book and chapter', () => {
      // First 3 results have same book+chapter, should dedupe to 1
      const citations = extractCitations(mockResults.slice(0, 3));

      expect(citations).toHaveLength(1);
      expect(citations[0].score).toBe(0.92); // Highest score kept
    });

    it('should build proper title from metadata', () => {
      const citations = extractCitations([mockResults[0]]);

      expect(citations[0].title).toBe(
        'Mahabharata - Adi Parva - Sambhava Parva'
      );
    });

    it('should include verse when available', () => {
      const citations = extractCitations([mockResults[0]]);

      expect(citations[0].verse).toBe('1.104');
    });

    it('should sort by score descending', () => {
      const citations = extractCitations(mockResults);

      expect(citations[0].score).toBeGreaterThanOrEqual(
        citations[1].score || 0
      );
    });

    it('should handle empty results', () => {
      const citations = extractCitations([]);

      expect(citations).toHaveLength(0);
    });

    it('should use source filename when metadata missing', () => {
      const resultWithMinimalMetadata: RetrievalResult = {
        content: 'Test',
        metadata: { source: 'path/to/file.txt' },
        score: 0.8,
      };

      const citations = extractCitations([resultWithMinimalMetadata]);

      expect(citations[0].title).toContain('file.txt');
    });
  });

  describe('deduplicateCitations', () => {
    it('should remove duplicate citations by title', () => {
      const duplicates: Citation[] = [
        { title: 'Same Book', score: 0.8 },
        { title: 'Same Book', score: 0.9 },
        { title: 'Different Book', score: 0.85 },
      ];

      const deduped = deduplicateCitations(duplicates);

      expect(deduped).toHaveLength(2);
      expect(deduped.find(c => c.title === 'Same Book')?.score).toBe(0.9); // Higher score kept
    });

    it('should keep all unique citations', () => {
      const unique: Citation[] = [
        { title: 'Book A', score: 0.9 },
        { title: 'Book B', score: 0.85 },
        { title: 'Book C', score: 0.8 },
      ];

      const deduped = deduplicateCitations(unique);

      expect(deduped).toHaveLength(3);
    });
  });

  describe('mergeCitations', () => {
    it('should merge multiple citation arrays', () => {
      const arrays: Citation[][] = [
        [{ title: 'Book A', score: 0.9 }],
        [{ title: 'Book B', score: 0.85 }],
      ];

      const merged = mergeCitations(arrays);

      expect(merged).toHaveLength(2);
    });

    it('should deduplicate across arrays', () => {
      const arrays: Citation[][] = [
        [{ title: 'Same Book', score: 0.8 }],
        [{ title: 'Same Book', score: 0.9 }],
      ];

      const merged = mergeCitations(arrays);

      expect(merged).toHaveLength(1);
      expect(merged[0].score).toBe(0.9);
    });
  });

  describe('formatCitationsForDisplay', () => {
    it('should format citations with numbers', () => {
      const citations: Citation[] = [
        { title: 'Mahabharata - Adi Parva', verse: '1.1' },
        { title: 'Mahabharata - Udyoga Parva' },
      ];

      const formatted = formatCitationsForDisplay(citations);

      expect(formatted).toContain('[1] Mahabharata - Adi Parva (1.1)');
      expect(formatted).toContain('[2] Mahabharata - Udyoga Parva');
      expect(formatted).toContain('Sources:');
    });

    it('should return empty string for no citations', () => {
      const formatted = formatCitationsForDisplay([]);

      expect(formatted).toBe('');
    });
  });
});
