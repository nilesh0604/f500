import { execSync } from 'child_process';
import { ShellResult } from '../types.js';
import { Logger } from './logger.js';

export class Shell {
  static exec(
    command: string,
    options?: { cwd?: string; silent?: boolean }
  ): ShellResult {
    const opts: any = {
      cwd: options?.cwd || process.cwd(),
      encoding: 'utf8',
      stdio: options?.silent ? 'pipe' : 'inherit',
    };

    try {
      if (!options?.silent) {
        Logger.debug(`Executing: ${command}`);
      }

      const stdout = execSync(command, opts);
      return {
        stdout: stdout.toString(),
        stderr: '',
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        exitCode: error.status || 1,
      };
    }
  }

  static execSilent(command: string, cwd?: string): ShellResult {
    return this.exec(command, { cwd, silent: true });
  }

  static execOrThrow(command: string, cwd?: string): string {
    const result = this.exec(command, { cwd, silent: true });
    if (result.exitCode !== 0) {
      throw new Error(`Command failed: ${command}\nStderr: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  static test(command: string, cwd?: string): boolean {
    const result = this.exec(command, { cwd, silent: true });
    return result.exitCode === 0;
  }
}
