# SDD ledger — plan: docs/superpowers/plans/2026-10-08-p0-first-use-collection-recovery.md

Baseline: 038f852; core tests/test.cjs passed on 2026-10-08.
Execution: user accepted recommended inline implementation.
Ruling: managed worktree created but filesystem denied writes; using current workspace on codex/p0-collection-recovery, per worktree skill fallback. No real browser registration changes.
Ruling: bundled node via PATH replaces missing native/bin/node.exe for development checks; installer engine pins are unchanged.
Ruling: use this persistent ledger and checked plan on Windows instead of Bash-only skill scripts; same task/verification record without introducing shell dependencies.
Pre-flight: tasks 1/5 share code/error/retryable/details; task 2/3 share diagnostics checks and actual Native Messaging; task 4 reuses session URL routing and exclusive queue. No conflicting signatures.

- [ ] Task 1: structured recovery
- [ ] Task 2: setup diagnostics
- [ ] Task 3: connection UI
- [ ] Task 4: unified collection
- [ ] Task 5: contextual recovery UI
- [ ] Task 6: release documentation and verification
