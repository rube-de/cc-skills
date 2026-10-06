# Temporal CLI Reference

## Contents

- Installation
- Local Development Server
- Environment Configuration
- Workflow Operations
  - Start a Workflow
  - List Workflows
  - Describe Workflow
  - Show Event History
  - Cancel Workflow
  - Terminate Workflow
  - Signal Workflow
  - Query Workflow
  - Update Workflow
  - Reset Workflow
- Activity Operations
- Schedules
- Task Queue Operations
- Batch Operations
- Operator Commands

Complete reference for the `temporal` CLI tool.

## Installation

```bash
# macOS
brew install temporal

# Linux
curl -sSf https://temporal.download/cli | sh

# Docker (for server only)
docker run --rm -p 7233:7233 -p 8233:8233 temporalio/auto-setup:latest

# Verify
temporal --version
```

## Local Development Server

```bash
# Start with defaults (gRPC :7233, Web UI :8233, in-memory)
temporal server start-dev

# Persist data across restarts
temporal server start-dev --db-filename temporal.db

# Custom ports
temporal server start-dev --port 7233 --http-port 8233

# With specific namespace
temporal server start-dev --namespace my-namespace

# Enable search attributes (for advanced queries)
temporal server start-dev --dynamic-config-value system.forceSearchAttributesCacheRefreshOnRead=true
```

**Web UI**: Open `http://localhost:8233` for workflow visibility, history inspection, and namespace management.

## Environment Configuration

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `TEMPORAL_ADDRESS` | Server gRPC endpoint | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Default namespace | `default` |
| `TEMPORAL_TLS_CERT` | Path to TLS cert file | `/path/to/cert.pem` |
| `TEMPORAL_TLS_KEY` | Path to TLS key file | `/path/to/key.pem` |
| `TEMPORAL_API_KEY` | API key (Temporal Cloud) | `my-api-key` |
| `TEMPORAL_TLS_CA` | CA certificate path | `/path/to/ca.pem` |

### Env Profiles

```bash
# Create named environment
temporal env set prod --address prod.temporal.example.com:7233 --namespace prod

# Use environment
temporal --env prod workflow list

# List environments
temporal env list

# Delete environment
temporal env delete prod
```

## Workflow Operations

### Start a Workflow

```bash
# Basic start
temporal workflow start \
  --type MyWorkflow \
  --task-queue my-queue \
  --workflow-id my-unique-id \
  --input '{"key": "value"}'

# With execution timeout
temporal workflow start \
  --type MyWorkflow \
  --task-queue my-queue \
  --execution-timeout 3600s

# With search attributes
temporal workflow start \
  --type MyWorkflow \
  --task-queue my-queue \
  --search-attribute 'CustomerId=Int:42'

# Start and wait for result
temporal workflow execute \
  --type MyWorkflow \
  --task-queue my-queue \
  --input '{"key": "value"}'
```

### List Workflows

```bash
# List all (default: open workflows)
temporal workflow list

# List with query filter
temporal workflow list --query "WorkflowType = 'MyWorkflow' AND ExecutionStatus = 'Running'"

# List completed workflows
temporal workflow list --query "ExecutionStatus = 'Completed'"

# List with time range
temporal workflow list --query "StartTime > '2024-01-01T00:00:00Z'"
```

### Describe Workflow

```bash
# Current state and pending activities
temporal workflow describe -w <workflow-id>

# Specific run
temporal workflow describe -w <workflow-id> -r <run-id>
```

### Show Event History

```bash
# Full history
temporal workflow show -w <workflow-id>

# Detailed JSON output
temporal workflow show -w <workflow-id> --output json

# Follow (stream events as they occur)
temporal workflow show -w <workflow-id> --follow
```

### Cancel Workflow

```bash
# Request graceful cancellation
temporal workflow cancel -w <workflow-id>
```

Cancellation is cooperative. The workflow receives a cancellation request and can run cleanup logic before completing.

### Terminate Workflow

```bash
# Force terminate (no cleanup)
temporal workflow terminate -w <workflow-id> --reason "manual cleanup"
```

Termination is immediate. The workflow does not get a chance to run cleanup logic.

