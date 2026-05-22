# Interview Prep: Platform Security Engineer (2-Hour Sprint)

> **Role Focus**: Mass remediation of security vulnerabilities via automated PRs,
> Claude-based skills, CICD integration, AWS cloud platform engineering.

---

## ⏱️ 2-Hour Study Plan

| Time      | Topic                                        |
| --------- | -------------------------------------------- |
| 0:00–0:15 | GitHub Actions + CICD Security               |
| 0:15–0:30 | Security Vulnerabilities & Remediation       |
| 0:30–0:45 | Claude Skills + GitHub Copilot (AI Native)   |
| 0:45–0:55 | AWS (CloudFormation, Docker, ECS, Databases) |
| 0:55–1:10 | TypeScript patterns + coding challenges      |
| 1:10–1:20 | Automated Testing + Observability            |
| 1:20–1:30 | POC Methodology + Platform Leadership        |
| 1:30–1:40 | Networking Basics (TCP/IP, Firewalls)        |
| 1:40–2:00 | Behavioral STAR stories + Questions to ask   |

---

## 1. GitHub Actions & CICD Security

### Key Concepts

- **Branch protection rules** — required reviews, status checks, dismiss stale approvals
- **GitHub Actions secrets** — `GITHUB_TOKEN`, repo/org/environment secrets; never log secrets
- **Reusable workflows** — `workflow_call` for DRY PR automation
- **Matrix strategy** — parallel scanning across 50k+ repos via matrix or dynamic strategy
- **Self-hosted runners** — isolation, ephemeral runners for security-sensitive jobs
- **OIDC federation** — GitHub → AWS without long-lived credentials (`aws-actions/configure-aws-credentials@v4`)

### Mass PR Automation Pattern

```yaml
# .github/workflows/mass-remediation.yml
name: Mass Vulnerability Remediation
on:
  workflow_dispatch:
    inputs:
      rule_id:
        description: 'CVE or rule to remediate'
        required: true

jobs:
  scan-and-pr:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo: ${{ fromJson(needs.list-repos.outputs.repos) }}
    steps:
      - uses: actions/checkout@v4
      - name: Apply fix
        run: node scripts/apply-fix.js ${{ matrix.repo }}
      - name: Create PR
        uses: peter-evans/create-pull-request@v6
```

### "Toxic Combination" Rules

- Rules that flag **combinations** of vulnerabilities (not just individual CVEs)
- These create **break-build** gates — failing pipelines on combined risk score
- Remediation = either fix the code or add a suppression with justification

### Pattern Expansion Strategy (Key JD Requirement)

> JD says current capability covers a "thin slice" — expansion needed.

- **Step 1**: Audit existing patterns — document which fix types are automated today
- **Step 2**: Categorize remaining by complexity:
  - **Tier 1 (deterministic)** — version bumps, config value changes → regex/template
  - **Tier 2 (structural)** — API migration, import swaps → AST transform
  - **Tier 3 (semantic)** — logic changes, injection fixes → Claude-assisted
- **Step 3**: Build each tier with increasing Claude involvement
- **Step 4**: Measure coverage % (repos fixed / repos affected) per pattern

### GitHub API at Scale — Key Patterns

```typescript
// GraphQL batch query (more efficient than REST for 75k repos)
const query = `query($cursor: String) {
  organization(login: "acme") {
    repositories(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        vulnerabilityAlerts(first: 10) {
          nodes { securityVulnerability { severity } }
        }
      }
    }
  }
}`;
```

### Likely Interview Questions

- _"How would you distribute PRs across 75,000 repos without hitting GitHub rate limits?"_
  - Chunked pagination + secondary rate limit handling + exponential backoff + org-level concurrency caps
  - Use GraphQL (fewer requests), GitHub Apps (higher rate limits: 12,500/hr)
  - Queue-based architecture: SQS → workers → rate-limit-aware consumer
- _"How do you prevent a mass-PR automation from merging bad code?"_
  - Required reviews, automated test gates, staging repo run first, dry-run mode
  - Canary rollout: 10 repos → 100 → 1000 → full fleet
