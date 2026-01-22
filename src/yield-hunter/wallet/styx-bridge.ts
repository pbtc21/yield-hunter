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

import {
  StyxSDK,
  type DepositRequest as StyxDepositRequest,
  type PoolStatus as StyxPoolStatus,
} from "@faktoryfun/styx-sdk";

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
  btcAddress: string; // BTC address for refunds
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
  psbt: string; // Partially Signed Bitcoin Transaction (hex)
  feeRate: number;
  totalFee: number;
  outputAmount: number;
  depositAddress: string;
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

// Styx API endpoints
const STYX_ENDPOINTS = {
  mainnet: "https://styx-api.faktoryfun.com",
  testnet: "https://styx-testnet-api.faktoryfun.com",
};

// ============================================
// STYX BRIDGE CLIENT
// ============================================

export class StyxBridge {
  private config: StyxConfig;
  private sdk: StyxSDK;
  private activeDeposits: Map<string, DepositResult> = new Map();

  constructor(config: StyxConfig) {
    this.config = config;
    this.sdk = new StyxSDK({
      network: config.network,
      apiUrl: STYX_ENDPOINTS[config.network],
    });
  }

  /**
   * Get current pool status from Styx API
   */
  async getPoolStatus(): Promise<PoolStatus> {
    try {
      const pool = await this.sdk.getPoolStatus();
      return {
        availableLiquidity: pool.availableLiquidity,
        totalCapacity: pool.totalCapacity,
        utilizationRate: pool.availableLiquidity / pool.totalCapacity,
        minDeposit: pool.minDeposit || MIN_DEPOSIT_SATS,
        maxDeposit: pool.maxDeposit || MAX_DEPOSIT_SATS,
      };
    } catch (error) {
      console.error("Failed to get Styx pool status:", error);
      throw new Error("Unable to connect to Styx bridge. Please try again later.");
    }
  }

