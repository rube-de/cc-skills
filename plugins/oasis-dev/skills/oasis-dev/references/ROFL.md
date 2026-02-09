# ROFL (Runtime OFfchain Logic) Reference

ROFL enables containerized off-chain applications running in Trusted Execution Environments (TEEs), managed through Sapphire smart contracts.

## Overview

ROFL apps are Docker-based applications that:
- Execute inside Intel SGX/TDX hardware enclaves
- Have cryptographic attestation (remote attestation proves genuine TEE execution)
- Access decentralized per-app key management
- Store end-to-end encrypted secrets on-chain
- Submit authenticated transactions to Sapphire
- Get automatic HTTPS proxy for published ports

## App Lifecycle

```
oasis rofl init → oasis rofl create → oasis rofl build → oasis rofl deploy
                                    ↓
                            oasis rofl secret set
                                    ↓
                            oasis rofl update (if policy changes)
                                    ↓
                            oasis rofl upgrade (redeploy)
```

## Project Structure

```
my-app/
├── compose.yaml          # Container orchestration (Docker Compose)
├── rofl.yaml            # ROFL manifest
├── Dockerfile           # Container image definition
├── contracts/           # Smart contracts (optional)
│   └── src/
│       └── MyContract.sol
└── src/                 # Application source
```

## rofl.yaml Manifest

```yaml
name: my-app
version: 0.1.0
author: my-name
tee: tdx                    # tdx (default) or sgx
kind: containers             # containers (default) or raw

resources:
  memory: 512                # Megabytes
  cpus: 1
  storage:
    kind: disk-persistent    # See storage options below
    size: 512                # Megabytes

deployments:
  testnet:
    network: testnet
    paratime: sapphire
    app_id: rofl1...         # Filled after `oasis rofl create`
    admin: <your-address>
    policy:
      enclaves:
        - <base64-enclave-id>  # Filled after `oasis rofl build`
      endorsements:
        - any: {}
      fees: endorsing_node
      max_expiration: 3
```

### Storage Options

| Kind | Description |
|------|-------------|
| `disk-persistent` | Encrypted via on-chain KMS, survives reboots, authenticated after attestation |
| `disk-ephemeral` | Encrypted with random key per boot, lost on restart |
| `ram` | Encrypted memory-based filesystem |
| `none` | No storage provisioned |

### TEE Flavors

| Flavor | Description |
|--------|-------------|
| TDX Containers | Docker Compose, flexible, larger TCB (default) |
| TDX Raw | Rust init process, smaller TCB, no Docker |
| SGX Raw | Rust, fixed memory, smallest TCB, local testing via sapphire-localnet |

## Docker Compose (compose.yaml)

```yaml
services:
  app:
    image: docker.io/username/my-app:latest    # MUST be fully qualified
    platform: linux/amd64                       # Required
    build:
      context: .
    environment:
      - MY_SECRET=${MY_SECRET}                  # References ROFL secret
    volumes:
      - /run/rofl-appd.sock:/run/rofl-appd.sock  # Required for appd API
    ports:
      - "8080:8080"                             # Auto-proxied with TLS
```

### Important Rules

- `image` must be fully qualified OCI URL (e.g., `docker.io/library/python:3.12-alpine`)
- Environment variables in `entrypoint`/`command` are **not** evaluated — inject directly
- `depends_on` is **ignored** — implement retry logic between services
- Pin image digests for reproducibility: `image: docker.io/user/app@sha256:...`

### Build & Push Images

```bash
docker compose build
docker login
docker compose push
```

## Secret Management

Secrets are end-to-end encrypted and stored on-chain. Only attested ROFL app instances can decrypt them.

### Setting Secrets

```bash
# From stdin
echo -n "my-value" | oasis rofl secret set SECRET_NAME -

# Multiple secrets
echo -n "key1" | oasis rofl secret set API_KEY -
echo -n "key2" | oasis rofl secret set DB_PASSWORD -
```