- _"How would you expand pattern coverage from the current thin slice?"_
  - Categorize by fix complexity, start with deterministic (regex), graduate to Claude for semantic fixes

---

## 2. Security Vulnerabilities & Remediation

### Tools to Know

| Tool                                | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| **Dependabot**                      | Automated dependency PRs                          |
| **GitHub Advanced Security (GHAS)** | Code scanning, secret scanning, dependency review |
| **CodeQL**                          | Semantic code analysis, supports custom queries   |
| **Snyk**                            | SCA + SAST + container scanning                   |
| **Trivy**                           | Container + IaC vulnerability scanner             |
| **OWASP Dependency-Check**          | CVE matching for Java/Node                        |

### CVSS & Triage

- **Critical (9.0–10)** → break build, immediate
- **High (7.0–8.9)** → SLA 7 days
- **Medium/Low** → tracked, not blocking
- **Toxic combination** = two medium issues that together are critical

### Remediation Strategies

1. **Dependency bump** — automated via Dependabot or custom script
2. **Code patch** — AST transform (e.g., jscodeshift, libcst) applied via PR
3. **Suppression** — `.snyk`, `codeql-config.yml` with justification + expiry
4. **Compensating control** — WAF rule, network policy when patch not available

### Likely Interview Questions

- _"Walk me through how you'd automate CVE remediation for a Node.js dependency."_
  - Detect via `npm audit --json` → parse → update `package.json` → run tests → open PR
- _"How do you handle false positives at scale?"_
  - Centralized suppression store, PR-based approvals, expiry tracking

---

## 3. Claude Skills + GitHub Copilot (AI Native)

### Claude Skills Architecture

- **Skill** = a structured prompt + tool definition given to Claude (similar to function calling)
- Skills live in files like `skill.md` or `instructions.md` — your repo already has these in `skills/`
- Claude executes skills via **tool use** (function calling API)
- **Agentic loop** = Claude reasons → decides tool → executes → evaluates → repeats until done

### Key API Patterns

```typescript
// Claude tool use
const response = await anthropic.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 4096,
  tools: [
    {
      name: 'create_pull_request',
      description: 'Creates a GitHub PR with the given fix',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          fix: { type: 'string' },
          branch: { type: 'string' },
        },
        required: ['repo', 'fix', 'branch'],
      },
    },
  ],
  messages: [{ role: 'user', content: 'Fix CVE-2024-1234 in repo acme/api' }],
});
```

### Claude in CICD Pipeline

```
Vulnerability Alert
      │
      ▼
  Claude Agent
  ┌─────────────────────────┐
  │ 1. Analyze CVE context  │
  │ 2. Identify fix pattern │
  │ 3. Generate code diff   │
  │ 4. call create_pr tool  │
  └─────────────────────────┘
      │
      ▼
  GitHub PR Created → CI Tests → Auto-merge if green
```

### GitHub Copilot Integration (JD: "Expertise utilizing Copilot")

| Feature                 | Usage in This Role                                                   |
| ----------------------- | -------------------------------------------------------------------- |
| **Copilot Chat**        | Explain CVE context, suggest fix patterns inline                     |
| **Copilot in CLI**      | Generate `gh` commands for bulk repo operations                      |
| **Copilot for PRs**     | Auto-generate PR descriptions, summarize changes                     |
| **Copilot Workspace**   | Prototype fix patterns before mass deployment                        |
| **Custom instructions** | Org-level `.github/copilot-instructions.md` for security conventions |

### Claude vs Copilot — When to Use Which

| Scenario                     | Best Tool         |
| ---------------------------- | ----------------- |
| Developer writing code (IDE) | Copilot           |
| Autonomous bulk PR creation  | Claude Agent      |
| Code review suggestions      | Copilot           |
| Complex multi-step reasoning | Claude            |
| Security pattern generation  | Claude (tool use) |
| Inline fix suggestions       | Copilot           |

