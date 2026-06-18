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

### Gap 6 — No structured agent return format ✅ DONE

**Implemented:** Structured agent return format with `AgentResult` type.

- Added `AgentResult` type with `status` (done|fail|blocked|setup-error), `summary`, `followups`
- Added marker constants: `AGENT_RESULT_START`, `AGENT_RESULT_END`
- Updated `runAgent()` to parse structured result from stdout
- Added fallback logic (`deriveAgentResult`) for agents without structured output
- Updated all 16 agent instructions to output structured result
- Updated all step files to handle `AgentResult` return type

**Status:** Complete — CLI can now make deterministic orchestration decisions based on agent status.

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

### Gap 10 — No warm-continue on agent retries ✅ COMPLETED

**Implemented:** Added `{PREVIOUS_ATTEMPT_CONTEXT}` placeholder to `runAgent()` in `scripts/ai-dev/core/agent-runner.ts`. On retry, the previous agent's output and error messages are injected into the prompt, giving the retry agent "memory" of what failed.

**Changes:**

- `scripts/ai-dev/core/agent-runner.ts` — Added `previousAttemptContext` parameter, injects as `PREVIOUS_ATTEMPT_CONTEXT` variable
- `scripts/ai-dev/steps/fix-build.ts` — Captures previous attempt context on failure, passes on retry
- `scripts/ai-dev/steps/fix-types.ts` — Same pattern
- `scripts/ai-dev/steps/fix-tests.ts` — Same pattern
- `agents/fix-build-agent/instructions.md` — Added `{PREVIOUS_ATTEMPT_CONTEXT}` input
- `agents/fix-types-agent/instructions.md` — Added `{PREVIOUS_ATTEMPT_CONTEXT}` input
- `agents/fix-tests-agent/instructions.md` — Added `{PREVIOUS_ATTEMPT_CONTEXT}` input

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

### Gap 12 — No trivial-skip gate for small changes ✅ IMPLEMENTED

**Current state:** Every ticket runs through all 10 pipeline steps regardless of change size. A 3-line README fix goes through security review, performance review, and full validation.

**Problem:** Overkill for trivial changes. A typo fix costs ~$8+ in agent budget when it should cost $0.

**Implemented fix:** Added `scripts/ai-dev/core/trivial-skip.ts` with change-size heuristic after `code-impl` that skips expensive downstream steps when ALL conditions are met:

