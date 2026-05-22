# Interview Prep — FAQ (Plain English Explanations)

> Companion to `INTERVIEW_PREP_SECURITY_PLATFORM_ENGINEER.md`

---

## 1. What is CVE & CVSS?

**CVE (Common Vulnerabilities and Exposures)**

- A **public list of known security bugs** in software.
- Each bug gets a unique ID like `CVE-2024-1234`.
- Think of it like a "police report number" for a software bug.
- Example: "lodash version 4.17.15 has a bug where an attacker can crash your app" → that bug gets a CVE number.

**CVSS (Common Vulnerability Scoring System)**

- A **score from 0 to 10** that tells you how dangerous a CVE is.
- Higher = more dangerous.
- It's like a "severity rating" — helps you decide which bugs to fix first.

```
0.0       = No risk
0.1–3.9   = Low (fix when convenient)
4.0–6.9   = Medium (fix within a month)
7.0–8.9   = High (fix within a week)
9.0–10.0  = Critical (fix NOW, drop everything)
```

---

## 2. What does "remediation" mean here?

**Remediation = fixing the security bug.**

In this job, you won't just find bugs — you'll automatically fix them across thousands of repos.

Example:

- A library called `express` has version `4.17.1` with a security bug.
- The fix (remediation) = update it to `4.17.3` (the patched version).
- Your job = write code that does this update automatically and creates a Pull Request.

So "mass remediation" = fixing the same type of bug across 50,000+ repositories automatically using scripts and AI.

---

## 3. GitHub Actions & CICD Security Key Concepts — Explained

### Branch Protection Rules

- Settings on a GitHub repo that **prevent anyone from pushing directly to `main`**.
- Forces people to go through Pull Requests with reviews.
- Like putting a lock on the front door — everyone must use the proper entrance.

### GitHub Actions Secrets

- A way to store **passwords, API keys, tokens** securely in GitHub.
- Your workflow can use them, but they never show up in logs.
- Example: your GitHub token to create PRs is stored as a secret, not in code.

### Reusable Workflows

- Instead of copy-pasting the same CI/CD steps into 50,000 repos, you write it **once** and all repos use that one workflow.
- Like a shared template — update it in one place, all repos get the update.

### Matrix Strategy

- Run the **same job on many different inputs** in parallel.
- Example: "Run this security scan on repo-1, repo-2, repo-3... repo-100" all at the same time.
- It's how you scale from 1 repo to thousands.

### Self-hosted Runners

- Instead of using GitHub's shared machines, you run your own machines.
- Why? For security — sensitive code stays on your own infrastructure.
- "Ephemeral" = the machine is destroyed after each job (no data leaks between runs).

### OIDC Federation

- A way for GitHub Actions to **talk to AWS without storing AWS passwords**.
- GitHub says "I am repo X running job Y" → AWS says "OK, I trust you, here's temporary access."
- No long-lived passwords to leak.

---

## 4. What is "AST transform"?

**AST = Abstract Syntax Tree** — it's how a computer "reads" code.

When you write:

```javascript
const x = eval(userInput);
```

The computer doesn't see text — it sees a tree structure:

```
VariableDeclaration
  └── CallExpression
       ├── callee: "eval"
       └── argument: "userInput"
```

**AST Transform = changing code by modifying this tree (not using find-and-replace on text).**

Why is this better than regex/find-replace?

- Regex: might accidentally replace `eval` inside a comment or string
- AST: knows exactly which `eval` is an actual function call

**In this job**: You'd use AST transforms to automatically replace unsafe code patterns (like `eval()`) with safe alternatives across thousands of repos.

Tool: `jscodeshift` (for JavaScript/TypeScript)

---

## 5. What is "Pattern Expansion Strategy" and "thin slice"?

**Thin slice** = the company already has automation that fixes SOME types of bugs, but only a few simple ones. Like they can auto-fix "bump lodash to latest version" but nothing more complex.

**Pattern** = a type of bug fix that can be automated. Examples:

- Pattern 1: "Update dependency version in package.json"
- Pattern 2: "Replace `eval()` with `JSON.parse()`"
- Pattern 3: "Add input validation to SQL queries"

**Pattern Expansion Strategy** = the plan to go from fixing 3 patterns → fixing 50+ patterns.

The tiers:

