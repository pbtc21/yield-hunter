/**
 * Scan Pools - Discover yield opportunities
 * Queries Tenero API for sBTC yield opportunities
 */

import { TeneroClient } from "../api/tenero-client";
import type { YieldOpportunity, RiskAssessment } from "../types";

const usage = `
Usage: bun run scan-pools.ts [options]

Options:
  --min-liquidity <sats>  Minimum pool liquidity (default: 100000000 = 1 BTC)
  --min-apy <bps>         Minimum APY in basis points (default: 100 = 1%)
  --max-risk <score>      Maximum risk score 0-100 (default: 60)
  --limit <count>         Max opportunities to return (default: 10)
  --json                  Output as JSON

Example:
  bun run scan-pools.ts --min-liquidity 500000000 --min-apy 500 --max-risk 40
`;

interface ScanOptions {
  minLiquidity: bigint;
  minApy: number;
  maxRisk: number;
  limit: number;
  json: boolean;
}

function parseArgs(): ScanOptions {
  const args = process.argv.slice(2);
  const options: ScanOptions = {
    minLiquidity: BigInt(100000000), // 1 BTC
    minApy: 100, // 1%
    maxRisk: 60,
    limit: 10,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--min-liquidity":
        options.minLiquidity = BigInt(args[++i]);
        break;
      case "--min-apy":
        options.minApy = parseInt(args[++i]);
        break;
      case "--max-risk":
        options.maxRisk = parseInt(args[++i]);
        break;
      case "--limit":
        options.limit = parseInt(args[++i]);
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        console.log(usage);
        process.exit(0);
    }
  }

  return options;
}

function formatSats(sats: bigint): string {
  const btc = Number(sats) / 100000000;
  return btc >= 1 ? `${btc.toFixed(2)} BTC` : `${Number(sats).toLocaleString()} sats`;
}

function getRiskCategory(score: number): string {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "VERY LOW";
}

function getRecommendation(opp: YieldOpportunity): string {
  if (opp.riskScore > 60) return "AVOID";
  if (opp.riskScore > 40) return "MONITOR";
  return "HUNT";
}

async function main() {
  const options = parseArgs();
  const tenero = new TeneroClient();

  console.log("Scanning for sBTC yield opportunities...\n");

  // Find opportunities
  const opportunities = await tenero.findSbtcOpportunities(
    options.minLiquidity,
    options.minApy
  );

  // Filter by risk
  const filtered = opportunities
    .filter((opp) => opp.riskScore <= options.maxRisk)
    .slice(0, options.limit);

  if (options.json) {
    console.log(JSON.stringify(filtered, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    return { success: true, data: filtered };
  }

  if (filtered.length === 0) {
    console.log("No opportunities found matching criteria.");
    return { success: true, data: [] };
  }

  console.log(`Found ${filtered.length} opportunities:\n`);
  console.log("=" .repeat(80));

  for (let i = 0; i < filtered.length; i++) {
    const opp = filtered[i];
    const recommendation = getRecommendation(opp);
    const riskCategory = getRiskCategory(opp.riskScore);

    console.log(`\n#${i + 1} ${opp.poolName || opp.poolContract.slice(0, 20)}`);
    console.log("-".repeat(40));
    console.log(`  Pool:      ${opp.poolContract}`);
    console.log(`  Pair:      ${opp.tokenXSymbol}/${opp.tokenYSymbol}`);
    console.log(`  Liquidity: ${formatSats(opp.liquidity)}`);
    console.log(`  Volume:    ${formatSats(opp.volume24h)} (24h)`);
    console.log(`  APY:       ${(opp.apy / 100).toFixed(2)}%`);
    console.log(`  Risk:      ${opp.riskScore}/100 (${riskCategory})`);
    console.log(`  Holders:   ${opp.holderCount}`);
    console.log(`  Age:       ${Math.floor(opp.poolAge / 144)} days`);
    console.log(`  Action:    ${recommendation}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\nRisk-adjusted ranking (higher APY + lower risk = better)`);

  return { success: true, data: filtered };
}

main()
  .then((result) => {
    if (!result.success) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("Error scanning pools:", error);
    process.exit(1);
  });
