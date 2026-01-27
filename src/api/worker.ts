/**
 * Yield Hunter x402 API Worker
 * Live yield data from Stacks DeFi protocols
 *
 * Data sources:
 * - Tenero API: Bitflow, ALEX, Velar AMM pool data (volume, TVL, fees)
 * - DeFiLlama: Zest Protocol lending APY
 * - Calculated: AMM APY from (fees_24h / TVL * 365)
 */

// ============================================
// TYPES
// ============================================

interface YieldOpportunity {
  protocol: string;
  pool: string;
  type: "lending" | "amm" | "vault";
  apy: number;
  tvlUsd: number;
  volume24hUsd: number;
  riskScore: number;
  minDeposit: number;
  source: string;
  poolAddress?: string;
  live: boolean;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// ============================================
// CACHE (5 minute TTL)
// ============================================

const CACHE_TTL = 5 * 60 * 1000;
let yieldsCache: CacheEntry<YieldOpportunity[]> | null = null;

function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && Date.now() - entry.fetchedAt < CACHE_TTL;
}

// ============================================
// DATA FETCHERS
// ============================================

/**
 * Fetch Zest Protocol lending data from DeFiLlama
 */
async function fetchZestYields(): Promise<YieldOpportunity[]> {
  try {
    const res = await fetch("https://yields.llama.fi/pools");
    if (!res.ok) return [];

    const data: any = await res.json();
    const zestPools = (data.data || []).filter(
      (p: any) => p.project === "zest" && p.chain === "Stacks"
    );

    return zestPools.map((p: any) => ({
      protocol: "Zest",
      pool: `${p.symbol} Lending`,
      type: "lending" as const,
      apy: p.apy || 0,
      tvlUsd: p.tvlUsd || 0,
      volume24hUsd: 0,
      riskScore: p.stablecoin ? 10 : 15,
      minDeposit: 10_000,
      source: "defillama",
      live: true,
    }));
  } catch (e) {
    console.error("Zest fetch error:", e);
    return [];
  }
}

/**
 * Fetch AMM pool data from Tenero API
 * Returns Bitflow, ALEX, Velar pools with sBTC
 */
async function fetchTeneroSbtcPools(): Promise<YieldOpportunity[]> {
  const opportunities: YieldOpportunity[] = [];

  try {
    // Fetch trending pools across multiple timeframes for coverage
    const res = await fetch("https://api.tenero.io/v1/stacks/pools/trending/1d");
    if (!res.ok) return [];

    const data: any = await res.json();
    const pools = data.data || [];

    for (const pool of pools) {
      const poolId: string = pool.pool_id || "";
      const baseSymbol: string = pool.base_token?.symbol || "";
      const quoteSymbol: string = pool.quote_token?.symbol || "";
      const token0Addr: string = pool.token0_address || "";
      const token1Addr: string = pool.token1_address || "";

      // Filter for sBTC pools
      const hasSbtc =
        poolId.toLowerCase().includes("sbtc") ||
        baseSymbol.toLowerCase() === "sbtc" ||
        quoteSymbol.toLowerCase() === "sbtc" ||
        token0Addr.toLowerCase().includes("sbtc") ||
        token1Addr.toLowerCase().includes("sbtc");

      if (!hasSbtc) continue;

      const platform: string = pool.pool_platform || "Unknown";
      const liquidityUsd: number = pool.liquidity_usd || 0;
      const volume1dUsd: number = pool.metrics?.volume_1d_usd || 0;

      // Calculate APY from trading fees
      // Standard AMM fee is 0.3%, LP share is typically the full fee
      const feeRate = 0.003;
      const dailyFees = volume1dUsd * feeRate;
      const calculatedApy = liquidityUsd > 0
        ? (dailyFees / liquidityUsd) * 365 * 100
        : 0;

      // Determine the pair name
      const pairName = poolId.includes("sbtc-stx")
        ? "sBTC-STX"
        : poolId.includes("sbtc-dog")
          ? "sBTC-DOG"
          : poolId.includes("sbtc-aeusdc")
            ? "sBTC-aeUSDC"
            : poolId.includes("sbtc-welsh")
              ? "sBTC-WELSH"
              : `sBTC-${quoteSymbol || baseSymbol}`;

      // Risk scoring
      let riskScore = 30; // Base AMM risk (impermanent loss)
      if (liquidityUsd < 50_000) riskScore += 30; // Low liquidity
      else if (liquidityUsd < 500_000) riskScore += 15;
      if (volume1dUsd < 1_000) riskScore += 20; // Low volume
      else if (volume1dUsd < 10_000) riskScore += 10;
      // Cap at 100
      riskScore = Math.min(riskScore, 100);

      opportunities.push({
        protocol: platform.charAt(0) + platform.slice(1).toLowerCase(),
        pool: pairName,
        type: "amm",
        apy: Math.round(calculatedApy * 100) / 100,
        tvlUsd: Math.round(liquidityUsd),
        volume24hUsd: Math.round(volume1dUsd * 100) / 100,
        riskScore,
        minDeposit: 50_000,
        source: "tenero",
        poolAddress: pool.pool_address,
        live: true,
      });
    }
  } catch (e) {
    console.error("Tenero fetch error:", e);
  }

  return opportunities;
}

