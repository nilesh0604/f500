jest.mock('../../core/shell.js', () => ({
  Shell: {
    execSilent: jest.fn(),
  },
}));

import {
  getCIStatus,
  classifyCIFailure,
  CIStatus,
  FailureType,
} from '../../core/ci-status.js';
import { Shell } from '../../core/shell.js';

const mockShell = Shell as jest.Mocked<typeof Shell>;

describe('ci-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCIStatus', () => {
    it('should return failure when fail is in output', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '✓ lint	pass\n✗ test	fail',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('failure');
    });

    it('should return success when all checks pass', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '✓ lint	pass\n✓ test	pass\n✓ build	pass',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('success');
    });

    it('should return pending when checks are in progress', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '✓ lint	pass\n○ test	in_progress',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('pending');
    });

    it('should return pending when checks are queued', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '○ build	queued',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('pending');
    });

    it('should return unknown when no output', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('unknown');
    });

    it('should not return failure for "failing" (continuous tense)', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '✓ lint	pass\n○ test	failing',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('success');
    });

    it('should handle case-insensitive matching', () => {
      mockShell.execSilent.mockReturnValue({
        stdout: '✓ lint	PASS\n✗ test	FAIL',
        stderr: '',
        exitCode: 0,
      });

      const result = getCIStatus(123);
      expect(result).toBe('failure');
    });
  });

  describe('classifyCIFailure', () => {
    it('should classify lint failures', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return {
            stdout: 'eslint	fail\nprettier	fail',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('lint');
    });

    it('should classify types failures', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return {
            stdout: 'typescript	fail\ntypecheck	fail',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('types');
    });

    it('should classify test failures', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'jest	fail\ntest	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('tests');
    });

    it('should classify build failures', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'build	fail\ncompile	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('build');
    });

    it('should classify security failures', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return {
            stdout: 'npm-audit	fail\nsecurity-scan	fail',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('security');
    });

    it('should classify conflicts when PR is conflicting', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'lint	pass', stderr: '', exitCode: 0 };
        }
        return {
          stdout: '{"mergeable": "CONFLICTING"}',
          stderr: '',
          exitCode: 0,
        };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('conflicts');
    });

    it('should return unknown when no clear classification', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'some-unknown-check	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('unknown');
    });

    it('should handle multiple failure types and pick first match', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'eslint	fail\ntsc	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('lint');
    });

    it('should handle prettier in failure classification', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'prettier	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('lint');
    });

    it('should handle coverage in test classification', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'coverage	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('tests');
    });

    it('should handle bundle in build classification', () => {
      mockShell.execSilent.mockImplementation((cmd: string) => {
        if (cmd.includes('pr checks')) {
          return { stdout: 'bundle	fail', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"mergeable": true}', stderr: '', exitCode: 0 };
      });

      const result = classifyCIFailure(123);
      expect(result).toBe('build');
    });
  });
});
