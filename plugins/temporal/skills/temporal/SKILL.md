---
name: temporal
description: >-
  Help developers use Temporal for durable execution workflows. Covers CLI commands,
  SDK patterns (Go, TypeScript, Python, Java), workflow orchestration, and architectural
  decisions.
allowed-tools: [Read, Grep, Glob, Bash, WebSearch, WebFetch, Write, Edit]
user-invocable: true
metadata:
  author: rube-de
  version: "1.0.0"
---

# Temporal Durable Execution

Comprehensive assistance for the Temporal durable execution platform: CLI operations, SDK development across Go/TypeScript/Python/Java, workflow design, and architectural decisions.

## Triggers

Use this skill when the user mentions: "temporal", "durable execution", "workflow orchestration", "temporal cli", "temporal sdk", "temporal worker", "temporal activity", "temporal workflow", "temporal schedule", "temporal signal", "temporal query".

## Quick Start

### Local Development Server

```bash
# Install CLI
brew install temporal    # macOS
curl -sSf https://temporal.download/cli | sh  # Linux

# Start local dev server (with Web UI at localhost:8233)
temporal server start-dev

# Start with persistent storage
temporal server start-dev --db-filename temporal.db
```

### First Workflow (TypeScript example)

```bash
npm init -y
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
```

## Common Tasks by Intent

| Developer wants to... | Action |
|-----------------------|--------|
| Start a workflow | `temporal workflow start --type MyWorkflow --task-queue my-queue --input '{"key":"val"}'` |
| Check workflow status | `temporal workflow describe -w <workflow-id>` |
| View event history | `temporal workflow show -w <workflow-id>` |
| Cancel a workflow | `temporal workflow cancel -w <workflow-id>` |
| Send a signal | `temporal workflow signal -w <workflow-id> --name signal-name --input '{"data":true}'` |
| Query workflow state | `temporal workflow query -w <workflow-id> --name query-name` |
| List running workflows | `temporal workflow list` |
| Debug stuck workflow | Check history with `temporal workflow show`, look for pending activities |
| Set up scheduled runs | `temporal schedule create --schedule-id my-sched --cron '0 * * * *' ...` |
| Test workflows | Use SDK test utilities with time-skipping and activity mocking |

## Destructive Commands

These commands stop, rewrite, or purge workflow state on a Temporal cluster. The effects can't be undone from the CLI.

| Command | Effect |
|---------|--------|
| `temporal workflow terminate` | Stops the workflow immediately, with no cleanup logic |
| `temporal workflow cancel` | Requests cancellation; the workflow runs its cancellation path |
| `temporal workflow reset` | Terminates the current run and starts a new one from the reset point; activities after that point run again (duplicate side effects) |
| `temporal workflow delete` | Deletes the execution and its event history, terminating it first if it's running |
| `temporal workflow signal` / `temporal workflow update` | Changes live business state (e.g. an approval signal) on non-local clusters |
| `temporal activity complete` / `temporal activity fail` | Records an activity result from outside the worker; permanent in history |
| `temporal schedule delete` / `update` / `toggle` / `trigger` | Removes or rewrites a schedule, pauses it, or starts a real run |
| `temporal operator namespace update --retention` | Shortening retention purges closed-workflow history |
| `temporal operator namespace delete` | Deletes the namespace and every workflow in it |
| `temporal operator search-attribute remove` | Removes a custom search attribute that queries and visibility depend on |
| `terminate` / `cancel` / `reset` / `signal` / `delete` with `--query` | Batch operation: applies to every matching workflow (`workflow list` / `count --query` are read-only and exempt) |

Before running any of them:

1. State the exact target and scope: `--address` or `--env` profile, namespace, and workflow ID plus run ID, schedule ID, or the full `--query` with the number of matching workflows (`temporal workflow count --query ...`).
2. Get explicit confirmation from the user for that exact command.
3. Single-workflow and schedule commands run without any CLI prompt: your confirmation is the only gate. Batch (`--query`) operations, `operator namespace delete`, and `operator search-attribute remove` prompt; `--yes` / `-y` skips that prompt (workflow commands accept it only together with `--query`). Add it only after the user has confirmed the exact command; never add it on the user's behalf.

## When to Use Temporal

**Good fit:**
- Multi-step processes that must complete reliably (order processing, onboarding)
- Saga patterns across microservices (distributed transactions)
- Long-running workflows (days, weeks, months)
- Scheduled/cron jobs with complex logic
- Human-in-the-loop approval workflows

**Not a good fit:**
- Simple request/response APIs (use plain HTTP)
- Sub-millisecond latency requirements (Temporal adds overhead)
- Trivial fire-and-forget background jobs (use a simple queue)
- Pure data streaming (use Kafka/Flink)

## Reference Documents

For deep dives, consult these references:

| Reference | Content |
|-----------|---------|
| [CLI.md](references/CLI.md) | Complete CLI command reference: installation, server, workflows, schedules, operators |
| [SDK-PATTERNS.md](references/SDK-PATTERNS.md) | Cross-language SDK patterns: Go, TypeScript, Python, Java side-by-side |
| [CONCEPTS.md](references/CONCEPTS.md) | Architecture, core concepts, design patterns, deployment, comparisons |

## Troubleshooting

### Determinism Violations

Workflows must be deterministic. Common violations:
- Using `Date.now()`, `Math.random()`, or system time directly — use `workflow.now()` or side effects
- Making network calls from workflow code — move to activities
- Using non-deterministic data structures (e.g., iterating over unordered maps)
- Changing workflow logic without proper versioning

### Stuck Workflows

1. Check event history: `temporal workflow show -w <id>`
2. Look for `ActivityTaskScheduled` without corresponding `ActivityTaskCompleted`
3. Verify workers are running and polling the correct task queue
4. Check activity timeouts — may need `HeartbeatTimeout` for long activities
5. Check for deadlocked signals/queries

### Timeout Issues

Temporal has four timeout types:
- **WorkflowExecutionTimeout**: Max time for entire workflow (including retries)
- **WorkflowRunTimeout**: Max time for a single workflow run
- **ScheduleToCloseTimeout**: Max time from activity scheduled to completed
- **StartToCloseTimeout**: Max time from activity started to completed

If activities time out unexpectedly, ensure `StartToCloseTimeout` is generous enough and add heartbeating for long-running activities.

### Worker Not Picking Up Tasks

- Verify task queue name matches between workflow starter and worker
- Check that the worker is registered with the correct workflow/activity types
- Ensure the Temporal server address is correct (`TEMPORAL_ADDRESS`)
- Look at worker logs for connection errors

## Workflow

When helping with Temporal:

1. **Identify the task**: CLI operation, SDK code, architecture decision, or debugging
2. **Check the language**: For SDK questions, determine Go/TypeScript/Python/Java
3. **Consult references**: Use the reference docs for detailed patterns and commands
4. **Verify determinism**: For workflow code, ensure deterministic execution rules are followed
5. **Test guidance**: Recommend SDK test utilities, replay testing, and local dev server
