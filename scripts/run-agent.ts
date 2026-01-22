#!/usr/bin/env bun
/**
 * Yield Hunter Agent Runner
 * CLI tool to run the autonomous yield hunting agent
 */

import type {
  DecisionContext,
  DecisionResult,
  HunterState,
  BitcoinAgentState,
  Position,
  YieldOpportunity,
  MarketConditions,
  PortfolioSummary,
} from "../src/yield-hunter/types";

import { createDecisionEngine } from "../src/yield-hunter/engine/decision-engine";
import { createPaymentManager, formatSats } from "../src/yield-hunter/x402/micropayments";

// ============================================
// CONFIGURATION
// ============================================

interface AgentConfig {
  network: "mainnet" | "testnet";
  agentAccount: string;
  ownerAddress: string;
  agentId: number;
  pollingIntervalMs: number;
  riskTolerance: number;
  dryRun: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  network: "testnet",
  agentAccount: "",
  ownerAddress: "",
  agentId: 1,
  pollingIntervalMs: 600_000, // 10 minutes
  riskTolerance: 50,
  dryRun: true,
};

// ============================================
// API CLIENTS (MOCK)
// ============================================

async function fetchHunterState(agentAccount: string): Promise<HunterState> {
  // In production: call Stacks API to get contract state
  return {
    agentAccount,
    owner: DEFAULT_CONFIG.ownerAddress,
    agent: agentAccount,
    bitcoinAgentId: 1,
    identityId: 1,
    initializedAt: Date.now() - 86400000 * 30,
    totalInvested: BigInt(50_000_000), // 0.5 sBTC
    totalYieldsEarned: BigInt(2_500_000), // 0.025 sBTC
    totalPositionsOpened: 15,
    totalPositionsClosed: 12,
    lastHuntBlock: 150000,
    lastProfitableBlock: 149800,
    peakPortfolioValue: BigInt(55_000_000),
    alive: true,
    strategyConfig: {
      minApyThreshold: 500, // 5% min
      maxRiskScore: 60,
      autoCompound: true,
      rebalanceThresholdBps: 500,
      maxPositionSizeBps: 2500,
      maxTotalPositions: 10,
    },
  };
}

async function fetchBitcoinAgentState(agentId: number): Promise<BitcoinAgentState> {
  return {
    agentId,
    owner: DEFAULT_CONFIG.ownerAddress,
    name: "Alpha Hunter",
    hunger: 75,
    health: 90,
    xp: 5500,
    level: 2,
    levelName: "Senior",
    birthBlock: 140000,
    lastFed: Date.now() - 86400000 * 2,
    totalFedCount: 15,
    alive: true,
  };
}

async function fetchCurrentPositions(agentAccount: string): Promise<Position[]> {
  return [
    {
      positionId: 1,
      hunter: agentAccount,
      poolContract: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.pool-sbtc-stx",
      tokenX: "sbtc",
      tokenY: "stx",
      amountInvested: BigInt(15_000_000),
      lpTokensHeld: BigInt(12_500_000),
      entryBlock: 148000,
      entryPriceX: BigInt(100_000_000),
      entryPriceY: BigInt(1_500_000),
      lastCompoundBlock: 149500,
      riskScore: 35,
      active: true,
      currentValue: BigInt(16_200_000),
      unrealizedPnL: BigInt(1_200_000),
      currentApy: 1850,
    },
    {
      positionId: 2,
      hunter: agentAccount,
      poolContract: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.alex-sbtc-pool",
      tokenX: "sbtc",
      tokenY: "alex",
      amountInvested: BigInt(10_000_000),
      lpTokensHeld: BigInt(9_000_000),
      entryBlock: 149000,
      entryPriceX: BigInt(100_000_000),
      entryPriceY: BigInt(50_000),
      lastCompoundBlock: 149200,
      riskScore: 45,
      active: true,
      currentValue: BigInt(10_800_000),
      unrealizedPnL: BigInt(800_000),
      currentApy: 2400,
    },
  ];
}

