# Temporal Concepts & Architecture

## Contents

- What Is Temporal
- Architecture
- Core Concepts
  - Workflows
  - Activities
  - Task Queues
  - Namespaces
  - Schedules
  - Nexus
- Deterministic Execution
- Use Cases
  - Microservice Orchestration
  - Saga Pattern (Distributed Transactions)
  - Long-Running Processes
  - Data Pipelines
  - Scheduled Jobs (Cron Replacement)
  - Infrastructure Provisioning
  - Human-in-the-Loop
- When NOT to Use Temporal
- Design Patterns
  - Saga (Compensating Transactions)
  - Entity Workflow
  - Polling
  - Fan-Out / Fan-In
  - Human-in-the-Loop
  - Batch Processing
- Deployment
- Comparison with Alternatives

Core concepts, architecture, design patterns, and decision guidance for the Temporal durable execution platform.

## What Is Temporal

Temporal is a **durable execution platform** that makes application code fault-tolerant by default. Instead of writing retry logic, state machines, and failure handling, you write workflows as ordinary code and Temporal ensures they run to completion — surviving process crashes, network failures, and infrastructure outages.

**Key properties:**
- **Durable**: Workflow state persists through any failure
- **Reliable**: Automatic retries with configurable policies
- **Scalable**: Horizontally scalable workers and service
- **Visible**: Full event history for every workflow execution

## Architecture

```
┌──────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│              │     │      Temporal Service        │     │              │
│   Clients    │────▶│                              │◀────│   Workers    │
│              │     │  ┌─────────┐  ┌──────────┐  │     │              │
│ - Start WF   │     │  │ Frontend│  │ History  │  │     │ - Run WFs    │
│ - Signal     │     │  │ Service │  │ Service  │  │     │ - Run Acts   │
│ - Query      │     │  └─────────┘  └──────────┘  │     │ - Poll TQs   │
│ - Terminate  │     │  ┌─────────┐  ┌──────────┐  │     │              │
│              │     │  │Matching │  │  Worker  │  │     │ Task Queue A │
└──────────────┘     │  │ Service │  │ Service  │  │     │ Task Queue B │
                     │  └─────────┘  └──────────┘  │     └──────────────┘
                     │         │                    │
                     │  ┌──────┴──────┐             │
                     │  │  Database   │             │
                     │  │(Cassandra/  │             │
                     │  │ PostgreSQL/ │             │
                     │  │ MySQL/SQLite│             │
                     │  └─────────────┘             │
                     └─────────────────────────────┘
```

**Components:**

| Component | Role |
|-----------|------|
| **Temporal Service** | Orchestrates workflows, persists state, dispatches tasks. Stateless (state in DB). |
| **Workers** | Your application processes. Poll task queues and execute workflow/activity code. |
| **Clients** | Start workflows, send signals, query state. Used by APIs, CLIs, other services. |
| **Task Queues** | Named queues that route work to workers. Enable load balancing and isolation. |

## Core Concepts

### Workflows

A Workflow is a **durable function** — it defines the orchestration logic for a unit of work. Workflows are written as regular code but are automatically persisted and can survive any failure.

**Properties:**
- Must be **deterministic** (replay-safe)
- Can run for seconds to years
- Have a unique Workflow ID (business-meaningful)
- Record all events in an **Event History**
- Can have signals, queries, and updates

### Activities

An Activity is a **side-effectful function** — it performs I/O operations (API calls, DB writes, file operations). Activities do not need to be deterministic.

**Properties:**
- Called from workflows
- Automatically retried on failure
- Support heartbeating for long operations
- Have configurable timeouts and retry policies
- Can be completed externally (async completion)

### Task Queues

Task Queues are **named routing channels** between the Temporal Service and Workers. They enable:

- **Load balancing**: Multiple workers poll the same queue
- **Isolation**: Different task queues for different workloads
- **Routing**: Send specific work to specific workers
- **Priority**: Separate queues for different priority levels

### Namespaces

Namespaces provide **multi-tenancy** — logical isolation of workflows, task queues, and configurations. Each namespace has its own:

- Workflow executions
- Task queues
- Search attributes
- Retention period
- Security settings

### Schedules

Schedules are Temporal's built-in **cron replacement**. They create workflow executions on a defined cadence (cron expressions or intervals) with features like:

- Overlap policies (skip, buffer, cancel, terminate)
- Pause/resume
- Manual trigger
- Backfill for missed runs

### Nexus

Nexus enables **cross-namespace and cross-cluster** workflow communication. It provides a standard way to call operations across Temporal boundaries, enabling multi-team and multi-region architectures.

## Deterministic Execution

Workflows are replayed from Event History to recover state. This means workflow code must produce the **same sequence of commands** when replayed.

### Allowed in Workflows

- Calling activities (via SDK APIs)
- Sleeping/waiting (via SDK timer APIs)
- Sending signals to other workflows
- Starting child workflows
- Using SDK-provided deterministic utilities (`uuid4()`, `workflow.now()`)
- Conditional logic based on activity results
- Using `SideEffect` / `MutableSideEffect` for controlled non-determinism

### NOT Allowed in Workflows

| Violation | Why | Alternative |
|-----------|-----|-------------|
| `Date.now()` / `time.Now()` | Different on replay | `workflow.now()` |
| `Math.random()` / `rand.Int()` | Different on replay | `workflow.uuid4()` or SideEffect |
| Network calls (HTTP, gRPC) | Side effects | Move to Activity |
| File I/O | Side effects | Move to Activity |
| Global mutable state | Shared across replays | Use workflow-local state |
| Non-deterministic iteration | Map iteration order varies (Go) | Sort keys first |
| Threads / goroutines | Concurrency outside SDK | Use `workflow.Go()` (Go) or SDK async |
| `sleep()` / `time.Sleep()` | Not replay-safe | `workflow.Sleep()` |

