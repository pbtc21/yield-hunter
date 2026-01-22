/**
 * Tenero API Client
 * Market data, pool info, holder analytics for Stacks DeFi
 */

import type {
  PoolData,
  YieldOpportunity,
  TeneroPoolResponse,
  TeneroHolderResponse,
  TokenInfo,
} from "../types";

const TENERO_BASE = "https://api.tenero.io";

export class TeneroClient {
  private baseUrl: string;

  constructor(baseUrl: string = TENERO_BASE) {
    this.baseUrl = baseUrl;
  }

  // ============================================
  // POOLS
  // ============================================

  /**
   * Get trending pools by timeframe
   */
  async getTrendingPools(
    timeframe: "1h" | "24h" | "7d" = "24h"
  ): Promise<TeneroPoolResponse[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/pools/trending/${timeframe}`
    );
    if (!res.ok) throw new Error(`Tenero API error: ${res.status}`);
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Get pool details
   */
  async getPool(poolId: string): Promise<PoolData | null> {
    const res = await fetch(`${this.baseUrl}/v1/stacks/pools/${poolId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return this.mapPoolResponse(data.data);
  }

  /**
   * Get pool OHLC data
   */
  async getPoolOHLC(
    poolId: string,
    period: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" = "1h",
    limit: number = 24
  ): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/pools/${poolId}/ohlc?period=${period}&limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Search pools by token
   */
  async searchPools(query: string): Promise<TeneroPoolResponse[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/pools/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  // ============================================
  // TOKENS
  // ============================================

  /**
   * Get token info
   */
  async getToken(address: string): Promise<TokenInfo | null> {
    const res = await fetch(`${this.baseUrl}/v1/stacks/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      contract: address,
      symbol: data.data?.symbol || "",
      name: data.data?.name || "",
      decimals: data.data?.decimals || 8,
      price: parseFloat(data.data?.price || "0"),
    };
  }

  /**
   * Get token holders
   */
  async getTokenHolders(
    address: string,
    limit: number = 100
  ): Promise<TeneroHolderResponse[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/tokens/${address}/holders?limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Get token holder stats
   */
  async getHolderStats(address: string): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/tokens/${address}/holder_stats`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
  }

  /**
   * Get token market summary
   */
  async getMarketSummary(address: string): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/tokens/${address}/market_summary`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
  }

  // ============================================
  // MARKET
  // ============================================

  /**
   * Get top gainers
   */
  async getTopGainers(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/v1/stacks/market/top_gainers`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Get top losers
   */
  async getTopLosers(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/v1/stacks/market/top_losers`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  // ============================================
  // WALLETS
  // ============================================

  /**
   * Get wallet holdings
   */
  async getWalletHoldings(address: string): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/wallets/${address}/holdings`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Get wallet trades
   */
  async getWalletTrades(address: string, limit: number = 50): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/stacks/wallets/${address}/trades?limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  // ============================================
  // YIELD HUNTING HELPERS
  // ============================================

  /**
   * Find sBTC yield opportunities
   */
  async findSbtcOpportunities(
    minLiquidity: bigint = BigInt(100000000), // 1 BTC
    minApy: number = 100 // 1% APY
  ): Promise<YieldOpportunity[]> {
    // Get trending pools
    const pools = await this.getTrendingPools("24h");

    // Filter for sBTC pairs
    const sbtcPools = pools.filter(
      (p) =>
        p.token_a_symbol?.toLowerCase().includes("sbtc") ||
        p.token_b_symbol?.toLowerCase().includes("sbtc")
    );

    // Map to yield opportunities
    const opportunities: YieldOpportunity[] = [];

    for (const pool of sbtcPools) {
      const tvl = BigInt(pool.tvl || "0");
      const apy = pool.apy || 0;

      // Filter by criteria
      if (tvl < minLiquidity || apy < minApy) continue;

      // Get holder data for risk assessment
      const holders = await this.getTokenHolders(pool.contract, 100);
      const holderCount = holders.length;

      // Calculate risk score
      const riskScore = this.calculateRiskScore(
        tvl,
        BigInt(pool.volume_24h || "0"),
        holderCount,
        pool.created_at
      );

      opportunities.push({
        poolContract: pool.contract,
        poolName: pool.name,
        tokenX: pool.token_a,
        tokenY: pool.token_b,
        tokenXSymbol: pool.token_a_symbol,
        tokenYSymbol: pool.token_b_symbol,
        liquidity: tvl,
        volume24h: BigInt(pool.volume_24h || "0"),
        feeTier: 30, // Default 0.3%
        apy: Math.round(apy * 100), // Convert to BPS
        riskScore,
        holderCount,
        poolAge: pool.created_at
          ? Math.floor((Date.now() / 1000 - pool.created_at) / 600)
          : 0, // In blocks
        lastUpdated: Date.now(),
      });
    }

    // Sort by risk-adjusted APY
    opportunities.sort((a, b) => {
      const riskAdjustedA = (a.apy * (100 - a.riskScore)) / 100;
      const riskAdjustedB = (b.apy * (100 - b.riskScore)) / 100;
      return riskAdjustedB - riskAdjustedA;
    });

    return opportunities;
  }

  /**
   * Calculate risk score based on pool metrics
   */
  private calculateRiskScore(
    liquidity: bigint,
    volume24h: bigint,
    holderCount: number,
    createdAt: number
  ): number {
    // Liquidity risk (40% weight)
    const liquidityRisk =
      liquidity < BigInt(100000000)
        ? 80
        : liquidity < BigInt(1000000000)
          ? 50
          : liquidity < BigInt(10000000000)
            ? 25
            : 10;

    // Volume risk (25% weight)
    const volumeRisk =
      volume24h < BigInt(10000000)
        ? 70
        : volume24h < BigInt(100000000)
          ? 40
          : 15;

    // Concentration risk (20% weight)
    const concentrationRisk =
      holderCount < 10 ? 90 : holderCount < 50 ? 60 : holderCount < 200 ? 30 : 10;

    // Age risk (15% weight)
    const ageBlocks = createdAt
      ? Math.floor((Date.now() / 1000 - createdAt) / 600)
      : 0;
    const ageRisk =
      ageBlocks < 1440 ? 80 : ageBlocks < 4320 ? 50 : ageBlocks < 14400 ? 25 : 10;

    // Weighted average
    return Math.round(
      liquidityRisk * 0.4 +
        volumeRisk * 0.25 +
        concentrationRisk * 0.2 +
        ageRisk * 0.15
    );
  }

  /**
   * Map API response to PoolData
   */
  private mapPoolResponse(data: any): PoolData | null {
    if (!data) return null;
    return {
      contract: data.contract,
      name: data.name,
      tokenX: {
        contract: data.token_a,
        symbol: data.token_a_symbol,
        name: data.token_a_name || data.token_a_symbol,
        decimals: data.token_a_decimals || 8,
        price: parseFloat(data.token_a_price || "0"),
      },
      tokenY: {
        contract: data.token_b,
        symbol: data.token_b_symbol,
        name: data.token_b_name || data.token_b_symbol,
        decimals: data.token_b_decimals || 8,
        price: parseFloat(data.token_b_price || "0"),
      },
      reserveX: BigInt(data.reserve_a || "0"),
      reserveY: BigInt(data.reserve_b || "0"),
      totalLpSupply: BigInt(data.lp_supply || "0"),
      feeBps: data.fee_bps || 30,
      volume24h: BigInt(data.volume_24h || "0"),
      fees24h: BigInt(data.fees_24h || "0"),
      tvl: BigInt(data.tvl || "0"),
      apy: data.apy || 0,
      holderCount: data.holder_count || 0,
      createdAt: data.created_at || 0,
    };
  }
}

// Export singleton instance
export const tenero = new TeneroClient();
