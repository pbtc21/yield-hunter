/**
 * Hunt Yield - Execute yield investment
 * Invests sBTC into a yield opportunity
 */

import { ContractClient } from "../api/contract-client";
import { TeneroClient } from "../api/tenero-client";
import type { HuntYieldParams, TransactionResult } from "../types";

const usage = `
Usage: bun run hunt-yield.ts <hunterAccount> <poolContract> <amount> [options]

Arguments:
  hunterAccount  The hunter's agent account address
  poolContract   The pool contract to invest in
  amount         Amount to invest in satoshis

Options:
  --slippage <bps>  Max slippage in basis points (default: 300 = 3%)
  --network <net>   Network: mainnet, testnet, devnet (default: testnet)
  --key <key>       Sender private key (or set STACKS_PRIVATE_KEY env)

Example:
  bun run hunt-yield.ts ST1234...ABCD SP5678...WXYZ.pool 10000000 --slippage 200
`;

interface HuntOptions {
  hunterAccount: string;
  poolContract: string;
  amount: bigint;
  slippageBps: number;
  network: "mainnet" | "testnet" | "devnet";
  senderKey: string;
}

function parseArgs(): HuntOptions | null {
  const args = process.argv.slice(2);

  if (args.length < 3 || args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return null;
  }

  const options: HuntOptions = {
    hunterAccount: args[0],
    poolContract: args[1],
    amount: BigInt(args[2]),
    slippageBps: 300,
    network: "testnet",
    senderKey: process.env.STACKS_PRIVATE_KEY || "",
  };

  for (let i = 3; i < args.length; i++) {
    switch (args[i]) {
      case "--slippage":
        options.slippageBps = parseInt(args[++i]);
        break;
      case "--network":
        options.network = args[++i] as any;
        break;
      case "--key":
        options.senderKey = args[++i];
        break;
    }
  }

  if (!options.senderKey) {
    console.error("Error: Sender key required. Use --key or set STACKS_PRIVATE_KEY");
    return null;
  }

  return options;
}

async function main(): Promise<TransactionResult> {
  const options = parseArgs();
  if (!options) {
    return { success: false, error: "Invalid arguments" };
  }

  console.log("Hunting yield...\n");
  console.log(`  Hunter:  ${options.hunterAccount}`);
  console.log(`  Pool:    ${options.poolContract}`);
  console.log(`  Amount:  ${Number(options.amount).toLocaleString()} sats`);
  console.log(`  Slippage: ${options.slippageBps / 100}%`);
  console.log(`  Network: ${options.network}\n`);

  // Get pool info for risk assessment
  const tenero = new TeneroClient();
  const poolInfo = await tenero.getPool(options.poolContract);

  if (!poolInfo) {
    return { success: false, error: "Pool not found" };
  }

  // Calculate risk score
  const holders = await tenero.getTokenHolders(options.poolContract, 100);
  const riskScore = calculateRiskScore(
    poolInfo.tvl,
    poolInfo.volume24h,
    holders.length,
    poolInfo.createdAt
  );

  console.log(`Pool risk score: ${riskScore}/100`);

  if (riskScore > 60) {
    console.log("Warning: High risk pool. Consider lower amount.");
  }

  // Calculate minimum LP tokens (with slippage)
  const minLpTokens = calculateMinLp(options.amount, poolInfo, options.slippageBps);

  // Initialize contract client
  const contracts = new ContractClient({
    network: options.network,
    senderKey: options.senderKey,
  });

  // Execute hunt
  const params: HuntYieldParams = {
    hunterAccount: options.hunterAccount,
    poolContract: options.poolContract,
    amount: options.amount,
    minLpTokens,
    riskScore,
  };

  console.log(`\nSubmitting transaction...`);

  const result = await contracts.huntYield(params);

  if (result.success) {
    console.log(`\nSuccess! TX: ${result.txId}`);
    console.log(`View: https://explorer.stacks.co/txid/${result.txId}?chain=${options.network}`);
  } else {
    console.error(`\nFailed: ${result.error}`);
  }

  return result;
}

function calculateRiskScore(
  liquidity: bigint,
  volume24h: bigint,
  holderCount: number,
  createdAt: number
): number {
  const liquidityRisk =
    liquidity < BigInt(100000000)
      ? 80
      : liquidity < BigInt(1000000000)
        ? 50
        : liquidity < BigInt(10000000000)
          ? 25
          : 10;

  const volumeRisk =
    volume24h < BigInt(10000000)
      ? 70
      : volume24h < BigInt(100000000)
        ? 40
        : 15;

  const concentrationRisk =
    holderCount < 10 ? 90 : holderCount < 50 ? 60 : holderCount < 200 ? 30 : 10;

  const ageBlocks = createdAt
    ? Math.floor((Date.now() / 1000 - createdAt) / 600)
    : 0;
  const ageRisk =
    ageBlocks < 1440 ? 80 : ageBlocks < 4320 ? 50 : ageBlocks < 14400 ? 25 : 10;

  return Math.round(
    liquidityRisk * 0.4 +
      volumeRisk * 0.25 +
      concentrationRisk * 0.2 +
      ageRisk * 0.15
  );
}

function calculateMinLp(
  amount: bigint,
  poolInfo: any,
  slippageBps: number
): bigint {
  // Simplified LP calculation
  // In production, would query pool for exact expected LP
  const lpPerSat = Number(poolInfo.totalLpSupply) / Number(poolInfo.tvl);
  const expectedLp = BigInt(Math.floor(Number(amount) * lpPerSat));
  const minLp = (expectedLp * BigInt(10000 - slippageBps)) / BigInt(10000);
  return minLp;
}

main()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
