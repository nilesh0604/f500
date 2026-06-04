# Requirements Document

## Introduction

This feature establishes a validation and testing capability for the AI-DLC pipeline implemented in `scripts/ai-dev.sh` — a ~3,100-line Bash orchestrator ("Vyasa AI Dev") that drives an async, Jira-backed AI development workflow. The script has no existing test harness, no static analysis gate, and no specification of expected behavior, yet it contains substantial pure-logic that is testable in isolation (markdown stripping, open-question detection, Design-Decision parsing, PO answer parsing, CI status classification, gated state-machine prerequisites, retry caps, and argument dispatch).

The goal is to (a) introduce a repeatable Bash test harness that isolates the script from real network/git/filesystem side effects by stubbing external CLIs (`gh`, `aws`, `curl`, `git`, `codemie-claude`/`claude`) while using the real `jq`; (b) add a static-analysis gate via `shellcheck`; (c) write unit and integration tests covering the testable logic units; (d) make the script source-able so its functions can be tested without triggering the dispatch block; and (e) surface and remediate defects the tests reveal without changing the script's intended behavior.

The validation effort treats `scripts/ai-dev.sh` as the System Under Test (SUT). It does not require live Jira, GitHub, or AWS access, and it must not perform real deployments, real git pushes, or real network calls.

## Glossary

- **SUT (System Under Test)**: The `scripts/ai-dev.sh` Bash script and its functions.
- **Test_Harness**: The collection of test files, helper scripts, and configuration that drives automated testing of the SUT.
- **Test_Runner**: The command/entry point that executes the full test suite (unit + integration + static analysis) and reports an aggregate pass/fail result.
- **Mock_Layer**: A set of executable stub programs placed first on `PATH` that impersonate external CLIs (`gh`, `aws`, `curl`, `git`, `codemie-claude`/`claude`) and return scripted output without performing real side effects.
- **Static_Analyzer**: The `shellcheck` tool invoked against `scripts/ai-dev.sh`.
- **Unit_Test_Suite**: Tests that exercise individual SUT functions in isolation after sourcing the SUT.
- **Integration_Test_Suite**: Tests that invoke SUT subcommands end-to-end with the Mock_Layer active.
- **Source_Guard**: A conditional in the SUT that prevents the dispatch `case` block from executing when the script is sourced (rather than executed) by the Test_Harness.
- **Sandbox**: A throwaway temporary directory used as the working directory and feature-directory root for a single test, isolating it from the real repository.
- **Testable_Function**: A pure-logic SUT function whose output is fully determined by its inputs and local files, requiring no real network/git access (e.g., `strip_markdown`, `has_unresolved_questions`, `get_ci_status`, `classify_ci_failure`, `is_gated_step`, `get_subtask_key`, `save_subtask_key`).
- **Feature_Dir**: The per-ticket state directory the SUT uses: `docs/features/<TICKET_ID>/`.
- **Subtask_Store**: The `.jira-subtasks` file mapping pipeline step names to Jira subtask keys (`step=KEY` lines).
- **CI_Status**: The classification of a pull request's continuous-integration result produced by `get_ci_status`: one of `success`, `failure`, `pending`, `unknown`.
- **Failure_Type**: The classification of a CI failure produced by `classify_ci_failure`: one of `lint`, `types`, `tests`, `build`, `security`, `conflicts`, `unknown`.
- **Retry_Cap**: The maximum number of automated fix attempts (3) allowed per Failure_Type in `deploy-ship`, tracked in `.fix_retries.json`.
- **Gated_Step**: A pipeline step that requires the prior subtask to be "Done" before it may run (members of `GATED_STEPS`).
- **Defect_Log**: A record of behavioral defects discovered by the Test_Harness, including the failing input, expected behavior, and actual behavior.

## Requirements

### Requirement 1: Test Harness and Mock Layer

**User Story:** As a developer maintaining the AI-DLC pipeline, I want a Bash test harness with mocked external tools, so that I can test `ai-dev.sh` deterministically without hitting Jira, GitHub, AWS, or the real git repository.

#### Acceptance Criteria

