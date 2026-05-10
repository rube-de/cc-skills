---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete, Skill]
description: "Create an agent team for autonomous workflow: plan (Architect teammate + PM teammate) → develop (Developer teammate + Code-tester teammate + QA-tester teammate + Reviewer teammate) → report (no approval gate)"
---

> **ROLE: Coordinator only.**
> You MUST NOT use Edit, Write, or NotebookEdit tools on source code, test files, or project docs.
> All implementation, testing, review, and documentation MUST be delegated to teammates via SendMessage.
> If you find yourself about to edit a file, STOP and delegate to the appropriate teammate instead.
> You verify plan/report artifacts written by teammates.
> **Narrow exception**: One-shot Bash file-appends for plugin-install side effects (specifically the discovery-hint install — a single idempotent `printf >>` to `AGENTS.md` or `CLAUDE.md`, guarded by `rg -q '\.agentnotes/cdt'`) are explicitly permitted. This exception does NOT extend to Edit/Write/NotebookEdit on any file, nor to broader Bash file edits on source, test, or doc content.

# /auto-task — Autonomous Workflow

**Target:** $ARGUMENTS

Two-phase orchestration like `/cdt:full-task`, but without a user approval gate. Plan team runs, cleans up, then dev team starts immediately.

```text
Phase 1: plan-team                    Phase 2: dev-team
┌───────────────────────────┐         ┌───────────────────────────┐
│  Lead (You)               │         │  Lead (You)               │
│  ├── architect       [tm] │ plan.md │  ├── developer   [tm]     │
│  ├── product-manager [tm] │──────→  │  ├── code-tester [tm]     │
│  └── researcher      [sa] │         │  ├── qa-tester   [tm]     │
└───────────────────────────┘         │  ├── reviewer    [tm]     │
                                      │  └── researcher  [sa]     │
                                      └───────────────────────────┘
```

`[tm]` = teammate (Agent Team)  `[sa]` = subagent

The `plan-team` / `dev-team` labels above are role names; the actual team names created by the workflow are scoped per run as `plan-<branch-slug>-<timestamp>` and `dev-<branch-slug>-<timestamp>` to avoid collisions on the global `~/.claude/teams/` namespace, where `branch-slug` is the current branch name with `/` replaced by `-`.

## Step 0: Git Check

1. Run `git fetch origin`
2. Ensure you are on `main` or `master` — if not, run `git checkout main` (or `master`, whichever exists)
3. Suggest a branch name based on the task (e.g. `feat/rate-limiting`)
4. Run `git checkout -b <branch> origin/<default-branch>` to create the feature branch from the latest remote default branch
5. Run `git pull` to ensure up-to-date

## Step 0.5: Workflow Declaration

Print to the user before proceeding:

```
Workflow: auto-task
 Phase 1 — Planning: architect [tm], product-manager [tm], researcher [sa]
 Phase 2 — Development: developer [tm], code-tester [tm], qa-tester [tm], reviewer [tm], researcher [sa]
 Coordinator role: orchestration only — no direct file edits
```

## Phase 1: Planning

Follow the planning workflow defined in @plan-workflow.md (skip Step 0 — Git Check was already done above). plan-workflow.md generates its own `$TIMESTAMP` for the plan path.

## Phase 1: Completion Audit

Before proceeding, log which roles were actually used during Phase 1:

```
Phase 1 complete:
 - architect  [tm]: [used / NOT USED]
 - product-manager [tm]: [used / NOT USED]
 - researcher      [sa]: [used / NOT USED]
```

Determine "used" by whether you sent at least one `SendMessage` (teammates) or launched at least one `Task` subagent (researcher) during Phase 1.

If any role was created but never used: **WARN** "Role {name} was created but never used in Phase 1"

## Bridge

Log a brief summary of the plan to the user (task count, waves, key decisions), then proceed directly to development.

## Phase 2: Development

Follow the development workflow defined in @dev-workflow.md using the plan path from Phase 1 (skip Step 0 — Git Check was already done above; skip sections 9 and 10 — this command handles handoff and wrap-up). dev-workflow.md generates its own timestamp for the session handoff.

## Phase 2: Completion Audit

Before proceeding to wrap-up, log which roles were actually used during Phase 2:

```
Phase 2 complete:
 - developer   [tm]: [used / NOT USED]
 - code-tester [tm]: [used / NOT USED]
 - qa-tester   [tm]: [used / NOT USED]
 - reviewer    [tm]: [used / NOT USED]
 - researcher  [sa]: [used / NOT USED]
```

Determine "used" by whether you sent at least one `SendMessage` (teammates) or launched at least one `Task` subagent (researcher) during Phase 2.

If any role was created but never used: **WARN** "Role {name} was created but never used in Phase 2"

## Wrap Up (Autonomous)

