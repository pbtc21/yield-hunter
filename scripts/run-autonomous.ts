#!/usr/bin/env bun
/**
 * Run the Autonomous Yield Scanner Agent
 *
 * Usage:
 *   bun run autonomous                              # Dry run, scan only
 *   bun run autonomous --address=SP2ABC...           # Monitor specific address
 *   bun run autonomous --wallet                      # Use wallet from ~/.aibtc/
 *   bun run autonomous --key=abc123 --live           # Live mode with deposits
 *   bun run autonomous --once                        # Single scan and exit
 *   bun run autonomous --interval=15                 # Custom interval (minutes)
 *   bun run autonomous --min-apy=2 --max-risk=40     # Custom filters
 */

import { createAutonomousAgent, type AutonomousConfig } from "../src/autonomous-agent";

// ============================================
// ARGUMENT PARSING
// ============================================

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

// ============================================
// WALLET RESOLUTION
// ============================================

async function resolveAddress(): Promise<{ address: string; privateKey?: string }> {
  // Option 1: Explicit address
  const addr = getArg("address");
  if (addr) {
    const key = getArg("key") || process.env.STACKS_PRIVATE_KEY;
    return { address: addr, privateKey: key };
  }

  // Option 2: Raw private key → derive address
  const key = getArg("key") || process.env.STACKS_PRIVATE_KEY;
  if (key) {
    const { getAddressFromPrivateKey, TransactionVersion } = await import("@stacks/transactions");
    const network = hasFlag("testnet") ? TransactionVersion.Testnet : TransactionVersion.Mainnet;
    const address = getAddressFromPrivateKey(key, network);
    return { address, privateKey: key };
  }

  // Option 3: Wallet from ~/.aibtc/
  if (hasFlag("wallet")) {
    try {
      const { hasWallets, listWallets, getActiveWalletId, unlockWallet, promptPassword } = await import("../src/wallet-integration");

      if (!(await hasWallets())) {
        console.error("No wallets found in ~/.aibtc/");
        process.exit(1);
      }

      let walletId = getArg("wallet-id") || (await getActiveWalletId());
      if (!walletId) {
        const wallets = await listWallets();
        walletId = wallets[0]?.id;
      }

      if (!walletId) {
        console.error("No wallet found");
        process.exit(1);
      }

      const wallets = await listWallets();
      const wallet = wallets.find((w) => w.id === walletId);
      console.log(`Using wallet: ${wallet?.name || walletId} (${wallet?.address})`);

      const password = await promptPassword();
      const account = await unlockWallet(walletId!, password);
      return { address: account.address, privateKey: account.privateKey };
    } catch (error: any) {
      console.error(`Wallet error: ${error.message}`);
      process.exit(1);
    }
  }

  // Option 4: Default testnet treasury address (read-only scan)
  console.log("No address specified, using treasury address for read-only scanning");
  return {
    address: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  };
}

// ============================================
// HELP
// ============================================

if (hasFlag("help") || args.includes("-h")) {
  console.log(`
Autonomous Yield Scanner Agent

Usage:
  bun run autonomous [options]

Options:
  --address=<ADDR>     Stacks address to monitor
  --key=<KEY>          Private key for deposits (hex)
  --wallet             Use wallet from ~/.aibtc/
  --wallet-id=<ID>     Specific wallet ID
  --live               Enable live deposits (default: dry run)
  --once               Single scan and exit
  --interval=<MIN>     Scan interval in minutes (default: 30)
  --min-apy=<N>        Minimum APY threshold (default: 1)
  --max-risk=<N>       Maximum risk score (default: 50)
  --threshold=<SATS>   Min sBTC before deposit (default: 10000)
  --testnet            Use testnet (default: mainnet)
  --api=<URL>          Custom yield API URL

Environment:
  STACKS_PRIVATE_KEY   Alternative to --key

Examples:
  bun run autonomous --once                     # Quick scan
  bun run autonomous --address=SP2ABC...        # Monitor address
  bun run autonomous --wallet --live            # Live with wallet
  bun run autonomous --min-apy=3 --max-risk=30  # Conservative
`);
  process.exit(0);
}

// ============================================
// MAIN
// ============================================

async function main() {
  const { address, privateKey } = await resolveAddress();

  const isLive = hasFlag("live") && !!privateKey;
  const network = hasFlag("testnet") ? "testnet" as const : "mainnet" as const;

  const agent = createAutonomousAgent({
    address,
    privateKey: isLive ? privateKey : undefined,
    intervalMs: parseInt(getArg("interval") || "30") * 60 * 1000,
    minApyThreshold: parseFloat(getArg("min-apy") || "1"),
    maxRiskScore: parseInt(getArg("max-risk") || "50"),
    minDepositSats: BigInt(getArg("threshold") || "10000"),
    feeBufferSats: BigInt(getArg("fee-buffer") || "50000"),
    dryRun: !isLive,
    runOnce: hasFlag("once"),
    network,
    apiUrl: getArg("api") || "https://yield-hunter-x402.p-d07.workers.dev",
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    agent.stop();
    process.exit(0);
  });

  // Start
  await agent.start();

  if (hasFlag("once")) {
    agent.stop();
  } else {
    console.log("\nAgent running. Press Ctrl+C to stop.\n");
    await new Promise(() => {}); // Keep alive
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
