# Temporal SDK Patterns

## Contents

- Project Setup
- Workflow Definition
- Activity Implementation
  - Go
  - TypeScript
  - Python
  - Java
  - Retry Configuration
  - Activity Timeouts
- Worker Setup
- Client Usage
- Signals, Queries, and Updates
- Error Handling
- Testing
- Advanced Patterns
- Versioning

Cross-language patterns for Go, TypeScript, Python, and Java.

## Project Setup

### Go

```bash
go mod init myapp
go get go.temporal.io/sdk
```

### TypeScript

```bash
npm init -y
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
```

### Python

```bash
pip install temporalio
```

### Java

```xml
<!-- Maven -->
<dependency>
  <groupId>io.temporal</groupId>
  <artifactId>temporal-sdk</artifactId>
  <version>1.25.0</version>
</dependency>
```

```groovy
// Gradle
implementation 'io.temporal:temporal-sdk:1.25.0'
```

---

## Workflow Definition

Workflows must be **deterministic** — they are replayed from event history on recovery.

### Go

```go
package workflows

import (
    "time"
    "go.temporal.io/sdk/workflow"
)

func OrderWorkflow(ctx workflow.Context, order Order) (OrderResult, error) {
    options := workflow.ActivityOptions{
        StartToCloseTimeout: 5 * time.Minute,
    }
    ctx = workflow.WithActivityOptions(ctx, options)

    var result ChargeResult
    err := workflow.ExecuteActivity(ctx, ChargeCustomer, order).Get(ctx, &result)
    if err != nil {
        return OrderResult{}, err
    }

    err = workflow.ExecuteActivity(ctx, ShipOrder, order).Get(ctx, nil)
    if err != nil {
        // Compensate: refund on shipping failure
        _ = workflow.ExecuteActivity(ctx, RefundCustomer, order).Get(ctx, nil)
        return OrderResult{}, err
    }

    return OrderResult{Status: "completed", ChargeID: result.ChargeID}, nil
}
```

### TypeScript

```typescript
import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from './activities';

const { chargeCustomer, shipOrder, refundCustomer } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
});

export async function orderWorkflow(order: Order): Promise<OrderResult> {
  const chargeResult = await chargeCustomer(order);

  try {
    await shipOrder(order);
  } catch (err) {
    await refundCustomer(order);
    throw err;
  }

  return { status: 'completed', chargeId: chargeResult.chargeId };
}
```

### Python

```python
from datetime import timedelta
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities import charge_customer, ship_order, refund_customer

@workflow.defn
class OrderWorkflow:
    @workflow.run
    async def run(self, order: Order) -> OrderResult:
        charge_result = await workflow.execute_activity(
            charge_customer, order, start_to_close_timeout=timedelta(minutes=5)
        )

        try:
            await workflow.execute_activity(
                ship_order, order, start_to_close_timeout=timedelta(minutes=5)
            )
        except Exception:
            await workflow.execute_activity(
                refund_customer, order, start_to_close_timeout=timedelta(minutes=5)
            )
            raise

        return OrderResult(status="completed", charge_id=charge_result.charge_id)
```

### Java

```java
@WorkflowInterface
public interface OrderWorkflow {
    @WorkflowMethod
    OrderResult processOrder(Order order);
}

public class OrderWorkflowImpl implements OrderWorkflow {
    private final OrderActivities activities = Workflow.newActivityStub(
        OrderActivities.class,
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(5))
            .build()
    );

    @Override
    public OrderResult processOrder(Order order) {
        ChargeResult chargeResult = activities.chargeCustomer(order);

        try {
            activities.shipOrder(order);
        } catch (Exception e) {
            activities.refundCustomer(order);
            throw e;
        }

        return new OrderResult("completed", chargeResult.getChargeId());
    }
}
```

---

## Activity Implementation

Activities perform side effects (I/O, API calls, DB access). They do **not** need to be deterministic.

### Go

