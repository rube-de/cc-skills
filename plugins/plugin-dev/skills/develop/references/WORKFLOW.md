# Skill Developer Workflow — Phase Definitions

Detailed step-by-step procedures for skill development with TDD extension points.

---

## Global State & Limits

Track these counters throughout workflow execution:

```text
# Per-loop counters (reset when loop exits successfully)
validation_iterations = 0      # Phase 3-4
implementation_cycles = 0      # Phase 5-7
refactor_iterations = 0        # Phase 7.5
review_iterations = 0          # Phase 8-9

# Cross-loop counter (never resets)
total_workflow_iterations = 0  # Increments on ANY loop iteration

# Limits
MAX_VALIDATION_ITERATIONS = 5
MAX_IMPLEMENTATION_CYCLES = 10
MAX_REFACTOR_ITERATIONS = 3    # Phase 7.5 verify+fix loop
MAX_REVIEW_ITERATIONS = 3
MAX_TOTAL_WORKFLOW_ITERATIONS = 25  # Hard cap across all loops (higher than base due to TDD phases)
MAX_TASK_RETRIES = 3           # Per-individual-task retry cap (Phase 5-7)

# Per-task retry tracking (reset when task completes or escalates)
task_retry_count = {}          # Map of task_id → retry count
```

**Cross-loop escalation:**

When `total_workflow_iterations >= MAX_TOTAL_WORKFLOW_ITERATIONS`:
```text
Use AskUserQuestion tool:

Question: "Workflow has run ${MAX_TOTAL_WORKFLOW_ITERATIONS} total iterations across all phases without completing."

Options:
- "Show me iteration breakdown by phase"
- "Force complete current phase"
- "Abort workflow entirely"
```

### State Persistence (Optional)

> **Note:** This is a future enhancement. Initial implementations can skip state persistence. When implemented, save state at each phase transition and check for existing state on workflow start.

Save state for session recovery at `.claude/plugin-dev/develop/${ISSUE_NUM}/state.json`:

```json
{
  "issue_num": 123,
  "current_phase": 5,
  "counters": {
    "validation_iterations": 2,
    "implementation_cycles": 3,
    "refactor_iterations": 0,
    "review_iterations": 0,
    "total_workflow_iterations": 5
  },
  "pr_num": null,
  "baseline_results": null,
  "completed_tasks": ["task-1", "task-2"],
  "last_updated": "2024-01-15T10:30:00Z"
}
```

**On resume:** Detect existing state, ask user: "Resume from Phase ${current_phase}?"

---

## Phase 0: Setup

**Goal:** Validate issue and create feature branch.

### ⛔ CRITICAL: Branch Creation is MANDATORY

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⛔ NEVER work on main/master branch                                        │
│  ⛔ NEVER skip branch creation, no matter how small the change              │
│  ⛔ NEVER proceed to Phase 1 without being on a feature branch              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Steps

1. **Parse issue reference**
   - Extract owner, repo, issue number from input
   - Formats: `#123`, `owner/repo#123`, issue URL
   - If input is plain `#123` (no owner/repo), derive from current repo:
     ```bash
     REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
     ```
   - Use `REPO` consistently in all subsequent `gh` commands

2. **Validate issue exists**
   ```bash
   gh issue view ${ISSUE_NUM} --repo ${REPO} --json state,title,labels
   ```

   **Abort conditions:**
   - Issue not found (404) → `"Issue #${ISSUE_NUM} does not exist"`
   - Issue closed → Ask user: "Issue is closed. Reopen or abort?"
   - Issue locked → `"Issue is locked. Cannot proceed."`

