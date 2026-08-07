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

# Write body to temp file
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"
# ... write formatted body to $BODY_FILE ...

# Create issue
gh issue create \
  --repo "$REPO" \
  --title "[DLC] {Type}: {summary}" \
  --body-file "$BODY_FILE" \
  --label "dlc-{type}"
```

## Failure Fallback

If `gh issue create` fails (auth, network, missing repo):

1. Save the draft to `/tmp/dlc-draft-{timestamp}.md`
2. Print the full path to the user
3. Print the `gh issue create` command they can run manually
