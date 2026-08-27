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
- `type` = guidelines, bug, security, error-handling, quality, review, test-coverage, comment-accuracy, type-design
- `agent-name` = which review agent found this

### Rules for Inline Comments

- `line` is the line number on the **new version** of the file. Always use `"side": "RIGHT"`.
- Only post **actionable** inline comments. Do not post confirmations or "looks good" comments.
- Do not repeat items that are correctly addressed.
- If a finding cannot be mapped to a specific line in the diff, include it in the review body instead.

## 3. Build Review Body

The review body is the summary posted at the top of the review.

### Verdict Model

The verdict is computed from findings that survive the **confidence filter (≥65) and severity filter**, i.e. **before** the existing-comment dedup pass. Dedup only suppresses duplicate comment posting; the verdict reflects the PR's actual state:

| Condition (on post-filter findings) | Verdict heading |
|---|---|
| ≥1 `critical` | `### 🚨 Blocker found` |
| ≥1 `high` | `### ⚠️ Changes recommended` |
| ≥1 `medium` or `low` | `### 👀 Needs a closer look` |
| none | `### ✅ Approval recommended` |

### With Findings

```markdown
<!-- ci-review -->
### <verdict emoji> <verdict text>

<1–2 sentence verdict paragraph: name the most important finding(s) and why they matter — not a generic "issues were found">

**CI Review** · **Profile**: <single|lean|full|agent> | **Findings**: <total> (<N> critical, <N> high, <N> medium, <N> low)<if EXISTING_DEDUP_COUNT > 0: append " | **Already flagged**: <EXISTING_DEDUP_COUNT> (not re-posted)">

### Findings Not in Diff

<For each finding that could not be posted as an inline comment:>

- **[<severity>] <type>** `<file:line or "no location">` — <description>
  - **Recommendation:** <recommendation>
  - `Found by: <agent-name>`
```

*Note:* The `### Findings Not in Diff` section is omitted when there are no body-only findings.

*Edge case (all findings already commented):* When all surviving findings are excluded by existing-comment dedup (posted findings == 0 but verdict ≠ ✅), keep the severity-derived verdict, set `"comments": []`, and use this verdict paragraph: `All <N> findings were already flagged in existing comments — nothing new posted.` (with no `### Findings Not in Diff` section).

### No Findings

```markdown
<!-- ci-review -->
### ✅ Approval recommended

No actionable issues found. Reviewed <N> files across <M> changed lines.

**CI Review** · **Profile**: <single|lean|full|agent>
```

## 4. Construct the JSON Payload

Write the review payload as a structured JSON file (e.g. `${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json`):

```json
  "body": "<!-- ci-review -->\n### ⚠️ Changes recommended\n\nPotential SQL injection in user query handler.\n\n**CI Review** · **Profile**: lean | **Findings**: 2 (0 critical, 1 high, 1 medium, 0 low)\n...",
  "comments": [
    {
      "path": "src/api.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "**[high] bug**\n\nSQL injection via unsanitized user input.\n\n**Recommendation:** Use parameterized queries.\n\n`Found by: bug-detector`"
    }
  ]
}
```

If there are no inline comments (or zero findings), set `"comments": []`:

```json
{
  "body": "<!-- ci-review -->\n### ✅ Approval recommended\n\nNo actionable issues found. Reviewed 3 files across 45 changed lines.\n\n**CI Review** · **Profile**: lean",
  "comments": []
}
```

## 5. Deterministic Posting via `post-review.sh`

Posting is performed deterministically by the bundled `post-review.sh` script (invoked via the command given in SKILL.md Step 7).

The script automates the complete retry and fallback chain:

1. **Primary Attempt**: Submits review via `gh api repos/<owner>/<repo>/pulls/<PR#>/reviews` with event `"COMMENT"`.
2. **Retry 1 (Invalid comments)**: If the API rejects inline comments, prunes comments targeting files not in the PR diff and retries submission before falling back to body-only review.
3. **Retry 2 (Body-only review)**: If inline comments still fail, moves inline comments to the review body and submits a body-only review (`POST .../reviews`).
4. **Retry 3 (PR Comment fallback)**: If the reviews API fails (403, 401, permissions), falls back to `gh api repos/<owner>/<repo>/issues/<PR#>/comments` (or `gh pr comment`).
5. **Verification**: Verifies that a valid URL was returned by GitHub, outputs `Review posted: <URL>`, and exits 0.

## 6. Error Summary

| Error | Recovery (handled by `post-review.sh`) |
|-------|----------------------------------------|
| Invalid inline comment (file not in PR diff) | Prune comments on untouched files, retry with remaining |
| All inline comments invalid | Post body-only review (inline findings moved to body) |
| Review API 403/401 | Fall back to PR issue comment |
| `gh` CLI not found | Abort with install instructions |
| PR not found or closed | Abort with clear error message |
| No findings after filtering | Post body-only "no issues found" review |
