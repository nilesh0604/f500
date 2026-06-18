import { Logger } from './logger.js';
import { Shell } from './shell.js';
import { readFileIfExists } from './file-helpers.js';
import { join } from 'path';

export interface DriftResult {
  hasDrift: boolean;
  declaredFiles: string[];
  actualFiles: string[];
  outOfScope: string[];
  missingFromScope: string[];
}

export async function checkScopeDrift(
  repoRoot: string,
  ticketId: string,
  designPath: string
): Promise<DriftResult> {
  const declaredFiles = await extractDeclaredScope(designPath);
  const actualFiles = await getChangedFiles(repoRoot);

  const declaredSet = new Set(declaredFiles.map(f => normalizePath(f)));
  const actualSet = new Set(actualFiles.map(f => normalizePath(f)));

  const outOfScope = actualFiles.filter(
    f => !declaredSet.has(normalizePath(f))
  );
  const missingFromScope = declaredFiles.filter(
    f => !actualSet.has(normalizePath(f))
  );

  const hasDrift = outOfScope.length > 0;

  return {
    hasDrift,
    declaredFiles,
    actualFiles,
    outOfScope,
    missingFromScope,
  };
}

async function extractDeclaredScope(designPath: string): Promise<string[]> {
  const content = await readFileIfExists(designPath);
  if (!content) {
    return [];
  }

  const files: string[] = [];
  const lines = content.split('\n');

  const filePatterns = [
    /`(apps|libs|scripts|infra)\/[^`]+`/g,
    /`(apps|libs|scripts|infra)\/[^`\s]+/g,
    /File:\s*(.+)/gi,
    /Files?:\s*(.+)/gi,
    /Modified:\s*(.+)/gi,
    /Created:\s*(.+)/gi,
    /Updated:\s*(.+)/gi,
  ];

  for (const line of lines) {
    for (const pattern of filePatterns) {
      const matches = line.matchAll(new RegExp(pattern.source, pattern.flags));
      for (const match of matches) {
        const file = match[1]?.trim();
        if (file && isRelevantFile(file)) {
          files.push(file);
        }
      }
    }
  }

  return [...new Set(files)];
}

function isRelevantFile(path: string): boolean {
  const relevantDirs = ['apps/', 'libs/', 'scripts/', 'infra/', 'package.json'];
  return (
    relevantDirs.some(dir => path.startsWith(dir)) || path === 'package.json'
  );
}

async function getChangedFiles(repoRoot: string): Promise<string[]> {
  const result = Shell.exec(
    `git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only --staged 2>/dev/null || git diff --name-only 2>/dev/null`,
    { cwd: repoRoot, silent: true }
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .trim()
    .split('\n')
    .filter(f => f.trim());
}

function normalizePath(path: string): string {
  return path.replace(/^\//, '').replace(/^docs\/features\/[^/]+\//, '');
}

export function reportDrift(result: DriftResult): void {
  if (!result.hasDrift) {
    Logger.success(
      'Scope drift check passed - all changes within declared scope'
    );
    return;
  }

  Logger.error('SCOPE DRIFT DETECTED');

  if (result.outOfScope.length > 0) {
    console.log('\n**Out of scope files modified:**');
    for (const file of result.outOfScope) {
      console.log(`  - ${file}`);
    }
  }

  if (result.missingFromScope.length > 0) {
    console.log('\n**Declared but not modified:**');
    for (const file of result.missingFromScope) {
      console.log(`  - ${file}`);
    }
  }

  console.log(
    '\nReview your changes and ensure they align with the design scope.'
  );
}

export function assertNoDrift(result: DriftResult): void {
  if (result.hasDrift) {
    Logger.error('Scope drift check failed - blocking pipeline until resolved');
    reportDrift(result);
    process.exit(1);
  }
}
