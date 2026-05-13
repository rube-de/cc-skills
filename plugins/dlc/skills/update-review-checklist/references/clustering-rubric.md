# Clustering Rubric

Read this in Step 3 to apply the hard-skip filter and again in Step 4 to cluster surviving comments by theme.

## Hard-Skip Patterns (Step 3)

Drop a comment from clustering when its body matches any of the following. These patterns produce noise, not patterns worth promoting to a checklist.

The formatting-nits row in the table below describes the pattern in prose to avoid GFM table escape ambiguity. The literal regex an implementation should use is:

```regex
^\s*(nit|style|format):
```

Matched case-insensitively. The leading `\s*` permits accidental leading whitespace (spaces or tabs) so a comment body like `"  nit: trailing whitespace"` still matches. Markdown preamble characters like `>`, `-`, or `*` are not whitespace and so are *not* matched — in practice review-tool comment bodies are delivered without those prefixes, so widening the regex to cover them would add noise without adding signal.

| Pattern | Why dropped |
|---|---|
| Pure typo flags (`typo:`, `s/foo/bar`, `^typo in` lead-in) | One-off lexical errors; not a checklist-worthy class |
| Formatting nits whose body starts with `nit:`, `style:`, or `format:` (case-insensitive) *and* the comment proposes no semantic change | Style is handled by linters, not human checklist gates |
| "Consider …" / "What about …" wishlist comments with no specific action and no commit response | Already filtered by resolved-by-commit, but defensive — drop if `severity == null` and body starts with these |
| Praise / acknowledgement (`LGTM`, `nice`, `👍`, etc., body < 40 chars) | No action proposed |
| CodeRabbit no-findings summary: `^actionable comments posted:\s*0\b` | Header-only review summary, no member finding to cluster |
| Qodo no-findings summary: `^code review by qodo` followed by all-zero category counters (e.g. `🐞 Bugs (0)` AND `📘 Rule violations (0)` AND `📎 Requirement gaps (0)`) | All-zero counters = no findings; keep if any counter > 0 |
| Empty or near-empty bodies (after stripping whitespace and markdown, < 20 chars) | No content to cluster on; usually a wrapper for inline thread comments which arrive separately |

Match case-insensitively. If a comment matches a skip pattern AND carries a severity label (`high`/`medium`/`low`), **keep it** — severity-labelled findings are signal even when their leading word is "nit".

The hard-skip rules above are content-defined, not author-defined. Bot accounts that post substantive reviews (Copilot, CodeRabbit non-zero summaries, Codex, Gemini, Qodo non-zero summaries) pass through; only their explicit no-findings summary formats are caught. This generalises across repos with any reviewer mix — human-led, bot-led, or hybrid.

## Severity Weights

Each surviving comment carries a `severity` field set by the helper script (one of `high`, `medium`, `low`, `null`). Map to weights when computing cluster weight:

| `severity` | Weight |
|---|---|
| `high` | 3 |
| `medium` | 2 |
| `low` or `null` | 1 |

A cluster's weight is the sum of member weights. Use weight to sort clusters in Step 4 — heaviest first — so the most important patterns surface at the top of the PR.

## Clustering Rules (Step 4)

**The core rule:** cluster by *what the reviewer is asking the author to do*, not by the file, line, or surface text.

Two comments belong in the same cluster when both of the following hold:

1. **Same ask shape.** The action the reviewer requests is structurally the same (e.g. "add a null check before this access", "rename to match the verb-noun convention", "extract this duplicated block").
2. **Same domain or scope.** The ask applies to the same kind of code (accessibility on disclosure components, error handling in async pipelines, validation at API boundaries, etc.).

Two comments do **not** belong in the same cluster when:

- Both touch the same file or function but ask for different things ("rename this var" vs. "add error handling" — different asks).
- Both ask for the same generic improvement but in unrelated domains ("add a test" for an algorithm vs. "add a test" for UI accessibility — too broad to be one checklist entry).
- One is a question and the other is a directive — a question may end up as a clarification entry, not the same item as a directive.

### Granularity calibration

- **Too coarse:** clusters titled "code quality" or "tests" — these are not actionable as checklist entries.
- **Right size:** clusters titled like a reviewable check — "API error responses include a `code` field", "form submit buttons have a loading state", "queries with user input use parameterised statements".
- **Too fine:** clusters of 2 PRs about the same specific function name. If the pattern is "this function specifically", it is not a pattern.

If a cluster's title can be re-used verbatim as a future PR-review checkbox, it is the right granularity.

### When a cluster is "ambiguous"

Some clusters cannot be confidently labelled distinct or duplicate from the rules above. Flag a cluster as **ambiguous** (which triggers the SKILL.md ambiguous-cluster gate) when any of these hold:

- Members satisfy the same-ask test but the **domain** is borderline (e.g. "needs a test" applies to both pure-logic and UI a11y — could legitimately be one cluster or two)
- The proposed title sits on the granularity line: stripping one word makes it too coarse, adding one word makes it too narrow
- A meaningful subset of members suggests a *different* sibling cluster — splitting is reasonable but not obviously correct

Ambiguous clusters are not failures of the rubric — they are real cases where reviewer signal genuinely overlaps. Under `--unattended` the SKILL.md drops them into the Pending-Human bucket; in attended mode it asks the user to choose.

### Examples

**Good cluster** (3 PRs, weight 6):
- Theme: "Form submissions disable the submit button while pending"
- Members:
  - PR #210, reviewer @ana, "this button stays active during submit — should be disabled"
  - PR #214, reviewer @ben, severity:medium, "missing pending state on the submit button, double-submit possible"
  - PR #221, reviewer @ana, "same issue as #210 — disable while loading"

**Bad cluster** (overcoarse):
- Theme: "Improve error handling"
- Members: span 4 PRs but the asks are: catch a specific exception, return a typed error, add a fallback path, log to telemetry. These are 4 distinct asks. Split into 4 clusters; any below threshold gets dropped.

**Bad cluster** (overfine):
- Theme: "Rename `getUser()` to `fetchUser()`"
- Members: 2 PRs about the exact same function. This is a one-off rename, not a checklist pattern.

## Severity-Label Detection (reference for the helper script)

The helper script regex-matches comment bodies against these two formats:

- **Council / deep-review prose** (most common):
  - `Severity: High` / `Severity: Medium` / `Severity: Low`
  - `Confidence: High` / `Confidence: Medium` / `Confidence: Low`
- **Inline label-style** (sometimes used in bot or council output):
  - `severity/high`, `severity/critical`, `severity/medium`, `severity/low`
  - `deep-review/critical`

When a comment carries both formats, the helper records the highest. `critical` maps to the `high` bucket.
