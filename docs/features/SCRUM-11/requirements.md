# Requirements — SCRUM-11: fix(ai-dev): preserve full Open Questions context in Design Decisions section of requirements.md

## Status: Draft

---

## Problem Statement

When the `cmd_resolve` command writes resolved design decisions back to `requirements.md`, it discards all context from the original Open Question — the question text, the list of options, and the agent's recommendation — and records only the PO's short answer (e.g. `- **Q1 Decision**: Left slide-in`). Future readers, including downstream agents (design-agent, code-agent) and human engineers auditing design rationale, cannot understand _why_ a decision was made without that context, undermining the value of the agentic SDLC audit trail.

---

## User Stories

- As a **design-agent**, I want each resolved Design Decision entry in `requirements.md` to contain the original question text, offered options, PO answer, and agent recommendation so that I can generate technically coherent design documents without needing to re-examine Jira comments.
- As a **human engineer reviewing a PR**, I want to read the Design Decisions section of `requirements.md` and immediately understand what was decided and why, without navigating to Jira to find the original question thread.
- As an **auditor or future maintainer**, I want an immutable, self-contained record of every design choice (including the options considered and the recommendation) so that I can reconstruct the decision context months after the fact.
- As a **requirements-agent operator**, I want the existing `cmd_resolve` round-counter logic, gate check, and Jira confirmation comment to remain untouched so that the wider agentic workflow does not regress.

---

## Acceptance Criteria

1. **Given** a `requirements.md` with a populated `## Open Questions` section containing at least one question block (question text, labelled options, and an agent recommendation) **when** `cmd_resolve` processes a matching Jira comment where the PO has answered each question **then** the `## Design Decisions (resolved)` section of `requirements.md` is updated so that each entry contains: the original question title/text, all offered options, the PO's chosen answer (clearly labelled), and the agent's recommendation.

2. **Given** a resolved Design Decision entry was written by `cmd_resolve` **when** a human or agent reads `requirements.md` **then** the entry follows the canonical format:

   ```
   ### Q[N]: [Question title]
   **Decision**: [PO answer]
   **Options**: [Option A] · [Option B] · ...
   **Recommendation**: [Agent recommendation text]
   ```

   with no raw markdown or unparsed fragments remaining.

3. **Given** the `cmd_resolve` command is executed successfully **when** the `## Open Questions` section is replaced **then** the round counter in `.questions-round` is incremented correctly (existing behaviour preserved, no regression).

4. **Given** the `cmd_resolve` command is executed successfully **when** all questions have been answered **then** the gate check (blocking downstream design-agent if open questions remain) behaves identically to the pre-fix behaviour.

5. **Given** the `cmd_resolve` command is executed successfully **when** it posts a confirmation comment back to the Jira ticket **then** the confirmation comment content and format are unchanged from the pre-fix behaviour.

6. **Given** a question block in `## Open Questions` has no explicit recommendation field **when** `cmd_resolve` processes the PO's answer for that question **then** the `**Recommendation**` line is omitted from the resolved entry (graceful degradation — no crash, no placeholder text).

7. **Given** the SCRUM-5 fixture (`docs/features/SCRUM-5/requirements.md` + the corresponding Jira comment with `Q1: Left slide-in`, `Q2: Horizontal scroll — all chips visible`, `Q3: Apply`) **when** `cmd_resolve` is run against this fixture **then** the resulting `## Design Decisions (resolved)` section contains the full context for all three questions (text, options, recommendation, PO answer) matching the expected canonical format.

---

## Constraints

- **No changes to the agentic workflow orchestration**: the round-counter, gate logic, and Jira comment posting that exist in `cmd_resolve` today must not be modified. Only the question-block parsing and the decision-entry serialisation are in scope.
- **Backward-compatible `requirements.md` format**: the downstream design-agent (and code-agent) parse `requirements.md` using section heading detection (`## Design Decisions (resolved)`). The heading itself must not change; only the body of each decision entry expands.
- **TypeScript strict mode**: any implementation files must compile under `noImplicitAny`, `strictNullChecks`, and `noUnusedLocals` (per root `tsconfig.base.json`).
- **No new npm packages**: the parsing logic must use only existing project dependencies (string manipulation, regex, or existing markdown utilities already present in the repository).
- **Test coverage**: the new parsing and merge logic must achieve ≥ 80% branch coverage (per project testing standards).
- **Max function length**: each new or modified function must be ≤ 30 lines; extract helpers as needed (per CLAUDE.md code standards).