3. **Sync and reset to default branch**
   ```bash
   git fetch origin
   DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   [[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH=$(git branch -r | grep -E 'origin/(main|master)$' | head -1 | sed 's@.*origin/@@')

   if [[ -z "$DEFAULT_BRANCH" ]]; then
     echo "❌ FATAL: Could not detect default branch (neither symbolic-ref nor origin/main|master found). Aborting."
     exit 1
   fi

   # Guard against uncommitted work (tracked AND untracked) — MUST block before reset
   if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
     echo "⚠️ Uncommitted changes detected."
     # Use AskUserQuestion:
     # Question: "Uncommitted changes detected. How should I proceed?"
     # Options:
     #   - "Stash changes (git stash push -u -m 'plugin-dev-workflow-issue-${ISSUE_NUM}')"
     #   - "Commit changes first"
     #   - "Discard changes (git restore . && git clean -fd)"
     #   - "Abort workflow"
     # Do NOT proceed until the user responds and the chosen action completes.
     # If "Abort workflow" → stop immediately.
   fi

   # Only safe to reset after user has resolved uncommitted work above
   git checkout "$DEFAULT_BRANCH"
   git reset --hard "origin/$DEFAULT_BRANCH"
   ```

4. **Check for existing branch**
   ```bash
   git branch -a | grep -E "(^|[[:space:]]|remotes/origin/)feature/issue-${ISSUE_NUM}$"
   ```

   If exists → Ask user:
   ```text
   Question: "Branch feature/issue-${ISSUE_NUM} already exists"

   Options:
   - "Continue existing work (checkout branch)"
   - "Delete and start fresh"
   - "Create new branch with suffix"
   ```

5. **Enter selected branch path** ← MANDATORY
   ```bash
   # Based on Step 4 decision:
   # - No existing branch:
   git checkout -b "feature/issue-${ISSUE_NUM}"
   # - Continue existing work:
   #   git checkout "feature/issue-${ISSUE_NUM}"
   # - Delete and start fresh:
   #   git branch -D "feature/issue-${ISSUE_NUM}"
   #   git checkout -b "feature/issue-${ISSUE_NUM}"
   # - Create new branch with suffix:
   #   git checkout -b "feature/issue-${ISSUE_NUM}-v2"
   ```

