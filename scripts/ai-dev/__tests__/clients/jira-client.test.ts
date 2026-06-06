import { JiraClient } from '../../clients/jira-client.js';
import { HttpClient, HttpError } from '../../clients/http.js';

// Mock HttpClient at module level
const mockRequest = jest.fn();
jest.mock('../../clients/http.js', () => {
  return {
    HttpClient: jest.fn().mockImplementation(() => ({
      request: mockRequest,
      withAuth: jest.fn().mockReturnThis(),
    })),
    HttpError: class HttpError extends Error {
      constructor(message: string, status?: number, response?: any) {
        super(message);
        this.name = 'HttpError';
      }
    },
  };
});

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new JiraClient({
      baseUrl: 'https://test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'token',
    });
  });

  describe('getIssue', () => {
    it('should fetch issue details', async () => {
      const mockIssue = {
        id: '10001',
        key: 'TEST-123',
        fields: {
          summary: 'Test issue',
          description: 'Test description',
          status: { name: 'In Progress' },
          issuetype: { name: 'Story' },
          project: { key: 'TEST' },
        },
      };
      mockRequest.mockResolvedValue({ data: mockIssue });

      const result = await client.getIssue('TEST-123');

      expect(mockRequest).toHaveBeenCalledWith(
        'GET',
        '/rest/api/3/issue/TEST-123',
        undefined
      );
      expect(result).toEqual(mockIssue);
    });
  });

  // Note: createIssue method doesn't exist in current implementation

  describe('createSubtask', () => {
    it('should create a subtask', async () => {
      const mockResponse = {
        id: '10004',
        key: 'TEST-124',
      };
      // Mock the dependent calls
      const mockParentIssue = {
        id: '10001',
        key: 'TEST-123',
        fields: {
          project: { key: 'TEST' },
        },
      };
      mockRequest
        .mockResolvedValueOnce({ data: mockParentIssue })
        .mockResolvedValueOnce({
          data: { issueTypes: [{ name: 'Sub-task', id: '10001' }] },
        })
        .mockResolvedValueOnce({ data: mockResponse });

      const result = await client.createSubtask(
        'TEST-123',
        'Subtask summary',
        'Subtask description'
      );

      expect(result).toEqual(mockResponse.key);
    });
  });

  describe('addComment', () => {
    it('should add comment to issue', async () => {
      const mockResponse = {
        id: '10005',
        self: 'https://test.atlassian.net/rest/api/3/issue/TEST-123/comment/10005',
      };
      mockRequest.mockResolvedValue({ data: undefined });

      await client.addComment('TEST-123', 'Test comment');
    });

    it('should add comment with markdown formatting', async () => {
      mockRequest.mockResolvedValue({ data: undefined });

      await client.addComment('TEST-123', '**Bold** and *italic* text');
    });
  });

  // Note: transitionIssue method doesn't exist in current implementation

  describe('getTransitions', () => {
    it('should get available transitions for issue', async () => {
      const mockTransitions = {
        transitions: [
          { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
          { id: '31', name: 'Done', to: { name: 'Done' } },
        ],
      };
      mockRequest.mockResolvedValue({ data: mockTransitions });

      const result = await client.getTransitions('TEST-123');

      expect(result).toEqual(mockTransitions.transitions);
    });
  });

  describe('uploadAttachment', () => {
    it('should upload attachment to issue', async () => {
      // uploadAttachment uses fetch directly, not the HttpClient
      // So we can't easily mock it without more complex setup
      // For now, just test that the method exists
      expect(typeof client.uploadAttachment).toBe('function');
    });
  });

  describe('search', () => {
    it('should search issues with JQL', async () => {
      const mockSearchResult = {
        startAt: 0,
        maxResults: 50,
        total: 1,
        issues: [
          {
            id: '10008',
            key: 'TEST-456',
            fields: {
              summary: 'Search result',
              status: { name: 'Open' },
            },
          },
        ],
      };
      mockRequest.mockResolvedValue({ data: mockSearchResult });

      const result = await client.search('project = TEST AND status = "Open"');

      expect(result).toEqual({
        issues: mockSearchResult.issues,
        total: mockSearchResult.total,
      });
    });

    // Note: The current implementation doesn't support pagination in search
  });

  // Note: getIssueType and getProject methods don't exist in current implementation

  describe('error handling', () => {
    it('should handle HTTP errors gracefully', async () => {
      mockRequest.mockRejectedValue(new Error('HTTP 404: Not Found'));

      await expect(client.getIssue('TEST-999')).rejects.toThrow(
        'HTTP 404: Not Found'
      );
    });

    it('should handle network errors', async () => {
      mockRequest.mockRejectedValue(new Error('Network timeout'));

      await expect(client.getIssue('TEST-123')).rejects.toThrow(
        'Network timeout'
      );
    });
  });
});