  /**
   * Get current BTC price from Styx or fallback
   */
  async getBtcPrice(): Promise<number> {
    try {
      const price = await this.sdk.getBtcPrice();
      return price;
    } catch (error) {
      // Fallback to public API
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      return data.bitcoin?.usd || 95000;
    }
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
        error: `Maximum deposit is ${MAX_DEPOSIT_SATS} sats (${(MAX_DEPOSIT_SATS / 100_000_000).toFixed(8)} BTC). For larger amounts, use the official sBTC bridge.`,
      };
    }
    return { valid: true };
  }

  /**
   * Prepare a BTC → sBTC deposit transaction
   * Returns PSBT for wallet signing
   */
  async prepareDeposit(request: DepositRequest): Promise<PreparedTransaction> {
    const validation = this.validateAmount(request.amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check pool liquidity
    const pool = await this.getPoolStatus();
    if (request.amount > pool.availableLiquidity) {
      throw new Error(
        `Insufficient pool liquidity. Available: ${pool.availableLiquidity} sats. ` +
        `Try a smaller amount or use the official sBTC bridge.`
      );
    }

    try {
      // Call Styx SDK to prepare the deposit
      const prepared = await this.sdk.prepareDeposit({
        amount: request.amount,
        recipientAddress: request.recipientAddress,
        refundAddress: request.btcAddress,
        feeRate: FEE_RATES[request.priority],
      });

      return {
        depositId: prepared.depositId,
        psbt: prepared.psbt, // Hex-encoded PSBT
        feeRate: FEE_RATES[request.priority],
        totalFee: prepared.fee,
        outputAmount: request.amount - prepared.fee,
        depositAddress: prepared.depositAddress,
      };
    } catch (error: any) {
      console.error("Failed to prepare Styx deposit:", error);
      throw new Error(`Failed to prepare deposit: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * Execute a prepared deposit after wallet signing
   * @param depositId - The deposit ID from prepareDeposit
   * @param signedPsbt - The signed PSBT (hex or base64)
   */
  async executeDeposit(depositId: string, signedPsbt: string): Promise<DepositResult> {
    try {
      // Broadcast the signed transaction via Styx
      const broadcast = await this.sdk.broadcastDeposit({
        depositId,
        signedPsbt,
      });

      const result: DepositResult = {
        depositId,
        btcTxId: broadcast.txid,
        status: "broadcast",
        amountSats: broadcast.amount,
        feeSats: broadcast.fee,
        estimatedConfirmationTime: this.estimateConfirmationTime(broadcast.feeRate),
      };

      this.activeDeposits.set(depositId, result);
      this.notifyStatusChange(result.status);

      // Start polling for confirmation
      this.pollConfirmation(depositId);

      return result;
    } catch (error: any) {
      console.error("Failed to execute Styx deposit:", error);
      throw new Error(`Failed to broadcast transaction: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * Poll for deposit confirmation
   */
  private async pollConfirmation(depositId: string): Promise<void> {
    const maxAttempts = 60; // 30 minutes at 30s intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await this.sdk.getDepositStatus(depositId);
        const deposit = this.activeDeposits.get(depositId);

        if (deposit && status.status !== deposit.status) {
          deposit.status = status.status as DepositStatus;
          deposit.btcTxId = status.btcTxId;
          this.notifyStatusChange(deposit.status);
        }

        if (status.status === "confirmed" || status.status === "failed") {
          return; // Stop polling
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 30000); // Poll every 30 seconds
        }
      } catch (error) {
        console.error("Error polling deposit status:", error);
      }
    };

    setTimeout(poll, 10000); // Start polling after 10 seconds
  }

  /**
   * Cancel a pending deposit (releases pool liquidity)
   */
  async cancelDeposit(depositId: string): Promise<void> {
    const deposit = this.activeDeposits.get(depositId);
    if (!deposit) {
      throw new Error("Deposit not found");
    }

    if (deposit.status !== "pending") {
      throw new Error(`Cannot cancel deposit with status: ${deposit.status}`);
    }

    try {
      await this.sdk.cancelDeposit(depositId);
      deposit.status = "canceled";
      this.notifyStatusChange("canceled");
    } catch (error: any) {
      throw new Error(`Failed to cancel deposit: ${error.message}`);
    }
  }

  /**
   * Get deposit history for an address
   */
  async getDepositHistory(stacksAddress: string): Promise<DepositResult[]> {
    try {
      const history = await this.sdk.getDepositHistory(stacksAddress);
      return history.map((d: any) => ({
        depositId: d.id,
        btcTxId: d.btcTxId,
        status: d.status as DepositStatus,
        amountSats: d.amount,
        feeSats: d.fee,
        estimatedConfirmationTime: 0,
      }));
    } catch (error) {
      console.error("Failed to get deposit history:", error);
      return [];
    }
  }

  /**
   * Check deposit status
   */
  async getDepositStatus(depositId: string): Promise<DepositResult | null> {
    // Check local cache first
    const cached = this.activeDeposits.get(depositId);
    if (cached) {
      return cached;
    }

    // Query Styx API
    try {
      const status = await this.sdk.getDepositStatus(depositId);
      return {
        depositId,
        btcTxId: status.btcTxId,
        status: status.status as DepositStatus,
        amountSats: status.amount,
        feeSats: status.fee,
        estimatedConfirmationTime: 0,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Estimate fees for different priorities
   */
  async estimateFees(amountSats: number): Promise<Record<TransactionPriority, { fee: number; time: string }>> {
    const txSize = 250; // Approximate vBytes for a standard deposit tx
    return {
      low: { fee: FEE_RATES.low * txSize, time: "~60 min" },
      medium: { fee: FEE_RATES.medium * txSize, time: "~30 min" },
      high: { fee: FEE_RATES.high * txSize, time: "~10 min" },
    };
  }

  private estimateConfirmationTime(feeRate: number): number {
    if (feeRate >= 30) return 10;
    if (feeRate >= 15) return 30;
    return 60;
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
