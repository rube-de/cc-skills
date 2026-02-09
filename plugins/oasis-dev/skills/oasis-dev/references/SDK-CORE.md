# Oasis SDK & Core Concepts

Architecture, core concepts, SDK patterns, and protocol-level documentation for the Oasis Network.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Applications / dApps            │
├─────────────────────────────────────────────┤
│         ParaTimes (Parallel Runtimes)        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Sapphire │ │ Emerald  │ │  Cipher  │    │
│  │(Conf EVM)│ │  (EVM)   │ │(Conf WASM│    │
│  └──────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────┤
│            Consensus Layer                   │
│  Staking · Registry · Governance · KMS       │
├─────────────────────────────────────────────┤
│            Oasis Core (Tendermint)            │
└─────────────────────────────────────────────┘
```

## Key Concepts

### ParaTimes

ParaTimes are independent parallel runtimes sharing the Oasis consensus layer:
- Each has its own state, transaction format, and execution environment
- Can be confidential (TEE-backed) or non-confidential
- Share security from the consensus layer validators

| ParaTime | Type | EVM | Confidential | Decimals |
|----------|------|-----|--------------|----------|
| Sapphire | Production | Yes | Yes (TEE) | 18 |
| Emerald | Production | Yes | No | 18 |
| Cipher | Production | No (WASM) | Yes (TEE) | 9 |

### Consensus Layer

The consensus layer provides:
- **Staking**: ROSE token delegation and rewards
- **Registry**: Entity, node, and runtime registration
- **Governance**: On-chain proposals and voting
- **Key Manager**: Runtime key management for confidential ParaTimes
- **Roothash**: ParaTime state commitment and verification

### Entities & Nodes

- **Entity**: An organization or individual operating nodes (identified by Ed25519 public key)
- **Validator Node**: Participates in consensus (BFT)
- **ParaTime Node**: Executes ParaTime logic (compute, storage, key manager)
- **Seed Node**: Helps with peer discovery
- **Archive Node**: Full history, no consensus participation

### Tokens & Staking

- **ROSE**: Native token (9 decimal places on consensus)
- **Staking**: Validators must stake ROSE; delegators earn rewards
- **Minimum stake**: Varies by role (validator, compute, key manager)
- **Escrow**: Staked tokens held in escrow accounts
- **Slashing**: Penalties for misbehavior (double-signing, unavailability)

## Oasis SDK (Rust)

The `oasis-sdk` crate is used for building custom ParaTime runtimes and ROFL applications in Rust.

### Repository

https://github.com/oasisprotocol/oasis-sdk

### Key Crates

| Crate | Purpose |
|-------|---------|
| `oasis-runtime-sdk` | Core SDK for building runtimes |
| `oasis-runtime-sdk-macros` | Derive macros for modules |
| `oasis-contract-sdk` | Smart contract SDK (for WASM contracts) |
| `oasis-cbor` | CBOR encoding/decoding |

### Building a Runtime Module

```rust
use oasis_runtime_sdk::{
    self as sdk,
    modules::{accounts, core},
};

/// My custom module.
#[derive(Default)]
pub struct Module;

#[sdk::module(name = "my_module")]
impl Module {
    #[handler(call = "my_module.MyMethod")]
    fn my_method(ctx: &Context, body: MyMethodRequest) -> Result<MyMethodResponse, Error> {
        // Implementation
    }

    #[handler(query = "my_module.MyQuery")]
    fn my_query(ctx: &Context, args: MyQueryArgs) -> Result<MyQueryResponse, Error> {
        // Implementation
    }
}
```

### ROFL App in Rust (Raw Mode)

```rust
use oasis_runtime_sdk::rofl;

struct MyApp;

#[rofl::app]
impl rofl::App for MyApp {
    const VERSION: rofl::Version = rofl::Version::new(0, 1, 0);

    async fn run(self: Arc<Self>, env: Environment) -> Result<()> {
        // App logic here
        // env provides access to consensus, key manager, etc.
        Ok(())
    }
}
```

### Build Configuration

Add to `.cargo/config.toml`:
```toml
[build]
rustflags = ["-C", "target-feature=+aes,+ssse3"]
```

## Cryptography

### Supported Algorithms

| Algorithm | Usage |
|-----------|-------|
| Ed25519 | Consensus signatures, entity keys |
| secp256k1 | EVM-compatible accounts |
| sr25519 | Substrate-compatible (limited) |
| SHA-512/256 | Hashing |
| X25519 | Key exchange (Deoxys-II encryption) |
| Deoxys-II | Authenticated encryption for confidential state |

### Chain Domain Separation

Transactions are signed with a chain-specific context:
```
oasis-core/consensus: tx for chain <chain-id>
```

This prevents replay attacks across networks.

### Key Derivation (BIP-44)

Oasis uses BIP-44 derivation path:
```
m/44'/474'/0'    (Oasis native, Ed25519)
m/44'/60'/0'     (EVM-compatible, secp256k1)
```

## Encoding

### CBOR

Oasis uses CBOR (Concise Binary Object Representation) for:
- Transaction encoding
- State storage
- RPC messages

### Address Formats

- **Oasis native**: Bech32-encoded (`oasis1...`)
- **Ethereum-compatible**: Hex-encoded (`0x...`) — used in Sapphire/Emerald
- **Conversion**: CLI handles automatic conversion between formats

## Consensus Services

### Staking

```
oasis account delegate <amount> <validator>
oasis account undelegate <shares> <validator>
```

Delegation parameters:
- **Commission rate**: Set by validator (0-100%)
- **Unbonding period**: ~14 days for undelegation
- **Minimum delegation**: Varies by validator

### Governance

```
oasis network governance list
oasis network governance show <proposal-id>
oasis network governance vote <proposal-id> <yes|no|abstain>
```

### Registry

Entities and nodes register via the registry service:
- Entity registration (staking account)
- Node registration (compute, validator, key manager)
- Runtime registration (ParaTimes)

## State Management

### Merklized Key-Value Store (MKVS)

ParaTime state is stored in a Merklized AVL tree:
- Provides cryptographic proofs of state
- Supports efficient state sync
- Used for light client verification

### State Sync

Nodes can fast-sync state:
```bash
# Enable state sync in node config
oasis-node --consensus.state_sync.enabled
```

### Pruning

Reduce storage by pruning old state:
- Keep last N versions
- Keep checkpoints at intervals

## Node Operations

### Validator Requirements

- **Minimum stake**: Check current requirements at https://docs.oasis.io
- **Hardware**: 2+ CPU cores, 4+ GB RAM, 100+ GB SSD
- **Network**: Stable connection, ports 26656 (P2P), 9001 (gRPC)

### ParaTime Node Requirements

- **TEE**: Intel SGX/TDX for confidential ParaTimes
- **Additional stake**: ParaTime-specific requirements
- **Runtime binary**: Specific to each ParaTime

### Key Manager Node

- Manages encryption keys for confidential ParaTimes
- Requires TEE hardware
- Critical for Sapphire and Cipher operation

## Network Upgrades

Oasis has undergone major upgrades:
- **Cobalt**: Network stability improvements
- **Damask**: Performance and governance enhancements
- **Eden**: Latest upgrade with ROFL support

Upgrades are coordinated via governance proposals.

## External References

- Oasis SDK: https://github.com/oasisprotocol/oasis-sdk
- Oasis Core: https://github.com/oasisprotocol/oasis-core
- Docs: https://docs.oasis.io
- ADRs: https://github.com/oasisprotocol/adrs
