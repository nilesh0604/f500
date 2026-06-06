import {
  currentBranch,
  fetchMain,
  changedFiles,
  checkoutNewBranch,
  hasUncommittedChanges,
  commitAndPush,
  forceWithLeasePush,
  rebase,
  isRebaseInProgress,
  continueRebase,
  abortRebase,
  getMergeConflicts,
  getCommitMessage,
  getCommitHash,
  branchExists,
  getRemoteUrl,
} from '../../core/git.js';
import { Shell } from '../../core/shell.js';
import { Logger } from '../../core/logger.js';

// Mock dependencies
jest.mock('../../core/shell.js');
jest.mock('../../core/logger.js');

const mockShell = Shell as jest.Mocked<typeof Shell>;
const mockLogger = Logger as jest.Mocked<typeof Logger>;

describe('git', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('currentBranch', () => {
    it('should return current branch name', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'feature/test-branch\n',
        stderr: '',
        exitCode: 0,
      });

      const result = currentBranch();

      expect(result).toBe('feature/test-branch');
      expect(mockShell.execSilent).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD'
      );
    });

    it('should throw error if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
      });

      expect(() => currentBranch()).toThrow('Failed to get current branch');
    });
  });

  describe('fetchMain', () => {
    it('should fetch latest changes from main', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      fetchMain();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching latest changes from main...'
      );
      expect(mockShell.exec).toHaveBeenCalledWith('git fetch origin main');
    });

    it('should throw error if fetch fails', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'fatal: could not read',
        exitCode: 128,
      });

      expect(() => fetchMain()).toThrow('Failed to fetch main branch');
    });
  });

  describe('changedFiles', () => {
    it('should return list of changed files', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'file1.ts\nfile2.ts\nfile3.ts\n',
        stderr: '',
        exitCode: 0,
      });

      const result = changedFiles();

      expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
      expect(mockShell.execSilent).toHaveBeenCalledWith(
        'git diff --name-only origin/main...HEAD'
      );
    });

    it('should handle empty output', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '\n',
        stderr: '',
        exitCode: 0,
      });

      const result = changedFiles();

      expect(result).toEqual([]);
    });

    it('should use custom base branch', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'file1.ts\n',
        stderr: '',
        exitCode: 0,
      });

      changedFiles('develop');

      expect(mockShell.execSilent).toHaveBeenCalledWith(
        'git diff --name-only develop...HEAD'
      );
    });

    it('should throw error if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: bad revision',
        exitCode: 128,
      });

      expect(() => changedFiles()).toThrow('Failed to get changed files');
    });
  });

  describe('checkoutNewBranch', () => {
    it('should create and checkout new branch', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      checkoutNewBranch('feature/new-branch');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating and checking out branch: feature/new-branch'
      );
      expect(mockShell.exec).toHaveBeenCalledWith(
        'git checkout -b feature/new-branch'
      );
    });

    it('should throw error if branch creation fails', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'fatal: A branch named',
        exitCode: 128,
      });

      expect(() => checkoutNewBranch('feature/new-branch')).toThrow(
        'Failed to create branch: feature/new-branch'
      );
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: ' M file.ts\n?? newfile.ts\n',
        stderr: '',
        exitCode: 0,
      });

      const result = hasUncommittedChanges();

      expect(result).toBe(true);
    });

    it('should return false when there are no changes', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = hasUncommittedChanges();

      expect(result).toBe(false);
    });

    it('should throw error if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
      });

      expect(() => hasUncommittedChanges()).toThrow(
        'Failed to check git status'
      );
    });
  });

  describe('commitAndPush', () => {
    beforeEach(() => {
      mockShell.exec.mockReturnValue({ stdout: '', stderr: '', exitCode: 0 });
    });

    it('should return false if no changes to commit', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = commitAndPush('Test commit');

      expect(result).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('No changes to commit');
    });

    it('should commit and push changes', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: ' M file.ts\n',
        stderr: '',
        exitCode: 0,
      });

      const result = commitAndPush('Test commit');

      expect(result).toBe(true);
      expect(mockShell.exec).toHaveBeenCalledWith('git add -A');
      expect(mockShell.exec).toHaveBeenCalledWith(
        'git commit -m "Test commit"'
      );
      expect(mockShell.exec).toHaveBeenCalledWith('git push');
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Changes committed and pushed successfully'
      );
    });

    it('should throw error if staging fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: ' M file.ts\n',
        stderr: '',
        exitCode: 0,
      });
      mockShell.exec.mockReturnValueOnce({
        stdout: '',
        stderr: 'fatal: pathspec',
        exitCode: 128,
      });

      expect(() => commitAndPush('Test commit')).toThrow(
        'Failed to stage changes'
      );
    });
  });

  describe('forceWithLeasePush', () => {
    it('should force push with lease', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      forceWithLeasePush();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Force pushing with lease...'
      );
      expect(mockShell.exec).toHaveBeenCalledWith(
        'git push --force-with-lease'
      );
    });

    it('should throw error if push fails', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'fatal: push rejected',
        exitCode: 128,
      });

      expect(() => forceWithLeasePush()).toThrow(
        'Failed to force push with lease'
      );
    });
  });

  describe('rebase', () => {
    it('should rebase successfully', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = rebase('main');

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Rebasing onto main...');
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Rebase completed successfully'
      );
    });

    it('should return false if rebase fails', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'CONFLICT: Merge conflict',
        exitCode: 1,
      });

      const result = rebase('main');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Rebase failed');
    });
  });

  describe('isRebaseInProgress', () => {
    it('should return true when rebase-merge is in progress', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'rebase-merge: onto abc123\n M file.ts\n',
        stderr: '',
        exitCode: 0,
      });

      const result = isRebaseInProgress();

      expect(result).toBe(true);
    });

    it('should return true when rebase-apply is in progress', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'rebase-apply: applying patch\n',
        stderr: '',
        exitCode: 0,
      });

      const result = isRebaseInProgress();

      expect(result).toBe(true);
    });

    it('should return false when no rebase in progress', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: ' M file.ts\n',
        stderr: '',
        exitCode: 0,
      });

      const result = isRebaseInProgress();

      expect(result).toBe(false);
    });

    it('should return false if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
      });

      const result = isRebaseInProgress();

      expect(result).toBe(false);
    });
  });

  describe('continueRebase', () => {
    it('should continue rebase successfully', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = continueRebase();

      expect(result).toBe(true);
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Rebase continued successfully'
      );
    });

    it('should return false if continue fails', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'CONFLICT: Merge conflict',
        exitCode: 1,
      });

      const result = continueRebase();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to continue rebase'
      );
    });
  });

  describe('abortRebase', () => {
    it('should abort rebase', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      abortRebase();

      expect(mockLogger.info).toHaveBeenCalledWith('Aborting rebase...');
      expect(mockShell.exec).toHaveBeenCalledWith('git rebase --abort');
    });

    it('should log error if abort fails', () => {
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'fatal: No rebase in progress',
        exitCode: 128,
      });

      abortRebase();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to abort rebase');
    });
  });

  describe('getMergeConflicts', () => {
    it('should return list of conflicted files', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'file1.ts\nfile2.ts\n',
        stderr: '',
        exitCode: 0,
      });

      const result = getMergeConflicts();

      expect(result).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should return empty list if no conflicts', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = getMergeConflicts();

      expect(result).toEqual([]);
    });

    it('should return empty list if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
      });

      const result = getMergeConflicts();

      expect(result).toEqual([]);
    });
  });

  describe('getCommitMessage', () => {
    it('should return commit message', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'Fix: Resolve the issue\n\nThis is the body\n',
        stderr: '',
        exitCode: 0,
      });

      const result = getCommitMessage();

      expect(result).toBe('Fix: Resolve the issue\n\nThis is the body');
    });

    it('should use custom commit hash', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'Custom commit message\n',
        stderr: '',
        exitCode: 0,
      });

      getCommitMessage('abc123');

      expect(mockShell.execSilent).toHaveBeenCalledWith(
        'git log --format=%B -n 1 abc123'
      );
    });

    it('should throw error if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: bad revision',
        exitCode: 128,
      });

      expect(() => getCommitMessage()).toThrow(
        'Failed to get commit message for HEAD'
      );
    });
  });

  describe('getCommitHash', () => {
    it('should return commit hash', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'abc123def456\n',
        stderr: '',
        exitCode: 0,
      });

      const result = getCommitHash();

      expect(result).toBe('abc123def456');
    });

    it('should use custom ref', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'def456abc123\n',
        stderr: '',
        exitCode: 0,
      });

      getCommitHash('main');

      expect(mockShell.execSilent).toHaveBeenCalledWith('git rev-parse main');
    });

    it('should throw error if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: bad revision',
        exitCode: 128,
      });

      expect(() => getCommitHash()).toThrow(
        'Failed to get commit hash for HEAD'
      );
    });
  });

  describe('branchExists', () => {
    it('should return true if branch exists', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'abc123def456\n',
        stderr: '',
        exitCode: 0,
      });

      const result = branchExists('feature/test');

      expect(result).toBe(true);
      expect(mockShell.execSilent).toHaveBeenCalledWith(
        'git rev-parse --verify origin/feature/test'
      );
    });

    it('should return false if branch does not exist', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: no such ref',
        exitCode: 1,
      });

      const result = branchExists('feature/test');

      expect(result).toBe(false);
    });
  });

  describe('getRemoteUrl', () => {
    it('should return remote URL', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: 'git@github.com:user/repo.git\n',
        stderr: '',
        exitCode: 0,
      });

      const result = getRemoteUrl();

      expect(result).toBe('git@github.com:user/repo.git');
    });

    it('should throw error if command fails', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: 'fatal: No such remote',
        exitCode: 128,
      });

      expect(() => getRemoteUrl()).toThrow('Failed to get remote URL');
    });
  });
});
