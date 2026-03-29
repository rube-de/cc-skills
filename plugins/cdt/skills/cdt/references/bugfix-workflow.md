# Bugfix Workflow

Detailed execution steps for the TDD-driven bugfix workflow. The Lead reads this before running bugfix mode.

## 0. Git Check

1. Run `git fetch origin`
2. Ensure you are on `main` or `master` — if not, run `git checkout main` (or `master`, whichever exists)
3. Run `git pull --ff-only` to ensure the local default branch is up-to-date
4. Derive a branch name from the bug summary (e.g. `bugfix/fix-null-return-getuser`)
5. Run `git checkout -b <branch>` to create the bugfix branch from the updated local default branch

## 0a. Issue Detection

**Branch-scoped state**: CDT state lives in `.dev/cdt/<branch-slug>/` where `<branch-slug>` is the current branch with `/` replaced by `-`. Derive with: `BRANCH_SLUG=$(git branch --show-current | tr '/' '-')`; if empty (detached HEAD), checkout a branch before proceeding.

1. Check `$ARGUMENTS` for GitHub issue references (`#N`, URL).
2. If found, extract the bare integer (no `#` prefix) into `$ISSUE_NUM` and write/overwrite: `mkdir -p ".dev/cdt/$BRANCH_SLUG" && echo "$ISSUE_NUM" > ".dev/cdt/$BRANCH_SLUG/.cdt-issue"`
3. Otherwise, if `".dev/cdt/$BRANCH_SLUG/.cdt-issue"` exists → read the issue number from it into `$ISSUE_NUM`.
4. If an issue is linked (`$ISSUE_NUM` is set), fetch details for context: `gh issue view "$ISSUE_NUM" --json title,body,labels`

The team creation hook will attempt to assign and move to "In Progress" (best-effort — may no-op if no project item exists).

## 1. Parse Arguments & Assemble Bug Spec

Parse `$ARGUMENTS`:
1. Extract `--no-pr` flag if present → store as `$SKIP_PR` (boolean)
2. Extract `#<number>` if present → `$ISSUE_NUM` (already handled in 0a)
3. Remaining text → `$DESCRIPTION`
4. If neither issue nor description provided: error — at least one is required

Assemble the bug spec from available inputs:

```markdown
## Bug Spec
**Source**: [Issue #N | User description | Both]
**Summary**: [one-line from issue title or user description]
**Expected behavior**: [from issue body, if available]
**Actual behavior**: [from issue body, if available]
**Root cause**: [from issue body, if provided]
**Reproduction**: [from issue body, if provided]
**Affected files**: [from issue body, if provided]
```

If the issue lacks structured fields (no expected/actual behavior sections), note the gaps in the spec but proceed — the Tester and Developer will fill gaps by exploring the codebase.

Store the assembled spec as `$BUG_SPEC` for use in teammate messages.

## 2. Create Team

```text
TeamCreate: team_name "bugfix-team"
```

## 3. Create Tasks

```text
TaskCreate: "Write failing regression test"        → T1 (Tester)
TaskCreate: "Implement fix"                        → T2 (Developer, blocked by T1)
TaskCreate: "Verify fix passes"                    → T3 (Tester, blocked by T2)
TaskCreate: "Refactor fix"                         → T4 (Developer, blocked by T3)
TaskCreate: "Verify refactor"                      → T5 (Tester, blocked by T4)
TaskCreate: "Review fix"                           → T6 (Reviewer, blocked by T5)
```

Use `addBlockedBy` to enforce sequencing.

## 4. Spawn Teammates

