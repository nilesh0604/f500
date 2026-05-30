# Requirements — SCRUM-11: fix(ai-dev): structured Design Decisions blocks with in-place Decision resolution

## Status: Draft

---

## Problem Statement

When `cmd_resolve` writes resolved design decisions back to `requirements.md`, it discards all context from the original question — the question text, options, and agent recommendation — and records only the PO's short answer (e.g. `- **Q1 Decision**: Left slide-in`), replacing the entire `## Open Questions` section. Future readers and downstream agents have no context to understand _why_ a decision was made. Additionally, the two-section approach (`## Open Questions` → `## Design Decisions (resolved)`) forces a structural mutation of the document that makes partial resolution (some Qs answered, others pending) awkward to represent.

---

## User Stories

- As a **design-agent**, I want each resolved Design Decision entry in `requirements.md` to contain the original question text, offered options, PO answer, and agent recommendation so that I can generate technically coherent design documents without needing to re-examine Jira comments.
- As a **human engineer reviewing a PR**, I want to read the Design Decisions section of `requirements.md` and immediately understand what was decided and why, without navigating to Jira to find the original question thread.
- As an **auditor or future maintainer**, I want an immutable, self-contained record of every design choice (including the options considered and the recommendation) so that I can reconstruct the decision context months after the fact.
- As a **requirements-agent operator**, I want the requirements-agent to emit structured `## Design Decisions` blocks (with `### Q[N]:`, `Option[N]:`, and `**Recommendation**:` fields) so that `cmd_resolve` has unambiguous structured input to parse.
- As a **requirements-agent operator**, I want the existing `cmd_resolve` round-counter logic, gate check, and Jira confirmation comment to remain untouched so that the wider agentic workflow does not regress.

---

## Acceptance Criteria

1. **Given** a `requirements.md` with a `## Design Decisions` section containing at least one structured `### Q[N]:` block (title, one or more `Option[N]:` lines, and a `**Recommendation**:` line) **when** `cmd_resolve` processes a matching Jira comment where the PO has answered each question **then** each answered `### Q[N]:` block gains a `Decision: [PO answer]` line appended immediately after the last field of that block; the question text, options, and recommendation lines are preserved in place.

2. **Given** a resolved Design Decision entry was written by `cmd_resolve` **when** a human or agent reads `requirements.md` **then** the block follows the canonical format:

   ```
   ### Q[N]: [Short question title]
   [Optional one-line context sentence]
   Option1: [text]
   Option2: [text]
   **Recommendation**: [Agent recommendation text]
   Decision: [PO answer]
   ```

   with no raw markdown or unparsed fragments remaining. Unanswered questions omit the `Decision:` line and are otherwise unchanged.

3. **Given** the `cmd_resolve` command is executed successfully **when** `Decision:` lines are appended to answered question blocks **then** the round counter in `.questions-round` is incremented correctly if any questions remain unanswered (existing behaviour preserved, no regression).

4. **Given** the `cmd_resolve` command is executed successfully **when** all `### Q[N]:` blocks have a `Decision:` line **then** the gate check passes (no open questions remain) and the downstream design step is unblocked — identical behaviour to pre-fix.

5. **Given** the `cmd_resolve` command is executed successfully **when** it posts a confirmation comment back to the Jira ticket **then** the confirmation comment content and format are unchanged from the pre-fix behaviour.

6. **Given** a `### Q[N]:` block in `## Design Decisions` has no `**Recommendation**:` line **when** `cmd_resolve` appends the `Decision:` line for that block **then** the `Decision:` line is still written correctly and no placeholder or crash occurs (graceful degradation).

7. **Given** the SCRUM-5 fixture (`docs/features/SCRUM-5/requirements.md` with three structured `### Q[N]:` blocks + the corresponding Jira comment with `Q1: Left slide-in`, `Q2: Horizontal scroll — all chips visible`, `Q3: Apply`) **when** `cmd_resolve` is run against this fixture **then** each `### Q[N]:` block gains a `Decision:` line, all `Option[N]:` lines and `**Recommendation**:` text are preserved, and the output matches the canonical format in `docs/features/SCRUM-5/requirements.md`.

---

## Constraints

