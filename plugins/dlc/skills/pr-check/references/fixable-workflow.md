# Fixable items: context, evaluation, implementation

This reference covers the three-phase workflow for **Fixable unresolved** comments identified during categorization (SKILL.md Step 2). You arrive here from SKILL.md Step 3 when the PR has at least one Fixable item. If there are no Fixable items, SKILL.md skips this reference entirely.

## 1. Read Context

**For inline threads** (`reply_type == "inline"`):
1. Read the file at the referenced `path`
2. Read at least 20 lines of surrounding context (before and after the target `line`)
3. Read the full comment thread (including any replies)

**For review bodies** (`reply_type == "pr_comment"`):
1. Review bodies have no `path`/`line` — parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope of the review

**For issue comments** (`reply_type == "issue_comment"`):
1. Issue comments have no `path`/`line` — parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope of the comment

## 2. Critically Evaluate

Assess the suggestion against these criteria:

| Criterion | Question |
|-----------|----------|
| Technical correctness | Is the suggestion factually correct? |
| Project alignment | Does it match existing patterns in this codebase? |
| Regression risk | Could implementing it break other functionality? |
| Scope appropriateness | Is the change proportional to the problem? |

Assign a confidence level:
- **High**: All four criteria pass — the suggestion is clearly correct and safe
- **Medium**: One or two criteria are uncertain — the suggestion is plausible but not obvious
- **Low**: Multiple criteria fail or the suggestion appears technically incorrect

> **Anti-sycophancy rule**: Your confidence score is your honest technical assessment, not a politeness signal. If a suggestion is factually incorrect — wrong about the language, inconsistent with the codebase pattern, or introduces a regression — rate it **Low** and say so with specifics. Do NOT implement Low-confidence items without explicit user approval even if the reviewer is insistent. Prioritize technical correctness over politeness — being wrong politely is worse than being correct bluntly.

## 3. Confidence-Gated Implementation

**High confidence** (all four criteria pass) → Implement directly using `Edit` or `Write`, then stage: `git add <file>`. Mode-agnostic — works identically in attended and unattended runs.

**Medium or Low confidence** — genuinely ambiguous items where reasonable engineers would disagree — split by mode:

- **Attended runs** (`UNATTENDED` unset or false): Use `AskUserQuestion` to present:
  - The quoted reviewer comment
  - Your assessment (which criteria passed/failed and why)
  - Options: "Implement as suggested" / "Skip this comment" / "Implement with modification"
  - If "Implement with modification" is chosen, ask for guidance before proceeding.

- **Unattended runs** (`UNATTENDED=true`): Skip `AskUserQuestion` entirely. Classify the item as **Pending-Human**. Post no outgoing reply. Do NOT default to "Skip this comment" — that path produces an `Acknowledged — deferred (out of scope for this PR)` reply, which is an implicit decision the user never made. Pending-Human items enter the Step 6 `Pending-Human:` summary line and halt the caller. Babysit fires `PushNotification` and self-cancels the cron; an attended `/dlc:pr-check` rerun surfaces the same items through the menu for explicit user triage.

> Why the split: `AskUserQuestion` has no user surface in an unattended `/loop`. Calling it there produces empty answers, which historically fell through to implicit "skip" — an `Acknowledged` reply the user never authorized. Pending-Human is the honest halt signal: the bot stops, the user gets a push, and the decision happens in attended mode.

### Empty-answer safeguard (attended mode)

If `AskUserQuestion` returns an empty answer (no user selection captured), do **not** assume a default. Re-ask the question once. If the second attempt is also empty, reclassify the item as **Pending-Human** and skip it. Never silently route to "Skip this comment" — that path posts an `Acknowledged — deferred` reply, and acknowledgements are reserved for explicit user clicks.

> **Bias toward implementation**: Default to **High confidence** and implement fixes directly when a change is technically correct and straightforward (rename, add a check, fix a typo, adjust formatting, add missing validation) — code is cheap; generating a fix costs less than deliberating about whether to. Do not inflate uncertainty to avoid work or defer small fixes as "out of scope." The confidence gate exists for genuinely ambiguous suggestions where reasonable engineers would disagree — not as an escape hatch for effort avoidance. In unattended runs, this bias matters double: every item that gets the High-confidence treatment lands as a real fix instead of a Pending-Human halt.

**Guardrails:**
- Only modify files that are part of the PR's diff
- Do not make changes the reviewer didn't request
- If unsure about intent, classify as **Discussion** instead of guessing
- Never implement a suggestion assessed as technically incorrect without explicit user approval
- If an `Edit` or `Write` call fails (tool error, file not found, conflict), reclassify the item as **Blocked** with the reason "implementation failed: {error}" — do not leave it in the Fixable state

## Outcome

Each Fixable item lands in one of these final states:

| User Choice / Result | Reclassification | Downstream handling |
|----------------------|------------------|---------------------|
| Implementation succeeds | **Fixed** | SKILL.md Step 4 reply queue with `Fixed:` prefix |
| User chose "Skip this comment" | **Skipped (user decision)** | SKILL.md Step 5 follow-up flow — acknowledged in [`followup-and-summary.md`](followup-and-summary.md) Step 5b with `Acknowledged — deferred (out of scope for this PR)` |
| User chose "Implement with modification" | Proceeds as Fixed once the modified implementation lands | Same as Fixed |
| Unattended mode, Medium/Low confidence (no `AskUserQuestion`) | **Pending-Human** | No reply, no Step 5 follow-up, no thread resolve. Counted in Step 4b coverage and emitted in the Step 6 `Pending-Human:` summary line for babysit to parse. |
| Attended mode, `AskUserQuestion` empty after one re-ask | **Pending-Human** | Same as above — honest halt rather than silent `Acknowledged — deferred`. |
| Implementation fails (tool error, conflict) | **Blocked** with reason `implementation failed: {error}` | SKILL.md Step 5 follow-up flow (issue creation + acknowledgement) |

Coverage verification (Step 4b) counts each of these final states toward the reviewer's total — no Fixable item is ever silently dropped.