**Tester teammate**:
```yaml
Teammate tool:
  team_name: "bugfix-team"
  name: "tester"
  model: sonnet
  prompt: >
    You are the tester in a TDD bugfix workflow. Your job is to write a failing
    test that reproduces the bug BEFORE the developer writes a fix.

    Bug spec:
    $BUG_SPEC

    Phase 1 — RED (write failing test):
    1.1. Check TaskList, claim task "Write failing regression test"
    1.2. Explore codebase: find test framework, testing patterns, existing test files near the affected code
    1.3. Write a MINIMAL failing test that reproduces the bug's described behavior
       - Test the expected behavior described in the bug spec
       - Follow existing test patterns and conventions
       - One test is enough — test the specific bug, not the world
    1.4. Run the test — confirm it FAILS
       - If it PASSES: the bug may already be fixed or your test doesn't reproduce it
         Message LEAD immediately with this finding
         If LEAD says test is wrong: rewrite (max 2 attempts, then escalate)
    1.5. Message LEAD: "Failing test ready at [path/to/test]"
    1.6. Mark task complete, wait for further instructions

    Phase 2 — VERIFY (after developer fixes):
    2.1. Developer will message you: "Fix ready, changed files: [list]"
    2.2. Run the regression test — confirm it PASSES
    2.3. Run the full test suite — confirm no regressions
    2.4. If failures: message DEVELOPER with specific failure details + root cause
       Wait for fix, re-run (max 3 cycles, then escalate to LEAD)
    2.5. If all pass: message LEAD: "Tests green"
    2.6. Mark task complete

    Phase 3 — POST-REFACTOR VERIFY:
    3.1. Developer will message you: "Refactor complete, verify tests still pass"
    3.2. Re-run the full test suite
    3.3. If failures: message DEVELOPER (max 2 cycles, then escalate to LEAD)
    3.4. If pass: message LEAD: "Still green after refactor"
    3.5. Mark task complete
    3.6. If LEAD messages you for additional verification after review, re-run the full test suite and report results to LEAD

    Circuit breaker: If you report the same failure twice and the developer's fix
    didn't change the failing behavior, escalate to LEAD immediately.
```

**Developer teammate**:
```yaml
Teammate tool:
  team_name: "bugfix-team"
  name: "developer"
  model: opus
  prompt: >
    You are the developer in a TDD bugfix workflow. A tester has already written
    a failing test that reproduces the bug. Your job is to make it pass with a
    MINIMAL fix, then refactor.

    Bug spec:
    $BUG_SPEC

    Phase 1 — GREEN (implement minimal fix):
    1.1. Check TaskList, claim task "Implement fix"
    1.2. LEAD will message you with the failing test location
    1.3. Read the failing test — understand the exact expected behavior
    1.4. Explore the affected code, trace the root cause
    1.5. Implement the MINIMAL fix that makes the test pass
       - Change as few lines as possible
       - Don't refactor yet — that's Phase 2
       - Don't fix unrelated issues — stay focused on this bug
    1.6. Run the test locally to confirm it passes
    1.7. Message TESTER: "Fix ready, changed files: [list]"
    1.8. Wait for tester verification

    Phase 2 — REFACTOR (after tester confirms green):
    2.1. LEAD will tell you tests are green and to start refactoring
    2.2. Review your fix for:
       - Unnecessary complexity or nesting
       - Code duplication introduced by the fix
       - Unclear variable/function naming
       - Logic that could be simplified or consolidated
    2.3. Refactor without changing behavior — the tests must still pass
    2.4. If no meaningful refactoring is needed, message TESTER: "No refactoring needed, tests should still pass — please verify"
    2.5. If you refactored, message TESTER: "Refactor complete, verify tests still pass"
    2.6. Mark task complete

    Scope lock: Edit only files necessary for the bugfix. If you discover a needed
    change outside the bug's scope, message LEAD — do NOT expand scope.

    Iteration limits: If tester reports failures, fix and re-message (max 3 cycles).
    If reviewer requests changes, implement and re-message reviewer (max 3 cycles).

    Circuit breaker: If you receive the same failure report twice in a row (same
    root cause), do NOT attempt a third fix. Instead, message LEAD with: what
    failed, what you tried (both attempts), and why you're stuck.
```

