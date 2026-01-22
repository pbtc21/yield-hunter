#!/usr/bin/env bun
/**
 * Yield Hunter Deployment Script
 * Deploy contracts to Stacks testnet/mainnet
 */

import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { StacksTestnet, StacksMainnet } from "@stacks/network";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ============================================
// CONFIGURATION
// ============================================

interface DeployConfig {
  network: "testnet" | "mainnet";
  secretKey: string;
  contractsPath: string;
  deployOrder: string[];
}

const DEFAULT_CONFIG: Partial<DeployConfig> = {
  contractsPath: "./contracts/yield-hunter",
  deployOrder: [
    // Traits first
    "adapter-trait.clar",
    // Core contracts
    "agent-lifecycle.clar",
    "yield-hunter-oracle.clar",
    "yield-hunter-adapter.clar",
    "yield-hunter.clar",
    // Protocol adapters
    "bitflow-adapter.clar",
    "alex-adapter.clar",
    "hermetica-adapter.clar",
    "zest-adapter.clar",
    "arkadiko-adapter.clar",
  ],
};

// ============================================
// DEPLOYMENT FUNCTIONS
// ============================================

async function deployContract(
  contractName: string,
  contractCode: string,
  network: StacksTestnet | StacksMainnet,
  secretKey: string
): Promise<string> {
  const txOptions = {
    contractName: contractName.replace(".clar", ""),
    codeBody: contractCode,
    senderKey: secretKey,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 100000n, // 0.1 STX
  };

  const transaction = await makeContractDeploy(txOptions);
  const broadcastResult = await broadcastTransaction(transaction, network);

  if ("error" in broadcastResult) {
    throw new Error(`Deploy failed: ${broadcastResult.error} - ${broadcastResult.reason}`);
  }

  return broadcastResult.txid;
}

async function waitForConfirmation(
  txId: string,
  network: StacksTestnet | StacksMainnet,
  maxAttempts: number = 60
): Promise<boolean> {
  const apiUrl = network instanceof StacksTestnet
    ? "https://api.testnet.hiro.so"
    : "https://api.hiro.so";

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${apiUrl}/extended/v1/tx/${txId}`);
    const data = await response.json();

    if (data.tx_status === "success") {
      return true;
    }

    if (data.tx_status === "abort_by_response" || data.tx_status === "abort_by_post_condition") {
      throw new Error(`Transaction failed: ${data.tx_status}`);
    }

    console.log(`  Waiting for confirmation... (${i + 1}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
  }

  return false;
}

// ============================================
// MAIN DEPLOYMENT
// ============================================

async function main() {
  console.log("=".repeat(60));
  console.log("YIELD HUNTER DEPLOYMENT");
  console.log("=".repeat(60));

  // Parse arguments
  const args = process.argv.slice(2);
  const networkArg = args.find((a) => a.startsWith("--network="))?.split("=")[1] || "testnet";
  const skipConfirmation = args.includes("--no-wait");

  // Load secret key from environment
  const secretKey = process.env.STACKS_PRIVATE_KEY;
  if (!secretKey) {
    console.error("Error: STACKS_PRIVATE_KEY environment variable not set");
    process.exit(1);
  }

  // Setup network
  const network = networkArg === "mainnet" ? new StacksMainnet() : new StacksTestnet();
  console.log(`\nNetwork: ${networkArg}`);
  console.log(`Contracts path: ${DEFAULT_CONFIG.contractsPath}`);
  console.log("");

  // Deploy contracts in order
  const deployedContracts: Map<string, string> = new Map();

  for (const contractFile of DEFAULT_CONFIG.deployOrder!) {
    const contractPath = join(DEFAULT_CONFIG.contractsPath!, contractFile);

    try {
      console.log(`Deploying: ${contractFile}`);

      // Read contract code
      const contractCode = readFileSync(contractPath, "utf-8");

      // Deploy
      const txId = await deployContract(contractFile, contractCode, network, secretKey);
      console.log(`  TX: ${txId}`);

      deployedContracts.set(contractFile, txId);

      // Wait for confirmation
      if (!skipConfirmation) {
        const confirmed = await waitForConfirmation(txId, network);
        if (confirmed) {
          console.log(`  Confirmed!`);
        } else {
          console.log(`  Warning: Confirmation timeout (may still succeed)`);
        }
      }

      console.log("");
    } catch (error) {
      console.error(`  Failed: ${error}`);
      console.error("");
      // Continue with other contracts
    }
  }

  // Summary
  console.log("=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));

  for (const [contract, txId] of deployedContracts) {
    console.log(`${contract}: ${txId}`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
