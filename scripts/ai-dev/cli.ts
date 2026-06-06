#!/usr/bin/env node
import { Command } from 'commander';
import { Logger } from './core/logger.js';
import { loadConfig } from './config.js';
import { helpCommand } from './steps/help.js';
import { initCommand } from './steps/init.js';
import { statusCommand } from './steps/status.js';
import { createCommand } from './steps/create.js';
import { requirementsCommand } from './steps/requirements.js';
import { resolveCommand } from './steps/resolve.js';
import { designCommand } from './steps/design.js';
import { codeImplCommand } from './steps/code-impl.js';
import { codeTestCommand } from './steps/code-test.js';
import { codeQualityCommand } from './steps/code-quality.js';
import { codeSecurityCommand } from './steps/code-security.js';
import { codePerfCommand } from './steps/code-perf.js';
import { codeCommand } from './steps/code.js';
import { validateCommand } from './steps/validate.js';
import { fixLintCommand } from './steps/fix-lint.js';
import { fixTypesCommand } from './steps/fix-types.js';
import { fixTestsCommand } from './steps/fix-tests.js';
import { fixBuildCommand } from './steps/fix-build.js';
import { fixSecurityCommand } from './steps/fix-security.js';
import { fixConflictsCommand } from './steps/fix-conflicts.js';
import { deployPrCommand } from './steps/deploy-pr.js';
import { deployShipCommand } from './steps/deploy-ship.js';
import { releaseCommand } from './steps/release.js';
import { rollbackCommand } from './steps/rollback.js';
import { PipelineContext, JiraCredentials } from './types.js';

const program = new Command()
  .name('ai-dev')
  .description('Async AI-driven development pipeline (Jira-backed)')
  .version('1.0.0');

// Global options
program
  .option('-d, --debug', 'Enable debug output')
  .option('--repo-root <path>', 'Repository root path', process.cwd());

// Help command
program
  .command('help')
  .description('Show extended help')
  .action(async () => {
    await helpCommand();
  });

// Create command
program
  .command('create')
  .argument('<idea>', 'Description of the ticket to create')
  .description('Create a new ticket from an idea')
  .action(async idea => {
    try {
      const ctx = await createPipelineContext('');
      await createCommand(ctx, idea);
    } catch (error) {
      Logger.error(`Create failed: ${error}`);
      process.exit(1);
    }
  });

// Requirements command
program
  .command('requirements')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Gather and document requirements')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await requirementsCommand(ctx);
    } catch (error) {
      Logger.error(`Requirements failed: ${error}`);
      process.exit(1);
    }
  });

// Resolve command
program
  .command('resolve')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Resolve open questions in requirements')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await resolveCommand(ctx);
    } catch (error) {
      Logger.error(`Resolve failed: ${error}`);
      process.exit(1);
    }
  });

// Design command
program
  .command('design')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Create technical design')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await designCommand(ctx);
    } catch (error) {
      Logger.error(`Design failed: ${error}`);
      process.exit(1);
    }
  });

// Code implementation command
program
  .command('code-impl')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Write implementation code')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await codeImplCommand(ctx);
    } catch (error) {
      Logger.error(`Code implementation failed: ${error}`);
      process.exit(1);
    }
  });

// Code test command
program
  .command('code-test')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Write tests')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await codeTestCommand(ctx);
    } catch (error) {
      Logger.error(`Code test failed: ${error}`);
      process.exit(1);
    }
  });

// Code quality command
program
  .command('code-quality')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Run quality checks and fixes')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await codeQualityCommand(ctx);
    } catch (error) {
      Logger.error(`Code quality failed: ${error}`);
      process.exit(1);
    }
  });

// Code security command
program
  .command('code-security')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Run security scans')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await codeSecurityCommand(ctx);
    } catch (error) {
      Logger.error(`Code security failed: ${error}`);
      process.exit(1);
    }
  });

// Code performance command
program
  .command('code-perf')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Performance analysis')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await codePerfCommand(ctx);
    } catch (error) {
      Logger.error(`Code performance failed: ${error}`);
      process.exit(1);
    }
  });

// Code command (alias for all code steps)
program
  .command('code')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Run all code steps (impl → test → quality → security → perf)')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await codeCommand(ctx);
    } catch (error) {
      Logger.error(`Code pipeline failed: ${error}`);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Validate all checks before deployment')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await validateCommand(ctx);
    } catch (error) {
      Logger.error(`Validation failed: ${error}`);
      process.exit(1);
    }
  });

