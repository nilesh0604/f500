/**
 * Versioned prompt manager
 * Fetches prompts from S3 with caching
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PromptTemplate } from '../types';
import { logger } from '../lib/logger';

const s3Client = new S3Client({});
const PROMPTS_BUCKET = process.env.PROMPTS_BUCKET || 'vyasa-rag-prompts-dev';

// In-memory cache with TTL
interface CachedPrompt {
  template: PromptTemplate;
  cachedAt: number;
}

const cache = new Map<string, CachedPrompt>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get prompt by name and version
 * If no version specified, fetches "latest"
 */
export async function getPrompt(
  name: string,
  version?: string
): Promise<PromptTemplate> {
  const cacheKey = `${name}:${version || 'latest'}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    logger.debug('Prompt cache hit', { name, version });
    return cached.template;
  }

  // Fetch from S3
  const versionPath = version || 'latest';
  const key = `prompts/${name}/${versionPath}.md`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: PROMPTS_BUCKET,
        Key: key,
      })
    );

    const content = await response.Body?.transformToString();
    if (!content) {
      throw new Error(`Empty prompt file: ${key}`);
    }

    // Parse metadata from frontmatter (if present)
    const { metadata, body } = parseFrontmatter(content);

    const template: PromptTemplate = {
      name,
      version: version || metadata.version || 'unknown',
      content: body,
      metadata: {
        author: metadata.author || 'system',
        updated_at: metadata.updated_at || new Date().toISOString(),
        description: metadata.description || '',
      },
    };

    // Cache result
    cache.set(cacheKey, { template, cachedAt: Date.now() });

    logger.info('Fetched prompt from S3', { name, version: template.version });
    return template;
  } catch (error) {
    logger.error('Failed to fetch prompt', { name, version, error });
    // Return default prompt on error
    return getDefaultPrompt(name);
  }
}

/**
 * Invalidate cache for a prompt
 */
export function invalidatePromptCache(name: string, version?: string): void {
  const cacheKey = `${name}:${version || 'latest'}`;
  cache.delete(cacheKey);
  logger.info('Invalidated prompt cache', { name, version });
}

/**
 * Get system prompt for Vyasa persona
 */
export async function getSystemPrompt(): Promise<string> {
  const prompt = await getPrompt('vyasa-system', 'latest');
  return prompt.content;
}

/**
 * Get ReAct agent prompt
 */
export async function getAgentPrompt(): Promise<string> {
  const prompt = await getPrompt('vyasa-agent', 'latest');
  return prompt.content;
}

/**
 * Get reflection/evaluation prompt
 */
export async function getReflectionPrompt(): Promise<string> {
  const prompt = await getPrompt('vyasa-reflection', 'latest');
  return prompt.content;
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const frontmatter = match[1];
  const body = match[2];

  // Simple YAML-like parsing
  const metadata: Record<string, string> = {};
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      metadata[key.trim()] = valueParts.join(':').trim();
    }
  });

  return { metadata, body };
}

/**
 * Default prompts (fallback)
 */
function getDefaultPrompt(name: string): PromptTemplate {
  const defaults: Record<string, string> = {
    'vyasa-system': `You are Vyasa, the legendary sage who authored the Mahabharata.
Answer questions about the Mahabharata based only on the provided context.
Always cite your sources using the format [Source: Title].
If the context is insufficient, say so honestly.`,

    'vyasa-agent': `You are an expert research assistant analyzing the Mahabharata.
For each question:
1. Analyze what information is needed
2. Determine if the question requires multiple steps
3. Formulate effective search queries
4. Evaluate if retrieved context is sufficient
5. Provide clear, well-cited answers`,

    'vyasa-reflection': `Evaluate the following answer for completeness and accuracy.
Does it fully address the question? Are the citations appropriate?
Respond with a JSON object: {"complete": boolean, "confidence": 0-1}`,
  };

  return {
    name,
    version: 'default',
    content: defaults[name] || 'You are a helpful assistant.',
    metadata: {
      author: 'system',
      updated_at: new Date().toISOString(),
      description: 'Default fallback prompt',
    },
  };
}