1. THE Test_Harness SHALL execute on the repository's existing toolchain using a documented test framework (bats-core) declared as a project dependency.
2. WHEN the Test_Runner executes, THE Mock_Layer SHALL place stub executables for `gh`, `aws`, `curl`, `git`, and the configured Claude CLI ahead of the real executables on `PATH`.
3. WHILE a test is running, THE Mock_Layer SHALL prevent the SUT from performing real network requests, real git mutations, and real deployments.
4. WHILE a test is running, THE Mock_Layer SHALL permit read-only git operations (such as reading the current branch or commit) while preventing git operations that mutate repository state.
5. WHEN a test executes the SUT, THE Test_Harness SHALL set the working directory and `Feature_Dir` root to a Sandbox unique to that test.
6. WHEN a test completes, THE Test_Harness SHALL remove the Sandbox created for that test.
7. THE Test_Harness SHALL use the real `jq` binary for JSON operations.
8. WHERE a stubbed CLI is invoked by the SUT, THE Mock_Layer SHALL return output and an exit code defined by the active test case.

### Requirement 2: Source Guard for Function-Level Testing

**User Story:** As a test author, I want to source `ai-dev.sh` and call its functions directly, so that I can unit-test pure logic without triggering the command dispatch block.

#### Acceptance Criteria

1. WHEN the SUT is sourced by another script, THE Source_Guard SHALL prevent the dispatch `case` block from executing.
2. WHEN the SUT is executed directly as a program, THE SUT SHALL dispatch to the subcommand handler exactly as it does today.
3. WHEN the SUT is sourced, THE SUT SHALL make its Testable_Functions available for invocation by the caller.
4. WHEN the SUT is executed directly as a program, THE SUT SHALL also define its Testable_Functions so they are available to any code running in the same process.
5. THE Source_Guard SHALL preserve the SUT's existing `set -euo pipefail` behavior when the SUT is executed directly.

### Requirement 3: Static Analysis Gate

**User Story:** As a developer, I want `ai-dev.sh` checked by a shell linter, so that latent shell defects (unquoted expansions, portability issues, masked exit codes) are surfaced.

#### Acceptance Criteria

1. WHEN the Test_Runner executes, THE Static_Analyzer SHALL run `shellcheck` against `scripts/ai-dev.sh`.
2. IF `shellcheck` reports findings at or above a configured severity threshold that are not suppressed, THEN THE Test_Runner SHALL report the static-analysis step as failed and list each finding.
3. WHERE a specific `shellcheck` finding is reviewed and accepted, THE Static_Analyzer SHALL support suppressing that finding by an inline directive or a documented configuration entry.
4. WHEN every finding at or above the configured severity threshold is suppressed, THE Test_Runner SHALL report the static-analysis step as passed.

### Requirement 4: Markdown Stripping Logic

**User Story:** As a developer, I want `strip_markdown` validated, so that text posted to Jira ADF comments is reliably plain.

#### Acceptance Criteria

1. WHEN `strip_markdown` receives text containing bold (`**x**`), italic (`*x*`), or inline-code (`` `x` ``) markers, THE Unit_Test_Suite SHALL assert the markers are removed and the inner content is preserved.
2. WHEN `strip_markdown` receives heading lines (`#`, `##`, `###`) and `### Q<N>:` lines, THE Unit_Test_Suite SHALL assert heading prefixes are removed and `### Q<N>:` becomes `Q<N>:`.
3. WHEN `strip_markdown` receives text containing no markdown tokens, THE Unit_Test_Suite SHALL assert the output is exactly equal to the input.

### Requirement 5: Open-Question Detection Logic

**User Story:** As a developer, I want `has_unresolved_questions` validated including its inverted exit convention, so that the requirements/design gate behaves correctly.

#### Acceptance Criteria

1. WHEN a requirements file contains a legacy `## Open Questions` section, THE Unit_Test_Suite SHALL assert `has_unresolved_questions` reports "unresolved present" (exit code 0).
2. WHEN a requirements file contains a `## Design Decisions` section with at least one `### Q<N>:` block lacking a `Decision:` line, THE Unit_Test_Suite SHALL assert `has_unresolved_questions` reports "unresolved present" (exit code 0).
3. WHEN every `### Q<N>:` block under `## Design Decisions` has a `Decision:` line, THE Unit_Test_Suite SHALL assert `has_unresolved_questions` reports "all resolved" (exit code 1).
4. WHEN a requirements file contains no question section, THE Unit_Test_Suite SHALL assert `has_unresolved_questions` reports "all resolved" (exit code 1).

