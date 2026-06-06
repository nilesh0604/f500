import { StepName, AgentConfig } from './types.js';

export interface AiDlcConfig {
  steps: StepName[];
  gatedSteps: StepName[];
  agents: Record<string, AgentConfig>;
  featureDocsDir: string; // default: 'docs/features'
  claudeCmd: string; // default: 'codemie-claude'
}

const DEFAULT_CONFIG: AiDlcConfig = {
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
  ],
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
  agents: {
    'ticket-creator': {
      instructionsFile: 'agents/ticket-creator/instructions.md',
      budget: 1.0,
      model: 'sonnet',
    },
    requirements: {
      instructionsFile: 'agents/requirements-agent/instructions.md',
      budget: 1.5,
      model: 'sonnet',
    },
    design: {
      instructionsFile: 'agents/design-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
    'code-impl': {
      instructionsFile: 'agents/code-impl-agent/instructions.md',
      budget: 3.0,
      model: 'sonnet',
    },
    'code-test': {
      instructionsFile: 'agents/code-test-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
    'code-quality': {
      instructionsFile: 'agents/code-quality-agent/instructions.md',
      budget: 1.5,
      model: 'sonnet',
    },
    'code-security': {
      instructionsFile: 'agents/code-security-agent/instructions.md',
      budget: 1.5,
      model: 'sonnet',
    },
    'code-perf': {
      instructionsFile: 'agents/code-perf-agent/instructions.md',
      budget: 1.5,
      model: 'sonnet',
    },
    deploy: {
      instructionsFile: 'agents/deploy-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
    'fix-lint': {
      instructionsFile: 'agents/fix-lint-agent/instructions.md',
      budget: 1.0,
      model: 'haiku',
    },
    'fix-types': {
      instructionsFile: 'agents/fix-types-agent/instructions.md',
      budget: 1.0,
      model: 'haiku',
    },
    'fix-tests': {
      instructionsFile: 'agents/fix-tests-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
    'fix-build': {
      instructionsFile: 'agents/fix-build-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
    'fix-security': {
      instructionsFile: 'agents/fix-security-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
    'fix-conflicts': {
      instructionsFile: 'agents/fix-conflicts-agent/instructions.md',
      budget: 2.0,
      model: 'sonnet',
    },
  },
  featureDocsDir: 'docs/features',
  claudeCmd: 'codemie-claude',
};

let cachedConfig: AiDlcConfig | null = null;

export async function loadConfig(repoRoot: string): Promise<AiDlcConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // Try to load custom config from repo root
    const configPath = `${repoRoot}/ai-dlc.config.ts`;
    const configModule = await import(configPath);
    cachedConfig = { ...DEFAULT_CONFIG, ...configModule.default };
    return cachedConfig as AiDlcConfig;
  } catch {
    // Fall back to default config
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig as AiDlcConfig;
  }
}

export function getConfig(): AiDlcConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return cachedConfig as AiDlcConfig;
}
