import { execSync } from 'child_process';
import { PipelineContext, AgentConfig } from '../types.js';
import { Logger } from './logger.js';
import { Shell } from './shell.js';

export async function runAgent(
  ctx: PipelineContext,
  config: AgentConfig,
  variables: Record<string, string>
): Promise<string> {
  Logger.step(`Running agent: ${config.instructionsFile}`);
  Logger.debug(`Budget: $${config.budget}, Model: ${config.model}`);

  try {
    // 1. Read instructions file
    const fs = await import('fs/promises');
    const instructions = await fs.readFile(config.instructionsFile, 'utf8');

    // 2. Replace {KEY} placeholders with actual values
    let processedInstructions = instructions;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      processedInstructions = processedInstructions.replaceAll(
        placeholder,
        value
      );
    }

    // Debug: Show processed instructions (truncated)
    if (process.env.DEBUG) {
      const preview = processedInstructions.substring(0, 500);
      Logger.debug(
        `Processed instructions preview:\n${preview}${processedInstructions.length > 500 ? '...' : ''}`
      );
    }

    // 3. Build the claude command
    const claudeArgs = [
      ctx.claudeCmd,
      '-p',
      '--system-prompt',
      processedInstructions,
      '--model',
      config.model,
      '--max-budget-usd',
      config.budget.toString(),
    ];

    const command = claudeArgs.join(' ');

    // 4. Execute the agent
    Logger.info('Executing Claude agent...');
    const result = Shell.exec(command, { silent: true });

    if (result.exitCode !== 0) {
      Logger.error(`Agent execution failed with exit code ${result.exitCode}`);
      if (result.stderr) {
        Logger.error(`Stderr: ${result.stderr}`);
      }
      throw new Error(`Agent failed: ${result.stderr || result.stdout}`);
    }

    const output = result.stdout.trim();
    Logger.success('Agent execution completed');
    Logger.debug(`Agent output length: ${output.length} characters`);

    return output;
  } catch (error) {
    Logger.error(`Failed to run agent: ${error}`);
    throw error;
  }
}

export function validateAgentConfig(config: AgentConfig): void {
  if (!config.instructionsFile) {
    throw new Error('Agent config must specify instructionsFile');
  }
  if (!config.budget || config.budget <= 0) {
    throw new Error('Agent config must specify a positive budget');
  }
  if (!config.model || !['sonnet', 'haiku'].includes(config.model)) {
    throw new Error(
      'Agent config must specify a valid model (sonnet or haiku)'
    );
  }
}

export function extractJsonFromOutput(output: string): any {
  // Try to find JSON in the output
  const jsonMatch = output.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (error) {
      Logger.warn('Failed to parse JSON from code block');
    }
  }

  // Try to parse the entire output as JSON
  try {
    return JSON.parse(output);
  } catch (error) {
    Logger.warn('Failed to parse entire output as JSON');
  }

  // Look for JSON object boundaries
  const startBrace = output.indexOf('{');
  const endBrace = output.lastIndexOf('}');

  if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
    const jsonStr = output.substring(startBrace, endBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      Logger.warn('Failed to parse JSON from extracted object');
    }
  }

  throw new Error('No valid JSON found in agent output');
}
