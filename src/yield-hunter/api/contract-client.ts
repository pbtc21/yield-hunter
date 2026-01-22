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

const DEFAULT_CONTRACTS = {
  mainnet: {
    yieldHunter: "SP...yield-hunter",
    adapter: "SP...yield-hunter-adapter",
    oracle: "SP...yield-hunter-oracle",
    sbtc: "STV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RJ5XDY2.sbtc-token",
  },
  testnet: {
    yieldHunter: "ST...yield-hunter",
    adapter: "ST...yield-hunter-adapter",
    oracle: "ST...yield-hunter-oracle",
    sbtc: "ST...sbtc-token",
  },
  devnet: {
    yieldHunter: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter",
    adapter: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter-adapter",
    oracle: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-hunter-oracle",
    sbtc: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token",
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
   */
  async huntYield(params: HuntYieldParams): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");

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
   */
  async exitPosition(params: ExitPositionParams): Promise<TransactionResult> {
    if (!this.senderKey) {
      return { success: false, error: "Sender key not configured" };
    }

    const [contractAddr, contractName] = this.contracts.yieldHunter.split(".");

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
