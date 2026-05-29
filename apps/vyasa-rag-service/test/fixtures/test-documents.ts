/**
 * Test fixtures for Vyasa RAG Service
 */

import { RetrievalResult, Citation, Session, AgentStep } from '../../src/types';

/**
 * Sample retrieval results from Mahabharata
 */
export const mockRetrievalResults: RetrievalResult[] = [
  {
    content:
      'Karna was the son of Kunti, born to her by Surya, the sun god, before her marriage to Pandu. Fearing social stigma, she placed the infant in a basket and set it afloat on the river.',
    metadata: {
      source: 's3://vyasa-rag-corpus/adi-parva-chapter-1.txt',
      book: 'Adi Parva',
      chapter: 'Sambhava Parva',
      verse: '1.104',
    },
    score: 0.92,
  },
  {
    content:
      'Kunti invoked the Sun god with a mantra given by Durvasa. Surya appeared before her and blessed her with a son wearing armor and earrings.',
    metadata: {
      source: 's3://vyasa-rag-corpus/adi-parva-chapter-2.txt',
      book: 'Adi Parva',
      chapter: 'Sambhava Parva',
      verse: '1.105',
    },
    score: 0.88,
  },
  {
    content:
      'Adhiratha, a charioteer in Hastinapura, found the infant floating in the river and raised him as his own son with his wife Radha.',
    metadata: {
      source: 's3://vyasa-rag-corpus/adi-parva-chapter-3.txt',
      book: 'Adi Parva',
      chapter: 'Sambhava Parva',
      verse: '1.106',
    },
    score: 0.85,
  },
];

/**
 * Sample citations
 */
export const mockCitations: Citation[] = [
  {
    title: 'Mahabharata - Adi Parva - Sambhava Parva',
    book: 'Adi Parva',
    chapter: 'Sambhava Parva',
    verse: '1.104',
    score: 0.92,
  },
  {
    title: 'Mahabharata - Adi Parva - Sambhava Parva',
    book: 'Adi Parva',
    chapter: 'Sambhava Parva',
    verse: '1.105',
    score: 0.88,
  },
];

/**
 * Sample session
 */
export const mockSession: Session = {
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  messages: [
    {
      role: 'user',
      content: 'Who was Karna?',
      timestamp: '2026-05-22T12:00:00Z',
    },
    {
      role: 'assistant',
      content:
        'Karna was a great warrior and a central character in the Mahabharata. He was the son of Kunti, born to the Sun god Surya before her marriage to Pandu.',
      timestamp: '2026-05-22T12:00:05Z',
      citations: mockCitations,
    },
  ],
  created_at: '2026-05-22T12:00:00Z',
  updated_at: '2026-05-22T12:00:05Z',
  ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
};

/**
 * Sample agent trace
 */
export const mockAgentTrace: AgentStep[] = [
  {
    step: 1,
    type: 'thought',
    content: 'Analyzing query: "Who was Karna?"',
    timestamp: '2026-05-22T12:00:01Z',
  },
  {
    step: 2,
    type: 'action',
    content: 'Decomposed into 1 sub-queries: Karna identity',
    tool: 'query-planner',
    tool_input: 'Karna identity',
    timestamp: '2026-05-22T12:00:02Z',
  },
  {
    step: 3,
    type: 'action',
    content: 'Retrieving context for: "Karna identity"',
    tool: 'retrieve',
    tool_input: 'Karna identity',
    timestamp: '2026-05-22T12:00:03Z',
  },
  {
    step: 4,
    type: 'observation',
    content: 'Retrieved 3 documents',
    timestamp: '2026-05-22T12:00:04Z',
  },
  {
    step: 5,
    type: 'reflection',
    content: 'Answer quality: complete, accurate (confidence: 0.95)',
    timestamp: '2026-05-22T12:00:05Z',
  },
];

/**
 * Sample chat requests
 */
export const mockChatRequests = {
  newSession: {
    message: 'Who was Karna and what was his relationship with the Pandavas?',
  },
  existingSession: {
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    message: 'What was his role in the Kurukshetra war?',
  },
  streaming: {
    message: 'Tell me about Arjuna',
    stream: true,
  },
};

/**
 * Sample chat responses
 */
export const mockChatResponses = {
  success: {
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    response:
      'Karna was the eldest son of Kunti, born to her before her marriage to Pandu. Despite being the eldest Pandava by birth, he was raised by a charioteer and later became a close friend of Duryodhana.',
    citations: mockCitations,
    token_usage: {
      prompt_tokens: 2450,
      completion_tokens: 180,
      total_tokens: 2630,
    },
  },
};

/**
 * Sample test queries with expected decomposition
 */
export const mockQueryDecompositions = [
  {
    query: 'Who was Karna?',
    expected: {
      needsDecomposition: false,
      subQueries: ['Karna'],
      reasoning: 'Simple query - no decomposition needed',
    },
  },
  {
    query: 'Who were the parents of Karna foster father?',
    expected: {
      needsDecomposition: true,
      subQueries: ['Karna foster father identity', 'Adhiratha parents lineage'],
      reasoning: 'Multi-hop question requiring multiple facts',
    },
  },
  {
    query: 'What happened to Arjuna son after the war?',
    expected: {
      needsDecomposition: true,
      subQueries: ['Arjuna son name', 'Abhimanyu fate after Kurukshetra war'],
      reasoning: 'Requires identifying the son first',
    },
  },
];
