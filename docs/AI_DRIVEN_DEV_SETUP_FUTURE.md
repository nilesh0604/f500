# AI-Driven Development — Future Enhancements

> **Related:** See [AI_DRIVEN_DEV_SETUP_CURRENT.md](./AI_DRIVEN_DEV_SETUP_CURRENT.md) for the current implemented setup.

---

## Table of Contents

1. [Known Gaps & Planned Enhancements](#known-gaps--planned-enhancements)
2. [Future Improvements Priority Matrix](#future-improvements-priority-matrix)
3. [Custom MCP vs CLI Module Analysis](#custom-mcp-vs-cli-module-analysis)

---

## Known Gaps & Planned Enhancements

> Identified during design review on 2026-06-14. These are process/architecture gaps —
> not bugs — that surface when comparing the pipeline against its original stated intentions:
> spec-driven, async, human-gated, green/brownfield-compatible, tool-integrated.

### Gap 1 — Missing dev plan step between design and code-impl

**Current state:** The pipeline goes `design → code-impl`. The `code-impl-agent` receives `TDD.md` and must infer the implementation order from the design document.

**Problem:** Build order is non-deterministic. If the agent fails mid-way, there is no checkpoint to resume from. There is also no explicit dependency graph (e.g., "scaffold shared types before handlers").

**Planned fix:** Add a `plan` step between `design` and `code-impl` that produces a `docs/features/{TICKET_ID}/dev-plan.md` — an ordered, dependency-aware task breakdown (WBD). The `code-impl-agent` consumes this as its primary sequencing input. Each task in the plan maps to a verifiable checkpoint.

```
requirements → design → [plan] → code-impl → ...
```

---

### Gap 2 — Human review gates are passive, not enforced

**Current state:** Each pipeline step auto-transitions its Jira subtask to `Done` upon completion, then prints "next command: ai-dev \<step\>". The human gate works by convention — the developer must choose not to run the next command.

**Problem:** Nothing prevents a developer (or a script) from immediately running the next step without reviewing the artifact. The gate is advisory, not systemic.

**Planned fix:** End each AI step in a `Pending Review` Jira status (not `Done`). Each subsequent step's `checkPrerequisite()` must verify the prior subtask is `Done` — which only happens after a human explicitly transitions it in Jira. This makes human approval a hard system gate, not a convention.

---

### Gap 3 — No brownfield context injection in design agent

**Status:** ✅ **Fixed** (implemented in `scripts/ai-dev/steps/design.ts`)

**What was done:**

1. Added `gatherBrownfieldContext()` function in `scripts/ai-dev/steps/design.ts` that proactively collects:
   - Shared types from `libs/shared-types/src/` (index.ts, order.types.ts, event.types.ts, auth.types.ts)
   - Handler structure from `apps/vyasa-rag-service/src/handlers/`
   - Service layer patterns from `apps/vyasa-rag-service/src/services/`
   - Error handling patterns from `apps/vyasa-rag-service/src/lib/`

2. The context is injected as `{BROWNFIELD_CONTEXT}` variable to the design agent — no token cost for the agent to discover these patterns.

3. Updated `agents/design-agent/instructions.md` to use the injected context as the primary source for existing patterns, with explicit guidance to reuse existing shared types rather than creating duplicates.

**Result:** The design agent now receives a structured snapshot of existing conventions before producing `TDD.md`, reducing divergence from established patterns.

---

### Gap 4 — Slack not integrated into the ai-dev pipeline

**Current state:** The pipeline integrates with Jira (state) and GitHub (PRs/CI) but has no Slack notifications. Developers must poll Jira or the terminal to know when a gate is ready for review.

**Problem:** Breaks the async workflow intention — the value of async steps is that a developer can context-switch away and be notified when attention is needed, not poll for status.

**Planned fix:** Post a Slack message at each human gate event:

- Step completes → "✅ `design` ready for review — SCRUM-123 \[link\]"
- Step blocked → "⛔ `code-impl` blocked — approve design first"
- CI fails → "🔴 CI failing on `SCRUM-123` — dispatching fix agent"

This closes the feedback loop without requiring the developer to watch the terminal or Jira board.

---

### Gap 5 — No scope drift detection after agent dispatch

**Current state:** After `code-impl-agent` runs, there is no automated check that the agent only touched files relevant to the task. The `validate` step checks lint/tsc/tests but not file scope.

**Problem:** Agents may write to unexpected locations (unrelated configs, unrelated tests, unrelated services). This goes undetected until human PR review — wasting review bandwidth.

**Planned fix:** Add a zero-LLM scope-check script (inspired by AI-SDLC's `check-drift.ps1`). After `code-impl`, run `git diff --name-only` and compare against declared file scope from `dev-plan.md`. Drift = hard-block with a clear report of which files were out-of-scope.

**Effort:** ~1 hour (shell script + wire into CLI)

---

### Gap 6 — No structured agent return format

**Current state:** Agents communicate results via file artifacts (IMPL_CHECKLIST.md, SECURITY_REVIEW.md). The TypeScript CLI detects success/failure by checking file existence or parsing exit codes.

**Problem:** Unreliable — an agent may exit 0 but produce incomplete output. The CLI cannot distinguish "done successfully" from "gave up silently". Auto-dispatch logic (e.g., `deploy-ship`) must rely on heuristics.

**Planned fix:** Define a JSON return contract for all agents. Each agent must output a structured block between markers:

```
---AGENT_RESULT_START---
{ "status": "done|fail|blocked|setup-error", "summary": "...", "followups": [...] }
---AGENT_RESULT_END---
```

The `runAgent()` helper parses this from stdout and uses `status` for deterministic orchestration decisions (retry, re-plan, hard-block).

**Effort:** ~2 hours (update `runAgent()` + all agent instructions)

---

### Gap 7 — No fabrication guard in agent instructions

**Current state:** Agents are instructed to follow `CLAUDE.md` conventions and use `TDD.md` as reference, but there is no explicit rule preventing fabrication of non-existent paths, types, or endpoints.

**Problem:** In brownfield repos, agents may hallucinate file paths, class names, or API endpoints that don't exist — leading to broken imports and runtime errors that waste downstream agent budgets.

**Planned fix:** Add a "No Fabrication Rule" paragraph to every code-writing agent's `instructions.md`:

> "Every file path, class name, namespace, and endpoint you reference must trace to: (1) an existing file in the repo, (2) the approved TDD.md spec, or (3) a resolved design decision. If you cannot find a reference, STOP and report `status: blocked` with the missing reference."

**Effort:** ~30 minutes (add paragraph to 6 agent instruction files)

---

**Status:** ✅ Implemented — 15 Jun 2026

**Implementation:**

Added `## No Fabrication Rule` section to 6 code-writing agent instruction files:

- `agents/code-agent/instructions.md`
- `agents/code-impl-agent/instructions.md`
- `agents/code-perf-agent/instructions.md`
- `agents/code-quality-agent/instructions.md`
- `agents/code-security-agent/instructions.md`
- `agents/code-test-agent/instructions.md`

Each section is positioned after "Allowed tools" and before "Inputs" for visibility.

---

### Gap 8 — No circuit breaker with re-planning

**Current state:** The pipeline has max retries per failure type (3 for `deploy-ship` fix agents, 1 for `code-test` coverage retry). When retries exhaust, the pipeline hard-blocks and the developer must manually investigate.

**Problem:** Hard-blocking is a dead end. The developer has no structured guidance on what to do next. Often the fix is to decompose the task differently (smaller scope, different order), which is exactly what an AI planner could do.

**Planned fix:** Implement a "Mode 3" re-planning mechanism (inspired by AI-SDLC's circuit breaker pattern):

1. After `code-impl` fails 2x → invoke a `re-plan` step that splits the failing task into smaller sub-tasks
2. After `code-test` coverage fails 2x → re-plan identifies untestable code and suggests refactoring
3. After `deploy-ship` exhausts all fix retries → produce a structured "Blockers Report" posted to Jira

This pairs with Gap 1 (dev-plan step) — the re-planner rewrites `dev-plan.md` with finer granularity.

**Effort:** ~4 hours (new `re-plan` step logic + planner agent instructions)

---

### Gap 9 — No code intelligence MCP (CodeGraph)

**Current state:** Agents rely on Claude's built-in file search (grep, read) to navigate the codebase. This is token-expensive for large repos and produces imprecise results.

**Problem:** Without a structural code index, agents spend significant tokens on exploratory reads. The design agent cannot quickly answer "what calls this function?" or "what implements this interface?" — leading to brownfield context gaps (Gap 3) and higher budgets.

**Planned fix:** Add CodeGraph MCP (`@colbymchenry/codegraph`) to `.mcp.json`:

- Tree-sitter-powered symbol graph with sub-millisecond queries
- Tools: `codegraph_search`, `codegraph_context`, `codegraph_callers`, `codegraph_impact`
- Agents use it instead of grep for structural lookups

This also provides the brownfield grounding needed for Gap 3 — the design agent can query existing interfaces, types, and patterns before proposing new ones.

**Effort:** ~2 hours (install, `codegraph init -i`, add to `.mcp.json`, update agent instructions)

---

### Gap 10 — No warm-continue on agent retries

**Current state:** When a `fix-*` agent retries (or `code-test` retries for coverage), it cold-spawns a fresh claude process with no context from the previous failed attempt.

**Problem:** The retry agent re-reads the entire codebase from scratch, wasting tokens on context it already built. It may also repeat the same mistake if it doesn't know what was tried before.

**Planned fix:** On retry, prepend the previous agent's failure output to the system prompt. Since `runAgent()` already constructs the prompt via string substitution, add a `{PREVIOUS_ATTEMPT_CONTEXT}` placeholder:

- First attempt: placeholder is empty
- Retry: placeholder contains the previous agent's stdout summary + error messages

This gives the retry agent "memory" of what failed without maintaining a persistent session.

**Effort:** ~1 hour (capture previous stdout in `runAgent()`, inject on retry)

---

### Gap 11 — No dedicated code review agent after implementation

**Current state:** The pipeline goes `code-impl → code-test → code-quality → code-security → code-perf`. There is no general "does this implementation match the spec?" review between implementation and testing.

**Problem:** If the implementation diverges from TDD.md (wrong patterns, missing edge cases, spec misinterpretation), the test agent writes tests for incorrect code — then both must be rewritten. This wastes ~$4 (test + impl redo).

**Planned fix:** Add a `code-review` step between `code-impl` and `code-test`:

- Agent: `code-review-agent` (sonnet, $1.50)
- Input: `TDD.md`, `dev-plan.md`, `git diff` of implementation
- Output: `pass | concerns-only | fail` with structured findings
- Gate: `fail` → retry `code-impl` with reviewer feedback (warm-continue)

Pipeline becomes: `code-impl → [code-review] → code-test → ...`

**Effort:** ~2 hours (new agent instructions + new step in CLI)

---

### Gap 12 — No trivial-skip gate for small changes

**Current state:** Every ticket runs through all 10 pipeline steps regardless of change size. A 3-line README fix goes through security review, performance review, and full validation.

**Problem:** Overkill for trivial changes. A typo fix costs ~$8+ in agent budget when it should cost $0.

**Planned fix:** Add a change-size heuristic after `code-impl` that skips expensive downstream steps when ALL conditions are met:

- ≤ 10 changed lines
- All changed files are on a trivial-surface allowlist (`.md`, `.css`, `.json`, config files)
- No security-sensitive paths touched (`*.env*`, `*auth*`, `*secret*`, `infra/`)
- `tsc --noEmit` passes

When triggered, skip `code-test`, `code-security`, `code-perf` and go directly to `validate → deploy-pr`.

**Effort:** ~1 hour (heuristic function in CLI + allowlist config)

---

### Gap 13 — No OTLP telemetry dashboard for cost visibility

**Current state:** Budget caps (`--max-budget-usd`) control per-agent spend, but there is no post-hoc visibility into actual spend per agent, per ticket, or over time. The only cost signal is the claude CLI's final output.

**Problem:** Cannot identify optimization opportunities (which agents burn the most tokens? where are cache hits low? which ticket types are most expensive?) without manual log parsing.

**Planned fix:** Deploy an OTLP telemetry stack (inspired by AI-SDLC's ClickHouse + OTel Collector + React dashboard):

- OTel Collector receives telemetry from claude sessions (Claude Code already supports OTLP export)
- ClickHouse stores token/cost/timing data per session
- Simple dashboard shows: spend per agent, spend per ticket, trend over time
- Docker Compose deployment (minimal: 1 CPU, 1GB RAM per container)

**Priority:** Lower — most valuable at team scale. For solo developer, periodic manual review of claude CLI output may suffice.

**Effort:** ~6 hours (Docker Compose stack + basic dashboard)

---

## Future Improvements Priority Matrix

> **Source:** Cross-referenced from `ai-dlc/AI-SDLC-ARCHITECTURE.md` patterns on 2026-06-15.

| Gap | Title                                   | Impact | Effort | Priority |
| --- | --------------------------------------- | ------ | ------ | -------- |
| 5   | Scope drift detection                   | High   | ~1h    | P1       |
| 7   | No-fabrication guard                    | High   | ~30min | P1       |
| 6   | Structured agent return format          | High   | ~2h    | P1       |
| 10  | Warm-continue on retries                | Medium | ~1h    | P2       |
| 12  | Trivial-skip gate                       | Medium | ~1h    | P2       |
| 8   | Circuit breaker + re-planning           | High   | ~4h    | P2       |
| 9   | CodeGraph MCP                           | High   | ~2h    | P2       |
| 11  | Code review agent post-impl             | Medium | ~2h    | P3       |
| 1   | Dev plan step (existing)                | High   | ~3h    | P2       |
| 2   | Enforced human gates (existing)         | Medium | ~2h    | P2       |
| 3   | Brownfield context injection (existing) | Medium | ~2h    | P3       |
| 4   | Slack notifications (existing)          | Low    | ~3h    | P4       |
| 13  | OTLP telemetry dashboard                | Low    | ~6h    | P4       |

**Recommended implementation order (P1 first):**

1. Gap 7 → Gap 5 → Gap 6 (quick wins, improve every subsequent run)
2. Gap 1 + Gap 8 (plan step + re-planning — architectural improvement)
3. Gap 9 + Gap 3 (CodeGraph + brownfield context — synergistic)
4. Gap 10 → Gap 12 → Gap 11 (cost optimizations)
5. Gap 2 → Gap 4 → Gap 13 (process maturity)

---

## Custom MCP vs CLI Module Analysis

> **Added:** 2026-06-16. Analysis of whether gap solutions should be MCPs or TypeScript CLI modules.

### Decision Criteria

An MCP is justified **only** when the AI agent needs to call the tool **during its reasoning session**. The AI-DLC pipeline uses CLI-orchestrated prompt injection (`{VAR}` substitution) — meaning most "tools" should be CLI functions that compute context **before** agent dispatch, not MCPs the agent calls at runtime.

| Build As       | Criteria                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| **MCP**        | Agent discovers the need dynamically mid-session; cannot be pre-computed |
| **CLI module** | Runs before/after agent invocation; result can be injected via `{VAR}`   |

---

### Gaps That Should Be CLI Modules (NOT MCPs)

| Gap | Capability               | Why CLI Module Suffices                                                                                       |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 5   | Scope drift detection    | Runs between agent calls. Simple `checkDrift()` comparing `git diff --name-only` against `dev-plan.md` scope. |
| 6   | Structured agent return  | `runAgent()` parses stdout after exit. No mid-session need.                                                   |
| 10  | Warm-continue on retries | Previous attempt output injected via `{PREVIOUS_ATTEMPT_CONTEXT}` before dispatch.                            |
| 12  | Trivial-skip gate        | Pure heuristic: `if (changedLines <= 10 && allTrivialFiles) skip()`.                                          |
| 4   | Slack notifications      | Triggered by CLI after agent exits. A `notifySlack()` utility.                                                |
| 13  | OTLP telemetry           | Post-hoc analysis. CLI logs to SQLite after each `runAgent()` call.                                           |
| 2   | Enforced human gates     | CLI's `checkPrerequisite()` queries Jira status before dispatch.                                              |
| 8   | Circuit breaker          | CLI logic: if retries exhausted → invoke re-plan agent. Orchestration, not mid-session.                       |

---

### Gaps That Justify a Custom MCP

#### MCP 1 — CodeGraph (AST Intelligence)

> Solves: Gap 9, Gap 3 (brownfield context)

**Why MCP:** The `code-impl-agent` needs to ask "who calls this function?" or "what implements this interface?" **while writing code**. These queries arise dynamically during reasoning — they cannot be pre-computed before dispatch.

**Tools:**

- `codegraph_symbol_lookup` — find symbol definition by name
- `codegraph_callers_of` — reverse call graph for a function/method
- `codegraph_implementors_of` — find all implementations of an interface
- `codegraph_impact_analysis` — files affected by changing a symbol
- `codegraph_dependency_graph` — Nx project-level dependency edges

**Architecture:**

- Tree-sitter-based indexer respecting `tsconfig.base.json` path aliases
- Indexes only Nx project graph targets (not `node_modules/`)
- Persistent background process with file-watcher for incremental re-index
- Sub-millisecond query responses

**Consuming agents:** `code-impl-agent`, `code-test-agent`, `code-perf-agent`, `design-agent`

**Effort:** ~8 hours (indexer + MCP server + `.mcp.json` entry + agent instruction updates)

---

#### MCP 2 — Knowledge Base (ADR & Decision Search)

> Solves: Gap 3 (partial), prevents pattern re-invention

**Why MCP:** The `design-agent` needs to ask "is there an existing ADR for auth patterns?" or "what was the decision on error handling?" **while designing**. Pre-injecting all 11+ ADRs into the prompt is too many tokens. Semantic search on-demand is the correct pattern.

**Tools:**

- `kb_search` — semantic search across ADRs, `CLAUDE.md` files, and design docs
- `kb_get_adr` — retrieve full ADR by number or keyword
- `kb_decision_applies_to` — given a file path, return relevant decisions/constraints
- `kb_pattern_lookup` — find established patterns for a given concept (auth, error handling, events)

**Architecture:**

- Embedding-based index of `docs/adr/`, `CLAUDE.md` files, `docs/*.md`
- Re-indexes on file change (watch mode) or on-demand
- Local vector store (SQLite + cosine similarity, or FAISS)
- No external API dependency — runs fully local

**Consuming agents:** `design-agent`, `requirements-agent`, `code-impl-agent`, `code-review-agent` (future)

**Effort:** ~5 hours (embeddings pipeline + MCP server + `.mcp.json` entry)

---

### Borderline Cases (MCP only if needed mid-session)

| Capability            | MCP if...                                                                                                | CLI module if...                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Test Intelligence** | `code-test-agent` needs to ask "what tests cover this file?" while writing tests                         | You pre-compute affected tests and inject via `{AFFECTED_TESTS}`             |
| **Artifact Registry** | Agents need to read prior agent outputs mid-session (e.g., code-test reading IMPL_CHECKLIST dynamically) | You inject artifacts into prompt via `{VAR}` substitution (current approach) |

**Recommendation:** Start with CLI-module approach for both. Promote to MCP only if agents consistently burn tokens trying to find this information mid-session.

---

### Updated `.mcp.json` Target State

```json
{
  "mcpServers": {
    "github": { "..." },
    "aws-unified": { "..." },
    "jira": { "..." },
    "langfuse": { "..." },
    "codegraph": {
      "command": "node",
      "args": ["./tools/codegraph-mcp/dist/server.js", "--project-root", "."],
      "env": {}
    },
    "knowledge-base": {
      "command": "node",
      "args": ["./tools/kb-mcp/dist/server.js", "--docs-dir", "./docs"],
      "env": {}
    }
  }
}
```

---

### Implementation Priority

| Order | Item                 | Type                                 | Effort |
| ----- | -------------------- | ------------------------------------ | ------ |
| 1     | CodeGraph MCP        | Custom MCP                           | ~8h    |
| 2     | Knowledge Base MCP   | Custom MCP                           | ~5h    |
| 3     | Scope Guard          | CLI module in `scripts/ai-dev/core/` | ~1h    |
| 4     | Budget telemetry     | CLI module + SQLite                  | ~4h    |
| 5     | Notification utility | CLI module (`notifySlack()`)         | ~2h    |

> **Principle:** Default to CLI modules. Promote to MCP only when agents demonstrably need mid-session access that cannot be pre-injected.
