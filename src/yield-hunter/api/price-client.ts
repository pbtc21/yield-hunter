/**
 * Price Feed Client
 * Real-time price data from CoinGecko API
 */

import type { MarketConditions } from "../types";

// CoinGecko API (free, no API key required)
const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Cache prices for 60 seconds to avoid rate limits
let priceCache: { data: MarketConditions; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

export interface PriceData {
  btcPrice: number;
  stxPrice: number;
  btcPriceChange24h: number;
  stxPriceChange24h: number;
}

/**
 * Fetch current BTC and STX prices from CoinGecko
 */
export async function fetchPrices(): Promise<PriceData> {
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=bitcoin,blockstack&vs_currencies=usd&include_24hr_change=true`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      btcPrice: data.bitcoin?.usd || 0,
      stxPrice: data.blockstack?.usd || 0,
      btcPriceChange24h: data.bitcoin?.usd_24h_change || 0,
      stxPriceChange24h: data.blockstack?.usd_24h_change || 0,
    };
  } catch (error) {
    console.error("Error fetching prices:", error);
    // Return fallback prices
    return {
      btcPrice: 100000,
      stxPrice: 2.0,
      btcPriceChange24h: 0,
      stxPriceChange24h: 0,
    };
  }
}

/**
 * Determine market sentiment based on price changes
 */
function determineSentiment(btcChange: number, stxChange: number): "bullish" | "neutral" | "bearish" {
  const avgChange = (btcChange + stxChange) / 2;
  if (avgChange > 3) return "bullish";
  if (avgChange < -3) return "bearish";
  return "neutral";
}

/**
 * Calculate volatility index from price changes
 */
function calculateVolatilityIndex(btcChange: number, stxChange: number): number {
  // Simple volatility based on absolute price changes
  const absAvg = (Math.abs(btcChange) + Math.abs(stxChange)) / 2;
  // Scale to 0-100 where 10% change = 100 volatility
  return Math.min(100, absAvg * 10);
}

/**
 * Fetch full market conditions with caching
 */
export async function fetchMarketConditions(): Promise<MarketConditions> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL_MS) {
    return priceCache.data;
  }

  const prices = await fetchPrices();

  const conditions: MarketConditions = {
    btcPrice: prices.btcPrice,
    stxPrice: prices.stxPrice,
    btcPriceChange24h: prices.btcPriceChange24h,
    stxPriceChange24h: prices.stxPriceChange24h,
    overallSentiment: determineSentiment(prices.btcPriceChange24h, prices.stxPriceChange24h),
    volatilityIndex: calculateVolatilityIndex(prices.btcPriceChange24h, prices.stxPriceChange24h),
  };

  // Update cache
  priceCache = { data: conditions, timestamp: Date.now() };

  return conditions;
}

/**
 * Get STX balance for an address from Hiro API
 */
export async function getStxBalance(address: string): Promise<bigint> {
  try {
    const response = await fetch(`https://api.mainnet.hiro.so/extended/v1/address/${address}/stx`);
    if (!response.ok) return 0n;
    const data = await response.json();
    return BigInt(data.balance || 0);
  } catch {
    return 0n;
  }
}

/**
 * Get sBTC balance for an address
 */
export async function getSbtcBalance(address: string): Promise<bigint> {
  try {
    const response = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/address/${address}/balances`
    );
    if (!response.ok) return 0n;
    const data = await response.json();

    // Find sBTC in fungible tokens
    const sbtc = data.fungible_tokens?.["SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc"];
    return BigInt(sbtc?.balance || 0);
  } catch {
    return 0n;
  }
}

/**
 * Get all token balances for an address
 */
export async function getTokenBalances(address: string): Promise<{
  stx: bigint;
  sbtc: bigint;
  [key: string]: bigint;
}> {
  try {
    const response = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/address/${address}/balances`
    );
    if (!response.ok) {
      return { stx: 0n, sbtc: 0n };
    }
    const data = await response.json();

    const balances: { stx: bigint; sbtc: bigint; [key: string]: bigint } = {
      stx: BigInt(data.stx?.balance || 0),
      sbtc: 0n,
    };

    // Parse fungible tokens
    if (data.fungible_tokens) {
      for (const [key, value] of Object.entries(data.fungible_tokens)) {
        const balance = BigInt((value as any).balance || 0);
        if (key.includes("sbtc-token::sbtc")) {
          balances.sbtc = balance;
        } else {
          // Extract token name from contract ID
          const tokenName = key.split("::")[1] || key;
          balances[tokenName] = balance;
        }
      }
    }

    return balances;
  } catch {
    return { stx: 0n, sbtc: 0n };
  }
}
