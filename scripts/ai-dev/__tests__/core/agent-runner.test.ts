const mockReadFile = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

jest.mock('../../core/shell.js', () => ({
  Shell: {
    exec: jest.fn(),
  },
}));

jest.mock('../../core/logger.js', () => ({
  Logger: {
    step: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  runAgent,
  validateAgentConfig,
  extractJsonFromOutput,
} from '../../core/agent-runner.js';
import { PipelineContext, AgentConfig } from '../../types.js';
import { Shell } from '../../core/shell.js';

const mockShell = Shell as jest.Mocked<typeof Shell>;

describe('agent-runner', () => {
  const mockCtx: PipelineContext = {
    ticketId: 'TEST-123',
    repoRoot: '/test/repo',
    claudeCmd: 'claude',
    jira: {
      baseUrl: 'https://test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token',
    },
    codeAliasMode: false,
  };

  const mockAgentConfig: AgentConfig = {
    instructionsFile: '/test/agents/instructions.md',
    budget: 2.0,
    model: 'sonnet',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runAgent', () => {
    it('should read instructions file and replace placeholders', async () => {
      mockReadFile.mockResolvedValue(
        'Instructions for {TICKET_ID} with budget {BUDGET}'
      );
      mockShell.exec.mockReturnValue({
        stdout: 'Agent output',
        stderr: '',
        exitCode: 0,
      });

      const result = await runAgent(mockCtx, mockAgentConfig, {
        TICKET_ID: 'TEST-123',
        BUDGET: '2.0',
      });

      expect(mockReadFile).toHaveBeenCalledWith(
        '/test/agents/instructions.md',
        'utf8'
      );
      expect(result).toBe('Agent output');
    });

    it('should replace multiple placeholders', async () => {
      mockReadFile.mockResolvedValue(
        'Task: {STEP_NAME} for {TICKET_ID} in {REPO}'
      );
      mockShell.exec.mockReturnValue({
        stdout: 'Result',
        stderr: '',
        exitCode: 0,
      });

      await runAgent(mockCtx, mockAgentConfig, {
        STEP_NAME: 'design',
        TICKET_ID: 'TEST-456',
        REPO: 'my-repo',
      });

      expect(mockShell.exec).toHaveBeenCalledWith(
        expect.stringContaining('Task: design for TEST-456 in my-repo'),
        expect.any(Object)
      );
    });

    it('should construct correct claude command', async () => {
      mockReadFile.mockResolvedValue('Test instructions');
      mockShell.exec.mockReturnValue({
        stdout: 'Result',
        stderr: '',
        exitCode: 0,
      });

      await runAgent(mockCtx, mockAgentConfig, {});

      const call = mockShell.exec.mock.calls[0][0] as string;
      expect(call).toContain('claude');
      expect(call).toContain('-p');
      expect(call).toContain('--system-prompt');
      expect(call).toContain('--model sonnet');
      expect(call).toContain('--max-budget-usd 2');
    });

    it('should use haiku model when specified', async () => {
      mockReadFile.mockResolvedValue('Test instructions');
      mockShell.exec.mockReturnValue({
        stdout: 'Result',
        stderr: '',
        exitCode: 0,
      });

      await runAgent(mockCtx, { ...mockAgentConfig, model: 'haiku' }, {});

      const call = mockShell.exec.mock.calls[0][0] as string;
      expect(call).toContain('--model haiku');
    });

    it('should throw error on agent failure', async () => {
      mockReadFile.mockResolvedValue('Test instructions');
      mockShell.exec.mockReturnValue({
        stdout: '',
        stderr: 'Agent execution failed',
        exitCode: 1,
      });

      await expect(runAgent(mockCtx, mockAgentConfig, {})).rejects.toThrow(
        'Agent failed: Agent execution failed'
      );
    });

    it('should throw error when instructions file not found', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(runAgent(mockCtx, mockAgentConfig, {})).rejects.toThrow(
        'File not found'
      );
    });

    it('should handle empty placeholder values', async () => {
      mockReadFile.mockResolvedValue('Task: {EMPTY_VAR}');
      mockShell.exec.mockReturnValue({
        stdout: 'Result',
        stderr: '',
        exitCode: 0,
      });

      await runAgent(mockCtx, mockAgentConfig, { EMPTY_VAR: '' });

      expect(mockShell.exec).toHaveBeenCalledWith(
        expect.stringContaining('Task: '),
        expect.any(Object)
      );
    });

    it('should handle special characters in variables', async () => {
      mockReadFile.mockResolvedValue('Description: {DESC}');
      mockShell.exec.mockReturnValue({
        stdout: 'Result',
        stderr: '',
        exitCode: 0,
      });

      await runAgent(mockCtx, mockAgentConfig, {
        DESC: 'Special chars test',
      });

      expect(mockShell.exec).toHaveBeenCalled();
    });
  });

  describe('validateAgentConfig', () => {
    it('should pass valid config', () => {
      expect(() =>
        validateAgentConfig({
          instructionsFile: 'test.md',
          budget: 1.5,
          model: 'sonnet',
        })
      ).not.toThrow();
    });

    it('should throw when instructionsFile is missing', () => {
      expect(() =>
        validateAgentConfig({
          instructionsFile: '',
          budget: 1.5,
          model: 'sonnet',
        })
      ).toThrow('Agent config must specify instructionsFile');
    });

    it('should throw when budget is missing', () => {
      expect(() =>
        validateAgentConfig({
          instructionsFile: 'test.md',
          budget: 0,
          model: 'sonnet',
        })
      ).toThrow('Agent config must specify a positive budget');
    });

    it('should throw when budget is negative', () => {
      expect(() =>
        validateAgentConfig({
          instructionsFile: 'test.md',
          budget: -1,
          model: 'sonnet',
        })
      ).toThrow('Agent config must specify a positive budget');
    });

    it('should throw when model is invalid', () => {
      expect(() =>
        validateAgentConfig({
          instructionsFile: 'test.md',
          budget: 1.5,
          model: 'invalid' as 'sonnet' | 'haiku',
        })
      ).toThrow('Agent config must specify a valid model (sonnet or haiku)');
    });
  });

  describe('extractJsonFromOutput', () => {
    it('should extract JSON from code block', () => {
      const output = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
      const result = extractJsonFromOutput(output);
      expect(result).toEqual({ key: 'value' });
    });

    it('should parse entire output as JSON', () => {
      const output = '{"key": "value"}';
      const result = extractJsonFromOutput(output);
      expect(result).toEqual({ key: 'value' });
    });

    it('should extract JSON object from text', () => {
      const output = 'Some text {"key": "value"} more text';
      const result = extractJsonFromOutput(output);
      expect(result).toEqual({ key: 'value' });
    });

    it('should throw when no valid JSON found', () => {
      const output = 'No JSON here';
      expect(() => extractJsonFromOutput(output)).toThrow(
        'No valid JSON found in agent output'
      );
    });

    it('should handle nested JSON', () => {
      const output = '```json\n{"outer": {"inner": "value"}}\n```';
      const result = extractJsonFromOutput(output);
      expect(result).toEqual({ outer: { inner: 'value' } });
    });

    it('should handle JSON arrays', () => {
      const output = '```json\n["a", "b", "c"]\n```';
      const result = extractJsonFromOutput(output);
      expect(result).toEqual(['a', 'b', 'c']);
    });
  });
});