Automatically finalize without user interaction:
1. Stage all changed files
2. Commit with conventional commit message based on task
3. Push branch to remote
4. Derive `BRANCH_SLUG=$(git branch --show-current | tr '/' '-')`; if `".dev/cdt/$BRANCH_SLUG/.cdt-issue"` exists and is non-empty, read `ISSUE_NO="$(cat ".dev/cdt/$BRANCH_SLUG/.cdt-issue")"`; validate ISSUE_NO is numeric (digits only). Draft the *content* (excluding headings) for the `Open Questions` and `Context for Next Session` sections you will write to the session log in step 7 — keep both in working memory so the PR body and the session log carry identical body text under their respective headings. Each bullet MUST cite verified evidence — a grep result, a `file:line` reference, a recent test/build/log output, or a deliberate plan-time decision recorded in the plan file. If you cannot point to specific evidence in the current branch state, drop the bullet. Empty sections are fine; speculative bullets are not. Then create PR via `gh pr create`. PR body = plan summary as description, `Closes #$ISSUE_NO` (if applicable), and an `## Agent Notes` block formatted as:

    ```markdown
    ## Agent Notes

    ### Open Questions
    [drafted Open Questions content — body only, no heading]

    ### Context for Next Session
    [drafted Context for Next Session content — body only, no heading]
    ```

    If both `Open Questions` and `Context for Next Session` are empty, omit the entire `## Agent Notes` block — do NOT emit an empty heading.
5. After PR creation, if `".dev/cdt/$BRANCH_SLUG/.cdt-scripts-path"` exists, move the issue to "In Review":
   `"$(cat ".dev/cdt/$BRANCH_SLUG/.cdt-scripts-path")/sync-github-issue.sh" review`
6. Ensure log directory exists: `mkdir -p .agentnotes/cdt`
7. Write the session log to `.agentnotes/cdt/$BRANCH_SLUG.md` (using `$BRANCH_SLUG` from step 4 and `$TIMESTAMP` from Phase 2). The log is append-mode: each CDT session appends one `## Session $TIMESTAMP` block; the `# Branch:` header stays exactly once at the top. Reuse the same `Open Questions` and `Context for Next Session` content drafted for the PR body in step 4 — do not regenerate or rephrase.

    a. Derive `LOG_PATH=".agentnotes/cdt/$BRANCH_SLUG.md"`.
    b. If `$LOG_PATH` does NOT exist, write the file as:

        ```markdown
        # Branch: [branch name]

        **Created**: [date]
        **First plan**: [plan path from Phase 1]

        ---

        ## Session $TIMESTAMP

        **Task**: [original task from $ARGUMENTS]
        **Plan**: [plan path from Phase 1]

        ### What's Done
        [1-2 sentences — what was accomplished]

        ### Open Questions
        [Unresolved items, deferred decisions, known limitations]

        ### Context for Next Session
        [What a future session working in this area needs to know that isn't obvious from the code/PR]

        ### References
        - PR: [PR URL from step 4]
        ```

    c. If `$LOG_PATH` already exists, read its prior content verbatim into memory, then rewrite the file as `<prior content>` + `\n---\n\n` + a new `## Session $TIMESTAMP` block (same shape as 7b's session block — without the `# Branch:` header).

8. Install the discovery hint into project docs (idempotent, one-shot per host repo):

    ```bash
    HINT='When picking up work in an unfamiliar area, run `rg -l "" .agentnotes/cdt/` to surface prior CDT session logs.'
    if [ -f AGENTS.md ] && ! rg -q '\.agentnotes/cdt' AGENTS.md; then
      printf '\n%s\n' "$HINT" >> AGENTS.md
    elif [ ! -f AGENTS.md ] && [ -f CLAUDE.md ] && ! rg -q '\.agentnotes/cdt' CLAUDE.md; then
      printf '\n%s\n' "$HINT" >> CLAUDE.md
    fi
    ```

    Skip silently if neither file exists — the plugin must NOT auto-create project docs. Idempotency is anchored on the literal string `.agentnotes/cdt` in the host file.

9. Commit and push the session log and discovery hint. The feature commit (step 2) cannot include these because they are written *after* PR creation; this second commit ensures both artifacts land in the PR's commit history (without it the log + hint stay local-only and the PR never reflects the new branch-scoped log design):

    ```bash
    git add ".agentnotes/cdt/$BRANCH_SLUG.md"
    [ -f AGENTS.md ] && git add AGENTS.md
    [ -f CLAUDE.md ] && git add CLAUDE.md
    if ! git diff --cached --quiet; then
      git commit -m "chore(cdt): record session log for $TIMESTAMP"
      git push origin HEAD
    fi
    ```

    The `git diff --cached --quiet` guard is an edge-case safety net — under normal conditions the log file (step 7) always produces a staged change. If both the log write and the hint install were no-ops, the commit is skipped silently rather than failing on an empty commit.

10. Clean up branch state: `[ -n "$BRANCH_SLUG" ] && rm -rf ".dev/cdt/$BRANCH_SLUG"`
11. Print PR URL to user

## Bridge

The plan file is the handoff (Lead carries the path between phases):
- Phase 1: architect teammate writes it (architecture, tasks, research)
- Phase 2 reads and updates it (status, logs, files)
- Lead's context spans both phases; teammate context does not
- Lead carries the plan path from Phase 1 → Phase 2

## Rules

- One team at a time — cleanup before next
- Plan is single source of truth
- Researcher is always a subagent
- All other roles are teammates
- Quality gates mandatory (test + review)
- If blocked — ask user