6. **Verify branch (MANDATORY final check)**
   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   if [[ "$CURRENT_BRANCH" =~ ^(main|master)$ ]]; then
     echo "❌ FATAL: Still on $CURRENT_BRANCH. Aborting workflow."
     exit 1
   fi
   echo "✓ Working on branch: $CURRENT_BRANCH"
   ```

**Exit conditions (ALL must be true):**
1. ✅ Issue validated and exists
2. ✅ Synced with `origin/$DEFAULT_BRANCH`
3. ✅ **On feature branch (NOT main/master)** ← Non-negotiable

**⛔ DO NOT proceed to Phase 1 if on main/master branch.**

---

## Phase 1: Context Gathering

**Goal:** Fully understand requirements and detect skill-related files.

### Steps

1. **Read the issue**
   ```bash
   gh issue view ${ISSUE_NUM} --repo ${REPO}
   ```

   Extract:
   - Title and description
   - Acceptance criteria
   - Implementation hints
   - Labels and assignees
   - Linked issues/epics

2. **Check for design doc**
   - Look for `docs/design/*.md` references in issue
   - If epic, check parent issue for design doc link
   - Read design doc if exists

3. **Detect skill-related files** ← SKILL DEVELOPMENT SPECIFIC

   Determine and assign the target plugin directory from the issue context:
   ```bash
   # Derive from issue title/labels/body — e.g., if issue mentions "plugin-dev"
   PLUGIN_DIR="plugins/<plugin-name>"  # e.g., PLUGIN_DIR="plugins/plugin-dev"
   ```

   Then scan for domain-specific files using Glob/Grep tools:
   ```text
   # Detect SKILL.md files (scoped to target plugin)
   Glob: ${PLUGIN_DIR}/**/SKILL.md

   # Detect workflow references (any .md file with "workflow" in name or path)
   Glob: ${PLUGIN_DIR}/**/references/*.md
   Glob: ${PLUGIN_DIR}/**/*workflow*.md

   # Detect agent definitions
   Glob: ${PLUGIN_DIR}/agents/*.md

   # Detect hook definitions
   Glob: ${PLUGIN_DIR}/hooks/hooks.json
   ```

   **Record findings** for use in Phase 2 planning:
   - Which SKILL.md files exist and their frontmatter
   - Which workflow references exist
   - Which agents are defined
   - Which hooks are active

   This information constrains the implementation plan — changes to these files require specific validation (frontmatter schema, hook audit, etc.)

4. **Gather additional context**
   - Read files mentioned in implementation hints
   - Understand existing code patterns
   - Check related issues for context
   - Read `docs/learnings.md` for known pitfalls

5. **Summarize requirements**
   - Create mental model of what needs to be built
   - List all acceptance criteria
   - Note constraints from design doc
   - Note skill-specific files that will be created/modified

6. **Early-exit check**

   Abort workflow if:
   - Issue is duplicate → Comment and close
   - Already fixed in codebase → Comment with evidence
   - No code changes needed → Suggest simpler path
   - Blocked by dependency → Report blocker, abort
   - Missing design doc for complex issue → Request design doc first

**Exit condition:** Requirements clear, skill files detected, no early-exit conditions triggered.

---

## Phase 2: Plan Creation

**Goal:** Draft implementation plan before coding.

### Steps

1. **Analyze scope**
   - List files to create/modify (including detected skill files)
   - Identify dependencies between changes
   - Estimate complexity (small/medium/large)

2. **Draft implementation plan**
   - Write to: `/tmp/issue-${ISSUE_NUM}-plan.md`
   - Include:
     - Overview of approach
     - Step-by-step implementation order
     - Files to modify with specific changes
     - Testing strategy (including skill-specific validation)
     - Risk areas
     - Skill file changes: note SKILL.md frontmatter updates, workflow modifications, agent prompt changes

3. **Create initial BD tasks**
   - Break plan into behavior-driven tasks
   - Each task should be independently verifiable
   - Use TodoWrite to track

**Exit condition:** Implementation plan drafted, ready for validation.

---

## Phase 3-4: Plan Validation Loop

**Goal:** Iterate with Gemini until full agreement on plan.

**Limits:**
- `MAX_VALIDATION_ITERATIONS = 5`
- Hard escalation to user after limit reached

### Steps

**Step 3: Submit to Gemini**

```text
Task(council:gemini-consultant):

Review this implementation plan for a skill development issue #${ISSUE_NUM}:

## Issue Summary
[paste issue summary and acceptance criteria]

## Detected Skill Files
[list skill-related files found in Phase 1]

## Implementation Plan
[paste implementation plan]

Evaluate:
1. Does the plan fully address all acceptance criteria?
2. Is the implementation approach sound for skill/plugin development?
3. Are there missing steps or edge cases?
4. Does it properly handle skill-specific files (SKILL.md frontmatter, workflow references, agents)?
5. Are there risks or concerns?
6. Is the task breakdown appropriate?
7. Will `bun scripts/validate-plugins.mjs` pass after implementation?

Provide specific feedback. State clearly: APPROVED, NEEDS_CHANGES (BLOCKING) for issues that must be fixed before merge, or NEEDS_CHANGES (WARNING only) for non-blocking suggestions.
```

**Step 4: Process Feedback**

- **Full agreement:** → Exit loop, proceed to Phase 4.5
- **Approved with warnings only** (Gemini returns `NEEDS_CHANGES (WARNING only)`) → Note warnings in plan, proceed to Phase 4.5
- **Hard limit reached:** (`validation_iterations >= 5`) → Escalate to user
- **Concerns raised (BLOCKING):** → Increment `validation_iterations` and `total_workflow_iterations`, revise plan, return to Step 3

**Exit conditions:**
1. Gemini returns `APPROVED` — proceed to Phase 4.5
2. Gemini returns `NEEDS_CHANGES (WARNING only)` — note warnings, proceed to Phase 4.5
3. `validation_iterations >= 5` — hard escalate to user

---

## Phase 4.5: Baseline Capture (RED)

> **TODO: #163 will integrate skill-creator/tessl here**

**Goal:** Capture baseline behavior before skill changes.

**This phase is a placeholder.** When #163 is implemented, it will:

1. **Design test prompts** from issue requirements and acceptance criteria
2. **Run test prompts** against the current skill (without changes)
3. **Capture baseline behavior** — save prompt/response pairs
4. **Identify expected failures** — which test prompts should fail (these become implementation constraints)

### Current Behavior (Pre-#163)

Until #163 integrates the testing tooling:

```text
Log: "Phase 4.5 (Baseline/RED) — skipped: awaiting #163 integration"
```

Proceed directly to Phase 5-7.

**Exit condition:** Baseline captured (or skipped pending #163).

---

## Phase 5-7: Implementation Loop (GREEN)

**Goal:** Implement plan. When baseline exists, write minimal skill changes addressing baseline failures.

**Limits:**
- `MAX_IMPLEMENTATION_CYCLES = 10`
- `MAX_TASK_RETRIES = 3` (per individual task)
- Hard escalation to user after limits reached

### Steps

**Step 5: Implement**

1. **Sync BD tasks with TodoWrite**

2. **Pick next task**
   - Mark as `in_progress`
   - Focus on one task at a time

3. **Write code**
   - Follow the plan
   - Run tests as you go
   - **If baseline exists (Phase 4.5 completed):** Frame implementation as writing the minimal skill changes that address the specific baseline failures — don't over-engineer beyond what the failing test prompts require
   - Mark task `completed` when done, reset `task_retry_count[task_id]` to 0

**Step 6: Verify**

After each task or logical unit of work:

1. **Check task completion**
   - Does the code do what the task describes?
   - Do tests pass?

2. **Check acceptance criteria**
   - Map implementation to each criterion
   - Mark criteria as satisfied or pending

3. **Check design doc alignment**
   - Does implementation match the design?
   - If diverging → Ask user for approval

4. **Run plugin validation** ← SKILL DEVELOPMENT SPECIFIC
   ```bash
   bun scripts/validate-plugins.mjs
   ```
   Fix any validation errors before proceeding.

**Step 7: Loop Check**

- All BD tasks completed?
- All acceptance criteria satisfied?
- Tests passing?
- Plugin validation passing?
- Within cycle limit?

If YES to all → Exit loop, proceed to Phase 7.5
If NO and within limit → Increment `implementation_cycles` and `total_workflow_iterations`. If retrying the same task, increment `task_retry_count[task_id]`; if `task_retry_count[task_id] >= MAX_TASK_RETRIES`, escalate that task to user instead of retrying. Return to Step 5.

**Exit conditions:**
1. All BD tasks done + all criteria met + tests passing + validation passing — proceed to Phase 7.5
2. `implementation_cycles >= 10` — hard escalate to user
3. `task_retry_count[task_id] >= MAX_TASK_RETRIES` — escalate that specific task to user

---

## Phase 7.5: Verify + Benchmark (GREEN → REFACTOR)

> **TODO: #163 will integrate skill-creator/tessl here**

**Goal:** Verify skill changes against baseline, iterate on discovered rationalizations.

**This phase is a placeholder.** When #163 is implemented, it will:

1. **Run test prompts** with the skill changes applied
2. **Compare against baseline** — identify improvements and regressions
3. **If failures found:**
   - Identify new rationalizations (ways the model circumvents the skill)
   - Fix skill to close the loophole
   - Re-verify
4. **Repeat** up to `MAX_REFACTOR_ITERATIONS` (default: 3)
5. **If max iterations reached without full pass:** Escalate to user with:
   - Which test prompts still fail
   - What rationalizations were identified
   - Recommendation: accept, revise, or abandon

### REFACTOR Loop Structure

```text
refactor_iterations = 0

while refactor_iterations < MAX_REFACTOR_ITERATIONS:
    results = run_test_prompts(with_skill_changes=True)
    compare = diff(results, baseline)

    if compare.all_pass:
        break  # → Phase 8-9

    rationalizations = identify_new_rationalizations(compare.failures)
    apply_fixes(rationalizations)
    refactor_iterations++
    total_workflow_iterations++

if refactor_iterations >= MAX_REFACTOR_ITERATIONS:
    escalate_to_user(remaining_failures, rationalizations)
```

### Current Behavior (Pre-#163)

Until #163 integrates the testing tooling:

```text
Log: "Phase 7.5 (Verify+Benchmark/REFACTOR) — skipped: awaiting #163 integration"
```

Proceed directly to Phase 8-9.

**Exit condition:** All test prompts pass (or skipped pending #163, or escalated to user).

---

## Phase 8-9: Review Loop

**Goal:** Get external review, iterate until approved.

**Limits:**
- `MAX_REVIEW_ITERATIONS = 3`
- Hard escalation to user after limit reached

### Steps

**Step 8: Request Review**

Determine review scope based on change size:

| Change Size | Criteria | Action |
|-------------|----------|--------|
| **Trivial** | <10 lines, no logic (typos, comments, config) | Skip review → Phase 10 |
| **Small** | 1-2 files, simple logic | council:gemini-consultant |
| **Medium** | 3-5 files, moderate complexity | council:gemini-consultant + council:codex-consultant |
| **Large** | 6+ files, architectural impact | `/council` skill |

**For Small Changes:**
```text
Task(council:gemini-consultant):

Review this skill development implementation for issue #${ISSUE_NUM}:

## Changes Summary
[list files changed and what was done]

## Skill-Specific Changes
[highlight SKILL.md, workflow, agent, hook changes]

## Key Code
[paste the most important code changes]

## Acceptance Criteria
[list criteria and how each is satisfied]

Evaluate:
1. Code correctness
2. SKILL.md frontmatter validity
3. Workflow phase structure
4. Edge cases handled
5. Any bugs or issues?

State clearly: APPROVED, NEEDS_CHANGES (BLOCKING) for issues that must be fixed before merge, or NEEDS_CHANGES (WARNING only) for non-blocking suggestions.
```

**For Large Changes:**
```text
Use Skill tool:
skill: "council"
args: "Review skill development implementation for issue #${ISSUE_NUM}"
```

**Step 9: Process Review**

- **Approved:** → Exit loop, proceed to Phase 10
- **Approved with warnings only** (per arbitration table: one reviewer returns `NEEDS_CHANGES (WARNING only)` but resolution is "Proceed, note warnings") → Note warnings in commit/PR description, proceed to Phase 10
- **Hard limit reached:** (`review_iterations >= 3`) → Escalate to user
- **Changes requested (BLOCKING):** → Increment `review_iterations` and `total_workflow_iterations`, reset `implementation_cycles` to 0, create BD tasks for fixes, return to Phase 5 (proceed through Phase 7.5 before re-submitting for review)

### Consultant Arbitration (Medium Changes)

| Gemini | Codex | Resolution |
|--------|-------|------------|
| APPROVED | APPROVED | Proceed |
| APPROVED | NEEDS_CHANGES (BLOCKING) | Fix blocking issues |
| APPROVED | NEEDS_CHANGES (WARNING only) | Proceed, note warnings |
| NEEDS_CHANGES | APPROVED | Fix gemini's issues |
| NEEDS_CHANGES | NEEDS_CHANGES | Fix union of BLOCKING issues |

**Exit conditions:**
1. All reviewers return `APPROVED`, OR arbitration table resolves to "Proceed" (including "Proceed, note warnings") — proceed to Phase 10
2. `review_iterations >= 3` — hard escalate to user

---

## Phase 10: Finalization

**Goal:** Commit, push, create PR.

### Steps

1. **Run final plugin validation** ← SKILL DEVELOPMENT SPECIFIC
   ```bash
   bun scripts/validate-plugins.mjs
   ```

2. **Stage changes** (only files modified during this workflow)
   ```bash
   # Stage all tracked changes — modifications, deletions, and renames
   git add -u --
   # Stage untracked new files — scoped to plugin dir and known workflow paths to avoid staging secrets or unrelated artifacts
   git ls-files -z --others --exclude-standard -- "${PLUGIN_DIR}" docs/ CLAUDE.md AGENTS.md | while IFS= read -r -d '' file; do git add -- "$file"; done
   git status
   ```

3. **Commit with conventional message**
   ```bash
   git commit -m "$(cat << EOF
   feat(plugin-name): implement feature description

   - Change 1
   - Change 2

   Fixes #${ISSUE_NUM}
   EOF
   )"
   ```

4. **Push branch**
   ```bash
   git push -u origin "feature/issue-${ISSUE_NUM}"
   ```

5. **Write PR body**
   ```bash
   cat > /tmp/issue-${ISSUE_NUM}-pr.md << EOF
## Summary

Brief description of changes for issue #${ISSUE_NUM}.

## Changes

- Change 1
- Change 2

Closes #${ISSUE_NUM}
EOF
   ```

6. **Create PR** (capture PR_NUM for Phase 11)
   ```bash
   PR_URL=$(gh pr create \
     --base "$DEFAULT_BRANCH" \
     --title "feat(plugin-name): implement #${ISSUE_NUM} - brief description" \
     --body-file /tmp/issue-${ISSUE_NUM}-pr.md) || {
     echo "❌ FATAL: gh pr create failed. Aborting Phase 10."
     exit 1
   }
   PR_NUM=$(echo "$PR_URL" | grep -oE '[0-9]+$')
   if [[ -z "$PR_NUM" ]]; then
     echo "❌ FATAL: Could not extract PR number from URL: ${PR_URL}. Aborting."
     exit 1
   fi
   ```

7. **Report to user**
   - PR URL
   - Summary of changes
   - Any notes for reviewers

**Exit condition:** PR created and linked to issue.

---

## Phase 11: Cleanup

**Goal:** Clean up branch after PR merge/close.

### Steps

1. **Clean temp files**
   ```bash
   rm -f /tmp/issue-${ISSUE_NUM}-*.md
   ```

3. **Report status**
   - If PR created: "PR ready for review. Run cleanup after merge."
   - If aborted: "Branch preserved for debugging."

### Post-Merge Cleanup

```bash
# PR_NUM is the PR number from Phase 10's gh pr create output
PR_STATE=$(gh pr view ${PR_NUM} --json state --jq '.state')
if [[ "$PR_STATE" != "MERGED" && "$PR_STATE" != "CLOSED" ]]; then
  echo "PR #${PR_NUM} is still ${PR_STATE} — skipping branch deletion."
else
  DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
  [[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH=$(git branch -r | grep -E 'origin/(main|master)$' | head -1 | sed 's@.*origin/@@')
  if [[ -z "$DEFAULT_BRANCH" ]]; then
    echo "❌ FATAL: Could not detect default branch in Phase 11. Aborting cleanup."
    exit 1
  fi
  git checkout "$DEFAULT_BRANCH"
  git pull origin "$DEFAULT_BRANCH"
  # Use -D because squash/rebase merges don't produce a local merge commit
  git branch -D "feature/issue-${ISSUE_NUM}" 2>/dev/null || \
    echo "Could not delete branch feature/issue-${ISSUE_NUM} — delete manually if needed."

  # Restore stashed changes on the default branch (stash was created here in Phase 0)
  STASH_REF=$(git stash list | grep "plugin-dev-workflow-issue-${ISSUE_NUM}" | head -1 | cut -d: -f1)
  if [ -n "$STASH_REF" ]; then
    echo "Restoring stashed changes from Phase 0 ($STASH_REF)..."
    git stash pop "$STASH_REF" || {
      echo "⚠️  Stash pop failed (possible conflicts). Resolve conflicts manually, then run: git stash drop $STASH_REF"
    }
  fi
fi
```

**Exit condition:** Temp files cleaned, branch deleted after merge.

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Branch exists | Offer continue, delete, or suffix |
| Issue not found (404) | Abort immediately |
| Network timeout | Retry 3x with 5s backoff, then escalate |
| Tests fail | Fix before proceeding |
| Plugin validation fails | Fix before proceeding |
| Review rejected 3+ | Escalate to user |

---

## Human Escalation Triggers

Automatically involve the user when:

1. **Design divergence** — Implementation differs from design doc
2. **Review loop stuck** — 3+ review iterations without approval
3. **Unclear requirements** — Acceptance criteria ambiguous
4. **Scope creep** — Implementation reveals larger changes needed
5. **Test failures** — Can't make tests pass after 3 attempts
6. **Baseline regressions** — Phase 7.5 discovers regressions that can't be fixed within iteration cap
7. **Skill validation failures** — `bun scripts/validate-plugins.mjs` fails after fixes
