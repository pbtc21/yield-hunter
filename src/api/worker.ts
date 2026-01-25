/**
 * Yield Hunter x402 API Worker
 * Simplified Cloudflare Worker entry point
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// CORS
app.use("*", cors());

// State
let queryCount = 0;
let totalEarned = 0;
const QUERY_COST = 10_000; // 10k sats

// Health
app.get("/health", (c) => c.json({ status: "ok", service: "yield-hunter-x402" }));

// Cost info
app.get("/api/cost", (c) =>
  c.json({
    cost: QUERY_COST,
    costBtc: (QUERY_COST / 100_000_000).toFixed(8),
    treasury: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
    network: c.env?.NETWORK || "testnet",
  })
);

// Earnings
app.get("/api/earnings", (c) =>
  c.json({
    totalQueries: queryCount,
    totalEarned: {
      sats: totalEarned,
      btc: (totalEarned / 100_000_000).toFixed(8),
    },
    summary: `${queryCount} queries = ${(totalEarned / 100_000_000).toFixed(8)} sBTC`,
  })
);

// Stats
app.get("/api/stats", async (c) => {
  const yields = [
    { protocol: "Zest", pool: "sBTC Lending", apy: 4.5, tvl: 125_000_000, risk: 15 },
    { protocol: "Bitflow", pool: "sBTC-STX", apy: 12.5, tvl: 45_000_000, risk: 35 },
    { protocol: "Bitflow", pool: "sBTC-USDA", apy: 8.2, tvl: 28_000_000, risk: 30 },
    { protocol: "Hermetica", pool: "hBTC Basis", apy: 8.0, tvl: 15_000_000, risk: 25 },
    { protocol: "ALEX", pool: "sBTC Vault", apy: 5.8, tvl: 85_000_000, risk: 20 },
  ];

  return c.json({
    protocols: ["Zest", "Bitflow", "Hermetica", "ALEX"],
    yields: {
      count: yields.length,
      bestApy: 12.5,
      avgApy: yields.reduce((s, y) => s + y.apy, 0) / yields.length,
    },
    service: { queries: queryCount, earned: totalEarned },
  });
});

// Yield scan (free)
app.get("/api/yields", (c) => {
  return c.json({
    yields: [
      { protocol: "Zest", pool: "sBTC Lending", apy: 4.5, tvl: 125_000_000, riskScore: 15, minDeposit: 10_000 },
      { protocol: "Bitflow", pool: "sBTC-STX", apy: 12.5, tvl: 45_000_000, riskScore: 35, minDeposit: 50_000 },
      { protocol: "Bitflow", pool: "sBTC-USDA", apy: 8.2, tvl: 28_000_000, riskScore: 30, minDeposit: 50_000 },
      { protocol: "Hermetica", pool: "hBTC Basis", apy: 8.0, tvl: 15_000_000, riskScore: 25, minDeposit: 100_000 },
      { protocol: "ALEX", pool: "sBTC Vault", apy: 5.8, tvl: 85_000_000, riskScore: 20, minDeposit: 25_000 },
    ],
    timestamp: new Date().toISOString(),
  });
});

// Paid optimization
app.post("/api/yield", async (c) => {
  const payment = c.req.header("X-402-Payment");
  const sender = c.req.header("X-402-Sender");

  if (!payment || !sender) {
    return c.json(
      {
        error: "Payment required",
        code: "PAYMENT_REQUIRED",
        cost: QUERY_COST,
        instructions: "Include X-402-Payment and X-402-Sender headers",
      },
      402
    );
  }

  // Simple payment verification (in production: verify with x402 relay)
  try {
    const proof = JSON.parse(payment);
    if (parseInt(proof.amount) < QUERY_COST) {
      return c.json({ error: "Insufficient payment" }, 402);
    }
  } catch {
    return c.json({ error: "Invalid payment proof" }, 400);
  }

  // Record payment
  queryCount++;
  totalEarned += QUERY_COST;

  // Get query params
  let amount = 100_000;
  let risk = "medium";
  try {
    const body = await c.req.json();
    amount = body.amount || 100_000;
    risk = body.riskTolerance || "medium";
  } catch {}

  const riskThreshold = risk === "low" ? 25 : risk === "high" ? 60 : 40;

  // Filter yields
  const yields = [
    { protocol: "Zest", pool: "sBTC Lending", apy: 4.5, riskScore: 15, minDeposit: 10_000 },
    { protocol: "Bitflow", pool: "sBTC-STX", apy: 12.5, riskScore: 35, minDeposit: 50_000 },
    { protocol: "Hermetica", pool: "hBTC Basis", apy: 8.0, riskScore: 25, minDeposit: 100_000 },
    { protocol: "ALEX", pool: "sBTC Vault", apy: 5.8, riskScore: 20, minDeposit: 25_000 },
  ].filter((y) => y.riskScore <= riskThreshold && amount >= y.minDeposit);

  const results = yields.map((y) => ({
    ...y,
    expectedYield: Math.floor((amount * y.apy) / 100),
    suggestion: y.apy >= 5 ? "deposit" : "skip",
  }));

  return c.json({
    success: true,
    payment: { received: QUERY_COST, sender },
    query: { amount, riskTolerance: risk },
    results,
    bestOption: results[0] || null,
  });
});

export default app;
