# DLC Issue Template

GitHub issues created by DLC skills follow this exact format.

## Title Format

```text
[DLC] {Type}: {summary}
```

Where `{Type}` is one of: `Security`, `Quality`, `Performance`, `Testing`, `PR Review`, `PR Validity`.

## Label

Apply the label corresponding to `{Type}` — the label uses the lowercase `{type}` slug shown on the right of each row:

- `Security` → `dlc-security`
- `Quality` → `dlc-quality`
- `Performance` → `dlc-perf`
- `Testing` → `dlc-test`
- `PR Review` → `dlc-pr-check`
- `PR Validity` → `dlc-pr-validity`

All labels are lowercase and prefixed with `dlc-`. `{Type}` and `{type}` are two distinct placeholders throughout this document — capitalized for the title, lowercase for the label slug — never the same token in different case.

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

The issue body embeds raw tool output that can be attacker- or repo-controlled (a
malicious dependency name, a crafted lint message). **Never heredoc it** — a
heredoc delimiter, even a randomly generated one, is a line the untrusted content
could theoretically contain, and shell-parsing untrusted text at all is the risk,
not just delimiter collision. Compose the body with the `Write` tool instead — it
writes bytes to disk without the shell ever parsing them. This is why
`security`/`quality`/`perf`/`test`/`pr-validity` carry `Write` in `allowed-tools`
alongside `pr-check` (see `docs/learnings.md` for why that doesn't loosen what
those otherwise-read-only skills can actually do).

The title has the same exposure as the body — a `--title "[DLC] {Type}: {summary}"`
shell argument is exactly as exposed as a heredoc, since `{summary}` is
agent-composed from the same scan output as the body and a double-quoted argument
does not stop `$(...)`/backtick expansion. Compose the title into its own file
too, and read it back with a command substitution: `"$(cat "$FILE")"` runs
command substitution exactly once and never re-parses its own captured output, so
this is safe even if `{summary}` still contains shell metacharacters after
stripping.

This lifecycle is identical in spirit to `pr-check`'s `REPLY_FILE` mechanism (see
`pr-check/SKILL.md` Step 4), extended to two files: a `Write` tool call is not a
shell command and can't see variables from a prior Bash call, and shell
variables don't persist across separate Bash calls either — every step below
that needs `$BODY_FILE`/`$TITLE_FILE`/`$REPO` recomputes it locally.

**Bash — prep:**

```bash
# Resolve a path unique to this repo AND this checkout, so two worktrees of the
# same remote don't collide. $REPO alone isn't enough — it's the git remote
# identity (from `gh repo view`), not the local checkout, so two worktrees of
# the same remote would otherwise resolve the identical path. (Two concurrent
# sessions in the SAME checkout still share a CHECKOUT_ID — the `[ ! -s ... ]`
# check in the posting step below turns that race into a clean abort, not a
# bad post.) $$ (PID) doesn't help either — each Bash tool call is a fresh
# process, so it would differ between this call and the posting call below.
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
CHECKOUT_ID=$(git rev-parse --show-toplevel | cksum | cut -d' ' -f1)
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-{skill-name}-$(printf '%s' "$REPO" | tr '/' '-')-$CHECKOUT_ID"
mkdir -p "$DLC_TMPDIR"
BODY_FILE="$DLC_TMPDIR/issue-body.md"
TITLE_FILE="$DLC_TMPDIR/issue-title.txt"
rm -f "$BODY_FILE" "$TITLE_FILE"   # clear content preserved from an earlier failed attempt before the Write tool runs
echo "BODY_FILE=$BODY_FILE"
echo "TITLE_FILE=$TITLE_FILE"   # print both resolved absolute paths — the Write tool is not a shell and can't expand them itself
```

**Write — compose** (two separate `Write` tool calls, using the paths just printed as `file_path`):
- `$BODY_FILE` ← the formatted issue body, following the template above.
- `$TITLE_FILE` ← a single line, exactly `[DLC] {Type}: {summary}`, with any newline, `` ` ``, `$`, or `"` characters in `{summary}` stripped first.

**Bash — post** (a separate tool call from the prep step, so recompute the paths first — they resolve the same way every time):

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
CHECKOUT_ID=$(git rev-parse --show-toplevel | cksum | cut -d' ' -f1)
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-{skill-name}-$(printf '%s' "$REPO" | tr '/' '-')-$CHECKOUT_ID"
BODY_FILE="$DLC_TMPDIR/issue-body.md"
TITLE_FILE="$DLC_TMPDIR/issue-title.txt"

if [ ! -s "$BODY_FILE" ] || [ ! -s "$TITLE_FILE" ]; then
  echo "ERROR: issue body or title missing/empty under $DLC_TMPDIR — the Write step may have failed" >&2
  exit 1
elif gh issue create \
  --repo "$REPO" \
  --title "$(cat "$TITLE_FILE")" \
  --body-file "$BODY_FILE" \
  --label "dlc-{type}"; then
  rm -f "$BODY_FILE" "$TITLE_FILE"
else
  DRAFT_TS=$(date +%s)
  mv "$BODY_FILE" "$DLC_TMPDIR/draft-$DRAFT_TS-body.md"
  mv "$TITLE_FILE" "$DLC_TMPDIR/draft-$DRAFT_TS-title.txt"
  echo "ERROR: gh issue create failed — body preserved at $DLC_TMPDIR/draft-$DRAFT_TS-body.md, title at $DLC_TMPDIR/draft-$DRAFT_TS-title.txt. Do NOT re-run this exact posting command directly with the preserved files — if the POST actually succeeded server-side despite this error, that would create a duplicate issue. Print both paths and the gh issue create command above to the user so they can inspect and run it manually." >&2
  exit 1
fi
```

`REPO` is acquired by this shared pattern itself, in both the prep and post
steps — it feeds both the scratch path and the `--repo` flag. `BRANCH` —
where a skill's Scan Metadata table needs it — is acquired locally by the
consumer instead, since not every scan type uses it (e.g. `pr-validity` has
none).

## Failure Fallback

If `gh issue create` fails, the error path above already renamed the
preserved body and title into `$DLC_TMPDIR/draft-{timestamp}-body.md` and
`-title.txt` — scoped by repo and checkout, so two failing runs in different
checkouts can't collide (two failures in the *same* checkout within the same
second still can; this narrows the window, it doesn't eliminate it) — and
printed both paths. Nothing further to do beyond surfacing them and the
manual `gh issue create` command to the user.
