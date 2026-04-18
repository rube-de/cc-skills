# Discussion items: classification and action routing

This reference covers the four-phase workflow for **Discussion unresolved** comments identified during categorization (SKILL.md Step 2). You arrive here from SKILL.md Step 3.5 when the PR has at least one Discussion item. If there are no Discussion items, SKILL.md skips this reference entirely.

For each Discussion item, follow a four-phase workflow.

## 1. Read Context

Use the same context-reading approach documented in `fixable-workflow.md` section 1. Briefly restated:

**For inline threads** (`reply_type == "inline"`):
1. Read the file at the referenced `path`
2. Read at least 20 lines of surrounding context
3. Read the full comment thread (including any replies)

**For review bodies** (`reply_type == "pr_comment"`) and **issue comments** (`reply_type == "issue_comment"`):
1. Parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope

## 2. Classify Discussion Item

Assess the effort and nature of each discussion item:

| Classification | Criteria | Default Recommendation |
|---------------|----------|------------------------|
| **Implementable Fix** | Technically straightforward code change directly related to the PR feedback — rename, add/edit comment, tweak condition, fix typo, add validation, refactor a block. Size doesn't matter; complexity does. | **Implement now** (code is free) |
| **Clarification Answer** | Reviewer asked a question the agent can answer from codebase context (e.g., "why is this async?", "does this handle nulls?") | **Reply with explanation** |
| **Design Decision** | Requires architectural judgment, product scope decision, or trade-off the PR author must make | **Defer to author** |
| **Out-of-PR-Scope** | Valid concern but belongs in a separate PR/issue (large refactor, cross-cutting change) | **Create follow-up issue** |

> **Bias toward action**: Default to **Implementable Fix** or **Clarification Answer** when the change is technically straightforward. Do not inflate complexity to avoid work — if the change doesn't require architectural judgment and is directly related to the reviewer's feedback, recommend implementing it regardless of size. The classification gate exists for genuinely complex items where the PR author must decide, not as an escape hatch for effort avoidance.

## 3. Present to User, Auto-Implement, or Auto-Reply

**Auto-implementable Implementable Fix** items follow the same auto-implementation path as `fixable-workflow.md` section 3 — implement directly, no `AskUserQuestion` needed. Print a brief note: `Auto-implementing Discussion item {n}/{total}: {brief description}`. Reclassify the item as **Fixed** — it enters the Step 4 reply queue with the `Fixed:` prefix, identical to user-chosen "Implement now" items.

Treat an Implementable Fix as auto-implementable when any of these hold:
- All four criteria from `fixable-workflow.md` section 2 pass and there is a single clear approach
- There are multiple approaches but one is clearly better (you would mark it "(Recommended)") — implement the recommended one
- The item matches an **Autonomy Ladder** pattern (see below) — always auto-implement in unattended runs; recommend auto-implementation in attended runs

Apply this test: if you would present this to the user and confidently mark one option "(Recommended)", you already know the answer — just do it. `AskUserQuestion` exists for genuine ambiguity where reasonable engineers would disagree, not as a rubber stamp for decisions you've already made.

### Autonomy Ladder

The following low-risk patterns auto-implement when the change is **local** — under ~20 lines and confined to a single file:

- Rename a variable, function, or type
- Fix a typo
- Edit a comment or docstring
- Add a null check or guard
- Add logging
- Tighten a condition (narrow a range, add a precondition)
- Add missing validation
- Extract a constant or magic number
- Adjust formatting, indentation, or whitespace
- Remove reviewer-flagged dead code

In unattended runs (`UNATTENDED=true`), matching any pattern is a **bright-line auto-implement rule** — skip `AskUserQuestion` entirely and implement now. In attended runs, the pattern still auto-implements unless the item also needs user judgment for another reason.

If a ladder-pattern match would exceed the local-scope guard (touches multiple files or more than ~20 lines), fall through to standard Implementable-Fix handling — do not force it through the ladder.

If the reviewer comment mixes a ladder pattern with an architectural concern (e.g., "rename this AND reconsider the overall design"), classify by the most complex ask. Do not auto-implement the rename in isolation when the reviewer's deeper concern is design.