```go
package activities

import (
    "context"
    "go.temporal.io/sdk/activity"
)

func ChargeCustomer(ctx context.Context, order Order) (ChargeResult, error) {
    logger := activity.GetLogger(ctx)
    logger.Info("Charging customer", "orderId", order.ID)

    // Heartbeat for long-running activities
    activity.RecordHeartbeat(ctx, "processing payment")

    result, err := paymentService.Charge(order)
    if err != nil {
        return ChargeResult{}, err
    }

    return ChargeResult{ChargeID: result.ID}, nil
}
```

### TypeScript

```typescript
import { heartbeat, log } from '@temporalio/activity';

export async function chargeCustomer(order: Order): Promise<ChargeResult> {
  log.info('Charging customer', { orderId: order.id });

  heartbeat('processing payment');
  const result = await paymentService.charge(order);

  return { chargeId: result.id };
}
```

### Python

```python
from temporalio import activity

@activity.defn
async def charge_customer(order: Order) -> ChargeResult:
    activity.logger.info(f"Charging customer for order {order.id}")

    activity.heartbeat("processing payment")
    result = await payment_service.charge(order)

    return ChargeResult(charge_id=result.id)
```

### Java

```java
@ActivityInterface
public interface OrderActivities {
    ChargeResult chargeCustomer(Order order);
    void shipOrder(Order order);
    void refundCustomer(Order order);
}

public class OrderActivitiesImpl implements OrderActivities {
    @Override
    public ChargeResult chargeCustomer(Order order) {
        Activity.getExecutionContext().heartbeat("processing payment");
        PaymentResult result = paymentService.charge(order);
        return new ChargeResult(result.getId());
    }
}
```

### Retry Configuration

Activities retry automatically by default. Customize with retry policies:

**Go:**
```go
retryPolicy := &temporal.RetryPolicy{
    InitialInterval:    time.Second,
    BackoffCoefficient: 2.0,
    MaximumInterval:    time.Minute,
    MaximumAttempts:    5,
    NonRetryableErrorTypes: []string{"InvalidInputError"},
}
options := workflow.ActivityOptions{
    StartToCloseTimeout: 5 * time.Minute,
    RetryPolicy:         retryPolicy,
}
```

**TypeScript:**
```typescript
const { myActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '1m',
    maximumAttempts: 5,
    nonRetryableErrorTypes: ['InvalidInputError'],
  },
});
```

**Python:**
```python
from temporalio.common import RetryPolicy

await workflow.execute_activity(
    my_activity,
    args,
    start_to_close_timeout=timedelta(minutes=5),
    retry_policy=RetryPolicy(
        initial_interval=timedelta(seconds=1),
        backoff_coefficient=2.0,
        maximum_interval=timedelta(minutes=1),
        maximum_attempts=5,
        non_retryable_error_types=["InvalidInputError"],
    ),
)
```

### Activity Timeouts

| Timeout | Purpose | When to set |
|---------|---------|-------------|
| `ScheduleToCloseTimeout` | Max time from scheduled to completed | Set as overall deadline |
| `StartToCloseTimeout` | Max time from started to completed | Set for each attempt |
| `ScheduleToStartTimeout` | Max time waiting in task queue | Set if queue backlog matters |
| `HeartbeatTimeout` | Max time between heartbeats | Set for long-running activities |

You must set at least one of `ScheduleToCloseTimeout` or `StartToCloseTimeout`.

---

## Worker Setup

### Go

```go
package main

import (
    "log"
    "go.temporal.io/sdk/client"
    "go.temporal.io/sdk/worker"
)

func main() {
    c, err := client.Dial(client.Options{})
    if err != nil {
        log.Fatalln("Unable to create client", err)
    }
    defer c.Close()

    w := worker.New(c, "my-task-queue", worker.Options{})

    // Register workflows and activities
    w.RegisterWorkflow(OrderWorkflow)
    w.RegisterActivity(ChargeCustomer)
    w.RegisterActivity(ShipOrder)
    w.RegisterActivity(RefundCustomer)

    err = w.Run(worker.InterruptCh())
    if err != nil {
        log.Fatalln("Unable to start worker", err)
    }
}
```

### TypeScript

```typescript
import { Worker } from '@temporalio/worker';
import * as activities from './activities';

async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows'),
    activities,
    taskQueue: 'my-task-queue',
  });

  // Graceful shutdown on SIGINT/SIGTERM
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Python

```python
import asyncio
from temporalio.client import Client
from temporalio.worker import Worker

