/**
 * Contract Client
 * Interact with Yield Hunter Clarity contracts
 */

import {
  makeContractCall,
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  Cl,
  fetchCallReadOnlyFunction,
  cvToValue,
  makeStandardFungiblePostCondition,
  FungibleConditionCode,
  createAssetInfo,
} from "@stacks/transactions";
import { StacksNetwork, StacksMainnet, StacksTestnet } from "@stacks/network";
import type {
  HunterState,
  Position,
  LeaderboardEntry,
  RiskAssessment,
  TransactionResult,
  HuntYieldParams,
  CompoundYieldsParams,
  ExitPositionParams,
} from "../types";

// ============================================
// CONFIGURATION
// ============================================

interface ContractConfig {
  network: "mainnet" | "testnet" | "devnet";
  yieldHunterContract: string;
  adapterContract: string;
  oracleContract: string;
  sbtcContract: string;
  senderKey?: string;
  senderAddress?: string;
}

// Contract addresses - MUST be updated before mainnet deployment
// These are placeholder addresses for development
const DEFAULT_CONTRACTS = {
  mainnet: {
    // WARNING: These addresses must be set after mainnet deployment
    yieldHunter: "", // Set after deployment
    adapter: "", // Set after deployment
    oracle: "", // Set after deployment
    sbtc: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token", // Official sBTC mainnet
    // Zest Protocol mainnet contracts
    zest: {
      poolBorrow: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-3",
      borrowHelper: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-5",
      poolReserve: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve",
      zsBTC: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0",
    },
  },
  testnet: {
    // Testnet contract addresses - deploy these first
    yieldHunter: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter",
    adapter: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter-adapter",
    oracle: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter-oracle",
    sbtc: "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token", // Testnet sBTC
    // Zest not available on testnet
    zest: {
      poolBorrow: "",
      borrowHelper: "",
      poolReserve: "",
      zsBTC: "",
    },
  },
  devnet: {
    yieldHunter: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter",
    adapter: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter-adapter",
    oracle: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter-oracle",
    sbtc: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token",
    zest: {
      poolBorrow: "",
      borrowHelper: "",
      poolReserve: "",
      zsBTC: "",
    },
  },
};

// ============================================
// CONTRACT CLIENT
// ============================================

export class ContractClient {
  private network: StacksNetwork;
  private networkName: "mainnet" | "testnet" | "devnet";
  private contracts: typeof DEFAULT_CONTRACTS.devnet;
  private senderKey?: string;
  private senderAddress?: string;

  constructor(config: Partial<ContractConfig> = {}) {
    this.networkName = config.network || "testnet";
    this.network =
      this.networkName === "mainnet" ? new StacksMainnet() : new StacksTestnet();
    this.contracts = DEFAULT_CONTRACTS[this.networkName];
    this.senderKey = config.senderKey;
    this.senderAddress = config.senderAddress;

    // Override contracts if provided
    if (config.yieldHunterContract)
      this.contracts.yieldHunter = config.yieldHunterContract;
    if (config.adapterContract) this.contracts.adapter = config.adapterContract;
    if (config.oracleContract) this.contracts.oracle = config.oracleContract;
    if (config.sbtcContract) this.contracts.sbtc = config.sbtcContract;
  }

  // ============================================
  // READ-ONLY FUNCTIONS
  // ============================================

  /**
   * Get hunter state
   */
  async getHunter(hunterAccount: string): Promise<HunterState | null> {
    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");
    const result = await fetchCallReadOnlyFunction({
      contractAddress: contractAddr,
      contractName: contractName,
      functionName: "get-hunter",
      functionArgs: [Cl.principal(hunterAccount)],
      network: this.network,
      senderAddress: this.senderAddress || contractAddr,
    });

    const value = cvToValue(result);
    if (!value) return null;

    return {
      agentAccount: hunterAccount,
      owner: value.owner,
      agent: value.agent,
      bitcoinAgentId: Number(value["bitcoin-agent-id"]),
      identityId: Number(value["identity-id"]),
      initializedAt: Number(value["initialized-at"]),
      totalInvested: BigInt(value["total-invested"]),
      totalYieldsEarned: BigInt(value["total-yields-earned"]),
      totalPositionsOpened: Number(value["total-positions-opened"]),
      totalPositionsClosed: Number(value["total-positions-closed"]),
      lastHuntBlock: Number(value["last-hunt-block"]),
      lastProfitableBlock: Number(value["last-profitable-block"]),
      peakPortfolioValue: BigInt(value["peak-portfolio-value"]),
      alive: value.alive,
      strategyConfig: {
        minApyThreshold: Number(value["strategy-config"]["min-apy-threshold"]),
        maxRiskScore: Number(value["strategy-config"]["max-risk-score"]),
        autoCompound: value["strategy-config"]["auto-compound"],
        rebalanceThresholdBps: Number(
          value["strategy-config"]["rebalance-threshold-bps"]
        ),
        maxPositionSizeBps: 2500,
        maxTotalPositions: 10,
      },
    };
  }