### Skill Design Pattern (for interview)

```markdown
# Skill: fix-dependency-vulnerability

## Context

You are given a CVE ID, affected package, and target repo.

## Steps

1. Read the current package.json/pom.xml/requirements.txt
2. Identify the vulnerable dependency and its constraint
3. Determine the minimum patched version from CVE advisory
4. Update the dependency constraint
5. Run the project's test command
6. If tests pass, call create_pull_request tool
7. If tests fail, add a comment explaining manual intervention needed

## Guardrails

- Never bump major versions without approval
- Max 50 PRs per hour per org
- Always include CVE link in PR body
```

### Likely Interview Questions

- _"How would you build a Claude skill to detect and fix SQL injection?"_
  - Skill prompt describes the pattern, Claude uses CodeQL output as context, generates patch, calls PR tool
- _"What are the guardrails you'd put on an autonomous Claude agent opening PRs?"_
  - Dry-run mode, human-in-loop review queue, max PRs/hour, test gate before merge
- _"How do Copilot and Claude complement each other in your workflow?"_
  - Copilot = developer-facing IDE assistant; Claude = backend agent for autonomous bulk operations
- _"How would you evaluate if Claude's fix is correct before merging?"_
  - Automated test suite, static analysis gate, diff size limit, human review for first N instances

---

## 4. AWS Services

### CloudFormation Essentials

```yaml
# Key resource types to know
Resources:
  MyECSCluster:
    Type: AWS::ECS::Cluster
  MyTaskDef:
    Type: AWS::ECS::TaskDefinition
  MySecurityGroup:
    Type: AWS::EC2::SecurityGroup
  MySecret:
    Type: AWS::SecretsManager::Secret
```

- **Stack vs StackSets** — StackSets for multi-account/region deployment (relevant for 50k repo estate)
- **CDK** — TypeScript CDK generates CloudFormation; you already have `infra/` using CDK
- **Parameters + Conditions** — environment-specific config
- **Drift detection** — identify manual changes

### Relevant AWS Services for This Role

| Service                | Use Case                                                    |
| ---------------------- | ----------------------------------------------------------- |
| **ECS Fargate**        | Run Claude agent containers without managing servers        |
| **Lambda**             | Event-driven trigger on GitHub webhook                      |
| **SQS**                | Queue remediation jobs (decouple scanning from PR creation) |
| **Secrets Manager**    | Store GitHub tokens, API keys                               |
| **ECR**                | Container image registry                                    |
| **CloudWatch / X-Ray** | Monitoring + tracing                                        |
| **IAM**                | Least-privilege roles for GitHub OIDC                       |
| **Step Functions**     | Orchestrate multi-step remediation workflows                |
| **DynamoDB**           | Track remediation state per repo (CVE → status)             |
| **RDS/Aurora**         | Central vulnerability registry, audit trail                 |
| **S3**                 | Store scan results, PR templates, pattern configs           |
| **EventBridge**        | Schedule recurring scans, route events                      |

### Cloud-Based Databases (JD Requirement)

```
DynamoDB (NoSQL):
  - Use: Remediation job state tracking (repo, cve, status, timestamp)
  - Key design: PK=repo_name, SK=cve_id
  - GSI: status-index for querying "all in-progress jobs"

Aurora PostgreSQL (Relational):
  - Use: Vulnerability registry, audit logs, cross-repo analytics
  - Why: Complex queries like "which repos have unfixed criticals > 30 days"

ElastiCache Redis:
  - Use: Rate limit counters, deduplication cache (don't re-PR same fix)
```

