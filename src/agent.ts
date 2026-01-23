/**
 * Yield Hunter Agent
 *
 * Autonomous sBTC yield farming agent that:
 * 1. Monitors wallet sBTC balance
 * 2. Auto-deposits to Zest Protocol when above threshold
 * 3. Tracks positions and earnings
 * 4. Handles errors with retries
 */

import { createZestClient, type ZestClient } from "./yield-hunter/api/zest-client";
import { getTokenBalances } from "./yield-hunter/api/price-client";

// ============================================
// TYPES
// ============================================

export interface AgentConfig {
  /** Private key for signing transactions */
  privateKey: string;
  /** Stacks address */
  address: string;
  /** Minimum sBTC (sats) before depositing */
  minDepositThreshold: bigint;
  /** Reserve sats for transaction fees */
  feeBuffer: bigint;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Don't execute transactions, just log */
  dryRun: boolean;
  /** Run once and exit */
  runOnce: boolean;
}

export interface AgentStats {
  startedAt: Date;
  checksCompleted: number;
  depositsExecuted: number;
  totalDeposited: bigint;
  lastCheck: Date | null;
  lastDeposit: Date | null;
  errors: number;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const TX_POLL_INTERVAL_MS = 10000;
const TX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// HELPERS
// ============================================

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function formatSats(sats: bigint): string {
  const btc = Number(sats) / 100_000_000;
  return `${btc.toFixed(8)} sBTC (${sats} sats)`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// AGENT
// ============================================

export class YieldHunterAgent {
  private config: AgentConfig;
  private zest: ZestClient;
  private stats: AgentStats;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.zest = createZestClient({
      network: "mainnet",
      senderKey: config.privateKey,
      senderAddress: config.address,
    });
    this.stats = {
      startedAt: new Date(),
      checksCompleted: 0,
      depositsExecuted: 0,
      totalDeposited: 0n,
      lastCheck: null,
      lastDeposit: null,
      errors: 0,
    };
  }

  // ============================================
  // CORE LOGIC
  // ============================================

  async start(): Promise<void> {
    if (this.running) {
      log("Agent already running");
      return;
    }

    this.running = true;

    // Verify Zest is available
    if (!this.zest.isAvailable()) {
      throw new Error("Zest Protocol not available. Agent requires mainnet.");
    }

    // Run initial check
    await this.runCheck();

    // Schedule periodic checks unless runOnce
    if (!this.config.runOnce) {
      this.intervalId = setInterval(async () => {
        if (this.running) {
          await this.runCheck();
        }
      }, this.config.checkIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log("Agent stopped");
    this.printStats();
  }

  async runCheck(): Promise<void> {
    log("─".repeat(50));
    log("Running yield check...");

    try {
      // Get current balances
      const balances = await getTokenBalances(this.config.address);
      const walletSbtc = balances.sbtc;
      log(`Wallet sBTC: ${formatSats(walletSbtc)}`);

      // Get Zest position
      const position = await this.zest.getZestPosition(this.config.address);
      const zestSupplied = position?.supplied || 0n;
      log(`Zest supplied: ${formatSats(zestSupplied)}`);

      // Get current APY
      const apy = await this.zest.getZestSupplyAPY();
      log(`Current APY: ${(apy / 100).toFixed(2)}%`);

      // Calculate available to deposit (wallet - fee buffer)
      const availableToDeposit = walletSbtc > this.config.feeBuffer
        ? walletSbtc - this.config.feeBuffer
        : 0n;

      log(`Available to deposit: ${formatSats(availableToDeposit)}`);
      log(`Min threshold: ${formatSats(this.config.minDepositThreshold)}`);

      // Check if we should deposit
      if (availableToDeposit >= this.config.minDepositThreshold) {
        log(`✓ Above threshold, initiating deposit...`);

        if (this.config.dryRun) {
          log(`[DRY RUN] Would deposit ${formatSats(availableToDeposit)} to Zest`);
        } else {
          await this.executeDeposit(availableToDeposit);
        }
      } else {
        log(`✗ Below threshold, no action needed`);
      }

      this.stats.checksCompleted++;
      this.stats.lastCheck = new Date();
    } catch (error: any) {
      this.stats.errors++;
      log(`Error during check: ${error.message}`);
    }
  }

  private async executeDeposit(amount: bigint): Promise<void> {
    log(`Depositing ${formatSats(amount)} to Zest...`);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log(`Attempt ${attempt}/${MAX_RETRIES}...`);

        const result = await this.zest.supplyToZest(amount);

        if (result.success && result.txId) {
          log(`Transaction broadcast: ${result.txId}`);

          // Wait for confirmation
          const confirmed = await this.waitForConfirmation(result.txId);

          if (confirmed) {
            log(`✓ Deposit confirmed!`);
            this.stats.depositsExecuted++;
            this.stats.totalDeposited += amount;
            this.stats.lastDeposit = new Date();
            return;
          } else {
            log(`Transaction timed out or failed`);
            lastError = new Error("Transaction confirmation timeout");
          }
        } else {
          log(`Transaction failed: ${result.error}`);
          lastError = new Error(result.error || "Unknown error");
        }
      } catch (error: any) {
        log(`Attempt ${attempt} failed: ${error.message}`);
        lastError = error;
      }

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        log(`Waiting ${delay / 1000}s before retry...`);
        await sleep(delay);
      }
    }

    throw lastError || new Error("Deposit failed after retries");
  }

  private async waitForConfirmation(txId: string): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < TX_TIMEOUT_MS) {
      try {
        const response = await fetch(
          `https://api.hiro.so/extended/v1/tx/${txId}`
        );

        if (response.ok) {
          const data = await response.json();
          const status = data.tx_status;

          if (status === "success") {
            return true;
          } else if (status === "abort_by_response" || status === "abort_by_post_condition") {
            log(`Transaction aborted: ${status}`);
            return false;
          }
          // Still pending, continue polling
        }
      } catch (error) {
        // Ignore polling errors, just retry
      }

      await sleep(TX_POLL_INTERVAL_MS);
    }

    return false;
  }

  // ============================================
  // STATS
  // ============================================

  printStats(): void {
    const runtime = Date.now() - this.stats.startedAt.getTime();
    const hours = Math.floor(runtime / 3600000);
    const minutes = Math.floor((runtime % 3600000) / 60000);

    console.log("\n📊 Agent Statistics:");
    console.log(`   Runtime: ${hours}h ${minutes}m`);
    console.log(`   Checks completed: ${this.stats.checksCompleted}`);
    console.log(`   Deposits executed: ${this.stats.depositsExecuted}`);
    console.log(`   Total deposited: ${formatSats(this.stats.totalDeposited)}`);
    console.log(`   Errors: ${this.stats.errors}`);
    if (this.stats.lastDeposit) {
      console.log(`   Last deposit: ${this.stats.lastDeposit.toISOString()}`);
    }
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }
}

// ============================================
// FACTORY
// ============================================

export function createAgent(config: AgentConfig): YieldHunterAgent {
  return new YieldHunterAgent(config);
}
