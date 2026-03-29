# Bugfix Workflow

Detailed execution steps for the TDD-driven bugfix workflow. The Lead reads this before running bugfix mode.

## 0. Git Check

1. Run `git fetch origin`
2. Ensure you are on `main` or `master` — if not, run `git checkout main` (or `master`, whichever exists)
3. Derive a branch name from the bug summary (e.g. `bugfix/fix-null-return-getuser`)
4. Run `git checkout -b <branch> origin/<default-branch>` to create the bugfix branch from the latest remote default branch
5. Run `git pull` to ensure up-to-date

## 0a. Issue Detection

**Branch-scoped state**: CDT state lives in `.dev/cdt/<branch-slug>/` where `<branch-slug>` is the current branch with `/` replaced by `-`. Derive with: `BRANCH=$(git branch --show-current | tr '/' '-')`; if empty (detached HEAD), checkout a branch before proceeding.

1. Check `$ARGUMENTS` for GitHub issue references (`#N`, URL).
2. If found, extract the number into `$ISSUE_NUM` and write/overwrite: `mkdir -p ".dev/cdt/$BRANCH" && echo "$ISSUE_NUM" > ".dev/cdt/$BRANCH/.cdt-issue"`
3. Otherwise, if `".dev/cdt/$BRANCH/.cdt-issue"` exists → read the issue number from it into `$ISSUE_NUM`.
4. If an issue is linked (`$ISSUE_NUM` is set), fetch details for context: `gh issue view "$ISSUE_NUM" --json title,body,labels`

The team creation hook will attempt to assign and move to "In Progress" (best-effort — may no-op if no project item exists).

## 1. Parse Arguments & Assemble Bug Spec

Parse `$ARGUMENTS`:
1. Extract `--no-pr` flag if present → store as `$SKIP_PR` (boolean)
2. Extract `#<number>` if present → `$ISSUE_NO` (already handled in 0a, use `$ISSUE_NUM`)
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

## 2. Generate Timestamp

Generate a timestamp in `YYYYMMDD-HHMM` format. Store as `$TIMESTAMP`.

## 3. Create Team

```
TeamCreate: team_name "bugfix-team"
```

## 4. Create Tasks

```
TaskCreate: "Write failing regression test"        → T1 (Tester)
TaskCreate: "Implement fix"                        → T2 (Developer, blocked by T1)
TaskCreate: "Verify fix passes"                    → T3 (Tester, blocked by T2)
TaskCreate: "Refactor fix"                         → T4 (Developer, blocked by T3)
TaskCreate: "Verify refactor"                      → T5 (Tester, blocked by T4)
TaskCreate: "Review fix"                           → T6 (Reviewer, blocked by T5)
```

Use `addBlockedBy` to enforce sequencing.

## 5. Spawn Teammates

**Tester teammate**:
```
Teammate tool:
  team_name: "bugfix-team"
  name: "tester"
  model: sonnet
  prompt: >
    You are the tester in a TDD bugfix workflow. Your job is to write a failing
    test that reproduces the bug BEFORE the developer writes a fix.

    Bug spec:
    $BUG_SPEC

    Communication rules:
    - Failing test written → message LEAD with test file path
    - Test unexpectedly passes → message LEAD: "Test passes — bug may already be fixed or test does not reproduce the reported behavior"
    - Post-fix verification failures → message DEVELOPER with failure details + root cause (max 3 cycles, then escalate to LEAD)
    - Post-fix verification passes → message LEAD: "Tests green"
    - Post-refactor verification failures → message DEVELOPER (max 2 cycles, then escalate to LEAD)
    - Post-refactor verification passes → message LEAD: "Still green after refactor"
    - Circuit breaker: If you report the same failure twice and the developer's fix didn't change the failing behavior, escalate to LEAD immediately.

    Phase 1 — RED (write failing test):
    1. Check TaskList, claim task "Write failing regression test"
    2. Explore codebase: find test framework, testing patterns, existing test files near the affected code
    3. Write a MINIMAL failing test that reproduces the bug's described behavior
       - Test the expected behavior described in the bug spec
       - Follow existing test patterns and conventions
       - One test is enough — test the specific bug, not the world
    4. Run the test — confirm it FAILS
       - If it PASSES: the bug may already be fixed or your test doesn't reproduce it
         Message LEAD immediately with this finding
         If LEAD says test is wrong: rewrite (max 2 attempts, then escalate)
    5. Message LEAD: "Failing test ready at [path/to/test]"
    6. Mark task complete, wait for further instructions

    Phase 2 — VERIFY (after developer fixes):
    1. Developer will message you: "Fix ready, changed files: [list]"
    2. Run the regression test — confirm it PASSES
    3. Run the full test suite — confirm no regressions
    4. If failures: message DEVELOPER with specific failure details + root cause
       Wait for fix, re-run (max 3 cycles, then escalate to LEAD)
    5. If all pass: message LEAD: "Tests green"
    6. Mark task complete

    Phase 3 — POST-REFACTOR VERIFY:
    1. Developer will message you: "Refactor complete, verify tests still pass"
    2. Re-run the full test suite
    3. If failures: message DEVELOPER (max 2 cycles, then escalate to LEAD)
    4. If pass: message LEAD: "Still green after refactor"
    5. Mark task complete

    Phase 4 — POST-REVIEW VERIFY (if needed):
    1. If reviewer requested code changes and developer made them, LEAD will message you to re-verify
    2. Re-run the full test suite
    3. Report results to LEAD
```

