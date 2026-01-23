/**
 * Zest Protocol Client
 * Real integration with Zest Protocol for sBTC supply/withdraw
 */

import {
  callReadOnlyFunction,
  cvToValue,
  Cl,
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  createFungiblePostCondition,
  FungibleConditionCode,
  createAssetInfo,
} from "@stacks/transactions";
import { StacksNetwork, StacksMainnet, StacksTestnet } from "@stacks/network";
import type { ZestReserveState, ZestPosition, TransactionResult } from "../types";

// ============================================
// ZEST MAINNET CONTRACT ADDRESSES
// ============================================

export const ZEST_CONTRACTS = {
  mainnet: {
    poolBorrow: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-3",
    borrowHelper: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-5",
    poolReserve: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve",
    zsBTC: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0",
    sbtc: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  },
  testnet: {
    poolBorrow: "",
    borrowHelper: "",
    poolReserve: "",
    zsBTC: "",
    sbtc: "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token",
  },
};

// Scale factors
const SCALE_8 = 100_000_000n; // 1e8
const SCALE_18 = BigInt("1000000000000000000"); // 1e18 (Zest uses this for rates)
const BPS_SCALE = 10000n;
const BLOCKS_PER_YEAR = 52560n; // ~10 min blocks

// Default sender address for read-only calls (can be any valid address)
const DEFAULT_SENDER = "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N";

// ============================================
// ZEST CLIENT
// ============================================

export class ZestClient {
  private network: StacksNetwork;
  private networkName: "mainnet" | "testnet";
  private contracts: typeof ZEST_CONTRACTS.mainnet;
  private senderKey?: string;
  private senderAddress?: string;

  constructor(config: {
    network?: "mainnet" | "testnet";
    senderKey?: string;
    senderAddress?: string;
  } = {}) {
    this.networkName = config.network || "mainnet";
    this.network = this.networkName === "mainnet" ? new StacksMainnet() : new StacksTestnet();
    this.contracts = ZEST_CONTRACTS[this.networkName];
    this.senderKey = config.senderKey;
    this.senderAddress = config.senderAddress;
  }

  // ============================================
  // READ-ONLY FUNCTIONS
  // ============================================

  /**
   * Get Zest reserve state for sBTC pool
   * Uses the real get-reserve-state function which takes a principal
   */
  async getZestReserveState(): Promise<ZestReserveState | null> {
    try {
      const [poolAddr, poolName] = this.contracts.poolReserve.split(".");

      // get-reserve-state takes a principal (the asset address)
      const result = await callReadOnlyFunction({
        contractAddress: poolAddr,
        contractName: poolName,
        functionName: "get-reserve-state",
        functionArgs: [Cl.principal(this.contracts.sbtc)],
        network: this.network,
        senderAddress: DEFAULT_SENDER,
      });

      const value = cvToValue(result);
      if (!value || value.value === null) return null;

      const data = value.value || value;

      // Helper to extract uint value from nested response
      const getUint = (field: any): bigint => {
        if (typeof field === "bigint") return field;
        if (typeof field === "number") return BigInt(field);
        if (typeof field === "string") return BigInt(field);
        if (field?.value !== undefined) return BigInt(field.value);
        return 0n;
      };

      // Zest uses 1e8 scale for rates (annual rates)
      // e.g., 37209 = 0.037209% APY, 5041007 = 5.04% APY
      const liquidityRate = getUint(data["current-liquidity-rate"]);
      const borrowRateRaw = getUint(data["current-variable-borrow-rate"]);

      // Convert from 1e8 to basis points: rate / 1e8 * 10000 = rate / 1e4
      const supplyRateBps = Number(liquidityRate / 10000n);
      const borrowRateBps = Number(borrowRateRaw / 10000n);

      const totalBorrowsStable = getUint(data["total-borrows-stable"]);
      const totalBorrowsVariable = getUint(data["total-borrows-variable"]);
      const totalBorrow = totalBorrowsStable + totalBorrowsVariable;

      // Get total supply from zsBTC token
      const totalSupply = await this.getZsBTCTotalSupply();

      // Calculate utilization
      const utilizationRate = totalSupply > 0n
        ? Number((totalBorrow * 10000n) / totalSupply) / 100
        : 0;

      return {
        totalSupply,
        totalBorrow,
        supplyRate: supplyRateBps,
        borrowRate: borrowRateBps,
        utilizationRate,
      };
    } catch (error) {
      console.error("Error fetching Zest reserve state:", error);
      return null;
    }
  }

