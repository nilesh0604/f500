import { Shell } from './shell.js';
import { Logger } from './logger.js';

export function currentBranch(): string {
  const result = Shell.execSilent('git rev-parse --abbrev-ref HEAD');
  if (result.exitCode !== 0) {
    throw new Error('Failed to get current branch');
  }
  return result.stdout.trim();
}

export function fetchMain(): void {
  Logger.info('Fetching latest changes from main...');
  const result = Shell.exec('git fetch origin main');
  if (result.exitCode !== 0) {
    throw new Error('Failed to fetch main branch');
  }
}

export function changedFiles(baseBranch: string = 'origin/main'): string[] {
  const result = Shell.execSilent(`git diff --name-only ${baseBranch}...HEAD`);
  if (result.exitCode !== 0) {
    throw new Error('Failed to get changed files');
  }

  const files = result.stdout
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.length > 0);

  return files;
}

export function checkoutNewBranch(name: string): void {
  Logger.info(`Creating and checking out branch: ${name}`);
  const result = Shell.exec(`git checkout -b ${name}`);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to create branch: ${name}`);
  }
}

export function hasUncommittedChanges(): boolean {
  const result = Shell.execSilent('git status --porcelain');
  if (result.exitCode !== 0) {
    throw new Error('Failed to check git status');
  }
  return result.stdout.trim().length > 0;
}

export function commitAndPush(message: string): boolean {
  if (!hasUncommittedChanges()) {
    Logger.info('No changes to commit');
    return false;
  }

  Logger.info('Committing and pushing changes...');

  // Stage all changes
  const addResult = Shell.exec('git add -A');
  if (addResult.exitCode !== 0) {
    throw new Error('Failed to stage changes');
  }

  // Commit
  const commitResult = Shell.exec(`git commit -m "${message}"`);
  if (commitResult.exitCode !== 0) {
    throw new Error('Failed to commit changes');
  }

  // Push
  const pushResult = Shell.exec('git push');
  if (pushResult.exitCode !== 0) {
    throw new Error('Failed to push changes');
  }

  Logger.success('Changes committed and pushed successfully');
  return true;
}

export function forceWithLeasePush(): void {
  Logger.info('Force pushing with lease...');
  const result = Shell.exec('git push --force-with-lease');
  if (result.exitCode !== 0) {
    throw new Error('Failed to force push with lease');
  }
}

export function rebase(target: string): boolean {
  Logger.info(`Rebasing onto ${target}...`);
  const result = Shell.exec(`git rebase ${target}`);

  if (result.exitCode !== 0) {
    Logger.error('Rebase failed');
    return false;
  }

  Logger.success('Rebase completed successfully');
  return true;
}

export function isRebaseInProgress(): boolean {
  const result = Shell.execSilent('git status --porcelain');
  if (result.exitCode !== 0) {
    return false;
  }
  return (
    result.stdout.includes('rebase-merge') ||
    result.stdout.includes('rebase-apply')
  );
}

export function continueRebase(): boolean {
  Logger.info('Continuing rebase...');
  const result = Shell.exec('git rebase --continue');

  if (result.exitCode !== 0) {
    Logger.error('Failed to continue rebase');
    return false;
  }

  Logger.success('Rebase continued successfully');
  return true;
}

export function abortRebase(): void {
  Logger.info('Aborting rebase...');
  const result = Shell.exec('git rebase --abort');
  if (result.exitCode !== 0) {
    Logger.error('Failed to abort rebase');
  }
}

export function getMergeConflicts(): string[] {
  const result = Shell.execSilent('git diff --name-only --diff-filter=U');
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.length > 0);
}

export function getCommitMessage(commitHash: string = 'HEAD'): string {
  const result = Shell.execSilent(`git log --format=%B -n 1 ${commitHash}`);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to get commit message for ${commitHash}`);
  }
  return result.stdout.trim();
}

export function getCommitHash(ref: string = 'HEAD'): string {
  const result = Shell.execSilent(`git rev-parse ${ref}`);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to get commit hash for ${ref}`);
  }
  return result.stdout.trim();
}

export function branchExists(branchName: string): boolean {
  const result = Shell.execSilent(
    `git rev-parse --verify origin/${branchName}`
  );
  return result.exitCode === 0;
}

export function getRemoteUrl(): string {
  const result = Shell.execSilent('git remote get-url origin');
  if (result.exitCode !== 0) {
    throw new Error('Failed to get remote URL');
  }
  return result.stdout.trim();
}