from workflows import OrderWorkflow
from activities import charge_customer, ship_order, refund_customer

async def main():
    client = await Client.connect("localhost:7233")

    worker = Worker(
        client,
        task_queue="my-task-queue",
        workflows=[OrderWorkflow],
        activities=[charge_customer, ship_order, refund_customer],
    )

    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
```

### Java

```java
public class WorkerApp {
    public static void main(String[] args) {
        WorkflowServiceStubs service = WorkflowServiceStubs.newLocalServiceStubs();
        WorkflowClient client = WorkflowClient.newInstance(service);

        WorkerFactory factory = WorkerFactory.newInstance(client);
        Worker worker = factory.newWorker("my-task-queue");

        worker.registerWorkflowImplementationTypes(OrderWorkflowImpl.class);
        worker.registerActivitiesImplementations(new OrderActivitiesImpl());

        factory.start();
    }
}
```

---

## Client Usage

### Go

```go
c, err := client.Dial(client.Options{})
if err != nil {
    log.Fatalln("Unable to create client", err)
}
defer c.Close()

// Start workflow
we, err := c.ExecuteWorkflow(context.Background(), client.StartWorkflowOptions{
    ID:        "order-123",
    TaskQueue: "my-task-queue",
}, OrderWorkflow, order)
if err != nil {
    log.Fatalln("Unable to start workflow", err)
}

// Wait for result
var result OrderResult
err = we.Get(context.Background(), &result)
```

### TypeScript

```typescript
import { Client } from '@temporalio/client';
import { orderWorkflow } from './workflows';

const client = new Client();

// Start workflow
const handle = await client.workflow.start(orderWorkflow, {
  args: [order],
  taskQueue: 'my-task-queue',
  workflowId: 'order-123',
});

// Wait for result
const result = await handle.result();
```

### Python

```python
from temporalio.client import Client
from workflows import OrderWorkflow

client = await Client.connect("localhost:7233")

# Start workflow
handle = await client.start_workflow(
    OrderWorkflow.run,
    order,
    id="order-123",
    task_queue="my-task-queue",
)

# Wait for result
result = await handle.result()
```

### Java

```java
WorkflowOptions options = WorkflowOptions.newBuilder()
    .setWorkflowId("order-123")
    .setTaskQueue("my-task-queue")
    .build();

OrderWorkflow workflow = client.newWorkflowStub(OrderWorkflow.class, options);

// Async start
WorkflowExecution execution = WorkflowClient.start(workflow::processOrder, order);

// Sync execution (blocks until complete)
OrderResult result = workflow.processOrder(order);
```

---

## Signals, Queries, and Updates

### Signals (async input to running workflow)

**Go:**
```go
// Define in workflow
signalChan := workflow.GetSignalChannel(ctx, "approval-signal")
var approved bool
signalChan.Receive(ctx, &approved)

// Send from client
err = c.SignalWorkflow(ctx, workflowID, "", "approval-signal", true)
```

**TypeScript:**
```typescript
// Define in workflow
import { defineSignal, setHandler } from '@temporalio/workflow';

const approvalSignal = defineSignal<[boolean]>('approval');

export async function orderWorkflow(order: Order): Promise<void> {
  let approved = false;
  setHandler(approvalSignal, (value) => { approved = value; });

  await condition(() => approved);
  // continue after approval...
}

// Send from client
await handle.signal(approvalSignal, true);
```

**Python:**
```python
# Define in workflow
@workflow.defn
class OrderWorkflow:
    def __init__(self):
        self._approved = False

    @workflow.signal
    async def approval(self, approved: bool) -> None:
        self._approved = approved

    @workflow.run
    async def run(self, order: Order) -> None:
        await workflow.wait_condition(lambda: self._approved)
        # continue after approval...

# Send from client
handle = client.get_workflow_handle("order-123")
await handle.signal(OrderWorkflow.approval, True)
```

### Queries (sync read from workflow state)

**Go:**
```go
// Define in workflow
err := workflow.SetQueryHandler(ctx, "status", func() (string, error) {
    return currentStatus, nil
})