async function fetchYieldOpportunities(): Promise<YieldOpportunity[]> {
  // In production: call Tenero API
  return [
    {
      poolContract: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.pool-sbtc-stx",
      poolName: "sBTC/STX",
      tokenX: "sbtc",
      tokenY: "stx",
      tokenXSymbol: "sBTC",
      tokenYSymbol: "STX",
      liquidity: BigInt(500_000_000_000),
      volume24h: BigInt(25_000_000_000),
      feeTier: 30,
      apy: 1850,
      riskScore: 35,
      holderCount: 1250,
      poolAge: 50000,
      lastUpdated: Date.now(),
    },
    {
      poolContract: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.alex-sbtc-pool",
      poolName: "sBTC/ALEX",
      tokenX: "sbtc",
      tokenY: "alex",
      tokenXSymbol: "sBTC",
      tokenYSymbol: "ALEX",
      liquidity: BigInt(150_000_000_000),
      volume24h: BigInt(8_000_000_000),
      feeTier: 30,
      apy: 2400,
      riskScore: 45,
      holderCount: 820,
      poolAge: 35000,
      lastUpdated: Date.now(),
    },
    {
      poolContract: "SP2XK4HJX2YJ3Y1FME2SCGPX8VCR2Y9RC0YZ7TBAJ.hermetica-vault",
      poolName: "Hermetica hBTC Vault",
      tokenX: "sbtc",
      tokenY: "hbtc",
      tokenXSymbol: "sBTC",
      tokenYSymbol: "hBTC",
      liquidity: BigInt(800_000_000_000),
      volume24h: BigInt(50_000_000_000),
      feeTier: 0,
      apy: 800,
      riskScore: 25,
      holderCount: 450,
      poolAge: 25000,
      lastUpdated: Date.now(),
    },
    {
      poolContract: "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.bitflow-sbtc-usda",
      poolName: "sBTC/USDA",
      tokenX: "sbtc",
      tokenY: "usda",
      tokenXSymbol: "sBTC",
      tokenYSymbol: "USDA",
      liquidity: BigInt(75_000_000_000),
      volume24h: BigInt(3_000_000_000),
      feeTier: 30,
      apy: 3200,
      riskScore: 55,
      holderCount: 380,
      poolAge: 15000,
      lastUpdated: Date.now(),
    },
  ];
}

async function fetchMarketConditions(): Promise<MarketConditions> {
  // In production: call Pyth Oracle
  return {
    btcPrice: 95000,
    stxPrice: 2.15,
    btcPriceChange24h: 2.5,
    stxPriceChange24h: 4.2,
    overallSentiment: "bullish",
    volatilityIndex: 45,
  };
}

function calculatePortfolioSummary(positions: Position[], hunterState: HunterState): PortfolioSummary {
  const activePositions = positions.filter((p) => p.active);
  const totalCurrentValue = activePositions.reduce((sum, p) => sum + (p.currentValue || p.amountInvested), BigInt(0));
  const totalUnrealizedPnL = activePositions.reduce((sum, p) => sum + (p.unrealizedPnL || BigInt(0)), BigInt(0));

  return {
    totalInvested: hunterState.totalInvested,
    totalCurrentValue,
    totalUnrealizedPnL,
    totalRealizedPnL: hunterState.totalYieldsEarned,
    activePositions: activePositions.length,
    closedPositions: hunterState.totalPositionsClosed,
    avgRiskScore: activePositions.length > 0 ? activePositions.reduce((sum, p) => sum + p.riskScore, 0) / activePositions.length : 0,
    avgApy: activePositions.length > 0 ? activePositions.reduce((sum, p) => sum + (p.currentApy || 0), 0) / activePositions.length : 0,
    diversificationScore: Math.min(100, activePositions.length * 15),
  };
}

// ============================================
// AGENT LOOP
// ============================================

