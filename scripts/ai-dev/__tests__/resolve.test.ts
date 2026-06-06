import {
  extractLatestAnswers,
  parseAnswers,
  applyAnswersToRequirements,
  hasUnresolvedQuestions,
  extractUnresolvedQuestions,
  stripMarkdown,
} from '../steps/resolve.js';

describe('resolve', () => {
  describe('extractLatestAnswers', () => {
    it('should extract answers from latest comment with Q1: format', () => {
      const comments = [
        {
          body: { content: [{ content: [{ text: 'Some initial comment' }] }] },
        },
        {
          body: {
            content: [
              {
                content: [
                  {
                    text: 'Q1: Use PostgreSQL for storage\nQ2: Use Redis for caching',
                  },
                ],
              },
            ],
          },
        },
      ];

      const result = extractLatestAnswers(comments);
      expect(result).toContain('Q1:');
      expect(result).toContain('Q2:');
    });

    it('should return null when no answers found', () => {
      const comments = [
        {
          body: {
            content: [{ content: [{ text: 'Just a regular comment' }] }],
          },
        },
      ];

      const result = extractLatestAnswers(comments);
      expect(result).toBeNull();
    });

    it('should find answers in older comment when newest has no answers', () => {
      const comments = [
        {
          body: {
            content: [{ content: [{ text: 'Q1: Answer in first comment' }] }],
          },
        },
        { body: { content: [{ content: [{ text: 'Just a comment' }] }] } },
      ];

      const result = extractLatestAnswers(comments);
      expect(result).toBe('Q1: Answer in first comment');
    });

    it('should handle empty comments array', () => {
      const result = extractLatestAnswers([]);
      expect(result).toBeNull();
    });

    it('should handle malformed comment body', () => {
      const comments = [
        { body: null },
        { body: { content: null } },
        { body: { content: [{ content: [{ text: 'Q1: Valid answer' }] }] } },
      ];

      const result = extractLatestAnswers(comments);
      expect(result).toBe('Q1: Valid answer');
    });
  });

  describe('parseAnswers', () => {
    it('should parse Q1, Q2 format', () => {
      const text = 'Q1: Use PostgreSQL\nQ2: Use Redis';
      const result = parseAnswers(text);

      expect(result.get(1)).toBe('Use PostgreSQL');
      expect(result.get(2)).toBe('Use Redis');
    });

    it('should handle Q with spaces', () => {
      const text = 'Q 1: Answer 1\nQ 2: Answer 2';
      const result = parseAnswers(text);

      expect(result.get(1)).toBe('Answer 1');
      expect(result.get(2)).toBe('Answer 2');
    });

    it('should handle multiline answers', () => {
      const text = 'Q1: First line\n  Second line\nQ2: Single line';
      const result = parseAnswers(text);

      expect(result.get(1)).toBe('First line\n  Second line');
      expect(result.get(2)).toBe('Single line');
    });

    it('should return empty map for no matches', () => {
      const text = 'Just some text without questions';
      const result = parseAnswers(text);

      expect(result.size).toBe(0);
    });

    it('should handle case insensitive Q prefix', () => {
      const text = 'q1: lowercase\nQ2: Mixed case';
      const result = parseAnswers(text);

      expect(result.get(1)).toBe('lowercase');
      expect(result.get(2)).toBe('Mixed case');
    });
  });

  describe('applyAnswersToRequirements', () => {
    const requirementsWithQuestions = `# Feature: Test

## Design Decisions

### Q1: Which database?

Decision:

### Q2: Which cache?

Decision:
`;

    it('should apply single answer to question', () => {
      const answers = new Map([[1, 'PostgreSQL']]);
      const result = applyAnswersToRequirements(
        requirementsWithQuestions,
        answers
      );

      expect(result).toContain('Decision: PostgreSQL');
    });

    it('should apply multiple answers to questions', () => {
      const answers = new Map([
        [1, 'PostgreSQL'],
        [2, 'Redis'],
      ]);
      const result = applyAnswersToRequirements(
        requirementsWithQuestions,
        answers
      );

      expect(result).toContain('Decision: PostgreSQL');
      expect(result).toContain('Decision: Redis');
    });

    it('should preserve existing decisions when not overridden', () => {
      const withExistingDecision = `# Feature: Test

## Design Decisions

### Q1: Which database?

Decision: MongoDB

### Q2: Which cache?

Decision:
`;
      const answers = new Map([[2, 'Redis']]);
      const result = applyAnswersToRequirements(withExistingDecision, answers);

      expect(result).toContain('Decision: MongoDB');
      expect(result).toContain('Decision: Redis');
    });

    it('should handle missing answers gracefully', () => {
      const answers = new Map([[1, 'PostgreSQL']]);
      const result = applyAnswersToRequirements(
        requirementsWithQuestions,
        answers
      );

      expect(result).toContain('Decision: PostgreSQL');
      expect(result).toMatch(/Decision:\s*$/m);
    });
  });

  describe('hasUnresolvedQuestions', () => {
    it('should detect unresolved questions', () => {
      const content = `## Design Decisions

### Q1: Which database?

Decision:
`;

      expect(hasUnresolvedQuestions(content)).toBe(true);
    });

    it('should return false when all questions resolved', () => {
      const content = `## Design Decisions

### Q1: Which database?

Decision: PostgreSQL
`;

      expect(hasUnresolvedQuestions(content)).toBe(false);
    });

    it('should detect old format as unresolved', () => {
      const content = `## Open Questions

### Q1: Which database?
`;

      expect(hasUnresolvedQuestions(content)).toBe(true);
    });

    it('should handle multiple questions with mixed resolution', () => {
      const content = `## Design Decisions

### Q1: Which database?

Decision: PostgreSQL

### Q2: Which cache?

Decision:
`;

      expect(hasUnresolvedQuestions(content)).toBe(true);
    });

    it('should handle no questions section', () => {
      const content = `# Feature

Some description
`;

      expect(hasUnresolvedQuestions(content)).toBe(false);
    });
  });

  describe('extractUnresolvedQuestions', () => {
    it('should extract single unresolved question', () => {
      const content = `## Design Decisions

### Q1: Which database?

Decision:

### Q2: Which cache?

Decision: Redis
`;

      const result = extractUnresolvedQuestions(content);
      expect(result).toContain('Q1');
      expect(result).not.toContain('Q2');
    });

    it('should return empty string when all resolved', () => {
      const content = `## Design Decisions

### Q1: Which database?

Decision: PostgreSQL
`;

      const result = extractUnresolvedQuestions(content);
      expect(result.trim()).toBe('');
    });

    it('should preserve markdown formatting', () => {
      const content = `## Design Decisions

### Q1: Which **database**?

Decision:
`;

      const result = extractUnresolvedQuestions(content);
      expect(result).toContain('**database**');
    });
  });

  describe('stripMarkdown', () => {
    it('should remove bold formatting', () => {
      const result = stripMarkdown('**bold text**');
      expect(result).toBe('bold text');
    });

    it('should remove italic formatting', () => {
      const result = stripMarkdown('*italic text*');
      expect(result).toBe('italic text');
    });

    it('should remove code formatting', () => {
      const result = stripMarkdown('`code`');
      expect(result).toBe('code');
    });

    it('should convert ### Q1: to Q1:', () => {
      const result = stripMarkdown('### Q1: What is this?');
      expect(result).toBe('Q1: What is this?');
    });

    it('should remove heading markers', () => {
      const result = stripMarkdown('## Section\n### Subsection');
      expect(result).toContain('Section');
      expect(result).toContain('Subsection');
    });

    it('should handle complex markdown', () => {
      const input = `### Q1: Which **database**?

Use \`PostgreSQL\` for *storage*
`;
      const result = stripMarkdown(input);

      expect(result).toContain('Q1:');
      expect(result).toContain('database');
      expect(result).toContain('PostgreSQL');
      expect(result).toContain('storage');
    });
  });

  describe('Regression: AWK→TS parser', () => {
    const fullRequirementsFixture = `# Feature: User Authentication

## Overview
Implement user authentication system.

## Design Decisions

### Q1: Which authentication method?

We need to decide between JWT, Session, or OAuth.

Decision: JWT tokens

### Q2: How to handle password reset?

Decision:

### Q3: Which password hashing algorithm?

Decision: bcrypt
`;

    it('should parse full fixture and apply answers correctly', () => {
      const answers = new Map([
        [1, 'JWT tokens with refresh tokens'],
        [2, 'Send reset email with token'],
        [3, 'bcrypt with cost factor 12'],
      ]);

      const result = applyAnswersToRequirements(
        fullRequirementsFixture,
        answers
      );

      expect(result).toContain('Decision: JWT tokens with refresh tokens');
      expect(result).toContain('Decision: Send reset email with token');
      expect(result).toContain('Decision: bcrypt with cost factor 12');
    });

    it('should correctly identify unresolved questions after partial answers', () => {
      const answers = new Map([
        [1, 'JWT tokens'],
        [3, 'bcrypt'],
      ]);

      const result = applyAnswersToRequirements(
        fullRequirementsFixture,
        answers
      );

      expect(hasUnresolvedQuestions(result)).toBe(true);
      const unresolved = extractUnresolvedQuestions(result);
      expect(unresolved).toContain('Q2');
      expect(unresolved).not.toContain('Q1');
      expect(unresolved).not.toContain('Q3');
    });

    it('should handle round-trip: parse → apply → check → extract', () => {
      const jiraComment = `Q1: Use JWT
Q2: Use bcrypt
Q3: Email reset`;

      const answers = parseAnswers(jiraComment);
      const result = applyAnswersToRequirements(
        fullRequirementsFixture,
        answers
      );

      expect(hasUnresolvedQuestions(result)).toBe(false);
    });
  });
});