If implementation fails (file no longer exists, conflict, tool error), reclassify as **Blocked** with the reason `implementation failed: {error}` — same guardrail as section 4. Do NOT reclassify as Pending-Human; Blocked is the path for failed execution.

### Attended / unattended mode split

Implementable Fix items that are not auto-implementable — multiple substantially different approaches with no clear winner, behavior-changing or risky changes, or non-obvious trade-offs — split by mode:

- **Attended runs** (`UNATTENDED` unset or false): route to `AskUserQuestion` in the menu below.
- **Unattended runs** (`UNATTENDED=true`): classify as **Pending-Human**. Skip `AskUserQuestion`. Post no outgoing reply. Do NOT assign Discussion-Deferred — that path is attended-only and requires an explicit "Defer to author" click. Pending-Human items enter the Step 6 `Pending-Human:` summary line and halt the caller. Babysit fires `PushNotification` and self-cancels the cron; an attended `/dlc:pr-check` rerun surfaces the same items through the menu for explicit user triage.

The same split applies to medium/low-confidence **Clarification Answer** items that don't meet the auto-reply criteria below, and to **Design Decision** / **Out-of-PR-Scope** items — these always require human judgment, so attended routes to the menu and unattended routes to Pending-Human.

Skip `AskUserQuestion` and auto-reply **high-confidence Clarification Answer** items when the agent can draft a factual answer entirely from codebase evidence. A Clarification Answer is high-confidence when all four of these criteria pass:

| Criterion | Question |
|-----------|----------|
| **Evidence-backed** | Does the answer cite specific code (`file:line`), commits, or documented decisions — not speculation? |
| **Factually verifiable** | Can the claims be confirmed by reading the referenced code? |
| **Non-controversial** | Does the answer explain what IS (factual state), not argue what SHOULD BE (design opinion/trade-off)? |
| **Complete** | Does the answer fully address the reviewer's concern with no open threads? |

> **Defect-revealing answers**: If the truthful answer reveals a gap, missing check, or unhandled edge case (e.g., "does this handle nulls?" → "no"), reclassify the item as **Implementable Fix** — the reviewer's question implies a code change, not just an explanation. An answer that exposes an action item is NOT complete even if it literally answers the question.
>
> **Boundary cases**: If the answer reveals partial handling or upstream mitigation, apply this test: does the reviewer's concern require a code change in *this* PR? Examples:
> - "Does this handle nulls?" → "No, nulls are not checked" → **Reclassify as Implementable Fix** (clear gap)
> - "Does this handle empty strings?" → "No, but empty strings are filtered upstream at `caller.ts:23`" → **Auto-reply** (upstream responsibility is clear, no local change needed)
> - "Does this handle edge case X?" → "Partially — X1 is handled on line 45, but X2 is not" → **Reclassify as Implementable Fix** (incomplete handling requires a code change)

When all four pass → auto-draft the reply without asking. Print: `Auto-replying to Discussion item {n}/{total}: {brief description}`. Reclassify the item as **Discussion-Answered** — it enters the Step 4 reply queue with the `Answered:` prefix.

> **Bias toward action for Clarification Answers**: When in doubt between high and medium confidence, default to high for factual explanations backed by code evidence. If the agent can point to a specific `file:line` that resolves the reviewer's question, that's high-confidence — don't manufacture uncertainty to justify an interruption. The anti-sycophancy rule still applies; do NOT auto-reply if the answer would:
> - Be speculative (violating **Evidence-backed**)
> - Argue a design opinion (violating **Non-controversial**)
> - Be incomplete (violating **Complete**)
> - Reveal a bug or missing functionality (reclassify as **Implementable Fix**)
>
> In these cases, fall through to `AskUserQuestion` instead (or reclassify per the defect-revealing rule above).

**Attended mode, genuinely ambiguous items only** — This menu fires only when `UNATTENDED` is unset or false. For Medium/Low-confidence Implementable Fix that does not meet the auto-implement criteria above, medium/low-confidence Clarification Answer, true Design Decisions (architectural trade-offs where reasonable engineers would disagree), Out-of-PR-Scope, or Implementable Fix with multiple approaches (none clearly recommended), use `AskUserQuestion`:

