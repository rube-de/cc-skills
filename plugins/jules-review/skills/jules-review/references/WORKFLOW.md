# PR Review Posting Workflow

Detailed logic for posting council findings as a structured GitHub PR review with inline line comments.

## 1. Parse Council Findings

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

Scan all findings and determine the review event:

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

## 6. Post the Review

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

### Handling Inline Comment Failures

If the `gh api` call fails because of invalid inline comments (line not in diff):

1. **First retry**: Remove only the invalid comment(s) from the array and retry with remaining valid comments
2. **Second retry**: If still failing, post review with empty comments array (all findings in body)

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

## 7. Fallback: gh pr comment

If the review API fails entirely (permissions, auth issues), fall back to posting a regular PR comment:

```bash
gh pr comment <PR#> --body "$REVIEW_BODY_WITH_ALL_FINDINGS"
```

In fallback mode:
- Inline comments are not possible
- All findings go into the comment body
- Note to user: "Posted as PR comment (review API unavailable)"

## Error Handling Summary

| Error | Recovery |
|-------|----------|
| Invalid inline comment line | Remove that comment, retry with remaining |
| All inline comments invalid | Post review with empty comments array (all findings in body) |
| Review API 403/401 | Fall back to `gh pr comment` |
| `gh` CLI not found | Abort with install instructions |
| No PR found | Abort with clear error |
| Council returns no output | Abort with error, suggest retrying |
