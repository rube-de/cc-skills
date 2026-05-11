# Checklist Schema

Read this in Step 5 to dedup against existing entries, and in Step 7 to author new entries.

## Canonical Entry Format

Each new checklist entry is a single bullet under an H2 (`##`) section. Format:

```markdown
- **<title in imperative voice, ≤80 chars>** — <what to check, ≤200 chars>.
  > Source PRs: #<N>, #<M>[, #<P>]
```

- **Title**: imperative voice (`"Disable submit buttons during async work"`, not `"submit buttons should be disabled…"`). Reads like a checkbox a reviewer can tick.
- **Body**: one sentence describing what the reviewer looks for. Avoid restating the title.
- **Source PRs trailer**: blockquote line with comma-separated `#N` references. Used for traceability — a reviewer can click through and read the actual reviewer comments that motivated the entry.

Real example:

```markdown
- **Disable submit buttons during async work** — confirm that form submit buttons enter a disabled or loading state on click and stay non-interactive until the promise settles.
  > Source PRs: #210, #214, #221
```

## Where to Insert (Step 7)

The target file `docs/code-review-checklist.md` is owned by the target repo and may have any existing section structure. Decide insertion location with this rule:

1. **If the cluster theme fits an existing H2 section** — append the entry as the last bullet of that section. Match by section title semantically: `"Accessibility"` accepts aria/keyboard/focus clusters; `"Security"` accepts injection/auth/secrets clusters; `"Async / error handling"` accepts promise/error/retry clusters; etc.
2. **If no existing section is a clean match** — append the entry under a new H2 `## Recurring patterns` section at the end of the file. Create the section once on the first run; subsequent runs append into it. The section title is intentionally generic so it does not need ownership decisions from the human reviewer.

Do **not** reorder, retire, or reword existing entries. Out of scope per issue cc-skills#216.

## Semantic-Dedup Rubric (Step 5)

For each proposed cluster, ask these three diagnostic questions against each existing checklist entry. Each question yields **yes**, **no**, or **maybe**. Aggregate into a verdict:

- **Duplicate** (drop): at least one definitive **yes**.
- **Distinct** (keep): all **no**.
- **Ambiguous** (gate fires): mix of **maybe** answers, or one **maybe** plus surface partial-overlap evidence. The SKILL.md ambiguous-dedup gate triggers — under `--unattended` it becomes Pending-Human; in attended mode it asks the user.

The questions:

### Q1: Same ask?

Does the existing entry ask the reviewer to check the same thing the cluster proposes?

- "Forms have disabled state during submit" vs. cluster "Form submit buttons disable while pending" → **yes, same ask**, drop.
- "Forms validate input client-side" vs. cluster "Form submit buttons disable while pending" → **no, different ask**, keep.

### Q2: Subsumed scope?

Is the existing entry a broader version of the cluster that already covers it?

- Existing: "Disclosure components meet WAI-ARIA disclosure pattern requirements" vs. cluster "Disclosure buttons have aria-expanded" → **yes, subsumed** by the broader entry, drop.
- Existing: "Use semantic HTML elements" vs. cluster "Disclosure buttons have aria-expanded" → **no, too generic to count as coverage**, keep.

A subsumption claim must point to a *specific named pattern or standard* in the existing entry. Generic best-practice entries do not subsume specific ones.

### Q3: Same domain + same surface?

Does the existing entry address the same domain (e.g. async, a11y, validation) on the same code surface (component type, function shape, API contract)?

- Existing on API responses: "Error responses include `code` and `message` fields" vs. cluster on API responses: "Errors have a machine-readable `code`" → **yes, same domain + surface**, drop.
- Existing on API responses: "Error responses include `code` and `message` fields" vs. cluster on JS thrown errors: "Custom Error subclasses carry a `code` property" → **no, different surface** (API responses vs. in-process errors), keep.

### Tie-breaker rule

When in genuine doubt after all three questions, **keep** the candidate. The cost of a redundant proposal is one comment from a human reviewer ("we already have an entry for this"). The cost of a dropped proposal is the pattern continues drifting unfixed. The PR is the gate, and humans are good at noticing duplicates.

## PR Body Structure (Step 7)

The PR body the skill opens has this skeleton:

```markdown
## Summary

This PR proposes **<N> new entries** to `docs/code-review-checklist.md`, derived from clustering review comments across **<merged_prs_inspected> merged PRs** over the last **<lookback>**.

Each entry is sourced from at least <threshold> distinct PRs where reviewers asked for the same class of change.

## Derived from

| Entry | Source PRs | Weight |
|---|---|---|
| Disable submit buttons during async work | #210, #214, #221 | 6 |
| API error responses include a `code` field | #198, #207, #220 | 5 |
| …                                          | …                | … |

## How this was generated

This PR was opened automatically by the `dlc:update-review-checklist` skill (lookback `<lookback>`, threshold `<threshold>`). The skill clusters reviewer comments from merged PRs by theme, drops clusters already covered by existing entries, and proposes the survivors as new checklist items.

Review the entries on their merits — duplicates, wrong-domain matches, or unclear wording are normal and worth flagging. The skill does not auto-merge.

Re-run with `--dry-run` for clusters that surfaced but were dropped (filter drops, dedup matches).
```

Keep the body under ~600 chars of human-written prose. Most of the value is in the table.