/**
 * Fetch all DeFiLlama Stacks yields (catches any protocol)
 */
async function fetchAllStacksYields(): Promise<YieldOpportunity[]> {
  try {
    const res = await fetch("https://yields.llama.fi/pools");
    if (!res.ok) return [];

    const data: any = await res.json();
    const stacksPools = (data.data || []).filter(
      (p: any) => p.chain === "Stacks" && p.project !== "zest"
    );

    return stacksPools.map((p: any) => ({
      protocol: p.project.charAt(0).toUpperCase() + p.project.slice(1),
      pool: p.symbol,
      type: p.ilRisk === "yes" ? "amm" : "lending",
      apy: p.apy || 0,
      tvlUsd: p.tvlUsd || 0,
      volume24hUsd: 0,
      riskScore: p.ilRisk === "yes" ? 35 : 15,
      minDeposit: 10_000,
      source: "defillama",
      live: true,
    }));
  } catch {
    return [];
  }
}

/**
 * Scan all yield sources
 */
async function scanAllYields(): Promise<YieldOpportunity[]> {
  if (isCacheValid(yieldsCache)) {
    return yieldsCache.data;
  }

  // Fetch from all sources in parallel
  const [zestYields, teneroPools, otherStacks] = await Promise.allSettled([
    fetchZestYields(),
    fetchTeneroSbtcPools(),
    fetchAllStacksYields(),
  ]);

  const allYields: YieldOpportunity[] = [];

  if (zestYields.status === "fulfilled") allYields.push(...zestYields.value);
  if (teneroPools.status === "fulfilled") allYields.push(...teneroPools.value);
  if (otherStacks.status === "fulfilled") allYields.push(...otherStacks.value);

  // Deduplicate by pool name + protocol
  const seen = new Set<string>();
  const deduped = allYields.filter((y) => {
    const key = `${y.protocol}-${y.pool}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by APY descending
  deduped.sort((a, b) => b.apy - a.apy);

  // Cache result
  yieldsCache = { data: deduped, fetchedAt: Date.now() };

  return deduped;
}

// ============================================
// x402 PAYMENT VERIFICATION
// ============================================

interface PaymentProof {
  sender: string;
  amount: string;
  nonce: string;
  signature: string;
  timestamp: number;
}

const QUERY_COST = 10_000;
const TREASURY = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS";
const PAYMENT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const X402_RELAY_TESTNET = "https://x402.aibtc.dev";
const X402_RELAY_MAINNET = "https://x402.aibtc.com";

// Nonce replay protection (in-memory, resets on deploy)
const usedNonces = new Set<string>();

// Earnings ledger
const earnings: { sender: string; amount: number; timestamp: number; nonce: string }[] = [];
let queryCount = 0;
let totalEarned = 0;

/**
 * Verify an x402 payment proof
 * 1. Check amount >= cost
 * 2. Check timestamp not expired
 * 3. Check nonce not replayed
 * 4. Try aibtc relay verification
 * 5. Fall back to local acceptance on testnet
 */
async function verifyPayment(
  proof: PaymentProof,
  network: string
): Promise<{ valid: boolean; error?: string }> {
  // Amount check
  const amount = parseInt(proof.amount);
  if (isNaN(amount) || amount < QUERY_COST) {
    return { valid: false, error: `Insufficient payment: need ${QUERY_COST} sats, got ${amount}` };
  }

  // Timestamp expiry
  if (!proof.timestamp || Date.now() - proof.timestamp > PAYMENT_EXPIRY_MS) {
    return { valid: false, error: "Payment proof expired (5 minute window)" };
  }

  // Replay protection
  if (!proof.nonce) {
    return { valid: false, error: "Missing nonce" };
  }
  if (usedNonces.has(proof.nonce)) {
    return { valid: false, error: "Nonce already used (replay detected)" };
  }

  // Sender format check (Stacks address)
  if (!proof.sender || (!proof.sender.startsWith("SP") && !proof.sender.startsWith("ST"))) {
    return { valid: false, error: "Invalid sender address format" };
  }

  // Signature check — try aibtc relay first
  const relayUrl = network === "mainnet" ? X402_RELAY_MAINNET : X402_RELAY_TESTNET;

  try {
    const relayRes = await fetch(`${relayUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: proof.sender,
        amount: proof.amount,
        nonce: proof.nonce,
        signature: proof.signature,
        timestamp: proof.timestamp,
        recipient: TREASURY,
      }),
    });

    if (relayRes.ok) {
      const result: any = await relayRes.json();
      if (result.valid) {
        usedNonces.add(proof.nonce);
        return { valid: true };
      }
      return { valid: false, error: result.error || "Relay rejected payment" };
    }

    // Relay returned non-OK — fall through to testnet logic
  } catch {
    // Relay unreachable — fall through
  }

  // Testnet fallback: accept if signature present (relay may not be live yet)
  if (network !== "mainnet") {
    if (proof.signature && proof.signature.length > 0) {
      usedNonces.add(proof.nonce);
      return { valid: true };
    }
    return { valid: false, error: "Missing signature" };
  }

  return { valid: false, error: "Payment verification service unavailable" };
}

