/**
 * Leaderboard API
 * Hono-based API for serving yield hunter leaderboard data
 * Deploy as Cloudflare Worker
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { ContractClient } from "./contract-client";
import type { LeaderboardEntry, LeaderboardStats } from "../types";

// ============================================
// TYPES
// ============================================

interface Env {
  STACKS_NETWORK: "mainnet" | "testnet";
  YIELD_HUNTER_CONTRACT: string;
  ORACLE_CONTRACT: string;
}

interface LeaderboardResponse {
  success: boolean;
  data?: LeaderboardEntry[] | LeaderboardEntry | LeaderboardStats;
  error?: string;
  timestamp: number;
}

// ============================================
// APP
// ============================================

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", cors());

// Health check
app.get("/", (c) => {
  return c.json({
    name: "Yield Hunter Leaderboard API",
    version: "1.0.0",
    endpoints: [
      "GET /leaderboard",
      "GET /leaderboard/:rank",
      "GET /leaderboard/hunter/:address",
      "GET /leaderboard/stats",
    ],
  });
});

// ============================================
// LEADERBOARD ENDPOINTS
// ============================================

/**
 * GET /leaderboard
 * Get top hunters with pagination
 */
app.get("/leaderboard", async (c) => {
  const limit = parseInt(c.req.query("limit") || "10");
  const offset = parseInt(c.req.query("offset") || "0");
  const alive = c.req.query("alive"); // Filter by alive status

  try {
    const contracts = new ContractClient({
      network: c.env.STACKS_NETWORK || "testnet",
    });

    // Get entries
    const entries: LeaderboardEntry[] = [];
    for (let rank = offset + 1; rank <= offset + limit; rank++) {
      const entry = await contracts.getLeaderboardEntry(rank);
      if (entry) {
        // Filter by alive status if specified
        if (alive === undefined || entry.alive === (alive === "true")) {
          entries.push(entry);
        }
      }
    }

    return c.json<LeaderboardResponse>({
      success: true,
      data: entries,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return c.json<LeaderboardResponse>(
      {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      },
      500
    );
  }
});

/**
 * GET /leaderboard/:rank
 * Get hunter at specific rank
 */
app.get("/leaderboard/:rank", async (c) => {
  const rank = parseInt(c.req.param("rank"));

  if (isNaN(rank) || rank < 1 || rank > 100) {
    return c.json<LeaderboardResponse>(
      {
        success: false,
        error: "Invalid rank. Must be 1-100.",
        timestamp: Date.now(),
      },
      400
    );
  }

  try {
    const contracts = new ContractClient({
      network: c.env.STACKS_NETWORK || "testnet",
    });

    const entry = await contracts.getLeaderboardEntry(rank);

    if (!entry) {
      return c.json<LeaderboardResponse>(
        {
          success: false,
          error: "No hunter at this rank",
          timestamp: Date.now(),
        },
        404
      );
    }

    return c.json<LeaderboardResponse>({
      success: true,
      data: entry,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return c.json<LeaderboardResponse>(
      {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      },
      500
    );
  }
});

/**
 * GET /leaderboard/hunter/:address
 * Get hunter by address
 */
app.get("/leaderboard/hunter/:address", async (c) => {
  const address = c.req.param("address");

  try {
    const contracts = new ContractClient({
      network: c.env.STACKS_NETWORK || "testnet",
    });

    // Get hunter state
    const hunter = await contracts.getHunter(address);

    if (!hunter) {
      return c.json<LeaderboardResponse>(
        {
          success: false,
          error: "Hunter not found",
          timestamp: Date.now(),
        },
        404
      );
    }

    // Get positions
    const positionIds = await contracts.getHunterPositions(address);
    const positions = await Promise.all(
      positionIds.map((id) => contracts.getPosition(id))
    );

    return c.json({
      success: true,
      data: {
        hunter,
        positions: positions.filter(Boolean),
        positionCount: positionIds.length,
      },
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return c.json<LeaderboardResponse>(
      {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      },
      500
    );
  }
});

/**
 * GET /leaderboard/stats
 * Get global leaderboard statistics
 */
app.get("/leaderboard/stats", async (c) => {
  try {
    const contracts = new ContractClient({
      network: c.env.STACKS_NETWORK || "testnet",
    });

    // Get global stats
    const stats = await contracts.getStats();

    // Get top earner
    const topEarner = await contracts.getLeaderboardEntry(1);

    // Calculate aggregate stats
    const topHunters = await contracts.getTopHunters(10);
    const totalEarnings = topHunters.reduce(
      (sum, h) => sum + h.totalEarnings,
      BigInt(0)
    );
    const avgWinRate =
      topHunters.reduce((sum, h) => sum + h.winRateBps, 0) / topHunters.length;

    return c.json<LeaderboardResponse>({
      success: true,
      data: {
        totalHunters: stats?.["total-hunters"] || 0,
        totalEarningsDistributed: totalEarnings,
        topEarner,
        avgWinRate: Math.round(avgWinRate),
        lastUpdated: Date.now(),
      } as LeaderboardStats,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return c.json<LeaderboardResponse>(
      {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      },
      500
    );
  }
});

// ============================================
// FORMATTED VIEWS (HTML)
// ============================================

/**
 * GET /view
 * HTML view of leaderboard (like aibtc-agent-directory)
 */
app.get("/view", async (c) => {
  try {
    const contracts = new ContractClient({
      network: c.env.STACKS_NETWORK || "testnet",
    });

    const topHunters = await contracts.getTopHunters(20);

    const html = generateLeaderboardHTML(topHunters);
    return c.html(html);
  } catch (error: any) {
    return c.html(`<h1>Error loading leaderboard: ${error.message}</h1>`);
  }
});

function generateLeaderboardHTML(hunters: LeaderboardEntry[]): string {
  const formatSats = (sats: bigint): string => {
    const btc = Number(sats) / 100000000;
    return btc >= 0.01 ? `${btc.toFixed(4)} BTC` : `${Number(sats).toLocaleString()} sats`;
  };

  const rows = hunters
    .map(
      (h) => `
    <tr class="${h.alive ? "" : "dead"}">
      <td class="rank">#${h.rank}</td>
      <td class="hunter">
        <div class="avatar">
          <img src="https://bitcoinfaces.xyz/api/get-image?name=${h.owner}" alt="${h.name}" />
          ${!h.alive ? '<span class="skull">💀</span>' : ""}
        </div>
        <div class="info">
          <span class="name">${h.name}</span>
          <span class="address">${h.hunterAccount.slice(0, 8)}...${h.hunterAccount.slice(-6)}</span>
        </div>
      </td>
      <td class="earnings">${formatSats(h.totalEarnings)}</td>
      <td class="win-rate">${(h.winRateBps / 100).toFixed(1)}%</td>
      <td class="positions">${h.positionsClosed}</td>
      <td class="status">${h.alive ? "🟢 Active" : "💀 Dead"}</td>
    </tr>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yield Hunter Leaderboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d0d0d;
      color: #fff;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #f7931a, #ffd93d);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #888; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #222; }
    th { color: #888; font-weight: 500; font-size: 0.875rem; text-transform: uppercase; }
    tr:hover { background: #1a1a1a; }
    tr.dead { opacity: 0.6; }
    .rank { color: #f7931a; font-weight: bold; }
    .hunter { display: flex; align-items: center; gap: 1rem; }
    .avatar {
      position: relative;
      width: 48px;
      height: 48px;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #222;
    }
    .avatar .skull {
      position: absolute;
      top: -4px;
      right: -4px;
      font-size: 1rem;
    }
    .info { display: flex; flex-direction: column; }
    .name { font-weight: 600; }
    .address { font-size: 0.75rem; color: #666; font-family: monospace; }
    .earnings { color: #4ade80; font-weight: 600; }
    .win-rate { color: #60a5fa; }
    .status { font-size: 0.875rem; }
    @media (max-width: 768px) {
      th, td { padding: 0.5rem; font-size: 0.875rem; }
      .avatar { width: 32px; height: 32px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏆 Yield Hunter Leaderboard</h1>
    <p class="subtitle">Top performing autonomous yield hunting agents on Stacks</p>
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Hunter</th>
          <th>Total Earnings</th>
          <th>Win Rate</th>
          <th>Positions</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;
}

// ============================================
// EXPORT
// ============================================

export default app;