async function runAgentLoop(config: AgentConfig): Promise<void> {
  console.log("=".repeat(60));
  console.log("YIELD HUNTER AGENT");
  console.log("=".repeat(60));
  console.log(`Network: ${config.network}`);
  console.log(`Agent: ${config.agentAccount || "Not configured"}`);
  console.log(`Dry run: ${config.dryRun}`);
  console.log(`Risk tolerance: ${config.riskTolerance}/100`);
  console.log("=".repeat(60));
  console.log("");

  // Initialize payment manager (mock signer for demo)
  const paymentManager = createPaymentManager(config.agentAccount, async (msg) => "mock-signature");
  await paymentManager.initialize();

  let iteration = 0;

  while (true) {
    iteration++;
    console.log(`\n[Iteration ${iteration}] ${new Date().toISOString()}`);
    console.log("-".repeat(40));

    try {
      // Fetch current state
      console.log("Fetching state...");
      const [hunterState, bitcoinAgentState, currentPositions, opportunities, marketConditions] = await Promise.all([
        fetchHunterState(config.agentAccount),
        fetchBitcoinAgentState(config.agentId),
        fetchCurrentPositions(config.agentAccount),
        fetchYieldOpportunities(),
        fetchMarketConditions(),
      ]);

      const portfolioSummary = calculatePortfolioSummary(currentPositions, hunterState);

      // Build decision context
      const context: DecisionContext = {
        hunterState,
        bitcoinAgentState,
        currentPositions,
        portfolioSummary,
        opportunities,
        marketConditions,
      };

      // Log status
      console.log(`\nAgent Status:`);
      console.log(`  Hunger: ${bitcoinAgentState.hunger}%`);
      console.log(`  Health: ${bitcoinAgentState.health}%`);
      console.log(`  Level: ${bitcoinAgentState.levelName} (${bitcoinAgentState.xp} XP)`);
      console.log(`  Active Positions: ${portfolioSummary.activePositions}`);
      console.log(`  Portfolio Value: ${formatSats(portfolioSummary.totalCurrentValue)}`);
      console.log(`  Unrealized P&L: ${formatSats(portfolioSummary.totalUnrealizedPnL)}`);

      console.log(`\nMarket:`);
      console.log(`  BTC: $${marketConditions.btcPrice.toLocaleString()} (${marketConditions.btcPriceChange24h > 0 ? "+" : ""}${marketConditions.btcPriceChange24h}%)`);
      console.log(`  STX: $${marketConditions.stxPrice.toFixed(2)} (${marketConditions.stxPriceChange24h > 0 ? "+" : ""}${marketConditions.stxPriceChange24h}%)`);
      console.log(`  Sentiment: ${marketConditions.overallSentiment}`);

      // Generate decisions
      console.log(`\nAnalyzing...`);
      const engine = createDecisionEngine(context, config.riskTolerance);
      const result: DecisionResult = await engine.generateDecisions();

      console.log(`\nDecisions: ${result.summary}`);

      if (result.decisions.length > 0) {
        for (const decision of result.decisions) {
          console.log(`\n  [${decision.action.toUpperCase()}] Priority: ${decision.priority}/10, Confidence: ${decision.confidence}%`);
          console.log(`  Reason: ${decision.reasoning}`);

          if (!config.dryRun) {
            console.log(`  Executing...`);
            // In production: execute the decision
            // await executeDecision(decision);
          } else {
            console.log(`  (Dry run - not executing)`);
          }
        }
      } else {
        console.log(`  No actions needed at this time.`);
      }

      // Payment tracking
      console.log(`\nPayment balance: ${formatSats(paymentManager.getBalance())}`);
    } catch (error) {
      console.error(`Error: ${error}`);
    }

    // Wait for next iteration
    console.log(`\nNext check in ${config.pollingIntervalMs / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, config.pollingIntervalMs));
  }
}

// ============================================
// CLI
// ============================================

function printUsage(): void {
  console.log(`
Yield Hunter Agent Runner

Usage: bun run scripts/run-agent.ts [options]

Options:
  --network=<testnet|mainnet>   Network to use (default: testnet)
  --agent=<address>             Agent account address
  --owner=<address>             Owner address
  --agent-id=<number>           Bitcoin agent ID (default: 1)
  --interval=<ms>               Polling interval in ms (default: 600000)
  --risk=<0-100>                Risk tolerance (default: 50)
  --dry-run                     Don't execute transactions (default: true)
  --execute                     Actually execute transactions
  --help                        Show this help

Environment:
  STACKS_PRIVATE_KEY            Private key for signing transactions
  AGENT_ACCOUNT                 Agent account address (alternative to --agent)

Examples:
  bun run scripts/run-agent.ts --agent=SP123... --dry-run
  bun run scripts/run-agent.ts --network=mainnet --execute
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const config: AgentConfig = { ...DEFAULT_CONFIG };

  // Parse arguments
  for (const arg of args) {
    if (arg.startsWith("--network=")) {
      config.network = arg.split("=")[1] as "mainnet" | "testnet";
    } else if (arg.startsWith("--agent=")) {
      config.agentAccount = arg.split("=")[1];
    } else if (arg.startsWith("--owner=")) {
      config.ownerAddress = arg.split("=")[1];
    } else if (arg.startsWith("--agent-id=")) {
      config.agentId = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--interval=")) {
      config.pollingIntervalMs = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--risk=")) {
      config.riskTolerance = parseInt(arg.split("=")[1]);
    } else if (arg === "--dry-run") {
      config.dryRun = true;
    } else if (arg === "--execute") {
      config.dryRun = false;
    }
  }

  // Environment variables as fallback
  config.agentAccount = config.agentAccount || process.env.AGENT_ACCOUNT || "";
  config.ownerAddress = config.ownerAddress || process.env.OWNER_ADDRESS || "";

  if (!config.agentAccount) {
    console.warn("Warning: No agent account specified. Using mock mode.");
    config.agentAccount = "SP123MOCK_AGENT_ACCOUNT";
  }

  await runAgentLoop(config);
}

main().catch(console.error);
