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

### PreToolUse hooks enforce role boundaries

When a lead agent bypasses delegation and edits source code directly, prompt instructions alone are insufficient — the model treats them as advisory. Use **PreToolUse hooks** as hard guardrails:

1. **State tracking**: A `TeamCreate`/`TeamDelete` hook manages a branch-scoped state file (`.claude/<branch-slug>/.cdt-team-active`) that signals whether a team session is active
2. **Tool blocking**: `Edit`/`Write` hooks check the state file, parse `file_path` from tool input, and exit 2 to block source file edits
3. **Allowlist + blocklist**: Two-tier filtering — path allowlist (plans, config, ADRs always allowed) then extension blocklist (`.ts`, `.js`, `.py`, etc. blocked)
4. **Soft reinforcement**: Prompt-level "Lead Identity" section + anti-patterns in workflow docs reduce how often hooks need to fire

**Pattern**: Hard guardrails (hooks) + soft constraints (prompts) = defense-in-depth for agent role enforcement.

> Source: [Issue #32](https://github.com/rube-de/cc-skills/issues/32) — Lead agent was directly editing source files, bypassing teammate delegation. Fixed with `enforce-lead-delegation.sh` + `track-team-state.sh` hooks + SKILL.md Lead Identity section.

### Hook scripts must fail-closed, not fail-open

Security-critical hooks should **block when uncertain** (fail-closed) rather than **allow when uncertain** (fail-open). Three failure modes surfaced during review of `enforce-lead-delegation.sh`:

| Failure mode | Fail-open (bad) | Fail-closed (good) |
|---|---|---|
| Missing `jq` | `FILE_PATH` empty → edit allowed | `exit 2` with "jq not found" error |
| Detached HEAD | `BRANCH` empty → hook exits 0 | Check for any sentinel → `exit 2` with "checkout a branch" message |
| Ambiguous state | Pick arbitrary branch's sentinel | Block and require explicit branch checkout |

**Rule of thumb**: When a hook can't determine context (missing tool, empty variable, ambiguous state), block and explain — don't guess and proceed. Over-blocking is annoying but recoverable; under-blocking is a security bypass.

> Source: [PR #41](https://github.com/rube-de/cc-skills/pull/41) — Copilot and CodeRabbit reviews caught fail-open jq dependency, detached HEAD bypass, and arbitrary branch glob selection across rounds 7-10.

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

---

## GitHub Issue Integration in Agent Teams

### Bridging hooks and prompts with state files

Hooks receive only the tool_input JSON (e.g., `team_name`), not the user's original `$ARGUMENTS`. When a workflow needs data from arguments at hook time, the prompt-level workflow must write a state file **before** the hook fires.

**Pattern**: Prompt writes `.claude/<branch-slug>/.cdt-issue` → TeamCreate hook reads it → triggers `sync-github-issue.sh`

All CDT state is branch-scoped under `.claude/<branch-slug>/` (where `<branch-slug>` = branch name with `/` → `-`). This prevents cross-branch contamination — running `/cdt:plan-task` on a new branch won't find stale state from a previous issue's branch.

**Key decisions**:
- Branch-scoped directory (`.claude/<branch-slug>/`) holds all 3 state files: `.cdt-issue`, `.cdt-team-active`, `.cdt-scripts-path`
- `.cdt-team-active` is cleaned on TeamDelete; `.cdt-issue` and `.cdt-scripts-path` persist for Wrap Up
- `/full-task` and `/auto-task` Wrap Up cleans up the entire branch directory: `rm -rf ".claude/<branch-slug>"`
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

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
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

> Sources for pitfalls table: [AGENTS.md](../AGENTS.md) (conventions section), [Plugin Authoring guide](PLUGIN-AUTHORING.md), [Claude Code Skills docs](https://code.claude.com/docs/en/skills), [PR #40](https://github.com/rube-de/cc-skills/pull/40), [PR #41](https://github.com/rube-de/cc-skills/pull/41), [PR #43](https://github.com/rube-de/cc-skills/pull/43)

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