// ============================================
// WORKER
// ============================================

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const network: string = env?.NETWORK || "testnet";
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-402-Payment, X-402-Sender",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
      });

    // Routes
    if (url.pathname === "/health") {
      return json({ status: "ok", service: "yield-hunter-x402", live: true, network });
    }

    if (url.pathname === "/api/cost") {
      return json({
        cost: QUERY_COST,
        costBtc: (QUERY_COST / 100_000_000).toFixed(8),
        treasury: TREASURY,
        network,
        paymentFormat: {
          header: "X-402-Payment",
          schema: {
            sender: "string (Stacks address, SP... or ST...)",
            amount: "string (sats, minimum 10000)",
            nonce: "string (unique per request)",
            signature: "string (signed payment proof)",
            timestamp: "number (unix ms, within 5 min)",
          },
          senderHeader: "X-402-Sender",
        },
      });
    }

    if (url.pathname === "/api/earnings") {
      // Group by day
      const byDay: Record<string, { queries: number; earned: number }> = {};
      for (const e of earnings) {
        const day = new Date(e.timestamp).toISOString().split("T")[0];
        if (!byDay[day]) byDay[day] = { queries: 0, earned: 0 };
        byDay[day].queries++;
        byDay[day].earned += e.amount;
      }

      return json({
        totalQueries: queryCount,
        totalEarned: {
          sats: totalEarned,
          btc: (totalEarned / 100_000_000).toFixed(8),
        },
        byDay: Object.entries(byDay).map(([date, stats]) => ({ date, ...stats })),
        recentPayments: earnings.slice(-10).map((e) => ({
          sender: e.sender,
          amount: e.amount,
          time: new Date(e.timestamp).toISOString(),
        })),
        summary: `${queryCount} queries = ${(totalEarned / 100_000_000).toFixed(8)} sBTC`,
      });
    }

    // Live yield data (free)
    if (url.pathname === "/api/yields") {
      const yields = await scanAllYields();

      const minApy = parseFloat(url.searchParams.get("minApy") || "0");
      const maxRisk = parseInt(url.searchParams.get("maxRisk") || "100");
      const protocol = url.searchParams.get("protocol")?.toLowerCase();
      const sbtcOnly = url.searchParams.get("sbtcOnly") === "true";

      let filtered = yields;
      if (minApy > 0) filtered = filtered.filter((y) => y.apy >= minApy);
      if (maxRisk < 100) filtered = filtered.filter((y) => y.riskScore <= maxRisk);
      if (protocol) filtered = filtered.filter((y) => y.protocol.toLowerCase() === protocol);
      if (sbtcOnly) filtered = filtered.filter((y) => y.pool.toLowerCase().includes("sbtc"));

      const totalTvl = filtered.reduce((s, y) => s + y.tvlUsd, 0);
      const avgApy = filtered.length > 0
        ? filtered.reduce((s, y) => s + y.apy, 0) / filtered.length
        : 0;

      return json({
        count: filtered.length,
        totalTvlUsd: Math.round(totalTvl),
        avgApy: Math.round(avgApy * 100) / 100,
        bestApy: filtered[0]?.apy || 0,
        yields: filtered,
        sources: ["defillama", "tenero"],
        cachedAt: yieldsCache?.fetchedAt
          ? new Date(yieldsCache.fetchedAt).toISOString()
          : null,
        timestamp: new Date().toISOString(),
      });
    }

    // Stats
    if (url.pathname === "/api/stats") {
      const yields = await scanAllYields();
      const protocols = [...new Set(yields.map((y) => y.protocol))];
      const sbtcYields = yields.filter((y) =>
        y.pool.toLowerCase().includes("sbtc")
      );

      return json({
        protocols: {
          count: protocols.length,
          list: protocols,
        },
        allYields: {
          count: yields.length,
          bestApy: yields[0]?.apy || 0,
          avgApy:
            Math.round(
              (yields.reduce((s, y) => s + y.apy, 0) / yields.length) * 100
            ) / 100 || 0,
          totalTvlUsd: Math.round(yields.reduce((s, y) => s + y.tvlUsd, 0)),
        },
        sbtcYields: {
          count: sbtcYields.length,
          bestApy: sbtcYields[0]?.apy || 0,
          totalTvlUsd: Math.round(
            sbtcYields.reduce((s, y) => s + y.tvlUsd, 0)
          ),
        },
        service: { queries: queryCount, earned: totalEarned },
        sources: ["defillama", "tenero"],
      });
    }

    // ============================================
    // PAID ENDPOINT — x402 verified
    // ============================================
    if (url.pathname === "/api/yield" && request.method === "POST") {
      const paymentHeader = request.headers.get("X-402-Payment");
      const senderHeader = request.headers.get("X-402-Sender");

      // No payment headers → 402 with requirements
      if (!paymentHeader || !senderHeader) {
        return json(
          {
            error: "Payment required",
            code: "PAYMENT_REQUIRED",
            cost: {
              sats: QUERY_COST,
              btc: (QUERY_COST / 100_000_000).toFixed(8),
            },
            treasury: TREASURY,
            network,
            instructions: {
              step1: "GET /api/cost for pricing details",
              step2: "Create payment proof JSON: {sender, amount, nonce, signature, timestamp}",
              step3: "POST /api/yield with X-402-Payment and X-402-Sender headers",
            },
            example: {
              headers: {
                "X-402-Payment": JSON.stringify({
                  sender: "ST1EXAMPLE...",
                  amount: "10000",
                  nonce: "unique-id-here",
                  signature: "signed-proof",
                  timestamp: Date.now(),
                }),
                "X-402-Sender": "ST1EXAMPLE...",
              },
            },
          },
          402
        );
      }

      // Parse payment proof
      let proof: PaymentProof;
      try {
        proof = JSON.parse(paymentHeader);
      } catch {
        return json(
          { error: "Invalid payment proof format", code: "INVALID_FORMAT" },
          400
        );
      }

      // Verify sender header matches proof
      if (proof.sender !== senderHeader) {
        return json(
          { error: "Sender mismatch: X-402-Sender must match proof.sender", code: "SENDER_MISMATCH" },
          400
        );
      }

      // Full verification
      const verification = await verifyPayment(proof, network);
      if (!verification.valid) {
        return json(
          { error: verification.error, code: "PAYMENT_INVALID" },
          402
        );
      }

      // Payment accepted — record it
      queryCount++;
      totalEarned += QUERY_COST;
      earnings.push({
        sender: proof.sender,
        amount: QUERY_COST,
        timestamp: Date.now(),
        nonce: proof.nonce,
      });

      // Parse query body
      let amount = 100_000;
      let risk = "medium";
      try {
        const body = await request.json() as any;
        amount = body.amount || 100_000;
        risk = body.riskTolerance || "medium";
      } catch {}

      const riskThreshold = risk === "low" ? 25 : risk === "high" ? 60 : 40;

      // Fetch and filter yields
      const yields = await scanAllYields();
      const filtered = yields.filter(
        (y) => y.riskScore <= riskThreshold && amount >= y.minDeposit
      );

      const results = filtered.map((y) => ({
        ...y,
        expectedYieldSats: Math.floor((amount * y.apy) / 100),
        suggestion: y.apy >= 2 ? "deposit" : "skip",
      }));

      return json({
        success: true,
        payment: {
          received: QUERY_COST,
          sender: proof.sender,
          nonce: proof.nonce,
          verified: true,
        },
        query: { amount, riskTolerance: risk },
        results,
        bestOption: results[0] || null,
        timestamp: new Date().toISOString(),
      });
    }

    // ============================================
    // HTML EARNINGS DASHBOARD
    // ============================================
    if (url.pathname === "/dashboard") {
      return new Response(buildDashboardHtml(network), {
        headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
      });
    }

    return json({
      service: "Yield Hunter x402 API",
      version: "1.0",
      network,
      endpoints: [
        "GET  /health",
        "GET  /api/cost — pricing and payment format",
        "GET  /api/yields?minApy=&maxRisk=&protocol=&sbtcOnly= — free live yields",
        "GET  /api/stats — protocol statistics",
        "GET  /api/earnings — payment revenue tracker",
        "GET  /dashboard — earnings dashboard (HTML)",
        "POST /api/yield — paid yield optimization (requires X-402 headers)",
      ],
      x402: {
        cost: QUERY_COST,
        currency: "sBTC (sats)",
        treasury: TREASURY,
        headers: ["X-402-Payment", "X-402-Sender"],
      },
      docs: "https://github.com/aibtcdev/yield-hunter",
    });
  },
};

