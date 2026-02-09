# Sapphire ParaTime Development

Sapphire is the confidential EVM-compatible ParaTime on the Oasis Network, providing end-to-end encrypted smart contract execution.

## Key Properties

- **EVM-compatible**: Deploy standard Solidity contracts
- **Confidential**: Contract state encrypted at rest, transactions encrypted end-to-end
- **6-second finality**
- **99%+ lower fees** than Ethereum
- **18 decimal places** (like Ethereum, unlike 9 for Oasis consensus)
- **Secure randomness**: On-chain cryptographic RNG

## Network Info

| Network | Chain ID | RPC URL | Explorer |
|---------|----------|---------|----------|
| Mainnet | 23294 (0x5afe) | `https://sapphire.oasis.io` | explorer.oasis.io/mainnet/sapphire |
| Testnet | 23295 (0x5aff) | `https://testnet.sapphire.oasis.io` | explorer.oasis.io/testnet/sapphire |

## Hardhat Setup

```bash
npm install -D @oasisprotocol/sapphire-hardhat
```

```js
// hardhat.config.js — MUST be imported BEFORE all other plugins
import '@oasisprotocol/sapphire-hardhat';
import '@nomicfoundation/hardhat-toolbox';

export default {
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

The `@oasisprotocol/sapphire-hardhat` plugin automatically wraps the provider to handle encryption. It **must** be imported before other plugins.

## NPM Packages

| Package | Name | Purpose |
|---------|------|---------|
| Client | `@oasisprotocol/sapphire-paratime` | Core EIP-1193 provider wrapper |
| Contracts | `@oasisprotocol/sapphire-contracts` | Solidity privacy library |
| Hardhat | `@oasisprotocol/sapphire-hardhat` | Hardhat plugin |
| Ethers v6 | `@oasisprotocol/sapphire-ethers-v6` | Ethers.js v6 integration |
| Viem v2 | `@oasisprotocol/sapphire-viem-v2` | Viem v2 integration |
| Wagmi v2 | `@oasisprotocol/sapphire-wagmi-v2` | Wagmi v2 integration |
| Go | `github.com/oasisprotocol/sapphire-paratime/clients/go` | Go client |
| Python | `sapphirepy` | Python client |

## JavaScript/TypeScript SDK

### Installation

```bash
npm install @oasisprotocol/sapphire-paratime ethers
```

### Wrapping a Provider (ethers v6)

```typescript
import { wrap } from '@oasisprotocol/sapphire-paratime';
import { ethers } from 'ethers';

// Wrap the provider for confidential transactions
const provider = wrap(new ethers.JsonRpcProvider('https://testnet.sapphire.oasis.io'));
const signer = wrap(new ethers.Wallet(privateKey, provider));

// Now all transactions and calls are automatically encrypted
const contract = new ethers.Contract(address, abi, signer);
```

### Wrapping a Provider (ethers v5)

```typescript
import { wrap } from '@oasisprotocol/sapphire-paratime';
import { ethers } from 'ethers';

const provider = wrap(new ethers.providers.JsonRpcProvider('https://testnet.sapphire.oasis.io'));
const signer = wrap(new ethers.Wallet(privateKey).connect(provider));
```

### Key Point

Without wrapping, transactions are sent in **plaintext** — always wrap the provider/signer.

## Go SDK

### Installation

```bash
go get github.com/oasisprotocol/sapphire-paratime/clients/go
```

### Usage with go-ethereum

```go
import (
    "context"

    "github.com/ethereum/go-ethereum/accounts/abi/bind"
    "github.com/ethereum/go-ethereum/ethclient"

    sapphire "github.com/oasisprotocol/sapphire-paratime/clients/go"
)

// Connect and wrap client
client, _ := ethclient.Dial(sapphire.Networks[sapphire.ChainIDTestnet].DefaultGateway)
backend, _ := sapphire.WrapClient(client, func(digest [32]byte) ([]byte, error) {
    return crypto.Sign(digest[:], privateKey)
})

// Use wrapped backend for contract interactions
nft, _ := NewNft(contractAddr, backend)

// IMPORTANT: Use backend.Transactor() for write transactions
txOpts := backend.Transactor(senderAddr)
tx, _ := nft.Transfer(txOpts, tokenId, recipient)
receipt, _ := bind.WaitMined(context.Background(), client, tx)