### Requirement 6: Design-Decision Answer Parsing Logic

**User Story:** As a developer, I want the `resolve` answer-application logic validated, so that Product Owner answers are correctly inserted as `Decision:` lines and the round counter advances.

#### Acceptance Criteria

1. WHEN PO answers in `Q<N>: <text>` form are applied to a `## Design Decisions` block, THE Unit_Test_Suite SHALL assert a `Decision: <text>` line is inserted into the matching `### Q<N>:` block while other block fields are preserved.
2. WHEN an answer line uses tolerant formatting (extra whitespace or lowercase `q`, e.g. `q 2 :`), THE Unit_Test_Suite SHALL assert the answer is matched to the correct question number.
3. WHEN a `### Q<N>:` block already contains a `Decision:` line and a new answer for `Q<N>` is provided, THE Unit_Test_Suite SHALL assert the new answer overwrites the prior `Decision:` line.
4. WHEN the resolve logic processes a file and unresolved questions remain afterward, THE Unit_Test_Suite SHALL assert the `.questions-round` counter increments by one.
5. WHEN the resolve logic processes a file and no unresolved questions remain afterward, THE Unit_Test_Suite SHALL assert the file is reported as fully resolved.

### Requirement 7: CI Status and Failure Classification Logic

**User Story:** As a developer, I want `get_ci_status` and `classify_ci_failure` validated against representative `gh` output, so that `deploy-ship` routes failures to the correct fixer.

#### Acceptance Criteria

1. WHEN `gh pr checks` output contains a failing check, THE Unit_Test_Suite SHALL assert `get_ci_status` returns `failure`.
2. WHEN `gh pr checks` output contains only pending/in-progress/queued checks, THE Unit_Test_Suite SHALL assert `get_ci_status` returns `pending`.
3. WHEN `gh pr checks` produces no output, THE Unit_Test_Suite SHALL assert `get_ci_status` returns `unknown`.
4. WHEN `gh pr checks` output contains only passing checks, THE Unit_Test_Suite SHALL assert `get_ci_status` returns `success`.
5. WHEN a failing check name matches a known category (lint, types, tests, build, security), THE Unit_Test_Suite SHALL assert `classify_ci_failure` returns the corresponding Failure_Type.
6. WHEN no failing check name matches a known category and `gh pr view` reports a conflicting merge state, THE Unit_Test_Suite SHALL assert `classify_ci_failure` returns `conflicts`.
7. WHEN no failing check name matches a known category and the merge state is not conflicting, THE Unit_Test_Suite SHALL assert `classify_ci_failure` returns `unknown`.

### Requirement 8: Subtask Store and Gated-Step Logic

**User Story:** As a developer, I want the `.jira-subtasks` key store and gating helpers validated, so that step-to-subtask mapping and gate membership are reliable.

#### Acceptance Criteria

1. WHEN `save_subtask_key` is called for a step not already present, THE Unit_Test_Suite SHALL assert a new `step=KEY` line is appended to the Subtask_Store.
2. WHEN `save_subtask_key` is called for a step already present, THE Unit_Test_Suite SHALL assert the existing line's value is replaced and no duplicate line is created.
3. WHEN `get_subtask_key` is called for a stored step, THE Unit_Test_Suite SHALL assert the previously stored key is returned.
4. WHEN `get_subtask_key` is called for an absent step or a missing Subtask_Store, THE Unit_Test_Suite SHALL assert an empty result is returned.
5. WHEN `is_gated_step` is called with a member of `GATED_STEPS`, THE Unit_Test_Suite SHALL assert it reports membership (exit code 0); WHEN called with a non-member, THE Unit_Test_Suite SHALL assert it reports non-membership (exit code 1).
6. FOR ALL steps, saving a key and then retrieving it SHALL return the saved key (round-trip property).

### Requirement 9: Prerequisite State-Machine Logic

**User Story:** As a developer, I want `check_prerequisite` validated, so that each pipeline step refuses to run until its predecessor is "Done" and required markers/conditions are satisfied.

#### Acceptance Criteria

