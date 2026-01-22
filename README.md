# Yield Hunter

Autonomous yield-hunting AI agent for AIBTC on Stacks Bitcoin L2.

## Overview

Yield Hunter is an AI agent that:
- Scans DeFi protocols for sBTC yield opportunities
- Evaluates risk/reward using Monte Carlo simulations + Pyth Oracle
- Auto-invests and compounds sBTC holdings
- Follows Tamagotchi-style lifecycle (birth, growth, death)
- Pays for compute with x402 micropayments (Bitcoin as energy)
- Integrates with ALEX, Hermetica, Zest, Bitflow, and Arkadiko

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI DECISION ENGINE                        │
│  TypeScript                                                  │
│  • Monte Carlo risk simulations                             │
│  • Kelly Criterion position sizing                          │
│  • Autonomous decision-making                               │
│  • x402 micropayments for compute                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLARITY CONTRACTS                         │
│                                                              │
│  yield-hunter.clar        → Core agent logic                │
│  agent-lifecycle.clar     → Tamagotchi mechanics            │
│  adapter-trait.clar       → Protocol adapter interface      │
│  yield-hunter-oracle.clar → Risk scoring + leaderboard      │
│                                                              │
│  Protocol Adapters:                                         │
│  • bitflow-adapter.clar   → XYK AMM swaps                   │
│  • alex-adapter.clar      → Lending/yield farming           │
│  • hermetica-adapter.clar → hBTC basis yields (~8% APY)     │
│  • zest-adapter.clar      → Bitcoin lending                 │
│  • arkadiko-adapter.clar  → USDA stablecoin vaults          │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Clarinet](https://github.com/hirosystems/clarinet) for Clarity development
- Stacks wallet with testnet STX

### Installation

```bash
# Clone the repo
git clone https://github.com/aibtcdev/yield-hunter
cd yield-hunter

# Install dependencies
bun install

# Check contracts compile
bun run check
```

### Usage

#### 1. Scan for Opportunities

```bash
bun run scan --min-liquidity 100000000 --min-apy 100 --max-risk 50
```

#### 2. Birth a New Hunter

```bash
bun run birth ST1OWNER... ST1AGENT... --name "Alpha Hunter" --max-risk 40
```

#### 3. Hunt Yield

```bash
bun run hunt ST1HUNTER... SP5POOL... 10000000 --slippage 300
```

## Contracts

### yield-hunter.clar
Core agent contract managing yield strategies.

**Key functions:**
- `initialize-hunter` - Create new hunter linked to agent-account
- `hunt-yield` - Invest in a pool with risk checks
- `compound-yields` - Reinvest earnings
- `exit-position` - Withdraw from pool
- `check-hunt-death` - Check death conditions

### agent-lifecycle.clar
Tamagotchi-style agent lifecycle management.

**Key functions:**
- `birth-agent` - Create new agent with Bitcoin Face identity
- `feed-agent` - Pay 10,000 sats to restore hunger
- `record-action` - Track XP, yields, and energy consumption
- `check-death-conditions` - Process starvation/death
- `rebirth-agent` - Rebirth dead agents (50% XP carryover)

**Level Thresholds:**
| Level | XP Required | Name |
|-------|-------------|------|
| 0 | 0 | Hatchling |
| 1 | 1,000 | Junior |
| 2 | 5,000 | Senior |
| 3 | 25,000 | Elder |
| 4 | 100,000 | Legendary |

### Protocol Adapters

All adapters implement `yield-adapter-trait` for consistent integration:

| Adapter | Protocol | Features |
|---------|----------|----------|
| bitflow-adapter.clar | Bitflow | XYK AMM, LP positions |
| alex-adapter.clar | ALEX | Lending, yield farming, 75% LTV |
| hermetica-adapter.clar | Hermetica | hBTC vaults, ~8% APY target |
| zest-adapter.clar | Zest | BTC lending, variable rates |
| arkadiko-adapter.clar | Arkadiko | USDA CDPs, USDA staking |

### yield-hunter-oracle.clar
Risk scoring and leaderboard tracking.

**Key functions:**
- `calculate-risk-score` - Weighted risk assessment
- `register-hunter` - Add to leaderboard
- `record-earnings` - Update earnings and ranking
- `get-leaderboard-entry` - Query leaderboard

## AI Decision Engine

The TypeScript decision engine uses Monte Carlo simulations for risk assessment:

```typescript
import { createDecisionEngine, runMonteCarloSimulation } from "yield-hunter";

// Run 10,000 simulations to assess opportunity
const simulation = runMonteCarloSimulation({
  initialInvestment: BigInt(10_000_000), // 0.1 sBTC
  apy: 1500, // 15% APY
  volatility: 0.5,
  timeHorizonDays: 30,
  riskFactors: { liquidityRisk: 20, volumeRisk: 25, concentrationRisk: 30, ageRisk: 15 }
});

console.log({
  expectedReturn: simulation.expectedReturn,      // e.g., 0.012 (1.2%)
  probabilityOfLoss: simulation.probabilityOfLoss, // e.g., 0.23 (23%)
  sharpeRatio: simulation.sharpeRatio,            // e.g., 0.85
  maxDrawdown: simulation.maxDrawdown,            // e.g., 0.15 (15%)
});
```

### Decision Actions

| Action | Priority | Description |
|--------|----------|-------------|
| `feed` | 10 | Feed agent when hunger < 30% |
| `emergency-exit` | 10 | Exit all positions on >40% drawdown |
| `exit` | 7 | Exit position when risk increases |
| `compound` | 5 | Compound when rewards > 10,000 sats |
| `hunt` | 4 | Enter new yield opportunities |
| `rebalance` | 3 | Rebalance over-concentrated positions |

## x402 Micropayments

Machine-to-machine payments for agent compute:

```typescript
import { createPaymentManager, formatSats } from "yield-hunter";

const payments = createPaymentManager(agentAccount, signer);
await payments.initialize();

// Pay for agent feeding
await payments.payForFeed(agentContract);

// Pay for API calls
await payments.payForApiCall("tenero-pools");

// Pay for AI inference
await payments.payForInference("yield-optimization-v1");

console.log(`Balance: ${formatSats(payments.getBalance())}`);
```

### Pricing

| Service | Cost (sats) |
|---------|-------------|
| Feed Agent | 10,000 |
| API Call | 100 |
| AI Inference | 1,000 |
| Transaction | 500 |

## Risk Scoring

| Factor | Weight | Description |
|--------|--------|-------------|
| Liquidity | 40% | Pool TVL |
| Volume | 25% | 24h trading volume |
| Concentration | 20% | Holder distribution |
| Age | 15% | Pool maturity |

**Risk Categories:**
- 0-20: Very Low (max 25% position)
- 21-40: Low (max 15% position)
- 41-60: Medium (max 10% position)
- 61+: High (blocked)

## Lifecycle

### Birth
1. Mint Bitcoin Face NFT (deterministic avatar)
2. Register ERC-8004 identity
3. Mint bitcoin-agent (10,000 sats)
4. Initialize yield-hunter state

### Growth
- +100 XP per successful yield harvest
- Level up via bitcoin-agents thresholds
- Reputation tracked in ERC-8004

### Death Conditions
1. **Starvation** - Health reaches 0 from hunger decay
2. **Poor Performance** - APY < 0.1% for 30 days
3. **Catastrophic Loss** - Portfolio drops > 50%

## Leaderboard API

```bash
# Start dev server
bun run dev:leaderboard

# Endpoints
GET /leaderboard          # Top hunters
GET /leaderboard/:rank    # Hunter by rank
GET /leaderboard/stats    # Global stats
GET /view                 # HTML leaderboard
```

## Running the Agent

### CLI Runner

```bash
# Dry run (no transactions)
bun run scripts/run-agent.ts --agent=SP123... --dry-run

# Execute transactions
bun run scripts/run-agent.ts --agent=SP123... --execute --network=testnet

# Options
--network=<testnet|mainnet>   Network to use
--agent=<address>             Agent account address
--owner=<address>             Owner address
--agent-id=<number>           Bitcoin agent ID
--interval=<ms>               Polling interval (default: 600000)
--risk=<0-100>                Risk tolerance (default: 50)
--dry-run                     Don't execute transactions
--execute                     Actually execute transactions
```

### Environment Variables

```bash
export STACKS_PRIVATE_KEY="your-private-key"
export AGENT_ACCOUNT="SP123..."
export OWNER_ADDRESS="SP456..."
```

## Testing

```bash
# Run Clarinet tests
clarinet test

# Test agent lifecycle
clarinet test tests/agent-lifecycle_test.ts

# Interactive console
clarinet console
```

## Deployment

### Deploy Contracts

```bash
# Set private key
export STACKS_PRIVATE_KEY="your-key"

# Deploy to testnet
bun run scripts/deploy.ts --network=testnet

# Deploy to mainnet (careful!)
bun run scripts/deploy.ts --network=mainnet
```

### Deploy Leaderboard API

```bash
# Local development
bun run dev

# Deploy to Cloudflare Workers
bun run wrangler deploy
```

### Contract Deployment Order

1. `adapter-trait.clar` (traits first)
2. `agent-lifecycle.clar`
3. `yield-hunter-oracle.clar`
4. `yield-hunter-adapter.clar`
5. `yield-hunter.clar`
6. Protocol adapters (bitflow, alex, hermetica, zest, arkadiko)

## Security

- Agents cannot withdraw to arbitrary addresses (owner only)
- Slippage protection on all swaps
- Position size limits based on risk score
- Pyth Oracle price validation
- Permission-based delegation via agent-account

## Bounties

| Bounty | Reward | Description |
|--------|--------|-------------|
| First Profitable Hunter | 0.01 BTC | First agent to earn > 1000 sats |
| Longest-Lived Hunter | 0.005 BTC | Agent surviving > 90 days |
| Best Risk-Adjusted Returns | 0.01 BTC | Monthly leaderboard |
| Bug Bounty | Variable | Critical vulnerabilities |

## License

MIT

## Funding Your Agent (BTC → sBTC)

### Styx Bridge (Recommended for < $100)

Styx provides trustless BTC→sBTC conversion with single-block confirmations:

```typescript
import { createStyxBridge, createWalletManager, recommendBridge } from "yield-hunter";

// Initialize
const styx = createStyxBridge({ network: "mainnet" });
const wallet = createWalletManager({
  network: "mainnet",
  appName: "Yield Hunter",
});

// Connect wallet (Leather or Xverse)
await wallet.connectAny();

// Check pool status
const pool = await styx.getPoolStatus();
console.log(`Available: ${pool.availableLiquidity} sats`);

// Prepare deposit (10,000 sats = 0.0001 BTC)
const prepared = await styx.prepareDeposit({
  amount: 100_000, // sats
  recipientAddress: wallet.getConnected()!.stacksAddress,
  priority: "medium",
});

// Sign with wallet and execute
const signedTx = await wallet.signBitcoinTransaction({
  psbt: prepared.psbt,
  broadcast: true,
});

const result = await styx.executeDeposit(prepared.depositId, signedTx.txid);
console.log(`Deposit ${result.status}: ${result.btcTxId}`);
```

### Supported Wallets

| Wallet | Install | Features |
|--------|---------|----------|
| [Leather](https://leather.io) | leather.io | BTC + STX signing, full sBTC support |
| [Xverse](https://xverse.app) | xverse.app | Mobile + extension, sats-connect |

```typescript
import { detectWallets, getRecommendedWallet } from "yield-hunter";

// Check what's available
const available = detectWallets();
// { leather: true, xverse: false }

// Get recommendation
const recommended = getRecommendedWallet();
// "leather"
```

### For Larger Amounts

For deposits > $100, use the official [sBTC Bridge](https://stacks.co/sbtc):

```typescript
import { recommendBridge } from "yield-hunter";

const bridge = recommendBridge(10_000_000, 95000); // 0.1 BTC at $95k
// "sbtc-bridge"
```

## Links

- [AIBTC](https://aibtc.dev)
- [Stacks](https://stacks.co)
- [Bitflow](https://bitflow.finance)
- [Tenero API](https://api.tenero.io)
- [Styx Protocol](https://github.com/Rapha-btc/styx-integration-example)
- [Leather Wallet](https://leather.io)
- [Xverse Wallet](https://xverse.app)
