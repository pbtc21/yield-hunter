#!/usr/bin/env bun
/**
 * Yield Hunter CLI
 *
 * One-command sBTC yield farming on Stacks Bitcoin L2
 *
 * Usage:
 *   yield-hunter start [options]   Start the autonomous agent
 *   yield-hunter status [options]  Check current positions
 *   yield-hunter help              Show help
 */

import { YieldHunterAgent, type AgentConfig } from "./agent";
import { createZestClient } from "./yield-hunter/api/zest-client";
import { getTokenBalances } from "./yield-hunter/api/price-client";
import {
  hasWallets,
  listWallets,
  getActiveWalletId,
  unlockWallet,
  promptPassword,
} from "./wallet-integration";

// ============================================
// CLI HELPERS
// ============================================

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function formatSats(sats: bigint): string {
  const btc = Number(sats) / 100_000_000;
  return `${btc.toFixed(8)} sBTC`;
}

function printBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗   ██╗██╗███████╗██╗     ██████╗                    ║
║   ╚██╗ ██╔╝██║██╔════╝██║     ██╔══██╗                   ║
║    ╚████╔╝ ██║█████╗  ██║     ██║  ██║                   ║
║     ╚██╔╝  ██║██╔══╝  ██║     ██║  ██║                   ║
║      ██║   ██║███████╗███████╗██████╔╝                   ║
║      ╚═╝   ╚═╝╚══════╝╚══════╝╚═════╝                    ║
║                                                           ║
║   ██╗  ██╗██╗   ██╗███╗   ██╗████████╗███████╗██████╗    ║
║   ██║  ██║██║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗   ║
║   ███████║██║   ██║██╔██╗ ██║   ██║   █████╗  ██████╔╝   ║
║   ██╔══██║██║   ██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗   ║
║   ██║  ██║╚██████╔╝██║ ╚████║   ██║   ███████╗██║  ██║   ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ║
║                                                           ║
║   Autonomous sBTC Yield Farming on Stacks Bitcoin L2      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

function printUsage(): void {
  console.log(`
Usage: yield-hunter <command> [options]

Commands:
  start       Start the autonomous yield hunting agent
  status      Check current positions and balances
  help        Show this help message

Options for 'start':
  --wallet              Use wallet from ~/.aibtc/ (created via @aibtc/mcp-server)
  --wallet-id=<ID>      Specific wallet ID to use (default: active wallet)
  --key=<KEY>           Private key (hex) - alternative to --wallet
  --threshold=<SATS>    Minimum sBTC (sats) before depositing (default: 10000)
  --fee-buffer=<SATS>   Reserve sats for transaction fees (default: 50000)
  --interval=<SEC>      Check interval in seconds (default: 600)
  --dry-run             Don't execute transactions, just log what would happen
  --once                Run once and exit (for testing)

Options for 'status':
  --address=<ADDR>      Stacks address to check
  --wallet              Use address from ~/.aibtc/ wallet

Environment Variables:
  STACKS_PRIVATE_KEY    Private key (alternative to --key)

Examples:
  # Use existing wallet from @aibtc/mcp-server
  yield-hunter start --wallet
  yield-hunter status --wallet

  # Check positions for an address
  yield-hunter status --address=SP2ABC...

  # Start with raw private key
  yield-hunter start --key=abc123... --dry-run

  # Run once for testing
  yield-hunter start --wallet --once --dry-run

Security:
  Recommended: Use --wallet with wallets created via @aibtc/mcp-server
  The wallet is encrypted and stored in ~/.aibtc/
  You'll be prompted for password (wallet stays unlocked for 1 hour)
`);
}

// ============================================
// COMMANDS
// ============================================

async function cmdStatus(address: string): Promise<void> {
  log("Fetching status...");

  const zest = createZestClient({ network: "mainnet" });

  // Get wallet balances
  const balances = await getTokenBalances(address);
  console.log("\n📊 Wallet Balances:");
  console.log(`   STX:  ${(Number(balances.stx) / 1_000_000).toFixed(6)} STX`);
  console.log(`   sBTC: ${formatSats(balances.sbtc)}`);

  // Get Zest position
  if (zest.isAvailable()) {
    const position = await zest.getZestPosition(address);
    const apy = await zest.getZestSupplyAPY();

    console.log("\n🏦 Zest Protocol Position:");
    if (position && position.supplied > 0n) {
      console.log(`   Supplied: ${formatSats(position.supplied)}`);
      console.log(`   As Collateral: ${position.asCollateral ? "Yes" : "No"}`);
      console.log(`   Current APY: ${(apy / 100).toFixed(2)}%`);

      // Calculate estimated daily/yearly earnings
      const dailyYield = zest.calculateExpectedYield(position.supplied, apy, 144); // ~144 blocks/day
      const yearlyYield = zest.calculateExpectedYield(position.supplied, apy, 52560);
      console.log(`   Est. Daily Yield: ${formatSats(dailyYield)}`);
      console.log(`   Est. Yearly Yield: ${formatSats(yearlyYield)}`);
    } else {
      console.log("   No active position");
      console.log(`   Current APY: ${(apy / 100).toFixed(2)}%`);
    }

    // Get reserve state
    const reserveState = await zest.getZestReserveState();
    if (reserveState) {
      console.log("\n📈 Zest Protocol Stats:");
      console.log(`   Total Supplied: ${formatSats(reserveState.totalSupply)}`);
      console.log(`   Total Borrowed: ${formatSats(reserveState.totalBorrow)}`);
      console.log(`   Utilization: ${reserveState.utilizationRate.toFixed(2)}%`);
      console.log(`   Supply APY: ${(reserveState.supplyRate / 100).toFixed(2)}%`);
      console.log(`   Borrow APY: ${(reserveState.borrowRate / 100).toFixed(2)}%`);
    }

    console.log("\n💡 Note: Zest auto-compounds interest. Your zsBTC balance");
    console.log("   increases over time - no manual claiming needed!");
  } else {
    console.log("\n⚠️  Zest Protocol not available (mainnet only)");
  }
}

