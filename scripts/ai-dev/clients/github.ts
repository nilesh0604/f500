import { Shell } from '../core/shell.js';
import { Logger } from '../core/logger.js';

export interface PRInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  createdAt: string;
  mergedAt?: string;
}

export interface PRCheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required';
  detailsUrl?: string;
}

export interface PRStatus {
  state: string;
  checks: PRCheck[];
  mergeable?: boolean;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED';
}

export class GithubClient {
  private repoOwner: string;
  private repoName: string;

  constructor() {
    // Extract repo info from git remote
    const remoteUrl = Shell.execSilent(
      'git remote get-url origin'
    ).stdout.trim();
    const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
    if (!match) {
      throw new Error('Could not extract repo info from remote URL');
    }
    this.repoOwner = match[1];
    this.repoName = match[2];
  }

  private execGh(args: string[]): string {
    const result = Shell.execSilent(`gh ${args.join(' ')}`);
    if (result.exitCode !== 0) {
      throw new Error(`gh command failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  private execGhJson(args: string[]): any {
    const result = Shell.execSilent(`gh ${args.join(' ')} --json`);
    if (result.exitCode !== 0) {
      throw new Error(`gh command failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout.trim());
  }

  prExists(): number | null {
    try {
      const currentBranch = Shell.execSilent(
        'git rev-parse --abbrev-ref HEAD'
      ).stdout.trim();
      const prs = this.execGhJson(['pr', 'list', '--head', currentBranch]);

      if (prs.length > 0) {
        return prs[0].number;
      }
      return null;
    } catch {
      return null;
    }
  }

  prInfo(prNumber: number): PRInfo {
    const pr = this.execGhJson(['pr', 'view', prNumber.toString()]);

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.url,
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      author: pr.author.login,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
    };
  }

  prChecks(prNumber: number): PRCheck[] {
    try {
      const checks = this.execGhJson(['pr', 'checks', prNumber.toString()]);

      return checks.map((check: any) => ({
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        detailsUrl: check.detailsUrl,
      }));
    } catch (error) {
      Logger.warn(`Failed to get PR checks: ${error}`);
      return [];
    }
  }

  prStatus(prNumber: number): PRStatus {
    const pr = this.execGhJson(['pr', 'view', prNumber.toString()]);
    const checks = this.prChecks(prNumber);

    return {
      state: pr.state,
      checks,
      mergeable: pr.mergeable,
      reviewDecision: pr.reviewDecision,
    };
  }

  createPR(
    title: string,
    body: string,
    headBranch?: string,
    baseBranch?: string
  ): number {
    Logger.info(`Creating PR: ${title}`);

    const args = ['pr', 'create', '--title', title, '--body', body];
    if (headBranch) args.push('--head', headBranch);
    if (baseBranch) args.push('--base', baseBranch);

    const output = this.execGh(args);
    const match = output.match(/https:\/\/github\.com\/.+\/pull\/(\d+)/);
    if (!match) {
      throw new Error('Could not extract PR number from gh output');
    }

    const prNumber = parseInt(match[1], 10);
    Logger.success(`Created PR #${prNumber}`);
    return prNumber;
  }

  mergePR(
    prNumber: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge'
  ): void {
    Logger.info(`Merging PR #${prNumber} with method: ${method}`);
    this.execGh(['pr', 'merge', prNumber.toString(), '--merge', '--' + method]);
    Logger.success(`Merged PR #${prNumber}`);
  }

  addPrAssignees(prNumber: number, assignees: string[]): void {
    if (assignees.length === 0) return;

    Logger.info(`Adding assignees to PR #${prNumber}: ${assignees.join(', ')}`);
    this.execGh([
      'pr',
      'edit',
      prNumber.toString(),
      '--add-assignee',
      ...assignees,
    ]);
  }

  addPrReviewers(prNumber: number, reviewers: string[]): void {
    if (reviewers.length === 0) return;

    Logger.info(`Adding reviewers to PR #${prNumber}: ${reviewers.join(', ')}`);
    this.execGh([
      'pr',
      'edit',
      prNumber.toString(),
      '--add-reviewer',
      ...reviewers,
    ]);
  }

  addPrLabels(prNumber: number, labels: string[]): void {
    if (labels.length === 0) return;

    Logger.info(`Adding labels to PR #${prNumber}: ${labels.join(', ')}`);
    this.execGh(['pr', 'edit', prNumber.toString(), '--add-label', ...labels]);
  }

  commentOnPr(prNumber: number, body: string): void {
    Logger.info(`Adding comment to PR #${prNumber}`);
    this.execGh(['pr', 'comment', prNumber.toString(), '--body', body]);
  }

  getPrDiff(prNumber: number): string {
    return this.execGh(['pr', 'diff', prNumber.toString()]);
  }

  getPrFiles(prNumber: number): string[] {
    const diff = this.getPrDiff(prNumber);
    const lines = diff.split('\n');
    const files: string[] = [];

    for (const line of lines) {
      if (line.startsWith('diff --git a/')) {
        const match = line.match(/diff --git a\/(.+?) b\//);
        if (match) {
          files.push(match[1]);
        }
      }
    }

    return [...new Set(files)];
  }

  isPrMerged(prNumber: number): boolean {
    try {
      const pr = this.execGhJson(['pr', 'view', prNumber.toString()]);
      return pr.state === 'MERGED';
    } catch {
      return false;
    }
  }

  waitForCi(prNumber: number, timeoutSeconds: number = 300): Promise<boolean> {
    return new Promise(resolve => {
      const startTime = Date.now();
      const timeout = timeoutSeconds * 1000;

      const checkStatus = () => {
        const status = this.prStatus(prNumber);
        const allCompleted = status.checks.every(
          check => check.status === 'completed'
        );

        if (allCompleted) {
          const allSuccess = status.checks.every(
            check =>
              check.conclusion === 'success' || check.conclusion === 'neutral'
          );
          resolve(allSuccess);
          return;
        }

        if (Date.now() - startTime > timeout) {
          Logger.warn('CI check timeout');
          resolve(false);
          return;
        }

        setTimeout(checkStatus, 10000); // Check every 10 seconds
      };

      checkStatus();
    });
  }
}