// Deploy PR command
program
  .command('deploy-pr')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Create and deploy PR to CI')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await deployPrCommand(ctx);
    } catch (error) {
      Logger.error(`Deploy PR failed: ${error}`);
      process.exit(1);
    }
  });

// Deploy Ship command
program
  .command('deploy-ship')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .option('--auto', 'Auto-apply fixes without prompting')
  .description('Monitor CI and auto-fix failures')
  .action(async (ticketId, options) => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await deployShipCommand(ctx, options.auto || false);
    } catch (error) {
      Logger.error(`Deploy Ship failed: ${error}`);
      process.exit(1);
    }
  });

// Deploy command (alias for deploy-pr)
program
  .command('deploy')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Deprecated — use deploy-pr then deploy-ship')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await deployPrCommand(ctx);
    } catch (error) {
      Logger.error(`Deploy failed: ${error}`);
      process.exit(1);
    }
  });

// Fix Lint command
program
  .command('fix-lint')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Fix ESLint/Prettier CI failures')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await fixLintCommand(ctx);
    } catch (error) {
      Logger.error(`Fix lint failed: ${error}`);
      process.exit(1);
    }
  });

// Fix Types command
program
  .command('fix-types')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Fix TypeScript type errors from CI')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await fixTypesCommand(ctx);
    } catch (error) {
      Logger.error(`Fix types failed: ${error}`);
      process.exit(1);
    }
  });

// Fix Tests command
program
  .command('fix-tests')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Fix failing Jest tests')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await fixTestsCommand(ctx);
    } catch (error) {
      Logger.error(`Fix tests failed: ${error}`);
      process.exit(1);
    }
  });

// Fix Build command
program
  .command('fix-build')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Fix build/compile failures from CI')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await fixBuildCommand(ctx);
    } catch (error) {
      Logger.error(`Fix build failed: ${error}`);
      process.exit(1);
    }
  });

// Fix Security command
program
  .command('fix-security')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Fix security scan findings')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await fixSecurityCommand(ctx);
    } catch (error) {
      Logger.error(`Fix security failed: ${error}`);
      process.exit(1);
    }
  });

// Fix Conflicts command
program
  .command('fix-conflicts')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Fix merge conflicts with main')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await fixConflictsCommand(ctx);
    } catch (error) {
      Logger.error(`Fix conflicts failed: ${error}`);
      process.exit(1);
    }
  });

// Helper to create pipeline context
async function createPipelineContext(
  ticketId: string
): Promise<PipelineContext> {
  const repoRoot = program.opts().repoRoot || process.cwd();
  const config = await loadConfig(repoRoot);

  // Get Jira credentials from environment
  const jira: JiraCredentials = {
    baseUrl: process.env.JIRA_BASE_URL || 'https://orderflow.atlassian.net',
    email: process.env.JIRA_EMAIL || '',
    apiToken: process.env.JIRA_API_TOKEN || '',
  };

  if (!jira.email || !jira.apiToken) {
    throw new Error(
      'JIRA_EMAIL and JIRA_API_TOKEN environment variables must be set'
    );
  }

  return {
    ticketId,
    repoRoot,
    claudeCmd: config.claudeCmd,
    jira,
    codeAliasMode: false,
  };
}

// Init command
program
  .command('init')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description('Initialize a new feature ticket')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await initCommand(ctx);
    } catch (error) {
      Logger.error(`Init failed: ${error}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .argument('[ticket-id]', 'Jira ticket ID (e.g., OF-123)')
  .description('Show current status of all steps')
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await statusCommand(ctx);
    } catch (error) {
      Logger.error(`Status failed: ${error}`);
      process.exit(1);
    }
  });

// Release command
program
  .command('release')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description(
    'Post-merge CDK deploy: synth, build, deploy, smoke tests, Jira Done (needs: PR merged)'
  )
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await releaseCommand(ctx);
    } catch (error) {
      Logger.error(`Release failed: ${error}`);
      process.exit(1);
    }
  });

// Rollback command
program
  .command('rollback')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., OF-123)')
  .description(
    'Revert CDK stacks to previous known-good state (main~1 or release marker)'
  )
  .action(async ticketId => {
    try {
      const ctx = await createPipelineContext(ticketId);
      await rollbackCommand(ctx);
    } catch (error) {
      Logger.error(`Rollback failed: ${error}`);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Enable debug logging if flag is set
if (program.opts().debug) {
  process.env.DEBUG = '1';
  Logger.debug('Debug mode enabled');
}

// Export for testing
export { program };
