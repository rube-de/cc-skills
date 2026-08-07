# DLC Issue Template

GitHub issues created by DLC skills follow this exact format.

## Title Format

```text
[DLC] {type}: {summary}
```

Where `{type}` is one of: `Security`, `Quality`, `Performance`, `Testing`, `PR Review`, `PR Validity`.

## Label

Apply the label corresponding to the `{type}`:

- `Security` → `dlc-security`
- `Quality` → `dlc-quality`
- `Performance` → `dlc-perf`
- `Testing` → `dlc-test`
- `PR Review` → `dlc-pr-check`
- `PR Validity` → `dlc-pr-validity`

All labels are lowercase and prefixed with `dlc-`.

## Issue Body Structure

> **No GitHub mentions:** an unneutralized `@`-prefixed token anywhere in an issue body notifies GitHub, regardless of whether the surrounding text is fenced. Two distinct cases, two distinct treatments:
>
> - When *you* are naming a reviewer, bot, or tool in prose you're composing yourself, just don't use an `@` prefix — the bare name reads fine on its own.
> - When a field quotes or copies technical content that legitimately contains an `@` character — a scoped package name, a decorator, an email address, a reviewer's own words carried into a Recommended Action or Finding — don't delete the `@`; insert a space immediately after it instead. Deleting it outright silently turns the token into different, misleading text (e.g. a broken remediation command a reader might copy-paste). The inserted space breaks GitHub's mention-linkification and any raw-substring mention scan just as effectively as deletion, while keeping the token recognizable. This applies everywhere in the body, not only the Raw Output field.

Use this template exactly — agents and dashboards parse these section headers:

````markdown
## Scan Metadata

| Field | Value |
|-------|-------|
| Repository | `{owner/repo}` |
| Branch | `{branch}` |
| Scan Date | `{YYYY-MM-DD HH:MM UTC}` |
| Skill | `/dlc:{skill-name}` |
| Project Type | `{detected type, e.g. node, python, rust, go, mixed}` |

## Findings Summary

| Severity | Count |
|----------|-------|
| Critical | {n} |
| High | {n} |
| Medium | {n} |
| Low | {n} |
| Info | {n} |
| **Total** | **{n}** |

## Findings Detail

### Critical

#### {finding-title}

- **File**: `{file-path}:{line}`
- **Tool**: `{tool that detected it, or "Claude analysis"}`
- **Description**: {what the issue is}
- **Recommendation**: {how to fix it}

> Repeat for each finding, grouped by severity (Critical > High > Medium > Low > Info).
> Omit empty severity sections.

## Recommended Actions

1. {Prioritized action item — most urgent first}
2. {Next action}
3. ...

## Raw Output

<details>
<summary>Full tool output</summary>

```
{raw CLI output, truncated to 500 lines max, with a space inserted immediately after every @ character}
```

</details>
````

## Issue Creation Command

```bash
# Detect repo
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Compute and print the body file path
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"
rm -f "$BODY_FILE"   # clear content preserved from an earlier failed attempt
echo "$BODY_FILE"
```

Write the formatted body to that exact printed path, following the template above:

- **If your skill's `allowed-tools` includes `Write`** (e.g. `pr-check`): the `Write` tool call is not a shell command and can't see `$BODY_FILE` — pass the absolute path just printed as `file_path`.
- **If it doesn't** (`security`, `quality`, `perf`, `test`, `pr-validity` are Bash-only): compose the file with a heredoc, quoting the delimiter so the shell does no expansion inside the body (a `$(...)` in a raw tool-output excerpt must stay inert text, not execute). Use a distinctive delimiter — not `EOF` — so an unlucky line of tool output can't terminate the heredoc early. **This is a separate Bash tool call from the prep block above — recompute `BODY_FILE` first:**

```bash
BODY_FILE="/tmp/dlc-issue-{the printed timestamp}.md"
cat <<'DLC_ISSUE_BODY_c8f3a1' > "$BODY_FILE"
{formatted issue body}
DLC_ISSUE_BODY_c8f3a1
```

Then, in a separate Bash tool call, validate the file is non-empty and create the issue using that same literal path — **do not recompute `TIMESTAMP`**, a fresh `$(date +%s)` produces a different, nonexistent path:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BODY_FILE="/tmp/dlc-issue-{the printed timestamp}.md"

if [ ! -s "$BODY_FILE" ]; then
  echo "ERROR: issue body missing or empty at $BODY_FILE — the write step may have failed" >&2
  exit 1
elif gh issue create \
  --repo "$REPO" \
  --title "[DLC] {Type}: {summary}" \
  --body-file "$BODY_FILE" \
  --label "dlc-{type}"; then
  rm -f "$BODY_FILE"
else
  echo "ERROR: gh issue create failed — body preserved at $BODY_FILE" >&2
  exit 1
fi
```

## Failure Fallback

If `gh issue create` fails (auth, network, missing repo) — the block above already preserves `$BODY_FILE` on failure instead of deleting it:

1. Save (or reuse) the draft at `/tmp/dlc-draft-{the same printed timestamp}.md`
2. Print the full path to the user
3. Print the `gh issue create` command they can run manually