### Signal Workflow

```bash
# Send signal
temporal workflow signal -w <workflow-id> --name my-signal --input '{"approved": true}'

# Signal with start (starts workflow if not running)
temporal workflow start \
  --type MyWorkflow \
  --task-queue my-queue \
  --workflow-id my-id \
  --start-signal my-signal \
  --input '{}' \
  --start-signal-input '{"init": true}'
```

### Query Workflow

```bash
# Query current state
temporal workflow query -w <workflow-id> --name current-status

# Query with input
temporal workflow query -w <workflow-id> --name get-progress --input '{"detail": true}'
```

### Update Workflow

```bash
# Send update (synchronous mutation)
temporal workflow update -w <workflow-id> --name my-update --input '{"key": "value"}'
```

### Reset Workflow

```bash
# Reset to specific event
temporal workflow reset -w <workflow-id> --event-id 10 --reason "fix bad activity"

# Reset to last workflow task completed
temporal workflow reset -w <workflow-id> --type LastWorkflowTask --reason "replay fix"

# Batch reset by query
temporal workflow reset --query "WorkflowType = 'MyWorkflow'" --type LastWorkflowTask --reason "deploy fix"
```

## Activity Operations

### Complete Activity Externally

```bash
# Complete an activity from outside the worker
temporal activity complete \
  --workflow-id <wf-id> \
  --run-id <run-id> \
  --activity-id <activity-id> \
  --result '{"data": "value"}'
```

### Fail Activity Externally

```bash
temporal activity fail \
  --workflow-id <wf-id> \
  --run-id <run-id> \
  --activity-id <activity-id> \
  --reason "external failure"
```

## Schedules

Temporal Schedules replace cron-based scheduling with a durable, inspectable system.

### Create Schedule

```bash
# Cron-style
temporal schedule create \
  --schedule-id daily-report \
  --cron '0 9 * * *' \
  --workflow-type GenerateReport \
  --task-queue reports \
  --input '{"format": "pdf"}'

# Interval-based
temporal schedule create \
  --schedule-id hourly-sync \
  --interval 1h \
  --workflow-type SyncData \
  --task-queue sync
```

### Manage Schedules

```bash
# List all schedules
temporal schedule list

# Describe schedule
temporal schedule describe --schedule-id daily-report

# Trigger immediate run
temporal schedule trigger --schedule-id daily-report

# Pause schedule
temporal schedule toggle --schedule-id daily-report --pause --reason "maintenance"

# Resume schedule
temporal schedule toggle --schedule-id daily-report --unpause --reason "maintenance done"

# Update schedule
temporal schedule update \
  --schedule-id daily-report \
  --cron '0 10 * * *'

# Delete schedule
temporal schedule delete --schedule-id daily-report
```

## Task Queue Operations

```bash
# Describe task queue (shows pollers and backlog)
temporal task-queue describe --task-queue my-queue

# Get reachability info
temporal task-queue get-build-id-reachability --task-queue my-queue

# List build ID versions
temporal task-queue get-build-ids --task-queue my-queue
```

## Batch Operations

```bash
# Batch cancel workflows
temporal workflow cancel --query "WorkflowType = 'OldWorkflow' AND ExecutionStatus = 'Running'"

# Batch terminate workflows
temporal workflow terminate --query "WorkflowType = 'BadWorkflow'" --reason "cleanup"

# Batch signal workflows
temporal workflow signal --query "WorkflowType = 'MyWorkflow'" --name pause
```

## Operator Commands

### Namespace Management

```bash
# Create namespace
temporal operator namespace create my-namespace

# Describe namespace
temporal operator namespace describe my-namespace

# List namespaces
temporal operator namespace list

# Update namespace retention
temporal operator namespace update my-namespace --retention 30d
```

### Search Attributes

```bash
# List search attributes
temporal operator search-attribute list

# Create custom search attribute
temporal operator search-attribute create --name CustomerId --type Int

# Supported types: Text, Keyword, Int, Double, Bool, Datetime, KeywordList
```

### Cluster Info

```bash
# Get cluster health
temporal operator cluster health

# Describe cluster
temporal operator cluster describe
```