// ============================================
// DASHBOARD HTML
// ============================================

function buildDashboardHtml(network: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yield Hunter - Earnings Dashboard</title>
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --border: #1e1e2e;
    --text: #e0e0e8;
    --dim: #6b6b80;
    --accent: #f7931a;
    --green: #00d68f;
    --red: #ff4d4f;
    --blue: #4da6ff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    background: var(--bg);
    color: var(--text);
    padding: 20px;
    max-width: 960px;
    margin: 0 auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }
  header h1 { font-size: 18px; color: var(--accent); }
  .badge {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--dim);
  }
  .badge.live { border-color: var(--green); color: var(--green); }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  .card .label { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; }
  .card .value { font-size: 28px; font-weight: 700; margin-top: 6px; }
  .card .sub { font-size: 12px; color: var(--dim); margin-top: 4px; }
  .card .value.btc { color: var(--accent); }
  .card .value.green { color: var(--green); }
  .card .value.blue { color: var(--blue); }
  section { margin-bottom: 24px; }
  section h2 {
    font-size: 13px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--dim);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  tr:hover td { background: rgba(247, 147, 26, 0.04); }
  .risk-low { color: var(--green); }
  .risk-med { color: var(--accent); }
  .risk-high { color: var(--red); }
  .mono { font-family: inherit; }
  .addr {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-wrap {
    height: 24px;
    background: var(--surface);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
    display: flex;
    align-items: center;
    padding-left: 8px;
    font-size: 11px;
    color: var(--bg);
    font-weight: 600;
    min-width: 40px;
  }
  .refresh-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
  }
  .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }
  footer {
    border-top: 1px solid var(--border);
    padding-top: 16px;
    font-size: 11px;
    color: var(--dim);
    display: flex;
    justify-content: space-between;
  }
  #loading {
    text-align: center;
    padding: 40px;
    color: var(--dim);
  }
  @media (max-width: 600px) {
    body { padding: 12px; }
    .cards { grid-template-columns: 1fr 1fr; gap: 8px; }
    .card .value { font-size: 22px; }
    table { font-size: 12px; }
    th, td { padding: 6px 8px; }
  }