**Developer teammate**:
```
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

    Communication rules:
    - Fix ready → message TESTER: "Fix ready, changed files: [list]"
    - Refactor complete → message TESTER: "Refactor complete, verify tests still pass"
    - If tester reports failures → fix, re-message tester (max 3 cycles)
    - If reviewer requests changes → fix, re-message reviewer (max 3 cycles)
    - Circuit breaker: If you receive the same failure report twice in a row (same root cause), do NOT attempt a third fix. Instead, message LEAD with: what failed, what you tried (both attempts), and why you're stuck.

    Phase 1 — GREEN (implement minimal fix):
    1. Check TaskList, claim task "Implement fix"
    2. LEAD will message you with the failing test location
    3. Read the failing test — understand the exact expected behavior
    4. Explore the affected code, trace the root cause
    5. Implement the MINIMAL fix that makes the test pass
       - Change as few lines as possible
       - Don't refactor yet — that's Phase 2
       - Don't fix unrelated issues — stay focused on this bug
    6. Run the test locally to confirm it passes
    7. Message TESTER: "Fix ready, changed files: [list]"
    8. Wait for tester verification

    Phase 2 — REFACTOR (after tester confirms green):
    1. LEAD will tell you tests are green and to start refactoring
    2. Review your fix for:
       - Unnecessary complexity or nesting
       - Code duplication introduced by the fix
       - Unclear variable/function naming
       - Logic that could be simplified or consolidated
    3. Refactor without changing behavior — the tests must still pass
    4. If no meaningful refactoring is needed, message TESTER: "No refactoring needed, tests should still pass — please verify"
    5. If you refactored, message TESTER: "Refactor complete, verify tests still pass"
    6. Mark task complete

    Iteration with reviewer:
    1. Reviewer may message you with change requests (file:line + suggestion)
    2. Implement the requested changes
    3. Message REVIEWER that changes are made
    4. Max 3 cycles, then escalate to LEAD

    Scope lock: Edit only files necessary for the bugfix. If you discover a needed
    change outside the bug's scope, message LEAD — do NOT expand scope.
```

**Reviewer teammate**:
```
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

    Communication rules:
    - Blocking issues → message DEVELOPER with file:line + fix suggestion
    - Review approved → message LEAD with verdict, issues found/fixed, summary
    - Escalation (after 3 failed cycles) → message LEAD with summary
    - Circuit breaker: If the same issue persists after 2 fix attempts, escalate to LEAD.

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

    4. Scan for stubs: rg "TODO|FIXME|HACK|XXX|stub" on changed files
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
```

## 6. RED — Tester Writes Failing Test

1. Assign T1 to tester (TaskUpdate `owner: "tester"`)
2. Message tester teammate: "Bug spec is above in your prompt. Write a minimal failing test that reproduces this bug. Explore the codebase to find the right test location and patterns. Confirm the test fails before reporting back."
3. Wait for tester to message back with test path
4. If tester reports "test passes":
   - Verify: check if the described bug behavior is actually absent (run reproduction steps if available, or inspect the code path)
   - If bug is genuinely fixed: abort workflow, report "Bug already resolved", close issue if linked (`gh issue close $ISSUE_NUM`), cleanup team, exit
   - If test is wrong: message tester to rewrite (max 2 attempts, then abort with explanation)
5. Commit the failing test:
   ```bash
   git add <test-file>
   git commit -m "test: add failing test for <bug summary>"
   ```
6. Mark T1 complete

## 7. GREEN — Developer Implements Fix

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
7. Mark T2, T3 complete

## 8. REFACTOR — Developer Cleans Up

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
7. Mark T4, T5 complete

## 9. REVIEW — Reviewer Validates

1. Assign T6 to reviewer (TaskUpdate `owner: "reviewer"`)
2. Message reviewer teammate: "Fix complete and tests passing. Changed files: [list]. Test file: [path]. Review for correctness, blast radius, and root cause. Send change requests directly to the developer teammate."
3. Reviewer↔Developer iterate directly — max 3 cycles
   - Lead does NOT receive change requests — only "Approved" or escalation
4. Wait for reviewer to message: "Approved" + verdict
5. If developer changed code during review: message tester to re-verify one final time, wait for confirmation
6. Mark T6 complete

## 10. Final Verification

1. Run full test suite one last time (use the project's test command)
2. `rg "TODO|FIXME|HACK|XXX|stub" --type-not md` on changed files only
3. Verify the original failing regression test passes

If any check fails: message developer with details, re-run after fix, re-verify.

## 11. Cleanup

1. Send each teammate a shutdown request via SendMessage
2. Wait for all teammates to confirm shutdown (if rejected, resolve first)
3. Run TeamDelete to clean up the team

## 12. Wrap Up

**Default (no `--no-pr` flag):**
1. Stage any remaining unstaged changes
2. Commit if needed: `git commit -m "chore: final cleanup for <bug summary>"`
3. Push branch: `git push -u origin <branch>`
4. Create PR:
   - Derive `BRANCH=$(git branch --show-current | tr '/' '-')`
   - Build PR body with: bug summary, root cause (from spec or discovered), what was fixed, regression test added
   - If `".dev/cdt/$BRANCH/.cdt-issue"` exists and is non-empty: read `ISSUE_NO`, validate numeric, include `Closes #$ISSUE_NO` in PR body
   - `gh pr create --title "fix: <bug summary>" --body "$PR_BODY"`
5. After PR creation, if `".dev/cdt/$BRANCH/.cdt-scripts-path"` exists, move issue to "In Review":
   `"$(cat ".dev/cdt/$BRANCH/.cdt-scripts-path")/sync-github-issue.sh" review`
6. Print PR URL

**`--no-pr` flag:**
1. Stage any remaining unstaged changes
2. Commit if needed: `git commit -m "chore: final cleanup for <bug summary>"`
3. Do NOT push. Do NOT create PR.
4. Print: "Bugfix committed locally on branch [name]. Use `git push` when ready."

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