// For confidential reads, specify From address
balance := nft.BalanceOf(&bind.CallOpts{From: senderAddr}, targetAddr)
```

**WARNING**: Forgetting to use `backend.Transactor()` sends transactions in plaintext!

### Bring Your Own Signer

```go
sapphireTestnetChainId := 0x5aff
packedTx := sapphire.PackTx(tx, sapphire.NewCipher(sapphireTestnetChainId))
signedTx := sign(packedTx)
_ = client.SendTransaction(ctx, signedTx)
```

### Wrapping an EIP-1193 Provider (Browser dApps)

```typescript
import { wrapEthereumProvider } from '@oasisprotocol/sapphire-paratime';

// MetaMask or any injected provider
const provider = wrapEthereumProvider(window.ethereum);
```

The wrapper automatically encrypts `eth_call`, `eth_estimateGas`, and `eth_signTransaction` JSON-RPC calls.

## Python SDK

### Installation

```bash
pip install sapphirepy
```

### Usage with Web3.py

```python
from sapphirepy import wrap
from web3 import Web3

# Wrap the provider
w3 = wrap(Web3(Web3.HTTPProvider('https://testnet.sapphire.oasis.io')))

# Transactions are now automatically encrypted
```

## Sapphire Contracts (Solidity)

### Installation

```bash
npm install @oasisprotocol/sapphire-contracts
```

### Subcall Library

The `Subcall` library provides access to Oasis-specific functionality from Solidity:

```solidity
import {Subcall} from "@oasisprotocol/sapphire-contracts/contracts/Subcall.sol";

contract MyContract {
    bytes21 private roflAppID;

    // Verify a transaction came from a ROFL app
    function processROFLData(uint256 data) external {
        Subcall.roflEnsureAuthorizedOrigin(roflAppID);
        // Only ROFL app can reach here
    }
}
```

### On-Chain Randomness

Sapphire provides cryptographically secure randomness:

```solidity
// Available in Sapphire — NOT available on other EVM chains
bytes32 random = keccak256(abi.encodePacked(block.prevrandao));
```

Or use the Sapphire precompile for better randomness:

```solidity
import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

bytes memory random = Sapphire.randomBytes(32, "");
```

### Confidential State Access Patterns

```solidity
contract ConfidentialVoting {
    // Private state — encrypted at rest, only accessible to contract logic
    mapping(address => uint256) private votes;
    uint256 private totalVotes;

    // External view functions are confidential queries (encrypted response)
    function getMyVote() external view returns (uint256) {
        return votes[msg.sender];
    }

    // Write functions are confidential transactions (encrypted input)
    function castVote(uint256 choice) external {
        votes[msg.sender] = choice;
        totalVotes++;
    }
}
```

## Cross-Chain: Oasis Privacy Layer (OPL)

Sapphire can serve as a privacy layer for other chains via bridges:

- **Hyperlane Protocol**: Cross-chain messaging with Sapphire as confidential backend
- **Router Protocol**: Cross-chain asset transfers with privacy
- **Celer**: Message-based cross-chain integration

## Foundry Integration

```bash
# Deploy with Foundry (basic — no auto-wrapping)
forge create --rpc-url https://testnet.sapphire.oasis.io \
  --private-key $PRIVATE_KEY \
  src/MyContract.sol:MyContract
```

Note: Foundry does not automatically wrap transactions for Sapphire confidentiality. Use the JS/TS SDK or Hardhat plugin for confidential interactions.

## Remix IDE

Sapphire can be used with Remix by adding the network to MetaMask and connecting Remix via Injected Provider. The `@oasisprotocol/sapphire-paratime` npm package handles encryption in browser-based dApps.

## Contract Verification

Verify contracts on the Oasis Explorer:

```bash
# Using Hardhat
npx hardhat verify --network sapphire_testnet <contract-address> <constructor-args>
```

## Testing

### Local Development

Use `@oasisprotocol/sapphire-localnet` for local testing:

```bash
docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-localnet
```

### Hardhat Tests

```bash
npx hardhat test --network sapphire_testnet
```

## Common Pitfalls

1. **Forgetting to wrap provider**: Transactions go in plaintext without the Sapphire wrapper
2. **Wrong decimal places**: Sapphire uses 18 decimals (not 9 like consensus)
3. **Import order**: `@oasisprotocol/sapphire-hardhat` must be imported FIRST in Hardhat config
4. **msg.sender in views**: Confidential `view` calls should specify `{from: address}` for access control
5. **Gas estimation**: May differ from standard EVM due to encryption overhead
