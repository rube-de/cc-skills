# Directives Schema

Per-run sidecar JSON file carrying Lead → teammate control signals during the cdt planning phase. Replaces three legacy signal carriers (prompt-prose injection, plan-metadata field, undocumented arg flag) with a single structured source of truth.

## Why a sidecar file

Control signals must reach the PM teammate at Step 4 (external review decision). Two failure modes drove this design:

1. **Prompt-prose drift** — historically the Lead injected an English sentence ("The Lead has requested council review via `--review-plan` flag") into the PM prompt; PM matched against that sentence to decide whether to invoke the council. Renaming the flag, rewording the injection, or LLM paraphrasing broke the match silently.
2. **Adversarial reach** — when control signals live in prompt prose interleaved with untrusted content (research findings, plan body), an injection in the untrusted block can fabricate a signal. The existing research-context sandboxing (`==== BEGIN RESEARCH CONTEXT (REFERENCE ONLY) ====`) keeps untrusted content from being read as instructions; the directives file is the complement — trusted control signals live outside the prompt stream entirely.

Persisting the file alongside the plan also gives an audit trail: which review tiers were enabled for which plan run.

## File path

```
.dev/cdt/plans/plan-$TIMESTAMP.directives.json
```

`$TIMESTAMP` is the same minute-resolution `YYYYMMDD-HHMM` value used for `plan-$TIMESTAMP.md` — directives are co-located with their plan.

## Schema v1

```json
{
  "schema_version": "1",
  "auto_task_baseline": false,
  "council_review": false
}
```

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `schema_version` | string | required | Schema version. PM warns and uses safe-defaults (all directives `false`) on unknown values. |
| `auto_task_baseline` | bool | `false` | If `true`, PM spawns `Task subagent_type: "codex-consultant"` exactly once for advisory baseline review. |
| `council_review` | bool | `false` | If `true`, PM invokes `Skill: council args "plan [plan-path]"` exactly once for 2-consultant deep review. |

Both review tiers are **advisory only** — neither can hard-block. PM remains the single source of feedback to the architect.

## Lifecycle

| Phase | Actor | Action |
|-------|-------|--------|
| 1. Initial write | Lead | Step 4a writes the file with initial values derived from invocation context: `/cdt:auto-task` → `auto_task_baseline: true`; `--review-plan` in `$ARGUMENTS` → `council_review: true`. All other fields default `false`. |
| 2. Optional mutation | Architect | During design (Step 5b), the architect MAY `Edit` the file to set `council_review: true` if the design judgment warrants it. Architect MUST NOT mutate `auto_task_baseline` or `schema_version`. |
| 3. Read & dispatch | PM | Step 4 reads the file. Missing file / malformed JSON / unknown `schema_version` → log warning, treat all directives as `false`, proceed (fail-safe). |
| 4. Persistence | — | File is never deleted by the workflow. It persists alongside the plan as an audit trail. |

## Behavior matrix

| Invocation | `auto_task_baseline` | `council_review` | External review |
|------------|----------------------|------------------|-----------------|
| `/cdt:plan-task <task>` | `false` | `false` | none |
| `/cdt:plan-task <task> --review-plan` | `false` | `true` | council |
| `/cdt:full-task <task>` | `false` | `false` | none |
| `/cdt:full-task <task> --review-plan` | `false` | `true` | council |
| `/cdt:auto-task <task>` | `true` | `false` | codex baseline |
| `/cdt:auto-task <task> --review-plan` | `true` | `true` | codex baseline + council |
| any of the above + architect flips `council_review: true` | unchanged | `true` | baseline (if set) + council |

## Canonical JSON formatting

The Lead writes the file with this exact formatting (2-space indent, trailing newline). Architect's `Edit` depends on byte-level match:

```
{
  "schema_version": "1",
  "auto_task_baseline": <bool>,
  "council_review": <bool>
}
```

Architect's mutation uses `Edit` with `old_string: "council_review": false` → `new_string: "council_review": true`. Single-field change; never rewrite the whole file.

## Edge cases

- **codex CLI unavailable.** When `auto_task_baseline: true` but `codex` is missing from `$PATH`, the `Task` call returns an error. PM logs a skip notice in its verdict and proceeds. Auto-task does NOT halt.
- **Unknown `schema_version`.** PM warns and treats all directives as `false`. Prevents silent breakage when the schema evolves.
- **Missing directives file.** Same as unknown schema_version — log warning, safe-default, proceed. A Lead-side write failure should not halt planning.
- **Malformed JSON.** Same fail-safe path.
- **Architect mutates fields it shouldn't.** Architect prompt restricts mutations to `council_review`. PM's behavior is governed by what it reads — defense in depth would be PM ignoring `auto_task_baseline` writes from the architect, but v1 trusts the architect prompt.
- **Per-timestamp collision.** Filenames embed `$TIMESTAMP` to minute resolution; collision requires simultaneous invocation on the same branch within the same minute. Not mitigated further in v1 — same risk as the plan file.

## Extension policy

Adding a new directive:

1. **Non-breaking additions** — adding a defaulted-`false` bool field does NOT require a schema-version bump. Older readers tolerate unknown fields; new writers gate behavior on the new field. Document the field here under Schema v1.
2. **Breaking changes** — renaming, removing, or changing the type of an existing field requires bumping `schema_version` to `"2"` and updating PM's read logic to handle both versions during a deprecation window.
3. **Architect mutation rights** — by default, new directives are Lead-write-only. To grant the architect mutation rights, document explicitly here AND in the architect prompt in `plan-workflow.md`.
4. **Update the behavior matrix above** whenever a new invocation path enables a directive automatically.

## Related

- `plan-workflow.md` Step 4a — Lead initialization
- `plan-workflow.md` Step 5b architect prompt — Edit instruction
- `plan-workflow.md` Step 5b PM prompt Step 4 — read + dispatch logic
- `commands/auto-task.md` Phase 1 — sets `auto_task_baseline: true`
- `council:review-plan/SKILL.md` lines 115-146 — critique prompt template reused by codex-baseline path