### Accessing in Containers

**Via environment variables** (name capitalized, spaces become underscores):
```yaml
environment:
  - TOKEN=${TOKEN}
```

**Via container secrets** (readable from `/run/secrets/<name>`):
```yaml
secrets:
  mysecret:
    external: true    # Created by ROFL during boot
```

## appd REST API

The `rofl-appd` daemon provides HTTPS via Unix socket at `/run/rofl-appd.sock`.

### Endpoints

#### Get App ID
```
GET /rofl/v1/app/id
→ "rofl1qp6..."
```

#### Generate Key
```
POST /rofl/v1/keys/generate
{
  "key_id": "my-key",
  "kind": "secp256k1"        // raw-256, raw-384, ed25519, secp256k1
}
→ { "key": "0xabcd..." }     // Hex-encoded, deterministic per app
```

Keys are **deterministic** — same key ID produces same key across deployments.

#### Sign & Submit Transaction (EVM)
```
POST /rofl/v1/tx/sign-submit
{
  "encrypt": true,
  "tx": {
    "kind": "eth",
    "data": {
      "gas_limit": 200000,
      "to": "0x1234...",
      "value": "0",
      "data": "0xabcd..."     // ABI-encoded calldata
    }
  }
}
```

#### Sign & Submit Transaction (SDK)
```
POST /rofl/v1/tx/sign-submit
{
  "encrypt": true,
  "tx": {
    "kind": "std",
    "data": {
      "call": {
        "method": "module.Method",
        "body": { ... }
      }
    }
  }
}
```

#### Metadata Management
```
GET  /rofl/v1/metadata                    → Key-value pairs
POST /rofl/v1/metadata { "key": "value" } → Published with net.oasis.app. prefix
```

#### Query Runtime
```
POST /rofl/v1/query
{
  "method": "runtime.Method",
  "args": "hex-encoded-cbor"
}
```

### SDK Clients for appd

All clients live in the `oasis-sdk` monorepo: https://github.com/oasisprotocol/oasis-sdk/tree/main/rofl-client

| Language | Package | Install |
|----------|---------|---------|
| TypeScript | `@oasisprotocol/rofl-client` | `npm install @oasisprotocol/rofl-client` |
| Python | `oasis-rofl-client` | `pip install oasis-rofl-client` |
| Rust | `oasis-rofl-client` | `cargo add oasis-rofl-client` |

All three clients expose the same core API surface:

| Method | Description |
|--------|-------------|
| `getAppId()` / `get_app_id()` | Get bech32-encoded ROFL app ID |
| `generateKey(keyId, kind)` / `generate_key()` | Generate deterministic key (survives redeploys) |
| `signAndSubmit(tx, opts)` / `sign_submit()` | Sign + submit authenticated tx (EVM or SDK) |
| `getMetadata()` / `get_metadata()` | Get metadata key-value pairs |
| `setMetadata(metadata)` / `set_metadata()` | Set metadata (replaces all, triggers registration refresh) |
| `query(method, args)` | Execute read-only runtime query (CBOR-encoded args) |

#### Key Kinds

Available for all clients:
- `raw-256` — 256 bits of entropy
- `raw-384` — 384 bits of entropy
- `ed25519` — Ed25519 private key
- `secp256k1` — Secp256k1 private key

#### TypeScript Client