  /**
   * Get zsBTC total supply (represents total sBTC supplied to Zest)
   */
  async getZsBTCTotalSupply(): Promise<bigint> {
    try {
      const [tokenAddr, tokenName] = this.contracts.zsBTC.split(".");

      const result = await callReadOnlyFunction({
        contractAddress: tokenAddr,
        contractName: tokenName,
        functionName: "get-total-supply",
        functionArgs: [],
        network: this.network,
        senderAddress: DEFAULT_SENDER,
      });

      const value = cvToValue(result);
      return BigInt(value?.value || value || 0);
    } catch (error) {
      console.error("Error fetching zsBTC total supply:", error);
      return 0n;
    }
  }

  /**
   * Get current Zest supply APY for sBTC
   * Returns APY in basis points (e.g., 500 = 5%)
   */
  async getZestSupplyAPY(): Promise<number> {
    try {
      const reserveState = await this.getZestReserveState();
      if (reserveState && reserveState.supplyRate > 0) {
        return reserveState.supplyRate;
      }
      // Fallback if we couldn't get the rate
      return 400; // 4% default
    } catch (error) {
      console.error("Error fetching Zest supply APY:", error);
      return 400;
    }
  }

  /**
   * Get user's Zest position (supplied sBTC)
   * Uses get-user-reserve-data which takes (who, reserve) as principals
   */
  async getZestPosition(address: string): Promise<ZestPosition | null> {
    try {
      const [poolAddr, poolName] = this.contracts.poolReserve.split(".");

      const result = await callReadOnlyFunction({
        contractAddress: poolAddr,
        contractName: poolName,
        functionName: "get-user-reserve-data",
        functionArgs: [
          Cl.principal(address),
          Cl.principal(this.contracts.sbtc),
        ],
        network: this.network,
        senderAddress: DEFAULT_SENDER,
      });

      const value = cvToValue(result);
      if (!value) return null;

      // Also get their zsBTC balance which represents their actual supplied amount
      const zsBTCBalance = await this.getZsBTCBalance(address);

      // Extract boolean from nested response (cvToValue returns {type: "bool", value: true/false})
      const collateralField = value["use-as-collateral"];
      const asCollateral = typeof collateralField === "boolean"
        ? collateralField
        : (collateralField?.value ?? false);

      return {
        supplied: zsBTCBalance,
        asCollateral,
      };
    } catch (error) {
      console.error("Error fetching Zest position:", error);
      return null;
    }
  }

  /**
   * Get zsBTC balance for an address (Zest LP token for sBTC)
   */
  async getZsBTCBalance(address: string): Promise<bigint> {
    try {
      const [tokenAddr, tokenName] = this.contracts.zsBTC.split(".");

      const result = await callReadOnlyFunction({
        contractAddress: tokenAddr,
        contractName: tokenName,
        functionName: "get-balance",
        functionArgs: [Cl.principal(address)],
        network: this.network,
        senderAddress: DEFAULT_SENDER,
      });

      const value = cvToValue(result);
      return BigInt(value?.value || value || 0);
    } catch (error) {
      console.error("Error fetching zsBTC balance:", error);
      return 0n;
    }
  }

