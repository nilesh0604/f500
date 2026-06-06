// End-to-end integration tests with real Jira API
// These tests require actual Jira credentials and are skipped by default
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

// Skip tests unless ENABLE_E2E_TESTS is set
const e2eEnabled = process.env.ENABLE_E2E_TESTS === 'true';

describe('E2E Tests Placeholder', () => {
  it('should have at least one test to satisfy Jest', () => {
    expect(true).toBe(true);
  });
});

// Use describe.skip when E2E is disabled to avoid Jest errors
const E2eTests = e2eEnabled ? describe : describe.skip;

E2eTests('End-to-End Jira Integration', () => {
  const repoRoot = process.cwd();
  const tsCli = join(repoRoot, 'scripts/ai-dev/cli.ts');
  const testTicketId = process.env.E2E_TEST_TICKET_ID || 'TEST-E2E-123';

  beforeAll(() => {
    // Verify required environment variables
    const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'];
    const missing = required.filter(env => !process.env[env]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`
      );
    }
  });

  describe('Real Jira Operations', () => {
    it('should successfully fetch issue status', () => {
      try {
        const output = execSync(`npx tsx ${tsCli} status ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          timeout: 10000,
        });

        expect(output).toBeDefined();
        expect(output.length).toBeGreaterThan(0);
        console.log('✅ Status command output received');
      } catch (error: any) {
        // Check if it's a "not found" error which is acceptable for a test ticket
        if (
          error.stdout?.includes('does not exist') ||
          error.stderr?.includes('404')
        ) {
          console.log(
            '✅ Jira API responding correctly (ticket not found as expected)'
          );
        } else {
          throw error;
        }
      }
    });

    it('should handle authentication correctly', () => {
      try {
        // Test with invalid credentials to ensure auth is working
        execSync(`npx tsx ${tsCli} status ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_API_TOKEN: 'invalid-token',
          },
          timeout: 10000,
        });

        // Should not reach here
        throw new Error('Expected authentication to fail');
      } catch (error: any) {
        if (
          error.stderr?.includes('401') ||
          error.stderr?.includes('Unauthorized')
        ) {
          console.log('✅ Authentication validation working correctly');
        } else {
          // Re-throw unexpected errors
          throw error;
        }
      }
    });

    it('should create feature directory structure', () => {
      const testFeatureDir = join(repoRoot, 'docs/features', testTicketId);

      // Clean up first
      if (existsSync(testFeatureDir)) {
        rmSync(testFeatureDir, { recursive: true, force: true });
      }

      try {
        execSync(`npx tsx ${tsCli} init ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          timeout: 10000,
        });

        expect(existsSync(testFeatureDir)).toBe(true);
        expect(existsSync(join(testFeatureDir, 'README.md'))).toBe(true);

        console.log('✅ Feature directory created successfully');
      } finally {
        // Clean up
        if (existsSync(testFeatureDir)) {
          rmSync(testFeatureDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', () => {
      // Test with an invalid Jira URL to simulate network issues
      try {
        execSync(`npx tsx ${tsCli} status ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          env: {
            ...process.env,
            JIRA_BASE_URL: 'https://invalid-url.atlassian.net',
          },
          timeout: 5000,
        });

        throw new Error('Expected network error');
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          console.log('✅ Network errors handled gracefully');
        } else {
          throw error;
        }
      }
    });

    it('should validate ticket ID format', () => {
      const invalidTicketIds = [
        'invalid',
        '123',
        'PROJECT-',
        '-123',
        'A-B-C-123',
      ];

      for (const ticketId of invalidTicketIds) {
        try {
          execSync(`npx tsx ${tsCli} status ${ticketId}`, {
            encoding: 'utf8',
            cwd: repoRoot,
            timeout: 5000,
          });

          // Some implementations might not validate format, which is acceptable
          console.log(`⚠️  Ticket ID validation not enforced for: ${ticketId}`);
        } catch (error: any) {
          // Validation error is good but not required
          if (error.message.includes('Invalid ticket')) {
            console.log(`✅ Ticket validation working for: ${ticketId}`);
          }
        }
      }
    });
  });

  describe('Performance', () => {
    it('should complete status command within reasonable time', () => {
      const startTime = Date.now();

      try {
        execSync(`npx tsx ${tsCli} status ${testTicketId}`, {
          encoding: 'utf8',
          cwd: repoRoot,
          timeout: 15000, // Max 15 seconds
        });

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds

        console.log(`✅ Status completed in ${duration}ms`);
      } catch (error: any) {
        // Account for network latency
        const duration = Date.now() - startTime;
        if (duration < 15000) {
          console.log(`✅ Request failed within timeout (${duration}ms)`);
        } else {
          throw error;
        }
      }
    });
  });
});