async function cmdStart(config: AgentConfig): Promise<void> {
  printBanner();

  log("Starting Yield Hunter Agent...");
  log(`Network: mainnet`);
  log(`Address: ${config.address}`);
  log(`Dry Run: ${config.dryRun}`);
  log(`Min Deposit: ${formatSats(config.minDepositThreshold)}`);
  log(`Fee Buffer: ${formatSats(config.feeBuffer)}`);
  log(`Check Interval: ${config.checkIntervalMs / 1000}s`);

  const agent = new YieldHunterAgent(config);

  // Handle shutdown gracefully
  process.on("SIGINT", () => {
    log("\nShutting down...");
    agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log("\nShutting down...");
    agent.stop();
    process.exit(0);
  });

  // Start the agent
  await agent.start();

  if (config.runOnce) {
    log("Single run mode - exiting");
    agent.stop();
  } else {
    log("\nAgent running. Press Ctrl+C to stop.\n");
    // Keep process alive
    await new Promise(() => {});
  }
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split("=")[1] : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  switch (command) {
    case "start": {
      let privateKey: string;
      let address: string;

      // Option 1: Use wallet from ~/.aibtc/
      if (hasFlag("wallet") || (!getArg("key") && !process.env.STACKS_PRIVATE_KEY)) {
        const walletExists = await hasWallets();
        if (!walletExists) {
          console.error("Error: No wallets found in ~/.aibtc/");
          console.error("\nTo create a wallet, install and use @aibtc/mcp-server:");
          console.error("  npx @aibtc/mcp-server --install");
          console.error("  Then ask Claude to create a wallet for you.");
          console.error("\nOr use --key=<private-key> to provide a key directly.");
          process.exit(1);
        }

        // Get wallet ID (specified or active)
        let walletId = getArg("wallet-id");
        if (!walletId) {
          walletId = await getActiveWalletId();
        }
        if (!walletId) {
          const wallets = await listWallets();
          walletId = wallets[0]?.id;
        }
        if (!walletId) {
          console.error("Error: No wallet found. Create one first.");
          process.exit(1);
        }

        // Show wallet info
        const wallets = await listWallets();
        const wallet = wallets.find((w) => w.id === walletId);
        console.log(`\n🔐 Using wallet: ${wallet?.name || walletId}`);
        console.log(`   Address: ${wallet?.address}`);
        console.log(`   Network: ${wallet?.network}\n`);

        if (wallet?.network !== "mainnet") {
          console.error("Error: Yield Hunter requires mainnet. Wallet is on testnet.");
          process.exit(1);
        }

        // Prompt for password
        const password = await promptPassword();

        // Unlock wallet
        try {
          const account = await unlockWallet(walletId, password);
          privateKey = account.privateKey;
          address = account.address;
          console.log("✓ Wallet unlocked\n");
        } catch (error: any) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
      }
      // Option 2: Use raw private key
      else {
        privateKey = getArg("key") || process.env.STACKS_PRIVATE_KEY!;

        if (!privateKey) {
          console.error("Error: Private key required.");
          console.error("Use --wallet, --key=<key>, or set STACKS_PRIVATE_KEY");
          process.exit(1);
        }

        // Derive address from private key
        const { getAddressFromPrivateKey, TransactionVersion } = await import("@stacks/transactions");
        address = getAddressFromPrivateKey(privateKey, TransactionVersion.Mainnet);
      }

      const config: AgentConfig = {
        privateKey,
        address,
        minDepositThreshold: BigInt(getArg("threshold") || "10000"),
        feeBuffer: BigInt(getArg("fee-buffer") || "50000"),
        checkIntervalMs: parseInt(getArg("interval") || "600") * 1000,
        dryRun: hasFlag("dry-run"),
        runOnce: hasFlag("once"),
      };

      await cmdStart(config);
      break;
    }

    case "status": {
      let address = getArg("address");

      // If --wallet flag or no address provided, try to get from wallet
      if (hasFlag("wallet") || !address) {
        const walletExists = await hasWallets();
        if (walletExists) {
          let walletId = await getActiveWalletId();
          if (!walletId) {
            const wallets = await listWallets();
            walletId = wallets[0]?.id;
          }
          if (walletId) {
            const wallets = await listWallets();
            const wallet = wallets.find((w) => w.id === walletId);
            if (wallet) {
              address = wallet.address;
              console.log(`Using wallet: ${wallet.name} (${wallet.address})\n`);
            }
          }
        }
      }

      if (!address) {
        console.error("Error: Address required. Use --address=<addr> or --wallet");
        process.exit(1);
      }
      await cmdStatus(address);
      break;
    }

    case "help":
    default:
      printUsage();
      break;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