### Docker Essentials

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
CMD ["node", "src/index.js"]
```

- Multi-stage builds to minimize attack surface
- Non-root user always
- `.dockerignore` to exclude secrets

### Likely Interview Questions

- _"How would you architect a serverless remediation pipeline on AWS?"_
  - GitHub webhook → API Gateway → Lambda → SQS → ECS Fargate (Claude agent) → GitHub PR
- _"How do you manage secrets for 75,000 repositories?"_
  - GitHub OIDC → AWS IAM role → Secrets Manager; no long-lived credentials

---

## 5. TypeScript Patterns & Coding Challenges

### Key Patterns for This Role

```typescript
// Rate-limited GitHub API calls with Octokit
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);
const octokit = new ThrottledOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      console.warn(`Rate limit hit, retrying after ${retryAfter}s`);
      return true;
    },
    onSecondaryRateLimit: retryAfter => {
      console.warn(`Secondary rate limit, waiting ${retryAfter}s`);
      return true;
    },
  },
});

async function createPRsWithBackoff(repos: string[]): Promise<void> {
  const chunks = chunkArray(repos, 10);
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(repo => createRemediationPR(repo)));
    await sleep(1000);
  }
}
```

### Error Handling Pattern

```typescript
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function applyFix(repo: string): Promise<Result<string>> {
  try {
    const prUrl = await createPR(repo);
    return { ok: true, data: prUrl };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Batch operation with results collection
async function batchRemediate(
  repos: string[]
): Promise<{ success: string[]; failed: string[] }> {
  const results = await Promise.allSettled(repos.map(repo => applyFix(repo)));
  return results.reduce(
    (acc, r, i) => {
      if (r.status === 'fulfilled' && r.value.ok) {
        acc.success.push(repos[i]);
      } else {
        acc.failed.push(repos[i]);
      }
      return acc;
    },
    { success: [] as string[], failed: [] as string[] }
  );
}
```

---

## 5b. Coding Challenges (Practice These)

> These are the types of coding tasks you may be asked to solve live.

### Challenge 1: Parse `package.json` and find vulnerable dependencies

```typescript
interface VulnAlert {
  package: string;
  currentVersion: string;
  patchedVersion: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

function findVulnerableDeps(
  packageJson: Record<string, any>,
  alerts: VulnAlert[]
): VulnAlert[] {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  return alerts.filter(alert => allDeps[alert.package]);
}

function applyFixes(
  packageJson: Record<string, any>,
  fixes: VulnAlert[]
): Record<string, any> {
  const updated = JSON.parse(JSON.stringify(packageJson));
  for (const fix of fixes) {
    if (updated.dependencies?.[fix.package]) {
      updated.dependencies[fix.package] = `^${fix.patchedVersion}`;
    }
    if (updated.devDependencies?.[fix.package]) {
      updated.devDependencies[fix.package] = `^${fix.patchedVersion}`;
    }
  }
  return updated;
}
```

### Challenge 2: Build a GitHub Actions workflow generator

```typescript
interface WorkflowConfig {
  name: string;
  triggerEvent: 'push' | 'pull_request' | 'workflow_dispatch';
  steps: { name: string; run?: string; uses?: string }[];
}

function generateWorkflowYaml(config: WorkflowConfig): string {
  const lines: string[] = [
    `name: ${config.name}`,
    `on: ${config.triggerEvent}`,
    '',
    'jobs:',
    '  main:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
  ];
  for (const step of config.steps) {
    lines.push(`      - name: ${step.name}`);
    if (step.uses) lines.push(`        uses: ${step.uses}`);
    if (step.run) lines.push(`        run: ${step.run}`);
  }
  return lines.join('\n');
}
```

### Challenge 3: Implement a vulnerability scanner result parser

```typescript
interface ScanResult {
  cve: string;
  package: string;
  severity: string;
  fixAvailable: boolean;
  fixVersion?: string;
}

interface ToxicCombination {
  cves: string[];
  combinedSeverity: 'critical';
  reason: string;
}

// Parse npm audit JSON output
function parseNpmAudit(auditJson: Record<string, any>): ScanResult[] {
  const vulns = auditJson.vulnerabilities ?? {};
  return Object.entries(vulns).map(([pkg, data]: [string, any]) => ({
    cve: data.via?.[0]?.url ?? 'unknown',
    package: pkg,
    severity: data.severity,
    fixAvailable: data.fixAvailable !== false,
    fixVersion: data.fixAvailable?.version,
  }));
}

// Detect toxic combinations
function detectToxicCombinations(
  results: ScanResult[],
  rules: ToxicCombination[]
): ToxicCombination[] {
  const cveSet = new Set(results.map(r => r.cve));
  return rules.filter(rule => rule.cves.every(cve => cveSet.has(cve)));
}
```

### Challenge 4: Rate-limited queue processor

```typescript
class RateLimitedQueue<T> {
  private queue: T[] = [];
  private processing = false;

  constructor(
    private readonly handler: (item: T) => Promise<void>,
    private readonly concurrency: number = 5,
    private readonly delayMs: number = 1000
  ) {}

  add(items: T[]): void {
    this.queue.push(...items);
    if (!this.processing) this.process();
  }

  private async process(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.concurrency);
      await Promise.allSettled(batch.map(item => this.handler(item)));
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, this.delayMs));
      }
    }
    this.processing = false;
  }
}

