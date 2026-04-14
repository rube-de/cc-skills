# Review Posting Reference

How to post CI review findings as an atomic GitHub PR review with inline comments.

## 1. Always Use Event "COMMENT"

**IMPORTANT:** Never use `"APPROVE"` or `"REQUEST_CHANGES"`. Always use `"COMMENT"`.

This is a CI reviewer — it provides feedback, it does not gate merges.

## 2. Build Inline Comments

For each finding that has a valid `file:line` in the PR diff, create an inline comment:

```json
{
  "path": "src/api.ts",
  "line": 42,
  "side": "RIGHT",
  "body": "**[high] bug**\n\nSQL injection via unsanitized user input.\n\n**Recommendation:** Use parameterized queries.\n\n`Found by: bug-detector`"
}
```

### Inline Comment Body Format

```
**[<severity>] <type>**

<description>

**Recommendation:** <recommendation>

`Found by: <agent-name>`
```

Where:
- `severity` = critical, high, medium, low
- `type` = guidelines, bug, security, error-handling, quality, review (single-reviewer), test-coverage, comment-accuracy, type-design
- `agent-name` = which review agent found this

### Rules for Inline Comments

- `line` is the line number on the **new version** of the file. Always use `"side": "RIGHT"`.
- Only post **actionable** inline comments. Do not post confirmations or "looks good" comments.
- Do not repeat items that are correctly addressed.
- If a finding cannot be mapped to a specific line in the diff, include it in the review body instead.

## 3. Build Review Body

The review body is the summary posted at the top of the review.

### With Findings

```markdown
## CI Review

**Profile**: <single|lean|full> | **Findings**: <total> (<N> critical, <N> high, <N> medium, <N> low)

### Summary

<2-3 sentence overview of the review — what was checked, key themes>

### Findings Not in Diff

<For each finding that could not be posted as an inline comment:>

- **[<severity>] <type>** `<file:line or "no location">` — <description>
  - **Recommendation:** <recommendation>
  - `Found by: <agent-name>`
```

### No Findings

```markdown
## CI Review

No actionable issues found. Reviewed <N> files across <M> changed lines.

**Profile**: <single|lean|full>
```

## 4. Construct the JSON Payload

Use `jq` to build the payload. This is robust for dynamic construction:

```bash
# Resolve repo
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
OWNER="${OWNER_REPO%%/*}"
REPO="${OWNER_REPO#*/}"

# Build payload (COMMENTS_JSON is a JSON array of comment objects)
PAYLOAD=$(jq -n \
  --arg event "COMMENT" \
  --arg body "$REVIEW_BODY" \
  --argjson comments "$COMMENTS_JSON" \
  '{event: $event, body: $body, comments: $comments}')

# Post the review
REVIEW_URL=$(echo "$PAYLOAD" | gh api \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" \
  --method POST \
  --input - \
  --jq '.html_url')

echo "Review posted: $REVIEW_URL"
```

If there are no inline comments, omit the `comments` array entirely:

```bash
PAYLOAD=$(jq -n \
  --arg event "COMMENT" \
  --arg body "$REVIEW_BODY" \
  '{event: $event, body: $body}')
```

## 5. Error Handling Chain

If the `gh api` call fails, follow this retry chain:

### Retry 1: Remove Invalid Comments (up to 3 attempts)

If the error mentions a specific invalid comment (line not in diff), remove it and retry. Repeat up to 3 times. If still failing after 3 retries, proceed to Retry 2.

```bash
# Remove the invalid comment
COMMENTS_JSON=$(echo "$COMMENTS_JSON" | jq 'del(.[] | select(.path == "'"$INVALID_PATH"'" and .line == '"$INVALID_LINE"'))')

# Rebuild and retry
PAYLOAD=$(jq -n \
  --arg event "COMMENT" \
  --arg body "$REVIEW_BODY" \
  --argjson comments "$COMMENTS_JSON" \
  '{event: $event, body: $body, comments: $comments}')

echo "$PAYLOAD" | gh api \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" \
  --method POST \
  --input -
```

### Retry 2: Body-Only Review

If inline comments keep failing, move all findings into the review body and post with no comments:

```bash
PAYLOAD=$(jq -n \
  --arg event "COMMENT" \
  --arg body "$REVIEW_BODY_WITH_ALL_FINDINGS" \
  '{event: $event, body: $body}')

echo "$PAYLOAD" | gh api \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" \
  --method POST \
  --input -
```

### Retry 3: Fallback to PR Comment

If the review API fails entirely (403, 401, permissions), fall back to a regular PR comment:

```bash
gh pr comment "$PR_NUMBER" --body "$REVIEW_BODY_WITH_ALL_FINDINGS"
```

Note in the comment: "*(Posted as PR comment — review API unavailable)*"

## 6. Error Summary

| Error | Recovery |
|-------|----------|
| Invalid inline comment (line not in diff) | Remove that comment, retry with remaining |
| All inline comments invalid | Post body-only review (no comments array) |
| Review API 403/401 | Fall back to `gh pr comment` |
| `gh` CLI not found | Abort with install instructions |
| PR not found or closed | Abort with clear error message |
| No findings after filtering | Post body-only "no issues found" review |
