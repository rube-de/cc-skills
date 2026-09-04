# council

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-3-blue.svg)]()
[![Agents](https://img.shields.io/badge/Agents-7-green.svg)]()
[![Commands](https://img.shields.io/badge/Commands-1-purple.svg)]()
[![Hooks](https://img.shields.io/badge/Hooks-2-orange.svg)](#hooks)

Orchestrate multiple AI consultants (Gemini 3.8 Flash, Codex, GLM-5.3, Kimi K3) and specialized Claude subagents for consensus-driven code reviews, plan validation, and architectural decisions.

> [!NOTE]
> **Dual-Layer Architecture**: External consultants provide model diversity across 4 different AI providers, while internal Claude subagents provide deep, tool-assisted analysis — one for security/bugs/performance, one for quality/compliance/history/docs.

## Features

### Dual-Layer Review System

**Layer 1 — External Consultants** (model diversity, same prompt):
| Consultant | CLI | Strength |
|------------|-----|----------|
| Gemini 3.8 Flash | `omp -p --no-tools --model google-antigravity/gemini-3.8-flash` | Architecture, security, fast analysis |
| Codex | `codex` | PR review, bug detection, security |
| GLM-5.3 | `omp -p --no-tools --model zai/glm-5.3:max` | Alternative perspectives, algorithms |
| Kimi K3 | `omp -p --no-tools --model kimi-code/k3` | Long-context reasoning, creative solutions |

**Layer 2 — Claude Subagents** (concern depth, tool access — backend and models configurable):
| Subagent | Model | Focus |
|----------|-------|-------|
| claude-deep-review | Opus (or Sonnet via config) | Security, bugs, performance — traces input paths, follows call chains |
| claude-codebase-context | Sonnet | Quality, compliance, history, documentation — compares against project conventions |

**Layer 3 — Scoring** (noise reduction — optional / conditional via config):
| Agent | Model | Role |
|-------|-------|------|
| review-scorer | Sonnet | Deduplicate, verify, score 0-100, filter to >= 80 |

### Weighted Synthesis

Not simple voting — findings are weighted by expertise and confidence:

```
Weighted Score = Σ(Opinion × Expertise × Confidence) / Σ(Expertise × Confidence)
```

### False Positive Filtering

Built-in taxonomy auto-rejects:
- Pre-existing issues not in current changes
- Problems linters/typecheckers would catch
- Pedantic nitpicks senior engineers wouldn't flag
- Issues on lines NOT modified in the review

## Skills & Commands

| Name | Type | Purpose | Invocable |
|------|------|---------|-----------|
| **council** | Skill | Main orchestration — all review modes | Yes (`/council`) |
| **council:config** | Command | Configure consultant enablement & active subscriptions | Yes (`/council:config` or `/council config`) |
| **council:review-plan** | Skill | Pre-execution implementation plan review | Yes (`/council:review-plan`) |
| **council-reference** | Skill | Expertise matrix and response format data | No (background) |
## Review Modes

| Command | Description |
|---------|-------------|
| `/council review` | Broad review + auto-escalation + scoring |
| `/council review security` | All consultants focus on security only |
| `/council review architecture` | Architecture concerns only |
| `/council review bugs` | Logic errors and edge cases only |
| `/council review quality` | Readability, complexity, duplication only |
| `/council plan` | Implementation plan validation |
| `/council adversarial` | Advocates vs critics comparison |
| `/council consensus [topic]` | Multi-round consensus building |
| `/council quick` | Parallel triage — configured quick consultant (default: fastest enabled) + Claude subagent in parallel, escalates to full council if needed |

## Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `preflight.sh` | SessionStart | Check configuration and CLI availability for enabled consultants |
| `validate-json-output.sh` | PostToolUse (Bash) | Validate consultant output matches expected JSON schema |

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               /council review                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Pre-flight — verify CLI availability                                    │
│                                                                             │
│  2. Layer 1: External Consultants (parallel, 120s)                          │
│     ├── omp -p --no-tools --model .../gemini-3.8-flash                      │
│     ├── codex exec --sandbox read-only -c approval_policy=never "review ..."│
│     ├── omp -p --no-tools --model zai/glm-5.3:max "..."                     │
│     └── omp -p --no-tools --model kimi-code/k3 "..."                        │
│                                                                             │
│  3. Layer 2: Claude Subagents (parallel)                                    │
│     ├── claude-deep-review (security, bugs, performance)                    │
│     └── claude-codebase-context (quality, compliance,                       │
│         history, documentation)                                             │
│                                                                             │
│  4. Auto-Escalation — if high-severity found                                │
│                                                                             │
│  5. Layer 3: Scoring (Sonnet)                                               │
│     ├── Deduplicate across all agents                                       │
│     ├── Read actual code at referenced locations                            │
│     ├── Score each finding 0-100                                            │
│     └── Filter to findings >= 80                                            │
│                                                                             │
│  6. Synthesize — weighted consensus report                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

This is a **Claude Code plugin** with hooks, agents, and scripts. Full plugin install is recommended. A lighter skills-only install is available but loses hooks and agent definitions.

### Plugin Install (Recommended)

Installs everything: skills, agents, hooks (preflight checks, JSON validation), and scripts.

```bash
# 1. Add the marketplace (once)
claude plugin marketplace add rube-de/cc-skills

# 2. Install the plugin
claude plugin install council@rube-cc-skills

# 3. Restart Claude Code
claude
```

### Skill Install (via [skills.sh](https://skills.sh))

Installs only the skill definitions — no hooks or agent definitions.

```bash
npx skills add rube-de/cc-skills --skill council
```

> [!WARNING]
> **What you lose with skill-only install:**
> - `preflight.sh` — no automatic CLI availability check on session start
> - `validate-json-output.sh` — no PostToolUse JSON validation for consultant output
> - Agent `.md` definitions — subagent types (codex-consultant, gemini-consultant, etc.) won't be registered

### Configuration & Subscriptions

External consultants can be enabled or disabled based on your active subscriptions (`.dev/council/config.json`):

```bash
/council:config                       # Interactive setup & detection wizard
/council:config show                  # Display current configuration & CLI status
/council:config enable <consultant>   # Enable an external consultant (gemini, codex, glm, kimi)
/council:config disable <consultant>  # Disable an external consultant
/council:config quick <consultant>    # Set quick mode consultant (gemini, codex, glm, kimi, auto)
/council:config subagent backend <t>  # Set subagent execution backend (native, omp, claude-cli)
/council:config subagent model <m>    # Set deep review model (opus, sonnet)
/council:config subagent enable <name># Enable subagent (claude-deep-review, claude-codebase-context, review-scorer)
/council:config subagent disable <n>  # Disable subagent
/council:config detect                # Probe installed CLIs & active subscriptions
/council:config init [--auto]         # Initialize configuration (.dev/council/config.json)
```

Pass `--global` to any command to persist settings across all repositories in `~/.config/council/config.json`.

### Prerequisites

`jq` (or `jaq`) is required for configuration parsing and JSON validation hooks. At least one external CLI (or subscription) is recommended:

```bash
# Check capability detection
./plugins/council/scripts/council-config.sh detect
```
The plugin operates in partial-success mode — it proceeds with whichever consultants are enabled and available. If all external consultants are disabled, Council seamlessly runs Layer 2 (Claude Opus and Sonnet subagents) for dual-depth analysis.
## Dependencies

| Component | Required | Purpose |
|-----------|----------|---------|
| Claude Code | Yes | Plugin host |
| jq | Yes | JSON configuration and validation hooks |
| codex CLI | Recommended | Codex consultant |
| omp CLI | Recommended | Gemini, GLM-5.3, and Kimi consultants (3 of 4) |
## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "No consultants available" | No external CLIs installed | Install at least one: codex or omp |
| Consultant returns empty output | Rate limiting or timeout | Automatic retry with exponential backoff; check API quotas |
| Low confidence scores | Vague review scope | Use concern-specific mode: `/council review security` |
| Too many false positives | Broad review on large diff | Use `/council quick` for parallel triage (2-agent lightweight review) |
| JSON validation warnings | Consultant output malformed | PostToolUse hook retries; check CLI version |
| Pre-flight warning on start | CLI not in PATH | Verify installation: `which codex omp` |

## References

- [SKILL.md](skills/council/SKILL.md) — Full skill definition
- [QUICK-REFERENCE.md](skills/council/QUICK-REFERENCE.md) — Cheat sheet
- [WORKFLOWS.md](skills/council/WORKFLOWS.md) — Detailed workflow patterns

## License

MIT