</style>
</head>
<body>

<header>
  <h1>Yield Hunter</h1>
  <div>
    <span class="badge live" id="status">loading</span>
    <span class="badge">${network}</span>
    <button class="refresh-btn" onclick="loadAll()">Refresh</button>
  </div>
</header>

<div id="loading">Loading dashboard data...</div>
<div id="content" style="display:none">

<div class="cards">
  <div class="card">
    <div class="label">Total Earned</div>
    <div class="value btc" id="totalBtc">0.00000000</div>
    <div class="sub" id="totalSats">0 sats</div>
  </div>
  <div class="card">
    <div class="label">Queries Served</div>
    <div class="value green" id="totalQueries">0</div>
    <div class="sub">paid x402 requests</div>
  </div>
  <div class="card">
    <div class="label">Avg Per Query</div>
    <div class="value" id="avgPerQuery">0</div>
    <div class="sub">sats earned</div>
  </div>
  <div class="card">
    <div class="label">Protocols Tracked</div>
    <div class="value blue" id="protocolCount">0</div>
    <div class="sub" id="protocolList">-</div>
  </div>
</div>

<div class="cards">
  <div class="card">
    <div class="label">Best APY</div>
    <div class="value green" id="bestApy">0%</div>
    <div class="sub" id="bestPool">-</div>
  </div>
  <div class="card">
    <div class="label">Total TVL Tracked</div>
    <div class="value" id="totalTvl">$0</div>
    <div class="sub" id="yieldCount">0 pools</div>
  </div>
  <div class="card">
    <div class="label">sBTC Pools</div>
    <div class="value btc" id="sbtcCount">0</div>
    <div class="sub" id="sbtcTvl">$0 TVL</div>
  </div>
  <div class="card">
    <div class="label">Query Cost</div>
    <div class="value" id="queryCost">10,000</div>
    <div class="sub">sats per query</div>
  </div>