  /**
   * Get list of assets the user has supplied/borrowed
   */
  async getUserAssets(address: string): Promise<{ supplied: string[]; borrowed: string[] }> {
    try {
      const [poolAddr, poolName] = this.contracts.poolReserve.split(".");

      const result = await callReadOnlyFunction({
        contractAddress: poolAddr,
        contractName: poolName,
        functionName: "get-user-assets",
        functionArgs: [Cl.principal(address)],
        network: this.network,
        senderAddress: DEFAULT_SENDER,
      });

      const value = cvToValue(result);
      return {
        supplied: value?.["assets-supplied"] || [],
        borrowed: value?.["assets-borrowed"] || [],
      };
    } catch (error) {
      console.error("Error fetching user assets:", error);
      return { supplied: [], borrowed: [] };
    }
  }

  // ============================================
  // WRITE FUNCTIONS
  // ============================================

  /**
   * Supply sBTC to Zest Protocol
   * Uses the borrow-helper contract for simpler interface
   */
  async supplyToZest(amount: bigint): Promise<TransactionResult> {
    if (!this.senderKey || !this.senderAddress) {
      return { success: false, error: "Sender key/address not configured" };
    }

    if (!this.contracts.borrowHelper) {
      return { success: false, error: "Zest contracts not configured for this network" };
    }

    const [helperAddr, helperName] = this.contracts.borrowHelper.split(".");
    const [sbtcAddr, sbtcName] = this.contracts.sbtc.split(".");

    // Post condition: sender sends exactly `amount` of sBTC
    const postConditions = [
      createFungiblePostCondition(
        this.senderAddress,
        FungibleConditionCode.Equal,
        amount,
        createAssetInfo(sbtcAddr, sbtcName, "sbtc")
      ),
    ];

    try {
      const tx = await makeContractCall({
        contractAddress: helperAddr,
        contractName: helperName,
        functionName: "supply",
        functionArgs: [
          Cl.contractPrincipal(...this.contracts.sbtc.split(".") as [string, string]),
          Cl.uint(amount),
          Cl.principal(this.senderAddress),
        ],
        network: this.network,
        senderKey: this.senderKey,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny,
        postConditions,
      });

      const result = await broadcastTransaction({ transaction: tx, network: this.network });

      if ("error" in result) {
        return { success: false, error: result.error };
      }

      return { success: true, txId: result.txid };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Withdraw sBTC from Zest Protocol
   */
  async withdrawFromZest(amount: bigint): Promise<TransactionResult> {
    if (!this.senderKey || !this.senderAddress) {
      return { success: false, error: "Sender key/address not configured" };
    }

    if (!this.contracts.borrowHelper) {
      return { success: false, error: "Zest contracts not configured for this network" };
    }

    const [helperAddr, helperName] = this.contracts.borrowHelper.split(".");

    try {
      const tx = await makeContractCall({
        contractAddress: helperAddr,
        contractName: helperName,
        functionName: "withdraw",
        functionArgs: [
          Cl.contractPrincipal(...this.contracts.sbtc.split(".") as [string, string]),
          Cl.uint(amount),
          Cl.principal(this.senderAddress),
        ],
        network: this.network,
        senderKey: this.senderKey,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      });

      const result = await broadcastTransaction({ transaction: tx, network: this.network });

      if ("error" in result) {
        return { success: false, error: result.error };
      }

      return { success: true, txId: result.txid };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate expected yield for a given amount over a period
   */
  calculateExpectedYield(amount: bigint, apyBps: number, blocks: number): bigint {
    const apyScaled = BigInt(apyBps);
    const blocksScaled = BigInt(blocks);
    return (amount * apyScaled * blocksScaled) / (BPS_SCALE * BLOCKS_PER_YEAR);
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  isAvailable(): boolean {
    return this.networkName === "mainnet" && !!this.contracts.poolBorrow;
  }

  getContracts() {
    return this.contracts;
  }
}

// Export singleton for convenience
export const zest = new ZestClient();

// Factory function
export function createZestClient(config?: {
  network?: "mainnet" | "testnet";
  senderKey?: string;
  senderAddress?: string;
}): ZestClient {
  return new ZestClient(config);
}