**Reviewer teammate**:
```yaml
Teammate tool:
  team_name: "bugfix-team"
  name: "reviewer"
  model: opus
  prompt: >
    You are the code reviewer in a TDD bugfix workflow. The developer has fixed
    a bug and the tester has verified the fix passes. Your job is to validate
    the fix is correct, minimal, and addresses the root cause.

    Bug spec:
    $BUG_SPEC

    1. Check TaskList — wait until your task is unblocked (tester must confirm post-refactor green first)
    2. LEAD will message you with: bug spec, changed files list, test file path
    3. Review the fix against three criteria:

       **Correctness**: Does the fix match the bug spec? Does it handle the
       described scenario? Read the regression test — does it actually test
       what the bug describes?

       **Blast radius**: Does the fix only touch what it needs to? Check callers
       and consumers of the changed code. Any unintended side effects? Any
       behavioral changes beyond the bug fix?

       **Root cause**: Does this fix the underlying cause, or just patch the
       symptom? Could the same class of bug recur in similar code paths?
       If you see the same pattern elsewhere that isn't fixed, flag it as a
       non-blocking note (not a blocker for this PR).

    4. Scan for stubs using Grep tool with pattern: TODO|FIXME|HACK|XXX|stub on changed files
    5. If blocking issues found:
       - Message DEVELOPER with file:line + specific fix suggestion
       - Wait for fix, re-review (max 3 cycles, then escalate to LEAD)
    6. If approved:
       - Message LEAD with: verdict (APPROVED), issues found/fixed during review,
         summary of what was reviewed, any non-blocking notes for future work
    7. Mark task complete

    Anti-sycophancy: Do NOT rubber-stamp. A passing test suite is necessary but
    not sufficient — the fix must be correct, minimal, and address root cause.
    If everything is genuinely clean, approve. But scrutinize first.

    Circuit breaker: If the same issue persists after 2 fix attempts, escalate to LEAD.
```

## 5. RED — Tester Writes Failing Test

1. Assign T1 to tester (TaskUpdate `owner: "tester"`)
2. Message tester teammate: "Bug spec is above in your prompt. Write a minimal failing test that reproduces this bug. Explore the codebase to find the right test location and patterns. Confirm the test fails before reporting back."
3. Wait for tester to message back with test path
4. If tester reports "test passes":
   - Verify via coordination only (Lead must not run tests or reproduction commands):
     - Ask the tester to re-run the reproduction steps (if available) and report evidence that the described bug behavior is absent
     - Optionally inspect the relevant code paths to sanity-check consistency with the bug spec
   - If bug appears genuinely fixed based on tester evidence: abort workflow, report "Bug appears already resolved", clean up branch state (`rm -rf ".dev/cdt/$BRANCH_SLUG"`), cleanup team, and ask user whether to close the linked issue
   - If test is wrong: message tester to rewrite (max 2 attempts, then abort with explanation)
5. **Branch verification** (before first commit — guards all subsequent commits):
   - Assert `git branch --show-current` matches the expected `bugfix/<slug>` branch
   - If it doesn't match: STOP, report the mismatch, do NOT commit or push
6. Commit the failing test:
   ```bash
   git add <test-file>
   git commit -m "test: add failing test for <bug summary>"
   ```
7. Confirm T1 is marked complete by the tester

## 6. GREEN — Developer Implements Fix

1. Assign T2 to developer (TaskUpdate `owner: "developer"`)
2. Message developer teammate: "Failing test at [path]. Read it, trace the root cause, and implement the minimal fix to make it pass."
3. Developer implements fix, messages tester
4. Tester↔Developer iterate directly — max 3 cycles on test failures
   - Lead does NOT receive failure reports — only "Tests green" or escalation
5. Wait for tester to message: "Tests green"
6. Commit the fix:
   ```bash
   git add <changed-files>
   git commit -m "fix: <bug summary>"
   ```
7. Confirm T2 and T3 are marked complete by their owners (developer/tester)

## 7. REFACTOR — Developer Cleans Up

1. Assign T4 to developer (TaskUpdate `owner: "developer"`)
2. Message developer teammate: "Tests green. Start the refactor pass — review your fix for unnecessary complexity, duplication, unclear naming. Simplify without changing behavior. Message tester when done."
3. Developer refactors (or reports nothing to refactor), messages tester
4. Tester↔Developer iterate directly — max 2 cycles
5. Wait for tester to message: "Still green after refactor"
6. If refactor produced changes, commit:
   ```bash
   git add <changed-files>
   git commit -m "refactor: clean up <bug summary> fix"
   ```
