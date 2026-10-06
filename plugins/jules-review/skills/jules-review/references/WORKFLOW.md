# PR Review Posting Workflow

## Contents

- 1. Parse Council Findings
- 2. Map Verdict to GitHub Review Event
- 3. Determine Diff-Valid Lines
- 4. Build Inline Comments Array
- 5. Build Review Body
- 6. Confirm Before Posting
- 7. Post the Review
- 8. Fallback: gh pr comment
- Error Handling Summary

Detailed logic for posting council findings as a structured GitHub PR review with inline line comments.

## 1. Parse Council Findings

Only parse a valid council result: SKILL.md Step 5 "Check the Council Result" must have passed. A stopped, failed, or unparseable council run never reaches this section, so it can never turn into zero findings and a proposed `APPROVE`.

After the council completes, extract findings from its output. Each finding has:

```json
{
  "type": "security|performance|quality|architecture|bug|documentation",
  "severity": "critical|high|medium|low",
  "description": "What the issue is",
  "location": "path/to/file.ts:42",
  "recommendation": "How to fix it"
}
```

Parse the `location` field into `file` and `line`:

```bash
# Example: "src/api.ts:42" → file="src/api.ts", line=42
FILE=$(echo "$LOCATION" | cut -d: -f1)
LINE=$(echo "$LOCATION" | cut -d: -f2)
```

If a finding has no `location` or an unparseable location, treat it as a body-only finding (no inline comment).

## 2. Map Verdict to GitHub Review Event

Scan all findings and determine the **proposed** review event. It isn't final until the user confirms it in §6:

| Condition | GitHub Event |
|-----------|-------------|
| Any finding with severity `critical` | `REQUEST_CHANGES` |
| Findings present but none `critical` | `COMMENT` |
| No findings / all clear | `APPROVE` |

```bash
# FINDINGS_JSON is the JSON array of findings from the council output
EVENT="APPROVE"

for severity in $(echo "$FINDINGS_JSON" | jq -r '.[].severity // empty'); do
  if [ "$severity" = "critical" ]; then
    EVENT="REQUEST_CHANGES"
    break
  elif [ "$EVENT" = "APPROVE" ]; then
    EVENT="COMMENT"
  fi
done
```

## 3. Determine Diff-Valid Lines

To post inline comments, the file and line must fall within the PR diff. Lines outside the diff cannot receive inline comments.

### Parse Diff Hunks

```bash
# Get the PR diff
DIFF=$(gh pr diff <PR#>)

# Extract valid file:line pairs from diff hunks
# Diff hunks look like: @@ -old_start,old_count +new_start,new_count @@
# Lines starting with "+" (additions) are commentable on their new line number
# Lines starting with " " (context) are also commentable
# Lines starting with "-" (deletions) are NOT commentable
```

For each finding with a `file:line` location:

1. Check if `file` appears in the diff (matches a `diff --git a/<file> b/<file>` header)
2. Check if `line` falls within a diff hunk range for that file
3. If both pass → **inline comment**
4. If either fails → **body-only finding**

### Simplified Validation

If full hunk parsing is too complex, use this conservative approach:

```bash
# Get list of changed files
CHANGED_FILES=$(gh pr diff <PR#> --name-only)

# Check if the finding's file is in the changed files list
if echo "$CHANGED_FILES" | grep -qx "$FILE"; then
  # File is in the diff — attempt inline comment
  # gh api will reject if the line isn't valid, and we handle that gracefully
  INLINE=true
else
  INLINE=false
fi
```

## 4. Build Inline Comments Array

For each finding eligible for an inline comment, create a comment object:

```json
{
  "path": "src/api.ts",
  "line": 42,
  "body": "**[critical] security** `@jules`\n\nSQL injection vulnerability in query builder.\n\n**Recommendation:** Use parameterized queries instead of string concatenation."
}
```

### Comment Body Format

```
**[<severity>] <type>** `@jules`

<description>

**Recommendation:** <recommendation>
```

Collect all inline comments into a JSON array.

## 5. Build Review Body

The review body includes the overall summary, verdict, and any findings that could not be posted as inline comments.

### Body Structure

```markdown
`@jules`

## Council Review — <VERDICT>

**Mode**: <quick|full> | **Findings**: <total> (<critical> critical, <high> high, <medium> medium, <low> low)

### Summary

<council summary text>

### Findings (not in diff)

<For each finding without a valid inline location:>

- **[<severity>] <type>** — `<file:line or "no location">`: <description>
  - **Recommendation:** <recommendation>
```

If all findings are posted as inline comments, the "Findings (not in diff)" section can be omitted.

If there are no findings at all, the body should be:

```markdown
`@jules`

## Council Review — APPROVE

No issues found. This PR looks good.
```

If the user downgrades to `COMMENT` (in §6 or §7), rewrite every body variant you post, both `$REVIEW_BODY` and `$REVIEW_BODY_WITH_ALL_FINDINGS`: change the header to `## Council Review — COMMENT`, and replace `No issues found. This PR looks good.` with `No issues found by the council.` so the comment doesn't read as an approval.

## 6. Confirm Before Posting

Never call the reviews API (§7) or `gh pr comment` (§8) before the user answers this question in the current run.

Show the user:

- PR number and title
- Proposed event (`$EVENT`)
- Finding counts: total, and critical / high / medium / low
- How many findings go inline vs. into the review body
- Council participation as reported (e.g. `3/4 consultants`)
- Whether the secret scan was skipped (`--allow-unscanned`)

Then ask:

