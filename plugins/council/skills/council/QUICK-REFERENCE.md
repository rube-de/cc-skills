# Council Quick Reference

## Invocation (Explicit Only)

| Command | Action | API Calls |
|---------|--------|-----------|
| `/council` | General council invocation | 5 parallel |
| `/council review` | Code review (broad + auto-escalation) | 5 + scoring + escalation |
| `/council review security` | Focused security review | 5 + scoring |
| `/council review architecture` | Focused architecture review | 5 + scoring |
| `/council review bugs` | Focused bug detection | 5 + scoring |
| `/council review quality` | Focused quality/CLAUDE.md review | 5 + scoring |
| `/council plan` | Plan validation mode | 5 parallel |
| `/council consensus [topic]` | Multi-round consensus | 4-12 (multi-round) |
| `/council adversarial` | Adversarial review | 5 parallel |
| `/council quick` | Hierarchical (1→3) | 1-3 (escalates) |

**Note**: Does NOT auto-trigger. Requires explicit invocation.

### Review Mode Behavior

```
/council review              → Auto-detect concerns, broad pass + escalation, both layers
/council review security     → All 5 external focus on security + both Claude subagents
/council review bugs quality → Run bugs round, then quality round, merge results
/council review --blind      → Claude subagents via CLI (no tool access), equal footing
```

### Review Architecture (Dual-Layer)

```
Layer 1: External Consultants                    Layer 2: Claude Subagents
(model diversity, same prompt)                   (concern depth, tool access)
┌────────┬────────┬────────┬────────┬────────┐   ┌──────────────┬──────────────┐
│ Gemini │ Codex  │ Qwen   │ GLM    │ Kimi   │   │ Deep Review  │  Codebase    │
│  CLI   │  CLI   │  CLI   │  CLI   │  CLI   │   │ (opus)       │  Context     │
└────────┴────────┴────────┴────────┴────────┘   │ Security +   │  (sonnet)    │
         ↓ consensus                              │ Bugs + Perf  │  Quality +   │
                                                  │              │  Compliance +│
         ALL run in parallel                      │              │  History +   │
                    ↓                             │              │  Docs        │
              ┌───────────┐                       └──────────────┴──────────────┘
              │  Scorer   │ ← merges + scores all findings   ↓ depth
              │ (sonnet)  │
              └───────────┘
```

## Pre-Flight Check

```bash
# Run before ANY council invocation
for cli in gemini codex qwen opencode; do
  command -v $cli >/dev/null 2>&1 && echo "✓ $cli" || echo "✗ $cli"
done
```

## Expertise Weights

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       CONSULTANT EXPERTISE MATRIX                            │
├─────────────┬─────────┬─────────┬─────────┬─────────┬────────────────────────┤
│ Task        │ Gemini  │ Codex   │ Qwen    │ GLM-4.7 │ Kimi K2.5              │
├─────────────┼─────────┼─────────┼─────────┼─────────┼────────────────────────┤
│ Security    │ 0.90    │ 0.80    │ 0.70    │ 0.75    │ 0.70                   │
│ PR Review   │ 0.85    │ 0.90    │ 0.80    │ 0.75    │ 0.80                   │
│ Architecture│ 0.85    │ 0.70    │ 0.65    │ 0.80    │ 0.75                   │
│ Code Quality│ 0.70    │ 0.80    │ 0.90    │ 0.70    │ 0.80                   │
│ Performance │ 0.75    │ 0.85    │ 0.85    │ 0.70    │ 0.80                   │
│ Brainstorm  │ 0.65    │ 0.60    │ 0.90    │ 0.85    │ 0.80                   │
│ Algorithms  │ 0.70    │ 0.75    │ 0.85    │ 0.85    │ 0.80                   │
│ Debugging   │ 0.75    │ 0.90    │ 0.80    │ 0.75    │ 0.80                   │
└─────────────┴─────────┴─────────┴─────────┴─────────┴────────────────────────┘
```

## Workflow Selection

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Which Workflow?                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Code review?  ──────────────► /council review                      │
│        │                        + concern modes (security, bugs...)  │
│        │                        + auto-escalation + scoring          │
│        │                                                             │
│  Quick validation?  ─────────► Hierarchical (Gemini Flash → Claude) │
│        │                              Calls: 1-3 (escalates)        │
│        │                                                             │
│  Rate limits?  ──────────────► Hierarchical or staggered            │
│        │                              Calls: 1-3 (sequential)       │
│        │                                                             │
│  Need trade-offs? ───────────► Adversarial                          │
│        │                              Calls: 4 (parallel)           │
│        │                                                             │
│  Need confidence? ───────────► Multi-round Consensus                │
│        │                              Calls: 4-12 (rounds)          │
│        │                                                             │
│  Default ────────────────────► Parallel (all 5)                     │
│                                       Calls: 5 (parallel)           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Review Workflow Flow

```
/council review [concern?]
        │
        ▼
