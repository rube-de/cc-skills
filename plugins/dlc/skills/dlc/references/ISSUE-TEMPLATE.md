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
`pr-check/SKILL.md` Step 4): a `Write` tool call is not a shell command and can't
see variables from a prior Bash call, and shell variables don't persist across
separate Bash calls either. `$REPO` is cheap and deterministic, so the post step
below just recomputes it. `$DLC_TMPDIR` is not — it's created with `mktemp -d`
precisely so it can't be recomputed (predictability is the bug, not a feature to
preserve) — so it crosses the Bash → Write → Bash boundary the same way `{rest_id}`
already does in `pr-check/SKILL.md` Step 4: the prep step prints the literal
resolved paths, and both the `Write` calls and the post step use that literal
text, not a re-derived expression. If the printed path gets mistyped or dropped,
the post step's `[ ! -s ... ]` check just aborts — it can never point at the
wrong file and post someone else's draft.

**Bash — prep:**

```bash
# mktemp -d creates a directory no other process — concurrent or not, same
# checkout or a different one — can ever be handed, and (verified on both GNU
# coreutils and BSD/macOS mktemp) it's mode 0700 regardless of umask, so it
# needs no separate `umask 077` call. This is what actually prevents scratch-file
# cross-contamination between runs; earlier deterministic repo+checkout-scoped
# paths could not. It does NOT prevent two concurrent runs from each
# successfully creating their own issue — that's a separate problem this
# doesn't attempt to solve.
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
if [ -z "$REPO" ]; then
  echo "ERROR: gh repo view returned no repository — check gh auth status. Aborting before composing a body with a blank Repository field." >&2
  exit 1
fi
# Check the result explicitly — an unchecked `mktemp -d` that fails (missing/
# unwritable TMPDIR) leaves DLC_TMPDIR empty, silently turning BODY_FILE/
# TITLE_FILE into root-level paths ("/issue-body.md"). A relative $TMPDIR
# produces the same danger via a different route: mktemp then returns a
# relative path, which the Write step and this Bash call could resolve
# against different working directories. The `case` below catches both —
# only an absolute path passes.
DLC_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/dlc-{skill-name}.XXXXXXXX") || DLC_TMPDIR=""
case "$DLC_TMPDIR" in
  /*) : ;;
  *) echo "ERROR: failed to create a private scratch directory — mktemp failed, or TMPDIR resolved to a non-absolute path ('$DLC_TMPDIR')" >&2; exit 1 ;;
esac
# An absolute path isn't enough on its own: if $TMPDIR contains shell
# metacharacters ($(), backticks), mktemp preserves them verbatim, and this
# path gets threaded forward as literal source text into a later Bash call's
# double-quoted assignment — which WOULD re-expand them at that point. Reject
# anything outside a safe path-character allowlist before it's ever printed.
UNSAFE=$(printf '%s' "$DLC_TMPDIR" | tr -d 'A-Za-z0-9/._-')
if [ -n "$UNSAFE" ]; then
  echo "ERROR: scratch directory path contains unexpected characters — refusing to use it: '$DLC_TMPDIR'" >&2
  exit 1
fi
BODY_FILE="$DLC_TMPDIR/issue-body.md"
TITLE_FILE="$DLC_TMPDIR/issue-title.txt"
echo "REPO=$REPO"       # the Write step below needs this for the Scan Metadata Repository row and can't see this shell
echo "BODY_FILE=$BODY_FILE"
echo "TITLE_FILE=$TITLE_FILE"   # print both resolved absolute paths — the Write tool is not a shell and can't expand them itself
```

**Write — compose** (two separate `Write` tool calls, using the paths just printed as `file_path`):
- `$BODY_FILE` ← the formatted issue body, following the template above.
- `$TITLE_FILE` ← a single line, exactly `[DLC] {Type}: {summary}`, with any newline, `` ` ``, `$`, or `"` characters in `{summary}` stripped first, and every `@` in `{summary}` neutralized (space inserted immediately after it) per the No GitHub Mentions rule above — the post step's validation rejects an unneutralized `@` in the title exactly as it does in the body.

