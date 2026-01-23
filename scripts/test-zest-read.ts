#!/usr/bin/env bun
/**
 * Test Zest Protocol Read-Only Functions
 * Verifies we can fetch real data from Zest mainnet
 */

import { createZestClient, ZEST_CONTRACTS } from "../src/yield-hunter/api/zest-client";
import { fetchMarketConditions, getTokenBalances } from "../src/yield-hunter/api/price-client";

async function main() {
  console.log("=".repeat(60));
  console.log("ZEST PROTOCOL + PRICE FEED TEST");
  console.log("=".repeat(60));
  console.log("");

  // Test Price Feed
  console.log("0. Fetching Market Prices (CoinGecko)...");
  try {
    const market = await fetchMarketConditions();
    console.log(`   BTC: $${market.btcPrice.toLocaleString()} (${market.btcPriceChange24h > 0 ? "+" : ""}${market.btcPriceChange24h.toFixed(2)}%)`);
    console.log(`   STX: $${market.stxPrice.toFixed(4)} (${market.stxPriceChange24h > 0 ? "+" : ""}${market.stxPriceChange24h.toFixed(2)}%)`);
    console.log(`   Sentiment: ${market.overallSentiment}`);
    console.log(`   Volatility: ${market.volatilityIndex.toFixed(1)}`);
    console.log("   ✓ Price feed working");
  } catch (error) {
    console.error(`   ✗ Failed: ${error}`);
  }
  console.log("");

  const zestClient = createZestClient({ network: "mainnet" });

  console.log("Zest Contracts:");
  console.log(`  Pool Borrow: ${ZEST_CONTRACTS.mainnet.poolBorrow}`);
  console.log(`  Pool Reserve: ${ZEST_CONTRACTS.mainnet.poolReserve}`);
  console.log(`  zsBTC Token: ${ZEST_CONTRACTS.mainnet.zsBTC}`);
  console.log("");

  // Test 1: Get Supply APY
  console.log("1. Fetching Zest Supply APY...");
  try {
    const apy = await zestClient.getZestSupplyAPY();
    const apyPercent = (apy / 100).toFixed(2);
    console.log(`   Supply APY: ${apyPercent}% (${apy} bps)`);

    if (apy >= 0 && apy <= 5000) {
      console.log("   ✓ APY is within expected range (0-50%)");
    } else {
      console.log("   ⚠ APY seems unusual, verify manually");
    }
  } catch (error) {
    console.error(`   ✗ Failed: ${error}`);
  }
  console.log("");

  // Test 2: Get Reserve State
  console.log("2. Fetching Zest Reserve State...");
  try {
    const state = await zestClient.getZestReserveState();
    if (state) {
      const totalSupplyBTC = Number(state.totalSupply) / 100_000_000;
      const totalBorrowBTC = Number(state.totalBorrow) / 100_000_000;

      console.log(`   Total Supply: ${totalSupplyBTC.toFixed(8)} sBTC`);
      console.log(`   Total Borrow: ${totalBorrowBTC.toFixed(8)} sBTC`);
      console.log(`   Supply Rate: ${(state.supplyRate / 100).toFixed(2)}%`);
      console.log(`   Borrow Rate: ${(state.borrowRate / 100).toFixed(2)}%`);
      console.log(`   Utilization: ${state.utilizationRate.toFixed(2)}%`);
      console.log("   ✓ Reserve state fetched successfully");
    } else {
      console.log("   ⚠ Reserve state returned null - may need different function");
    }
  } catch (error) {
    console.error(`   ✗ Failed: ${error}`);
  }
  console.log("");

  // Test 3: Get Position for a sample address (will likely be empty)
  const testAddress = "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N";
  console.log(`3. Fetching Zest Position for ${testAddress.slice(0, 10)}...`);
  try {
    const position = await zestClient.getZestPosition(testAddress);
    if (position) {
      const suppliedBTC = Number(position.supplied) / 100_000_000;
      console.log(`   Supplied: ${suppliedBTC.toFixed(8)} sBTC`);
      console.log(`   As Collateral: ${position.asCollateral}`);
      console.log("   ✓ Position fetched successfully");
    } else {
      console.log("   Position is null (address may have no position)");
    }
  } catch (error) {
    console.error(`   ✗ Failed: ${error}`);
  }
  console.log("");

  // Test 4: Get zsBTC balance for sample address
  console.log(`4. Fetching zsBTC balance for ${testAddress.slice(0, 10)}...`);
  try {
    const balance = await zestClient.getZsBTCBalance(testAddress);
    const balanceBTC = Number(balance) / 100_000_000;
    console.log(`   zsBTC Balance: ${balanceBTC.toFixed(8)}`);
    console.log("   ✓ Balance fetched successfully");
  } catch (error) {
    console.error(`   ✗ Failed: ${error}`);
  }
  console.log("");

  // Test 5: Calculate expected yield
  console.log("5. Testing yield calculation...");
  try {
    const amount = 100_000_000n; // 1 sBTC
    const apyBps = 400; // 4%
    const blocksPerMonth = 4380; // ~30 days

    const expectedYield = zestClient.calculateExpectedYield(amount, apyBps, blocksPerMonth);
    const yieldBTC = Number(expectedYield) / 100_000_000;

    console.log(`   Amount: 1 sBTC`);
    console.log(`   APY: 4%`);
    console.log(`   Period: 1 month (~4380 blocks)`);
    console.log(`   Expected Yield: ${yieldBTC.toFixed(8)} sBTC`);
    console.log("   ✓ Calculation complete");
  } catch (error) {
    console.error(`   ✗ Failed: ${error}`);
  }
  console.log("");

  console.log("=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
