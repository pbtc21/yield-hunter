/**
 * Autonomous Yield Scanner Agent
 *
 * Multi-protocol yield scanning on a 30-minute loop:
 * 1. Fetches live yields from the deployed x402 API
 * 2. Checks wallet sBTC/STX balance via Hiro API
 * 3. Ranks opportunities by risk-adjusted APY
 * 4. Auto-deposits to Zest when conditions are met
 * 5. Tracks portfolio and logs results
 */

import { createZestClient, type ZestClient } from "./yield-hunter/api/zest-client";

// ============================================
// TYPES
// ============================================

interface YieldOpportunity {
  protocol: string;
  pool: string;
  type: "lending" | "amm" | "vault";
  apy: number;
  tvlUsd: number;
  volume24hUsd: number;
  riskScore: number;
  minDeposit: number;
  source: string;
  poolAddress?: string;
  live: boolean;
}

interface YieldsResponse {
  count: number;
  totalTvlUsd: number;
  avgApy: number;
  bestApy: number;
  yields: YieldOpportunity[];
  sources: string[];
  cachedAt: string | null;
  timestamp: string;
}

interface ScanResult {
  timestamp: Date;
  walletSbtcSats: bigint;
  walletStxMicro: bigint;
  btcPrice: number;
  stxPrice: number;
  opportunities: YieldOpportunity[];
  bestOpportunity: YieldOpportunity | null;
  zestPosition: bigint;
  action: "deposit" | "hold" | "scan-only";
  reason: string;
}

export interface AutonomousConfig {
  /** Stacks address to monitor */
  address: string;
  /** Private key for signing (optional, required for deposits) */
  privateKey?: string;
  /** Scan interval in milliseconds (default: 30 min) */
  intervalMs: number;
  /** Minimum APY to consider (default: 1%) */
  minApyThreshold: number;
  /** Maximum risk score to consider (default: 50) */
  maxRiskScore: number;
  /** Minimum sBTC (sats) before depositing (default: 10000) */
  minDepositSats: bigint;
  /** Reserve sats for fees */
  feeBufferSats: bigint;
  /** Don't execute transactions */
  dryRun: boolean;
  /** Run once and exit */
  runOnce: boolean;
  /** Network: mainnet or testnet */
  network: "mainnet" | "testnet";
  /** API endpoint for live yields */
  apiUrl: string;
}

interface AgentStats {
  startedAt: Date;
  scansCompleted: number;
  depositsExecuted: number;
  totalDeposited: bigint;
  errors: number;
  lastScan: Date | null;
  lastDeposit: Date | null;
  bestApySeen: number;
  bestProtocolSeen: string;
  zestPosition: bigint;
  earnedFromCompounding: bigint;
  initialZestPosition: bigint;
  scanHistory: ScanSummary[];
}