```typescript
import { RoflClient, KeyKind } from '@oasisprotocol/rofl-client';
// Also exports: StdTx, EthTx, EthValue, ROFL_SOCKET_PATH

// Connect via Unix Domain Socket (default: /run/rofl-appd.sock)
const client = new RoflClient();

// Or connect via HTTP (for local dev)
const httpClient = new RoflClient({ url: 'http://localhost:8080' });

// Or custom socket path with timeout
const customClient = new RoflClient({ url: '/custom/path.sock', timeoutMs: 30000 });

// Get app ID
const appId = await client.getAppId();
// → "rofl1qqn9xndja7e2pnxhttktmecvwzz0yqwxsquqyxdf"

// Generate deterministic secp256k1 key
const key = await client.generateKey('my-signing-key', KeyKind.SECP256K1);
// → hex-encoded private key (no 0x prefix)

// Generate Ed25519 key
const ed25519Key = await client.generateKey('my-ed25519-key', KeyKind.ED25519);

// Sign and submit EVM transaction
const result = await client.signAndSubmit(
  {
    kind: 'eth',
    gas_limit: 200000,
    to: '0x1234...',
    value: '0',             // string, bigint, or number (wei)
    data: '0xabcdef...',    // ABI-encoded calldata
  },
  { encrypt: true },        // optional, defaults to true
);
// → Uint8Array (CBOR-encoded CallResult)

// Sign and submit SDK transaction
await client.signAndSubmit({
  kind: 'std',
  data: 'cbor-hex-encoded-transaction',
});

// Typed query with generics
const queryResult = await client.query<MyArgs, MyResult>('module.Method', myArgs);

// Metadata
await client.setMetadata({ version: '1.0.0', status: 'active' });
const meta = await client.getMetadata();
```

#### Python Client

```python
from oasis_rofl_client import RoflClient, AsyncRoflClient, KeyKind

# Sync client (uses httpx, connects to /run/rofl-appd.sock by default)
client = RoflClient()

# Or HTTP transport
client = RoflClient(url="http://localhost:8080")

# Or custom socket
client = RoflClient(url="/custom/path.sock")

# Get app ID
app_id = client.get_app_id()

# Generate deterministic key
key = client.generate_key("my-key", KeyKind.SECP256K1)

# Sign and submit EVM transaction (uses web3.types.TxParams)
result = client.sign_submit(
    {
        "gas": 200000,
        "to": "0x1234...",
        "value": 0,
        "data": "0xabcdef...",
    },
    encrypt=True,  # optional, defaults to True
)
# → dict (CBOR-decoded response)

# Metadata
client.set_metadata({"version": "1.0.0"})
meta = client.get_metadata()

# Query (CBOR-encoded args)
import cbor2
args = cbor2.dumps({"id": app_id})
result = client.query("rofl.App", args)

# Async client also available
async_client = AsyncRoflClient()
app_id = await async_client.get_app_id()
```

**Python dependencies**: `httpx`, `cbor2`, `web3` (for `TxParams` type)

#### Rust Client

```rust
use oasis_rofl_client::{RoflClient, KeyKind, Tx, EthCall};

// Connect to default socket (/run/rofl-appd.sock)
let client = RoflClient::new()?;

// Or custom socket path
let client = RoflClient::with_socket_path("/custom/path.sock")?;

// Get app ID
let app_id = client.get_app_id().await?;

// Generate deterministic key
let key = client.generate_key("my-key", KeyKind::Secp256k1).await?;

// Sign and submit EVM transaction
let result = client.sign_submit(
    Tx::Eth(EthCall {
        gas_limit: 200000,
        to: "1234...".to_string(),      // hex without 0x
        value: "0".to_string(),
        data: "abcdef...".to_string(),   // hex without 0x
    }),
    Some(true),  // encrypt
).await?;
// → String (hex-encoded CBOR CallResult)

// Convenience helper for ETH calls
let result = client.sign_submit_eth(
    200000,           // gas_limit
    "1234...",        // to (hex)
    "0",              // value
    "abcdef...",      // data (hex)
    Some(true),       // encrypt
).await?;

// Metadata
use std::collections::HashMap;
let mut meta = HashMap::new();
meta.insert("version".to_string(), "1.0.0".to_string());
client.set_metadata(&meta).await?;
let fetched = client.get_metadata().await?;

// Query (raw CBOR bytes)
let args = b"\xa1\x64test\x65value";
let result = client.query("module.Method", args).await?;
// → Vec<u8> (raw CBOR response)
```

