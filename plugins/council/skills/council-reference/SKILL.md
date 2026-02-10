---
name: council-reference
description: Council review reference data — expertise weights, structured response format, scoring thresholds, and false positive taxonomy. Background knowledge for council subagents.
user-invocable: false
disable-model-invocation: true
---

# Council Reference Data

## Structured Response Format

Every council agent MUST return this JSON structure:

```json
{
  "consultant": "gemini|codex|qwen|glm|kimi|claude-deep-review|claude-codebase-context",
  "success": true,
  "fallback": false,
  "confidence": 0.0-1.0,
  "severity": "critical|high|medium|low|none",
  "findings": [
    {
      "type": "security|performance|quality|architecture|bug|documentation",
      "severity": "critical|high|medium|low",
      "description": "...",
      "location": "file:line",
      "recommendation": "..."
    }
  ],
  "summary": "One-paragraph summary"
}
```

**`location`**: MANDATORY for `/council review` findings. Format: `file:line` (e.g. `src/api.ts:42`).

## Expertise Weight Matrix

```
Task         Gemini  Codex   Qwen    GLM-4.7  Kimi K2.5
Security     0.90    0.80    0.70    0.75     0.70
PR Review    0.85    0.90    0.80    0.75     0.80
Architecture 0.85    0.70    0.65    0.80     0.75
Code Quality 0.70    0.80    0.90    0.70     0.80
Performance  0.75    0.85    0.85    0.70     0.80
Brainstorm   0.65    0.60    0.90    0.85     0.80
Algorithms   0.70    0.75    0.85    0.85     0.80
Debugging    0.75    0.90    0.80    0.75     0.80
```

## Scoring Thresholds

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

**Filter threshold**: Only findings scoring >= 80 appear in the final report.

## False Positive Taxonomy

Score 0 (auto-reject) if a finding matches any of these:

- Pre-existing issue not introduced in the current changes
- Problem that a linter, typechecker, or compiler would catch
- Pedantic nitpick that a senior engineer would not call out
- General code quality complaint NOT backed by project CLAUDE.md
- Issue on lines that were NOT modified in the changes under review
- Intentional functionality change clearly related to the broader change
- Code with explicit lint-ignore or suppress comments

## Synthesis Formula

```
Weighted Score = Σ(Opinion × Expertise × Confidence) / Σ(Expertise × Confidence)
```
