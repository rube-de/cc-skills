# Oasis CLI Reference

Complete command reference for the Oasis CLI (`oasis`).

## Installation

```bash
# Linux
wget https://github.com/oasisprotocol/cli/releases/latest/download/oasis_cli_linux_amd64.tar.gz
tar xf oasis_cli_linux_amd64.tar.gz && sudo mv oasis /usr/local/bin/

# macOS
brew install oasisprotocol/tools/oasis

# GitHub Action
# uses: oasisprotocol/setup-cli-action

# Self-update
oasis update

# Verify
oasis --version
```

### Configuration Locations

| Platform | Path |
|----------|------|
| Linux | `$HOME/.config/oasis/cli.toml` |
| macOS | `~/Library/Application Support/oasis/cli.toml` |
| Windows | `%USERPROFILE%\AppData\Local\oasis\cli.toml` |

Wallet files stored as `<account_name>.wallet` (password-encrypted JSON) in the same directory.

## Wallet Management

### Create Wallet

```bash
# Ed25519 (Oasis native)
oasis wallet create <name>

# secp256k1 (EVM-compatible for Sapphire/Emerald)
oasis wallet create <name> --algorithm secp256k1-bip44

# Import from mnemonic
oasis wallet import <name>

# Import from private key file
oasis wallet import <name> --secret-key <file>

# Import from PEM file (validators)
oasis wallet import-file <name> <pem-file>

# Create Ledger-backed account
oasis wallet create <name> --kind ledger
```

### Supported Algorithms

| Algorithm | Usage |
|-----------|-------|
| `ed25519-adr8` | Default, Oasis native (consensus + Cipher) |
| `secp256k1-bip44` | EVM-compatible (Sapphire/Emerald), BIP-44 with ETH coin type |
| `ed25519-raw` | Direct Base64 import (validators) |
| `ed25519-legacy` | Legacy 5-component path (Ledger) |
| `sr25519-adr8` | Alternative ParaTime signature scheme |
| `secp256k1-raw`, `sr25519-raw` | Direct import, no derivation |

### Test Accounts (DO NOT use on public networks)

`test:alice` (Ed25519), `test:bob` (Ed25519), `test:charlie` (Secp256k1), `test:dave` (Secp256k1), `test:erin` (Sr25519), `test:frank` (Sr25519)

### List & Manage Wallets

```bash
oasis wallet list
oasis wallet show <name>
oasis wallet rename <old> <new>
oasis wallet remove <name>
oasis wallet export <name>         # Export private key
oasis wallet set-default <name>
oasis wallet remote-signer <name> <socket>  # Bind to oasis-node
```

## Account Operations

### Show Account

```bash
# Show balance and details
oasis account show <name>

# Show on specific network
oasis account show <name> --network testnet

# Show with ParaTime balance
oasis account show <name> --network testnet --paratime sapphire
```

### Transfer Tokens

```bash
# Consensus layer transfer
oasis account transfer <amount> <to> --network testnet --no-paratime

# ParaTime transfer (within Sapphire)
oasis account transfer <amount> <to> --network testnet --paratime sapphire
```

### Deposit / Withdraw (Consensus <-> ParaTime)

```bash
# Deposit from consensus into ParaTime
oasis account deposit <amount> --network testnet --paratime sapphire

# Withdraw from ParaTime to consensus
oasis account withdraw <amount> --network testnet --paratime sapphire
```

### Delegate / Undelegate Stake

```bash
oasis account delegate <amount> <validator> --network mainnet
oasis account undelegate <shares> <validator> --network mainnet
```

### Allow / Withdraw from Allowance

```bash
oasis account allow <amount> <beneficiary>

# Burn tokens permanently
oasis account burn <amount>

# Entity management (validators)
oasis account entity init
oasis account entity register <entity.json>
oasis account entity deregister
oasis account node-unfreeze

# Convert public key to address
oasis account from-public-key <pubkey>
```

### Output to File (Unsigned)

```bash
# Generate unsigned transaction
oasis account transfer 1.0 <to> --output-file tx.json --unsigned

# Non-interactive mode
oasis account transfer 1.0 <to> -y
```

## Network Management

```bash
# List configured networks
oasis network list

# Show network status
oasis network show --network testnet

# Show specific entity
oasis network show <entity-id> --network testnet

# Add local network (auto-discovers ParaTimes)
oasis network add-local <name> <unix-socket-path>

# Set default network
oasis network set-default <name>

# Change RPC endpoint
oasis network set-rpc <network> <url>

# Add network with custom context
oasis network add <name> <rpc> [chain-context]

# Show network status
oasis network status

# Network inspection
oasis network show entities               # List registered entities
oasis network show nodes                  # List registered nodes
oasis network show parameters             # Show consensus parameters
oasis network show paratimes              # List registered ParaTimes
oasis network show validators             # Show validator set
oasis network show native-token           # Token info, supply, thresholds
oasis network show gas-costs              # Min gas costs per tx type
oasis network show committees             # Runtime committees

# Governance
oasis network governance list
oasis network governance show <proposal-id>
oasis network governance show <proposal-id> --show-votes
oasis network governance cast-vote <proposal-id> yes|no|abstain
```