</div>

<section id="yieldsSection">
  <h2>Live Yield Opportunities</h2>
  <table>
    <thead>
      <tr>
        <th>Protocol</th>
        <th>Pool</th>
        <th>APY</th>
        <th>Risk</th>
        <th>TVL</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody id="yieldsTable"></tbody>
  </table>
</section>

<section id="tvlSection">
  <h2>TVL by Protocol</h2>
  <div id="tvlBars"></div>
</section>

<section id="paymentsSection">
  <h2>Recent Payments</h2>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Sender</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody id="paymentsTable"></tbody>
  </table>
</section>

<section id="dailySection">
  <h2>Daily Revenue</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Queries</th>
        <th>Earned (sats)</th>
        <th>Earned (sBTC)</th>
      </tr>
    </thead>
    <tbody id="dailyTable"></tbody>
  </table>
</section>

</div>

<footer>
  <span>Yield Hunter x402 API</span>
  <span id="lastUpdate">-</span>
</footer>

<script>
const API = '';

function fmt(n) { return n.toLocaleString('en-US'); }
function fmtUsd(n) { return '$' + n.toLocaleString('en-US', {maximumFractionDigits: 0}); }
function riskClass(r) { return r <= 25 ? 'risk-low' : r <= 50 ? 'risk-med' : 'risk-high'; }

