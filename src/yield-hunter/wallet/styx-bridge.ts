/**
 * Styx Bridge Integration
 * BTC → sBTC conversion for funding Yield Hunter agents
 *
 * Uses Styx protocol for trustless, single-block confirmations
 * Best for deposits under $100 (~0.001 BTC at current prices)
 *
 * @see https://github.com/Rapha-btc/styx-integration-example
 * @see https://www.npmjs.com/package/@faktoryfun/styx-sdk
 */

// ============================================
// TYPES
// ============================================

export interface StyxConfig {
  network: "mainnet" | "testnet";
  onStatusChange?: (status: DepositStatus) => void;
}

export interface DepositRequest {
  amount: number; // in sats
  recipientAddress: string; // Stacks address to receive sBTC
  priority: TransactionPriority;
}

export interface DepositResult {
  depositId: string;
  btcTxId?: string;
  status: DepositStatus;
  amountSats: number;
  feeSats: number;
  estimatedConfirmationTime: number; // in minutes
}

export interface PoolStatus {
  availableLiquidity: number; // sats
  totalCapacity: number; // sats
  utilizationRate: number; // 0-1
  minDeposit: number; // sats
  maxDeposit: number; // sats
}

export type DepositStatus = "pending" | "broadcast" | "confirmed" | "canceled" | "failed";

export type TransactionPriority = "low" | "medium" | "high";

export interface PreparedTransaction {
  depositId: string;
  psbt: string; // Partially Signed Bitcoin Transaction
  feeRate: number;
  totalFee: number;
  outputAmount: number;
}

// ============================================
// CONSTANTS
// ============================================

// Styx limits (in sats)
export const MIN_DEPOSIT_SATS = 10_000; // 0.0001 BTC
export const MAX_DEPOSIT_SATS = 10_000_000; // 0.1 BTC (~$10,000 at $100k/BTC)

// Fee estimates by priority (sats/vbyte)
const FEE_RATES: Record<TransactionPriority, number> = {
  low: 5,
  medium: 15,
  high: 30,
};

// ============================================
// STYX BRIDGE CLIENT
// ============================================

export class StyxBridge {
  private config: StyxConfig;
  private activeDeposits: Map<string, DepositResult> = new Map();

  constructor(config: StyxConfig) {
    this.config = config;
  }

  /**
   * Get current pool status
   */
  async getPoolStatus(): Promise<PoolStatus> {
    // In production: call styxSDK.getPoolStatus()
    // Mock for development
    return {
      availableLiquidity: 50_000_000, // 0.5 BTC
      totalCapacity: 100_000_000, // 1 BTC
      utilizationRate: 0.5,
      minDeposit: MIN_DEPOSIT_SATS,
      maxDeposit: MAX_DEPOSIT_SATS,
    };
  }

  /**
   * Get current BTC price
   */
  async getBtcPrice(): Promise<number> {
    // In production: call styxSDK.getBtcPrice()
    return 95000; // USD
  }

  /**
   * Check if deposit amount is valid
   */
  validateAmount(amountSats: number): { valid: boolean; error?: string } {
    if (amountSats < MIN_DEPOSIT_SATS) {
      return {
        valid: false,
        error: `Minimum deposit is ${MIN_DEPOSIT_SATS} sats (${(MIN_DEPOSIT_SATS / 100_000_000).toFixed(8)} BTC)`,
      };
    }
    if (amountSats > MAX_DEPOSIT_SATS) {
      return {
        valid: false,
        error: `Maximum deposit is ${MAX_DEPOSIT_SATS} sats (${(MAX_DEPOSIT_SATS / 100_000_000).toFixed(8)} BTC)`,
      };
    }
    return { valid: true };
  }

  /**
   * Prepare a BTC → sBTC deposit transaction
   */
  async prepareDeposit(request: DepositRequest): Promise<PreparedTransaction> {
    const validation = this.validateAmount(request.amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check pool liquidity
    const pool = await this.getPoolStatus();
    if (request.amount > pool.availableLiquidity) {
      throw new Error(`Insufficient pool liquidity. Available: ${pool.availableLiquidity} sats`);
    }

    // In production: call styxSDK.prepareTransaction()
    const feeRate = FEE_RATES[request.priority];
    const estimatedTxSize = 250; // typical P2WPKH tx size
    const totalFee = feeRate * estimatedTxSize;

    const depositId = `styx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    return {
      depositId,
      psbt: "mock-psbt-base64", // Would be actual PSBT from SDK
      feeRate,
      totalFee,
      outputAmount: request.amount - totalFee,
    };
  }

  /**
   * Execute a prepared deposit (after wallet signing)
   */
  async executeDeposit(depositId: string, signedPsbt: string): Promise<DepositResult> {
    // In production: broadcast transaction and update status
    // await styxSDK.broadcastTransaction(signedPsbt)

    const result: DepositResult = {
      depositId,
      btcTxId: `btc-${Date.now().toString(16)}`, // Mock txid
      status: "broadcast",
      amountSats: 100_000, // Would come from actual tx
      feeSats: 3750,
      estimatedConfirmationTime: 10, // minutes
    };

    this.activeDeposits.set(depositId, result);
    this.notifyStatusChange(result.status);

    // In production: update Styx pool status
    // await styxSDK.updateDepositStatus({ id: depositId, data: { btcTxId: result.btcTxId, status: "broadcast" } })

    return result;
  }

  /**
   * Cancel a pending deposit (releases pool liquidity)
   */
  async cancelDeposit(depositId: string): Promise<void> {
    const deposit = this.activeDeposits.get(depositId);
    if (deposit && deposit.status === "pending") {
      deposit.status = "canceled";
      this.notifyStatusChange("canceled");

      // In production: release liquidity
      // await styxSDK.updateDepositStatus({ id: depositId, data: { status: "canceled" } })
    }
  }

  /**
   * Get deposit history for an address
   */
  async getDepositHistory(stacksAddress: string): Promise<DepositResult[]> {
    // In production: call styxSDK.getDepositHistory(stacksAddress)
    return Array.from(this.activeDeposits.values());
  }

  /**
   * Check deposit status
   */
  async getDepositStatus(depositId: string): Promise<DepositResult | null> {
    return this.activeDeposits.get(depositId) || null;
  }

  /**
   * Estimate fees for different priorities
   */
  async estimateFees(amountSats: number): Promise<Record<TransactionPriority, { fee: number; time: string }>> {
    const txSize = 250;
    return {
      low: { fee: FEE_RATES.low * txSize, time: "~60 min" },
      medium: { fee: FEE_RATES.medium * txSize, time: "~30 min" },
      high: { fee: FEE_RATES.high * txSize, time: "~10 min" },
    };
  }

  private notifyStatusChange(status: DepositStatus): void {
    if (this.config.onStatusChange) {
      this.config.onStatusChange(status);
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format sats to BTC string
 */
export function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

/**
 * Format sats to USD string
 */
export function satsToUsd(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return `$${(btc * btcPrice).toFixed(2)}`;
}

/**
 * Check if amount is suitable for Styx (under ~$100)
 * For larger amounts, recommend sBTC bridge directly
 */
export function recommendBridge(amountSats: number, btcPrice: number): "styx" | "sbtc-bridge" {
  const usdValue = (amountSats / 100_000_000) * btcPrice;
  return usdValue <= 100 ? "styx" : "sbtc-bridge";
}

// ============================================
// FACTORY
// ============================================

export function createStyxBridge(config: StyxConfig): StyxBridge {
  return new StyxBridge(config);
}