interface ScanSummary {
  timestamp: Date;
  opportunityCount: number;
  bestApy: number;
  bestProtocol: string;
  action: string;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_API_URL = "https://yield-hunter-x402.p-d07.workers.dev";
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const TX_POLL_INTERVAL_MS = 10000;
const TX_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SCAN_HISTORY = 48; // Keep last 24 hours at 30-min intervals

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

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// AUTONOMOUS AGENT
// ============================================

export class AutonomousYieldAgent {
  private config: AutonomousConfig;
  private stats: AgentStats;
  private zest: ZestClient | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: AutonomousConfig) {
    this.config = config;
    this.stats = {
      startedAt: new Date(),
      scansCompleted: 0,
      depositsExecuted: 0,
      totalDeposited: 0n,
      errors: 0,
      lastScan: null,
      lastDeposit: null,
      bestApySeen: 0,
      bestProtocolSeen: "",
      zestPosition: 0n,
      earnedFromCompounding: 0n,
      initialZestPosition: 0n,
      scanHistory: [],
    };

    // Initialize Zest client if private key provided and mainnet
    if (config.privateKey && config.network === "mainnet") {
      this.zest = createZestClient({
        network: "mainnet",
        senderKey: config.privateKey,
        senderAddress: config.address,
      });
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async start(): Promise<void> {
    if (this.running) {
      log("Agent already running");
      return;
    }

    this.running = true;
    this.printBanner();

    // Run initial scan
    await this.runScan();

    // Schedule periodic scans unless runOnce
    if (!this.config.runOnce) {
      const intervalMin = Math.round(this.config.intervalMs / 60000);
      log(`Scheduling scans every ${intervalMin} minutes`);

      this.intervalId = setInterval(async () => {
        if (this.running) {
          await this.runScan();
        }
      }, this.config.intervalMs);
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

  // ============================================
  // CORE SCAN LOOP
  // ============================================

  async runScan(): Promise<ScanResult | null> {
    const divider = "═".repeat(60);
    console.log(`\n${divider}`);
    log("YIELD SCAN STARTING");
    console.log(divider);

    try {
      // Step 1: Fetch live yields from our API
      log("Fetching live yield data...");
      const yields = await this.fetchYields();

      if (!yields || yields.length === 0) {
        log("No yield data available");
        this.stats.errors++;
        return null;
      }

      log(`Found ${yields.length} opportunities across protocols`);

      // Step 2: Fetch wallet balance
      log("Checking wallet balance...");
      const { sbtcSats, stxMicro } = await this.fetchWalletBalance();
      log(`Wallet: ${formatSats(sbtcSats)} | ${(Number(stxMicro) / 1_000_000).toFixed(2)} STX`);

      // Step 3: Fetch prices
      const { btcPrice, stxPrice } = await this.fetchPrices();
      const walletValueUsd =
        (Number(sbtcSats) / 100_000_000) * btcPrice +
        (Number(stxMicro) / 1_000_000) * stxPrice;
      log(`Wallet value: ${formatUsd(walletValueUsd)} (BTC: ${formatUsd(btcPrice)} | STX: $${stxPrice.toFixed(2)})`);

      // Step 4: Check Zest position
      let zestPosition = 0n;
      if (this.zest && this.zest.isAvailable()) {
        try {
          const pos = await this.zest.getZestPosition(this.config.address);
          zestPosition = pos?.supplied || 0n;
          if (zestPosition > 0n) {
            log(`Zest position: ${formatSats(zestPosition)}`);
          }
        } catch {
          // Zest read failed, continue without it
        }
      }

      // Track compounding
      if (this.stats.initialZestPosition === 0n && zestPosition > 0n) {
        this.stats.initialZestPosition = zestPosition;
      }
      this.stats.zestPosition = zestPosition;
      const baseline = this.stats.initialZestPosition + this.stats.totalDeposited;
      if (zestPosition > baseline) {
        this.stats.earnedFromCompounding = zestPosition - baseline;
      }

      // Step 5: Filter and rank opportunities
      const qualified = yields
        .filter((y) => y.apy >= this.config.minApyThreshold)
        .filter((y) => y.riskScore <= this.config.maxRiskScore);

      // Risk-adjusted score: APY * (1 - riskScore/100)
      const ranked = qualified
        .map((y) => ({
          ...y,
          adjustedScore: y.apy * (1 - y.riskScore / 100),
        }))
        .sort((a, b) => b.adjustedScore - a.adjustedScore);

      // Step 6: Print opportunity table
      this.printOpportunityTable(yields, ranked);

      // Step 7: Determine action
      const bestOpp = ranked[0] || null;
      let action: "deposit" | "hold" | "scan-only" = "scan-only";
      let reason = "Scan complete, no action criteria met";

      if (bestOpp && this.config.privateKey && !this.config.dryRun) {
        const availableSats = sbtcSats > this.config.feeBufferSats
          ? sbtcSats - this.config.feeBufferSats
          : 0n;

        if (availableSats >= this.config.minDepositSats) {
          // Only auto-deposit to Zest (the protocol with write support)
          if (bestOpp.protocol.toLowerCase() === "zest" && bestOpp.type === "lending") {
            action = "deposit";
            reason = `Depositing ${formatSats(availableSats)} to ${bestOpp.protocol} ${bestOpp.pool} (${bestOpp.apy.toFixed(2)}% APY)`;
          } else {
            action = "hold";
            reason = `Best opportunity is ${bestOpp.protocol} ${bestOpp.pool} (${bestOpp.apy.toFixed(2)}% APY) - auto-deposit only supported for Zest lending`;
          }
        } else {
          action = "hold";
          reason = `Wallet balance (${formatSats(sbtcSats)}) below deposit threshold`;
        }
      } else if (bestOpp && this.config.dryRun) {
        action = "scan-only";
        reason = `[DRY RUN] Would consider ${bestOpp.protocol} ${bestOpp.pool} (${bestOpp.apy.toFixed(2)}% APY, risk ${bestOpp.riskScore})`;
      } else if (!bestOpp) {
        action = "hold";
        reason = `No opportunities above ${this.config.minApyThreshold}% APY with risk <= ${this.config.maxRiskScore}`;
      }

      // Step 8: Execute if needed
      if (action === "deposit" && this.zest) {
        const depositAmount = sbtcSats > this.config.feeBufferSats
          ? sbtcSats - this.config.feeBufferSats
          : 0n;
        await this.executeDeposit(depositAmount);
      }

      // Step 9: Log result
      console.log(`\n>> ACTION: ${action.toUpperCase()}`);
      console.log(`>> ${reason}`);

      // Track stats
      if (bestOpp && bestOpp.apy > this.stats.bestApySeen) {
        this.stats.bestApySeen = bestOpp.apy;
        this.stats.bestProtocolSeen = `${bestOpp.protocol} ${bestOpp.pool}`;
      }

      this.stats.scansCompleted++;
      this.stats.lastScan = new Date();

      // Record scan summary
      this.stats.scanHistory.push({
        timestamp: new Date(),
        opportunityCount: yields.length,
        bestApy: bestOpp?.apy || 0,
        bestProtocol: bestOpp ? `${bestOpp.protocol} ${bestOpp.pool}` : "none",
        action,
      });
      if (this.stats.scanHistory.length > MAX_SCAN_HISTORY) {
        this.stats.scanHistory.shift();
      }

      // Next scan info
      if (!this.config.runOnce) {
        const nextScan = new Date(Date.now() + this.config.intervalMs);
        log(`Next scan at ${nextScan.toLocaleTimeString()}`);
      }

      return {
        timestamp: new Date(),
        walletSbtcSats: sbtcSats,
        walletStxMicro: stxMicro,
        btcPrice,
        stxPrice,
        opportunities: yields,
        bestOpportunity: bestOpp,
        zestPosition,
        action,
        reason,
      };
    } catch (error: any) {
      this.stats.errors++;
      log(`Scan error: ${error.message}`);
      return null;
    }
  }

  // ============================================
  // DATA FETCHERS
  // ============================================

  private async fetchYields(): Promise<YieldOpportunity[]> {
    try {
      const res = await fetch(`${this.config.apiUrl}/api/yields`);
      if (!res.ok) {
        log(`API returned ${res.status}`);
        return [];
      }
      const data: YieldsResponse = await res.json();
      return data.yields || [];
    } catch (error: any) {
      log(`Yield API error: ${error.message}`);
      return [];
    }
  }

  private async fetchWalletBalance(): Promise<{ sbtcSats: bigint; stxMicro: bigint }> {
    const hiro = this.config.network === "mainnet"
      ? "https://api.mainnet.hiro.so"
      : "https://api.testnet.hiro.so";

    try {
      const res = await fetch(`${hiro}/extended/v1/address/${this.config.address}/balances`);
      if (!res.ok) return { sbtcSats: 0n, stxMicro: 0n };

      const data: any = await res.json();
      const stxMicro = BigInt(data.stx?.balance || 0);

      // Find sBTC in fungible tokens
      let sbtcSats = 0n;
      if (data.fungible_tokens) {
        for (const [key, val] of Object.entries(data.fungible_tokens)) {
          if (key.includes("sbtc-token::sbtc")) {
            sbtcSats = BigInt((val as any).balance || 0);
            break;
          }
        }
      }

      return { sbtcSats, stxMicro };
    } catch {
      return { sbtcSats: 0n, stxMicro: 0n };
    }
  }

  private async fetchPrices(): Promise<{ btcPrice: number; stxPrice: number }> {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,blockstack&vs_currencies=usd"
      );
      if (!res.ok) return { btcPrice: 100000, stxPrice: 2.0 };
      const data: any = await res.json();
      return {
        btcPrice: data.bitcoin?.usd || 100000,
        stxPrice: data.blockstack?.usd || 2.0,
      };
    } catch {
      return { btcPrice: 100000, stxPrice: 2.0 };
    }
  }

  // ============================================
  // DEPOSIT EXECUTION
  // ============================================

  private async executeDeposit(amount: bigint): Promise<void> {
    if (!this.zest) {
      log("No Zest client available for deposits");
      return;
    }

    log(`Depositing ${formatSats(amount)} to Zest...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log(`Attempt ${attempt}/${MAX_RETRIES}...`);
        const result = await this.zest.supplyToZest(amount);

        if (result.success && result.txId) {
          log(`Transaction broadcast: ${result.txId}`);
          const confirmed = await this.waitForTx(result.txId);

          if (confirmed) {
            log(`Deposit confirmed`);
            this.stats.depositsExecuted++;
            this.stats.totalDeposited += amount;
            this.stats.lastDeposit = new Date();
            return;
          } else {
            log(`Transaction timed out`);
          }
        } else {
          log(`Transaction failed: ${result.error}`);
        }
      } catch (error: any) {
        log(`Attempt ${attempt} failed: ${error.message}`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        log(`Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }

    log("Deposit failed after all retries");
    this.stats.errors++;
  }

  private async waitForTx(txId: string): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < TX_TIMEOUT_MS) {
      try {
        const res = await fetch(`https://api.hiro.so/extended/v1/tx/${txId}`);
        if (res.ok) {
          const data: any = await res.json();
          if (data.tx_status === "success") return true;
          if (data.tx_status?.startsWith("abort")) return false;
        }
      } catch { /* continue polling */ }
      await sleep(TX_POLL_INTERVAL_MS);
    }
    return false;
  }