**Bash — post** (a separate tool call from the prep step — `REPO` is recomputed since it's deterministic; `BODY_FILE`/`TITLE_FILE` are the literal paths the prep step printed, substituted in as-is since `$DLC_TMPDIR`'s random suffix cannot be regenerated):

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
if [ -z "$REPO" ]; then
  echo "ERROR: gh repo view returned no repository — check gh auth status." >&2
  exit 1
fi
BODY_FILE="{literal path printed by prep}"
TITLE_FILE="{literal path printed by prep}"

if [ ! -s "$BODY_FILE" ] || [ ! -s "$TITLE_FILE" ]; then
  echo "ERROR: issue body or title missing/empty at $BODY_FILE / $TITLE_FILE — the Write step may have failed" >&2
  exit 1
fi

# Fail closed on content the Write step should already have handled: an
# unneutralized @ (immediately followed by a username character, so a
# space-neutralized "@ " does not match) means a live mention could reach
# GitHub; a missing required section means the body is truncated or malformed.
if grep -qE '@[[:alnum:]_-]' "$BODY_FILE" "$TITLE_FILE"; then
  echo "ERROR: unneutralized @ mention found in $BODY_FILE or $TITLE_FILE — insert a space immediately after every @ in the Write step per the No GitHub mentions rule above, then re-run this block. Nothing has been posted yet; this is safe to retry." >&2
  exit 1
fi
for section in '## Scan Metadata' '## Findings Summary' '## Findings Detail' '## Recommended Actions' {additional-required-sections}; do
  grep -qF "$section" "$BODY_FILE" || { echo "ERROR: required section '$section' missing from $BODY_FILE — the Write step produced an incomplete body. Fix it in the Write step, then re-run this block. Nothing has been posted yet; this is safe to retry." >&2; exit 1; }
done

# Capture the post result before cleanup runs, so a failing `rm -f` (e.g. the
# directory was already removed out-of-band) can never flip a successful post
# into a reported failure and invite a duplicate-creating retry.
if gh issue create \
  --repo "$REPO" \
  --title "$(cat "$TITLE_FILE")" \
  --body-file "$BODY_FILE" \
  --label "dlc-{type}"; then
  POST_OK=1
else
  POST_OK=0
fi

if [ "$POST_OK" = 1 ]; then
  rm -f "$BODY_FILE" "$TITLE_FILE" 2>/dev/null && rmdir "$(dirname "$BODY_FILE")" 2>/dev/null || echo "Note: issue created successfully; scratch cleanup of $BODY_FILE / $TITLE_FILE (or its now-empty directory) failed (non-fatal, nothing to retry)." >&2
else
  echo "ERROR: gh issue create failed — body preserved at $BODY_FILE, title at $TITLE_FILE. Do NOT re-run this exact posting command directly with the preserved files — if the POST actually succeeded server-side despite this error, that would create a duplicate issue. Print both paths and the gh issue create command above to the user so they can inspect and run it manually." >&2
  exit 1
fi
```

`{additional-required-sections}` is a per-skill substitution: `security`,
`quality`, `perf`, and `test` supply `'## Raw Output'` (their body template above
includes it); `pr-validity` supplies nothing — delete the `{additional-required-sections}`
token entirely from the `for section in ...` line, don't paste a description of
why it's empty in its place, or the loop will grep for a literal section header
that can never exist and always abort issue creation. Its own "Body must
contain" list in its `SKILL.md` has no Raw Output section, so the baseline four are all it
requires.

`REPO` is acquired by this shared pattern itself, in both the prep and post
steps — it feeds both the Scan Metadata table (via the prep step's echo, since
only the `Write` step needs the value) and the `--repo` flag (recomputed fresh
in post, since that step runs its own `gh` call anyway). `BRANCH` — where a
skill's Scan Metadata table needs it — is acquired and printed locally by the
consumer instead, since not every scan type uses it (e.g. `pr-validity` has
none).

## Failure Fallback

If `gh issue create` fails, the body and title stay exactly where the prep step
put them — under a `mktemp -d` directory nothing else will ever be handed, so
there is no same-second collision window and nothing to rename. The error
message above already prints both paths. Nothing further to do beyond
surfacing them and the manual `gh issue create` command to the user.
