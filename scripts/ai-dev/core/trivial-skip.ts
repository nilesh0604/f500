import { Shell } from './shell.js';
import { Logger } from './logger.js';

export interface TrivialSkipConfig {
  maxChangedLines: number;
  surfaceAllowlist: string[];
  securityBlocklist: string[];
}

const DEFAULT_TRIVIAL_SKIP_CONFIG: TrivialSkipConfig = {
  maxChangedLines: 10,
  surfaceAllowlist: ['.md', '.css', '.json', '.yaml', '.yml', '.toml', '.ini'],
  securityBlocklist: ['.env', '.env.', 'auth', 'secret', 'password', 'infra/'],
};

export interface TrivialCheckResult {
  isTrivial: boolean;
  changedLines: number;
  changedFiles: string[];
  reasons: string[];
}

export function checkTrivialSkip(
  baseBranch: string = 'origin/main',
  config: TrivialSkipConfig = DEFAULT_TRIVIAL_SKIP_CONFIG
): TrivialCheckResult {
  const reasons: string[] = [];
  let changedLines = 0;
  let changedFiles: string[] = [];

  try {
    const diffResult = Shell.execSilent(
      `git diff --numstat ${baseBranch}...HEAD`
    );

    if (diffResult.exitCode !== 0) {
      Logger.debug('No changes detected or git diff failed');
      return {
        isTrivial: false,
        changedLines: 0,
        changedFiles: [],
        reasons: ['Failed to get git diff'],
      };
    }

    const lines = diffResult.stdout
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const added = parseInt(parts[0], 10) || 0;
        const deleted = parseInt(parts[1], 10) || 0;
        const file = parts[2];
        changedLines += added + deleted;
        changedFiles.push(file);
      }
    }

    if (changedFiles.length === 0) {
      return {
        isTrivial: false,
        changedLines: 0,
        changedFiles: [],
        reasons: ['No changed files found'],
      };
    }

    if (changedLines > config.maxChangedLines) {
      reasons.push(
        `Changed lines (${changedLines}) exceeds max (${config.maxChangedLines})`
      );
    }

    const nonTrivialFiles = changedFiles.filter(file => {
      const ext = '.' + file.split('.').pop();
      const isOnAllowlist = config.surfaceAllowlist.some(
        allowed =>
          file.endsWith(allowed) || (allowed.startsWith('.') && ext === allowed)
      );
      return !isOnAllowlist;
    });

    if (nonTrivialFiles.length > 0) {
      reasons.push(`Non-allowlisted files: ${nonTrivialFiles.join(', ')}`);
    }

    const securitySensitiveFiles = changedFiles.filter(file => {
      const lowerFile = file.toLowerCase();
      return config.securityBlocklist.some(blocked =>
        lowerFile.includes(blocked.toLowerCase())
      );
    });

    if (securitySensitiveFiles.length > 0) {
      reasons.push(
        `Security-sensitive paths touched: ${securitySensitiveFiles.join(', ')}`
      );
    }

    const isTrivial = reasons.length === 0;

    return {
      isTrivial,
      changedLines,
      changedFiles,
      reasons,
    };
  } catch (error) {
    Logger.debug(`Trivial check error: ${error}`);
    return {
      isTrivial: false,
      changedLines: 0,
      changedFiles: [],
      reasons: [`Error during check: ${error}`],
    };
  }
}

export function checkTypeScriptTypes(): boolean {
  Logger.debug('Running TypeScript type check...');

  const result = Shell.execSilent('npx tsc --noEmit');

  if (result.exitCode !== 0) {
    Logger.debug(`TypeScript check failed: ${result.stderr}`);
    return false;
  }

  Logger.debug('TypeScript type check passed');
  return true;
}

export function shouldSkipExpensiveSteps(
  baseBranch: string = 'origin/main',
  config: TrivialSkipConfig = DEFAULT_TRIVIAL_SKIP_CONFIG
): boolean {
  const check = checkTrivialSkip(baseBranch, config);

  if (!check.isTrivial) {
    if (check.reasons.length > 0) {
      Logger.info('Trivial-skip conditions not met:');
      check.reasons.forEach(r => Logger.info(`  - ${r}`));
    }
    return false;
  }

  Logger.info(
    `Trivial change detected: ${check.changedLines} lines in ${check.changedFiles.length} files`
  );
  Logger.info('Skipping code-test, code-security, code-perf steps...');

  if (!checkTypeScriptTypes()) {
    Logger.warn('TypeScript check failed, not skipping expensive steps');
    return false;
  }

  Logger.success('Trivial-skip: All conditions met, proceeding to validate');
  return true;
}

export function getDefaultTrivialSkipConfig(): TrivialSkipConfig {
  return { ...DEFAULT_TRIVIAL_SKIP_CONFIG };
}
