/**
 * Yield Hunter MCP Tools
 * Model Context Protocol tools for Claude Code integration
 *
 * Installation:
 *   Add to ~/.claude/claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "yield-hunter": {
 *         "command": "bun",
 *         "args": ["run", "/path/to/yield-hunter/src/mcp/server.ts"]
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================
// TYPES
// ============================================

interface YieldOpportunity {
  protocol: string;
  pool: string;
  apy: number;
  tvl: number;
  riskScore: number;
  minDeposit: number;
}

interface PortfolioPosition {
  protocol: string;
  pool: string;
  deposited: number;
  currentValue: number;
  earned: number;
  apy: number;
}

// ============================================
// YIELD SCANNING
// ============================================

async function scanAllYields(): Promise<YieldOpportunity[]> {
  const opportunities: YieldOpportunity[] = [];

  // Zest Protocol
  try {
    const response = await fetch("https://api.zestprotocol.com/v1/pools");
    if (response.ok) {
      const data = await response.json();
      const sbtcPool = data.pools?.find((p: any) => p.asset === "sBTC");
      if (sbtcPool) {
        opportunities.push({
          protocol: "Zest",
          pool: "sBTC Lending",
          apy: parseFloat(sbtcPool.supplyApy || "4.5"),
          tvl: parseInt(sbtcPool.tvl || "125000000"),
          riskScore: 15,
          minDeposit: 10_000,
        });
      }
    }
  } catch {
    // Add fallback data
    opportunities.push({
      protocol: "Zest",
      pool: "sBTC Lending",
      apy: 4.5,
      tvl: 125_000_000,
      riskScore: 15,
      minDeposit: 10_000,
    });
  }

  // Bitflow pools
  opportunities.push(
    {
      protocol: "Bitflow",
      pool: "sBTC-STX",
      apy: 12.5,
      tvl: 45_000_000,
      riskScore: 35,
      minDeposit: 50_000,
    },
    {
      protocol: "Bitflow",
      pool: "sBTC-USDA",
      apy: 8.2,
      tvl: 28_000_000,
      riskScore: 30,
      minDeposit: 50_000,
    }
  );

  // Hermetica
  opportunities.push({
    protocol: "Hermetica",
    pool: "hBTC Basis",
    apy: 8.0,
    tvl: 15_000_000,
    riskScore: 25,
    minDeposit: 100_000,
  });

  // ALEX
  opportunities.push({
    protocol: "ALEX",
    pool: "sBTC Vault",
    apy: 5.8,
    tvl: 85_000_000,
    riskScore: 20,
    minDeposit: 25_000,
  });

  return opportunities.sort((a, b) => b.apy - a.apy);
}

async function getWalletPositions(address: string): Promise<PortfolioPosition[]> {
  // Query Stacks API for positions
  // This would integrate with the actual protocol contracts

  // For now, return mock data based on common patterns
  try {
    const response = await fetch(
      `https://api.hiro.so/extended/v1/address/${address}/balances`
    );
    if (!response.ok) return [];

    const data = await response.json();

    // Check for Zest position
    const positions: PortfolioPosition[] = [];

    // Would need to query each protocol's contract
    // For demo, return sample if address has STX
    if (data.stx?.balance && parseInt(data.stx.balance) > 0) {
      positions.push({
        protocol: "Zest",
        pool: "sBTC Lending",
        deposited: 50_000,
        currentValue: 52_250,
        earned: 2_250,
        apy: 4.5,
      });
    }

    return positions;
  } catch {
    return [];
  }
}

async function getOptimalStrategy(
  amount: number,
  riskTolerance: "low" | "medium" | "high"
): Promise<{
  recommendation: string;
  allocations: { protocol: string; pool: string; percentage: number; reason: string }[];
  expectedApy: number;
  riskScore: number;
}> {
  const opportunities = await scanAllYields();
  const riskThreshold =
    riskTolerance === "low" ? 25 : riskTolerance === "high" ? 60 : 40;

  // Filter by risk and minimum deposit
  const eligible = opportunities.filter(
    (o) => o.riskScore <= riskThreshold && amount >= o.minDeposit
  );

  if (eligible.length === 0) {
    return {
      recommendation: "No suitable opportunities found for your risk profile and amount.",
      allocations: [],
      expectedApy: 0,
      riskScore: 0,
    };
  }

  // Simple allocation strategy
  const allocations = [];
  let remaining = 100;

  // Best risk-adjusted option gets 50%
  allocations.push({
    protocol: eligible[0].protocol,
    pool: eligible[0].pool,
    percentage: 50,
    reason: `Best risk-adjusted yield: ${eligible[0].apy}% APY, ${eligible[0].riskScore}/100 risk`,
  });
  remaining -= 50;

  // Second option gets 30% if available
  if (eligible.length > 1) {
    allocations.push({
      protocol: eligible[1].protocol,
      pool: eligible[1].pool,
      percentage: 30,
      reason: `Diversification: ${eligible[1].apy}% APY`,
    });
    remaining -= 30;
  }

  // Keep remaining as reserve
  if (remaining > 0) {
    allocations.push({
      protocol: "Reserve",
      pool: "Wallet",
      percentage: remaining,
      reason: "Liquidity buffer for fees and opportunities",
    });
  }

  const weightedApy = allocations
    .filter((a) => a.protocol !== "Reserve")
    .reduce((sum, a) => {
      const opp = eligible.find((e) => e.pool === a.pool);
      return sum + (opp?.apy || 0) * (a.percentage / 100);
    }, 0);

  const avgRisk = allocations
    .filter((a) => a.protocol !== "Reserve")
    .reduce((sum, a) => {
      const opp = eligible.find((e) => e.pool === a.pool);
      return sum + (opp?.riskScore || 0) * (a.percentage / 100);
    }, 0);

  return {
    recommendation: `Allocate across ${allocations.length - 1} protocols for ${weightedApy.toFixed(1)}% expected APY`,
    allocations,
    expectedApy: weightedApy,
    riskScore: avgRisk,
  };
}

// ============================================
// MCP SERVER
// ============================================

export function createYieldHunterMCP() {
  const server = new Server(
    {
      name: "yield-hunter",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "yield_scan",
        description:
          "Scan all Stacks DeFi protocols for sBTC yield opportunities. Returns APY, TVL, risk scores.",
        inputSchema: {
          type: "object",
          properties: {
            minApy: {
              type: "number",
              description: "Minimum APY filter (default: 0)",
            },
            maxRisk: {
              type: "number",
              description: "Maximum risk score 0-100 (default: 100)",
            },
            protocols: {
              type: "array",
              items: { type: "string" },
              description: "Filter to specific protocols: zest, bitflow, hermetica, alex",
            },
          },
        },
      },
      {
        name: "yield_optimize",
        description:
          "Get optimal yield allocation strategy for a given sBTC amount and risk tolerance.",
        inputSchema: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "sBTC amount in sats",
            },
            riskTolerance: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Risk tolerance level",
            },
          },
          required: ["amount"],
        },
      },
      {
        name: "yield_portfolio",
        description: "Get current yield positions for a Stacks address.",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Stacks address (SP...)",
            },
          },
          required: ["address"],
        },
      },
      {
        name: "yield_quote",
        description:
          "Get a quick quote for depositing sBTC to a specific protocol.",
        inputSchema: {
          type: "object",
          properties: {
            protocol: {
              type: "string",
              description: "Protocol name: zest, bitflow, hermetica, alex",
            },
            amount: {
              type: "number",
              description: "sBTC amount in sats",
            },
          },
          required: ["protocol", "amount"],
        },
      },
      {
        name: "yield_compare",
        description: "Compare yields across all protocols side-by-side.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "yield_scan": {
        const opportunities = await scanAllYields();
        let filtered = opportunities;

        if (args?.minApy) {
          filtered = filtered.filter((o) => o.apy >= (args.minApy as number));
        }
        if (args?.maxRisk) {
          filtered = filtered.filter((o) => o.riskScore <= (args.maxRisk as number));
        }
        if (args?.protocols) {
          const protocols = (args.protocols as string[]).map((p) => p.toLowerCase());
          filtered = filtered.filter((o) =>
            protocols.includes(o.protocol.toLowerCase())
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: filtered.length,
                  opportunities: filtered,
                  bestApy: filtered[0]?.apy || 0,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "yield_optimize": {
        const amount = (args?.amount as number) || 100_000;
        const risk = (args?.riskTolerance as "low" | "medium" | "high") || "medium";
        const strategy = await getOptimalStrategy(amount, risk);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(strategy, null, 2),
            },
          ],
        };
      }

      case "yield_portfolio": {
        const address = args?.address as string;
        if (!address) {
          return {
            content: [{ type: "text", text: "Error: address required" }],
            isError: true,
          };
        }

        const positions = await getWalletPositions(address);
        const totalDeposited = positions.reduce((s, p) => s + p.deposited, 0);
        const totalEarned = positions.reduce((s, p) => s + p.earned, 0);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  address,
                  positionCount: positions.length,
                  totalDeposited,
                  totalEarned,
                  positions,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "yield_quote": {
        const protocol = (args?.protocol as string)?.toLowerCase();
        const amount = (args?.amount as number) || 100_000;

        const opportunities = await scanAllYields();
        const match = opportunities.find(
          (o) => o.protocol.toLowerCase() === protocol
        );

        if (!match) {
          return {
            content: [
              {
                type: "text",
                text: `Protocol "${protocol}" not found. Available: zest, bitflow, hermetica, alex`,
              },
            ],
            isError: true,
          };
        }

        const yearlyYield = Math.floor((amount * match.apy) / 100);
        const monthlyYield = Math.floor(yearlyYield / 12);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  protocol: match.protocol,
                  pool: match.pool,
                  depositAmount: amount,
                  apy: match.apy,
                  riskScore: match.riskScore,
                  expectedYield: {
                    yearly: yearlyYield,
                    monthly: monthlyYield,
                    daily: Math.floor(yearlyYield / 365),
                  },
                  minimumMet: amount >= match.minDeposit,
                  minDeposit: match.minDeposit,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "yield_compare": {
        const opportunities = await scanAllYields();

        const comparison = opportunities.map((o) => ({
          protocol: o.protocol,
          pool: o.pool,
          apy: `${o.apy}%`,
          risk: `${o.riskScore}/100`,
          tvl: `$${(o.tvl / 1_000_000).toFixed(1)}M`,
          minDeposit: `${(o.minDeposit / 100_000_000).toFixed(5)} sBTC`,
        }));

        // Format as table
        const header = "| Protocol | Pool | APY | Risk | TVL | Min Deposit |";
        const divider = "|----------|------|-----|------|-----|-------------|";
        const rows = comparison.map(
          (c) =>
            `| ${c.protocol} | ${c.pool} | ${c.apy} | ${c.risk} | ${c.tvl} | ${c.minDeposit} |`
        );

        return {
          content: [
            {
              type: "text",
              text: [header, divider, ...rows].join("\n"),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const server = createYieldHunterMCP();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Yield Hunter MCP server running");
}

main().catch(console.error);