> **In unattended mode, skip this menu entirely and classify the item as Pending-Human per the mode split above.** Do not invoke `AskUserQuestion` on an unattended run — the tool has no user surface to render to, and empty returns silently produced `Acknowledged` replies under the old behavior.

```text
Discussion item {n}/{total}: @{reviewer} at {location}
> "{first 100 chars of comment}..."

Classification: {Implementable Fix | Clarification Answer | Design Decision | Out-of-PR-Scope}
Assessment: {your analysis of what the reviewer is asking/concerned about and why you classified it this way}

Options:
  1. Implement now
  2. Defer to author
  3. Create follow-up issue
  4. Reply with explanation
```

Where `{location}` is `{path}:{line}` for inline items, or `{reply_type}:{database_id}` for review bodies and issue comments.

Mark the option matching the classification as "(Recommended)":
- **Implementable Fix** → option 1 (Recommended)
- **Clarification Answer** → option 4 (Recommended)
- **Design Decision** → option 2 (Recommended)
- **Out-of-PR-Scope** → option 3 (Recommended)

**Multiple implementation approaches:** When an Implementable Fix has more than one reasonable way to address the reviewer's feedback, split option 1 into sub-options with your recommendation marked:

```text
Options:
  1a. Implement: add null check in the caller (Recommended)
  1b. Implement: use Optional<T> return type instead
  2. Defer to author
  3. Create follow-up issue
  4. Reply with explanation
```

Include a brief rationale for why you recommend one approach over the others. The user picks a sub-option; execution proceeds as normal for "Implement now."

The user can always override the recommendation by choosing any option.

### Empty-answer safeguard (attended mode)

If `AskUserQuestion` returns an empty answer (no user selection captured), do **not** assume a default. Re-ask the question once. If the second attempt is also empty, reclassify the item as **Pending-Human** and skip it. Never silently route to "Defer to author" — that path produces an `Acknowledged` reply, and `Acknowledged` is reserved for explicit user clicks only.

## 4. Execute Chosen Action

**For "Implement now"**: Apply the same confidence-gated implementation as `fixable-workflow.md` section 3:

- **High confidence** (all four criteria from section 2 pass) → Implement directly using `Edit` or `Write`, then stage: `git add <file>`
- **Medium or Low confidence** → Present your assessment (which criteria passed/failed) alongside the implementation. The user already chose "Implement now" so proceed unless they intervene — but surface any technical concerns so they can course-correct.

| User Choice | Action | Item Reclassification |
|-------------|--------|----------------------|
| **Implement now** | Confidence-gated implementation (see above) | Reclassify as **Fixed** — enters Step 4 reply queue with `Fixed:` prefix |
| **Reply with explanation** | Draft the explanation reply text | Reclassify as **Discussion-Answered** — enters Step 4 reply queue |
| **Defer to author** | No immediate action | Reclassify as **Discussion-Deferred** — enters Step 5 follow-up flow for decision-aware reply (see [`followup-and-summary.md`](followup-and-summary.md)) |
| **Create follow-up issue** | No immediate action | Reclassify as **Discussion-Tracked** — auto-included in Step 5 follow-up issue (see [`followup-and-summary.md`](followup-and-summary.md)) |

> **Items reclassified as Fixed** follow the same `Fixed: {brief description}` reply format and routing used for Fixable items in SKILL.md Step 4.
> **If an implementation fails** (tool error, file not found, conflict), reclassify as **Blocked** with the reason "implementation failed: {error}" — same guardrail as `fixable-workflow.md` section 3.
> **Pending-Human** items (from unattended-mode classification in Section 3 or from the empty-answer safeguard) do NOT appear in the table above. They bypass Section 4 entirely: no user-chosen action, no reply text, no Step 5 follow-up, no thread resolve. They are emitted only in the Step 6 `Pending-Human:` summary line and counted in Step 4b coverage.