// Usage
const prQueue = new RateLimitedQueue<string>(
  async repo => {
    await octokit.pulls.create({
      owner: 'acme',
      repo,
      title: 'fix: bump vulnerable dependency',
      head: 'security/auto-fix',
      base: 'main',
    });
  },
  5, // 5 concurrent
  2000 // 2s between batches
);
prQueue.add(repos);
```

### Challenge 5: AST-based code transformation (jscodeshift)

```typescript
// Remove all eval() calls and replace with safe alternative
import { Transform } from 'jscodeshift';

export const removeEvalTransform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.CallExpression, { callee: { name: 'eval' } })
    .replaceWith(path => {
      const arg = path.node.arguments[0];
      return j.callExpression(
        j.memberExpression(j.identifier('JSON'), j.identifier('parse')),
        [arg]
      );
    })
    .toSource();
};

// Detect hardcoded secrets pattern
export const detectHardcodedSecrets: Transform = (file, api) => {
  const j = api.jscodeshift;
  const issues: string[] = [];
  j(file.source)
    .find(j.VariableDeclarator)
    .filter(path => {
      const name = (path.node.id as any).name?.toLowerCase() ?? '';
      return /password|secret|api_key|token/.test(name);
    })
    .forEach(path => {
      if (path.node.init?.type === 'StringLiteral') {
        issues.push(`Hardcoded secret: ${(path.node.id as any).name}`);
      }
    });
  return file.source; // report-only, no transform
};
```

### Challenge 6: GitHub PR creator with retry logic

```typescript
interface PRConfig {
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  files: { path: string; content: string }[];
}

async function createRemediationPR(config: PRConfig): Promise<string> {
  const { owner, repo, branch, baseBranch } = config;

  // 1. Get base branch SHA
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = ref.object.sha;

  // 2. Create branch
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });

  // 3. Commit files
  for (const file of config.files) {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: file.path,
      message: `fix: ${config.title}`,
      content: Buffer.from(file.content).toString('base64'),
      branch,
    });
  }

  // 4. Create PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: config.title,
    body: config.body,
    head: branch,
    base: baseBranch,
  });

  return pr.html_url;
}

// Retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      if (err.status === 403 || err.status === 429) {
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Unreachable');
}
```

### Challenge 7: Write a Claude skill executor (simplified)

```typescript
import Anthropic from '@anthropic-ai/sdk';

interface SkillTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (input: Record<string, any>) => Promise<string>;
}

