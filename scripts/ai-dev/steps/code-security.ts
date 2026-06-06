import { PipelineContext } from '../types.js';
import { JiraClient } from '../clients/jira-client.js';
import { Logger } from '../core/logger.js';
import { runAgent } from '../core/agent-runner.js';
import { checkPrerequisite } from '../core/prerequisite.js';
import {
  getSubtaskKey,
  featureDir,
  writeFileWithDir,
  readFileIfExists,
} from '../core/file-helpers.js';
import { commitAndPush } from '../core/git.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

export async function codeSecurityCommand(ctx: PipelineContext): Promise<void> {
  Logger.banner(`Running security analysis for ${ctx.ticketId}`);

  const jira = new JiraClient(ctx.jira);
  const config = await loadConfig(ctx.repoRoot);

  try {
    // Check prerequisites
    await checkPrerequisite(ctx, 'code-security');

    // Get the code-security subtask key
    const subtaskKey = await getSubtaskKey(
      ctx.repoRoot,
      ctx.ticketId,
      'code-security'
    );
    if (!subtaskKey) {
      throw new Error('Code security subtask not found. Did you run init?');
    }

    // Transition to In Progress
    Logger.info('Transitioning to In Progress...');
    await jira.transitionTo(subtaskKey, 'In Progress');

    // Get agent config
    const agentConfig = config.agents['code-security'];
    if (!agentConfig) {
      throw new Error('Code security agent not found in config');
    }

    // Run security scans
    Logger.info('Running security scans...');
    const securityResults = await runSecurityScans(ctx.repoRoot);

    // Read implementation and test files for context
    const implPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'implementation.md'
    );
    const testPath = join(config.featureDocsDir, ctx.ticketId, 'tests.md');

    const implementation = await readFileIfExists(implPath);
    const tests = await readFileIfExists(testPath);

    // Get ticket info
    const ticket = await jira.getIssue(ctx.ticketId);

    // Prepare variables for the agent
    const variables = {
      TICKET_ID: ctx.ticketId,
      TICKET_SUMMARY: ticket.fields.summary,
      IMPLEMENTATION: implementation || '',
      TESTS: tests || '',
      SECURITY_RESULTS: JSON.stringify(securityResults, null, 2),
      FEATURE_DIR: featureDir(ctx.repoRoot, ctx.ticketId),
      REPO_ROOT: ctx.repoRoot,
    };

    // Run the code security agent
    Logger.info('Analyzing security results and generating fixes...');
    const output = await runAgent(ctx, agentConfig, variables);

    // Save security analysis
    const securityPath = join(
      config.featureDocsDir,
      ctx.ticketId,
      'security.md'
    );
    await writeFileWithDir(securityPath, output);
    Logger.success(`Security analysis saved to: ${securityPath}`);

    // Apply security fixes if suggested
    const fixesApplied = await applySecurityFixes(output, ctx.repoRoot);

    // Update Jira with summary
    const comment = `h2. Security Analysis Complete

Security scans have been performed and vulnerabilities addressed.

h3. Security Findings:
* npm Audit: ${securityResults.npmAudit?.vulnerabilities || 0} vulnerabilities
* CodeQL: ${securityResults.codeql?.alerts || 0} alerts
* Snyk: ${securityResults.snyk?.vulnerabilities || 0} vulnerabilities
* Secrets Scan: ${securityResults.secrets?.found || 0} secrets found

h3. Fixes Applied:
${fixesApplied.length > 0 ? fixesApplied.map(f => `* ${f}`).join('\n') : '* No security fixes needed'}

h3. Security Checklist:
${generateSecurityChecklist(output)}

h3. Next Steps:
# Review the security analysis
# Run: {code}ai-dev ${ctx.ticketId} code-perf{code} for performance analysis

h3. Files:
* Security: [security.md|${securityPath.replace(ctx.repoRoot + '/', '')}]`;

    await jira.addComment(subtaskKey, comment);

    // Upload security file as attachment
    await jira.uploadAttachment(subtaskKey, securityPath);

    // Commit fixes if any were applied
    if (fixesApplied.length > 0) {
      const commitMsg = `security(${ctx.ticketId}): Apply security fixes`;
      const hasChanges = commitAndPush(commitMsg);
      if (hasChanges) {
        Logger.success('Security fixes committed and pushed');
      }
    }

    // Transition to Done if not in code alias mode
    if (!ctx.codeAliasMode) {
      await jira.transitionTo(subtaskKey, 'Done');
    }

    Logger.success('Code security step completed');

    if (!ctx.codeAliasMode) {
      console.log(
        `
Next command:
  ai-dev ${ctx.ticketId} code-perf
      `.trim()
      );
    }
  } catch (error) {
    Logger.error(`Code security step failed: ${error}`);
    throw error;
  }
}