- **No changes to the agentic workflow orchestration**: the round-counter, Jira comment posting, and transition logic that exist in `cmd_resolve` today must not be modified. Only the question-block matching and `Decision:` line insertion are in scope.
- **Single section heading `## Design Decisions`**: emitted by the requirements-agent and unchanged throughout the ticket lifecycle — `cmd_resolve` never renames or replaces the section, only appends `Decision:` lines within it.
- **Gate check update**: the gate check must change from "does `## Open Questions` heading exist?" to "do any `### Q[N]:` blocks lack a `Decision:` line?" — this is required to preserve equivalent blocking behaviour.
- **Bash only**: `cmd_resolve` lives in `scripts/ai-dev.sh`; the fix must stay in bash using only POSIX tools (`awk`, `sed`, `grep`) — no new npm packages, no separate TypeScript files.
- **Test coverage**: the updated bash logic must be exercised by the SCRUM-5 fixture acceptance test (AC#7); partial-answer and missing-recommendation paths must be explicitly covered.
- **Max function length**: each new or modified bash function must be ≤ 30 lines; extract helpers as needed (per CLAUDE.md code standards).

---

## Edge Cases

1. **Partial PO answers**: The PO's Jira comment answers Q1 and Q3 but omits Q2. `cmd_resolve` must append `Decision:` only to Q1 and Q3 blocks; the Q2 block must remain in `## Design Decisions` with no `Decision:` line, and the gate check must recognise Q2 as still pending.

2. **Mismatched question numbering**: The `requirements.md` contains Q1–Q3, but the PO's Jira comment uses a typo (`Q 2:` or `q2:`). The parser must handle case-insensitive and whitespace-tolerant matching (e.g. `Q2`, `q2`, `Q 2`) without silently dropping the answer.

3. **Multi-line question body**: A `### Q[N]:` block with a context sentence, multiple `Option[N]:` lines, and a `**Recommendation**:` line spans multiple lines. The parser must treat everything between one `### Q[N]:` heading and the next `### Q` heading (or end of section) as a single block and append `Decision:` after the last line of that block — not after the heading line.

4. **Question block with no `Option[N]:` lines**: A `### Q[N]:` block with only a title and `**Recommendation**:` (no explicit options) must still accept a `Decision:` line without crashing or emitting placeholder text.

5. **`## Design Decisions` section absent from `requirements.md`**: If a `requirements.md` was generated by an older requirements-agent that emits `## Open Questions` instead, `cmd_resolve` must detect this and exit with a clear error message instructing the operator to re-run the requirements-agent to produce the structured format before resolving.

6. **Concurrent Jira comment replies**: The PO posts two sequential comments with overlapping Q answers (e.g. comment 1 answers Q1–Q2, comment 2 revises Q1). `cmd_resolve` must apply the most recent answer for Q1 and must not append a second `Decision:` line to the Q1 block if one already exists (overwrite, not duplicate).

---

## Out of Scope

- Changes to the **design-agent** or **code-agent** that consume `requirements.md` — they read the file as free-text LLM context and will understand the enriched `## Design Decisions` format without modification.
- UI or API changes to the Jira integration (the Jira MCP tools and comment retrieval are unchanged).
- Adding new question fields beyond the four specified (question title, options, PO answer, recommendation) — e.g. timestamps, voter names, rationale narratives.
- Retroactive migration of already-resolved Design Decisions in existing `requirements.md` files for other tickets — only newly run `cmd_resolve` invocations produce the enriched format.
- Changes to `apps/vyasa-rag-service/`, `apps/vyasa-ui/`, `infra/`, or any AWS infrastructure.

---

## Affected Services

- **`scripts/ai-dev.sh` — `cmd_resolve()` bash function (~line 794)** — Primary locus of the fix. `Decision:` line insertion logic, updated gate check, and partial-answer handling all live here. No new files needed.
- **`agents/requirements-agent/instructions.md`** — The `## Open Questions` section template must be replaced with the structured `## Design Decisions` format (`### Q[N]:`, `Option[N]:`, `**Recommendation**:`) so that newly generated `requirements.md` files have structured input for `cmd_resolve`.
- **`docs/features/SCRUM-*/requirements.md` (artefact format)** — The `## Design Decisions` section is now the single source of truth across the full lifecycle (pre- and post-resolution). Existing tickets with the old format are not retroactively migrated.
- **`docs/features/SCRUM-5/` (test fixture)** — SCRUM-5's `requirements.md` must be updated to the structured `## Design Decisions` format with three `### Q[N]:` blocks as the expected post-`cmd_resolve` fixture.

---

## Design Decisions

### Q1: Where does cmd_resolve live?

The `.claude/agents/` directory does not exist; the correct file must be confirmed before implementation begins.
Option1: Bash function in `scripts/ai-dev.sh`
Option2: Separate skill or agent definition file outside the repo
**Recommendation**: Confirm by grepping `cmd_resolve` across the repository before starting implementation.
Decision: `scripts/ai-dev.sh` — `cmd_resolve()` bash function at ~line 794, dispatched via `resolve) cmd_resolve ;;` at ~line 1304.

### Q2: Canonical Open Questions format emitted by requirements-agent?

Are options pipe-delimited, bulleted sub-items, or prose-embedded? The parser must handle what is actually produced.
Option1: Define a new structured format (`### Q[N]:`, `Option[N]:`, `**Recommendation**:`) and update the requirements-agent template
Option2: Parse the existing prose format and extract options heuristically
**Recommendation**: Option1 — structured fields are unambiguous and make the bash parser trivial; the requirements-agent template change is minimal.
Decision: Option1 — new structured `## Design Decisions` format adopted; requirements-agent template updated as part of this fix.

### Q3: Does the design-agent parse Design Decisions structurally or as free text?

Confirming this ensures the chosen format does not break downstream parsing.
Option1: Heading/field detection (programmatic parsing)
Option2: Free-text LLM context (whole file read as prompt input)
**Recommendation**: Verify by reading `agents/design-agent/instructions.md` before finalising format.
Decision: Free-text LLM context — `agents/design-agent/instructions.md` reads `requirements.md` as primary LLM input with no programmatic parsing; enriched format is safe.
