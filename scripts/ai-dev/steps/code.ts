import { PipelineContext } from '../types.js';
import { Logger } from '../core/logger.js';
import { codeImplCommand } from './code-impl.js';
import { codeTestCommand } from './code-test.js';
import { codeQualityCommand } from './code-quality.js';
import { codeSecurityCommand } from './code-security.js';
import { codePerfCommand } from './code-perf.js';
import { shouldSkipExpensiveSteps } from '../core/trivial-skip.js';
import {
  checkScopeDrift,
  reportDrift,
  assertNoDrift,
} from '../core/scope-drift.js';
import { loadConfig } from '../config.js';
import { featureDir } from '../core/file-helpers.js';
import { join } from 'path';

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
  let skippedTrivial = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.name === 'Implementation') {
      try {
        Logger.info(`Running ${step.name.toLowerCase()} step...`);
        ctx.codeAliasMode = true;
        await step.fn(ctx);
        Logger.success(`${step.name} step completed`);

        // Check for scope drift after code-impl
        if (step.name === 'Implementation') {
          await checkAndReportScopeDrift(ctx);
        }

        if (shouldSkipExpensiveSteps()) {
          skippedTrivial = true;
          Logger.banner('TRIVIAL CHANGE DETECTED - Skipping expensive steps');
          break;
        }
      } catch (error) {
        Logger.error(`${step.name} step failed: ${error}`);
        failedAt = step.name;
        break;
      }
    } else {
      try {
        Logger.info(`Running ${step.name.toLowerCase()} step...`);
        await step.fn(ctx);
        Logger.success(`${step.name} step completed`);
      } catch (error) {
        Logger.error(`${step.name} step failed: ${error}`);
        failedAt = step.name;
        break;
      }
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

  if (skippedTrivial) {
    Logger.banner('Code Steps Completed (Trivial Skip)');
    console.log(
      `
Implementation + Quality completed. Skipped: test, security, perf (trivial change).

Next steps:
  1. Review the implementation
  2. Run: ai-dev ${ctx.ticketId} validate to validate before deployment
      `.trim()
    );
  } else {
    Logger.banner('All Code Steps Completed Successfully');
    console.log(
      `
All code steps have completed. Next steps:
  1. Review the implementation and all analysis documents
  2. Run: ai-dev ${ctx.ticketId} validate to validate before deployment
      `.trim()
    );
  }
}

async function checkAndReportScopeDrift(ctx: PipelineContext): Promise<void> {
  try {
    const config = await loadConfig(ctx.repoRoot);
    const designPath = join(config.featureDocsDir, ctx.ticketId, 'design.md');

    Logger.info('Checking for scope drift...');
    const result = await checkScopeDrift(
      ctx.repoRoot,
      ctx.ticketId,
      designPath
    );
    reportDrift(result);

    if (result.hasDrift) {
      Logger.warn(
        'Some files were modified outside the declared scope. Review and confirm if intentional.'
      );
    }
  } catch (error) {
    Logger.warn(`Scope drift check skipped: ${error}`);
  }
}