## ParaTime Management

### List & Configure

```bash
# List all configured ParaTimes
oasis paratime list

# Add a ParaTime
oasis paratime add <network> <name> <paratime-id> --num-decimals 18 --symbol TEST

# Remove a ParaTime
oasis paratime remove <network> <name>

# Set default ParaTime for a network
oasis paratime set-default <network> <name>
```

### Inspect Blocks & Transactions

```bash
# Show block details
oasis paratime show <round> --network testnet --paratime sapphire

# Show latest block
oasis paratime show latest --network testnet --paratime sapphire

# Show transaction in block (by index or hash)
oasis paratime show <round> <tx-index-or-hash>

# Show ParaTime parameters
oasis paratime show parameters --network testnet --paratime sapphire

# Show events in a block
oasis paratime show events --round <round>
```

### Validator Statistics

```bash
# Last block statistics
oasis paratime statistics

# Last N blocks
oasis paratime statistics -<N>

# Specific range
oasis paratime statistics <start-round> <end-round>

# Export to CSV
oasis paratime statistics -o stats.csv
```

### Denomination Management

```bash
# Set denomination info
oasis paratime denom set <network> <paratime> <denom> <decimals> --symbol <SYM>

# Set native denomination
oasis paratime denom set-native <network> <paratime> <denom> <decimals>

# Remove denomination
oasis paratime denom remove <network> <paratime> <denom>
```

## ROFL (Runtime OFfchain Logic)

### App Lifecycle

```bash
# Initialize new ROFL app
oasis rofl init [app-name]

# Create on-chain registration (requires ~100 TEST deposit)
oasis rofl create --network testnet --account <wallet>

# Build deterministic ORC bundle
oasis rofl build

# Update on-chain config (after policy/manifest changes)
oasis rofl update

# Deploy to marketplace node
oasis rofl deploy
oasis rofl deploy --show-offers   # See available offers first

# Upgrade existing deployment
oasis rofl upgrade

# Remove app registration
oasis rofl remove
```

### Secret Management

```bash
# Set a secret (pipe value via stdin)
echo -n "my-secret-value" | oasis rofl secret set SECRET_NAME -

# Bulk import from .env file
oasis rofl secret import .env

# Check if secret exists
oasis rofl secret get SECRET_NAME

# Remove a secret
oasis rofl secret rm SECRET_NAME

# Replace existing secret
echo -n "new-value" | oasis rofl secret set SECRET_NAME - --force
```

### Machine Management

```bash
# Show machine status, proxy URLs, deployment info
oasis rofl machine show

# View app logs (stored unencrypted on node — don't log secrets)
oasis rofl machine logs

# Extend rental period
oasis rofl machine top-up --term hour --term-count 4
```

### Additional ROFL Commands

```bash
# Show app identity (after build)
oasis rofl identity

# Show app info, policy, instances
oasis rofl show

# Get trust root
oasis rofl trust-root

# Restart machine
oasis rofl machine restart
oasis rofl machine restart --wipe-storage

# Stop machine
oasis rofl machine stop

# Cancel rental permanently
oasis rofl machine remove
```

## Transaction Tools

```bash
# Decode and verify a transaction file
oasis transaction show <filename.json>

# Sign a transaction
oasis transaction sign <filename.json>

# Submit (broadcast) a transaction
oasis transaction submit <filename.json> --network testnet --paratime sapphire
```

## Address Book

```bash
# Add entry
oasis addressbook add <name> <address>

# List all entries
oasis addressbook list

# Show entry details
oasis addressbook show <name>

# Rename entry
oasis addressbook rename <old> <new>

# Remove entry
oasis addressbook remove <name>
```

## Common Flags

| Flag | Description |
|------|-------------|
| `--network <name>` | Target network (mainnet, testnet) |
| `--paratime <name>` | Target ParaTime (sapphire, emerald, cipher) |
| `--no-paratime` | Operate on consensus layer directly |
| `--account <name>` | Wallet account to use |
| `-y` | Non-interactive mode (skip confirmations) |
| `--output-file <path>` | Save transaction to file instead of broadcasting |
| `--unsigned` | Generate unsigned transaction |
| `--format json` | JSON output format |

## Network Endpoints

### Mainnet
- Consensus gRPC: `grpc.oasis.io:443`
- Sapphire RPC: `https://sapphire.oasis.io` (Chain ID: 0x5afe / 23294)
- Emerald RPC: `https://emerald.oasis.io` (Chain ID: 0xa515 / 42261)

### Testnet
- Consensus gRPC: `grpc.testnet.oasis.io:443`
- Sapphire RPC: `https://testnet.sapphire.oasis.io` (Chain ID: 0x5aff / 23295)
- Emerald RPC: `https://testnet.emerald.oasis.io` (Chain ID: 0xa516 / 42262)
