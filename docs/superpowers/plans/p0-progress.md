# SDD ledger — plan: docs/superpowers/plans/2026-10-08-p0-first-use-collection-recovery.md

Baseline: 038f852; core tests/test.cjs passed on 2026-10-08.
Execution: user accepted recommended inline implementation.
Ruling: managed worktree created but filesystem denied writes; using current workspace on codex/p0-collection-recovery, per worktree skill fallback. No real browser registration changes.
Ruling: bundled node via PATH replaces missing native/bin/node.exe for development checks; installer engine pins are unchanged.
Ruling: use this persistent ledger and checked plan on Windows instead of Bash-only skill scripts; same task/verification record without introducing shell dependencies.
Pre-flight: tasks 1/5 share code/error/retryable/details; task 2/3 share diagnostics checks and actual Native Messaging; task 4 reuses session URL routing and exclusive queue. No conflicting signatures.

- [x] Task 1: structured recovery
- [x] Task 2: setup diagnostics
- [x] Task 3: connection UI
- [x] Task 4: unified collection
- [x] Task 5: contextual recovery UI
- [x] Task 6: release documentation and verification

Task 1/2/3: complete in 3bcf225; recovery.cjs, diagnostics.ps1, connection.cjs, core test.cjs and manager SelfTest passed. New PowerShell sources require UTF-8 BOM for Windows PowerShell 5.1 (verified after correcting parser failure).
Task 4/5: collect.cjs and collect-ui.cjs RED→GREEN, interrupted enqueue regression RED→GREEN; recovery-ui.cjs RED→GREEN. app, easy-download, task-controls, task-loading, gallery-ui, audio-ui, interface-layout and core tests passed. tasks.ps1, transfer-recovery.ps1 and queue.ps1 passed.
Ruling: recovery-page observes existing error nodes to share rendering without changing each page state machine; structured fields remain on direct native/worker responses and task cards.
Ruling: shell baseline lacked Playwright module lookup; use bundled NODE_PATH with installed Chrome; no dependencies installed.
Showcase test needs local preview server; initial run failed connection-refused, will run with server.

Final review: independent gpt-6-astra reviewer completed. All six actionable findings fixed in one pass, with failing regression observed before fixes: busy context replacement (collect-ui), config-independent handshake (connection), exact launcher/actual-host diagnostics (diagnostics.ps1), failed-only batch retry and redaction (easy-download), structured error preservation (recovery-ui). No deferred findings.
Final suite: 15 Node suites passed (recovery, connection, collect, app, native-diagnostics, test, collect-ui, recovery-ui, easy-download, task-controls, task-loading, gallery-ui, audio-ui, interface-layout, showcase); diagnostics, manager SelfTest, tasks, transfer-recovery and queue PowerShell suites passed; all PowerShell 5.1 scripts parse. adaptive, queue-watch and tls-retry passed; task-cancel passed outside sandbox (process-control sandbox limitation, no implementation change).
Real clean public install passed: fixed engine downloads and SHA-256, all 5 executable versions, native protocol, retained settings/tasks, multiple IDs and corrupted-engine rejection; SkipRegistration used throughout. Package source audit passed.
Ruling: explicit UTF-8 JSON reads added to setup/repair/package after actual PowerShell 5.1 packaging failure; avoids corrupted Chinese paths. No new dependency or permissions.
Ruling: source worktree branch retained, no merge/push/GitHub publication; unused managed worktree archived. Installation is delivered as local setup ZIP.