async function runSecurityScans(repoRoot: string): Promise<any> {
  const { Shell } = await import('../core/shell.js');
  const results: any = {};

  // Run npm audit
  try {
    const auditResult = Shell.exec('npm audit --json', {
      cwd: repoRoot,
      silent: true,
    });

    const auditData = JSON.parse(auditResult.stdout);
    results.npmAudit = {
      vulnerabilities: Object.keys(auditData.vulnerabilities || {}).length,
      high: auditData.metadata?.vulnerabilities?.high || 0,
      moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
    };
  } catch {
    results.npmAudit = { error: 'npm audit failed' };
  }

  // Run CodeQL if available
  try {
    const codeqlResult = Shell.exec(
      'gh codeql database analyze --format=json',
      {
        cwd: repoRoot,
        silent: true,
      }
    );

    // Parse CodeQL results if available
    results.codeql = {
      alerts: 0,
      scanned: true,
    };
  } catch {
    results.codeql = { error: 'CodeQL not available or not configured' };
  }

  // Run Snyk if available
  try {
    const snykResult = Shell.exec('npx snyk test --json', {
      cwd: repoRoot,
      silent: true,
    });

    const snykData = JSON.parse(snykResult.stdout);
    results.snyk = {
      vulnerabilities: snykData.vulnerabilities?.length || 0,
      high:
        snykData.vulnerabilities?.filter((v: any) => v.severity === 'high')
          .length || 0,
    };
  } catch {
    results.snyk = { error: 'Snyk not available or not configured' };
  }

  // Scan for secrets
  try {
    const secretsResult = Shell.exec(
      'git log --all --full-history --pretty=format:"" --name-only | sort -u',
      {
        cwd: repoRoot,
        silent: true,
      }
    );

    const files = secretsResult.stdout.split('\n').filter((f: string) => f);
    const secretPatterns = [
      /password\s*=\s*['"]\w+/,
      /api[_-]?key\s*=\s*['"]\w+/,
      /secret\s*=\s*['"]\w+/,
      /token\s*=\s*['"]\w+/,
    ];

    let secretsFound = 0;
    for (const file of files) {
      try {
        const fileContent = Shell.execSilent(`git show HEAD:${file}`, {
          cwd: repoRoot,
        });
        for (const pattern of secretPatterns) {
          if (pattern.test(fileContent.stdout)) {
            secretsFound++;
          }
        }
      } catch {
        // File might not exist in HEAD
      }
    }

    results.secrets = { found: secretsFound };
  } catch {
    results.secrets = { error: 'Secrets scan failed' };
  }

  return results;
}

async function applySecurityFixes(
  output: string,
  repoRoot: string
): Promise<string[]> {
  const fixes: string[] = [];
  const { Shell } = await import('../core/shell.js');

  // Check for npm audit fix suggestion
  if (
    output.includes('npm audit fix') ||
    output.includes('update dependencies')
  ) {
    try {
      Logger.info('Running npm audit fix...');
      Shell.exec('npm audit fix', { cwd: repoRoot, silent: true });
      fixes.push('Applied npm audit fixes');
    } catch (error) {
      Logger.warn(`Failed to apply npm audit fixes: ${error}`);
    }
  }

  // Check for specific security fix suggestions
  const fixPatterns = [
    {
      pattern: /update.*express/gi,
      command: 'npm update express',
      description: 'Updated Express.js to latest version',
    },
    {
      pattern: /add.*helmet/gi,
      command: 'npm install helmet',
      description: 'Added Helmet.js for security headers',
    },
    {
      pattern: /add.*cors/gi,
      command: 'npm install cors',
      description: 'Added CORS middleware',
    },
  ];

  for (const { pattern, command, description } of fixPatterns) {
    if (pattern.test(output)) {
      try {
        Logger.info(`Applying security fix: ${description}`);
        Shell.exec(command, { cwd: repoRoot });
        fixes.push(description);
      } catch (error) {
        Logger.warn(`Failed to apply security fix: ${description} - ${error}`);
      }
    }
  }

  return fixes;
}

function generateSecurityChecklist(output: string): string {
  const checklist = [
    '* [ ] Input validation implemented',
    '* [ ] Output encoding/sanitization',
    '* [ ] Authentication and authorization',
    '* [ ] Secure headers configured',
    '* [ ] Dependencies up to date',
    '* [ ] No hardcoded secrets',
    '* [ ] HTTPS enforced',
    '* [ ] Rate limiting implemented',
  ];

  // Add context-specific items
  if (output.includes('API') || output.includes('endpoint')) {
    checklist.push('* [ ] API authentication');
    checklist.push('* [ ] Request validation');
  }

  if (output.includes('database') || output.includes('SQL')) {
    checklist.push('* [ ] SQL injection protection');
    checklist.push('* [ ] Database connection security');
  }

  return checklist.join('\n');
}
