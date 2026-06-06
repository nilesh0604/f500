// Mock fs before imports
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
  },
}));

import {
  featureDir,
  subtasksFile,
  markerFile,
  ensureFeatureDir,
  saveSubtaskKey,
  getSubtaskKey,
  getAllSubtaskKeys,
  writeMarker,
  markerExists,
  readMarker,
  removeMarker,
  readFixRetries,
  incrementFixRetry,
  resetFixRetries,
  readPrNumber,
  writePrNumber,
  readFileIfExists,
  writeFileWithDir,
} from '../../core/file-helpers.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger } from '../../core/logger.js';
import { loadConfig } from '../../config.js';

// Mock other dependencies
jest.mock('../../core/logger.js');
jest.mock('../../config.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockLogger = Logger as jest.Mocked<typeof Logger>;
const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;

describe('file-helpers', () => {
  const repoRoot = '/test/repo';
  const ticketId = 'TEST-123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue({
      claudeCmd: 'claude',
      steps: [
        'requirements',
        'design',
        'code-impl',
        'code-test',
        'code-quality',
        'code-security',
        'code-perf',
        'validate',
        'deploy-pr',
        'deploy-ship',
      ] as any,
      gatedSteps: [
        'requirements',
        'design',
        'code-impl',
        'code-test',
        'code-quality',
        'code-security',
        'code-perf',
        'deploy-pr',
      ],
      agents: {},
      featureDocsDir: 'docs/features',
    });
  });

  describe('Path generation functions', () => {
    it('should generate feature directory path', () => {
      const result = featureDir(repoRoot, ticketId);
      expect(result).toBe(join(repoRoot, 'docs', 'features', ticketId));
    });

    it('should generate subtasks file path', () => {
      const result = subtasksFile(repoRoot, ticketId);
      expect(result).toBe(
        join(repoRoot, 'docs', 'features', ticketId, 'subtasks.json')
      );
    });

    it('should generate marker file path', () => {
      const result = markerFile(repoRoot, ticketId, 'test-marker');
      expect(result).toBe(
        join(repoRoot, 'docs', 'features', ticketId, '.test-marker')
      );
    });
  });

  describe('ensureFeatureDir', () => {
    it('should create feature directory recursively', async () => {
      await ensureFeatureDir(repoRoot, ticketId);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join(repoRoot, 'docs', 'features', ticketId),
        { recursive: true }
      );
    });

    it('should log error and rethrow on failure', async () => {
      const error = new Error('Permission denied');
      mockFs.mkdir.mockRejectedValue(error);

      await expect(ensureFeatureDir(repoRoot, ticketId)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to create feature directory: ${join(repoRoot, 'docs', 'features', ticketId)}`
      );
    });
  });

  describe('Subtask key management', () => {
    const subtasksPath = subtasksFile(repoRoot, ticketId);

    describe('saveSubtaskKey', () => {
      it('should save new subtask key to existing file', async () => {
        const existingContent = { requirements: 'REQ-456' };
        mockFs.readFile.mockResolvedValue(JSON.stringify(existingContent));
        mockFs.writeFile.mockResolvedValue();

        await saveSubtaskKey(repoRoot, ticketId, 'design', 'DES-789');

        expect(mockFs.readFile).toHaveBeenCalledWith(subtasksPath, 'utf8');
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          subtasksPath,
          JSON.stringify(
            { requirements: 'REQ-456', design: 'DES-789' },
            null,
            2
          ),
          'utf8'
        );
      });

      it('should create new subtasks file if none exists', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));
        mockFs.writeFile.mockResolvedValue();

        await saveSubtaskKey(repoRoot, ticketId, 'requirements', 'REQ-456');

        expect(mockLogger.debug).toHaveBeenCalledWith(
          `Creating new subtasks file: ${subtasksPath}`
        );
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          subtasksPath,
          JSON.stringify({ requirements: 'REQ-456' }, null, 2),
          'utf8'
        );
      });
    });

    describe('getSubtaskKey', () => {
      it('should return subtask key if it exists', async () => {
        const content = { requirements: 'REQ-456', design: 'DES-789' };
        mockFs.readFile.mockResolvedValue(JSON.stringify(content));

        const result = await getSubtaskKey(repoRoot, ticketId, 'design');

        expect(result).toBe('DES-789');
      });

      it('should return null if key does not exist', async () => {
        const content = { requirements: 'REQ-456' };
        mockFs.readFile.mockResolvedValue(JSON.stringify(content));

        const result = await getSubtaskKey(repoRoot, ticketId, 'design');

        expect(result).toBeNull();
      });

      it('should return null if file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await getSubtaskKey(repoRoot, ticketId, 'design');

        expect(result).toBeNull();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'No subtask key found for design'
        );
      });
    });

    describe('getAllSubtaskKeys', () => {
      it('should return all subtask keys', async () => {
        const content = { requirements: 'REQ-456', design: 'DES-789' };
        mockFs.readFile.mockResolvedValue(JSON.stringify(content));

        const result = await getAllSubtaskKeys(repoRoot, ticketId);

        expect(result).toEqual({
          requirements: 'REQ-456',
          design: 'DES-789',
          'code-impl': null,
          'code-test': null,
          'code-quality': null,
          'code-security': null,
          'code-perf': null,
          validate: null,
          'deploy-pr': null,
          'deploy-ship': null,
        });
      });

      it('should return empty object if file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await getAllSubtaskKeys(repoRoot, ticketId);

        expect(result).toEqual({});
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'No subtasks file found, returning empty object'
        );
      });
    });
  });

  describe('Marker management', () => {
    const markerPath = markerFile(repoRoot, ticketId, 'test-marker');

    describe('writeMarker', () => {
      it('should write marker with timestamp if no content provided', async () => {
        mockFs.mkdir.mockResolvedValue(undefined as any);
        mockFs.writeFile.mockResolvedValue();

        await writeMarker(repoRoot, ticketId, 'test-marker');

        expect(mockFs.mkdir).toHaveBeenCalledWith(
          join(repoRoot, 'docs', 'features', ticketId),
          { recursive: true }
        );
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          markerPath,
          expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          'utf8'
        );
      });

      it('should write marker with custom content', async () => {
        mockFs.mkdir.mockResolvedValue(undefined as any);
        mockFs.writeFile.mockResolvedValue();

        await writeMarker(repoRoot, ticketId, 'test-marker', 'custom content');

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          markerPath,
          'custom content',
          'utf8'
        );
      });
    });

    describe('markerExists', () => {
      it('should return true if marker exists', async () => {
        mockFs.access.mockResolvedValue();

        const result = await markerExists(repoRoot, ticketId, 'test-marker');

        expect(result).toBe(true);
      });

      it('should return false if marker does not exist', async () => {
        mockFs.access.mockRejectedValue(new Error('File not found'));

        const result = await markerExists(repoRoot, ticketId, 'test-marker');

        expect(result).toBe(false);
      });
    });

    describe('readMarker', () => {
      it('should return marker content', async () => {
        mockFs.readFile.mockResolvedValue('marker content');

        const result = await readMarker(repoRoot, ticketId, 'test-marker');

        expect(result).toBe('marker content');
      });

      it('should return null if marker does not exist', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await readMarker(repoRoot, ticketId, 'test-marker');

        expect(result).toBeNull();
      });
    });

    describe('removeMarker', () => {
      it('should remove marker if it exists', async () => {
        mockFs.unlink.mockResolvedValue();

        await removeMarker(repoRoot, ticketId, 'test-marker');

        expect(mockFs.unlink).toHaveBeenCalledWith(markerPath);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Removed marker: test-marker'
        );
      });

      it('should not error if marker does not exist', async () => {
        mockFs.unlink.mockRejectedValue(new Error('File not found'));

        await expect(
          removeMarker(repoRoot, ticketId, 'test-marker')
        ).resolves.not.toThrow();
      });
    });
  });

  describe('Fix retries management', () => {
    const retriesPath = join(
      featureDir(repoRoot, ticketId),
      '.fix_retries.json'
    );

    describe('readFixRetries', () => {
      it('should return existing retries', async () => {
        const retries = { lint: 2, test: 1 };
        mockFs.readFile.mockResolvedValue(JSON.stringify(retries));

        const result = await readFixRetries(repoRoot, ticketId);

        expect(result).toEqual(retries);
      });

      it('should return empty object if file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await readFixRetries(repoRoot, ticketId);

        expect(result).toEqual({});
      });
    });

    describe('incrementFixRetry', () => {
      it('should increment existing retry count', async () => {
        const existingRetries = { lint: 2 };
        mockFs.readFile.mockResolvedValue(JSON.stringify(existingRetries));
        mockFs.mkdir.mockResolvedValue(undefined as any);
        mockFs.writeFile.mockResolvedValue();

        const result = await incrementFixRetry(repoRoot, ticketId, 'lint');

        expect(result).toBe(3);
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          retriesPath,
          JSON.stringify({ lint: 3 }, null, 2),
          'utf8'
        );
      });

      it('should create new retry count if none exists', async () => {
        mockFs.readFile.mockResolvedValue('{}');
        mockFs.mkdir.mockResolvedValue(undefined as any);
        mockFs.writeFile.mockResolvedValue();

        const result = await incrementFixRetry(repoRoot, ticketId, 'test');

        expect(result).toBe(1);
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          retriesPath,
          JSON.stringify({ test: 1 }, null, 2),
          'utf8'
        );
      });
    });

    describe('resetFixRetries', () => {
      it('should remove retries file', async () => {
        mockFs.unlink.mockResolvedValue();

        await resetFixRetries(repoRoot, ticketId);

        expect(mockFs.unlink).toHaveBeenCalledWith(retriesPath);
        expect(mockLogger.debug).toHaveBeenCalledWith('Reset fix retries');
      });

      it('should not error if file does not exist', async () => {
        mockFs.unlink.mockRejectedValue(new Error('File not found'));

        await expect(
          resetFixRetries(repoRoot, ticketId)
        ).resolves.not.toThrow();
      });
    });
  });

  describe('PR number management', () => {
    const prPath = join(featureDir(repoRoot, ticketId), '.pr_number');

    describe('readPrNumber', () => {
      it('should return PR number', async () => {
        mockFs.readFile.mockResolvedValue('123\n');

        const result = await readPrNumber(repoRoot, ticketId);

        expect(result).toBe(123);
      });

      it('should return null if file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await readPrNumber(repoRoot, ticketId);

        expect(result).toBeNull();
      });

      it('should return null if content is not a number', async () => {
        mockFs.readFile.mockResolvedValue('invalid');

        const result = await readPrNumber(repoRoot, ticketId);

        expect(result).toBeNull();
      });
    });

    describe('writePrNumber', () => {
      it('should write PR number', async () => {
        mockFs.mkdir.mockResolvedValue(undefined as any);
        mockFs.writeFile.mockResolvedValue();

        await writePrNumber(repoRoot, ticketId, 123);

        expect(mockFs.writeFile).toHaveBeenCalledWith(prPath, '123', 'utf8');
        expect(mockLogger.debug).toHaveBeenCalledWith('Saved PR number: 123');
      });
    });
  });

  describe('Utility functions', () => {
    describe('readFileIfExists', () => {
      it('should return file content if it exists', async () => {
        mockFs.readFile.mockResolvedValue('file content');

        const result = await readFileIfExists('/test/file.txt');

        expect(result).toBe('file content');
      });

      it('should return null if file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await readFileIfExists('/test/file.txt');

        expect(result).toBeNull();
      });
    });

    describe('writeFileWithDir', () => {
      it('should create directory and write file', async () => {
        mockFs.mkdir.mockResolvedValue(undefined as any);
        mockFs.writeFile.mockResolvedValue();

        await writeFileWithDir('/test/dir/file.txt', 'content');

        expect(mockFs.mkdir).toHaveBeenCalledWith('/test/dir', {
          recursive: true,
        });
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          '/test/dir/file.txt',
          'content',
          'utf8'
        );
      });
    });
  });
});
