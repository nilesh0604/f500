const mockAccess = jest.fn();

jest.mock('../../clients/jira-client.js', () => {
  return {
    JiraClient: jest.fn().mockImplementation(() => ({
      getStatus: jest.fn(),
      getComments: jest.fn(),
    })),
  };
});

jest.mock('../../core/file-helpers.js', () => ({
  getSubtaskKey: jest.fn(),
  markerExists: jest.fn(),
  featureDir: jest.fn(),
}));

jest.mock('../../config.js', () => ({
  loadConfig: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  access: mockAccess,
}));

jest.mock('../../core/logger.js', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  checkPrerequisite,
  getPrerequisiteStep,
  getAllGatedSteps,
} from '../../core/prerequisite.js';
import { JiraClient } from '../../clients/jira-client.js';
import { getSubtaskKey, markerExists } from '../../core/file-helpers.js';
import { loadConfig } from '../../config.js';

const mockJiraClient = JiraClient as jest.MockedClass<typeof JiraClient>;
const mockGetSubtaskKey = getSubtaskKey as jest.MockedFunction<
  typeof getSubtaskKey
>;
const mockMarkerExists = markerExists as jest.MockedFunction<
  typeof markerExists
>;
const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;

describe('prerequisite', () => {
  const mockCtx = {
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

  let mockJira: jest.Mocked<InstanceType<typeof JiraClient>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockJira = {
      getStatus: jest.fn(),
      getComments: jest.fn(),
    } as any;
    mockJiraClient.mockImplementation(() => mockJira);
  });

  describe('checkPrerequisite', () => {
    it('should throw when requirements subtask not found', async () => {
      mockGetSubtaskKey.mockResolvedValue(null);

      await expect(checkPrerequisite(mockCtx, 'requirements')).rejects.toThrow(
        'Requirements subtask not found'
      );
    });

    it('should throw when prerequisite step not completed', async () => {
      mockGetSubtaskKey.mockResolvedValueOnce('TEST-124');
      mockJira.getStatus.mockResolvedValue('In Progress');

      await expect(checkPrerequisite(mockCtx, 'design')).rejects.toThrow(
        "Prerequisite step 'requirements' (TEST-124) is not Done"
      );
    });

    it('should pass when prerequisite is Done', async () => {
      mockGetSubtaskKey.mockResolvedValueOnce('TEST-124');
      mockJira.getStatus.mockResolvedValue('Done');
      mockJira.getComments.mockResolvedValue([]);

      await expect(checkPrerequisite(mockCtx, 'design')).resolves.not.toThrow();
    });

    it('should check validate-passed marker for deploy-pr', async () => {
      mockMarkerExists.mockResolvedValue(false);

      await expect(checkPrerequisite(mockCtx, 'deploy-pr')).rejects.toThrow(
        'Validation has not passed'
      );
    });

    it('should pass deploy-pr when validate-passed exists', async () => {
      mockMarkerExists.mockResolvedValue(true);

      await expect(
        checkPrerequisite(mockCtx, 'deploy-pr')
      ).resolves.not.toThrow();
    });
  });

  describe('getPrerequisiteStep', () => {
    it('should return null for requirements', () => {
      expect(getPrerequisiteStep('requirements')).toBeNull();
    });

    it('should return requirements for design', () => {
      expect(getPrerequisiteStep('design')).toBe('requirements');
    });

    it('should return design for code-impl', () => {
      expect(getPrerequisiteStep('code-impl')).toBe('design');
    });

    it('should return code-impl for code-test', () => {
      expect(getPrerequisiteStep('code-test')).toBe('code-impl');
    });

    it('should return code-test for code-quality', () => {
      expect(getPrerequisiteStep('code-quality')).toBe('code-test');
    });

    it('should return code-quality for code-security', () => {
      expect(getPrerequisiteStep('code-security')).toBe('code-quality');
    });

    it('should return code-security for code-perf', () => {
      expect(getPrerequisiteStep('code-perf')).toBe('code-security');
    });

    it('should return code-perf for validate', () => {
      expect(getPrerequisiteStep('validate')).toBe('code-perf');
    });

    it('should return null for deploy-pr', () => {
      expect(getPrerequisiteStep('deploy-pr')).toBeNull();
    });

    it('should return null for deploy-ship', () => {
      expect(getPrerequisiteStep('deploy-ship')).toBeNull();
    });
  });

  describe('getAllGatedSteps', () => {
    it('should return all gated steps', () => {
      const steps = getAllGatedSteps();
      expect(steps).toContain('requirements');
      expect(steps).toContain('design');
      expect(steps).toContain('code-impl');
      expect(steps).toContain('code-test');
      expect(steps).toContain('code-quality');
      expect(steps).toContain('code-security');
      expect(steps).toContain('code-perf');
      expect(steps).toContain('deploy-pr');
    });
  });

  describe('Step-specific prerequisites', () => {
    it('should check for open questions before design', async () => {
      mockGetSubtaskKey.mockResolvedValue('REQ-123');
      mockJira.getStatus.mockResolvedValue('Done');
      mockJira.getComments.mockResolvedValue([
        {
          body: {
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Q: What about X?' }],
              },
            ],
          },
        },
      ] as any);

      await expect(checkPrerequisite(mockCtx, 'design')).rejects.toThrow(
        'Requirements still have open questions'
      );
    });

    it('should check for design document before code-impl', async () => {
      mockGetSubtaskKey.mockResolvedValue('DES-123');
      mockJira.getStatus.mockResolvedValue('Done');
      mockLoadConfig.mockResolvedValue({
        featureDocsDir: 'docs/features',
        steps: [],
        gatedSteps: [],
        agents: {},
        claudeCmd: 'claude',
      });
      mockAccess.mockRejectedValue(new Error('Not found'));

      await expect(checkPrerequisite(mockCtx, 'code-impl')).rejects.toThrow(
        'Design document not found'
      );
    });

    it('should check all code steps done before validate', async () => {
      mockGetSubtaskKey.mockImplementation((_, __, step) => {
        const map: Record<string, string> = {
          'code-impl': 'IMPL-123',
          'code-test': 'TEST-123',
          'code-quality': 'QUAL-123',
          'code-security': 'SEC-123',
          'code-perf': 'PERF-123',
        };
        return Promise.resolve(map[step] || null);
      });

      mockJira.getStatus.mockResolvedValue('Done');

      await expect(
        checkPrerequisite(mockCtx, 'validate')
      ).resolves.not.toThrow();
    });

    it('should throw if any code step not done before validate', async () => {
      mockGetSubtaskKey.mockImplementation((_, __, step) => {
        const map: Record<string, string> = {
          'code-impl': 'IMPL-123',
          'code-test': 'TEST-123',
          'code-quality': 'QUAL-123',
          'code-security': 'SEC-123',
          'code-perf': 'PERF-123',
        };
        return Promise.resolve(map[step] || null);
      });

      mockJira.getStatus.mockImplementation(key => {
        if (key === 'QUAL-123') return Promise.resolve('In Progress');
        return Promise.resolve('Done');
      });

      await expect(checkPrerequisite(mockCtx, 'validate')).rejects.toThrow(
        "Code step 'code-quality' (QUAL-123) is not Done. Current status: In Progress"
      );
    });
  });
});
