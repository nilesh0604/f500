# Phase 3 Implementation Checklist

## Overview

Phase 3 involves implementing the remaining 11 stub commands in the TypeScript CLI migration. These commands are split between Pipeline Steps (Phase 3) and Fix & Deploy Commands (Phase 4).

## Current Status

- **Phase 1**: ✅ Complete (Scaffold & Plumbing)
- **Phase 2**: ✅ Complete (Core Modules - 100 tests passing)
- **Phase 3**: 🔄 In Progress (11 stub commands to implement)
- **Phase 4**: 🔄 In Progress (Fix & Deploy commands)

## Implementation Priority

### Phase 3 - Pipeline Steps (8 commands)

These should be implemented in dependency order:

1. **help** - Already implemented ✅
2. **init** - Already implemented ✅
3. **status** - Already implemented ✅
4. **create** - Stub - Priority: HIGH
5. **requirements** - Stub - Priority: HIGH (depends on create)
6. **resolve** - Stub - Priority: HIGH (depends on requirements)
7. **design** - Stub - Priority: MEDIUM (depends on requirements)
8. **code-impl** - Stub - Priority: MEDIUM (depends on design)
9. **code-test** - Stub - Priority: MEDIUM (depends on code-impl)
10. **code-quality** - Stub - Priority: LOW
11. **code-security** - Stub - Priority: LOW
12. **code-perf** - Stub - Priority: LOW
13. **code** (alias) - Stub - Priority: LOW
14. **validate** - Stub - Priority: LOW

### Phase 4 - Fix & Deploy Commands (6 commands)

These can be implemented in parallel after core pipeline steps:

1. **fix-lint** - Stub
2. **fix-types** - Stub
3. **fix-tests** - Stub
4. **fix-build** - Stub
5. **fix-security** - Stub
6. **fix-conflicts** - Stub
7. **ci-status** - Stub
8. **deploy-pr** - Stub
9. **deploy-ship** - Stub

## Implementation Guidelines

### For Each Command

1. **Locate bash equivalent** in `scripts/ai-dev.sh`
2. **Extract core logic** - Identify CLI calls, file operations, and API interactions
3. **Port to TypeScript** - Use existing modules (http, jira-client, git, etc.)
4. **Write tests** - Follow existing test patterns in `__tests__` directory
5. **Verify feature parity** - Compare output with bash version

### Key Dependencies

- `create` → `requirements` → `resolve` (sequential dependency chain)
- `requirements` → `design` → `code-impl` → `code-test` (sequential)
- Fix commands can be implemented independently
- Deploy commands depend on git and CI status modules

## Test Strategy

- Unit tests for each command in `__tests__/steps/`
- Mock external dependencies (Jira, GitHub, file system)
- Validate command-line argument parsing
- Test error handling and edge cases

## Estimated Effort

- **Pipeline Steps**: 4-6 hours (8 commands)
- **Fix & Deploy**: 3-4 hours (6 commands)
- **Total**: 7-10 hours

## Next Steps

1. Start with `create` command (highest priority)
2. Implement the requirements→resolve dependency chain
3. Move to design→code-impl→code-test chain
4. Implement fix commands in parallel
5. Finish with deploy commands

## Success Criteria

- All 15 stub commands implemented
- 100% test coverage for new commands
- Feature parity with bash version verified
- Integration smoke test passes end-to-end