┌─────────────────┐     ┌──────────────────┐
│ Concern given?  │──Y──► Focus all 5 on   │
│ (security, etc) │     │ that concern      │
└────────┬────────┘     └────────┬─────────┘
         │ N                     │
         ▼                       │
┌─────────────────┐              │
│ Auto-detect     │              │
│ from diff       │              │
└────────┬────────┘              │
         ▼                       │
┌─────────────────┐              │
│ User confirms   │              │
│ concern(s)      │              │
└────────┬────────┘              │
         │                       │
    ┌────┴────┐                  │
    │         │                  │
  General   Specific             │
    │         │                  │
    ▼         ▼                  │
┌────────┐ ┌──────────┐         │
│ Broad  │ │ Run each │         │
│ pass   │ │ concern  │         │
│ all 5  │ │ mode     │         │
└───┬────┘ └────┬─────┘         │
    │           │               │
    ▼           │               │
┌────────┐      │               │
│ Auto-  │      │               │
│escalate│      │               │
│if high │      │               │
└───┬────┘      │               │
    │           │               │
    └─────┬─────┘───────────────┘
          ▼
  ┌───────────────┐
  │ Sonnet scorer │
  │ 0-100 each    │
  │ filter >= 80  │
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │ Weighted      │
  │ synthesis     │
  │ + report      │
  └───────────────┘
```

## Partial Success Modes

| Available | Action |
|-----------|--------|
| 5/5 | Full synthesis |
| 4/5 | Proceed + note |
| 3/5 | Proceed + warning |
| 2/5 | Proceed + strong warning |
| 1/5 | Abort → single consultant |
| 0/5 | Abort with error |

## Structured Response Schema

```json
{
  "consultant": "gemini|codex|qwen|glm|kimi|claude-deep-review|claude-codebase-context",
  "success": true,
  "confidence": 0.85,
  "severity": "high",
  "findings": [
    {
      "type": "security",
      "severity": "high",
      "description": "SQL injection risk",
      "location": "src/api.ts:42",
      "recommendation": "Use parameterized queries"
    }
  ],
  "summary": "Found 2 high-severity security issues"
}
```

**`location`**: MANDATORY for `/council review` findings. Format: `file:line`. Optional for plan/adversarial/consensus.

## Confidence Scoring (Review Workflows)

After consultants return findings, a Sonnet scoring agent evaluates each one:

```
Score  Meaning
─────  ───────────────────────────────────────────────────────
  0    False positive. Doesn't hold up to scrutiny.
 25    Might be real, but unverified. Could be false positive.
 50    Real but minor. Unlikely to occur in practice.
 75    Verified real. Will impact functionality. Important.