// Query from client
resp, err := c.QueryWorkflow(ctx, workflowID, "", "status")
var status string
resp.Get(&status)
```

**TypeScript:**
```typescript
// Define in workflow
import { defineQuery, setHandler } from '@temporalio/workflow';

const statusQuery = defineQuery<string>('status');

export async function orderWorkflow(order: Order): Promise<void> {
  let status = 'pending';
  setHandler(statusQuery, () => status);
  // ...
}

// Query from client
const status = await handle.query(statusQuery);
```

**Python:**
```python
# Define in workflow
@workflow.defn
class OrderWorkflow:
    def __init__(self):
        self._status = "pending"

    @workflow.query
    def status(self) -> str:
        return self._status

# Query from client
status = await handle.query(OrderWorkflow.status)
```

### Updates (sync mutation of workflow state)

**TypeScript:**
```typescript
import { defineUpdate, setHandler } from '@temporalio/workflow';

const updatePrice = defineUpdate<number, [number]>('updatePrice');

export async function orderWorkflow(order: Order): Promise<void> {
  let price = order.price;
  setHandler(updatePrice, (newPrice) => {
    price = newPrice;
    return price;
  });
  // ...
}

// From client
const newPrice = await handle.executeUpdate(updatePrice, { args: [99.99] });
```

---

## Error Handling

### Non-Retryable Errors

Mark errors as non-retryable to skip retry logic:

**Go:**
```go
import "go.temporal.io/sdk/temporal"

return temporal.NewNonRetryableApplicationError("invalid input", "INVALID_INPUT", nil)
```

**TypeScript:**
```typescript
import { ApplicationFailure } from '@temporalio/common';

throw ApplicationFailure.nonRetryable('invalid input', 'INVALID_INPUT');
```

**Python:**
```python
from temporalio.exceptions import ApplicationError

raise ApplicationError("invalid input", type="INVALID_INPUT", non_retryable=True)
```

**Java:**
```java
throw ApplicationFailure.newNonRetryableFailure("invalid input", "INVALID_INPUT");
```

### Compensation (Saga Pattern)

Track completed steps and compensate on failure:

```typescript
const compensations: (() => Promise<void>)[] = [];

try {
  await chargeCustomer(order);
  compensations.push(() => refundCustomer(order));

  await reserveInventory(order);
  compensations.push(() => releaseInventory(order));

  await shipOrder(order);
} catch (err) {
  // Run compensations in reverse order
  for (const compensate of compensations.reverse()) {
    await compensate();
  }
  throw err;
}
```

---

## Testing

### Go

```go
import (
    "testing"
    "go.temporal.io/sdk/testsuite"
)

func TestOrderWorkflow(t *testing.T) {
    testSuite := &testsuite.WorkflowTestSuite{}
    env := testSuite.NewTestWorkflowEnvironment()

    // Mock activities
    env.OnActivity(ChargeCustomer, mock.Anything, mock.Anything).Return(ChargeResult{ChargeID: "ch_123"}, nil)
    env.OnActivity(ShipOrder, mock.Anything, mock.Anything).Return(nil)

    env.ExecuteWorkflow(OrderWorkflow, testOrder)

    require.True(t, env.IsWorkflowCompleted())
    require.NoError(t, env.GetWorkflowError())

    var result OrderResult
    require.NoError(t, env.GetWorkflowResult(&result))
    require.Equal(t, "completed", result.Status)
}
```

### TypeScript

```typescript
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { orderWorkflow } from './workflows';

describe('OrderWorkflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it('completes order successfully', async () => {
    const { client, nativeConnection } = env;

    // Create worker with mocked activities
    const worker = await Worker.create({
      connection: nativeConnection,
      taskQueue: 'test',
      workflowsPath: require.resolve('./workflows'),
      activities: {
        chargeCustomer: async () => ({ chargeId: 'ch_123' }),
        shipOrder: async () => {},
      },
    });

    const result = await worker.runUntil(
      client.workflow.execute(orderWorkflow, {
        args: [testOrder],
        taskQueue: 'test',
        workflowId: 'test-order-1',
      })
    );

    expect(result.status).toBe('completed');
  });
});
```

### Python

```python
import pytest
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from workflows import OrderWorkflow

