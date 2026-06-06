import { Shell } from './shell.js';

export type CIStatus = 'success' | 'failure' | 'pending' | 'unknown';
export type FailureType =
  | 'lint'
  | 'types'
  | 'tests'
  | 'build'
  | 'security'
  | 'conflicts'
  | 'unknown';

export function getCIStatus(prNumber: number): CIStatus {
  const result = Shell.execSilent(`gh pr checks ${prNumber}`);

  if (!result.stdout.trim()) {
    return 'unknown';
  }

  const output = result.stdout.toLowerCase();

  if (/\bfail\b/.test(output) && !/\bfailing\b/.test(output)) {
    return 'failure';
  }

  if (
    /\bpending\b/.test(output) ||
    /\bin_progress\b/.test(output) ||
    /\bqueued\b/.test(output)
  ) {
    return 'pending';
  }

  return 'success';
}

export function classifyCIFailure(prNumber: number): FailureType {
  const checksResult = Shell.execSilent(`gh pr checks ${prNumber}`);
  const checksOutput = checksResult.stdout.toLowerCase();

  const failedChecks = checksResult.stdout
    .split('\n')
    .filter(line => /\bfail\b/i.test(line) && !/\bfailing\b/i.test(line))
    .map(line => {
      const parts = line.split('\t');
      return parts[0]?.toLowerCase() || '';
    })
    .filter(Boolean);

  const failedStr = failedChecks.join(' ');

  if (/lint|eslint|format|prettier/.test(failedStr)) {
    return 'lint';
  }

  if (/typescript|tsc|type-check|typecheck/.test(failedStr)) {
    return 'types';
  }

  if (/test|jest|spec|coverage/.test(failedStr)) {
    return 'tests';
  }

  if (/build|compile|bundle/.test(failedStr)) {
    return 'build';
  }

  if (/security|audit|snyk|scan|sast|llm-security/.test(failedStr)) {
    return 'security';
  }

  const mergeableResult = Shell.execSilent(
    `gh pr view ${prNumber} --json mergeable`
  );
  if (mergeableResult.stdout.includes('CONFLICTING')) {
    return 'conflicts';
  }

  return 'unknown';
}
