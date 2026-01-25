# Month One: Yield Hunter MVP

Build autonomous sBTC yield agents on aibtc.com's stack.

## Quick Start

```bash
# Install dependencies
bun install

# Run x402 paid API locally
bun run dev:x402

# Deploy to Cloudflare
bun run deploy:x402

# Run MCP server for Claude Code
bun run mcp
```

## Components Built

### 1. x402 Paid API (`src/api/x402-server.ts`)

Paid endpoint charging 10,000 sats (0.0001 sBTC) per yield optimization query.

**Endpoints:**
- `GET /health` - Health check
- `GET /api/cost` - Get query cost and treasury address
- `POST /api/yield` - Paid yield optimization (requires X-402 headers)
- `GET /api/earnings` - View earnings tracker
- `GET /api/stats` - Protocol and service stats

**Payment Flow:**
```bash
# 1. Get cost
curl https://yield-hunter-x402.workers.dev/api/cost

# 2. Create payment proof (signed with Stacks wallet)

# 3. Submit paid request
curl -X POST https://yield-hunter-x402.workers.dev/api/yield \
  -H "X-402-Payment: {sender, amount, nonce, signature, timestamp}" \
  -H "X-402-Sender: SP..." \
  -d '{"amount": 100000, "riskTolerance": "medium"}'
```

### 2. MCP Server for Claude Code (`src/mcp/`)

Adds yield hunting tools to Claude Code.

**Setup:**
```bash
# Add to ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "yield-hunter": {
      "command": "bun",
      "args": ["run", "/path/to/yield-hunter/src/mcp/server.ts"]
    }
  }
}
```

**Tools:**
| Tool | Description |
|------|-------------|
| `yield_scan` | Scan all protocols for sBTC yields |
| `yield_optimize` | Get optimal allocation strategy |
| `yield_portfolio` | Check positions for address |
| `yield_quote` | Quote deposit to protocol |
| `yield_compare` | Side-by-side comparison |

### 3. Earnings Tracker

Built into x402 server. Query earnings:

```bash
curl https://yield-hunter-x402.workers.dev/api/earnings
```

Returns:
```json
{
  "totalQueries": 45,
  "totalEarned": {
    "sats": 450000,
    "btc": "0.00450000"
  },
  "byDay": [...]
}
```

### 4. Protocol Integrations

Scans these DeFi protocols:
- **Zest Protocol** - sBTC lending (~4.5% APY)
- **Bitflow** - sBTC liquidity pools (~8-12% APY)
- **Hermetica** - hBTC basis trades (~8% APY)
- **ALEX** - sBTC vaults (~5.8% APY)

## Deployment

### x402 API to Cloudflare

```bash
# Testnet
bun run deploy:x402

# Mainnet (edit wrangler.x402.toml first)
bun run wrangler deploy --config wrangler.x402.toml --env production
```

### Agent on Stacks Testnet

```bash
# Dry run (no transactions)
STACKS_PRIVATE_KEY=... bun run start --dry-run

# Live on testnet
STACKS_PRIVATE_KEY=... bun run start --network=testnet
```

## Files Created

```
src/
├── api/
│   └── x402-server.ts    # x402 paid API
├── mcp/
│   ├── server.ts         # MCP entry point
│   └── yield-hunter-tools.ts  # MCP tool definitions
wrangler.x402.toml        # Cloudflare Worker config
scripts/
└── setup-mcp.sh          # MCP setup helper
```

## Month One Checklist

- [x] MCP server setup
- [x] x402 paid API endpoint
- [x] Yield scanner (Zest, Bitflow, Hermetica, ALEX)
- [x] Earnings tracker
- [x] Cloudflare Worker deployment config
- [ ] Test on Stacks testnet (needs wallet funding)
- [ ] Verify x402 payment flow with aibtc.dev relay

## Next Steps

1. **Fund testnet wallet** - Get STX from faucet
2. **Test full flow** - Create intent, scan yields, execute deposit
3. **Deploy x402 API** - `bun run deploy:x402`
4. **Publish MCP server** - Add to Claude Code config
5. **Monitor earnings** - Watch `/api/earnings` endpoint

## Cost Structure

| Service | Cost |
|---------|------|
| Yield query | 10,000 sats (0.0001 sBTC) |
| API call | 100 sats |
| Agent feed | 10,000 sats |
| AI inference | 1,000 sats |