@pytest.fixture
async def env():
    async with await WorkflowEnvironment.start_local() as env:
        yield env

async def test_order_workflow(env: WorkflowEnvironment):
    async def mock_charge_customer(order):
        return ChargeResult(charge_id="ch_123")

    async def mock_ship_order(order):
        pass

    async with Worker(
        env.client,
        task_queue="test",
        workflows=[OrderWorkflow],
        activities=[mock_charge_customer, mock_ship_order],
    ):
        result = await env.client.execute_workflow(
            OrderWorkflow.run,
            test_order,
            id="test-order-1",
            task_queue="test",
        )

    assert result.status == "completed"
```

### Time-Skipping

Test workflows with timers without waiting real time:

**TypeScript:**
```typescript
env = await TestWorkflowEnvironment.createTimeSkipping();
// Timers resolve instantly
```

**Python:**
```python
async with await WorkflowEnvironment.start_time_skipping() as env:
    # Timers resolve instantly
    pass
```

### Replay Testing

Verify workflow determinism by replaying from history:

**Go:**
```go
replayer := worker.NewWorkflowReplayer()
replayer.RegisterWorkflow(OrderWorkflow)
err := replayer.ReplayWorkflowHistoryFromJSONFile(nil, "history.json")
```

**Python:**
```python
from temporalio.worker import Replayer

replayer = Replayer(workflows=[OrderWorkflow])
await replayer.replay_workflow(workflow_history)
```

---

## Advanced Patterns

### Child Workflows

```go
// Go
childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
    WorkflowID: "child-" + order.ID,
})
var childResult ChildResult
err := workflow.ExecuteChildWorkflow(childCtx, ChildWorkflow, input).Get(childCtx, &childResult)
```

```typescript
// TypeScript
import { executeChild } from '@temporalio/workflow';

const result = await executeChild(childWorkflow, {
  args: [input],
  workflowId: `child-${order.id}`,
});
```

### Continue-As-New

For workflows that would accumulate large histories:

```go
// Go — after processing a batch
return workflow.NewContinueAsNewError(ctx, ProcessBatchWorkflow, nextCursor)
```

```typescript
// TypeScript
import { continueAsNew } from '@temporalio/workflow';

if (history.length > 1000) {
  await continueAsNew<typeof processWorkflow>(nextCursor);
}
```

```python
# Python
workflow.continue_as_new(next_cursor)
```

### Timers and Sleep

```go
// Go
workflow.Sleep(ctx, 24 * time.Hour)
```

```typescript
// TypeScript
import { sleep } from '@temporalio/workflow';
await sleep('24h');
```

```python
# Python
await asyncio.sleep(86400)  # NO — not deterministic!
await workflow.sleep(timedelta(hours=24))  # YES
```

### Side Effects

For non-deterministic operations within workflows (e.g., generating UUIDs):

```go
// Go
var uuid string
workflow.SideEffect(ctx, func(ctx workflow.Context) interface{} {
    return generateUUID()
}).Get(&uuid)
```

```typescript
// TypeScript — use uuid from workflow module
import { uuid4 } from '@temporalio/workflow';
const id = uuid4();
```

---

## Versioning

### Workflow Versioning (GetVersion API)

Safely modify running workflows:

**Go:**
```go
v := workflow.GetVersion(ctx, "change-id", workflow.DefaultVersion, 1)
if v == workflow.DefaultVersion {
    // old code path
} else {
    // new code path (v == 1)
}
```

**TypeScript:**
```typescript
import { patched } from '@temporalio/workflow';

if (patched('new-feature')) {
  // new code path
} else {
  // old code path
}
```

**Python:**
```python
if workflow.patched("new-feature"):
    # new code path
else:
    # old code path
```

### Worker Versioning (Build IDs)

Route workflows to compatible workers:

```bash
# Add build ID to task queue
temporal task-queue update-build-ids add-new-default \
  --task-queue my-queue \
  --build-id "v2.0"

# Workers register with their build ID
```

```go
// Go worker with build ID
w := worker.New(c, "my-task-queue", worker.Options{
    BuildID:                 "v2.0",
    UseBuildIDForVersioning: true,
})
```
