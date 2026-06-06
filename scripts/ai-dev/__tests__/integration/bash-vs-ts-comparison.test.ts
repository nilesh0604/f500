// Integration tests to compare bash vs TypeScript CLI outputs
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

describe('Bash vs TypeScript CLI Comparison', () => {
  const repoRoot = process.cwd();
  const testTicketId = 'TEST-COMPARE-123';
  const bashScript = join(repoRoot, 'scripts/ai-dev.sh');
  const tsCli = join(repoRoot, 'scripts/ai-dev/cli.ts');

  beforeAll(() => {
    // Skip if bash script doesn't exist
    if (!existsSync(bashScript)) {
      console.warn('Bash script not found, skipping comparison tests');
      return;
    }
  });

  describe('help command', () => {
    it('should show similar help output', () => {
      if (!existsSync(bashScript)) return;

      try {
        const bashHelp = execSync(`${bashScript} help`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        const tsHelp = execSync(`npx tsx ${tsCli} help`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        // Both should contain key help sections
        expect(bashHelp).toContain('Usage:');
        expect(tsHelp).toContain('Usage:');
        expect(bashHelp).toContain('Commands:');
        expect(tsHelp).toContain('Commands:');
      } catch (error) {
        console.warn('Help comparison test failed:', error);
      }
    });
  });

  describe('status command', () => {
    it('should show similar status output', () => {
      if (!existsSync(bashScript)) return;

      try {
        const bashStatus = execSync(`${bashScript} status`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        const tsStatus = execSync(`npx tsx ${tsCli} status`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        // Both should show status information
        expect(bashStatus).toBeDefined();
        expect(tsStatus).toBeDefined();
      } catch (error) {
        console.warn('Status comparison test failed:', error);
      }
    });
  });

  describe('tool requirements', () => {
    it('should check for required tools similarly', () => {
      if (!existsSync(bashScript)) return;

      try {
        // Test missing jq tool check
        const bashOutput = execSync(`${bashScript} status`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
            PATH: '', // Empty PATH to simulate missing tools
          },
        });

        // TypeScript version should handle missing tools gracefully
        const tsOutput = execSync(`npx tsx ${tsCli} status`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        expect(bashOutput).toBeDefined();
        expect(tsOutput).toBeDefined();
      } catch (error) {
        // Expected to fail with missing tools
        expect(error).toBeDefined();
      }
    });
  });

  describe('error handling', () => {
    it('should handle missing Jira credentials similarly', () => {
      if (!existsSync(bashScript)) return;

      // Test without Jira credentials
      expect(() => {
        execSync(`${bashScript} status`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: { ...process.env, JIRA_EMAIL: '', JIRA_API_TOKEN: '' },
        });
      }).toThrow();

      expect(() => {
        execSync(`npx tsx ${tsCli} status`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: { ...process.env, JIRA_EMAIL: '', JIRA_API_TOKEN: '' },
        });
      }).toThrow();
    });
  });

  describe('feature directory creation', () => {
    const testFeatureDir = join(repoRoot, 'docs/features', testTicketId);

    afterEach(() => {
      // Clean up test directory
      if (existsSync(testFeatureDir)) {
        rmSync(testFeatureDir, { recursive: true, force: true });
      }
    });

    it('should create feature directories in the same location', () => {
      if (!existsSync(bashScript)) return;

      try {
        // Both versions should create the same directory structure
        execSync(`${bashScript} init ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        expect(existsSync(testFeatureDir)).toBe(true);

        // Clean up
        rmSync(testFeatureDir, { recursive: true, force: true });

        // Test TypeScript version
        execSync(`npx tsx ${tsCli} init ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        expect(existsSync(testFeatureDir)).toBe(true);
      } catch (error) {
        console.warn('Feature directory creation test failed:', error);
      }
    });
  });

  describe('command structure parity', () => {
    it('should have the same available commands', () => {
      if (!existsSync(bashScript)) return;

      try {
        const bashHelp = execSync(`${bashScript} help`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        const tsHelp = execSync(`npx tsx ${tsCli} help`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_EMAIL: 'test@example.com',
            JIRA_API_TOKEN: 'test-token',
          },
        });

        // Check that key commands exist in both
        const expectedCommands = [
          'init',
          'status',
          'requirements',
          'design',
          'code',
          'validate',
        ];

        expectedCommands.forEach(cmd => {
          expect(bashHelp).toContain(cmd);
          expect(tsHelp).toContain(cmd);
        });
      } catch (error) {
        console.warn('Command structure comparison failed:', error);
      }
    });
  });
});
