/**
 * Deploy Yield Hunter Contracts to Stacks
 * Deploys all three contracts in order
 */

import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { StacksTestnet, StacksMainnet } from "@stacks/network";
import { readFileSync } from "fs";
import { join } from "path";

const usage = `
Usage: bun run deploy-contracts.ts [options]

Options:
  --network <net>   Network: mainnet, testnet (default: testnet)
  --key <key>       Deployer private key (or set STACKS_PRIVATE_KEY env)
  --dry-run         Print contracts without deploying

Example:
  bun run deploy-contracts.ts --network testnet --key <private-key>
`;

interface DeployOptions {
  network: "mainnet" | "testnet";
  senderKey: string;
  dryRun: boolean;
}

function parseArgs(): DeployOptions | null {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return null;
  }

  const options: DeployOptions = {
    network: "testnet",
    senderKey: process.env.STACKS_PRIVATE_KEY || "",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--network":
        options.network = args[++i] as any;
        break;
      case "--key":
        options.senderKey = args[++i];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
    }
  }

  if (!options.senderKey && !options.dryRun) {
    console.error("Error: Sender key required. Use --key or set STACKS_PRIVATE_KEY");
    return null;
  }

  return options;
}

const CONTRACTS = [
  {
    name: "yield-hunter-oracle",
    path: "contracts/yield-hunter/yield-hunter-oracle.clar",
  },
  {
    name: "yield-hunter-adapter",
    path: "contracts/yield-hunter/yield-hunter-adapter.clar",
  },
  {
    name: "yield-hunter",
    path: "contracts/yield-hunter/yield-hunter.clar",
  },
];

async function deployContract(
  name: string,
  source: string,
  network: any,
  senderKey: string
): Promise<string> {
  const tx = await makeContractDeploy({
    contractName: name,
    codeBody: source,
    network,
    senderKey,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
  });

  const result = await broadcastTransaction({ transaction: tx, network });

  if ("error" in result) {
    throw new Error(`Deploy failed: ${result.error}`);
  }

  return result.txid;
}

async function main() {
  const options = parseArgs();
  if (!options) return;

  const network =
    options.network === "mainnet" ? new StacksMainnet() : new StacksTestnet();

  console.log(`\nYield Hunter Contract Deployment`);
  console.log("=".repeat(50));
  console.log(`Network: ${options.network}`);
  console.log(`Dry Run: ${options.dryRun}`);
  console.log();

  for (const contract of CONTRACTS) {
    console.log(`\nDeploying ${contract.name}...`);

    // Read contract source
    const sourcePath = join(process.cwd(), contract.path);
    let source: string;
    try {
      source = readFileSync(sourcePath, "utf-8");
    } catch (error) {
      console.error(`  Error: Could not read ${contract.path}`);
      continue;
    }

    console.log(`  Source: ${contract.path}`);
    console.log(`  Size: ${source.length} bytes`);

    if (options.dryRun) {
      console.log(`  [DRY RUN] Would deploy ${contract.name}`);
      continue;
    }

    try {
      const txId = await deployContract(
        contract.name,
        source,
        network,
        options.senderKey
      );
      console.log(`  TX: ${txId}`);
      console.log(
        `  Explorer: https://explorer.stacks.co/txid/${txId}?chain=${options.network}`
      );
    } catch (error: any) {
      console.error(`  Failed: ${error.message}`);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("Deployment complete!");
  console.log("\nNext steps:");
  console.log("1. Wait for transactions to confirm");
  console.log("2. Verify contracts on explorer");
  console.log("3. Update contract addresses in .env");
}

main().catch(console.error);
