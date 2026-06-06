// Mock must be defined before imports - match the exact import from shell.ts
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

import { Shell } from '../../core/shell.js';
import { Logger } from '../../core/logger.js';
import { execSync } from 'child_process';

jest.mock('../../core/logger.js');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockLogger = Logger as jest.Mocked<typeof Logger>;

describe('Shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exec', () => {
    it('should execute command successfully and return stdout', () => {
      const mockOutput = 'Command output';
      mockExecSync.mockReturnValue(Buffer.from(mockOutput));

      const result = Shell.exec('echo "test"');

      expect(mockExecSync).toHaveBeenCalledWith('echo "test"', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'inherit',
      });
      expect(result).toEqual({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('Executing: echo "test"');
    });

    it('should execute command silently when silent option is true', () => {
      const mockOutput = 'Silent output';
      mockExecSync.mockReturnValue(Buffer.from(mockOutput));

      const result = Shell.exec('echo "test"', { silent: true });

      expect(mockExecSync).toHaveBeenCalledWith('echo "test"', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect(result).toEqual({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      });
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle command execution failure', () => {
      const error = new Error('Command failed') as any;
      error.status = 1;
      error.stdout = 'Some output';
      error.stderr = 'Error message';
      mockExecSync.mockImplementation(() => {
        throw error;
      });

      const result = Shell.exec('false');

      expect(result).toEqual({
        stdout: 'Some output',
        stderr: 'Error message',
        exitCode: 1,
      });
    });

    it('should use custom working directory', () => {
      mockExecSync.mockReturnValue(Buffer.from('output'));

      Shell.exec('pwd', { cwd: '/tmp' });

      expect(mockExecSync).toHaveBeenCalledWith('pwd', {
        cwd: '/tmp',
        encoding: 'utf8',
        stdio: 'inherit',
      });
    });
  });

  describe('execSilent', () => {
    it('should execute command silently', () => {
      mockExecSync.mockReturnValue(Buffer.from('output'));

      Shell.execSilent('ls -la');

      expect(mockExecSync).toHaveBeenCalledWith('ls -la', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should use custom working directory', () => {
      mockExecSync.mockReturnValue(Buffer.from('output'));

      Shell.execSilent('ls -la', '/tmp');

      expect(mockExecSync).toHaveBeenCalledWith('ls -la', {
        cwd: '/tmp',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });
  });

  describe('execOrThrow', () => {
    it('should return trimmed stdout on success', () => {
      mockExecSync.mockReturnValue(Buffer.from('  output with spaces  \n'));

      const result = Shell.execOrThrow('echo "test"');

      expect(result).toBe('output with spaces');
    });

    it('should throw error on failure', () => {
      const error = new Error('Command failed') as any;
      error.status = 1;
      error.stderr = 'Error details';
      mockExecSync.mockImplementation(() => {
        throw error;
      });

      expect(() => Shell.execOrThrow('false')).toThrow(
        'Command failed: false\nStderr: Error details'
      );
    });
  });

  describe('test', () => {
    it('should return true for successful command', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      const result = Shell.test('true');

      expect(result).toBe(true);
    });

    it('should return false for failed command', () => {
      const error = new Error('Command failed') as any;
      error.status = 1;
      mockExecSync.mockImplementation(() => {
        throw error;
      });

      const result = Shell.test('false');

      expect(result).toBe(false);
    });
  });
});