  // ============================================
  // DISPLAY
  // ============================================

  private printBanner(): void {
    const mode = this.config.dryRun ? "DRY RUN" : "LIVE";
    const net = this.config.network.toUpperCase();
    const intervalMin = Math.round(this.config.intervalMs / 60000);

    console.log(`
╔══════════════════════════════════════════════════╗
║        YIELD HUNTER - AUTONOMOUS AGENT           ║
║══════════════════════════════════════════════════║
║  Mode:     ${mode.padEnd(38)}║
║  Network:  ${net.padEnd(38)}║
║  Address:  ${this.config.address.slice(0, 20)}...${(" ").padEnd(16)}║
║  Interval: ${(intervalMin + " min").padEnd(38)}║
║  Min APY:  ${(this.config.minApyThreshold + "%").padEnd(38)}║
║  Max Risk: ${(this.config.maxRiskScore + "").padEnd(38)}║
║  API:      ${this.config.apiUrl.slice(0, 38).padEnd(38)}║
╚══════════════════════════════════════════════════╝
`);
  }

  private printOpportunityTable(all: YieldOpportunity[], ranked: (YieldOpportunity & { adjustedScore: number })[]): void {
    console.log("\n┌─────────────┬──────────────┬────────┬───────┬──────────────┬────────┐");
    console.log("│ Protocol    │ Pool         │ APY    │ Risk  │ TVL          │ Type   │");
    console.log("├─────────────┼──────────────┼────────┼───────┼──────────────┼────────┤");

    for (const y of all) {
      const proto = y.protocol.slice(0, 11).padEnd(11);
      const pool = y.pool.slice(0, 12).padEnd(12);
      const apy = (y.apy.toFixed(2) + "%").padStart(6);
      const risk = String(y.riskScore).padStart(5);
      const tvl = formatUsd(y.tvlUsd).padStart(12);
      const type = y.type.padEnd(6);
      console.log(`│ ${proto} │ ${pool} │ ${apy} │ ${risk} │ ${tvl} │ ${type} │`);
    }

    console.log("└─────────────┴──────────────┴────────┴───────┴──────────────┴────────┘");

    if (ranked.length > 0) {
      console.log("\nRisk-adjusted ranking:");
      for (let i = 0; i < Math.min(3, ranked.length); i++) {
        const r = ranked[i];
        console.log(`  ${i + 1}. ${r.protocol} ${r.pool} — ${r.apy.toFixed(2)}% APY, risk ${r.riskScore}, score ${r.adjustedScore.toFixed(2)}`);
      }
    } else {
      console.log("\nNo opportunities meet criteria");
    }
  }

