# Learnings from Developing Skills & Plugins

Hard-won lessons from building and debugging Claude Code skills and plugins.

---

## Skill Authoring

> Source: [Claude Code — Skills](https://code.claude.com/docs/en/skills) — official skill authoring guide covering SKILL.md frontmatter, reference file linking, and context modes
> Source: [Agent Skills Specification](https://agentskills.io/specification) — open spec for portable agent skills (SKILL.md format, frontmatter schema, tool permissions)

### Reference files must be explicitly loaded

Claude Code skills use markdown links (`[name](path)`) to reference companion files — but **the model only reads them if the skill text issues an imperative directive**.

**Bad** — passive, treated as FYI:
```markdown
See [WORKFLOW.md](references/WORKFLOW.md) for the posting format.
```

**Good** — imperative, specifies *when* and *what*:
```markdown
**Read [references/WORKFLOW.md](references/WORKFLOW.md) now** and follow its posting format exactly.
```

Per the official docs, you must tell Claude both **what** a file contains and **when** to load it. Omitting either causes the model to skip the file and guess.

> `@file` syntax only works in `CLAUDE.md` — skills use standard markdown links.

> Source: [Claude Code — Skills](https://code.claude.com/docs/en/skills) — see "Reference files" section on link syntax and loading directives

### Defense-in-depth for critical formatting

If a skill depends on a specific output format (tags, templates, structure), surface the critical rules **inline in SKILL.md** in addition to the reference file. This way, even if the model skips the reference, the essential format is visible in context.

Frame inline rules as **reinforcement**, not fallback — saying "if you cannot read the file" gives the model an excuse to skip it.

> Source: Learned from [`jules-review` fix](../plugins/jules-review/skills/jules-review/SKILL.md) — model skipped `WORKFLOW.md` and invented its own format, producing wrong `@jules` tags

### Directive placement matters

Place read directives at **two points**:
1. **Top of the skill** (after the intro) — sets expectations early
2. **At the step that needs it** — triggers loading at the right moment

A single directive at the bottom of a long skill is easily lost in context.

> Source: Observed in [`jules-review` SKILL.md](../plugins/jules-review/skills/jules-review/SKILL.md) — a single passive reference near the end of the file was consistently skipped; adding a second directive near the top fixed it. Pattern also used in the setup section of the [`cdt` skill](../plugins/cdt/skills/cdt/SKILL.md).

### Multi-skill plugins: shared references via relative paths

When a plugin has multiple sibling skills that share reference files (templates, format specs), put the references under the **router skill's** `references/` directory and reference them from siblings via relative paths:

```
plugins/dlc/
├── skills/
│   ├── dlc/              ← router skill
│   │   ├── SKILL.md
│   │   └── references/   ← shared references live here
│   │       ├── ISSUE-TEMPLATE.md
│   │       └── REPORT-FORMAT.md
│   ├── security/
│   │   └── SKILL.md      ← uses ../dlc/references/ISSUE-TEMPLATE.md
│   └── quality/
│       └── SKILL.md      ← uses ../dlc/references/ISSUE-TEMPLATE.md
```

This keeps shared format definitions centralized while each skill remains self-contained. The `../dlc/references/` relative path convention works for all sibling skills at the same depth.

> Source: [`dlc` plugin](../plugins/dlc/) — first multi-skill plugin with shared references across 5 domain-specific skills. Pattern modeled on `council` (multi-skill) + `jules-review` (reference file directives).

### Defense-in-depth applies to data classification, not just output format

The defense-in-depth pattern (inline critical rules as reinforcement) isn't limited to output templates. It also applies to **severity mappings** and **data classification rules**. Each DLC check skill inlines its own severity mapping table even though `REPORT-FORMAT.md` defines the canonical structure — because the model may not load the reference at classification time.

> Source: [`dlc` check skills](../plugins/dlc/skills/) — each skill has a "Severity mapping (reinforced here for defense-in-depth)" section with domain-specific severity criteria inlined.

### Use imperatives as operative directives, not aphorisms

Behavioral rules in SKILL.md should lead with a direct imperative, not an aphorism. Research across Anthropic, OpenAI, and Google prompt engineering guides consistently recommends literal, imperative phrasing for agent instructions. [Rolling the DICE on Idiomaticity](https://arxiv.org/abs/2410.16069) (ACL 2025) found GPT-4o achieved 84% overall accuracy on individual idiom classifications but only 49% strict consistency when required to correctly handle both figurative and literal uses of the same expression — models may read aphorisms as rhetorical flair rather than operational rules.

**Bad** — aphorism as the operative instruction:
```markdown
> Being wrong politely is worse than being correct bluntly.
```

**Good** — imperative first, aphorism as supporting rationale:
```markdown
> Prioritize technical correctness over politeness — being wrong politely is worse than being correct bluntly.
```

The imperative tells the agent *what to do*; the aphorism tells it *why*. This matches Anthropic's guidance that "providing the why helps the model generalize."

> Source: [PR #125](https://github.com/rube-de/cc-skills/pull/125) — Gemini review flagged the aphorism-only phrasing in the anti-sycophancy directive. Research confirmed imperatives are more reliable for agent compliance.

### Downstream rules must consume formally recorded inputs, not implicit assessments

When a decision rule (e.g., a sizing table) consumes a value derived from an earlier workflow step, that value must be explicitly recorded as a formal artifact column — not left as an implicit "PM assessment." If the input isn't formally captured, the rule's data provenance is broken: reviewers can't audit the decision, agents can't reliably reference it, and the workflow has a hidden dependency on context that may not survive across steps or sessions.

**Bad** — sizing rule references implicit context:
```markdown
**Epic sub-issues** — derive from the decomposition analysis (subsystems from the table row, structural changes from the PM's assessment during decomposition):
```

**Good** — sizing rule references a formal table column:
```markdown
**Epic sub-issues** — derive from the decomposition table columns (Subsystems and Structural Changes recorded during Round 2 decomposition):
```

The fix is always the same: add the consumed value as an explicit column/field in the artifact that feeds the downstream rule.

> Source: [Issue #124](https://github.com/rube-de/cc-skills/issues/124), [PR #171](https://github.com/rube-de/cc-skills/pull/171) — Three independent reviewers across two review rounds flagged the same gap: Epic sub-issue sizing consumed "structural changes" but the decomposition table had no column for it.

### Template section ordering controls which sections get filled

When a SKILL.md contains a template with optional sections (e.g., "Alternatives Considered" and "Work Breakdown" that should be skipped for simple features), the model fills sections top-to-bottom as it encounters them. If the scaling instructions ("skip these for simple work") come *after* the template, the model has already filled everything before seeing the skip rule.

**Bad** — scaling note after template:
```markdown
## Template
# Spec: <Topic>
## Problem
## Chosen Approach
### Alternatives Considered   ← model fills this
## Work Breakdown             ← model fills this too

**Scaling:** Simple features should skip Alternatives and Work Breakdown.
```

**Good** — tier classification before template, inline comments inside:
```markdown
**Determine the complexity tier first:**
| Simple | Skip Alternatives, Work Breakdown |
| Medium | Include all sections |

## Template
### Alternatives Considered
<!-- MEDIUM and COMPLEX only — omit for SIMPLE -->
```

The model reads SKILL.md top-to-bottom. Put conditional instructions *before* the content they gate, and add inline `<!-- -->` comments as defense-in-depth reminders inside the template itself.

> Source: Brainstorm skill eval — Eval 3 (deceptive-health-check) produced a 75-line spec for a simple feature because the model filled Alternatives Considered and Work Breakdown before encountering the scaling instructions.

### Cross-project topics need explicit handling in exploration steps

Skills with codebase exploration steps (e.g., "use Glob/Grep to find affected files") implicitly assume the brainstorm topic is about the current working directory. When users brainstorm about a different project (e.g., "add rate limiting to my Express API" while in a skills marketplace repo), the exploration step silently fails or produces irrelevant results.

Add explicit cross-project handling:
1. Detect the mismatch in the context-gathering step
2. Use `WebSearch` or ask the user for relevant file paths
3. Mark paths in the output as `[unverified — user-provided]` so downstream consumers know to check them

> Source: Brainstorm skill eval — Eval 1 (simple-rate-limiting) asked about an Express API while running in cc-skills. The agent improvised successfully but was unguided, making the behavior fragile.

---

## Agent Teams

> Source: [Claude Code — Agent Teams](https://code.claude.com/docs/en/agent-teams) — multi-agent orchestration, subagent definitions, and team coordination patterns

### Coordinator should not write deliverable artifacts

The Lead coordinator's job is orchestration, not authorship. When the Lead writes plan files, dev reports, or project docs, it duplicates work that teammates have better context for:

- **Architect** has codebase context from exploration → writes the plan file
- **Reviewer** has seen all code, tests, and iterations → writes the dev report
- **Developer** knows what changed → updates project docs

**Rule**: If a teammate has better context for producing an artifact, delegate the writing to them. The Lead verifies the artifact exists and is complete, then presents it to the user.

> Source: [Issue #51](https://github.com/rube-de/cc-skills/issues/51)

### Injection anchors in multi-agent prompts must be substitution-independent

When a Lead dynamically injects text into a teammate's prompt, the anchor text (the line used to locate the injection point) must not contain substitutable placeholders. If substitution runs before injection, the anchor won't match the rendered prompt.

**Bad** — anchor contains `[plan-path]` placeholder:
```markdown
If `$ARGUMENTS` includes `--review-plan`, inject after `Plan path: [plan-path]` in the PM prompt below:
```
If `[plan-path]` is substituted first → `Plan path: .dev/cdt/plans/plan-20260207-1430.md` — the anchor `Plan path: [plan-path]` no longer exists.

**Good** — anchor is substitution-independent:
```markdown
If `$ARGUMENTS` includes `--review-plan`, inject after the `Plan path:` line in the PM prompt below:
```

Also verify that positional references ("above" / "below") match the actual injection position. If the architect prompt says "the lead will inject an explicit directive **above**", the injection instruction must specify `inject before` the relevant line — not `inject after`.

> Source: [PR #148](https://github.com/rube-de/cc-skills/pull/148) — Two independent reviewers (coderabbitai, copilot) caught the same anchor mismatch; a third (greptile) caught the PM-side substitution ordering ambiguity.

### Cross-agent artifact write-back requires explicit steps

When Agent A writes an artifact (plan file) and Agent B produces content (verdict) that belongs in that artifact, add an explicit write step to Agent B's flow. Without it, the artifact has a permanent placeholder, and verification steps that check for the content will loop.

**Bad** — PM produces verdict but never writes it to the plan:
```
5. Produce validation report: APPROVED or NEEDS_REVISION
6. Share report with the lead
```
→ `## Validation` section remains `[PM verdict]` → Lead's verification step 7.3 fails → triggers re-write loop.

**Good** — PM explicitly writes verdict into the artifact:
```
5. Produce validation report: APPROVED or NEEDS_REVISION
6. Write verdict into `## Validation` section of [plan-path]
7. Share report with the lead
```

> Source: [PR #148](https://github.com/rube-de/cc-skills/pull/148) — greptile-apps identified the sequencing gap; architect writes plan at step 14 before PM produces verdict at step 5.

### Advisory tool invocations need explicit routing and single-invocation guards

When a teammate invokes an external tool (e.g., council review) as advisory input rather than a blocking gate, three pitfalls emerge:

1. **Feedback routing**: The step that says "include findings in your message to X" must have a corresponding numbered step that actually sends that message. If the send step fires *before* the tool invocation, findings are silently dropped.
2. **Re-invocation on iteration**: Without an explicit guard, the tool runs on every revision cycle — expensive and redundant. Add: "Invoke at most once per [artifact]; do not re-run on subsequent revision cycles."
3. **Tool availability**: If the teammate invokes a tool via `Skill`, verify that `Skill` is in `allowed-tools` for *all* entry-point commands that reach this workflow — not just the one being actively developed.

> Source: [PR #148](https://github.com/rube-de/cc-skills/pull/148) — Council review integration surfaced all three: feedback targeted a nonexistent architect message (greptile), no re-invocation guard (greptile), and `Skill` missing from `dev-task.md` (copilot).

### Plan template exists in two locations — update both

`plan-workflow.md` contains the plan template twice: once in the architect's prompt (Step 5b, item 14) and once in the Lead's verification section (Step 7). Any structural change to the template (new sections, reordered fields, updated placeholders) must be applied to both copies identically. Grep for the section header in both locations to verify synchronization.

> Source: [Issue #113](https://github.com/rube-de/cc-skills/issues/113) — Added `## Acceptance Criteria` and `## Boundaries` sections to both template copies.

### PreToolUse hooks cannot enforce role boundaries (yet)

Claude Code's hook protocol passes only `tool_input` JSON to PreToolUse hooks — there is **no agent identity field** (no `agent_role`, `agent_id`, or similar). A hook that blocks `Edit`/`Write` during active team sessions blocks *all* agents equally, including the teammates the lead is delegating to.

**Timeline**:
1. [Issue #32](https://github.com/rube-de/cc-skills/issues/32) — Lead was editing source files directly. Added `enforce-lead-delegation.sh` hook on `Edit`/`Write` to block source edits during active teams.
2. [Issue #59](https://github.com/rube-de/cc-skills/issues/59) — Discovered the hook blocks teammates too, defeating the delegation model entirely.

**Current approach** (Issue #59):
- **Hooks disabled**: `Edit`/`Write` entries removed from `hooks.json`
- **Script kept dormant**: `enforce-lead-delegation.sh` retained with a dormant header, ready to re-enable when the hook protocol adds agent identity
- **Prompt-level enforcement**: "Lead Identity" section in SKILL.md + anti-patterns in workflow docs serve as soft guardrails
- **State tracking preserved**: `TeamCreate`/`TeamDelete` hooks still manage `.cdt-team-active` state file — useful for other hooks and future role enforcement

**Lesson**: Before building role-based enforcement on hooks, verify that the hook protocol exposes the identity of the acting agent. Without that, hooks are agent-blind and cannot distinguish lead from teammate.

> Source: [Issue #32](https://github.com/rube-de/cc-skills/issues/32), [Issue #59](https://github.com/rube-de/cc-skills/issues/59)

### Hook scripts must fail-closed, not fail-open

Security-critical hooks should **block when uncertain** (fail-closed) rather than **allow when uncertain** (fail-open). Three failure modes surfaced during review of `enforce-lead-delegation.sh`:

| Failure mode | Fail-open (bad) | Fail-closed (good) |
|---|---|---|
| Missing `jq` | `FILE_PATH` empty → edit allowed | `exit 2` with "jq not found" error |
| Detached HEAD | `BRANCH` empty → hook exits 0 | Check for any sentinel → `exit 2` with "checkout a branch" message |
| Ambiguous state | Pick arbitrary branch's sentinel | Block and require explicit branch checkout |

**Rule of thumb**: When a hook can't determine context (missing tool, empty variable, ambiguous state), block and explain — don't guess and proceed. Over-blocking is annoying but recoverable; under-blocking is a security bypass.

> Source: [PR #41](https://github.com/rube-de/cc-skills/pull/41) — Copilot and CodeRabbit reviews caught fail-open jq dependency, detached HEAD bypass, and arbitrary branch glob selection across rounds 7-10.

> Note: `enforce-lead-delegation.sh` is now dormant (Issue #59) — its fail-closed patterns remain as reference for future hooks. See "PreToolUse hooks cannot enforce role boundaries" above.

### Hook output schemas are per-event — `jq` parsing is not a validation step

The Claude Code hook contract defines a separate `hookSpecificOutput` sub-schema **per event type**. Only `PreToolUse`, `UserPromptSubmit`, `PostToolUse`, and `PostToolBatch` have a `hookSpecificOutput` variant. `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`, and `Notification` accept only the top-level fields (`decision`, `reason`, `systemMessage`, `continue`, `suppressOutput`, `stopReason`). A hook that emits `hookSpecificOutput.additionalContext` on a `Stop` event will fail runtime validation with `"(root): Invalid input"` even though the JSON is well-formed.

`jq .` checks JSON syntax, not schema conformance — a hook that passes manual smoke tests can still fail in production. There is no offline validator; the only reliable test is to trigger the real event in a live Claude Code session.

**Bad** — assumed `additionalContext` works for all events (it doesn't for `Stop`):
```sh
cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "REMINDER: ..."
  }
}
JSON
```

**Good** — `Stop` hooks use top-level `decision` + `reason`, matching `block-cdt-without-teams.sh`:
```sh
cat <<'JSON'
{
  "decision": "block",
  "reason": "REMINDER: ..."
}
JSON
```

**Rule of thumb**: When wiring a new hook event type, copy the output shape from an *existing working hook on the same event*, not from a different event. The available output mechanisms also vary by event — JSON `decision`/`reason`, stderr + `exit 2`, and side-effect-only scripts are all valid in this plugin (`block-cdt-without-teams.sh`, `check-agent-teams.sh`, `track-team-state.sh` respectively). Pick the one used by an existing hook on the same event before inventing.

> Source: [PR #218](https://github.com/rube-de/cc-skills/pull/218) — `Stop` hook shipped with `hookSpecificOutput.additionalContext` (valid for `UserPromptSubmit`/`PostToolUse`, not `Stop`). Caught only after a live `Stop` event hit the runtime validator. Spec had flagged the risk in "Open Questions" — verification was not performed before merge.

### `decision: "block"` on high-frequency events needs a cooldown

`Stop` and `SubagentStop` fire on every assistant turn that ends without further tool use. A hook that emits `decision: "block"` on these events forces the LLM to respond → which ends in another Stop → which re-fires the hook → indefinitely. Production hit 8+ consecutive blocks per Stop attempt before this was diagnosed.

The hook output schema offers no non-blocking inject for `Stop`/`SubagentStop` (`hookSpecificOutput.additionalContext` works only for `PreToolUse`/`UserPromptSubmit`/`PostToolUse`/`PostToolBatch`). A hook that *must* surface a reminder on `Stop` has to combine `decision: "block"` with a cooldown — without one, every Stop is blocked.

**Pattern** — co-locate a timestamp file with whatever state already triggers the hook, and short-circuit if the timestamp is recent:

```sh
WARNED_FILE=".dev/cdt/${BRANCH}/.cdt-wave-gate-warned"
COOLDOWN_SECONDS=300

if [ -f "$WARNED_FILE" ]; then
  NOW=$(date +%s)
  # GNU stat first (-c %Y), then BSD stat (-f %m). On Linux, `stat -f` means
  # --file-system, which would emit filesystem-status text and break the
  # arithmetic below — so the GNU form must be tried first.
  LAST=$(stat -c %Y "$WARNED_FILE" 2>/dev/null || stat -f %m "$WARNED_FILE" 2>/dev/null || echo 0)
  DELTA=$((NOW - LAST))
  [ "$DELTA" -ge 0 ] && [ "$DELTA" -lt "$COOLDOWN_SECONDS" ] && exit 0
fi

touch "$WARNED_FILE"
# ... emit decision:block JSON ...
```

A 5-minute window reads as a *last-resort safety net* — long enough that legitimate Stops during active work don't accumulate fatigue, short enough that genuinely stuck workflows still surface the reminder within a useful timeframe. **Reframe the reason text to match the cooldown semantics**: *"fires at most once per 5min, the doc-layer rules already failed to catch this"* tells future readers the hook is a backstop, not a primary mechanism. Without that framing, the hook can be misread as the load-bearing rule and the workflow doc gets skipped.

> Source: [PR #218](https://github.com/rube-de/cc-skills/pull/218) — initial `Stop` hook hit 8+ consecutive blocks per Stop attempt during a live `auto-task` run; commit `e3001ee` added the cooldown. The original spec anticipated *reminder fatigue* (lead learns to ignore the reminder) but not the *doom-loop* variant (reminder physically prevents progress).

### Generative framing at wrap-up triggers hallucinated Agent Notes

At the end of a long successful workflow, a prompt that says "Draft the content for Open Questions and Context for Next Session" primes the model into *generation mode* — it produces plausible-sounding bullets rather than verifying facts. User memories like "check facts before writing" do not fire because the surrounding framing is explicitly generative.

**Observed failure** (PR Chalet-Labs/contentgenie#437):
- Bullet claimed admin section lacked a route-scoped error boundary → `src/app/(app)/admin/error.tsx` already existed; a `fd error.tsx` would have caught it.
- Bullet claimed sequential `revalidatePath` calls are I/O-expensive → `revalidatePath` in Next.js 14 is in-memory tag registration, not I/O; there was nothing to batch.

Both bullets were removed after a follow-up user question.

**Fix**: Insert an evidence gate at every *generation* site — not at extraction/copy-through sites.

**Bad** — generative framing with no verification gate:
```markdown
Draft the *content* (excluding headings) for the `Open Questions` and `Context for Next Session` sections … keep both in working memory so the PR body and the handoff carry identical body text.
```

**Good** — evidence gate appended inline:
```markdown
Draft the *content* (excluding headings) for the `Open Questions` and `Context for Next Session` sections … keep both in working memory so the PR body and the handoff carry identical body text. Each bullet MUST cite verified evidence — a grep result, a `file:line` reference, a recent test/build/log output, or a deliberate plan-time decision recorded in the plan file. If you cannot point to specific evidence in the current branch state, drop the bullet. Empty sections are fine; speculative bullets are not.
```

**Sites to update**: `commands/auto-task.md` Wrap-Up step 4 (drafts inline), `skills/cdt/references/dev-workflow.md` Section 9 (writes handoff template). `commands/full-task.md` Wrap-Up step 4 only *extracts* — add a one-liner there as defense-in-depth.

> Source: [Issue #224](https://github.com/rube-de/cc-skills/issues/224) — two hallucinated Open Questions bullets shipped in a real PR; evidence gate added to generation sites.

### Read-extract anchoring: locate the latest of N similar sub-blocks before slicing

When a downstream step extracts content from an append-mode log (sessions, entries, runs), the file may contain many sub-blocks of the same shape. The extraction MUST anchor on the block delimiter to find the *latest* block, then slice within it — not search the whole file with the inner-section heading. Otherwise the first occurrence wins and the extraction silently returns stale data.

**Bad** — search the whole file for `### Open Questions`, get the first match (which is the *oldest* session):
```markdown
Read .agentnotes/cdt/$BRANCH_SLUG.md and extract content under the `### Open Questions` heading.
```

**Good** — anchor on the latest `## Session ` line, slice from there to the next `## ` heading or EOF, then extract within the slice:
```markdown
1. Find the **last** line matching `^## Session ` (start-of-line anchor).
2. Slice from that line to the next `^## ` heading or EOF (whichever is first).
3. Within that slice, extract `### Open Questions` and `### Context for Next Session` content.
```

Use start-of-line anchors for both the outer block delimiter (`^## `) and the inner sections (`^### `) — this prevents *mid-line* matches against tokens like `## ` or `### `. Anchors do **not** exclude `## `/`### ` tokens that appear at column 0 inside fenced code blocks, so for full robustness also avoid emitting top-level `##`/`###` headings inside fenced examples within these logs, or pick a delimiter that cannot legitimately appear in code (e.g., an HTML-comment sentinel).

> Source: [Issue #221](https://github.com/rube-de/cc-skills/issues/221) — promoted CDT session handoff from per-file (`.dev/cdt/handoffs/handoff-$TIMESTAMP.md`) to per-branch append-mode log (`.agentnotes/cdt/$BRANCH_SLUG.md`); `full-task.md` Wrap Up step 4 must locate the latest `## Session` block before extracting `### Open Questions` and `### Context for Next Session`.

### Self-installing host-repo hints from plugins: idempotent grep + append at workflow-end

When a plugin needs a discovery hint (or any one-line marker) in a host repo, append it from the workflow's wrap-up step using an idempotent grep guard. Target the convention file primary (`AGENTS.md`), fall back to a secondary (`CLAUDE.md`), and skip silently if neither exists — never auto-create project docs. Anchor idempotency on a unique literal (path or marker string) in the appended line so re-runs are no-ops.

**Bad** — write unconditionally on every wrap-up (file bloats with N copies of the hint):
```bash
echo "$HINT" >> AGENTS.md
```

**Good** — grep guard with primary/fallback target and silent-skip on missing files:
```bash
HINT='When picking up work in an unfamiliar area, run `rg -l "" .agentnotes/cdt/` to surface prior CDT session logs.'
if [ -f AGENTS.md ] && ! rg -q '\.agentnotes/cdt' AGENTS.md; then
  printf '\n%s\n' "$HINT" >> AGENTS.md
elif [ ! -f AGENTS.md ] && [ -f CLAUDE.md ] && ! rg -q '\.agentnotes/cdt' CLAUDE.md; then
  printf '\n%s\n' "$HINT" >> CLAUDE.md
fi
```

The `elif [ ! -f AGENTS.md ]` guard prevents double-install when both files exist (only the primary gets the hint). The unique literal `.agentnotes/cdt` in the append line doubles as the idempotency anchor — there's no separate marker comment to maintain.

> Source: [Issue #221](https://github.com/rube-de/cc-skills/issues/221) — `.agentnotes/cdt/<branch-slug>.md` discoverability needs a hint in the host repo's docs; the cc-skills bootstrap edits `AGENTS.md` directly, but plugin installs in other repos rely on the wrap-up auto-install in `dev-workflow.md` § 9 and `auto-task.md` step 8.

---

## Plugin Structure

> Source: [Claude Code — Plugins](https://code.claude.com/docs/en/plugins) — official plugin architecture, `marketplace.json` schema, hook lifecycle, and distribution model

### Validation catches drift early

Always run `bun scripts/validate-plugins.mjs` after any file move or rename. It catches:
- Orphaned plugin directories not registered in `marketplace.json`
- Missing `SKILL.md` files or invalid frontmatter
- Source path mismatches

> Source: [`scripts/validate-plugins.mjs`](../scripts/validate-plugins.mjs) — see also CI config in [`.github/workflows/`](../.github/workflows/)

### Marketplace is the single source of truth

All plugin metadata lives in `.claude-plugin/marketplace.json`. Don't duplicate version numbers, descriptions, or tool lists elsewhere — they'll drift.

> Source: [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — validated against [`marketplace.schema.json`](../scripts/marketplace.schema.json)

---

## Shell Code in Skills

### Never chain CLI tools with `||` for fallback selection

Skills often include bash code blocks that agents execute. A common mistake is using `||` to "try tool A, fall back to tool B":

**Bad** — `||` triggers fallback on *any* non-zero exit, including "tool found issues":
```bash
npm audit --json 2>/dev/null || bun audit 2>/dev/null
eslint . --format=json 2>/dev/null || biome check . --reporter=json 2>/dev/null
```

CLI tools like `npm audit`, `eslint`, `pytest`, and `cargo clippy` exit non-zero when they **successfully find problems** — the same exit code as "tool not installed." Chaining with `||` conflates both cases, causing double runs, mixed output, and lost findings.

**Good** — select tool by availability, allow non-zero exits:
```bash
if command -v eslint >/dev/null 2>&1; then
  eslint . --format=json 2>/dev/null
elif command -v biome >/dev/null 2>&1; then
  biome check . --reporter=json 2>/dev/null
fi
```

This separates "is the tool installed?" from "did the tool find problems?" and ensures only one tool runs.

### `#N` in bash code blocks is a shell comment

Issue references like `#42` are valid in GitHub Markdown, but in bash code blocks they're treated as **comments** — everything from `#` onward is silently stripped:

```bash
# BAD — bash parses #42 as a comment, effective command is just "gh issue close"
gh issue close #42 --comment "Closing as resolved."

# GOOD — bare number, no ambiguity
gh issue close 42 --comment "Closing as resolved."

# GOOD — placeholder for LLM templates
gh issue close ISSUE_NUMBER --comment "Closing as resolved."
```

This is especially dangerous in SKILL.md bash templates because LLMs mimic the template format. If the template shows `gh issue edit #N`, the LLM may produce `gh issue edit #42` which silently becomes `gh issue edit`.

The `gh` CLI accepts bare issue numbers — the `#` prefix is never needed.

> Source: [PR #43](https://github.com/rube-de/cc-skills/pull/43) — Copilot caught this across 6 locations in `next/SKILL.md` and `update/SKILL.md`. Confirmed via `bash -c 'echo gh issue close #42 --comment "reason"'` → outputs `gh issue close`.

Also watch for:
- **`grep` portability**: `\s` isn't POSIX — use `[[:space:]]`; brace expansion (`*.{ts,js}`) doesn't work in `--include` — use separate `--include` flags
- **Unguarded command sequences**: listing multiple commands without `if`/`elif` causes the agent to run all of them, not just the first match

> Source: [PR #40](https://github.com/rube-de/cc-skills/pull/40) — Copilot review caught this across 4 DLC skills (`security`, `quality`, `test`, `perf`). All fixed with `command -v` selection pattern.

### `echo "$var"` corrupts JSON containing escape sequences on macOS

POSIX `echo` behavior with backslash sequences is implementation-defined. On macOS, `/bin/sh` (zsh in POSIX mode) interprets `\n`, `\t`, `\c` in `echo` arguments by default. When a variable contains JSON with embedded `\n` sequences (e.g., review comment bodies with newlines), `echo "$RAW"` expands `\n` to actual newlines, corrupting the JSON structure.

**Symptom**: `echo "$RAW" | jq` fails with exit code 5 (system error / invalid input). The script misreports the error as "PR not found" because the null check wraps a generic `die_json`.

**Bad** — `echo` interprets `\n` in JSON strings on macOS:
```bash
RAW=$(gh api graphql -f query="$QUERY" ...)
echo "$RAW" | jq '.data.repository.pullRequest'
# → exit 5 on macOS when body contains \n
```

**Good** — `printf` never interprets escapes in the argument:
```bash
RAW=$(gh api graphql -f query="$QUERY" ...)
printf '%s\n' "$RAW" | jq '.data.repository.pullRequest'
# → works on all platforms
```

**Rule**: Never use `echo "$var"` to pipe variable content through `jq` (or any parser). Use `printf '%s\n' "$var"` unconditionally. This is safe on Linux too — `printf '%s\n'` is POSIX-specified portable behavior. The bug is latent on Linux (where `/bin/sh` is usually dash, which doesn't interpret `\n` in `echo`) but present on macOS.

> Source: `pr-comments.sh` and `open-issues.sh` — GraphQL responses containing reviewer body text with `\n` sequences failed the jq null check on macOS. Confirmed: `echo` output was 126 bytes shorter than `printf` output for the same variable.

### Batch GitHub API calls into per-plugin shell scripts

Skills that make 3–4 sequential `gh` CLI calls waste context window space on raw API output and data wrangling. Batch these into self-contained shell scripts (`scripts/*.sh`) that return structured JSON in a single tool call.

**Key design choices**:
- **`#!/bin/sh`** not `#!/bin/bash` — maximizes portability across macOS/Linux; avoids bash-isms (arrays, `[[ ]]`, `${var//pattern}`)
- **No `set -e`** — conflicts with `cmd || die_json "msg"` error handling; use explicit error checks instead
- **`die_json()` helper** — prints `{"error":"...","code":"..."}` to stderr on failure, ensuring the LLM always gets structured output even on errors
- **`databaseId` in GraphQL** — REST reply endpoints need integer IDs; GraphQL `id` returns opaque node IDs; `databaseId` bridges the gap
- **Optional positional args** — scripts auto-detect PR number and repo when args are omitted, saving a preliminary `gh` call in the SKILL.md
- **Cycle detection deferred to LLM** — jq lacks mutable state for DFS; scripts provide edge lists, SKILL.md steps do graph traversal

**Script path resolution**: SKILL.md bash code blocks run relative to the **skill's base directory** (`skills/<skill-name>/`), NOT the plugin root. Use `../../scripts/foo.sh` to reach the plugin-level `scripts/` directory. This differs from markdown reference links (which are resolved by the plugin loader). A bare `scripts/foo.sh` resolves to `skills/<skill-name>/scripts/foo.sh` — which doesn't exist.

**Frontmatter impact**: If a skill's `allowed-tools` restricts Bash (e.g., `Bash(gh:*)`), widen to `Bash` when adding local script execution. Acceptable trade-off since skills with Read/Grep/Glob already have filesystem access.

> Source: [Issue #74](https://github.com/rube-de/cc-skills/issues/74) — `pr-check` and `pm:next` batched into `pr-comments.sh` and `open-issues.sh` respectively.

### `jq` function parameters are filters, not values — rebind to a local var

`def f(p): ...` looks like a function with a value parameter, but jq parameters are *filters* substituted at call sites. Inside the body, every reference to `p` re-evaluates the filter against the current `.`. When `p` is itself a path expression (e.g. `$first_c.createdAt`), and the function body shifts `.` to a different value (e.g. iterating over an array of strings), the filter is re-evaluated in the new scope and breaks.

**Bad** — `created` is re-evaluated each time `.` shifts:
```jq
def resolved(created):
  [ $author_commit_dates[] | select(. > created) ] | length > 0;

# Call site:
resolved($first_c.createdAt)
```

Inside `select`, `.` is now an item from `$author_commit_dates` (a date string), and `created` re-evaluates as `<string>.createdAt` → `Cannot index string with string "createdAt"`.

**Good** — bind the parameter to a `$`-variable on entry so the value is captured once:
```jq
def resolved(created_filter):
  (created_filter) as $created |
  [ $author_commit_dates[] | select(. > $created) ] | length > 0;
```

This is the canonical pattern any time a jq function:
- Takes a parameter that is a path expression (`$x.foo`, `.bar.baz`), AND
- Uses that parameter inside a context where `.` is something other than the original input.

Functions whose parameter is *purely* a `$`-variable (e.g. `f($pr_author)`) are safe — variable references do not depend on `.`. Functions that only use the parameter on the original `.` are safe — `.` hasn't shifted yet.

> Source: `fetch-merged-pr-comments.sh` — initial implementation defined `def resolved(created)` and `def detect_severity(body)` with raw filter parameters. The first smoke test produced `jq: error: Cannot index string with string "createdAt"` because the parameter filter was re-evaluated inside `select(. > created)`. Fixed by rebinding to `(created) as $created` on entry. Same fix applied prophylactically to `detect_severity`.

### JSON-array assembly: prefer JSONL + `--slurpfile` to manual `[`/`,`/`]`

When a shell loop produces N JSON records and you want a single JSON array on stdout, the obvious "open with `[`, separator `,`, close with `]`" approach is brittle: any per-iteration failure (mid-loop `continue`, jq error, network blip) leaves a malformed file (`[,]`, trailing comma, missing close).

**Bad** — manual array assembly:
```bash
echo "[" > out.jsonl
first=1
for x in ...; do
  if some_step; then
    if [ "$first" = 1 ]; then jq -c '.' result >> out.jsonl; first=0
    else printf "," >> out.jsonl; jq -c '.' result >> out.jsonl
    fi
  fi
done
echo "]" >> out.jsonl
```

**Good** — JSONL per iteration, slurp at the end:
```bash
: > out.jsonl
for x in ...; do
  if some_step; then
    jq -c '.' result >> out.jsonl
  fi
done

jq -n --slurpfile prs out.jsonl '{prs: $prs}'
```

`--slurpfile` reads N newline-separated JSON values into an array natively. Per-iteration failures are no-ops; an empty file slurps to `[]`. No special-case for the first element, no comma bookkeeping, no malformed-file risk.

> Source: `fetch-merged-pr-comments.sh` — first draft used manual `[`/`,`/`]` assembly and hit `jq: Bad JSON: Expected value before ','` whenever a per-PR transform failed mid-loop. Switched to JSONL + `--slurpfile`; the special-case logic and the `_sep` marker hack both disappeared. ~15 fewer lines and one less failure mode.

---

## GitHub Issue Integration in Agent Teams

### Bridging hooks and prompts with state files

Hooks receive only the tool_input JSON (e.g., `team_name`), not the user's original `$ARGUMENTS`. When a workflow needs data from arguments at hook time, the prompt-level workflow must write a state file **before** the hook fires.

**Pattern**: Prompt writes `.dev/cdt/<branch-slug>/.cdt-issue` → TeamCreate hook reads it → triggers `sync-github-issue.sh`

All CDT state is branch-scoped under `.dev/cdt/<branch-slug>/` (where `<branch-slug>` = branch name with `/` → `-`). This prevents cross-branch contamination — running `/cdt:plan-task` on a new branch won't find stale state from a previous issue's branch.

**Key decisions**:
- Branch-scoped directory (`.dev/cdt/<branch-slug>/`) holds all 3 state files: `.cdt-issue`, `.cdt-team-active`, `.cdt-scripts-path`
- `.cdt-team-active` is cleaned on TeamDelete; `.cdt-issue` and `.cdt-scripts-path` persist for Wrap Up
- `/full-task` and `/auto-task` Wrap Up cleans up the entire branch directory: `rm -rf ".dev/cdt/<branch-slug>"`
- `sync-github-issue.sh` runs in background (`&`) on `start` to avoid blocking team creation
- All GitHub API calls are best-effort (`|| exit 0`) — never block the main workflow

> Source: [PR #41](https://github.com/rube-de/cc-skills/pull/41) — CDT GitHub issue integration via `sync-github-issue.sh` + `track-team-state.sh` bridge

### GitHub Projects v2 requires GraphQL

REST API doesn't support project board operations. The `sync-github-issue.sh` script uses three GraphQL queries:
1. Find issue's project items (issue → projectItems)
2. Get the Status field and its options (project → field → options)
3. Update the field value (mutation)

The script uses jq regex patterns (`in.progress`, `in.review`) for case-insensitive matching against common project column naming conventions ("In Progress", "in-progress", "In progress").

> Source: [GitHub Projects v2 API docs](https://docs.github.com/en/graphql/guides/managing-project-items)

---

## Hooks

### Hook output schema validity ≠ runtime effect

Claude Code's hook validator is **permissive** about field names it does not recognise — it accepts unknown keys inside `hookSpecificOutput` without erroring, but the runtime then silently drops them. So an absence of validator errors does not mean a hook output is honoured. To verify a capability actually fires, **grep the resulting session JSONL** (`~/.claude/projects/<slug>/<session-id>.jsonl`) for the on-disk record the feature is supposed to produce.

Concrete example: `hookSpecificOutput.sessionTitle` (added in v2.1.94) only takes effect on `UserPromptSubmit` hooks. On `PreToolUse` and `SessionStart` the validator passes — no error, no warning — but no `{"type":"custom-title", ...}` record is ever written. Only an empirical probe between the two events revealed which one honoured the field.

**Bad pattern (trust validator silence):**
```text
hook emits hookSpecificOutput.sessionTitle on PreToolUse
no validation error appears
→ assume it works → ship → later discover nothing renamed
```

**Good pattern (probe with a throwaway session, then grep the JSONL):**
```bash
PROBE_UUID=$(uuidgen)
claude --print --session-id "$PROBE_UUID" --settings ./probe-settings.json "test"
JSONL=~/.claude/projects/<slug>/$PROBE_UUID.jsonl
rg '"type":"custom-title"' "$JSONL"   # presence here = real runtime effect
```

> Source: [`plugins/cdt/scripts/set-session-title.sh`](../plugins/cdt/scripts/set-session-title.sh) — the auto-rename hook discovered the event/field mapping by probing two hook events and comparing the JSONL output between them

### Pick the hook event that fires *after* the state change you depend on

When a hook reads dynamic state (current branch, files on disk, env), the same
script attached to two events can produce wildly different results — not because
one event is "broken," but because **the state the hook reads exists at one
event and not the other**.

Concrete failure: an early version of CDT's session-rename hook ran on
`UserPromptSubmit`. The activation check (`prompt starts with /cdt`) was
correct, but the *body* read `git branch --show-current` to derive the title.
The first `/cdt:plan-task` prompt is delivered while the user is still on
`main` — the workflow only checks out the feature branch as a tool call after
the prompt is processed. Result: the hook computed a title from `main`,
producing `cdt-main` and burning the per-branch marker on `main` forever.

The fix wasn't to change the activation logic — it was to **move the trigger
later**. A `Stop` hook fires after the branch checkout has happened, so
`git branch --show-current` returns the right answer. The activation guard
shifts from "prompt matches /cdt" to "a CDT team is currently active for this
branch" (a marker file written by `PreToolUse:TeamCreate`).

**Bad pattern (state read at wrong event):**
```text
UserPromptSubmit fires → script runs → git branch --show-current returns "main"
→ wrong title "cdt-main" → marker poisoned
```

**Good pattern (state read after relevant tool calls have completed):**
```text
PreToolUse:TeamCreate sets .cdt-team-active marker on the new branch
Stop fires (any subsequent turn) → git branch --show-current returns feature branch
→ correct title → marker written
```

Heuristic: if the hook script reads any state that the model itself manipulates
during its turn (working dir, branch, files, env), prefer post-turn events
(`Stop`, `PostToolUse`) over pre-turn (`UserPromptSubmit`, `PreToolUse`). The
exception is when you specifically need to *block* the action — pre-turn
events are the only ones that can do that.

> Source: [`plugins/cdt/scripts/set-session-title.sh`](../plugins/cdt/scripts/set-session-title.sh) — moved from UserPromptSubmit to Stop after observing the `cdt-main` failure on the first /cdt:plan-task invocation

### Inject JSONL events directly when the hook output API doesn't reach far enough

Claude Code's `hookSpecificOutput` channel is not symmetric across hook events
— some fields (e.g. `sessionTitle`) only take effect on one specific event.
When you need the same effect from a different event (e.g. `Stop`, where
`sessionTitle` is silently dropped), bypass the API and write directly to the
session's JSONL transcript. Plan Mode does this internally, and the hook input
on most events includes `.transcript_path` precisely so external scripts can
participate.

The on-disk schema for a custom-title event is:
```json
{"type":"custom-title","customTitle":"<title>","sessionId":"<uuid>"}
```

Note the **field-name asymmetry**: the hook output API uses `sessionTitle`, but
the JSONL stores it under `customTitle`. The on-disk name is the stable one —
that's the contract Claude Code's `/resume` picker reads.

`jq -nc` emits the JSON object as a single buffered `write()` syscall, and `>>`
opens the file with O_APPEND so each `write()` is positioned atomically (the
kernel sets the offset before writing). Multiple `custom-title` events with the
same value are also harmless — the picker reads last-wins. Capping the slug
keeps the line short enough that jq flushes in one `write()` call.

**Pattern:**
```bash
jq -nc --arg s "$SESSION_ID" --arg t "$TITLE" '{
  type: "custom-title",
  customTitle: $t,
  sessionId: $s
}' >> "$TRANSCRIPT_PATH"
```

This pattern generalises: any JSONL event Claude Code writes internally
(`agent-name`, `permission-mode`, etc.) can be appended from a hook, regardless
of whether `hookSpecificOutput` exposes a corresponding field.

> Source: [`plugins/cdt/scripts/set-session-title.sh`](../plugins/cdt/scripts/set-session-title.sh) — moved from `hookSpecificOutput.sessionTitle` to direct JSONL append when relocating the trigger to `Stop` (where `sessionTitle` is dropped)

### When the docs are wrong, the Claude Code binary tells the truth

Claude Code's public hook docs and SDK type definitions lag behind the binary. When a feature appears missing or misdocumented, search the compiled CLI for the on-disk field names:

```bash
strings "$(command -v claude)" | rg '"customTitle"|tengu_session_renamed|setSessionTitle'
```

This surfaced the rename API (JSONL event types like `custom-title` / `agent-name`, internal setter functions, telemetry event names) when the public docs implied no such mechanism existed, and exposed the **field-name asymmetry** that's easy to miss otherwise: the JSONL stores the title under `customTitle`, but the *hook output* takes it under `sessionTitle`. Reading only the on-disk artifact (or only the hook docs) hides that.

> Source: discovery process behind `set-session-title.sh`; cross-referenced with [issue #44902](https://github.com/anthropics/claude-code/issues/44902) confirming v2.1.94 added the hook field but the public docs are still out of sync

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Runtime files in `.claude/` | Permission prompts even with `--dangerously-skip-permissions` | Use `.dev/` for plugin runtime artifacts; `.claude/` is reserved for Claude Code config |
| Passive reference links | Model ignores reference file, guesses format | Use imperative "Read X now" directives |
| `@file` in SKILL.md | Reference silently ignored | Use markdown links `[name](path)` instead |
| Single directive at bottom | Model forgets by the time it reaches the step | Add directive both at top and at the relevant step |
| Fallback framing | Model skips file, uses "fallback" path | Frame inline rules as reinforcement, not fallback |
| Manual version edits | Conflicts with semantic-release | Never edit versions — CI handles it |
| `\|\|` chaining for tool fallback | Double runs, mixed output when primary tool finds issues | Use `command -v` to select tool by availability |
| `\s` in grep patterns | No match on POSIX grep | Use `[[:space:]]` instead |
| Mixed `\|\|`/`&&` guards | Ambiguous precedence in POSIX shell | Use explicit `if/fi` for compound conditions |
| Redundant `.gitignore` appends | Dirty working tree when parent dir already ignored | Check if parent directory is already in `.gitignore` before appending |
| `<->` in Markdown | Rendered as broken HTML tag | Use `↔` Unicode arrow or wrap in backticks |
| Brace expansion in `--include` | grep ignores the filter silently | Use separate `--include` flags per extension |
| Blanket `*.config.*` in allowlist | Matches source files like `src/db.config.ts`, bypassing blocklist | Enumerate explicit tool config patterns (`eslint.config.*`, `vite.config.*`, etc.) |
| Missing tool dependency in hook | Hook silently allows action (fail-open) | `command -v` check → `exit 2` with error when tool is missing |
| Empty variable → early exit in guard | Security bypass via unexpected state (e.g., detached HEAD) | Block and explain; don't exit 0 when context is ambiguous |
| Glob fallback picks arbitrary state | Wrong branch's sentinel used for enforcement | Fail-closed: detect ambiguity, block, require explicit action |
| `#N` in bash code blocks | `gh issue close #42` silently becomes `gh issue close` | Use bare numbers or `ISSUE_NUMBER` placeholder — `gh` CLI doesn't need `#` |
| Router says "invoke with Skill" but `Skill` not in `allowed-tools` | Space-syntax dispatch (`/pm next`) may be blocked | Add `Skill` to `allowed-tools` if routing explicitly uses it |
| Hook blocks all agents, not just lead | Teammates can't Edit/Write during active team | Verify hook protocol exposes actor identity before building role-based enforcement |
| Skill commits/pushes without branch verification | Commits and pushes land on wrong branch | Assert `git branch --show-current` matches expected branch before any `git commit`/`git push` |
| Bulk rename over-applied to example output | Namespace prefix appears in self-identification output (review summaries, `flagged by` lists) creating inconsistency | Distinguish invocation code (`Task()` calls) from example output (rendered summaries) — only invocations need namespace prefixes |
| Hardcoding Glob/Grep/Read as only exploration method | Context window bloated with raw search results; misses structural patterns | Use Discover→Target pattern: Explore agent (built-in) for broad discovery, repomix-explorer (if available) for structural overview, then Glob/Grep/Read for targeted follow-up |
| No reviewer-level tracking in multi-step workflows | Comments silently dropped — no way to detect which reviewer's feedback was skipped | Add an enumeration step (baseline) before processing and a coverage verification step (assertion) after — with HALT on mismatch |
| jq multi-line `+` inside object literal | `{ key: (expr) + (expr) }` fails with "unexpected '+', expecting '}'" | Wrap entire addition in outer parens: `{ key: ((expr) + (expr)) }` — jq's object parser can't disambiguate `+` from the field separator |
| Generative wrap-up framing produces hallucinated Agent Notes | "Draft the content for Open Questions" puts model in generation mode — it invents plausible bullets without checking branch state | Add evidence gate inline: "Each bullet MUST cite verified evidence … drop the bullet if you cannot point to specific evidence" |
| Review bodies vs review threads conflation | Bot feedback (CodeRabbit) posted as review bodies is invisible; `in_reply_to` fails on review bodies | Separate GraphQL queries (`reviews` vs `reviewThreads`), separate `reply_type` discriminator, separate reply routing (`in_reply_to` for inline, `gh pr comment` for bodies) |
| Auto-dismissing `is_outdated` threads | Unresolved design feedback silently marked as dismissed | Only GitHub's formal dismiss mechanism (`state == "DISMISSED"`) counts; `is_outdated` threads go to Unresolved for re-checking |
| Advisory hooks instead of inline validation | PostToolUse hook warns about invalid output, but LLM follows workflow steps — warning is ignored | Make validation a named workflow step with explicit "mark as failed" semantics; hooks remain as defense-in-depth only |
| Ambiguous mode boundaries (e.g., quick mode) | LLM infers which agents to run from context, skips layers it shouldn't | Enumerate exactly which agents run and which are skipped in explicit tables at the workflow step level |
| `echo "$var"` piped to `jq` in `#!/bin/sh` scripts | JSON corrupted on macOS — `\n` in body text expanded to real newlines; `jq` exits 5 | Use `printf '%s\n' "$var"` — never `echo` for variable content piped to parsers |
| Injection anchor contains substitutable placeholder | Lead can't find anchor after substitution runs | Use substitution-independent anchors (e.g., `Plan path:` not `Plan path: [plan-path]`) |
| Advisory findings routed to nonexistent message step | Council/tool feedback silently dropped | Ensure the "include in message to X" step has a matching numbered send step that fires *after* the tool invocation |
| Preamble bullets contain literal actions before numbered workflow | LLM executes preamble actions before Step 1 gate (e.g., reads files before task is unblocked) | Keep preambles purely attitudinal/mindset-oriented; in steps 1–N use explicit imperatives for all executable actions, and avoid literal action verbs in preamble bullets |
| Preamble fenced bash blocks as "reference examples" | LLM executes the preamble blocks as though they were step commands, emitting stray output (e.g., `::group::` markers before Step 0) | Put reference examples in prose with inline `code` spans, never standalone fenced bash blocks; open the section with "reference guidance — do not execute directly"; keep every executable command inside a numbered Step |
| Trailing `echo` wrapping a shell step command swallows its exit status | `cmd; echo done` exits 0 even when `cmd` fails — prerequisite/eligibility gates silently pass and the workflow continues with invalid state | Capture `$?` immediately after the real command and re-emit it at the end: `cmd; STATUS=$?; echo done; exit $STATUS`. Never put an `echo` (or any always-succeeding command) as the last statement of an instrumented step |
| Dual numbered sequences in a single prompt | LLM loses track of progress — restarts at "Step 1" of the second sequence or conflates steps across sequences | Use a single continuous numbering scheme across the entire prompt; if phases are needed, use named phases with sub-steps (e.g., 3a, 3b) rather than restarting at 1 |
| Terminology mismatches across workflow steps | LLM treats the same concept as two different things (e.g., "plan" in Step 1 vs "specification" in Step 4), causing missed references or contradictory actions | Audit all workflow steps for consistent term usage; define key terms once at the top and use them identically throughout — never synonym-swap mid-prompt |
| Hard-gate prohibition phrased without scope leaks into post-confirmation territory | A skill correctly refuses to invoke downstream skills before approval, but the same blanket "do NOT invoke any downstream skill" instruction also blocks the post-confirmation hand-off — forcing the user to manually re-type the slash command after they have already chosen | Scope the prohibition to its actual precondition ("before Step N approval"); after the gate clears, define the exact downstream invocation in an action table mapping each user choice to a concrete `Skill` call (or explicit "tell the user to run X"). Never phrase the gate as a global no-invoke rule when it is really a pre-confirmation rule. |

> Sources for pitfalls table: [AGENTS.md](../AGENTS.md) (conventions section), [Plugin Authoring guide](PLUGIN-AUTHORING.md), [Claude Code Skills docs](https://code.claude.com/docs/en/skills), [PR #40](https://github.com/rube-de/cc-skills/pull/40), [PR #41](https://github.com/rube-de/cc-skills/pull/41), [PR #43](https://github.com/rube-de/cc-skills/pull/43), [Issue #59](https://github.com/rube-de/cc-skills/issues/59), [Issue #115](https://github.com/rube-de/cc-skills/issues/115), [PR #157](https://github.com/rube-de/cc-skills/pull/157), [PR #210](https://github.com/rube-de/cc-skills/pull/210), [PR #222](https://github.com/rube-de/cc-skills/pull/222)

---

## Multi-Skill Router Patterns

### Router vs sub-skill model invocation depends on usage pattern

When converting a single-skill plugin to a multi-skill router, `disable-model-invocation` should be set based on **how users express intent**, not on a blanket rule:

**Keep model invocation enabled** when users naturally express the intent in conversation:
- "Create an issue for this bug" → `/pm` (create)
- "What should I work on next?" → `/pm:next`
- "Clean up the old issues" → `/pm:update`

**Disable model invocation** when the skill is purely tool-like and only invoked explicitly:
- `/dlc:security` — nobody says "run a security scan" to a PM
- `/dlc:perf` — explicitly commanded, not conversationally triggered

The `description` field's trigger phrases drive model invocation matching. If the phrases match natural language patterns, keep it enabled. If they only match explicit commands, disable it.

**Bad** — blanket rule from DLC applied to PM:
```yaml
disable-model-invocation: true  # Copied from DLC without considering usage
```

**Good** — PM sub-skills keep invocation enabled with natural trigger phrases:
```yaml
description: >-
  Triage open GitHub issues and recommend what to work on next. ...
  Triggers: what should I work on next, triage backlog, next issue...
user-invocable: true  # Users naturally say these things
```

> Source: [Issue #42](https://github.com/rube-de/cc-skills/issues/42) — PM router conversion. DLC uses `disable-model-invocation: true` for all sub-skills; PM intentionally diverges because its sub-skills map to natural language.

### Routers that explicitly dispatch need `Skill` in `allowed-tools`

If a router skill's instructions say "invoke the sub-skill with `Skill`", then `Skill` **must** be in `allowed-tools`. Without it, the space-syntax dispatch (`/pm next`) may be blocked.

**Both DLC and PM now use active dispatch.** DLC was originally passive (`allowed-tools: [Read, Bash]`, relying on user-typed colon-syntax), but was converted to active dispatch in Issue #44 — it now has `allowed-tools: [Read, Bash, Skill, AskUserQuestion]` and an explicit Routing section that calls `Skill`. PM has used active dispatch since its initial router conversion.

| Router style | Dispatches via | Needs `Skill`? |
|---|---|---|
| Active (DLC) | LLM reads `/dlc security` or `--all` → calls `Skill` tool | **Yes** |
| Active (PM) | LLM reads `/pm next` → calls `Skill` tool | **Yes** |

**Rule**: If your routing section contains "invoke with `Skill`", add `Skill` to `allowed-tools`. If you only document colon-syntax, you don't need it.

> Source: [PR #43](https://github.com/rube-de/cc-skills/pull/43) — CodeRabbit caught this; initially dismissed based on flawed DLC comparison. Confirmed by checking `jules-review` which already uses `Skill` in `allowed-tools`.
> Source: [Issue #44](https://github.com/rube-de/cc-skills/issues/44) — DLC router converted from Passive to Active dispatch. Required adding `Skill` to `allowed-tools` and removing `disable-model-invocation` from sub-skills.

### User-gated actions via `AskUserQuestion`

Skills that create **side-effect external resources** (tracking issues, PR comments on shared threads, follow-up tickets) should ask the user before proceeding — never auto-create. Use `AskUserQuestion` to present the action, its scope, and options (create / skip / show details).

**Scope**: This applies to resources created as a *side effect* of the skill's primary function. Skills whose primary output IS an issue (like DLC scan skills creating structured findings issues) are different — the issue is the deliverable, not a side effect. But skills that create *tracking* issues alongside their main work (like pr-check creating a follow-up issue after fixing comments) should gate on user consent.

**Pattern**: Present a summary → offer "Yes" / "No" / "Show details" → only proceed on explicit approval.

**Bad** — auto-creates without asking:
```markdown
## Step 6: Create Summary Issue
If unresolved items remain, create a GitHub issue...
```

**Good** — user-gated with `AskUserQuestion`:
```markdown
## Step 6: User-Gated Issue Creation
If out-of-scope items remain, use `AskUserQuestion` to ask:
- Options: "Yes, create follow-up issue" / "No, I'll handle manually" / "Show me details first"
```

> Source: [Issue #44](https://github.com/rube-de/cc-skills/issues/44) — DLC `pr-check` auto-created tracking issues without consent. Fixed to match the user-gated pattern used by the PM plugin.

### Read-only analysis skills omit `Write`/`Edit` from allowed-tools

When a DLC sub-skill only analyzes code (no modifications), exclude `Write` and `Edit` from `allowed-tools`. This makes the skill's intent unambiguous and prevents accidental code modifications. Compare:

- **Read-only** (`pr-validity`): `allowed-tools: [Bash, Read, Grep, Glob, AskUserQuestion]`
- **Read-write** (`pr-check`): `allowed-tools: [Bash, Read, Grep, Glob, Write, Edit, AskUserQuestion]`

The tool list signals to both the model and the user whether the skill can change files.

> Source: [Issue #47](https://github.com/rube-de/cc-skills/issues/47) — `pr-validity` sub-skill is read-only analysis; intentionally excludes `Write`/`Edit` to match the scan-only pattern of `security`/`quality`/`perf`/`test`.
> Source: [`plugins/dlc/skills/pr-validity/SKILL.md`](../plugins/dlc/skills/pr-validity/SKILL.md) — compare `allowed-tools` with [`pr-check/SKILL.md`](../plugins/dlc/skills/pr-check/SKILL.md)

### Coverage verification as a safeguard against silent item drops

Multi-step workflows that process a list of items (comments, issues, findings) should bracket the processing steps with **enumeration** (baseline count) and **verification** (assertion). Without both, silently dropped items are undetectable.

**Pattern**: Enumerate → Process → Verify → HALT on mismatch

**Bad** — totals-only check (drops can hide):
```text
Fetched 12 comments total; categorized 12 comments total. ✓
# But @reviewerA had 4 comments and only 3 were categorized,
# while @reviewerB had 3 comments and 4 were categorized (phantom).
# Total still matches — the drop is invisible.
```

**Good** — per-source enumeration + verification:
```text
@reviewerA: expected 4, categorized 4 ✓
@reviewerB: expected 3, categorized 2 ✗
  → HALT: missing comment IDs: [2808261121]
  → Recovery: re-processing 1 missed comment through Steps 3-5...
  → Retry verification: @reviewerB: expected 3, categorized 3 ✓
```

- **Step N**: Enumerate items per source (reviewer, scanner, etc.) — store counts as baseline
- **Steps N+1 through M**: Process, categorize, and act on each item
- **Step M+1**: Assert sum-across-categories == baseline per source
- **HALT** if mismatch — print missing IDs, attempt one retry, then stop permanently

The key insight is tracking by **source** (per-reviewer, per-scanner), not just totals. A total-only check can mask offsetting errors (one reviewer gains a phantom category while another loses a real one).

> Source: [Issue #64](https://github.com/rube-de/cc-skills/issues/64) — `pr-check` Steps 2b and 5b. Claude Code Insights report identified missed review comments as the #1 friction point.

### Skills that commit/push must verify the correct branch first

Any skill that runs `git commit` + `git push origin HEAD` must verify that the current branch matches the expected target **before** making changes. If the skill retrieves a branch name (e.g., `headRefName` from a PR), it should assert `git branch --show-current` matches — not assume the user invoked the skill from the right branch.

**Three-way check pattern**:
1. **Match** → proceed
2. **Mismatch + dirty worktree** → abort with actionable error (stash/commit first)
3. **Mismatch + clean worktree** → auto-checkout (e.g., `gh pr checkout`) + post-checkout verification

Post-checkout verification is defense-in-depth: re-check `git branch --show-current` after the checkout command to catch silent failures.

**Why this matters**: Without verification, `git push origin HEAD` pushes to whatever branch you're on — not the PR's branch. PR #53 increased blast radius by adding `git push` to `pr-check`, turning "wrong local commit" into "wrong remote push."

> Source: [Issue #54](https://github.com/rube-de/cc-skills/issues/54) — `pr-check` fetched `headRefName` but never verified or checked out the branch before committing and pushing.

### Skill instructions must use namespaced agent names for Task invocations

Claude Code registers plugin agents with a `{plugin}:{agent}` namespace prefix (e.g., `council:gemini-consultant`). Agent definition files (`agents/*.md`) use bare `name:` fields because Claude Code adds the prefix automatically. But skill instruction files (SKILL.md, WORKFLOWS.md) that tell Claude *how to invoke* agents via the `Task` tool must use the fully qualified name — otherwise Claude gets "Agent type not found" errors at runtime.

**Bare names are correct in two places only**:
1. Agent frontmatter `name:` field — Claude Code prefixes automatically
2. JSON response schema enum values — self-identification output, not invocations

**Everywhere else** in skill instructions (tables, diagrams, `Task()` pseudocode, prose references), use the full `{plugin}:{agent}` form.

**Bad** — bare name in skill instructions:
```markdown
| `gemini-consultant` | `gemini` | Architecture |
Task(gemini-consultant, timeout=120s): ...
```

**Good** — namespaced in skill instructions:
```markdown
| `council:gemini-consultant` | `gemini` | Architecture |
Task(council:gemini-consultant, timeout=120s): ...
```

> Source: [Issue #63](https://github.com/rube-de/cc-skills/issues/63), [PR #71](https://github.com/rube-de/cc-skills/pull/71) — All 8 council agents failed to resolve because SKILL.md and WORKFLOWS.md used bare names.

### Response validation must be explicit in workflow steps, not advisory

PostToolUse hooks that warn about invalid consultant output are insufficient because the orchestrating LLM follows workflow steps, not hook warnings. A hook can detect a malformed JSON response and print a warning, but the LLM proceeds to the next workflow step regardless — the warning sits in tool output it may never re-read.

**Fix**: Make validation a **named workflow step** with explicit "mark as failed" semantics. The LLM reads and executes workflow steps sequentially, so an inline validation step between "collect responses" and "score findings" forces the check to happen. The hook remains as defense-in-depth but is no longer the primary gate.

The same pattern applies to **layer completion guarantees** and **mode boundaries** (e.g., quick mode agent selection). If the LLM must choose which agents to run, list them in an explicit table at the step level — don't rely on the LLM inferring the boundary from surrounding context.

> Source: [Issue #65](https://github.com/rube-de/cc-skills/issues/65) — Claude skipped Layer 2 in quick mode and posted reviews with wrong formatting because it inferred behavior from context instead of following explicit steps.

### Don't create separate artifacts for the same information

When designing multi-agent workflows, resist the urge to create distinct output files for each role (e.g., "dev report" from the reviewer + "session handoff" from the lead). If two artifacts overlap heavily, consolidate into one. Ask: **what does this capture that isn't already in git history, PR metadata, or the plan file?** If the answer is "nothing unique," it's dead documentation that nobody will read.

**Bad pattern**: Reviewer writes a dev report (summary, changes table, test results, execution waves) AND the Lead writes a handoff (task summary, files changed, decisions, context). The changes table duplicates `git log`, test results duplicate CI, and the summary duplicates the PR description.

**Good pattern**: Single lean handoff capturing only what's NOT elsewhere — open questions, unresolved items, and context a future session can't infer from the code.

> Source: [PR #142](https://github.com/rube-de/cc-skills/pull/142) — consolidated dev report + session handoff into a single artifact, removing ~91 lines of template and report-writing logic from the reviewer teammate prompt.

### GitHub PRs have three comment types — don't forget issue comments

GitHub's GraphQL API surfaces three distinct comment types on pull requests: `reviewThreads` (inline code comments), `reviews` (top-level review bodies with `APPROVED` / `CHANGES_REQUESTED` / `COMMENTED` state), and `comments` (general PR-level issue comments). Tools that only query the first two will silently miss any comment posted via `gh pr comment`, the Issues API, or bots that use the issue comment mechanism (e.g., `claude[bot]`, `coderabbitai`, `gemini-code-assist`).

**Bad pattern**: Querying only `reviews` and `reviewThreads` — bot findings posted as issue comments are invisible.

**Good pattern**: Query all three (`comments`, `reviews`, `reviewThreads`) and assign distinct `reply_type` values (`issue_comment`, `pr_comment`, `inline`) so downstream consumers can route replies correctly.

> Source: [Issue #166](https://github.com/rube-de/cc-skills/issues/166) — `claude[bot]` issue comment with 3 actionable findings was silently dropped because `pr-comments.sh` didn't query `comments`.

### Issue comments are a flat array — use sentinels for reply attribution

GitHub's `pullRequest.comments` (issue comments) is a flat list with no `in_reply_to_id` or parent-child structure. This means DLC replies posted via `gh pr comment` are indistinguishable from original reviewer comments on re-runs. Two problems arise: (1) "already replied" detection based on body-matching heuristics (e.g., quoting the first 100 chars) is fragile and can false-match, and (2) DLC's own replies appear as new issue comments, inflating reviewer inventories and creating phantom coverage targets.

**Bad pattern**: Detecting prior DLC replies by matching body text prefixes against a flat comment array — coincidental matches cause false positives; DLC's own replies create ghost reviewers.

**Good pattern**: Embed a `<!-- dlc-reply:{database_id} -->` HTML comment sentinel in every DLC reply body. On re-runs, the script filters sentinel-bearing comments from the reviewer inventory, and the skill matches by `database_id` for reliable "already replied" detection.

> Source: [PR #167](https://github.com/rube-de/cc-skills/pull/167) — `claude[bot]` identified the re-ingestion bug and the unreliable Resolved heuristic; sentinel approach fixes both.

### Forking workflows: preserve phase numbering, use half-phases for extensions

When forking a multi-phase workflow (e.g., `github-issue-work` → `plugin-dev:develop`), preserve the original phase numbers (0, 1, 2, 3-4, 5-7, 8-9, 10, 11) so readers can cross-reference between workflows. New extension phases should use half-numbers (4.5, 7.5) to slot between existing phases without renumbering. This makes diffs between the base and forked workflow obvious and keeps the mental model portable across variants.

**Bad pattern**: Renumbering all phases after inserting new ones — breaks cross-references and makes it hard to see what's forked vs. original.

**Good pattern**: Phase 4.5 (RED baseline) slots between Phase 3-4 (validate) and Phase 5-7 (implement). Phase 7.5 (REFACTOR verify) slots between Phase 5-7 (implement) and Phase 8-9 (review). Original numbering is untouched.

> Source: [Issue #160](https://github.com/rube-de/cc-skills/issues/160) — fork of github-issue-work into `/plugin-dev:develop` with TDD extension points.

### DLC reply prefixes must align with thread resolution semantics on reruns

When a skill posts replies with different prefixes (`Fixed:`, `Answered:`, `Dismissed:`, `Acknowledged:`), the rerun classification logic must treat them differently based on whether the thread was resolved on GitHub:

- **"Fixed:", "Dismissed:", "Answered:"** → thread was resolved via `resolveReviewThread` → classify as **Resolved** on rerun
- **"Acknowledged:"** → thread intentionally left unresolved (work is pending) → classify as **Unresolved** on rerun

If the rerun classification treats all DLC reply prefixes equally as "Resolved," threads that are still open on GitHub get silently skipped — a coverage gap invisible to both the agent and the reviewer.

**Related pattern**: When a workflow adds a secondary API call after a primary one (e.g., `resolveReviewThread` after posting a reply), gate the secondary call on the primary's success. Otherwise a failed reply + successful resolve leaves the reviewer with a closed conversation and no explanation.

**Related pattern**: When suppressing command output for non-fatal calls (`>/dev/null`), only redirect stdout — keep stderr visible for debugging. `>/dev/null 2>&1` hides error messages that would explain why a call failed.

> Source: [PR #183](https://github.com/rube-de/cc-skills/pull/183) — Three independent reviewers (Gemini, Codex, Claude) identified these patterns across the `resolveReviewThread` addition.

### jq `==` comparisons inside object constructors — compute outside `{}`

jq's parser handles `==` inside object constructors `{ key: expr == val }` inconsistently across builds. Apple `jq-1.7.1-apple` throws `syntax error, unexpected ==`; some Linux jq builds (standard 1.7.x, older 1.5/1.6) also fail. The double-parenthesization fix `((expr) == val)` from PR #179 resolved Apple jq but still broke on Linux.

**Portable fix**: Compute comparison results as jq variables **before** the object constructor, then reference them inside. No jq build has issues with `==` outside `{}`.

**Bad** — comparison inside object constructor (fragile):
```jq
[ .[] | . + {
  blockers_resolved: ((expr1) == (.blocked_by | length)),
  unblocked: ((expr2) == 0)
}]
```

**Good** — comparison as variable binding outside `{}` (portable):
```jq
[ .[] |
  ((expr1) == (.blocked_by | length)) as $resolved |
  ((expr2) == 0) as $is_unblocked |
  . + {
    blockers_resolved: $resolved,
    unblocked: $is_unblocked
  }
]
```

> Source: [PR #179](https://github.com/rube-de/cc-skills/pull/179), fixes [#177](https://github.com/rube-de/cc-skills/issues/177); regression reported in [#184](https://github.com/rube-de/cc-skills/issues/184) — `plugins/project-manager/scripts/open-issues.sh`

### Use `-F` (not `-f`) for integer fields in `gh api` calls

`gh api` has two field flags: `-f` (lowercase) always sends a string, while `-F` (uppercase) performs JSON type inference so integers stay integers. APIs that require an integer field (e.g. `sub_issue_id` in the GitHub Sub-Issues API) return a type error if the value arrives as a string. Always use `-F` for numeric fields.

**Bad pattern**: `gh api ... -f sub_issue_id=123` — sends `"123"` (string), API rejects with type error.

**Good pattern**: `gh api ... -F "sub_issue_id=$sub_issue_id"` — sends `123` (integer). Note the quoting: `-F "key=$var"` keeps the entire `key=value` as one shell argument.

> Source: [PR #185](https://github.com/rube-de/cc-skills/pull/185) — `plugins/project-manager/skills/pm/SKILL.md`

### Coordinator-only workflows must not run tests directly

When a workflow enforces a coordinator-only role (Lead delegates, never implements), the Final Verification step must also delegate test execution to the tester teammate rather than having the Lead run tests. This is easy to miss because final verification feels like an orchestration step, but running `npm test` or `pytest` is implementation work.

**Bad pattern**: Lead runs `npm test` in Final Verification while the Anti-Patterns section says "Running tests directly instead of waiting for tester reports."

**Good pattern**: Lead messages tester: "Final verification — run the full test suite one last time" and waits for tester confirmation. Lead may still run non-test checks (stub scans via `rg`) since those are code inspection, not test execution.

> Source: [PR #195](https://github.com/rube-de/cc-skills/pull/195) — `plugins/cdt/skills/cdt/references/bugfix-workflow.md`

### Multi-mode skills must update all role descriptions

When adding a new mode to a skill that defines roles in SKILL.md, update every role description that participates in the new mode — not just the new role. Headers like `(teammate — spawn via Teammate tool, dev phase)` must include the new phase, and descriptions like "Implements tasks from plan" must account for the new mode's input (e.g., bug spec instead of plan).

Also update: teammate pairs list, marketplace.json description, and mode count in the skill's description frontmatter.

> Source: [PR #195](https://github.com/rube-de/cc-skills/pull/195) — `plugins/cdt/skills/cdt/SKILL.md`, `.claude-plugin/marketplace.json`

### Loop/babysit swallows Discussion-Deferred items

When `dlc:pr-check` runs inside `dlc:babysit` (via `/loop`), no human is at the terminal to answer `AskUserQuestion`. Discussion items auto-defer and get an "Acknowledged — will be addressed by the author" reply on the PR, but the human is never notified. The fix has two parts: (1) babysit must surface Discussion-Deferred items as a dedicated notification (`needs_decision` state key), and (2) pr-check's auto-implementation gate should be wider — if you'd confidently mark one option "(Recommended)", you already know the answer, so just implement it. `AskUserQuestion` is for genuine ambiguity, not a rubber stamp.

> Source: [`plugins/dlc/skills/babysit/SKILL.md`](../plugins/dlc/skills/babysit/SKILL.md), [`plugins/dlc/skills/pr-check/SKILL.md`](../plugins/dlc/skills/pr-check/SKILL.md)

### Conditional-sounding steps get skipped by loop agents

When a babysit/loop agent has context from a prior cycle ("I resolved all 3 threads"), it will rationalize skipping a step if the wording reads as conditional — e.g., "Delegate all review comment handling to X" implies "if there's review work." But bot reviewers (Copilot, CodeRabbit, Gemini) post new comments after every push, so prior-cycle state is always stale. Fix: add an explicit "always run, never skip" directive with the rationale, so the agent understands *why* it can't rely on its memory of the previous cycle.

> Source: [Issue #200](https://github.com/rube-de/cc-skills/issues/200) — `plugins/dlc/skills/babysit/SKILL.md` Step 3

### Loop agents need positive framing, not just prohibitions

When a babysit/loop agent runs 5+ review-fix cycles, it can develop "context fatigue" — perceiving the cycle as Sisyphean busywork rather than convergent progress. The symptom is the agent bypassing the skill protocol entirely (running raw API calls to dismiss comments) rather than misinterpreting skill instructions. Prohibitions ("never dismiss comments") don't address this because the agent bypasses the skill text, not misreads it.

**Fix:** Add motivational framing that normalizes the iteration count ("3-8 cycles is typical"), frames each cycle as measurable progress ("12 -> 5 -> 2 -> 0"), and reinforces that the human trusts the loop to complete autonomously. Place the framing both at the skill top (sets the mindset) and at the delegation step (reinforces at the decision point).

**Key insight:** This is a class 2 failure (protocol bypass), not class 1 (protocol misinterpretation). Stronger wording in the protocol doesn't prevent an agent that decides to skip the protocol. Motivation addresses the *reason* for bypassing.

**Bad pattern:** Repeated loop cycles framed as busywork → agent bypasses protocol with raw API dismissals.
**Good pattern:** Normalize expected convergence cycles and reinforce trust at delegation points.

> Source: [`plugins/dlc/skills/babysit/SKILL.md`](../plugins/dlc/skills/babysit/SKILL.md), [PR #205](https://github.com/rube-de/cc-skills/pull/205)

### CI early-exit blocks pr-check for review-tool checks

External review tools (Codacy, CodeRabbit, Qodo) report findings via the GitHub Checks API — their check appears as "failed" even though the failure is unresolved review comments, not broken code. If a babysit/loop workflow gates all subsequent steps behind "CI must pass," it creates a deadlock: pr-check never runs to address the review comments, so the review-tool check never clears, so pr-check never runs.

**Rule:** CI failures gate only the final "ready to merge" decision — never intermediate steps like pr-check or rebase.

**Bad** — CI gates the entire pipeline:
```text
Step 1: CI fails → Stop (pr-check never runs → review-tool check never clears → deadlock)
Step 2: Only reached if CI passes (rebase blocked for no reason)
```

**Good** — CI tracked as a flag, decision deferred:
```text
Step 1: CI fails → set CI_STATUS=failing, continue
Step 2: Rebase always (branch freshness ≠ CI health)
Step 3: pr-check always (may resolve review-tool CI failures)
Step 4: Only declare "ready to merge" if CI_STATUS=passing
```

> Source: [PR #203](https://github.com/rube-de/cc-skills/pull/203) — `plugins/dlc/skills/babysit/SKILL.md` Steps 1, 1b, 2, 4

---

### CI review agents need consistent output format across all specialists

When multiple review agents produce findings that must be aggregated (scored, filtered, mapped to inline comments), enforce a single output format across all agent definitions.

**Bad** — each agent uses its own format:
```text
Agent A: "Found issue at line 42 in api.ts — high severity"
Agent B: "## HIGH: api.ts:42 — injection risk"
Agent C: "- [H] api.ts L42: user input not sanitized"
```

**Good** — uniform format parseable by the orchestrator:
```markdown
## Findings

1. **[high]** `api.ts:42`
   User input not sanitized.
   **Recommendation:** Use parameterized queries.
```

The orchestrator (SKILL.md) parses findings to extract severity, file, line, message, and recommendation. Inconsistent formats cause findings to be silently dropped during aggregation.

> Source: `plugins/ci-review/agents/*.md` — all review agents + `plugins/ci-review/skills/ci-review/SKILL.md` Step 5

### GitHub PR reviews vs PR comments — use the right API

`gh pr comment` posts a standalone comment. `gh api repos/OWNER/REPO/pulls/N/reviews` posts a proper review with inline annotations. For CI reviewers, always use the review API — inline comments appear next to the code, not buried in the comment thread.

**Key rules for the review API:**
- Use `event: "COMMENT"` for CI bots (never `APPROVE` or `REQUEST_CHANGES` — that gates merges)
- Use `jq -n` to build JSON payloads (robust for dynamic construction)
- Handle inline comment failures gracefully: retry without invalid comments → body-only → fall back to `gh pr comment`
- `line` refers to the NEW file version. Always use `side: "RIGHT"`

> Source: `plugins/ci-review/skills/ci-review/references/REVIEW-POSTING.md`, adapted from `plugins/jules-review/skills/jules-review/references/WORKFLOW.md`

### Scorer agents need the same context they're asked to verify

If a scoring/validation agent is told to check a criterion (e.g., "is this finding in the PR diff?"), it must receive the data needed to verify it. Unverifiable criteria are worse than no criteria — the agent either ignores them or hallucinates an assessment.

**Bad** — scorer is told to check diff membership but doesn't receive the diff:
```markdown
## Evaluation Criteria
1. Is the file:line in the diff? If not, score 0.
```

**Good** — scorer receives the diff in its prompt:
```markdown
## Finding
{finding text}

## PR Diff
{diff text}
```

Haiku is cheap enough that passing the diff to each per-finding scorer is a negligible cost increase for a significant quality improvement.

> Source: `plugins/ci-review/agents/confidence-scorer.md` + `plugins/ci-review/skills/ci-review/SKILL.md` Step 5

### Don't prescribe actions agents can't perform

Agent instructions should only ask for things the agent can actually do with its available tools and model capabilities. "Compile and run @example blocks" in a review agent prompt is unrealistic — the agent will either ignore it or waste turns. "Check if examples look correct given the function signature" is achievable.

Similarly, avoid opinionated design philosophy (e.g., "avoid anemic models") unless the project's CLAUDE.md explicitly endorses it. Universal best practices (illegal states, immutability) are fine; school-of-thought preferences (DDD vs functional) produce false positives.

> Source: `plugins/ci-review/agents/comment-analyzer.md`, `plugins/ci-review/agents/type-analyzer.md`

### Detect before act — don't blindly run state-changing commands

When a skill needs a prerequisite state (e.g., correct branch checked out), check first and only act if needed. Blindly running `gh pr checkout` is disruptive locally and redundant in CI where `actions/checkout` already did it.

**Bad** — always run:
```markdown
### Step 3.5: Checkout PR Branch
gh pr checkout <PR#>
```

**Good** — detect, then act only if needed:
```markdown
### Step 3.5: Ensure PR Branch
CURRENT=$(git branch --show-current)
PR_HEAD=$(gh pr view <PR#> --json headRefName --jq '.headRefName')
# If already on correct branch → skip. If not → checkout.
```

> Source: `plugins/ci-review/skills/ci-review/SKILL.md` Step 3.5

### Multi-agent "What NOT to Flag" exclusions create dead zones

When specialized review agents have hard exclusion lists ("Do NOT flag error handling — the silent-failure-hunter handles that"), cross-cutting bugs fall into gaps between agents. Both agents think the other one covers it; neither catches it.

**Bad** — hard handoffs create dead zones:
```markdown
## What NOT to Flag
- Missing error handling (empty catches) — the silent-failure-hunter handles that
- Security vulnerabilities — the security-reviewer handles that
```

**Good** — soft scoping with an escape hatch:
```markdown
## Scope
Your primary focus is **logic errors**. Deprioritize style and pure code simplification.
However, if you find a severe error handling gap, report it regardless of category.
Only flag issues introduced or exposed by the diff.
```

The polling race condition in `use-deposit.ts` (reset() can't cancel in-flight async, causing stale callbacks) was caught by both baselines but missed by both multi-agent skill runs. The bug-detector thought it was "error handling territory" and the silent-failure-hunter saw it as "logic territory."

**Fix**: (A) Add an unconstrained deep-reviewer agent as a safety net, (B) replace hard exclusions with soft weighting across all agents.

> Source: ci-review skill eval iteration-1, PR oasisprotocol/flexvaults-sdk#43

### Name agents by their actual function, not aspirational titles

The `code-reviewer` agent was named like a generalist but was actually a CLAUDE.md conventions enforcer — the narrowest agent in the set. The misleading name obscured the fact that no agent was doing a broad, unconstrained review. Renamed to `guidelines-checker` to match its actual scope.

> Source: ci-review skill eval iteration-1

### Multi-agent specialization creates systematic blind spots that single-agent reviews don't have

When 6 specialized agents each review within their defined scope, findings that span multiple domains — or that fall between scopes — get missed. In a 4-configuration eval (Sonnet/Opus × baseline/skill) against PR oasisprotocol/flexvaults-sdk#43, single-agent baselines found 8 real issues that neither skill run caught. They cluster into 4 gaps:

**Gap 1 — Error message quality**: The silent-failure-hunter checks *whether* errors are surfaced, but not *whether the message is accurate*. A misleading error message after an on-chain transfer ("status check failing") makes users think their funds are lost. **Fix**: Added error message accuracy and non-cancellable state audit to the deep-reviewer's priorities.

**Gap 2 — Fallback value semantic correctness**: `?? chains[0]` doesn't crash, but silently sends the wrong `chain_id` to the API — a data integrity bug hiding behind defensive code. No agent checked whether fallback values are semantically correct for the domain. **Fix**: Added fallback value analysis to the bug-detector.

**Gap 3 — Cross-SDK parity**: When a diff touches both TS and Python, each agent reviews them independently but never compares implementations. A single-agent baseline naturally scans the whole diff and notices mismatches (optional vs required fields, `str(float)` edge cases, runtime type enforcement). **Fix**: Added cross-SDK parity checking to the guidelines-checker.

**Gap 4 — Unused validation constraints**: When an API response includes `min_deposit` thresholds but the code never validates against them, it's a business logic gap. No agent checked "does the code use all available validation data?" **Fix**: Added unused validation constraint checking to the bug-detector.

These are small prompt additions (2-4 lines each) but address systematic coverage gaps that repeat across PRs.

> Source: ci-review skill eval iteration-2, PR oasisprotocol/flexvaults-sdk#43, files: `plugins/ci-review/agents/{deep-reviewer,bug-detector,guidelines-checker}.md`

### LLM agent skills that post replies need an explicit "silence" outcome

`dlc:pr-check` had reply categories for Fixed / Dismissed / Answered but no first-class "no reply needed" outcome. The Step 2 categorization rubric gated "non-actionable → Resolved" on `state == "APPROVED"`, so a bot review posted with `state == "COMMENTED"` and body "No actionable issues found" fell through to Unresolved, got rescued by Step 3.5b as a "Clarification Answer", and received a reply echoing what the original comment already said ("Answered: no action needed — CI Review reported no actionable issues").

The same shape produced a second bug: a review body that summarized its own inline comments had no path to Resolved, so Step 4 posted a redundant top-level "Answered: see inline thread replies — …" comment alongside the inline replies.

**Root pattern:** When an agent is instructed to "reply to each unresolved item", the Unresolved classification becomes a funnel that always exits through a posted comment. If the rubric has no "this exists but nothing needs to be said about it" case, the agent will manufacture content to fit one of the reply slots.

**Fix:** Broaden Resolved to cover non-actionable bodies regardless of review `state`, add a "summary-only review body" sub-case, and add an explicit **Silent-Resolved gate** at the top of the reply step that tells the agent to short-circuit before routing.

**Bad pattern (narrow gate, forced reply):**
```text
Resolved: state == "APPROVED" AND non-actionable
Unresolved: everything else → gets a reply
```

**Good pattern (content-driven gate, silence is an outcome):**
```text
Resolved: already-replied OR non-actionable (any state) OR summary-only
Reply categories: Silent (no post) | Fixed | Dismissed | Answered
```

> Source: branch fix/pr-check-silent-on-non-actionable, file: `plugins/dlc/skills/pr-check/SKILL.md`

### `"Acknowledged — will be addressed by the author"` is a dishonest placeholder in unattended mode

`dlc:pr-check` running under `/dlc:babysit` on a `/loop` posted `Acknowledged — will be addressed by the author` replies whenever a Discussion item fell through its conservative auto-implement rules. The bot isn't the author and no human saw the comment, so the reply is a lie — the thread was neither handled nor queued. Two pathologies followed: low-risk items that could have been auto-fixed (rename, typo, null check) got silently deferred, and genuine human-judgment items got buried behind the same polite reply + a terse `Notify:` line that was easy to miss on mobile.

**Root pattern:** The reply text `Acknowledged — will be addressed by the author` was reachable both from an explicit user click ("Defer to author" in `AskUserQuestion`) AND as a silent fallback when `AskUserQuestion` returned empty in a non-interactive loop. The same string served two opposite semantics — an authored decision and a stand-in for "nobody decided" — so the timeline couldn't distinguish them.

**Rule:** The placeholder reply fires if and only if the user explicitly selected the corresponding option in `AskUserQuestion`. Never on empty answers, never as a fallback, never in unattended mode, never on any automated path.

**Fix:**
1. Introduce an explicit `--unattended` mode in pr-check with a bright-line **Autonomy Ladder** (ten low-risk patterns: rename, typo, comment edit, null check, logging, tighten condition, add validation, extract constant, formatting, reviewer-flagged dead code) that auto-implements without `AskUserQuestion`.
2. Add a **Pending-Human** classification for items that require human judgment. Pending-Human emits silence — no reply, no Discussion-Deferred assignment. Items are returned via a `Pending-Human: <n> — ...` line in pr-check's Step 6 summary.
3. In babysit, fire `PushNotification` (a real tool call — not a `Notify:` print line that doesn't ping the device) on Pending-Human, then self-cancel the cron. The halt is the communication.
4. Add an empty-answer safeguard inside attended mode: if `AskUserQuestion` returns empty, re-ask once; if still empty, reclassify as Pending-Human instead of defaulting to Defer.

**Bad pattern (placeholder as fallback):**
```text
AskUserQuestion returns empty → default to "Defer to author" → post "Acknowledged — will be addressed by the author"
(result: silent acknowledgment with no decision behind it)
```

**Good pattern (halt loudly; silence is a legitimate outcome):**
```text
AskUserQuestion returns empty → re-ask once → still empty → Pending-Human (no reply)
pr-check Step 6 emits: "Pending-Human: 2 — naming of foo(); async shape"
babysit fires PushNotification + CronDelete + state file cleanup
```

> Source: PR implementing issue #212; spec `.dev/pm/specs/2026-04-17-dlc-autonomy-and-halt-on-defer.md`; files: `plugins/dlc/skills/pr-check/**`, `plugins/dlc/skills/babysit/SKILL.md`

### The mode-split invariant: `AskUserQuestion` must be gated by `UNATTENDED` wherever it appears

The first pass of `--unattended` only split the classifier for Discussion items. Fixable items still called `AskUserQuestion` on Medium/Low confidence — which meant unattended `/loop` runs re-introduced the exact empty-answer failure mode the feature was designed to kill. A reviewer caught it in post-merge review; the Pending-Human halt surfaced the gap rather than hiding it (meta-validation).

**Rule:** Every `AskUserQuestion` call site in pr-check must check `UNATTENDED` before firing. Attended mode keeps the menu; unattended mode reclassifies as **Pending-Human**. An empty-answer safeguard belongs next to every call site, not just one — attended empty answers must reclassify as Pending-Human, never silently default to a user-facing acknowledgement reply.

**Bad pattern:** split the classifier in one workflow (`discussion-workflow.md`) and leave another (`fixable-workflow.md`) unchanged. The invariant leaks.

**Good pattern:** audit every call site before merging the first mode-split. If `AskUserQuestion` fires anywhere under `UNATTENDED=true`, the feature is incomplete.

> Source: follow-up to #212 (#213); surfaced by copilot-pull-request-reviewer on PR #213; files: `plugins/dlc/skills/pr-check/references/fixable-workflow.md`