async function loadAll() {
  try {
    const [earningsRes, statsRes, yieldsRes] = await Promise.all([
      fetch(API + '/api/earnings'),
      fetch(API + '/api/stats'),
      fetch(API + '/api/yields'),
    ]);

    const earnings = await earningsRes.json();
    const stats = await statsRes.json();
    const yields = await yieldsRes.json();

    // Earnings cards
    document.getElementById('totalBtc').textContent = earnings.totalEarned.btc + ' sBTC';
    document.getElementById('totalSats').textContent = fmt(earnings.totalEarned.sats) + ' sats';
    document.getElementById('totalQueries').textContent = fmt(earnings.totalQueries);
    document.getElementById('avgPerQuery').textContent = earnings.totalQueries > 0
      ? fmt(Math.round(earnings.totalEarned.sats / earnings.totalQueries))
      : '0';

    // Stats cards
    document.getElementById('protocolCount').textContent = stats.protocols.count;
    document.getElementById('protocolList').textContent = stats.protocols.list.join(', ');
    document.getElementById('bestApy').textContent = stats.allYields.bestApy.toFixed(2) + '%';
    document.getElementById('totalTvl').textContent = fmtUsd(stats.allYields.totalTvlUsd);
    document.getElementById('yieldCount').textContent = stats.allYields.count + ' pools';
    document.getElementById('sbtcCount').textContent = stats.sbtcYields.count;
    document.getElementById('sbtcTvl').textContent = fmtUsd(stats.sbtcYields.totalTvlUsd) + ' TVL';

    // Yields table
    const yt = document.getElementById('yieldsTable');
    yt.innerHTML = '';
    for (const y of yields.yields) {
      yt.innerHTML += '<tr>'
        + '<td>' + y.protocol + '</td>'
        + '<td>' + y.pool + '</td>'
        + '<td><strong>' + y.apy.toFixed(2) + '%</strong></td>'
        + '<td class="' + riskClass(y.riskScore) + '">' + y.riskScore + '</td>'
        + '<td>' + fmtUsd(y.tvlUsd) + '</td>'
        + '<td>' + y.type + '</td>'
        + '</tr>';
    }

    // Best pool label
    if (yields.yields.length > 0) {
      document.getElementById('bestPool').textContent = yields.yields[0].protocol + ' ' + yields.yields[0].pool;
    }

    // TVL bars
    const tvlByProto = {};
    for (const y of yields.yields) {
      tvlByProto[y.protocol] = (tvlByProto[y.protocol] || 0) + y.tvlUsd;
    }
    const maxTvl = Math.max(...Object.values(tvlByProto));
    const colors = ['#f7931a', '#00d68f', '#4da6ff', '#ff4d4f', '#a855f7'];
    const barsDiv = document.getElementById('tvlBars');
    barsDiv.innerHTML = '';
    let ci = 0;
    for (const [proto, tvl] of Object.entries(tvlByProto).sort((a,b) => b[1] - a[1])) {
      const pct = Math.max(5, (tvl / maxTvl) * 100);
      barsDiv.innerHTML += '<div style="margin-bottom:6px;font-size:11px;color:var(--dim)">' + proto + ' — ' + fmtUsd(tvl) + '</div>'
        + '<div class="bar-wrap"><div class="bar" style="width:' + pct + '%;background:' + colors[ci % colors.length] + '">' + fmtUsd(tvl) + '</div></div>';
      ci++;
    }

    // Payments table
    const pt = document.getElementById('paymentsTable');
    pt.innerHTML = '';
    if (earnings.recentPayments && earnings.recentPayments.length > 0) {
      for (const p of earnings.recentPayments.slice().reverse()) {
        const t = new Date(p.time);
        pt.innerHTML += '<tr>'
          + '<td>' + t.toLocaleTimeString() + '</td>'
          + '<td class="addr">' + p.sender + '</td>'
          + '<td>' + fmt(p.amount) + ' sats</td>'
          + '</tr>';
      }
    } else {
      pt.innerHTML = '<tr><td colspan="3" style="color:var(--dim)">No payments yet</td></tr>';
    }

    // Daily table
    const dt = document.getElementById('dailyTable');
    dt.innerHTML = '';
    if (earnings.byDay && earnings.byDay.length > 0) {
      for (const d of earnings.byDay.slice().reverse()) {
        dt.innerHTML += '<tr>'
          + '<td>' + d.date + '</td>'
          + '<td>' + fmt(d.queries) + '</td>'
          + '<td>' + fmt(d.earned) + '</td>'
          + '<td>' + (d.earned / 100000000).toFixed(8) + '</td>'
          + '</tr>';
      }
    } else {
      dt.innerHTML = '<tr><td colspan="4" style="color:var(--dim)">No data yet</td></tr>';
    }

    // Status
    document.getElementById('status').textContent = 'live';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    document.getElementById('lastUpdate').textContent = 'Updated ' + new Date().toLocaleTimeString();

  } catch (err) {
    document.getElementById('status').textContent = 'error';
    document.getElementById('status').classList.remove('live');
    document.getElementById('loading').textContent = 'Failed to load: ' + err.message;
  }
}

loadAll();
setInterval(loadAll, 60000);
</script>

</body>
</html>`;
}
