// Step names — single source of truth
export const STEPS_ORDERED = [
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
] as const;

export type StepName = (typeof STEPS_ORDERED)[number];

export const GATED_STEPS: StepName[] = [
  'requirements',
  'design',
  'code-impl',
  'code-test',
  'code-quality',
  'code-security',
  'code-perf',
  'deploy-pr',
];

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface AgentConfig {
  instructionsFile: string;
  budget: number;
  model: 'sonnet' | 'haiku';
  allowedTools?: string[];
}

export interface PipelineContext {
  ticketId: string;
  repoRoot: string;
  claudeCmd: string;
  jira: JiraCredentials;
  codeAliasMode: boolean;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  content: string;
  mimeType: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
    };
    project: {
      key: string;
    };
    issuetype: {
      id: string;
      name: string;
    };
    attachment?: JiraAttachment[];
  };
}

export interface AdfNode {
  type: string;
  version?: number;
  content?: AdfNode[];
  text?: string;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CiStatus {
  state: 'success' | 'failure' | 'pending';
  checks: Array<{
    name: string;
    state: string;
    conclusion?: string;
  }>;
}

export interface FixRetries {
  [key: string]: number;
}

// Agent result format for structured return
export type AgentStatus = 'done' | 'fail' | 'blocked' | 'setup-error';

export interface AgentResult {
  status: AgentStatus;
  summary: string;
  followups?: string[];
}

// Marker constants for parsing agent results
export const AGENT_RESULT_START = '---AGENT_RESULT_START---';
export const AGENT_RESULT_END = '---AGENT_RESULT_END---';

// Secrets patterns for security scanning
export const SECRET_PATTERNS = [
  /AWS[_\s]*ACCESS[_\s]*KEY[_\s]*ID[=:]\s*[A-Z0-9]{20}/gi,
  /AWS[_\s]*SECRET[_\s]*ACCESS[_\s]*KEY[=:]\s*[A-Za-z0-9/+=]{40}/gi,
  /API[_\s]*KEY[=:]\s*[A-Za-z0-9_\-]{16,}/gi,
  /PASSWORD[=:]\s*[^\s]{8,}/gi,
  /TOKEN[=:]\s*[A-Za-z0-9_\-]{20,}/gi,
];
