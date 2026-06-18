import { Logger } from '../core/logger.js';

export async function helpCommand(): Promise<void> {
  Logger.banner('AI-Dev CLI - Pipeline Commands');

  console.log(
    `
MAIN WORKFLOW COMMANDS:
  init <ticket-id>        Initialize a new feature ticket
  requirements           Gather and document requirements  
  design                 Create technical design
  code                   Run all code steps (impl→test→quality→security→perf)
  validate               Validate all checks before deployment
  deploy-pr              Deploy to PR environment
  deploy-ship            Deploy to production

INDIVIDUAL CODE STEPS:
  code-impl              Write implementation code
  code-test              Write tests
  code-quality           Run quality checks and fixes
  code-security          Run security scans
  code-perf              Performance analysis

FIX COMMANDS:
  fix-lint               Fix linting issues
  fix-types              Fix TypeScript errors
  fix-tests              Fix test failures
  fix-build              Fix build errors
  fix-security           Fix security issues
  fix-conflicts          Resolve git merge conflicts

OTHER COMMANDS:
  create <type>          Create new tickets
  resolve                Resolve open questions in requirements
  status                 Show current status of all steps
  release                Release to production
  rollback               Rollback last release

GLOBAL OPTIONS:
  --debug                Enable debug output
  --repo-root <path>     Set repository root path

EXAMPLES:
  ai-dev -- init SCRUM-123                     Initialize ticket
  ai-dev -- requirements SCRUM-123             Run requirements step
  ai-dev -- code SCRUM-123                     Run all code steps
  ai-dev -- status SCRUM-123                   Show status
  ai-dev -- --debug SCRUM-123 deploy-pr      Deploy with debug
  `.trim()
  );
}