- **Tier 1 (easy)**: Version bumps — just change a number in `package.json` → regex can do this
- **Tier 2 (medium)**: Code structure changes — swap one import for another → AST transform needed
- **Tier 3 (hard)**: Logic changes — rewrite how a function works → needs Claude AI to understand the context

---

## 6. What does "distribute PRs" mean?

**Distribute PRs = create Pull Requests across many repositories.**

Imagine you found a bug that exists in 10,000 repos. You need to:

1. Open each repo
2. Make the fix
3. Create a Pull Request
4. Do this 10,000 times

"Distributing PRs" = sending out these fix-PRs to all 10,000 repos.

The challenge: GitHub has **rate limits** (max 5,000 API calls per hour). If you try to create 10,000 PRs at once, GitHub blocks you. So you need to:

- Go in batches (100 at a time)
- Wait between batches
- Use a queue system
- Use GitHub Apps (higher limits: 12,500/hr)

---

## 7. "How do you prevent mass-PR automation from merging bad code?" — Full explanation

### What is "mass PR"?

- A **mass PR** = when your automation creates hundreds or thousands of PRs at once across many repos.
- Example: "Fix CVE-2024-1234 in all 5,000 repos that use lodash"

### The problem:

- What if your automated fix is WRONG? You just broke 5,000 repos.
- What if the version bump causes tests to fail?
- What if the fix works for 4,900 repos but breaks 100?

### The answer (how to prevent it):

1. **Required reviews** — even automated PRs need a human to click "Approve" before merging
2. **Automated test gates** — the PR can only merge if ALL tests pass (CI must be green)
3. **Staging repo run first** — test the fix on 1 dummy repo before running on real repos
4. **Dry-run mode** — run the automation but DON'T actually create PRs; just log what WOULD happen
5. **Canary rollout** — try on 10 repos → if OK, try 100 → if OK, try 1000 → then full fleet

Think of it like a medicine trial: test on a small group first, if no side effects, expand to everyone.

---

## 8. "How would you expand pattern coverage from the current thin slice?" — Q&A Explained

### The Question means:

"Right now we can only auto-fix 3 types of bugs. How would you make it auto-fix 50+ types?"

### The Answer:

1. **Categorize all bug types** by how hard they are to fix automatically
2. **Start with the easiest** (Tier 1): dependency version bumps — just change a number
3. **Move to medium** (Tier 2): code structure changes — use AST transforms
4. **Finally tackle hard ones** (Tier 3): logic changes — use Claude AI to understand + fix
5. **Measure success**: track "what % of affected repos got fixed" per pattern

Basically: don't try to solve everything at once. Start simple, prove it works, then add complexity.

---

## 9. Security Tools — Separate jobs or GitHub configs?

**Both!** Here's the breakdown:

| Tool                                | How it works                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Dependabot**                      | GitHub native — just **enable it in repo settings**. GitHub auto-creates PRs for outdated deps. |
| **GitHub Advanced Security (GHAS)** | GitHub native — **enable in org/repo settings**. Includes code scanning, secret scanning.       |
| **CodeQL**                          | Part of GHAS — runs as a **GitHub Actions workflow** (a job in your pipeline).                  |
| **Snyk**                            | Third-party — add as a **GitHub Actions step** or install the GitHub App.                       |
| **Trivy**                           | Third-party — runs as a **GitHub Actions step** in your pipeline.                               |
| **OWASP Dependency-Check**          | Third-party — runs as a **GitHub Actions step**.                                                |

So:

- **Dependabot & GHAS** = just toggle ON in GitHub settings
- **CodeQL, Snyk, Trivy** = add as steps/jobs in your CI/CD pipeline (`.github/workflows/`)

---

## 10. What is SCA + SAST + IaC?

### SCA (Software Composition Analysis)

- Checks your **dependencies** (packages you installed) for known bugs.
- Example: "You're using lodash 4.17.15 which has CVE-2021-12345"
- Tools: Dependabot, Snyk, npm audit

### SAST (Static Application Security Testing)

- Reads your **actual code** (without running it) to find bugs.
- Example: "Line 42 in auth.ts has a SQL injection vulnerability"
- Tools: CodeQL, SonarQube, Semgrep

### IaC (Infrastructure as Code) Scanning

- Checks your **cloud config files** (CloudFormation, Terraform, Dockerfiles) for misconfigurations.
- Example: "Your S3 bucket is set to public access — that's dangerous"
- Tools: Trivy, Checkov, tfsec

**Simple analogy**:

- SCA = "are the ingredients (libraries) safe?"
- SAST = "is the recipe (your code) safe?"
- IaC = "is the kitchen (infrastructure) safe?"

---

## 11. What is "CVSS & Triage"?

**Triage** = deciding which bugs to fix first, based on priority.

Like an emergency room:

- Critical (9-10 CVSS) = heart attack → fix immediately, break the build if not fixed
- High (7-8.9) = broken arm → must fix within 7 days
- Medium/Low = minor bruise → track it, fix when you can

**"Toxic combination"** = two medium bugs that individually are "fine" but together become critical.

- Example: Bug A allows reading files + Bug B allows network access = together, an attacker can steal files over the internet.

---

## 12. What does "Suppression" mean?

**Suppression = telling the scanner "I know about this bug, but I'm choosing not to fix it right now (with a good reason)."**

When you suppress:

- You add an entry in `.snyk` or `codeql-config.yml` file
- You MUST write a **justification** (why you're not fixing it)
- You MUST set an **expiry date** (when to re-check)

Example:

```yaml
# .snyk
ignore:
  'SNYK-JS-LODASH-1234':
    - '*':
        reason: 'We don't use the affected function. Will fix in Q2 sprint.'
        expires: 2025-06-30
```

Why suppress instead of fix?

- The fix might break your app
- You don't use the vulnerable feature
- A fix doesn't exist yet

---

## 13. What is "Compensating Control"?

**When you CAN'T fix the bug in code, you add protection around it.**

Think of it like: if you can't fix a broken window, you put bars on it.

**WAF rule (Web Application Firewall)**:

- Sits in front of your app and blocks malicious requests
- Example: Bug allows SQL injection → WAF blocks any request containing SQL patterns
- The code is still vulnerable, but attackers can't reach it

**Network policy**:

- Restrict who can talk to the vulnerable service
- Example: Only allow internal services to reach the vulnerable endpoint; block internet access

You do this when:

- No patch exists yet (zero-day vulnerability)
- The patch breaks your app
- You need time to plan a proper fix

---

## 14. "How do you handle false positives at scale?" — Q&A Explained

### The Question means:

"Security scanners sometimes flag code as 'vulnerable' when it's actually fine. When you have 50,000 repos, you get thousands of false alarms. How do you deal with that?"

### The problem:

- If 10% of alerts are false positives across 50,000 repos = 5,000 fake alerts
- Developers waste time investigating fake issues
- Developers start ignoring ALL alerts (alert fatigue)

### The Answer:

1. **Centralized suppression store** — a database that says "CVE-X in pattern-Y is a false positive; don't flag it again"
2. **PR-based approvals** — to suppress something, you create a PR with justification; a security person approves it (audit trail)
3. **Expiry tracking** — suppressions auto-expire after 90 days; forces re-evaluation (maybe it's a real issue now)

---

## 15. What is CloudFormation used for?

**CloudFormation = "code that creates AWS infrastructure."**

Instead of clicking buttons in the AWS console to create servers, databases, etc., you write a YAML/JSON file that describes what you want. Then AWS creates it for you.

```yaml
# "Create me a database"
Resources:
  MyDatabase:
    Type: AWS::RDS::DBInstance
    Properties:
      Engine: postgres
      DBInstanceClass: db.t3.micro
```

**Why use it?**

- **Repeatable** — same file creates the same infra in dev, staging, production
- **Version controlled** — track changes via Git
- **Rollback** — if something breaks, AWS reverts to previous state
- **CDK** (what your repo uses) — write TypeScript that generates CloudFormation

**In this job**: You'd use CloudFormation/CDK to create the infrastructure that runs your remediation pipeline (queues, containers, databases).

---

## 16. ECS Fargate — Is this for GenAI or AI-DLC?

**This is for running your Claude-based agent as a container (GenAI use case).**

Here's what happens:

1. You write a Node.js/TypeScript app that calls Claude's API
2. You package it in a Docker container
3. You deploy it to ECS Fargate
4. Fargate runs your container without you managing any servers

**Why Fargate for Claude agents?**

- Each remediation job might take 2-5 minutes (too long for Lambda's 15-min limit at scale)
- You might need multiple agents running in parallel
- Each agent processes one repo: reads code → asks Claude to analyze → generates fix → creates PR

**It's NOT** the AI-DLC (Deep Learning Container) — that's for training ML models. This is just running your TypeScript app that calls Claude's API.

---

## 17. What is ECR (Container Image Registry)?

**ECR = a storage place for your Docker images on AWS.**

Think of it like "GitHub but for Docker images."

```
You build Docker image → Push to ECR → ECS Fargate pulls from ECR → Runs your container
```

**Why you need it:**

- Your remediation agent is a Docker container
- ECR stores the container image securely
- When ECS needs to run your agent, it downloads the image from ECR
- You can store multiple versions (rollback if needed)

---

## 18. Can Step Functions be used for agentic workflows?

**Yes! Step Functions is great for orchestrating multi-step agent workflows.**

Example agentic workflow:

```
Step 1: Fetch list of repos with vulnerabilities
    ↓
Step 2: For each repo (in parallel):
    ├── Step 2a: Clone repo
    ├── Step 2b: Analyze with Claude
    ├── Step 2c: Generate fix
    ├── Step 2d: Run tests
    └── Step 2e: Create PR (only if tests pass)
    ↓
Step 3: Send summary report
```

**Why Step Functions for agents:**

- Built-in retry and error handling
- Visual workflow debugging
- Can wait for human approval (human-in-the-loop)
- Handles parallel execution across thousands of repos
- Maintains state between steps

---

## 19. Explain the full pipeline: GitHub webhook → API Gateway → Lambda → SQS → ECS Fargate → GitHub PR

**This is the complete flow of how an automated fix gets created:**

```
1. GitHub webhook
   → "Hey, a new vulnerability was detected in repo X"
   → GitHub sends an HTTP request to your AWS endpoint

2. API Gateway
   → The "front door" that receives the HTTP request from GitHub
   → Validates it's really from GitHub (signature check)

3. Lambda
   → A small function that processes the webhook
   → Decides: is this vulnerability important enough to auto-fix?
   → If yes, puts a job message in the queue

4. SQS (Simple Queue Service)
   → A waiting line for jobs
   → Why a queue? So you don't overwhelm your system with 1000 fixes at once
   → Jobs wait patiently until a worker picks them up

5. ECS Fargate (Claude agent)
   → A container running your TypeScript app
   → Picks up a job from SQS
   → Calls Claude API: "Here's the CVE and the code. Generate a fix."
   → Claude responds with the fixed code

6. GitHub PR
   → The agent creates a branch, commits the fix, opens a PR
   → CI tests run on the PR
   → If green → ready for review/merge
```

**Why this architecture?**

- **Decoupled** — if one part breaks, the rest still works
- **Scalable** — add more Fargate containers when queue is long
- **Reliable** — SQS retries failed jobs automatically
- **Cost-efficient** — Fargate only runs when there's work to do

---

## 20. What is the POC: Mass Remediation via Claude Agent?

**POC (Proof of Concept) = a small experiment to prove the idea works before building the full thing.**

**What you're doing:**

1. Pick 3 common vulnerability types (e.g., outdated lodash, express, axios)
2. Build a Claude agent that can fix these 3 types
3. Test it on 10 repos first → then 100 → measure results
4. Show leadership: "Look, it fixed 85 out of 100 repos correctly, with 0 broken builds"
5. Get approval to scale to all 50,000+ repos

**Success metrics:**

- How many PRs did it create? (volume)
- How many had passing tests? (accuracy)
- How many needed human intervention? (reliability)
- How fast? (time-to-fix)

---

## 21. What is CodeQL?

**CodeQL = GitHub's tool that treats your code as a database and lets you query it for bugs.**

Instead of just pattern-matching text, CodeQL understands your code's logic:

```
Normal scanner: "Found the word 'eval' in your code" (might be in a comment!)
CodeQL: "Found a function call to eval() where the argument comes from user input" (understands data flow!)
```

**How it works:**

1. CodeQL builds a database from your code
2. You write queries like: "Find all places where user input reaches a SQL query without sanitization"
3. It returns exact file + line number

**In this job:**

- CodeQL finds the bugs
- Your Claude agent reads CodeQL's output
- Claude generates a fix
- Your automation creates a PR with the fix

---

## 22. Explain the cross-team challenges

### "App teams resist automated PRs | Dry-run mode, preview emails, opt-in phases"

**The problem:** Application developers get a PR from a bot and think "What is this? I didn't ask for this. I'm not merging random code from a robot."

**The solution:**

- **Dry-run mode** — first, DON'T create real PRs. Just send a report: "Here's what we WOULD fix in your repo." Teams see it's helpful, not scary.
- **Preview emails** — before opening PRs, email the team: "Next week, our bot will create a PR to fix CVE-X in your repo. Here's what it'll change."
- **Opt-in phases** — let teams volunteer first. Early adopters prove it works. Then other teams say "we want that too."

### "Merge conflicts from mass PRs | Rebase strategy, short-lived branches, auto-close stale"

**The problem:** You create a PR today, but the team doesn't merge it for 2 weeks. In that time, other code changes happen → merge conflict → PR is stuck.

**The solution:**

- **Rebase strategy** — automatically update the PR branch with latest `main` (keep it fresh)
- **Short-lived branches** — the branch name includes a date; it's meant to be merged within days, not weeks
- **Auto-close stale** — if a PR isn't merged after 14 days, close it and create a fresh one. Don't let old PRs pile up.

---

## 23. What is a "Runbook"?

**A runbook = a step-by-step instruction manual for when things go wrong.**

Like a recipe, but for fixing problems:

```markdown
# Runbook: Mass PR Automation Failure

## Symptoms

- Queue backed up with 500+ unprocessed jobs
- PRs being created with wrong content

## Steps to Recover

1. Pause the queue (stop processing new jobs)
2. Check CloudWatch logs for error messages
3. Identify the failing pattern
4. Fix the pattern logic in the codebase
5. Test on 1 repo manually
6. Resume queue processing
7. Monitor for 30 minutes

## Escalation

- If not resolved in 1 hour → page the on-call engineer
- If data corruption suspected → notify security team
```

---

## 24. "Tell me about using AI for defect triage" — STAR Method

**Yes, defect triage improvement is a great answer!** Here's how to frame it:

### What is defect triage?

- When bugs come in, someone must look at each one and decide: priority, assignee, category.
- This takes hours when you have hundreds of bugs.

### STAR Answer:

**S (Situation):**
"Our team was receiving 200+ defect reports per sprint from testing and production monitoring. Each defect needed manual classification — severity, affected module, root cause category. This was taking 2 developers 4+ hours every sprint just for triage."

**T (Task):**
"I was asked to reduce the triage time while maintaining accuracy so developers could focus on actual fixes rather than sorting bugs."

**A (Action):**
"I built a Claude-powered triage assistant that:

1. Reads the defect description, stack trace, and affected file paths
2. Auto-classifies severity (critical/high/medium/low) based on impact keywords and affected components
3. Suggests which module owner should get assigned
4. Identifies if it's a duplicate of an existing known issue
5. Integrated it into our Jira workflow — when a ticket is created, Claude auto-fills priority and component fields"

**R (Result):**
"Reduced triage time from 4 hours/sprint to 30 minutes (just reviewing Claude's suggestions). Classification accuracy was 87% — the team only needed to correct about 1 in 8 tickets. Freed up 7+ developer-hours per sprint for actual coding."

---

## 25. What is AWS OIDC? Is it related to ARN?

### What is OIDC?

**OIDC (OpenID Connect) = a way to prove identity without passwords.**

In the context of GitHub + AWS:

- GitHub says to AWS: "I am the workflow running in repo `acme/api` on the `main` branch."
- AWS checks: "Is that repo allowed to access my resources? Yes → here's temporary credentials for 1 hour."
- **No passwords or access keys stored anywhere!**

### How it relates to ARN:

**ARN (Amazon Resource Name)** = a unique ID for anything in AWS.

```
arn:aws:iam::123456789:role/github-actions-role
```

The connection:

1. You create an **IAM Role** in AWS (this has an ARN)
2. You set a **trust policy** on that role: "Only GitHub repo X can assume this role"
3. In your GitHub Action, you say: "I want to assume this role" → GitHub proves its identity via OIDC → AWS gives temporary access

```yaml
# In GitHub Actions workflow:
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-arn: arn:aws:iam::123456789:role/github-actions-role
    aws-region: us-east-1
    # No access key! OIDC handles authentication
```

### Why is this important for the job?

- You have 50,000+ repos that need to talk to AWS
- You CAN'T store AWS passwords in 50,000 repos (security nightmare)
- OIDC = each repo can access AWS with ZERO stored secrets
- The IAM role ARN defines WHAT that repo can do in AWS (least privilege)

---

_Last updated: 2026-05-21_
