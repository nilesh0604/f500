import { HttpClient, HttpError } from './http.js';
import { JiraCredentials, JiraIssue, AdfNode } from '../types.js';
import { Logger } from '../core/logger.js';

export interface JiraComment {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  body: {
    type: string;
    content: AdfNode[];
  };
  created: string;
  updated?: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: {
    name: string;
  };
}

export interface CreateIssueRequest {
  summary: string;
  description?: string;
  project: {
    key: string;
  };
  issuetype: {
    id: string;
  };
  parent?: {
    key: string;
  };
}

export class JiraClient {
  private client: HttpClient;

  constructor(private credentials: JiraCredentials) {
    this.client = new HttpClient({
      baseUrl: credentials.baseUrl,
    }).withAuth(credentials.email, credentials.apiToken);
  }

  async request<T>(method: string, endpoint: string, data?: any): Promise<T> {
    try {
      const response = await this.client.request<T>(method, endpoint, data);
      return response.data;
    } catch (error) {
      if (error instanceof HttpError) {
        Logger.error(`Jira API error: ${error.message}`);
        if (error.response) {
          Logger.debug(`Response: ${JSON.stringify(error.response, null, 2)}`);
        }
      }
      throw error;
    }
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    Logger.debug(`Fetching issue: ${issueKey}`);
    return this.request<JiraIssue>('GET', `/rest/api/3/issue/${issueKey}`);
  }

  async getStatus(issueKey: string): Promise<string> {
    const issue = await this.getIssue(issueKey);
    return issue.fields.status.name;
  }

  async getIssueTypeId(project: string, typeName: string): Promise<string> {
    Logger.debug(`Getting issue type ID for ${typeName} in project ${project}`);
    const response = await this.request<any>(
      'GET',
      `/rest/api/3/issuetype/project?projectId=${project}`
    );

    const issueType = response.issueTypes.find(
      (it: any) => it.name === typeName
    );
    if (!issueType) {
      throw new Error(
        `Issue type '${typeName}' not found in project ${project}`
      );
    }

    return issueType.id;
  }

  async createSubtask(
    parentKey: string,
    summary: string,
    description?: string
  ): Promise<string> {
    Logger.debug(`Creating subtask under ${parentKey}: ${summary}`);

    // Get parent issue to get project key
    const parent = await this.getIssue(parentKey);
    const subtaskTypeId = await this.getIssueTypeId(
      parent.fields.project.key,
      'Sub-task'
    );

    const request: CreateIssueRequest = {
      summary,
      description: description
        ? JSON.stringify(this.adfFromText(description))
        : undefined,
      project: {
        key: parent.fields.project.key,
      },
      issuetype: {
        id: subtaskTypeId,
      },
      parent: {
        key: parentKey,
      },
    };

    const response = await this.request<any>(
      'POST',
      '/rest/api/3/issue',
      request
    );
    return response.key;
  }

  async addComment(issueKey: string, body: string): Promise<void> {
    Logger.debug(`Adding comment to ${issueKey}`);
    const payload = {
      body: this.adfFromText(body),
    };
    await this.request<void>(
      'POST',
      `/rest/api/3/issue/${issueKey}/comment`,
      payload
    );
  }

  async getComments(issueKey: string): Promise<JiraComment[]> {
    Logger.debug(`Fetching comments for ${issueKey}`);
    const response = await this.request<{ comments: JiraComment[] }>(
      'GET',
      `/rest/api/3/issue/${issueKey}/comment?expand=renderedBody`
    );
    return response.comments;
  }

  async uploadAttachment(issueKey: string, filePath: string): Promise<void> {
    Logger.debug(`Uploading attachment to ${issueKey}: ${filePath}`);

    // For file uploads, we need to use multipart/form-data
    // Since fetch doesn't support multipart easily, we'll use a different approach
    const fs = await import('fs/promises');

    const fileBuffer = await fs.readFile(filePath);

    // Create form data manually
    const boundary =
      '----formdata-node-' + Math.random().toString(36).substr(2, 16);
    let body = '';

    body += '--' + boundary + '\r\n';
    body +=
      'Content-Disposition: form-data; name="file"; filename="' +
      filePath.split('/').pop() +
      '"\r\n';
    body += 'Content-Type: application/octet-stream\r\n\r\n';
    body += fileBuffer.toString('binary');
    body += '\r\n--' + boundary + '--\r\n';

    const response = await fetch(
      `${this.credentials.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
      {
        method: 'POST',
        headers: {
          'X-Atlassian-Token': 'no-check',
          Authorization: `Basic ${Buffer.from(`${this.credentials.email}:${this.credentials.apiToken}`).toString('base64')}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to upload attachment: ${response.statusText}`);
    }
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    Logger.debug(`Getting available transitions for ${issueKey}`);
    const response = await this.request<{ transitions: JiraTransition[] }>(
      'GET',
      `/rest/api/3/issue/${issueKey}/transitions`
    );
    return response.transitions;
  }

  async transitionTo(issueKey: string, targetStatus: string): Promise<void> {
    Logger.debug(`Transitioning ${issueKey} to ${targetStatus}`);

    const transitions = await this.getTransitions(issueKey);
    const transition = transitions.find(t => t.to.name === targetStatus);

    if (!transition) {
      throw new Error(
        `Transition to '${targetStatus}' not available for issue ${issueKey}`
      );
    }

    const payload = {
      transition: {
        id: transition.id,
      },
    };

    await this.request<void>(
      'POST',
      `/rest/api/3/issue/${issueKey}/transitions`,
      payload
    );
  }

  private adfFromText(text: string): {
    type: string;
    version: number;
    content: AdfNode[];
  } {
    // Split text by paragraphs and convert to ADF
    const paragraphs = text.split('\n\n').filter(p => p.trim());

    const content: AdfNode[] = paragraphs.map(paragraph => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: paragraph.trim(),
        },
      ],
    }));

    return {
      type: 'doc',
      version: 1,
      content,
    };
  }

  async search(jql: string): Promise<{ issues: JiraIssue[]; total: number }> {
    Logger.debug(`Searching with JQL: ${jql}`);
    const response = await this.request<any>('POST', '/rest/api/3/search', {
      jql,
      maxResults: 50,
    });
    return {
      issues: response.issues,
      total: response.total,
    };
  }
}