1. WHEN `check_prerequisite` is called for a Gated_Step whose predecessor subtask status is not "Done", THE Integration_Test_Suite SHALL assert the SUT prints an error and exits non-zero.
2. WHEN `check_prerequisite` is called for a Gated_Step whose predecessor subtask status is "Done" and required marker conditions are satisfied, THE Integration_Test_Suite SHALL assert the prerequisite check passes.
3. WHEN `check_prerequisite design` runs and `requirements.md` contains unresolved questions, THE Integration_Test_Suite SHALL assert the SUT prints an error and exits non-zero.
4. WHEN `check_prerequisite validate` or `check_prerequisite deploy-pr` runs and the `.validate-passed` marker is absent, THE Integration_Test_Suite SHALL assert the SUT prints an error and exits non-zero.
5. WHEN `check_prerequisite deploy-ship` runs and the `.pr_number` file is absent, THE Integration_Test_Suite SHALL assert the SUT prints an error and exits non-zero.

### Requirement 10: Deploy-Ship Retry Cap Logic

**User Story:** As a developer, I want the `deploy-ship` retry cap validated, so that automated fixes stop after 3 attempts per failure type and the subtask is marked blocked.

#### Acceptance Criteria

1. WHEN `deploy-ship` encounters a CI failure and no `.fix_retries.json` exists, THE Integration_Test_Suite SHALL assert the retry-tracking file is initialized with all Failure_Types at count 0.
2. WHEN `deploy-ship` encounters a CI failure, THE SUT SHALL evaluate retry conditions in sequence: first initialize `.fix_retries.json` if it is missing, then read the recorded count for the Failure_Type, then either increment-and-fix (if below the Retry_Cap) or hard-block (if at or above the Retry_Cap).
3. WHEN a Failure_Type's recorded retry count is below the Retry_Cap, THE Integration_Test_Suite SHALL assert the count is incremented before the corresponding fix is attempted.
4. WHEN a Failure_Type's recorded retry count is exactly at the Retry_Cap (3) or higher, THE Integration_Test_Suite SHALL assert `deploy-ship` reports a hard block, sets the subtask to "Blocked", and exits non-zero without attempting another fix.

### Requirement 11: Argument Dispatch Logic

**User Story:** As a developer, I want the SUT's argument dispatch validated, so that invalid or missing input produces predictable help/error output.

#### Acceptance Criteria

1. WHEN the SUT is executed with no arguments, THE Integration_Test_Suite SHALL assert help text is printed and the exit code is 0.
2. WHEN the SUT is executed with a ticket ID but an unrecognized subcommand, THE Integration_Test_Suite SHALL assert an "Unknown subcommand" message and help text are printed and the exit code is non-zero.
3. WHEN the SUT is executed with `help`, `--help`, or `-h` as the subcommand, THE Integration_Test_Suite SHALL assert help text is printed and the exit code is 0.
4. WHEN the SUT is executed with the deprecated `test` subcommand, THE Integration_Test_Suite SHALL assert a deprecation warning is printed and the validate flow is invoked; the validate flow MAY also be invoked by any other subcommand that delegates to it.

### Requirement 12: Aggregate Test Reporting

**User Story:** As a developer, I want a single command that runs all checks and reports results, so that I can validate the pipeline locally and in CI.

#### Acceptance Criteria

1. WHEN the Test_Runner is invoked, THE Test_Runner SHALL execute the Static_Analyzer, the Unit_Test_Suite, and the Integration_Test_Suite.
2. WHEN all checks pass, THE Test_Runner SHALL exit with code 0.
3. IF any check fails, THEN THE Test_Runner SHALL exit with a non-zero code and report which check(s) failed.
4. THE Test_Runner SHALL produce per-test pass/fail output identifying each executed test by name.

### Requirement 13: Defect Surfacing and Remediation

**User Story:** As a developer, I want defects discovered by tests to be recorded and fixed, so that validation improves the script's correctness rather than only describing it.

#### Acceptance Criteria

1. WHEN a test reveals a behavioral defect in the SUT, THE Defect_Log SHALL record the failing input, the expected behavior, and the observed behavior.
2. WHEN a recorded defect is remediated in the SUT, THE corresponding test SHALL pass without any weakening of the assertion that exposed the defect.
3. WHILE remediating a defect, THE remediation SHALL preserve the SUT's documented external behavior for all currently passing tests.