  /**
   * Get position by ID
   */
  async getPosition(positionId: number): Promise<Position | null> {
    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");
    const result = await fetchCallReadOnlyFunction({
      contractAddress: contractAddr,
      contractName: contractName,
      functionName: "get-position",
      functionArgs: [Cl.uint(positionId)],
      network: this.network,
      senderAddress: this.senderAddress || contractAddr,
    });

    const value = cvToValue(result);
    if (!value) return null;

    return {
      positionId,
      hunter: value.hunter,
      poolContract: value["pool-contract"],
      tokenX: value["token-x"],
      tokenY: value["token-y"],
      amountInvested: BigInt(value["amount-invested"]),
      lpTokensHeld: BigInt(value["lp-tokens-held"]),
      entryBlock: Number(value["entry-block"]),
      entryPriceX: BigInt(value["entry-price-x"]),
      entryPriceY: BigInt(value["entry-price-y"]),
      lastCompoundBlock: Number(value["last-compound-block"]),
      riskScore: Number(value["risk-score"]),
      active: value.active,
    };
  }

  /**
   * Get hunter's positions
   */
  async getHunterPositions(hunterAccount: string): Promise<number[]> {
    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");
    const result = await fetchCallReadOnlyFunction({
      contractAddress: contractAddr,
      contractName: contractName,
      functionName: "get-hunter-positions",
      functionArgs: [Cl.principal(hunterAccount)],
      network: this.network,
      senderAddress: this.senderAddress || contractAddr,
    });

    const value = cvToValue(result);
    return (value || []).map((id: any) => Number(id));
  }

  /**
   * Get leaderboard entry by rank
   */
  async getLeaderboardEntry(rank: number): Promise<LeaderboardEntry | null> {
    const [contractAddr, contractName] = this.contracts.oracle.split(".");
    const result = await fetchCallReadOnlyFunction({
      contractAddress: contractAddr,
      contractName: contractName,
      functionName: "get-leaderboard-entry",
      functionArgs: [Cl.uint(rank)],
      network: this.network,
      senderAddress: this.senderAddress || contractAddr,
    });

    const value = cvToValue(result);
    if (!value) return null;

    return {
      rank,
      hunterAccount: value.hunter || "",
      name: value.name || "",
      owner: value.owner || "",
      bitcoinFaceId: Number(value["bitcoin-face-id"] || 0),
      totalEarnings: BigInt(value["total-earnings"] || 0),
      totalInvested: BigInt(value["total-invested"] || 0),
      positionsOpened: Number(value["positions-opened"] || 0),
      positionsClosed: Number(value["positions-closed"] || 0),
      profitablePositions: Number(value["profitable-positions"] || 0),
      winRateBps: Number(value["win-rate-bps"] || 0),
      bestApyBps: Number(value["best-apy-bps"] || 0),
      worstLossBps: Number(value["worst-loss-bps"] || 0),
      registeredAt: Number(value["registered-at"] || 0),
      lastActive: Number(value["last-active"] || 0),
      alive: value.alive !== false,
    };
  }

