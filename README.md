# Yield Hunter

Autonomous yield-hunting AI agent for AIBTC on Stacks Bitcoin L2.

## Overview

Yield Hunter is an AI agent that:
- Scans DeFi protocols for sBTC yield opportunities
- Evaluates risk/reward using on-chain data + Pyth Oracle
- Auto-invests and compounds sBTC holdings
- Follows Tamagotchi-style lifecycle (birth, growth, death)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI DECISION ENGINE                        │
│  TypeScript + LLM                                            │
│  • Scan pools via Tenero API                                │
│  • Calculate risk scores                                     │
│  • Optimize yield paths                                      │
│  • Trigger on-chain actions                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLARITY CONTRACTS                         │
│                                                              │
│  yield-hunter.clar        → Core agent logic                │
│  yield-hunter-adapter.clar → Bitflow swap adapter           │
│  yield-hunter-oracle.clar  → Risk scoring + leaderboard     │
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

### yield-hunter-adapter.clar
Swap adapter for Bitflow XYK pools.

**Key functions:**
- `swap-sbtc-for-y` - Swap sBTC for another token
- `add-liquidity-sbtc` - Enter LP position
- `remove-liquidity-sbtc` - Exit LP position

### yield-hunter-oracle.clar
Risk scoring and leaderboard tracking.

**Key functions:**
- `calculate-risk-score` - Weighted risk assessment
- `register-hunter` - Add to leaderboard
- `record-earnings` - Update earnings and ranking
- `get-leaderboard-entry` - Query leaderboard

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

## Testing

```bash
# Run Clarinet tests
bun run test

# Interactive console
bun run console
```

## Deployment

### Testnet

```bash
# Deploy contracts
bun run deploy:contracts --network testnet

# Deploy leaderboard API
bun run deploy:leaderboard
```

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

## Links

- [AIBTC](https://aibtc.dev)
- [Stacks](https://stacks.co)
- [Bitflow](https://bitflow.finance)
- [Tenero API](https://api.tenero.io)
