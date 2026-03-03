---
name: git-ops
description: >-
  Git hygiene: clean up merged branches, prune stale remotes,
  and verify repository state.
allowed-tools: [Bash, AskUserQuestion]
---

# DLC: Git Ops

Automated git hygiene — clean up merged branches, prune stale remote tracking refs, and verify repository state.

## Step 1: Sync with Remote

Fetch latest state, prune deleted remote branches, and sync the default branch.

```bash
# Detect the default branch dynamically
# 2>/dev/null suppresses errors when symbolic-ref is not set (e.g. shallow clone)
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')

# Fallback: check for main, then master
if [ -z "$DEFAULT_BRANCH" ]; then
  if git show-ref --verify --quiet refs/remotes/origin/main; then
    DEFAULT_BRANCH="main"
  elif git show-ref --verify --quiet refs/remotes/origin/master; then
    DEFAULT_BRANCH="master"
  else
    echo "ERROR: Cannot determine default branch. Aborting."
    exit 1
  fi
fi

echo "Default branch: $DEFAULT_BRANCH"

# Fetch and prune stale remote tracking refs
git fetch origin --prune

# Abort if worktree has uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Worktree is dirty — stash or commit your changes before running git-ops."
  exit 1
fi

# Switch to default branch and pull (fast-forward only to avoid merge commits)
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH"
```

If `git pull --ff-only` fails, abort with: "ERROR: non-fast-forward update for $DEFAULT_BRANCH. Resolve manually."

## Step 2: Detect Cleanup Candidates

Combine two detection methods and deduplicate:

```bash
# Method 1: Branches fully merged into the default branch
MERGED=$(git branch --merged "$DEFAULT_BRANCH" | grep -v '^\*' | sed 's/^[[:space:]]*//')

# Method 2: Branches whose remote tracking ref is gone (plumbing command for reliable parsing)
GONE=$(git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads | grep '\[gone\]' | cut -d' ' -f1)

# Combine and deduplicate: track which method(s) detected each branch
# Branches in both lists get reason "merged + gone"
```

**Filter out protected branches** — never include these in candidates:
- `$DEFAULT_BRANCH` (the dynamically detected default branch)
- `main`
- `master`
- `develop`
- Any branch matching `release/*`

```bash
# Filter protected branches from the combined candidate list
echo "$CANDIDATES" | grep -v -E "^(main|master|develop|${DEFAULT_BRANCH})$" | grep -v '^release/'
```

For each candidate, record:

| Field | Value |
|-------|-------|
| `name` | Branch name |
| `reason` | `merged` (from method 1), `gone` (from method 2), or `merged + gone` (both) |
| `has_remote` | `yes` if `git ls-remote --exit-code --heads origin "$name"` succeeds, `no` otherwise |

If no candidates are found, print "No cleanup candidates found. Repository is clean." and skip to Step 6.

## Step 3: Check Commit Message Quality

Check whether commits on the current branch follow the conventional commit format required by `semantic-release`.

```bash
# Check commits on current branch not yet merged into default branch
COMMITS=$(git log --format="%s" "origin/${DEFAULT_BRANCH}..HEAD" 2>/dev/null)

if [ -z "$COMMITS" ]; then
  echo "No commits ahead of ${DEFAULT_BRANCH} — skipping commit quality check."
else
  TOTAL=0; CONVENTIONAL=0; NON_CONVENTIONAL=0; BAD_MSGS=""
  while IFS= read -r msg; do
    TOTAL=$((TOTAL + 1))
    if echo "$msg" | grep -qE "^(feat|fix|chore|docs|style|refactor|test|perf|ci|build|revert)(\(.+\))?: .+"; then
      CONVENTIONAL=$((CONVENTIONAL + 1))
    else
      NON_CONVENTIONAL=$((NON_CONVENTIONAL + 1))
      BAD_MSGS="$BAD_MSGS\n  - \"$msg\""
    fi
  done <<EOF
$COMMITS
EOF

  if [ "$NON_CONVENTIONAL" -gt 3 ]; then
    COMMIT_SEVERITY="High"
  elif [ "$NON_CONVENTIONAL" -gt 0 ]; then
    COMMIT_SEVERITY="Medium"
  else
    COMMIT_SEVERITY="Info"
  fi

  echo "Commit quality: $COMMIT_SEVERITY ($CONVENTIONAL/$TOTAL conventional)"
fi
```

**Severity table:**

| Condition | Severity |
|-----------|----------|
| All commits conventional | Info (positive) |
| Any non-conventional commit | Medium |
| More than 3 non-conventional commits | High |

Store: `total_commits`, `conventional_count`, `non_conventional_count`, list of non-conventional messages.

This check is **informational only** — results feed into the Step 6 report; no GitHub issue is created.

## Step 4: Present and Confirm

Display the candidate list with reasons:

```text
Found {n} branch(es) to clean up:

  {branch-1}  (merged, has_remote: no)          → delete local only
  {branch-2}  (gone, has_remote: no)            → delete local only
  {branch-3}  (merged + gone, has_remote: yes)  → delete local + remote
```

Use `AskUserQuestion` with three options:

| Option | Behavior |
|--------|----------|
| **Delete all** | Proceed to delete all candidates |
| **Let me pick** | Present each branch individually for yes/no selection |
| **Skip** | Abort cleanup — no branches deleted |

If the user selects **Skip**, print "Cleanup skipped." and jump to Step 6.

If the user selects **Let me pick**, iterate through each candidate and use `AskUserQuestion` to confirm deletion individually. Collect the confirmed subset.

## Step 5: Execute Cleanup

For each confirmed branch:

```bash
# Safe delete — Git will refuse if the branch is not fully merged
if ! git branch -d "$BRANCH_NAME"; then
  echo "WARNING: Failed to delete $BRANCH_NAME — skipping."
  continue
fi

# If the branch has a remote tracking ref, delete it from origin
if git ls-remote --exit-code --heads origin "$BRANCH_NAME" > /dev/null; then
  git push origin --delete "$BRANCH_NAME"
fi
```

**Safety rules:**
- Use `-d` (NOT `-D`) — Git's built-in safety check prevents deleting unmerged branches
- NEVER delete protected branches (`$DEFAULT_BRANCH`, `main`, `master`, `develop`, `release/*`) even if they appear in candidates (defense-in-depth)
- If `git branch -d` fails for a branch, report the failure and continue with the next branch — do not abort the entire cleanup
- If `git push origin --delete` fails, report the failure but count the local deletion as successful

## Step 6: Report

Print a summary:

```text
Git ops complete.

  Before: {n} local branches
  After:  {n} local branches
  Deleted: {n} branches

  Deleted:
    - {branch-1} (merged)
    - {branch-2} (gone)

  Failed (if any):
    - {branch-3}: not fully merged (use git branch -D to force)

  Remaining:
    - main
    - develop
    - feature/in-progress

Commit message quality:
  - Total commits on branch: {n}
  - Conventional: {n}  Non-conventional: {n}
  - Status: [✓ all conventional | ⚠ {n} non-conventional — severity: Medium/High]
  {For each non-conventional commit:}
  - ✗ "{message}"
```

If no branches were deleted (skip or no candidates), only print the "Remaining" section with the current branch list.

If no commits are ahead of the default branch (Step 3 found an empty range), print:
"No commits ahead of {DEFAULT_BRANCH} to check." in place of the commit quality section.