  printStats(): void {
    const runtime = Date.now() - this.stats.startedAt.getTime();
    const hours = Math.floor(runtime / 3600000);
    const minutes = Math.floor((runtime % 3600000) / 60000);

    console.log(`
╔══════════════════════════════════════════════════╗
║              AGENT STATISTICS                    ║
╠══════════════════════════════════════════════════╣`);
    console.log(`║  Runtime:        ${(hours + "h " + minutes + "m").padEnd(32)}║`);
    console.log(`║  Scans:          ${String(this.stats.scansCompleted).padEnd(32)}║`);
    console.log(`║  Deposits:       ${String(this.stats.depositsExecuted).padEnd(32)}║`);
    console.log(`║  Total deposited:${formatSats(this.stats.totalDeposited).padEnd(32)}║`);
    console.log(`║  Errors:         ${String(this.stats.errors).padEnd(32)}║`);

    if (this.stats.bestApySeen > 0) {
      console.log(`║  Best APY seen:  ${(this.stats.bestApySeen.toFixed(2) + "% (" + this.stats.bestProtocolSeen + ")").slice(0, 32).padEnd(32)}║`);
    }

    if (this.stats.zestPosition > 0n) {
      console.log(`║  Zest position:  ${formatSats(this.stats.zestPosition).slice(0, 32).padEnd(32)}║`);
      console.log(`║  Compounded:     ${formatSats(this.stats.earnedFromCompounding).slice(0, 32).padEnd(32)}║`);
    }

    console.log(`╚══════════════════════════════════════════════════╝`);
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }
}

// ============================================
// FACTORY
// ============================================

export function createAutonomousAgent(
  overrides: Partial<AutonomousConfig> & { address: string }
): AutonomousYieldAgent {
  const config: AutonomousConfig = {
    address: overrides.address,
    privateKey: overrides.privateKey,
    intervalMs: overrides.intervalMs ?? DEFAULT_INTERVAL_MS,
    minApyThreshold: overrides.minApyThreshold ?? 1,
    maxRiskScore: overrides.maxRiskScore ?? 50,
    minDepositSats: overrides.minDepositSats ?? 10000n,
    feeBufferSats: overrides.feeBufferSats ?? 50000n,
    dryRun: overrides.dryRun ?? true,
    runOnce: overrides.runOnce ?? false,
    network: overrides.network ?? "mainnet",
    apiUrl: overrides.apiUrl ?? DEFAULT_API_URL,
  };

  return new AutonomousYieldAgent(config);
}