async function executeSkill(
  prompt: string,
  tools: SkillTool[]
): Promise<string> {
  const client = new Anthropic();
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    }

    // Handle tool use
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults: Anthropic.MessageParam = {
      role: 'user',
      content: await Promise.all(
        toolUseBlocks.map(async (block: any) => {
          const tool = tools.find(t => t.name === block.name);
          const result = tool
            ? await tool.execute(block.input)
            : 'Tool not found';
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          };
        })
      ),
    };

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      toolResults,
    ];
  }
}
```

---

## 6. Automated Testing + Observability

### Testing Principles

- **Unit** — test fix logic in isolation (mock GitHub API)
- **Integration** — test against a real GitHub sandbox org
- **E2E** — full pipeline run on a test repository
- **Idempotency tests** — running the fix twice should produce the same result

```typescript
// Jest example for remediation script
describe('applyDependencyFix', () => {
  it('bumps vulnerable dependency to patched version', () => {
    const pkg = { dependencies: { lodash: '4.17.15' } };
    const result = applyFix(pkg, { package: 'lodash', version: '4.17.21' });
    expect(result.dependencies.lodash).toBe('4.17.21');
  });

  it('is idempotent', () => {
    const pkg = { dependencies: { lodash: '4.17.21' } };
    const result = applyFix(pkg, { package: 'lodash', version: '4.17.21' });
    expect(result).toEqual(pkg);
  });
});
```

### Observability Stack

- **Splunk** — centralized log aggregation; search with SPL (`index=cicd sourcetype=github_actions`)
- **OpenTelemetry** — instrument Node.js apps with `@opentelemetry/sdk-node`
- **Metrics to track**: PR success rate, time-to-remediate, false positive rate, build break frequency

```typescript
// OpenTelemetry counter example
const meter = metrics.getMeter('remediation-service');
const prCounter = meter.createCounter('prs_created_total', {
  description: 'Total PRs created for vulnerability remediation',
});
prCounter.add(1, { repo: repoName, cve: cveId, status: 'success' });
```

---

## 7. POC Methodology + Platform Leadership

### POC Approach (JD: "Develop POC and ideation")

```
POC: Mass Remediation via Claude Agent

Week 1: Scope & Design
  - Pick 3 high-frequency vulnerability patterns
  - Define success metrics (fix accuracy, test pass rate, time-to-PR)
  - Design agent architecture (Claude + GitHub API + test runner)

Week 2: Build
  - Implement skill for top pattern (e.g., dependency bump)
  - Build against 10 repos in sandbox org
  - Instrument with OpenTelemetry for metrics

Week 3: Validate
  - Run against 100 repos
  - Measure: PRs created, tests passing, false fixes, manual interventions
  - Document edge cases and failure modes

Week 4: Present & Scale Plan
  - Demo to stakeholders
  - Go/no-go decision based on metrics
  - Scale plan: patterns to add, infra needed, team involvement
```

### Thought Leadership Talking Points (JD: "Faster feedback loops")

- **Reduce PR cycle time**: Auto-approve low-risk PRs (dependency patch bumps with green tests)
- **Reduce build time**: Parallel CI steps, caching, skip unchanged modules
- **Faster feedback loops**: PR status checks run in <5 min; fail fast on security gates
- **Shift-left security**: Run CodeQL in pre-commit hooks or PR-time, not just nightly

### Cross-Team Collaboration (JD: "Liaison between platform and app teams")

| Challenge                      | Solution                                                |
| ------------------------------ | ------------------------------------------------------- |
| App teams resist automated PRs | Dry-run mode, preview emails, opt-in phases             |
| Teams don't understand fixes   | PR body includes CVE explanation + impact               |
| Different tech stacks          | Pattern templates per language/framework                |
| Merge conflicts from mass PRs  | Rebase strategy, short-lived branches, auto-close stale |

### Technical Standards to Establish

- PR template for automated remediations
- Naming convention: `security/CVE-YYYY-NNNN-fix`
- Required labels: `automated`, `security`, severity level
- SLA documentation per severity level
- Runbook for when automation fails

---

## 8. Networking Basics (Nice-to-Have)

### TCP/IP Fundamentals

- **TCP 3-way handshake**: SYN → SYN-ACK → ACK
- **Ports**: 80 (HTTP), 443 (HTTPS), 22 (SSH), 5432 (PostgreSQL)
- **DNS resolution**: domain → resolver → root → TLD → authoritative → IP

### Firewalls & Security Groups

```
AWS Security Group (stateful):
  Inbound: Allow 443 from 0.0.0.0/0 (HTTPS)
  Inbound: Allow 22 from 10.0.0.0/16 (SSH from VPC only)
  Outbound: Allow all (default)

