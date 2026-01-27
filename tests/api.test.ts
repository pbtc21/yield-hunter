/**
 * Yield Hunter API Test Suite
 *
 * Tests the deployed Cloudflare Worker API endpoints,
 * live data quality, x402 payment flow, and dashboard.
 *
 * Run: bun test tests/api.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";

const API = process.env.API_URL || "https://yield-hunter-x402.p-d07.workers.dev";
const SENDER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

function nonce(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeProof(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    sender: SENDER,
    amount: "10000",
    nonce: nonce(),
    signature: "test-sig-" + Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    ...overrides,
  });
}

// ============================================
// API ENDPOINTS
// ============================================

describe("API Endpoints", () => {
  test("GET / returns service info", async () => {
    const res = await fetch(API);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.service).toBe("Yield Hunter x402 API");
    expect(data.version).toBe("1.0");
    expect(data.x402).toBeDefined();
    expect(data.x402.cost).toBe(10000);
    expect(data.endpoints).toBeArray();
    expect(data.endpoints.length).toBeGreaterThanOrEqual(6);
  });

  test("GET /health returns ok", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("ok");
    expect(data.service).toBe("yield-hunter-x402");
    expect(data.live).toBe(true);
    expect(data.network).toBeDefined();
  });

  test("GET /api/cost returns pricing and payment schema", async () => {
    const res = await fetch(`${API}/api/cost`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.cost).toBe(10000);
    expect(data.costBtc).toBe("0.00010000");
    expect(data.treasury).toStartWith("SP");
    expect(data.paymentFormat).toBeDefined();
    expect(data.paymentFormat.header).toBe("X-402-Payment");
    expect(data.paymentFormat.schema).toBeDefined();
    expect(data.paymentFormat.senderHeader).toBe("X-402-Sender");
  });

  test("GET /api/earnings returns earnings data", async () => {
    const res = await fetch(`${API}/api/earnings`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.totalQueries).toBeNumber();
    expect(data.totalEarned).toBeDefined();
    expect(data.totalEarned.sats).toBeNumber();
    expect(data.totalEarned.btc).toBeString();
    expect(data.summary).toBeString();
    expect(data.byDay).toBeArray();
    expect(data.recentPayments).toBeArray();
  });

  test("GET /dashboard returns HTML", async () => {
    const res = await fetch(`${API}/dashboard`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Yield Hunter");
    expect(html).toContain("/api/earnings");
    expect(html).toContain("/api/stats");
    expect(html).toContain("/api/yields");
  });

  test("OPTIONS returns CORS headers", async () => {
    const res = await fetch(`${API}/api/yields`, { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain("X-402-Payment");
  });
});

// ============================================
// LIVE YIELD DATA
// ============================================

describe("Live Yield Data", () => {
  let yieldsData: any;

  beforeAll(async () => {
    const res = await fetch(`${API}/api/yields`);
    yieldsData = await res.json();
  });

  test("GET /api/yields returns yield opportunities", () => {
    expect(yieldsData.count).toBeGreaterThan(0);
    expect(yieldsData.yields).toBeArray();
    expect(yieldsData.yields.length).toBe(yieldsData.count);
    expect(yieldsData.sources).toContain("defillama");
    expect(yieldsData.sources).toContain("tenero");
    expect(yieldsData.timestamp).toBeString();
  });

  test("yield opportunities have required fields", () => {
    for (const y of yieldsData.yields) {
      expect(y.protocol).toBeString();
      expect(y.pool).toBeString();
      expect(y.type).toBeOneOf(["lending", "amm", "vault"]);
      expect(y.apy).toBeNumber();
      expect(y.tvlUsd).toBeNumber();
      expect(y.riskScore).toBeNumber();
      expect(y.minDeposit).toBeNumber();
      expect(y.source).toBeOneOf(["defillama", "tenero"]);
      expect(y.live).toBe(true);
    }
  });

  test("APY values are reasonable (0-1000%)", () => {
    for (const y of yieldsData.yields) {
      expect(y.apy).toBeGreaterThanOrEqual(0);
      expect(y.apy).toBeLessThan(1000);
    }
  });

  test("risk scores are 0-100", () => {
    for (const y of yieldsData.yields) {
      expect(y.riskScore).toBeGreaterThanOrEqual(0);
      expect(y.riskScore).toBeLessThanOrEqual(100);
    }
  });

  test("TVL values are non-negative", () => {
    for (const y of yieldsData.yields) {
      expect(y.tvlUsd).toBeGreaterThanOrEqual(0);
    }
  });

  test("yields are sorted by APY descending", () => {
    for (let i = 1; i < yieldsData.yields.length; i++) {
      expect(yieldsData.yields[i - 1].apy).toBeGreaterThanOrEqual(yieldsData.yields[i].apy);
    }
  });

  test("aggregate stats are consistent", () => {
    expect(yieldsData.totalTvlUsd).toBeGreaterThan(0);
    expect(yieldsData.avgApy).toBeGreaterThan(0);
    expect(yieldsData.bestApy).toBe(yieldsData.yields[0]?.apy || 0);

    const calcTvl = yieldsData.yields.reduce((s: number, y: any) => s + y.tvlUsd, 0);
    expect(yieldsData.totalTvlUsd).toBe(Math.round(calcTvl));
  });

  test("filter: minApy", async () => {
    const res = await fetch(`${API}/api/yields?minApy=2`);
    const data: any = await res.json();
    for (const y of data.yields) {
      expect(y.apy).toBeGreaterThanOrEqual(2);
    }
  });

  test("filter: maxRisk", async () => {
    const res = await fetch(`${API}/api/yields?maxRisk=30`);
    const data: any = await res.json();
    for (const y of data.yields) {
      expect(y.riskScore).toBeLessThanOrEqual(30);
    }
  });

  test("filter: sbtcOnly", async () => {
    const res = await fetch(`${API}/api/yields?sbtcOnly=true`);
    const data: any = await res.json();
    for (const y of data.yields) {
      expect(y.pool.toLowerCase()).toContain("sbtc");
    }
  });

  test("filter: protocol", async () => {
    const res = await fetch(`${API}/api/yields?protocol=zest`);
    const data: any = await res.json();
    for (const y of data.yields) {
      expect(y.protocol.toLowerCase()).toBe("zest");
    }
  });

  test("filter: combined minApy + maxRisk", async () => {
    const res = await fetch(`${API}/api/yields?minApy=1&maxRisk=40`);
    const data: any = await res.json();
    for (const y of data.yields) {
      expect(y.apy).toBeGreaterThanOrEqual(1);
      expect(y.riskScore).toBeLessThanOrEqual(40);
    }
  });
});

// ============================================
// STATS ENDPOINT
// ============================================

describe("Stats Endpoint", () => {
  test("GET /api/stats returns protocol statistics", async () => {
    const res = await fetch(`${API}/api/stats`);
    expect(res.status).toBe(200);
    const data: any = await res.json();

    expect(data.protocols).toBeDefined();
    expect(data.protocols.count).toBeGreaterThan(0);
    expect(data.protocols.list).toBeArray();
    expect(data.protocols.list.length).toBe(data.protocols.count);

    expect(data.allYields).toBeDefined();
    expect(data.allYields.count).toBeGreaterThan(0);
    expect(data.allYields.bestApy).toBeGreaterThan(0);
    expect(data.allYields.totalTvlUsd).toBeGreaterThan(0);

    expect(data.sbtcYields).toBeDefined();
    expect(data.sbtcYields.count).toBeGreaterThanOrEqual(0);

    expect(data.sources).toContain("defillama");
    expect(data.sources).toContain("tenero");
  });
});

// ============================================
// x402 PAYMENT FLOW
// ============================================

describe("x402 Payment Flow", () => {
  test("no headers returns 402 with payment requirements", async () => {
    const res = await fetch(`${API}/api/yield`, { method: "POST" });
    expect(res.status).toBe(402);
    const data: any = await res.json();
    expect(data.code).toBe("PAYMENT_REQUIRED");
    expect(data.cost).toBeDefined();
    expect(data.treasury).toStartWith("SP");
    expect(data.instructions).toBeDefined();
    expect(data.example).toBeDefined();
  });

  test("invalid JSON returns 400", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": "not-json{{{",
        "X-402-Sender": SENDER,
      },
    });
    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.code).toBe("INVALID_FORMAT");
  });

  test("insufficient amount returns 402", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": makeProof({ amount: "5000" }),
        "X-402-Sender": SENDER,
      },
    });
    expect(res.status).toBe(402);
    const data: any = await res.json();
    expect(data.code).toBe("PAYMENT_INVALID");
    expect(data.error).toContain("Insufficient");
  });

  test("expired timestamp returns 402", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": makeProof({ timestamp: Date.now() - 10 * 60 * 1000 }),
        "X-402-Sender": SENDER,
      },
    });
    expect(res.status).toBe(402);
    const data: any = await res.json();
    expect(data.error).toContain("expired");
  });

  test("sender mismatch returns 400", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": makeProof({ sender: "ST1DIFFERENT_ADDRESS" }),
        "X-402-Sender": SENDER,
      },
    });
    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.code).toBe("SENDER_MISMATCH");
  });

  test("missing nonce returns 402", async () => {
    const proof = {
      sender: SENDER,
      amount: "10000",
      signature: "test-sig",
      timestamp: Date.now(),
    };
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": JSON.stringify(proof),
        "X-402-Sender": SENDER,
      },
    });
    expect(res.status).toBe(402);
    const data: any = await res.json();
    expect(data.error).toContain("nonce");
  });

  test("valid payment returns 200 with yield data", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof(),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "medium" }),
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.payment.verified).toBe(true);
    expect(data.payment.sender).toBe(SENDER);
    expect(data.results).toBeArray();
    expect(data.timestamp).toBeString();
  });

  test("replay protection rejects used nonce", async () => {
    const sharedNonce = nonce();
    const proof = makeProof({ nonce: sharedNonce });

    // First request should succeed
    const res1 = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": proof,
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000 }),
    });
    expect(res1.status).toBe(200);

    // Second request with same nonce should fail
    const res2 = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof({ nonce: sharedNonce }),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000 }),
    });
    expect(res2.status).toBe(402);
    const data: any = await res2.json();
    expect(data.error).toContain("replay");
  });

  test("low risk query filters high-risk results", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof(),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "low" }),
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.query.riskTolerance).toBe("low");
    for (const r of data.results) {
      expect(r.riskScore).toBeLessThanOrEqual(25);
    }
  });

  test("high risk query returns broader results", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof(),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "high" }),
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.riskScore).toBeLessThanOrEqual(60);
    }
  });

  test("results include expected yield calculation", async () => {
    const res = await fetch(`${API}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof(),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "high" }),
    });
    const data: any = await res.json();
    for (const r of data.results) {
      expect(r.expectedYieldSats).toBeNumber();
      expect(r.suggestion).toBeOneOf(["deposit", "skip"]);
      // Verify calculation: floor(amount * apy / 100)
      const expected = Math.floor((100000 * r.apy) / 100);
      expect(r.expectedYieldSats).toBe(expected);
    }
  });
});

// ============================================
// EARNINGS TRACKING
// ============================================

describe("Earnings Tracking", () => {
  test("earnings reflect successful payments", async () => {
    const res = await fetch(`${API}/api/earnings`);
    const data: any = await res.json();

    // After running payment tests above, we should have queries
    expect(data.totalQueries).toBeGreaterThanOrEqual(1);
    expect(data.totalEarned.sats).toBeGreaterThanOrEqual(10000);

    // Verify BTC conversion
    const expectedBtc = (data.totalEarned.sats / 100_000_000).toFixed(8);
    expect(data.totalEarned.btc).toBe(expectedBtc);

    // Verify summary format
    expect(data.summary).toContain("queries");
    expect(data.summary).toContain("sBTC");
  });

  test("recent payments have correct structure", async () => {
    const res = await fetch(`${API}/api/earnings`);
    const data: any = await res.json();

    if (data.recentPayments.length > 0) {
      const payment = data.recentPayments[0];
      expect(payment.sender).toBeString();
      expect(payment.sender).toStartWith("ST");
      expect(payment.amount).toBe(10000);
      expect(payment.time).toBeString();
      // Verify ISO date format
      expect(new Date(payment.time).getTime()).toBeGreaterThan(0);
    }
  });

  test("daily breakdown sums correctly", async () => {
    const res = await fetch(`${API}/api/earnings`);
    const data: any = await res.json();

    if (data.byDay.length > 0) {
      const totalFromDays = data.byDay.reduce((s: number, d: any) => s + d.earned, 0);
      expect(totalFromDays).toBe(data.totalEarned.sats);

      const queriesFromDays = data.byDay.reduce((s: number, d: any) => s + d.queries, 0);
      expect(queriesFromDays).toBe(data.totalQueries);
    }
  });
});

// ============================================
// DATA SOURCES
// ============================================

describe("Data Sources", () => {
  test("DeFiLlama returns Stacks/Zest data", async () => {
    const res = await fetch("https://yields.llama.fi/pools");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    const stacksPools = (data.data || []).filter(
      (p: any) => p.chain === "Stacks"
    );
    expect(stacksPools.length).toBeGreaterThan(0);

    const zestPools = stacksPools.filter((p: any) => p.project === "zest");
    expect(zestPools.length).toBeGreaterThan(0);
  });

  test("Tenero returns trending pool data", async () => {
    const res = await fetch("https://api.tenero.io/v1/stacks/pools/trending/1d");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.data).toBeArray();
    expect(data.data.length).toBeGreaterThan(0);

    // Verify pool structure
    const pool = data.data[0];
    expect(pool.pool_id).toBeString();
    expect(pool.pool_platform).toBeString();
  });

  test("Tenero has sBTC pools", async () => {
    const res = await fetch("https://api.tenero.io/v1/stacks/pools/trending/1d");
    const data: any = await res.json();
    const sbtcPools = (data.data || []).filter((p: any) => {
      const id = (p.pool_id || "").toLowerCase();
      return id.includes("sbtc");
    });
    expect(sbtcPools.length).toBeGreaterThan(0);
  });
});
