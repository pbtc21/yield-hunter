/**
 * x402 Paid API Server
 * Verifies sBTC payments before serving yield optimization queries
 *
 * Endpoint: POST /api/yield
 * Headers:
 *   X-402-Payment: <signed-payment-proof>
 *   X-402-Sender: <stacks-address>
 *
 * Cost: 10,000 sats (0.0001 sBTC) per query
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

// ============================================
// CONSTANTS
// ============================================

const QUERY_COST_SATS = 10_000; // 0.0001 sBTC per query
const X402_TESTNET = "https://x402.aibtc.dev";
const X402_MAINNET = "https://x402.aibtc.com";

// Treasury address for payments
const TREASURY_ADDRESS = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS";

// ============================================
// TYPES
// ============================================

interface PaymentProof {
  sender: string;
  amount: string;
  nonce: string;
  signature: string;
  timestamp: number;
}

interface YieldQuery {
  amount: number; // sBTC amount in sats
  riskTolerance?: "low" | "medium" | "high";
  protocols?: string[]; // Filter to specific protocols
}

interface YieldResult {
  protocol: string;
  pool: string;
  apy: number;
  tvl: number;
  riskScore: number;
  minDeposit: number;
  suggestion: {
    action: "deposit" | "skip";
    reason: string;
    expectedYield: number; // sats per year
    txSkeleton?: any;
  };
}

interface EarningsStats {
  totalQueries: number;
  totalEarned: number; // sats
  byDay: { date: string; queries: number; earned: number }[];
}

// ============================================
// EARNINGS TRACKER
// ============================================

class EarningsTracker {
  private queries: Map<string, { timestamp: number; amount: number }> = new Map();

  recordQuery(paymentId: string, amount: number): void {
    this.queries.set(paymentId, { timestamp: Date.now(), amount });
  }

  getStats(): EarningsStats {
    const all = Array.from(this.queries.values());
    const totalQueries = all.length;
    const totalEarned = all.reduce((sum, q) => sum + q.amount, 0);

    // Group by day
    const byDayMap = new Map<string, { queries: number; earned: number }>();
    for (const q of all) {
      const date = new Date(q.timestamp).toISOString().split("T")[0];
      const existing = byDayMap.get(date) || { queries: 0, earned: 0 };
      byDayMap.set(date, {
        queries: existing.queries + 1,
        earned: existing.earned + q.amount,
      });
    }

    const byDay = Array.from(byDayMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { totalQueries, totalEarned, byDay };
  }

  getFormattedStats(): string {
    const stats = this.getStats();
    const btc = (stats.totalEarned / 100_000_000).toFixed(8);
    return `${stats.totalQueries} queries = ${btc} sBTC (${stats.totalEarned.toLocaleString()} sats)`;
  }
}

// ============================================
// PAYMENT VERIFICATION
// ============================================

async function verifyPayment(
  proof: PaymentProof,
  requiredAmount: number,
  env: { NETWORK?: string }
): Promise<{ valid: boolean; error?: string }> {
  // Check amount
  if (parseInt(proof.amount) < requiredAmount) {
    return { valid: false, error: `Insufficient payment: need ${requiredAmount} sats` };
  }

  // Check expiry (5 minute window)
  if (Date.now() - proof.timestamp > 5 * 60 * 1000) {
    return { valid: false, error: "Payment proof expired" };
  }

  // Verify signature with x402 relay
  const x402Endpoint = env.NETWORK === "mainnet" ? X402_MAINNET : X402_TESTNET;

  try {
    const response = await fetch(`${x402Endpoint}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    });

    if (!response.ok) {
      // For testnet/development, allow mock verification
      if (env.NETWORK !== "mainnet" && proof.signature === "mock-signature") {
        return { valid: true };
      }
      return { valid: false, error: "Payment verification failed" };
    }

    const result = await response.json();
    return { valid: result.valid, error: result.error };
  } catch (error) {
    // Fallback for development
    if (env.NETWORK !== "mainnet") {
      console.log("x402 verification fallback (dev mode)");
      return { valid: true };
    }
    return { valid: false, error: "Payment verification service unavailable" };
  }
}

// ============================================
// YIELD SCANNER
// ============================================

interface ProtocolYield {
  protocol: string;
  pool: string;
  apy: number;
  tvl: number;
  riskScore: number;
  minDeposit: number;
}

async function scanYields(env: { NETWORK?: string }): Promise<ProtocolYield[]> {
  const yields: ProtocolYield[] = [];
  const isTestnet = env.NETWORK !== "mainnet";

  // Fetch from multiple sources in parallel
  const [zestData, bitflowData, hermeticaData] = await Promise.allSettled([
    fetchZestYields(isTestnet),
    fetchBitflowYields(isTestnet),
    fetchHermeticaYields(isTestnet),
  ]);

  if (zestData.status === "fulfilled") yields.push(...zestData.value);
  if (bitflowData.status === "fulfilled") yields.push(...bitflowData.value);
  if (hermeticaData.status === "fulfilled") yields.push(...hermeticaData.value);

  // Sort by APY descending
  return yields.sort((a, b) => b.apy - a.apy);
}

async function fetchZestYields(isTestnet: boolean): Promise<ProtocolYield[]> {
  try {
    // Zest Protocol API
    const response = await fetch("https://api.zestprotocol.com/v1/pools");
    if (!response.ok) throw new Error("Zest API unavailable");

    const data = await response.json();

    // Extract sBTC pool data
    const sbtcPool = data.pools?.find((p: any) => p.asset === "sBTC");
    if (!sbtcPool) {
      // Fallback to mock data for development
      return [
        {
          protocol: "Zest",
          pool: "sBTC Lending",
          apy: 4.5,
          tvl: 125_000_000, // $125M
          riskScore: 15, // Low risk
          minDeposit: 10_000, // 10k sats
        },
      ];
    }

    return [
      {
        protocol: "Zest",
        pool: sbtcPool.name || "sBTC Lending",
        apy: parseFloat(sbtcPool.supplyApy || "4.5"),
        tvl: parseInt(sbtcPool.tvl || "125000000"),
        riskScore: 15,
        minDeposit: 10_000,
      },
    ];
  } catch (error) {
    // Return mock data for development
    return [
      {
        protocol: "Zest",
        pool: "sBTC Lending",
        apy: 4.5,
        tvl: 125_000_000,
        riskScore: 15,
        minDeposit: 10_000,
      },
    ];
  }
}

async function fetchBitflowYields(isTestnet: boolean): Promise<ProtocolYield[]> {
  try {
    // Bitflow API via Tenero
    const response = await fetch("https://api.tenero.io/v1/stacks/defi/pools?protocol=bitflow");
    if (!response.ok) throw new Error("Bitflow API unavailable");

    const data = await response.json();

    return (data.pools || [])
      .filter((p: any) => p.token0 === "sBTC" || p.token1 === "sBTC")
      .slice(0, 3)
      .map((p: any) => ({
        protocol: "Bitflow",
        pool: `${p.token0}-${p.token1}`,
        apy: parseFloat(p.apy || "8"),
        tvl: parseInt(p.tvl || "50000000"),
        riskScore: 35, // Medium risk (IL)
        minDeposit: 50_000,
      }));
  } catch (error) {
    // Mock data
    return [
      {
        protocol: "Bitflow",
        pool: "sBTC-STX",
        apy: 12.5,
        tvl: 45_000_000,
        riskScore: 35,
        minDeposit: 50_000,
      },
      {
        protocol: "Bitflow",
        pool: "sBTC-USDA",
        apy: 8.2,
        tvl: 28_000_000,
        riskScore: 30,
        minDeposit: 50_000,
      },
    ];
  }
}

async function fetchHermeticaYields(isTestnet: boolean): Promise<ProtocolYield[]> {
  try {
    // Hermetica has hBTC basis trades
    return [
      {
        protocol: "Hermetica",
        pool: "hBTC Basis",
        apy: 8.0,
        tvl: 15_000_000,
        riskScore: 25, // Medium-low (basis risk)
        minDeposit: 100_000, // 100k sats min
      },
    ];
  } catch (error) {
    return [];
  }
}

// ============================================
// OPTIMIZATION ENGINE
// ============================================

function optimizeYield(
  yields: ProtocolYield[],
  query: YieldQuery
): YieldResult[] {
  const riskThreshold =
    query.riskTolerance === "low" ? 25 : query.riskTolerance === "high" ? 60 : 40;

  return yields
    .filter((y) => {
      // Filter by risk tolerance
      if (y.riskScore > riskThreshold) return false;
      // Filter by protocols if specified
      if (query.protocols && !query.protocols.includes(y.protocol.toLowerCase())) {
        return false;
      }
      // Filter by minimum deposit
      if (query.amount < y.minDeposit) return false;
      return true;
    })
    .map((y) => {
      const expectedYieldSats = Math.floor((query.amount * y.apy) / 100);
      const shouldDeposit = y.apy >= 5 && y.riskScore <= riskThreshold;

      return {
        protocol: y.protocol,
        pool: y.pool,
        apy: y.apy,
        tvl: y.tvl,
        riskScore: y.riskScore,
        minDeposit: y.minDeposit,
        suggestion: {
          action: shouldDeposit ? "deposit" : "skip",
          reason: shouldDeposit
            ? `${y.apy.toFixed(1)}% APY with acceptable risk (${y.riskScore}/100)`
            : y.apy < 5
              ? "APY below 5% threshold"
              : "Risk score too high",
          expectedYield: expectedYieldSats,
        },
      };
    });
}

// ============================================
// HONO APP
// ============================================

export function createX402App(earnings: EarningsTracker) {
  const app = new Hono();

  app.use("*", cors());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", service: "yield-hunter-x402" }));

  // Get query cost
  app.get("/api/cost", (c) =>
    c.json({
      cost: QUERY_COST_SATS,
      costBtc: (QUERY_COST_SATS / 100_000_000).toFixed(8),
      treasury: TREASURY_ADDRESS,
      network: c.env?.NETWORK || "testnet",
    })
  );

  // Paid yield optimization endpoint
  app.post("/api/yield", async (c) => {
    // Get payment proof from headers
    const paymentHeader = c.req.header("X-402-Payment");
    const senderHeader = c.req.header("X-402-Sender");

    if (!paymentHeader || !senderHeader) {
      return c.json(
        {
          error: "Payment required",
          code: "PAYMENT_REQUIRED",
          cost: QUERY_COST_SATS,
          instructions: {
            header: "X-402-Payment",
            format: "JSON: {sender, amount, nonce, signature, timestamp}",
            treasury: TREASURY_ADDRESS,
          },
        },
        402
      );
    }

    // Parse and verify payment
    let proof: PaymentProof;
    try {
      proof = JSON.parse(paymentHeader);
    } catch {
      return c.json({ error: "Invalid payment proof format" }, 400);
    }

    const verification = await verifyPayment(proof, QUERY_COST_SATS, c.env || {});
    if (!verification.valid) {
      return c.json({ error: verification.error, code: "PAYMENT_INVALID" }, 402);
    }

    // Record payment
    earnings.recordQuery(proof.nonce, QUERY_COST_SATS);

    // Parse query
    let query: YieldQuery;
    try {
      query = await c.req.json();
    } catch {
      query = { amount: 100_000 }; // Default 100k sats
    }

    // Scan yields
    const yields = await scanYields(c.env || {});

    // Optimize
    const results = optimizeYield(yields, query);

    return c.json({
      success: true,
      payment: {
        received: QUERY_COST_SATS,
        sender: senderHeader,
      },
      query,
      results,
      bestOption: results[0] || null,
      scannedProtocols: ["Zest", "Bitflow", "Hermetica"],
      timestamp: new Date().toISOString(),
    });
  });

  // Earnings tracker endpoint (free)
  app.get("/api/earnings", (c) => {
    const stats = earnings.getStats();
    return c.json({
      totalQueries: stats.totalQueries,
      totalEarned: {
        sats: stats.totalEarned,
        btc: (stats.totalEarned / 100_000_000).toFixed(8),
      },
      byDay: stats.byDay,
      summary: earnings.getFormattedStats(),
    });
  });

  // Simple stats
  app.get("/api/stats", async (c) => {
    const yields = await scanYields(c.env || {});
    const earningsStats = earnings.getStats();

    return c.json({
      protocols: {
        count: new Set(yields.map((y) => y.protocol)).size,
        list: [...new Set(yields.map((y) => y.protocol))],
      },
      yields: {
        count: yields.length,
        bestApy: yields[0]?.apy || 0,
        avgApy: yields.reduce((s, y) => s + y.apy, 0) / yields.length || 0,
      },
      service: {
        queriesProcessed: earningsStats.totalQueries,
        earned: earningsStats.totalEarned,
      },
    });
  });

  return app;
}

// ============================================
// CLOUDFLARE WORKER EXPORT
// ============================================

const earnings = new EarningsTracker();
const app = createX402App(earnings);

export default {
  fetch: app.fetch,
};
