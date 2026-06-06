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
}

export interface PipelineContext {
  ticketId: string;
  repoRoot: string;
  claudeCmd: string;
  jira: JiraCredentials;
  codeAliasMode: boolean;
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

// Secrets patterns for security scanning
export const SECRET_PATTERNS = [
  /AWS[_\s]*ACCESS[_\s]*KEY[_\s]*ID[=:]\s*[A-Z0-9]{20}/gi,
  /AWS[_\s]*SECRET[_\s]*ACCESS[_\s]*KEY[=:]\s*[A-Za-z0-9/+=]{40}/gi,
  /API[_\s]*KEY[=:]\s*[A-Za-z0-9_\-]{16,}/gi,
  /PASSWORD[=:]\s*[^\s]{8,}/gi,
  /TOKEN[=:]\s*[A-Za-z0-9_\-]{20,}/gi,
];
