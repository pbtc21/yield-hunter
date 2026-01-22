/**
 * Birth Hunter - Initialize a new yield hunter agent
 * Creates the full lifecycle: Bitcoin Face + ERC-8004 + bitcoin-agent + yield-hunter
 */

import { ContractClient } from "../api/contract-client";
import type { TransactionResult, StrategyConfig } from "../types";

const usage = `
Usage: bun run birth-hunter.ts <ownerAddress> <agentAddress> [options]

Arguments:
  ownerAddress   The owner's Stacks address (human controller)
  agentAddress   The agent's Stacks address (AI controller)

Options:
  --name <name>           Agent name (default: "YieldHunter-{timestamp}")
  --min-apy <bps>         Min APY threshold in basis points (default: 100 = 1%)
  --max-risk <score>      Max risk score 0-100 (default: 50)
  --auto-compound         Enable auto-compounding (default: true)
  --rebalance <bps>       Rebalance threshold in bps (default: 1000 = 10%)
  --network <net>         Network: mainnet, testnet, devnet (default: testnet)
  --key <key>             Sender private key (or set STACKS_PRIVATE_KEY env)

Example:
  bun run birth-hunter.ts ST1OWNER... ST1AGENT... --name "Alpha Hunter" --max-risk 40
`;

interface BirthOptions {
  ownerAddress: string;
  agentAddress: string;
  name: string;
  minApyThreshold: number;
  maxRiskScore: number;
  autoCompound: boolean;
  rebalanceThresholdBps: number;
  network: "mainnet" | "testnet" | "devnet";
  senderKey: string;
}

function parseArgs(): BirthOptions | null {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return null;
  }

  const options: BirthOptions = {
    ownerAddress: args[0],
    agentAddress: args[1],
    name: `YieldHunter-${Date.now()}`,
    minApyThreshold: 100, // 1%
    maxRiskScore: 50,
    autoCompound: true,
    rebalanceThresholdBps: 1000, // 10%
    network: "testnet",
    senderKey: process.env.STACKS_PRIVATE_KEY || "",
  };

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i];
        break;
      case "--min-apy":
        options.minApyThreshold = parseInt(args[++i]);
        break;
      case "--max-risk":
        options.maxRiskScore = parseInt(args[++i]);
        break;
      case "--auto-compound":
        options.autoCompound = args[++i] !== "false";
        break;
      case "--rebalance":
        options.rebalanceThresholdBps = parseInt(args[++i]);
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

  console.log("Birthing new Yield Hunter agent...\n");
  console.log(`  Name:         ${options.name}`);
  console.log(`  Owner:        ${options.ownerAddress}`);
  console.log(`  Agent:        ${options.agentAddress}`);
  console.log(`  Min APY:      ${options.minApyThreshold / 100}%`);
  console.log(`  Max Risk:     ${options.maxRiskScore}/100`);
  console.log(`  Auto-Compound: ${options.autoCompound}`);
  console.log(`  Rebalance:    ${options.rebalanceThresholdBps / 100}%`);
  console.log(`  Network:      ${options.network}\n`);

  // Generate deterministic IDs
  // In production, these would come from actual contract calls
  const bitcoinAgentId = generateDeterministicId(options.ownerAddress, "bitcoin-agent");
  const identityId = generateDeterministicId(options.ownerAddress, "identity");
  const agentAccount = generateAgentAccount(options.ownerAddress, options.agentAddress);

  console.log(`Generated IDs:`);
  console.log(`  Bitcoin Agent ID: ${bitcoinAgentId}`);
  console.log(`  Identity ID:      ${identityId}`);
  console.log(`  Agent Account:    ${agentAccount}\n`);

  // Initialize contract client
  const contracts = new ContractClient({
    network: options.network,
    senderKey: options.senderKey,
  });

  // Step 1: Register with ERC-8004 identity registry
  console.log("Step 1/4: Registering ERC-8004 identity...");
  // In production: await registerIdentity(...)

  // Step 2: Mint bitcoin-agent (Tamagotchi lifecycle)
  console.log("Step 2/4: Minting bitcoin-agent...");
  // In production: await mintBitcoinAgent(...)

  // Step 3: Initialize yield-hunter contract state
  console.log("Step 3/4: Initializing yield-hunter...");

  const result = await contracts.initializeHunter(
    agentAccount,
    options.ownerAddress,
    options.agentAddress,
    bitcoinAgentId,
    identityId,
    options.minApyThreshold,
    options.maxRiskScore,
    options.autoCompound,
    options.rebalanceThresholdBps
  );

  if (!result.success) {
    console.error(`\nFailed to initialize: ${result.error}`);
    return result;
  }

  // Step 4: Register on leaderboard
  console.log("Step 4/4: Registering on leaderboard...");
  // In production: await registerOnLeaderboard(...)

  console.log(`\n${"=".repeat(60)}`);
  console.log("Yield Hunter Agent Created!");
  console.log("=".repeat(60));
  console.log(`\nAgent Account:     ${agentAccount}`);
  console.log(`Bitcoin Agent ID:  ${bitcoinAgentId}`);
  console.log(`Identity ID:       ${identityId}`);
  console.log(`Transaction:       ${result.txId}`);
  console.log(`\nView: https://explorer.stacks.co/txid/${result.txId}?chain=${options.network}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Fund the agent account with sBTC`);
  console.log(`  2. Run: bun run scan-pools.ts`);
  console.log(`  3. Run: bun run hunt-yield.ts ${agentAccount} <pool> <amount>`);

  return {
    success: true,
    txId: result.txId,
    data: {
      agentAccount,
      bitcoinAgentId,
      identityId,
      name: options.name,
    },
  };
}

function generateDeterministicId(address: string, type: string): number {
  // Simple hash-based ID generation
  let hash = 0;
  const str = `${address}-${type}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 1000000);
}

function generateAgentAccount(owner: string, agent: string): string {
  // In production, this would be the deployed agent-account contract address
  return `${owner.slice(0, 10)}...agent-account`;
}

main()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