  /**
   * Get top hunters
   */
  async getTopHunters(count: number = 10): Promise<LeaderboardEntry[]> {
    const entries: LeaderboardEntry[] = [];
    for (let i = 1; i <= count; i++) {
      const entry = await this.getLeaderboardEntry(i);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /**
   * Get global stats
   */
  async getStats(): Promise<any> {
    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");
    const result = await fetchCallReadOnlyFunction({
      contractAddress: contractAddr,
      contractName: contractName,
      functionName: "get-stats",
      functionArgs: [],
      network: this.network,
      senderAddress: this.senderAddress || contractAddr,
    });

    return cvToValue(result);
  }

  // ============================================
  // WRITE FUNCTIONS
  // ============================================

  /**
   * Initialize a new yield hunter
   */
  async initializeHunter(
    agentAccount: string,
    owner: string,
    agent: string,
    bitcoinAgentId: number,
    identityId: number,
    minApyThreshold: number,
    maxRiskScore: number,
    autoCompound: boolean,
    rebalanceThresholdBps: number
  ): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");

    try {
      const tx = await makeContractCall({
        contractAddress: contractAddr,
        contractName: contractName,
        functionName: "initialize-hunter",
        functionArgs: [
          Cl.principal(agentAccount),
          Cl.principal(owner),
          Cl.principal(agent),
          Cl.uint(bitcoinAgentId),
          Cl.uint(identityId),
          Cl.uint(minApyThreshold),
          Cl.uint(maxRiskScore),
          Cl.bool(autoCompound),
          Cl.uint(rebalanceThresholdBps),
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
   * Hunt yield - invest in a pool
   * SECURITY: Uses PostConditionMode.Deny with explicit post conditions
   * to ensure only the specified amount of sBTC can be transferred
   */
  async huntYield(params: HuntYieldParams): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    if (!this.contracts.yieldHunter) {
      return { success: false, error: "Yield hunter contract address not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");
    const [sbtcAddr, sbtcName] = this.contracts.sbtc.split(".");

    // Create post condition: hunter can only send exactly the specified amount of sBTC
    // This prevents the contract from transferring more than expected
    const postConditions = [
      makeStandardFungiblePostCondition(
        params.hunterAccount,
        FungibleConditionCode.Equal,
        params.amount,
        createAssetInfo(sbtcAddr, sbtcName, "sbtc")
      ),
    ];

    try {
      const tx = await makeContractCall({
        contractAddress: contractAddr,
        contractName: contractName,
        functionName: "hunt-yield",
        functionArgs: [
          Cl.principal(params.hunterAccount),
          Cl.principal(params.poolContract),
          Cl.uint(params.amount),
          Cl.uint(params.minLpTokens),
          Cl.uint(params.riskScore),
        ],
        network: this.network,
        senderKey: this.senderKey,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny, // CRITICAL: Deny unexpected transfers
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
   * Compound yields
   */
  async compoundYields(params: CompoundYieldsParams): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");

    try {
      const tx = await makeContractCall({
        contractAddress: contractAddr,
        contractName: contractName,
        functionName: "compound-yields",
        functionArgs: [
          Cl.principal(params.hunterAccount),
          Cl.uint(params.positionId),
          Cl.principal(params.poolContract),
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
   * Exit a position
   * SECURITY: Uses PostConditionMode.Deny - the contract will ensure
   * minimum receive amount, and post condition ensures hunter receives
   * at least the minReceive amount
   */
  async exitPosition(params: ExitPositionParams): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    if (!this.contracts.yieldHunter) {
      return { success: false, error: "Yield hunter contract address not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");
    const [sbtcAddr, sbtcName] = this.contracts.sbtc.split(".");

    // Post condition: hunter must receive at least minReceive amount of sBTC
    // This protects against slippage attacks
    const postConditions = [
      makeStandardFungiblePostCondition(
        params.hunterAccount,
        FungibleConditionCode.GreaterEqual,
        params.minReceive,
        createAssetInfo(sbtcAddr, sbtcName, "sbtc")
      ),
    ];

    try {
      const tx = await makeContractCall({
        contractAddress: contractAddr,
        contractName: contractName,
        functionName: "exit-position",
        functionArgs: [
          Cl.principal(params.hunterAccount),
          Cl.uint(params.positionId),
          Cl.principal(params.poolContract),
          Cl.uint(params.minReceive),
        ],
        network: this.network,
        senderKey: this.senderKey,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny, // CRITICAL: Deny unexpected transfers
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
   * Check death conditions
   */
  async checkDeath(hunterAccount: string): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");

    try {
      const tx = await makeContractCall({
        contractAddress: contractAddr,
        contractName: contractName,
        functionName: "check-hunt-death",
        functionArgs: [Cl.principal(hunterAccount)],
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
}

// Export singleton
export const contracts = new ContractClient();
