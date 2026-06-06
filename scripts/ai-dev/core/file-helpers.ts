import { promises as fs } from 'fs';
import { join } from 'path';
import { StepName, FixRetries } from '../types.js';
import { Logger } from './logger.js';
import { loadConfig } from '../config.js';

export function featureDir(repoRoot: string, ticketId: string): string {
  return join(repoRoot, 'docs', 'features', ticketId);
}

export function subtasksFile(repoRoot: string, ticketId: string): string {
  return join(featureDir(repoRoot, ticketId), 'subtasks.json');
}

export function markerFile(
  repoRoot: string,
  ticketId: string,
  marker: string
): string {
  return join(featureDir(repoRoot, ticketId), `.${marker}`);
}

export async function ensureFeatureDir(
  repoRoot: string,
  ticketId: string
): Promise<void> {
  const dir = featureDir(repoRoot, ticketId);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    Logger.error(`Failed to create feature directory: ${dir}`);
    throw error;
  }
}

export async function saveSubtaskKey(
  repoRoot: string,
  ticketId: string,
  step: StepName,
  key: string
): Promise<void> {
  const filePath = subtasksFile(repoRoot, ticketId);
  let subtasks: Record<string, string> = {};

  try {
    const content = await fs.readFile(filePath, 'utf8');
    subtasks = JSON.parse(content);
  } catch (error) {
    // File doesn't exist or is invalid, start fresh
    Logger.debug(`Creating new subtasks file: ${filePath}`);
  }

  subtasks[step] = key;

  await fs.writeFile(filePath, JSON.stringify(subtasks, null, 2), 'utf8');
  Logger.debug(`Saved subtask key for ${step}: ${key}`);
}

export async function getSubtaskKey(
  repoRoot: string,
  ticketId: string,
  step: StepName
): Promise<string | null> {
  const filePath = subtasksFile(repoRoot, ticketId);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const subtasks = JSON.parse(content);
    return subtasks[step] || null;
  } catch (error) {
    Logger.debug(`No subtask key found for ${step}`);
    return null;
  }
}

export async function getAllSubtaskKeys(
  repoRoot: string,
  ticketId: string
): Promise<Record<StepName, string | null>> {
  const filePath = subtasksFile(repoRoot, ticketId);
  const config = await loadConfig(repoRoot);
  const result: Record<StepName, string | null> = {} as Record<
    StepName,
    string | null
  >;

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const subtasks = JSON.parse(content);

    for (const step of config.steps) {
      result[step] = subtasks[step as string] || null;
    }
  } catch (error) {
    Logger.debug('No subtasks file found, returning empty object');
  }

  return result;
}

export async function writeMarker(
  repoRoot: string,
  ticketId: string,
  marker: string,
  content?: string
): Promise<void> {
  const filePath = markerFile(repoRoot, ticketId, marker);
  await ensureFeatureDir(repoRoot, ticketId);

  if (content) {
    await fs.writeFile(filePath, content, 'utf8');
  } else {
    await fs.writeFile(filePath, new Date().toISOString(), 'utf8');
  }

  Logger.debug(`Created marker: ${marker}`);
}

export async function markerExists(
  repoRoot: string,
  ticketId: string,
  marker: string
): Promise<boolean> {
  const filePath = markerFile(repoRoot, ticketId, marker);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readMarker(
  repoRoot: string,
  ticketId: string,
  marker: string
): Promise<string | null> {
  const filePath = markerFile(repoRoot, ticketId, marker);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function removeMarker(
  repoRoot: string,
  ticketId: string,
  marker: string
): Promise<void> {
  const filePath = markerFile(repoRoot, ticketId, marker);
  try {
    await fs.unlink(filePath);
    Logger.debug(`Removed marker: ${marker}`);
  } catch {
    // Marker doesn't exist, that's fine
  }
}

export async function readFixRetries(
  repoRoot: string,
  ticketId: string
): Promise<FixRetries> {
  const filePath = join(featureDir(repoRoot, ticketId), '.fix_retries.json');

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function incrementFixRetry(
  repoRoot: string,
  ticketId: string,
  type: string
): Promise<number> {
  const filePath = join(featureDir(repoRoot, ticketId), '.fix_retries.json');
  const retries = await readFixRetries(repoRoot, ticketId);

  retries[type] = (retries[type] || 0) + 1;

  await ensureFeatureDir(repoRoot, ticketId);
  await fs.writeFile(filePath, JSON.stringify(retries, null, 2), 'utf8');

  Logger.info(`Fix retry count for ${type}: ${retries[type]}`);
  return retries[type];
}

export async function resetFixRetries(
  repoRoot: string,
  ticketId: string
): Promise<void> {
  const filePath = join(featureDir(repoRoot, ticketId), '.fix_retries.json');
  try {
    await fs.unlink(filePath);
    Logger.debug('Reset fix retries');
  } catch {
    // File doesn't exist, that's fine
  }
}

export async function readPrNumber(
  repoRoot: string,
  ticketId: string
): Promise<number | null> {
  const filePath = join(featureDir(repoRoot, ticketId), '.pr_number');
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const num = parseInt(content.trim(), 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export async function writePrNumber(
  repoRoot: string,
  ticketId: string,
  prNumber: number
): Promise<void> {
  const filePath = join(featureDir(repoRoot, ticketId), '.pr_number');
  await ensureFeatureDir(repoRoot, ticketId);
  await fs.writeFile(filePath, prNumber.toString(), 'utf8');
  Logger.debug(`Saved PR number: ${prNumber}`);
}

export async function readFileIfExists(
  filePath: string
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function writeFileWithDir(
  filePath: string,
  content: string
): Promise<void> {
  await fs.mkdir(filePath.substring(0, filePath.lastIndexOf('/')), {
    recursive: true,
  });
  await fs.writeFile(filePath, content, 'utf8');
}