## Use Cases

### Microservice Orchestration
Coordinate multi-step business processes across services: order processing, user onboarding, payment flows.

### Saga Pattern (Distributed Transactions)
Implement compensating transactions across services without distributed locks. Each step has a corresponding compensation action.

### Long-Running Processes
Workflows that span hours, days, or months: subscription management, loan processing, insurance claims.

### Data Pipelines
Reliable ETL/ELT pipelines with retry, checkpointing, and human-in-the-loop approvals.

### Scheduled Jobs (Cron Replacement)
Replace fragile cron jobs with durable schedules that survive infrastructure failures and provide full visibility.

### Infrastructure Provisioning
Multi-step provisioning workflows: create resources, wait for readiness, configure, verify.

### Human-in-the-Loop
Workflows that pause and wait for human decisions (approvals, reviews) via signals.

## When NOT to Use Temporal

| Scenario | Why Not | Better Alternative |
|----------|---------|-------------------|
| Simple request/response APIs | Unnecessary overhead | Plain HTTP/gRPC |
| Sub-millisecond latency | Temporal adds ~10-50ms | Direct service calls |
| Trivial background jobs | Over-engineered | Simple job queue (Redis, SQS) |
| Pure data streaming | Not designed for streams | Kafka, Flink, Pulsar |
| Static content serving | No workflow needed | CDN, static hosting |
| Simple event pub/sub | Temporal is not a message bus | Kafka, NATS, RabbitMQ |

## Design Patterns

### Saga (Compensating Transactions)

Each step in a multi-service transaction has a compensating action. On failure, compensations run in reverse order to undo completed steps.

```
Step 1 (charge) → Step 2 (reserve) → Step 3 (ship)
                                          ↓ failure
         Undo 2 (release) ← Undo 1 (refund)
```

### Entity Workflow

A long-running workflow that represents a stateful entity (user session, order, device). Receives signals to mutate state and responds to queries for current state.

### Polling

Periodically check an external system until a condition is met. Use Temporal timers instead of busy-waiting.

```
loop:
  result = checkCondition()
  if result.ready: break
  sleep(interval)
```

### Fan-Out / Fan-In

Start multiple child workflows or activities in parallel, then wait for all to complete.

```
Start N child workflows → Wait for all → Aggregate results
```

### Human-in-the-Loop

Workflow pauses at a decision point, sends notification, then waits for a signal from a human (via UI, Slack, email link).

```
Process request → Send notification → Wait for signal → Continue
```

### Batch Processing

Process large datasets in batches using Continue-As-New to avoid unbounded history growth.

```
Process batch → Continue-As-New with next cursor → Process batch → ...
```

## Deployment

### Local Development

```bash
temporal server start-dev
# Web UI: http://localhost:8233
# gRPC: localhost:7233
```

### Self-Hosted

Run the Temporal Service on your infrastructure:
- **Database**: PostgreSQL (recommended), MySQL, Cassandra, SQLite (dev only)
- **Deployment**: Docker Compose, Kubernetes (Helm chart), bare metal
- **Visibility**: Elasticsearch or built-in SQL-based visibility
- **Monitoring**: Prometheus metrics, Grafana dashboards

### Temporal Cloud

Managed Temporal service:
- No infrastructure management
- Built-in mTLS authentication
- Multi-region support
- SLA guarantees
- Connect via `TEMPORAL_ADDRESS` + `TEMPORAL_API_KEY` or mTLS certs

## Comparison with Alternatives

### vs AWS Step Functions

| Aspect | Temporal | Step Functions |
|--------|----------|---------------|
| Workflow definition | Code (any language) | JSON/YAML (ASL) |
| Hosting | Self-hosted or Cloud | AWS-managed |
| History limit | Configurable (Continue-As-New) | 25,000 events |
| Pricing | Infrastructure cost | Per state transition |
| Testing | Standard unit tests | Limited local testing |
| Vendor lock-in | None (open source) | AWS-locked |
| Latency | Lower for complex flows | Higher per-step overhead |

### vs Apache Airflow

| Aspect | Temporal | Airflow |
|--------|----------|---------|
| Primary use | General workflow orchestration | Data pipeline scheduling |
| Workflow model | Code-first, any language | Python DAGs |
| Execution model | Event-sourced, durable | Task-based, scheduled |
| Latency | Sub-second | Minutes (scheduling lag) |
| Dynamic workflows | Native (code is the workflow) | Limited dynamic DAGs |
| Long-running | Hours to years | Designed for batch jobs |

### vs Message Queues (Kafka, RabbitMQ, SQS)

| Aspect | Temporal | Message Queues |
|--------|----------|----------------|
| Abstraction level | Workflow orchestration | Message delivery |
| State management | Built-in (Event History) | External (you build it) |
| Retry semantics | Configurable per activity | Basic (DLQ, redelivery) |
| Visibility | Full execution history | Message logs |
| Complexity | Higher initial setup | Simpler for basic cases |
| Best for | Multi-step processes | Event streaming, decoupling |

### vs Custom State Machines

| Aspect | Temporal | Custom State Machine |
|--------|----------|---------------------|
| Development effort | Write business logic only | Build everything |
| Failure handling | Automatic | Manual implementation |
| Scalability | Built-in | Custom scaling logic |
| Visibility | Dashboard + CLI | Build your own |
| Maintenance | Platform handles infra | Full ownership |
| Risk | Battle-tested platform | Bugs in custom code |