NACL (stateless):
  Rule 100: Allow inbound 443
  Rule 200: Allow inbound ephemeral ports (1024-65535)
  Rule *: Deny all
```

### Basic Troubleshooting Commands

```bash
# Connectivity
curl -v https://api.github.com      # test HTTPS
nslookup api.github.com              # DNS resolution
traceroute api.github.com            # path to target
netstat -tlnp                        # listening ports

# AWS VPC debugging
aws ec2 describe-security-groups --group-ids sg-xxx
aws ec2 describe-network-acls --filters Name=vpc-id,Values=vpc-xxx
```

### Likely Interview Questions

- _"A GitHub Actions runner can't reach your AWS endpoint. How do you debug?"_
  - Check SG inbound rules → NACL → route table → VPC endpoints → DNS resolution → OIDC trust

---

## 9. Behavioral STAR Stories — Prepare These

Prepare 2-minute answers for each:

### "Tell me about a time you automated something at scale"

- **S**: Team manually patching 200 microservices for a Log4Shell-type CVE
- **T**: Needed to patch all within 72-hour SLA
- **A**: Built GitHub Actions workflow + script to detect + bump + PR across all repos; used matrix with rate limiting
- **R**: 95% of repos patched in 8 hours vs estimated 3 days manually

### "Tell me about a time you used AI to solve an engineering problem"

- **S**: Security team reporting 500+ medium-severity dependency vulnerabilities quarterly, manual triage taking 2 days/sprint
- **T**: Reduce triage + remediation time by 80%
- **A**: Built Claude skill that reads CVE details, checks if fix exists, generates bump PR with test run; Copilot used for initial pattern development
- **R**: Automated 70% of dependency fixes, triage reduced to 2 hours/sprint

### "How do you handle ambiguity or a new domain quickly?"

- **S**: Joined platform team with no prior security tooling experience
- **T**: Own the automated remediation pipeline within 30 days
- **A**: Read existing ADRs, shadowed security team for 1 week, built small POC on 5 repos, iterated based on feedback
- **R**: Delivered working POC in 3 weeks, production-ready in 6 weeks

### "Describe a cross-team collaboration challenge"

- **S**: 15 application teams refused to merge automated security PRs, calling them "noise"
- **T**: Get 80% adoption of automated remediation within 1 quarter
- **A**: Added dry-run preview mode, created Slack digest with fix explanations, held office hours, escalation path for blockers
- **R**: 12/15 teams opted in within 8 weeks, remediation time dropped from 14 days to 3 days avg

### "Tell me about a time you provided technical leadership"

- **S**: CICD pipeline taking 45 min avg, developers frustrated with slow feedback
- **T**: Reduce to under 15 min while adding security gates
- **A**: Parallelized test stages, added build caching, moved security scan to parallel track (not serial), introduced fail-fast on critical CVEs
- **R**: Pipeline dropped to 12 min avg, security coverage increased, zero developer pushback

---

## 10. Questions to Ask the Interviewer

1. _"What does the current mass-PR automation cover today, and which patterns are the priority to expand?"_
2. _"How is the Claude skill integration being designed — standalone agent or embedded in existing CICD?"_
3. _"What's the current false positive rate from security scans, and how do teams handle them?"_
4. _"How do you measure success — is it PRs merged, time-to-remediate, or pipeline stability?"_
5. _"What's the split between platform engineering work and hands-on remediation scripting?"_
6. _"What does the 'toxic combination' rule engine look like today — is it custom or vendor-provided?"_
7. _"How many languages/frameworks are in the 75k repo estate, and which are highest priority?"_
8. _"What's the team structure — how many engineers, and who owns the security scanning infrastructure?"_

---

## 11. Quick Reference Cheatsheet

```
GitHub Rate Limits:
  - REST API: 5,000 req/hr (authenticated user)
  - GitHub App: 12,500 req/hr (installation)
  - Secondary: no >100 concurrent requests
  - GraphQL: 5,000 points/hr
  - create-pull-request: 10 req/min (abuse detection)

