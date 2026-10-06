---
name: oasis-dev
description: >-
  Help developers build on Oasis Network: Sapphire confidential EVM, ROFL off-chain apps,
  CLI operations, SDK patterns (Rust, Go, TypeScript, Python), and ParaTime development.
allowed-tools: [Read, Grep, Glob, Bash, WebSearch, WebFetch, Write, Edit, AskUserQuestion]
user-invocable: true
metadata:
  author: rube-de
  version: "1.0.0"
---

# Oasis Dev

Comprehensive assistance for building on the Oasis Network: Sapphire confidential EVM ParaTime, ROFL (Runtime OFfchain Logic) applications, Oasis CLI, SDK development, and ParaTime operations.

## Triggers

Use this skill when the user mentions: "oasis", "sapphire", "sapphire paratime", "rofl", "oasis cli", "oasis sdk", "oasis network", "confidential evm", "oasis-sdk", "sapphire-paratime", "oasisprotocol", "oasis rofl", "paratime", "emerald", "cipher", "rose token", "oasis wallet", "sapphire contracts", "oasis node", "oasis core".

Also activate when the user is working in repos: `oasisprotocol/sapphire-paratime`, `oasisprotocol/oasis-sdk`, `oasisprotocol/cli`.

> **Before running any command listed under [Destructive Commands](#destructive-commands)** (including the transfer, `rofl create`, and `rofl deploy` examples below), follow that section's confirm-first rule.

## MCP Context

If MCP Context7 is available, use it to fetch latest docs:
- Library ID: `oasis_io_llms_txt` at `https://context7.com/llmstxt/oasis_io_llms_txt`

## Quick Start

### Install CLI

```bash
# Download latest release from https://github.com/oasisprotocol/cli/releases
# Linux
wget https://github.com/oasisprotocol/cli/releases/latest/download/oasis_cli_linux_amd64.tar.gz
tar xf oasis_cli_linux_amd64.tar.gz
sudo mv oasis /usr/local/bin/

# macOS
brew install oasisprotocol/tools/oasis
```

### Create a Wallet

```bash
# Ed25519 (Oasis native)
oasis wallet create my_wallet

# secp256k1 (EVM-compatible, for Sapphire/Emerald)
oasis wallet create my_wallet --algorithm secp256k1-bip44
```

### Get Testnet Tokens

Visit https://faucet.testnet.oasis.io to get TEST tokens for Sapphire Testnet.

### Deploy a Sapphire dApp (Hardhat)

```bash
npx hardhat init
npm install -D @oasisprotocol/sapphire-hardhat
```

```js
// hardhat.config.js
import '@oasisprotocol/sapphire-hardhat';

module.exports = {
  solidity: "0.8.24",
  networks: {
    sapphire_testnet: {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff,
      accounts: [process.env.PRIVATE_KEY],
    },
    sapphire_mainnet: {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
```

### Build a ROFL App

```bash
oasis rofl init my-app
oasis rofl create --network testnet --account my_wallet
oasis rofl build
echo -n "my-secret" | oasis rofl secret set MY_SECRET -
oasis rofl deploy
```

## Common Tasks by Intent

| Developer wants to... | Action |
|-----------------------|--------|
| Create a Sapphire dApp | Use Hardhat + `@oasisprotocol/sapphire-hardhat` plugin |
| Build a ROFL app | `oasis rofl init`, `oasis rofl create`, `oasis rofl build`, `oasis rofl deploy` |
| Check account balance | `oasis account show <name>` |
| Transfer tokens | `oasis account transfer <amount> <to> --network testnet --paratime sapphire` |
| Deposit to ParaTime | `oasis account deposit <amount> --network testnet --paratime sapphire` |
| Withdraw from ParaTime | `oasis account withdraw <amount> --network testnet --paratime sapphire` |
| Manage ROFL secrets | `oasis rofl secret set <NAME> -` (pipe value via stdin) |
| View ROFL logs | `oasis rofl machine logs` |
| Check ROFL status | `oasis rofl machine show` |
| Inspect a ParaTime block | `oasis paratime show <round> --network testnet --paratime sapphire` |
| Use Go SDK with Sapphire | Import `sapphire "github.com/oasisprotocol/sapphire-paratime/clients/go"` |
| Use JS/TS with Sapphire | `npm install @oasisprotocol/sapphire-paratime` |
| Verify ROFL origin on-chain | `Subcall.roflEnsureAuthorizedOrigin(roflAppID)` in Solidity |

## Destructive Commands

These commands sign or broadcast on-chain transactions, move or destroy funds, expose keys, or tear down ROFL deployments. On-chain effects can't be reversed.

| Command | Effect |
|---------|--------|
| `oasis account transfer` / `deposit` / `withdraw` | Moves tokens between accounts or layers |
| `oasis account delegate` / `undelegate` / `allow` | Stakes, unstakes (with debonding), or grants an allowance |
| `oasis account burn` | Destroys tokens permanently |
| `oasis account entity register` / `deregister`, `oasis account node-unfreeze`, `oasis account amend-commission-schedule` | Changes validator entity, node, or commission state on consensus |
| `oasis transaction sign` / `submit` | Produces or broadcasts an arbitrary signed transaction |
| `oasis network governance cast-vote` | Casts an on-chain governance vote |
| `oasis network set-rpc` | Points signing traffic at a different endpoint |
| `oasis wallet export` | Prints the private key or mnemonic |
| `oasis wallet remove` | Deletes the local key; funds are lost without a backup |
| `oasis rofl create` / `update` / `deploy` / `remove` | On-chain app registration (escrows a deposit), config changes, paid machine rental, or app removal |
| `oasis rofl set-admin` / `oasis rofl machine set-admin` | Transfers app or machine admin rights on-chain; a wrong address loses control |
| `oasis rofl machine stop` / `remove` / `top-up`, and `--wipe-storage` on `machine stop` / `machine restart` / `deploy` | Takes a live instance down, cancels the rental, spends funds, or wipes persistent storage |
| `oasis rofl secret rm` / `import` / `set --force` | Deletes or overwrites app secrets in the manifest (applied on the next `rofl update`) |
| Contract deploys to `sapphire_mainnet` (Hardhat, `forge create`) | Spends real ROSE |

Before running any of them:

1. State the exact target and scope: `--network` (mainnet or testnet), `--paratime`, `--account`, recipient or validator address, and amount with its denomination (9 decimals on consensus, 18 on Sapphire/Emerald).
2. Get explicit confirmation from the user for that exact command via `AskUserQuestion` (options: **Run** / **Cancel**). On Cancel, or if no answer can be obtained, don't run it.
3. `-y` answers yes to every yes/no prompt and accepts the proposed default for other prompts, including signing and broadcast confirmations and the `oasis wallet remove` confirmation (see [references/CLI.md](references/CLI.md) Common Flags). Add it only after the user has confirmed the exact command; never add it on the user's behalf.

## Key Concepts

### ParaTimes

ParaTimes are parallel runtimes on Oasis. Key ones:
- **Sapphire**: Confidential EVM-compatible (18 decimals, chain ID 0x5afe mainnet / 0x5aff testnet)
- **Emerald**: Non-confidential EVM-compatible (18 decimals)
- **Cipher**: Confidential WebAssembly (9 decimals)

### Confidential Computing

Sapphire provides end-to-end encryption for smart contracts:
- Contract state is encrypted at rest
- Transactions are encrypted end-to-end
- Cryptographically secure randomness available on-chain
- TEE (Trusted Execution Environment) hardware protects execution

### ROFL (Runtime OFfchain Logic)

Containerized off-chain applications running in TEEs, managed via Sapphire:
- Docker Compose based container orchestration
- Intel SGX/TDX trusted execution
- Decentralized per-app key management
- Built-in secret management (end-to-end encrypted)
- Proxy with automatic TLS for published ports
- `appd` REST API for key generation, transaction signing, and queries

### Token Denominations

| Network | Decimals | Symbol |
|---------|----------|--------|
| Consensus (Mainnet/Testnet) | 9 | ROSE / TEST |
| Sapphire / Emerald | 18 | ROSE / TEST |
| Cipher | 9 | ROSE / TEST |

## Reference Documents

For deep dives, consult these references:

| Reference | Content |
|-----------|---------|
| [CLI.md](references/CLI.md) | Complete CLI command reference: wallet, account, network, paratime, ROFL, transactions |
| [SAPPHIRE.md](references/SAPPHIRE.md) | Sapphire ParaTime development: EVM patterns, SDKs (Go, JS/TS, Python), Hardhat, confidential contracts |
| [ROFL.md](references/ROFL.md) | ROFL framework: app lifecycle, containers, secrets, appd API, deployment, proxy configuration |
| [SDK-CORE.md](references/SDK-CORE.md) | Oasis SDK and core concepts: architecture, ParaTimes, staking, consensus, cryptography |

## Troubleshooting

### Sapphire Transaction Sent in Plaintext

If using Go SDK, always use `backend.Transactor(senderAddr)` for `TransactOpts`. Forgetting this sends transactions unencrypted.

For JS/TS, ensure `@oasisprotocol/sapphire-paratime` wraps the provider before any contract interactions.

### ROFL Build Failures

- Ensure Docker/Podman is running
- Use fully qualified image URLs in `compose.yaml` (e.g., `docker.io/library/python:3.12-alpine`)
- Environment variables in entrypoint are not evaluated — inject directly

### ROFL appd 422 Errors

Verify request body matches expected format. Check required fields: `kind` for keys, `tx` structure for sign-submit.

### Decimal Mismatch

Sapphire/Emerald use 18 decimals, consensus uses 9. Wrong decimals = wrong token amounts. Always verify with `oasis paratime list`.

### Rust Compilation for Oasis SDK

Add to `.cargo/config.toml`:
```toml
[build]
rustflags = ["-C", "target-feature=+aes,+ssse3"]
```

## External Resources

- Docs: https://docs.oasis.io
- Faucet: https://faucet.testnet.oasis.io
- Explorer: https://explorer.oasis.io
- GitHub: https://github.com/oasisprotocol
- Sapphire repo: https://github.com/oasisprotocol/sapphire-paratime
- SDK repo: https://github.com/oasisprotocol/oasis-sdk
- CLI repo: https://github.com/oasisprotocol/cli

## Workflow

When helping with Oasis development:

1. **Identify the task**: Sapphire dApp, ROFL app, CLI operation, SDK code, or architecture decision
2. **Check the language**: For SDK questions, determine Rust/Go/TypeScript/Python
3. **Consult references**: Use the reference docs for detailed patterns and commands
4. **Verify confidentiality**: For Sapphire code, ensure encryption wrappers are used correctly
5. **Check decimals**: Confirm correct decimal places for the target network/ParaTime