---

## Edge Cases

1. **Partial PO answers**: The PO's Jira comment answers Q1 and Q3 but omits Q2. `cmd_resolve` must write resolved entries only for answered questions; Q2 must remain in `## Open Questions` as-is, with its question text, options, and recommendation intact.

2. **Mismatched question numbering**: The `requirements.md` contains Q1–Q3, but the PO's Jira comment uses Q2 as `Q2b` or provides an answer with a typo (`Q 2:` or `q2:`). The parser must handle case-insensitive and whitespace-tolerant matching (e.g. `Q2`, `q2`, `Q 2`) without silently dropping the answer.

3. **Multi-line question text or options**: A question block spanning multiple lines (e.g. a bulleted options list with sub-notes) must be captured in full as a single unit. The parser must not truncate the question body at the first newline after the question heading.

4. **Question block with no options list**: An Open Question that was written without a formal options list (only free-form text) must still produce a valid resolved entry — the `**Options**` field is omitted rather than rendering as empty or crashing.

5. **`## Design Decisions (resolved)` section absent from `requirements.md`**: If a `requirements.md` was generated before this section heading was introduced, `cmd_resolve` must create the section in the correct position in the document (after `## Out of Scope`, before `## Open Questions`) rather than appending it at the end or failing.

6. **Concurrent Jira comment replies**: The PO posts two sequential comments with overlapping Q answers (e.g. comment 1 answers Q1–Q2, comment 2 revises Q1). `cmd_resolve` must apply the most recent answer for each question number and must not duplicate entries in `## Design Decisions (resolved)`.

---

## Out of Scope

- Changes to the **requirements-agent** that generates the initial `## Open Questions` section — the format of the generated questions is assumed to remain as-is for this fix.
- Changes to the **design-agent** or **code-agent** that consume `requirements.md` — they are downstream consumers and must work with the enriched format without modification.
- UI or API changes to the Jira integration (the Jira MCP tools and comment retrieval are unchanged).
- Adding new question fields beyond the four specified (question title, options, PO answer, recommendation) — e.g. timestamps, voter names, rationale narratives.
- Retroactive migration of already-resolved Design Decisions in existing `requirements.md` files for other tickets — only newly run `cmd_resolve` invocations produce the enriched format.
- Changes to `apps/vyasa-rag-service/`, `apps/vyasa-ui/`, `infra/`, or any AWS infrastructure.

---

## Affected Services

- **`.claude/` (agentic toolchain — skill/command files)** — `cmd_resolve` (or equivalent agent/skill definition) is the primary locus of the fix. The question-block parser and decision-entry serialiser live here. Exact file path TBD at design time (no `.claude/agents/` directory was found in the working tree; the skill may reside in Claude Code settings, a custom skill file, or an inline command definition).
- **`docs/features/SCRUM-*/requirements.md` (artefact format)** — The schema for `## Design Decisions (resolved)` entries expands. Existing resolved entries are not retroactively modified, but any `requirements.md` that goes through `cmd_resolve` after this fix will emit the enriched format.
- **`docs/features/SCRUM-5/` (test fixture)** — Used as the acceptance test fixture. The SCRUM-5 `requirements.md` and its corresponding Jira Q&A comment (Q1: Left slide-in, Q2: Horizontal scroll, Q3: Apply) must be reproducible by the fixed `cmd_resolve` with correct enriched output.

---

## Open Questions

- Where exactly does `cmd_resolve` live in the repository? The `.claude/agents/` directory does not exist in the working tree; identifying the correct file (skill definition, inline command, or external script) is a prerequisite for design.
- What is the canonical source of truth for the Open Questions format emitted by the requirements-agent? Specifically: are options always on a single line (`Left slide-in | Bottom sheet`), bulleted (`- Option A`), or both? The parser must handle the format(s) actually produced.
- When the design-agent reads the enriched `## Design Decisions (resolved)` section, does it parse it via heading/field detection or treat it as free text? Confirming this ensures the canonical format chosen here does not break downstream parsing.