7. Confirm T4 and T5 are marked complete by their owners (developer/tester)

## 8. REVIEW — Reviewer Validates

1. Assign T6 to reviewer (TaskUpdate `owner: "reviewer"`)
2. Message reviewer teammate: "Fix complete and tests passing. Changed files: [list]. Test file: [path]. Review for correctness, blast radius, and root cause. Send change requests directly to the developer teammate."
3. Reviewer↔Developer iterate directly — max 3 cycles
   - Lead does NOT receive change requests — only "Approved" or escalation
4. Wait for reviewer to message: "Approved" + verdict
5. If developer changed code during review: message tester to re-verify one final time, wait for confirmation
6. Confirm T6 is marked complete by the reviewer

## 9. Final Verification

1. Message tester teammate: "Final verification — run the full test suite one last time and confirm the original regression test passes."
2. Wait for tester to confirm all tests pass
3. Scan for stubs via Bash: `rg "TODO|FIXME|HACK|XXX|stub" --type-not md <changed-files>` (pass the actual changed file paths to scope the scan)

If tester reports failures or stub scan finds issues: message developer with details, wait for fix, then ask tester to re-verify. If developer changed code, also message reviewer to re-review the new changes before proceeding (max 2 cycles, then abort).

## 10. Cleanup

1. Send each teammate a shutdown request via SendMessage
2. Wait for all teammates to confirm shutdown (if rejected, resolve first)
3. Run TeamDelete to clean up the team

## 11. Wrap Up

**Default (no `--no-pr` flag):**
1. Stage any remaining unstaged changes
2. Commit if needed: `git commit -m "chore: final cleanup for <bug summary>"`
3. Push branch: `git push -u origin <branch>`
4. Create PR:
   - Derive `BRANCH_SLUG=$(git branch --show-current | tr '/' '-')`
   - Build PR body with: bug summary, root cause (from spec or discovered), what was fixed, regression test added
   - If `".dev/cdt/$BRANCH_SLUG/.cdt-issue"` exists and is non-empty: read `ISSUE_NO`, validate numeric, include `Closes #$ISSUE_NO` in PR body
   - `gh pr create --title "fix: <bug summary>" --body "$PR_BODY"`
5. After PR creation, if `".dev/cdt/$BRANCH_SLUG/.cdt-scripts-path"` exists, move issue to "In Review":
   `"$(cat ".dev/cdt/$BRANCH_SLUG/.cdt-scripts-path")/sync-github-issue.sh" review`
6. Clean up branch state: `rm -rf ".dev/cdt/$BRANCH_SLUG"`
7. Print PR URL

**`--no-pr` flag:**
1. Stage any remaining unstaged changes
2. Commit if needed: `git commit -m "chore: final cleanup for <bug summary>"`
3. Do NOT push. Do NOT create PR.
4. Clean up branch state: `rm -rf ".dev/cdt/$BRANCH_SLUG"`
5. Print: "Bugfix committed locally on branch [name]. Use `git push` when ready."

## Anti-Patterns (Lead MUST avoid)

- Editing source or test files directly instead of messaging teammates
- Running tests directly instead of waiting for tester reports
- Fixing bugs yourself when developer↔tester cycles haven't been exhausted
- Reviewing code yourself instead of waiting for reviewer verdict
- Relaying failure messages between tester↔developer (they message each other directly)
- Asking the user for approval mid-workflow (this is automated)

## Rules

- Sequential pipeline: RED → GREEN → REFACTOR → REVIEW
- Teammates iterate directly — Tester↔Developer, Reviewer↔Developer
- Lead only receives: test results summaries, review verdicts, escalations
- Researcher is a subagent — Lead relays if needed
- One team only — `bugfix-team`
- All three quality checks mandatory (test, verify, review)
- Always cleanup team before finishing
- If stuck — abort gracefully and report what was accomplished