**Rust dependencies**: `serde`, `serde_json`, `tokio`, `hex`, `thiserror`, `anyhow`

## On-Chain Verification (Solidity)

Verify that a transaction originated from an authorized ROFL app:

```solidity
import {Subcall} from "@oasisprotocol/sapphire-contracts/contracts/Subcall.sol";

contract ROFLConsumer {
    bytes21 public roflAppID;

    constructor(bytes21 _appId) {
        roflAppID = _appId;
    }

    function submitData(uint256 data) external {
        // Reverts if caller is not the registered ROFL app
        Subcall.roflEnsureAuthorizedOrigin(roflAppID);
        // Process authenticated data...
    }
}
```

## Port Proxy

Published ports are automatically proxied with HTTPS/TLS termination inside the enclave.

### Configuration

```yaml
services:
  app:
    ports:
      - "8080:8080"
    labels:
      # Proxy annotations
      net.oasis.proxy.ports.8080.mode: terminate-tls    # Default
      net.oasis.proxy.ports.8080.custom_domain: myapp.example.com
```

### Proxy Modes

| Mode | Description |
|------|-------------|
| `terminate-tls` | Proxy handles TLS, forwards plaintext to app (default) |
| `passthrough` | Raw TCP forwarding, app handles TLS |
| `ignore` | Port not exposed externally |

### Custom Domain

1. Get DNS instructions: `oasis rofl machine show`
2. Set A record pointing to proxy IP
3. Set TXT verification record
4. Add annotation: `net.oasis.proxy.ports.80.custom_domain: mydomain.com`

### Access URL

After deployment, proxy URLs are shown by `oasis rofl machine show`:
```
Proxy URLs:
  https://p8080.m1058...
```

## Deployment

### Marketplace (Recommended)

```bash
# See available node offers
oasis rofl deploy --show-offers

# Deploy to marketplace node
oasis rofl deploy

# Extend rental
oasis rofl machine top-up --term hour --term-count 4
```

### Manual Hosting

Copy the `.orc` bundle to a ROFL node and configure in node settings.

## Machine Management

```bash
# Status, proxy URLs, deployment info
oasis rofl machine show

# View logs (WARNING: logs are unencrypted on node)
oasis rofl machine logs

# Extend rental
oasis rofl machine top-up --term hour --term-count 4
```

## Manifest Policy

### Enclave Whitelist

```yaml
policy:
  enclaves:
    - <base64-id-1>     # Multiple allowed for rolling upgrades
    - <base64-id-2>
```

### Endorsement Conditions

```yaml
endorsements:
  - any: {}                          # Any node
  - node: <node-id>                  # Specific node
  - provider: <provider-address>     # Specific provider
  - and: [condition1, condition2]    # All must match
  - or: [condition1, condition2]     # Any must match
```

### Fee Policy

```yaml
fees: endorsing_node    # Node pays fees
fees: instance          # App instance pays fees
```

## Use Cases

### Price Oracle
Fetch off-chain price data, aggregate, submit to Sapphire with ROFL authentication.

### AI Agent (Eliza)
Run AI agents in TEE with cryptographic proof of execution environment (ERC-8004).

### Cross-Chain Key Management
Generate keys in ROFL, derive addresses, sign transactions on external chains (e.g., Base).

### Private Bots
Run Telegram/Discord bots with secret API tokens protected by TEE.

## Troubleshooting

### Build Fails
- Ensure Docker/Podman is running
- Use fully qualified image URLs
- Check `oasis rofl build` output for enclave hash

### appd 422 Errors
- Verify request body matches expected schema
- Check required fields (`kind` for keys, `tx` structure for sign-submit)

### Proxy Not Working
- Update Oasis CLI: `oasis rofl upgrade`
- Rebuild: `oasis rofl build`
- Redeploy: `oasis rofl deploy`

### Logs Contain Secrets
Logs are stored **unencrypted** on the ROFL node — never log sensitive values.
