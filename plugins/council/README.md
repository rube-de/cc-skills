# council

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-2-blue.svg)]()
[![Agents](https://img.shields.io/badge/Agents-8-green.svg)]()
[![Hooks](https://img.shields.io/badge/Hooks-1-orange.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()
[![Install](https://img.shields.io/badge/Install-Plugin%20%7C%20Skill-informational.svg)]()

Orchestrate multiple AI consultants (Gemini, Codex, Qwen, GLM-4.7, Kimi K2.5) and specialized Claude subagents for consensus-driven code reviews, plan validation, and architectural decisions.

> [!NOTE]
> **Dual-Layer Architecture**: External consultants provide model diversity across 5 different AI providers, while internal Claude subagents provide deep, tool-assisted analysis — one for security/bugs/performance, one for quality/compliance/history/docs.

## Features

### Dual-Layer Review System

**Layer 1 — External Consultants** (model diversity, same prompt):
| Consultant | CLI | Strength |
|------------|-----|----------|
| Gemini | `gemini` | Architecture, security, fast analysis |
| Codex | `codex` | PR review, bug detection, security |
| Qwen | `qwen` | Code quality, brainstorming, explanations |
| GLM-4.7 | `opencode -m glm-4.7` | Alternative perspectives, algorithms |
| Kimi K2.5 | `opencode run -m opencode/kimi-k2.5-free` | Long-context reasoning, creative solutions |

**Layer 2 — Claude Subagents** (concern depth, tool access):
| Subagent | Model | Focus |
|----------|-------|-------|
| claude-deep-review | Opus | Security, bugs, performance — traces input paths, follows call chains |
| claude-codebase-context | Sonnet | Quality, compliance, history, documentation — compares against project conventions |

**Layer 3 — Scoring** (noise reduction):
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

## Skills

| Skill | Purpose | User-Invocable |
|-------|---------|----------------|
| **council** | Main orchestration — all review modes | Yes |
| **council-reference** | Expertise matrix and response format data | No (background) |

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
| `/council quick` | Hierarchical escalation — Gemini Flash → Claude subagent → full council |

## Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `preflight.sh` | SessionStart | Check CLI availability for all 4 external tools |
| `validate-json-output.sh` | PostToolUse (Bash) | Validate consultant output matches expected JSON schema |

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    /council review                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Pre-flight — verify CLI availability                 │
│                                                          │
│  2. Layer 1: External Consultants (parallel, 120s)       │
│     ├── gemini -p "review ..." -f changed_files          │
│     ├── codex "review ..."                               │
│     ├── qwen "review ..."                                │
│     ├── opencode -m glm-4.7 "review ..."                 │
│     └── opencode run -m kimi-k2.5-free "review ..."      │
│                                                          │
│  3. Layer 2: Claude Subagents (parallel)                 │
│     ├── claude-deep-review (security, bugs, performance) │
│     └── claude-codebase-context (quality, compliance,    │
│         history, documentation)                          │
│                                                          │
│  4. Auto-Escalation — if high-severity found             │
│                                                          │
│  5. Layer 3: Scoring (Sonnet)                            │
│     ├── Deduplicate across all agents                    │
│     ├── Read actual code at referenced locations         │
│     ├── Score each finding 0-100                         │
│     └── Filter to findings >= 80                         │
│                                                          │
│  6. Synthesize — weighted consensus report               │
│                                                          │
└──────────────────────────────────────────────────────────┘
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

### Prerequisites

At least one external CLI must be installed:

```bash
# Check availability
command -v gemini && command -v codex && command -v qwen && command -v opencode

# Install as needed
# gemini  — https://github.com/google-gemini/gemini-cli
# codex   — https://github.com/openai/codex
# qwen    — https://github.com/QwenLM/qwen-cli
# opencode — https://github.com/opencode-ai/opencode (GLM-4.7 + Kimi)
```

The plugin operates in partial-success mode — it proceeds with whichever consultants are available.

## Dependencies

| Component | Required | Purpose |
|-----------|----------|---------|
| Claude Code | Yes | Plugin host |
| gemini CLI | Recommended | Gemini consultant |
| codex CLI | Recommended | Codex consultant |
| qwen CLI | Recommended | Qwen consultant |
| opencode CLI | Recommended | GLM-4.7 + Kimi consultants |

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "No consultants available" | No external CLIs installed | Install at least one: gemini, codex, qwen, or opencode |
| Consultant returns empty output | Rate limiting or timeout | Automatic retry with exponential backoff; check API quotas |
| Low confidence scores | Vague review scope | Use concern-specific mode: `/council review security` |
| Too many false positives | Broad review on large diff | Use `/council quick` for hierarchical escalation |
| JSON validation warnings | Consultant output malformed | PostToolUse hook retries; check CLI version |
| Pre-flight warning on start | CLI not in PATH | Verify installation: `which gemini codex qwen opencode` |

## References

- [SKILL.md](skills/council/SKILL.md) — Full skill definition
- [QUICK-REFERENCE.md](skills/council/QUICK-REFERENCE.md) — Cheat sheet
- [WORKFLOWS.md](skills/council/WORKFLOWS.md) — Detailed workflow patterns

## License

MIT