```
AskUserQuestion:
  "Post this council review to PR #<number> as <EVENT>?"
  Options (EVENT is APPROVE or REQUEST_CHANGES): Post as <EVENT> | Downgrade to COMMENT | Cancel
  Options (EVENT is COMMENT):                     Post as COMMENT | Cancel
```

| Answer | Action |
|--------|--------|
| Post as `<EVENT>` | Continue to §7 with `$EVENT` unchanged |
| Downgrade to COMMENT | Set `EVENT="COMMENT"`, rewrite the body header (see §5), continue to §7 |
| Cancel | Post nothing: no reviews API call, no `gh pr comment`. Go to SKILL.md Step 7 |
| No answer (tool unavailable, empty answer, or error) | Same as Cancel |

The confirmed `$EVENT` stays unchanged for retries in §7 and the fallback in §8; they never change it to `APPROVE` or `REQUEST_CHANGES`. The only change allowed is a downgrade to `COMMENT`, and only after the user explicitly approves it in §7 "Handling a Rejected Review Event".

## 7. Post the Review

### Primary Method: gh api

```bash
# Resolve owner and repo from the current git remote
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)

# Build the payload
PAYLOAD=$(jq -n \
  --arg event "$EVENT" \
  --arg body "$REVIEW_BODY" \
  --argjson comments "$COMMENTS_JSON" \
  '{event: $event, body: $body, comments: $comments}')

# Post the review
REVIEW_URL=$(echo "$PAYLOAD" | gh api \
  "repos/$OWNER/$REPO/pulls/<PR#>/reviews" \
  --method POST \
  --input - \
  --jq '.html_url')

echo "Review posted: $REVIEW_URL"
```

### Classify a Failed Post First

GitHub returns HTTP 422 both for a rejected review event and for invalid inline comments. Read the error message before retrying:

1. Message rejects the event (e.g. `Can not approve your own pull request`, `Can not request changes on your own pull request`): go straight to **Handling a Rejected Review Event**. Skip the inline-comment retries.
2. Message points at a comment path, line, or position in the diff: use **Handling Inline Comment Failures**.
3. 401/403: use §8.
4. Any other error: stop, report the raw GitHub error, print the review body, and post nothing (no §8 fallback).

### Handling Inline Comment Failures

If the `gh api` call fails because of invalid inline comments (line not in diff):

1. **First retry**: Remove only the invalid comment(s) from the array and retry with remaining valid comments
2. **Second retry**: If still failing, post review with empty comments array (all findings in body)

If a retry fails for a different reason, or the second retry fails, classify that new error with **Classify a Failed Post First** again. Don't loop: if the empty-comments retry fails with another inline-comment error, treat it as rule 4 there.

```bash
# First: filter out the invalid comment and retry
COMMENTS_JSON=$(echo "$COMMENTS_JSON" | jq 'del(.[] | select(.path == "'"$INVALID_PATH"'" and .line == '"$INVALID_LINE"'))')

PAYLOAD=$(jq -n \
  --arg event "$EVENT" \
  --arg body "$REVIEW_BODY" \
  --argjson comments "$COMMENTS_JSON" \
  '{event: $event, body: $body, comments: $comments}')

echo "$PAYLOAD" | gh api \
  "repos/$OWNER/$REPO/pulls/<PR#>/reviews" \
  --method POST \
  --input -

# If still failing: drop all inline comments, put everything in body
PAYLOAD=$(jq -n \
  --arg event "$EVENT" \
  --arg body "$REVIEW_BODY_WITH_ALL_FINDINGS" \
  '{event: $event, body: $body, comments: []}')

echo "$PAYLOAD" | gh api \
  "repos/$OWNER/$REPO/pulls/<PR#>/reviews" \
  --method POST \
  --input -
```

### Handling a Rejected Review Event

GitHub rejects `APPROVE` and `REQUEST_CHANGES` in some cases, e.g. when the authenticated user authored the PR (HTTP 422). Don't retry with the same or a different non-`COMMENT` event. Ask via `AskUserQuestion`: **Downgrade to COMMENT** / **Cancel**. On downgrade, set `EVENT="COMMENT"`, rewrite every body variant (see §5), and post again. On Cancel or no answer, post nothing.

## 8. Fallback: gh pr comment

If the review API fails entirely (permissions, auth issues) after the user confirmed in §6, fall back to posting a regular PR comment. Never use this fallback after Cancel or without an answer:

```bash
gh pr comment <PR#> --body "$REVIEW_BODY_WITH_ALL_FINDINGS"
```

In fallback mode:
- Inline comments are not possible
- All findings go into the comment body
- Note to user: "Posted as PR comment (review API unavailable)"

If `gh pr comment` itself fails, stop: report the raw error and print the review body so the user still has the content. Don't retry.

## Error Handling Summary

| Error | Recovery |
|-------|----------|
| Invalid inline comment line | Remove that comment, retry with remaining |
| All inline comments invalid | Post review with empty comments array (all findings in body) |
| `APPROVE` / `REQUEST_CHANGES` rejected (422) | Ask: downgrade to COMMENT or cancel; never escalate |
| Review API 403/401 | Fall back to `gh pr comment` (only after §6 confirmation) |
| User cancels, or no answer in §6 | Post nothing; print the review body |
| `gh pr comment` fallback fails | Stop; report the raw error and print the review body |
| A retry fails | Re-classify the new error (§7 "Classify a Failed Post First") |
| `gh` CLI not found | Abort with install instructions |
| No PR found | Abort with clear error |
| Council returns no output | Abort with error, suggest retrying |
| Council stopped (gitleaks notice, secrets detected, error) or no valid reviewer results | Abort, post nothing (SKILL.md Step 5) |