Claude Models (2025):
  - claude-opus-4-5  → complex reasoning, agent tasks
  - claude-sonnet-4  → balanced speed/quality
  - claude-haiku-3   → fast, cheap, high-volume
  - Tool use: all models support function calling
  - Max tokens: 200k context, 8k output (default)

CVSS Scoring:
  0.0       = None
  0.1–3.9   = Low
  4.0–6.9   = Medium
  7.0–8.9   = High
  9.0–10.0  = Critical

OWASP Top 10 (2021):
  A01: Broken Access Control
  A02: Cryptographic Failures
  A03: Injection (SQL, XSS, Command)
  A04: Insecure Design
  A05: Security Misconfiguration
  A06: Vulnerable Components ← PRIMARY FOCUS
  A07: Auth Failures
  A08: Software/Data Integrity Failures
  A09: Logging/Monitoring Failures
  A10: SSRF

AWS OIDC → GitHub trust condition:
  "token.actions.githubusercontent.com:sub":
    "repo:ORG/REPO:ref:refs/heads/main"

Common Security Fix Types:
  - Dependency version bump (most common, most automatable)
  - Secret rotation
  - Config hardening (TLS version, cipher suites)
  - Code pattern replacement (eval → safe alternative)
  - Permission tightening (IAM, file perms)
```

---

## 12. Your Existing Repo Talking Points

> Reference this repo directly in the interview as evidence of hands-on experience:

| Repo Artifact                                      | Maps to JD Requirement                        |
| -------------------------------------------------- | --------------------------------------------- |
| **`skills/`** (4 skills)                           | "Develop new Claude Skills"                   |
| **`.github/workflows/`** (6+ workflows)            | "GitHub Actions expertise"                    |
| **`infra/`** (CDK stacks)                          | "CloudFormation / Cloud Platform Engineering" |
| **`.aws/task-definitions/`**                       | "Docker + ECS experience"                     |
| **`agents/`** (orchestrator, code, deploy, design) | "AI-native development"                       |
| **`CLAUDE.md`**                                    | "Technical standards & documentation"         |
| **`docker-compose.yml`**                           | "Docker / containerized development"          |
| **`docs/adr/`** (9 ADRs)                           | "Establish technical standards"               |
| **`libs/`** (shared libraries)                     | "Scalable, repeatable processes"              |
| **`scripts/`** (deployment, load-tests)            | "Automation scripts"                          |

### How to Narrate This in the Interview

> "In my current project, I've built an AI-native monorepo with Claude skills for
> automated PR creation, Prisma migration generation, and changelog updates. The
> repo uses GitHub Actions for CICD, CDK for infrastructure-as-code on AWS, and
> ECS Fargate for containerized services. I've also set up an agent orchestration
> layer that coordinates multiple specialized agents. This is directly applicable
> to building Claude-based security remediation skills at scale."

---

## 13. Last-Minute Confidence Boosters

### Key Differentiators to Emphasize

1. **Already AI-native** — you're using Claude skills + agents daily, not learning from scratch
2. **Full-stack pipeline thinking** — from CDK infra to GitHub Actions to app code
3. **Scale mindset** — monorepo tooling, shared libs, automation-first approach
4. **Security awareness** — `.dockerignore`, non-root containers, secrets management, OIDC

### Red Flags to Avoid

- Don't say "I'd manually review each PR" at 75k scale — always think automation-first
- Don't confuse Claude Skills (structured prompts) with Claude Code (IDE agent)
- Don't propose solutions that require repo-by-repo configuration — think org-level
- Don't overlook testing — every automated fix needs a verification step

### If You Don't Know Something

> "I haven't worked directly with [X], but here's how I'd approach it based on
> my experience with [related thing]. I'd start by [concrete first step]."

---

_Generated: 2026-05-21 | Target: Platform Security Engineer Interview_