- ≤ 10 changed lines (configurable via `TrivialSkipConfig.maxChangedLines`)
- All changed files are on a trivial-surface allowlist (`.md`, `.css`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`)
- No security-sensitive paths touched (`.env`, `.env.`, `auth`, `secret`, `password`, `infra/`)
- `tsc --noEmit` passes

When triggered, skips `code-test`, `code-security`, `code-perf` and goes directly to `validate → deploy-pr`.

**Files changed:**

- `scripts/ai-dev/core/trivial-skip.ts` — new module with `shouldSkipExpensiveSteps()`, `checkTrivialSkip()`, `checkTypeScriptTypes()`
- `scripts/ai-dev/steps/code.ts` — integrated trivial-skip check after `code-impl`

**Effort:** ~1 hour (actual: ~45 min)

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

### Gap 14 — No structured change lifecycle (OpenSpec-style)

**Current state:** Feature artifacts live in `docs/features/{TICKET_ID}/` as ad-hoc files (`requirements.md`, `TDD.md`, `IMPL_CHECKLIST.md`, `SECURITY_REVIEW.md`). There is no formal state machine governing transitions between artifacts, no archive workflow, and no way to resume interrupted work from a known checkpoint.

**Problem:** Without a lifecycle model: (1) interrupted pipelines have no resume point — you re-run from scratch; (2) completed features don't accumulate knowledge back into project specs; (3) agents can't query "what state is this change in?" without reading all files.

**Reference:** AI-SDLC's OpenSpec framework provides a structured lifecycle: `proposal → specs → design → tasks → apply → archive`. Each change gets its own folder with deterministic artifact names. Orchestrators read `openspec status --json` to determine progress. Completed changes merge delta specs back into a living `openspec/specs/` source of truth.

**Planned fix:** Introduce a lightweight state machine for `docs/features/{TICKET_ID}/`:

```
init → requirements → design → implementation → testing → review → shipped → archived
```

- Add a `state.json` file per feature tracking current phase + completion markers
- Resume logic reads `state.json` instead of probing file existence
- Archive step moves key learnings (patterns, decisions) into `docs/adr/` or a patterns library
- `status` subcommand reads `state.json` for rich progress output

**Effort:** ~3 hours (state model + `state.json` read/write in CLI + archive step)

---

### Gap 15 — Lightweight per-run telemetry report (alternative to Gap 13)

**Current state:** The only cost visibility is the claude CLI's final output per agent. Gap 13 proposes a full Docker Compose dashboard (ClickHouse + OTel Collector + React), estimated at ~6 hours — overkill for a solo developer.

**Problem:** The full dashboard (Gap 13) is expensive to build and maintain. But having zero post-hoc cost analysis means optimization opportunities go unnoticed.

**Reference:** AI-SDLC's Claude Code pipeline uses a much lighter approach: a local OTLP receiver (`otlp-receiver.mjs`) that captures session data into JSONL files, then a `build-report.mjs` script generates a self-contained `report.html` per pipeline run. No external services needed — just Node.js.

**Planned fix:** After each `runAgent()` call, capture:

- Agent name, model, start/end time, exit code
- Token counts (if parseable from claude CLI output)
- Budget spent (from `--max-budget-usd` reporting)

Write to `docs/features/{TICKET_ID}/telemetry.jsonl` (one line per agent invocation). Add a `telemetry-report` subcommand that generates a self-contained HTML summary:

- Per-agent token breakdown table
- Total cost per ticket
- Time-per-phase breakdown
- Historical comparison (if previous tickets exist)

**Effort:** ~3 hours (capture logic in `runAgent()` + HTML report generator)

**Note:** This supersedes Gap 13 for solo-developer use. Gap 13's Docker stack remains relevant only at team scale.

---

### Gap 16 — No knowledge accumulation after feature completion

**Current state:** After a feature is shipped (`release`), the `docs/features/{TICKET_ID}/` folder accumulates indefinitely. Patterns discovered during implementation (error handling approaches, integration patterns, performance solutions) are not synthesized back into project knowledge.

**Problem:** The `design-agent` and `code-impl-agent` cannot learn from previous successful implementations. Each new feature starts from scratch, potentially re-discovering patterns that were already established. Over time, this leads to inconsistency and wasted agent budget on pattern discovery.

**Reference:** AI-SDLC's OpenSpec archive workflow merges "delta specs" from completed changes back into a living `openspec/specs/` source of truth. The design agent queries this accumulated knowledge for new features.

**Planned fix:** Add an `archive` step (post-`release`) that:

1. Extracts key decisions from `TDD.md` → appends to a `docs/patterns/` library
2. Extracts new ADR-worthy decisions → creates ADR drafts in `docs/adr/`
3. Updates `CLAUDE.md` if new conventions were established (e.g., new error pattern)
4. Moves `docs/features/{TICKET_ID}/` to `docs/features/archive/{TICKET_ID}/`

The `design-agent`'s brownfield context injection (`gatherBrownfieldContext()`) would additionally scan `docs/patterns/` for relevant prior art.

**Effort:** ~2 hours (archive step logic + patterns extraction heuristic)

---

## Future Improvements Priority Matrix

> **Re-evaluated:** 2026-06-18. Reassessed against current fully-implemented 10-step pipeline
> (25 subcommands, 15+ agents, Jira gating, CI auto-fix, release/rollback). Solo developer context.
>
> **Completed gaps removed:** Gap 3 (brownfield context ✅), Gap 7 (no-fabrication guard ✅)

| Priority | Gap | Title                                | Impact | Effort | Reasoning                                                                      |
| -------- | --- | ------------------------------------ | ------ | ------ | ------------------------------------------------------------------------------ |
| **P1**   | 12  | Trivial-skip gate                    | High   | ~1h    | Direct $ savings — README/config changes don't need $8 security+perf review    |
| **P1**   | 10  | Warm-continue on retries             | High   | ~1h    | Stops retries from repeating same mistake. Near-zero risk, immediate ROI       |
| **P1**   | 6   | Structured agent return format       | High   | ~2h    | Eliminates silent failures (exit 0 but incomplete). Smarter orchestration      |
| **P2**   | 15  | Lightweight per-run telemetry report | High   | ~3h    | Cost visibility per ticket/agent without Docker infra; enables optimization    |
| **P2**   | 5   | Scope drift detection                | High   | ~1h    | Catches agents touching unrelated files — real observed problem                |
| **P2**   | 1   | Dev plan step                        | Medium | ~3h    | Only needed for complex multi-file features; TDD.md covers 80% of cases        |
| **P3**   | 14  | Structured change lifecycle          | Medium | ~3h    | Resume interrupted work + richer status; not critical while pipeline is stable |
| **P3**   | 16  | Knowledge accumulation (archive)     | Medium | ~2h    | ROI increases with feature count; not urgent with <10 shipped features         |
| **P3**   | 8   | Circuit breaker + re-planning        | Medium | ~4h    | Over-engineering for solo dev — manual investigation is fast & informative     |
| **P3**   | 9   | CodeGraph MCP                        | Medium | ~8h    | Codebase too small to justify; brownfield injection covers main use case       |
| **P4**   | 11  | Code review agent post-impl          | Low    | ~2h    | Redundant — human gate after code-impl catches spec divergence                 |
| **P4**   | 2   | Enforced human gates                 | Low    | ~2h    | Solo dev controls the flow; no accidental automation to prevent                |
| **P4**   | 4   | Slack notifications                  | Low    | ~3h    | Terminal output sufficient for solo async workflow                             |
| **P4**   | 13  | OTLP telemetry dashboard (full)      | Low    | ~6h    | Superseded by Gap 15 for solo use; only relevant at team scale                 |

---

### Reasoning for Priority Changes (vs. original 2026-06-15 assessment)

1. **Gap 12 promoted P2→P1** — Pipeline is mature and running regularly. Every trivial change (docs, configs) triggers 5 unnecessary agents costing ~$8. At weekly cadence, this is the single biggest cost leak.

2. **Gap 10 promoted P2→P1** — With `deploy-ship` dispatching fix agents that retry up to 3x per failure type, cold-starting retries is actively wasteful. Injecting previous failure context prevents the #1 cause of failed retries: repeating the same approach.

3. **Gap 9 demoted P2→P3** — Original effort estimate (~2h) was unrealistic. Actual effort for a custom tree-sitter MCP: ~8h. Codebase has <30 active source files — grep is fast and cheap. Gap 3 (brownfield injection, already done) covers 80% of structural context need. Revisit when repo exceeds 100 active files.

4. **Gap 8 demoted P2→P3** — Re-planning adds complexity. For a solo developer, when retries exhaust you WANT to investigate manually — this is how you improve agent instructions. Automated re-planning hides failure signals.

5. **Gap 11 demoted P3→P4** — Human gates enforced at every step. The `code` alias is the only path that skips gates, and even then you review the PR. A dedicated code-review agent is redundant when you ARE the reviewer.

6. **Gap 2 demoted P2→P4** — `checkPrerequisite()` already gates on Jira status. The "enforced" improvement only matters in team settings where someone might accidentally skip review.

---

**Recommended implementation order:**

1. **Quick wins (P1):** Gap 12 → Gap 10 → Gap 6 — ~4 hours total, improve every subsequent pipeline run
2. **Observability + safety (P2):** Gap 15 → Gap 5 → Gap 1 — telemetry enables data-driven optimization; scope guard catches drift
3. **Maturity (P3):** Gap 14 → Gap 16 — structured lifecycle + knowledge accumulation; implement after 10+ features shipped
4. **Defer until needed (P3–P4):** Gaps 8, 9, 11, 2, 4, 13 — revisit quarterly or when pain emerges

> **AI-SDLC reference validation:** Gaps 6, 10, 12 are independently validated by the `ai-agentic-sdlc-workflow` architecture (structured returns, warm-continue, trivial-skip). Their implementation patterns can be referenced from that framework's Claude Code pipeline.

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

### Implementation Priority (Updated 2026-06-18)

| Order | Item                          | Type                                 | Effort | Notes                                                             |
| ----- | ----------------------------- | ------------------------------------ | ------ | ----------------------------------------------------------------- |
| 1     | Trivial-skip gate (Gap 12)    | CLI module in `scripts/ai-dev/core/` | ~1h    | Biggest cost saver — implement first                              |
| 2     | Warm-continue on retries (10) | CLI module (modify `runAgent()`)     | ~1h    | Inject `{PREVIOUS_ATTEMPT_CONTEXT}` on retry                      |
| 3     | Structured agent return (6)   | CLI module (modify `runAgent()`)     | ~2h    | Parse JSON between markers from stdout                            |
| 4     | Per-run telemetry (Gap 15)    | CLI module (modify `runAgent()`)     | ~3h    | JSONL capture + HTML report; replaces Gap 13 for solo use         |
| 5     | Scope Guard (Gap 5)           | CLI module in `scripts/ai-dev/core/` | ~1h    | `git diff --name-only` vs declared scope                          |
| 6     | Change lifecycle (Gap 14)     | CLI module (`state.json` per ticket) | ~3h    | Resume logic + archive step; implement after 10+ features shipped |
| 7     | Knowledge accumulation (16)   | CLI step (post-release archive)      | ~2h    | Pattern extraction → `docs/patterns/`; pairs with Gap 14          |
| 8     | Knowledge Base MCP            | Custom MCP                           | ~5h    | Defer — only if design agent struggles with ADRs                  |
| 9     | CodeGraph MCP                 | Custom MCP                           | ~8h    | Defer — revisit when repo exceeds 100 active files                |
| —     | ~~OTLP dashboard (Gap 13)~~   | ~~Docker Compose stack~~             | ~~6h~~ | Superseded by Gap 15 for solo dev; team-scale only                |
| —     | ~~Notification utility~~      | ~~CLI module (`notifySlack()`)~~     | ~~2h~~ | Deprioritized — solo dev, terminal sufficient                     |

> **Principle:** Default to CLI modules. Promote to MCP only when agents demonstrably need mid-session access that cannot be pre-injected. Prioritize items that save money or prevent wasted retries over architectural elegance.
>
> **AI-SDLC reference:** Patterns for items 1–5 are validated by the `ai-agentic-sdlc-workflow` framework. Items 6–7 are inspired by its OpenSpec archive workflow.
