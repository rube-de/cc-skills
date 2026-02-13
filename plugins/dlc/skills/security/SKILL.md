---
name: security
description: >-
  Security scan: dependency audits, SAST analysis, and secret detection.
  Detects project type, runs available security tools, classifies findings
  by severity, and creates a structured GitHub issue.
allowed-tools: [Bash, Read, Grep, Glob]
---

# DLC: Security Scan

Run security checks against the current project and create a GitHub issue with findings.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Detect Project Type

Scan the repository root for project indicators:

| Indicator | Project Type | Primary Tool |
|-----------|-------------|--------------|
| `package.json` / `package-lock.json` / `bun.lockb` | Node.js | `npm audit` / `bun audit` |
| `requirements.txt` / `pyproject.toml` / `Pipfile` | Python | `pip-audit` |
| `Cargo.toml` | Rust | `cargo audit` |
| `go.mod` | Go | `govulncheck` |
| `pom.xml` / `build.gradle` | Java/Kotlin | `dependency-check` |
| `Gemfile` | Ruby | `bundler-audit` |

If multiple indicators exist, treat as a monorepo and scan each.

## Step 2: Run Security Tools

For each detected project type, run tools in this priority order. Use the first available tool; skip unavailable ones.

### Dependency Audit

Select the tool based on availability (`command -v`), not exit codes — audit tools exit non-zero when vulnerabilities are found, which is a valid result to capture.

```bash
# Node.js — select by availability
if command -v npm >/dev/null 2>&1; then
  npm audit --json 2>/dev/null
elif command -v bun >/dev/null 2>&1; then
  bun audit 2>/dev/null
fi

# Python
command -v pip-audit >/dev/null 2>&1 && pip-audit --format=json 2>/dev/null

# Rust
command -v cargo-audit >/dev/null 2>&1 && cargo audit --json 2>/dev/null

# Go
command -v govulncheck >/dev/null 2>&1 && govulncheck ./... 2>/dev/null
```

### Static Analysis (SAST)

Try in order — use the first available:

1. **Semgrep** (preferred): `semgrep scan --config=auto --json .`
2. **Trivy** (filesystem mode): `trivy fs --format json --scanners vuln,secret .`
3. **Claude static analysis** (fallback): Manually review files matching security-sensitive patterns

### Secret Detection

```bash
# Try gitleaks first
gitleaks detect --source . --no-git --report-format json 2>/dev/null

# Fallback: grep for common patterns (POSIX-compatible)
grep -rnE "AKIA|sk-|ghp_|password[[:space:]]*=|secret[[:space:]]*=" \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.go" \
  --include="*.rs" --include="*.java" --include="*.rb" --include="*.env" .
```

If **no tools are available**, fall back to Claude static analysis:
- Review files matching `**/auth/**`, `**/login/**`, `**/api/**`, `**/*.env*`
- Check for hardcoded credentials, SQL injection, XSS, insecure crypto
- Check dependency manifests for known-vulnerable version ranges

## Step 3: Classify Findings

Map tool output to the findings format from REPORT-FORMAT.md.

**Severity mapping** (reinforced here for defense-in-depth):

| Tool Output | Maps To |
|-------------|---------|
| `critical` / CVSS >= 9.0 | **Critical** |
| `high` / CVSS 7.0-8.9 | **High** |
| `moderate` / `medium` / CVSS 4.0-6.9 | **Medium** |
| `low` / CVSS 0.1-3.9 | **Low** |
| `info` / advisory only | **Info** |

Deduplicate findings that appear in multiple tools. Prefer the source with more detail.

## Step 4: Create GitHub Issue

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] Security: {summary of top finding}`
- Label: `dlc-security`
- Body must contain: Scan Metadata table, Findings Summary table (severity x count), Findings Detail grouped by severity, Recommended Actions, Raw Output in collapsed details

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH=$(git branch --show-current)
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"
# ... write formatted body to $BODY_FILE ...

gh issue create \
  --repo "$REPO" \
  --title "[DLC] Security: {summary}" \
  --body-file "$BODY_FILE" \
  --label "dlc-security"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path with a manual command.

## Step 5: Report

Print a summary to the user:

```
Security scan complete.
  - Project type: {type}
  - Tools used: {list}
  - Findings: {critical} critical, {high} high, {medium} medium, {low} low
  - Issue: #{number} ({url})
```

If no findings, skip issue creation and report: "No security issues found."
