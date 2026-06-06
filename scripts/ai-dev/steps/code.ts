import { PipelineContext } from '../types.js';
import { Logger } from '../core/logger.js';
import { codeImplCommand } from './code-impl.js';
import { codeTestCommand } from './code-test.js';
import { codeQualityCommand } from './code-quality.js';
import { codeSecurityCommand } from './code-security.js';
import { codePerfCommand } from './code-perf.js';

export async function codeCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running all code steps for ${ctx.ticketId}`);

  const steps = [
    { name: 'Implementation', fn: codeImplCommand },
    { name: 'Tests', fn: codeTestCommand },
    { name: 'Quality', fn: codeQualityCommand },
    { name: 'Security', fn: codeSecurityCommand },
    { name: 'Performance', fn: codePerfCommand },
  ];

  let failedAt: string | null = null;

  for (const step of steps) {
    try {
      Logger.info(`Running ${step.name.toLowerCase()} step...`);

      // Set code alias mode to prevent individual transitions and commits
      ctx.codeAliasMode = true;

      await step.fn(ctx);
      Logger.success(`${step.name} step completed`);
    } catch (error) {
      Logger.error(`${step.name} step failed: ${error}`);
      failedAt = step.name;
      break;
    }
  }

  // Reset code alias mode
  ctx.codeAliasMode = false;

  if (failedAt) {
    Logger.error(`Code pipeline failed at: ${failedAt}`);
    console.log(
      `
To continue from the failed step:
  ai-dev ${ctx.ticketId} ${failedAt.toLowerCase().replace(' ', '-')}
    `.trim()
    );
    process.exit(1);
  }

  Logger.banner('All Code Steps Completed Successfully');
  console.log(
    `
All code steps have completed. Next steps:
  1. Review the implementation and all analysis documents
  2. Run: ai-dev ${ctx.ticketId} validate to validate before deployment
    `.trim()
  );
}
