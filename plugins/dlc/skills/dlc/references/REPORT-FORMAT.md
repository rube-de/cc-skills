# DLC Findings Report Format

Internal data structure used by all DLC check skills. Findings are collected in this format before being rendered into a GitHub issue via the issue template.

## Finding Object

Each finding is a structured record with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `severity` | enum | yes | `critical`, `high`, `medium`, `low`, `info` |
| `type` | string | yes | Category: `vulnerability`, `dependency`, `lint`, `complexity`, `duplication`, `dead-code`, `performance`, `coverage`, `test-failure`, `pr-comment`, `redundancy` |
| `file` | string | yes | Relative file path from repo root (e.g. `src/auth/login.ts`) |
| `line` | number | no | Line number where the issue occurs |
| `message` | string | yes | Human-readable description of the finding |
| `tool` | string | yes | Tool or method that detected it (e.g. `npm audit`, `eslint`, `Claude analysis`) |
| `recommendation` | string | yes | Actionable fix suggestion |
| `cwe` | string | no | CWE ID for security findings (e.g. `CWE-79`) |
| `cvss` | number | no | CVSS score for security findings (0.0-10.0) |

## Severity Classification

| Severity | Criteria |
|----------|----------|
| Critical | Exploitable vulnerability, data loss, complete failure, blocking regression |
| High | Security risk with mitigations, significant functionality broken, major performance degradation |
| Medium | Code quality issue affecting maintainability, moderate perf concern, partial coverage gap |
| Low | Style issue, minor optimization opportunity, non-critical suggestion |
| Info | Informational note, best practice suggestion, positive observation |

## Aggregation Rules

1. **Deduplicate**: If the same issue is flagged by multiple tools, keep the one with the most detail and note the other tool(s) as corroboration.
2. **Escalate**: If a tool reports a finding as `medium` but Claude analysis determines it's exploitable, escalate to `high` or `critical` with justification.
3. **Group**: Findings in the same file should be listed together in the detail section.
4. **Count**: The summary table counts each unique finding once, regardless of how many tools flagged it.

## Example Finding

```
severity: high
type: vulnerability
file: src/api/auth.ts
line: 42
message: SQL injection via unsanitized user input in login query
tool: Semgrep
recommendation: Use parameterized queries instead of string concatenation
cwe: CWE-89
```