100    Confirmed. Frequent in practice. Evidence conclusive.
─────  ───────────────────────────────────────────────────────
```

**Threshold**: Only findings scoring >= 80 appear in the final report (configurable).

**Consensus informs score**: 5/5 flagged → higher baseline. 1/5 flagged → more scrutiny. But consensus does NOT override scorer judgment.

## Synthesis Formula

```
Weighted Score = Σ(Opinion × Expertise × Confidence) / Σ(Expertise × Confidence)
```

Example:
```
Security finding:
  Gemini (exp=0.9, conf=0.85): CRITICAL → 0.9 × 0.85 = 0.765
  Codex  (exp=0.8, conf=0.90): HIGH     → 0.8 × 0.90 = 0.720
  Qwen   (exp=0.7, conf=0.70): MEDIUM   → 0.7 × 0.70 = 0.490
  GLM    (exp=0.75, conf=0.80): HIGH    → 0.75 × 0.80 = 0.600
  Kimi   (exp=0.7, conf=0.75): HIGH    → 0.7 × 0.75 = 0.525

Weighted → CRITICAL (Gemini's expertise dominates)
```

## Output Template (General)

```markdown
## Council Review Summary

### Pre-Flight Status
- Gemini: ✓ | Codex: ✓ | Qwen: ✓ | GLM: ✗ (timeout) | Kimi: ✓

### 🚨 Critical (Any consultant)
- [Block-level issues]

### ✅ Consensus (All agree)
- [High-confidence findings]

### ⚠️ Majority (Weighted > 0.7)
- [Strong agreement findings]

### 🔀 Divergent
| Issue | Gemini | Codex | Qwen | GLM | Kimi | Weighted |
|-------|--------|-------|------|-----|------|----------|

### Confidence: High/Medium/Low
### Rate Limits: None / Retried: 1 / Skipped: GLM
```

## Output Template (Review Workflows)

```markdown
## Council Code Review

### Pre-Flight Status
- Gemini: ✓ | Codex: ✓ | Qwen: ✓ | GLM: ✓ | Kimi: ✓
### Concern Mode: security (user-selected)
### Escalation: None

### 🚨 Block Merge (Critical, score >= 80)
- SQL injection in user input handler at `src/api.ts:42` (score: 94, flagged by: Gemini, Codex, Qwen)

### ⚠️ Should Fix (High, score >= 80, 2+ agree)
- Missing auth check on admin endpoint at `src/routes/admin.ts:18` (score: 87, flagged by: Gemini, GLM)

### 💡 Consider (Medium, score >= 80)
- Broad exception catch at `src/services/user.ts:92` (score: 82, flagged by: Qwen)

### ✅ Approved Aspects
- Token validation logic is sound
- Rate limiting correctly implemented

### Filtered Out (score < 80): 2 findings
### Rate Limits: None encountered
```

## CLI Commands

```bash
# Gemini
gemini -p "prompt" -f files
gemini -m flash -p "quick check"  # Fast mode
gemini -m pro -p "deep analysis"  # Thorough mode

# Codex
cat file | codex "prompt"
git diff | codex "review changes"
codex --quiet "prompt"  # Less verbose

# Qwen
qwen "@file prompt"
qwen "@src/*.ts analyze these"
qwen -s "@file test this"  # Sandbox mode

# GLM
opencode -m glm-4.7 "prompt"
opencode -m glm-4.7 -f file "prompt"

# Kimi
opencode run -m opencode/kimi-k2.5-free "prompt"
cat file | opencode run -m opencode/kimi-k2.5-free "prompt"
```

## Pre-Launch Checklist

Before sending to external AIs:

- [ ] Pre-flight CLI check passed
- [ ] No secrets in content (gitleaks scan)
- [ ] Content wrapped in XML delimiters
- [ ] Timeout set (120s default)
- [ ] Rate limit strategy selected (parallel vs staggered)
- [ ] False positive taxonomy included in prompt (review workflows)
- [ ] Git history context gathered (review workflows)
- [ ] Concern mode determined (review workflows)

## Anti-Pattern Quick Check

| ❌ Don't | ✅ Do |
|----------|-------|
| Serial consultation | Parallel within rounds |
| "Don't you think X?" | "Compare X vs Y" |
| Ignore disagreement | Examine trade-offs |
| Dump 4 reports | Synthesize insights |
| Full council for trivial | Match workflow to need |
| Trust consensus blindly | Consider shared blind spots |
| Endless rounds | Max 3 rounds, then human |
| Hammer rate-limited CLI | Backoff, stagger, or skip |
