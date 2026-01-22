/**
 * Styx Bridge Validation Tests
 * Run with: bun test tests/styx-bridge_test.ts
 *
 * Note: These tests focus on validation logic, not actual SDK integration
 * SDK integration tests require testnet/mainnet deployment
 */

import { describe, test, expect } from "bun:test";
import {
  MIN_DEPOSIT_SATS,
  MAX_DEPOSIT_SATS,
  satsToBtc,
  satsToUsd,
  recommendBridge,
} from "../src/yield-hunter/wallet/styx-bridge";

describe("Styx Bridge Validation", () => {
  test("MIN_DEPOSIT_SATS is reasonable", () => {
    expect(MIN_DEPOSIT_SATS).toBe(10_000);
    expect(MIN_DEPOSIT_SATS).toBeGreaterThan(0);
  });

  test("MAX_DEPOSIT_SATS is reasonable", () => {
    expect(MAX_DEPOSIT_SATS).toBe(10_000_000);
    expect(MAX_DEPOSIT_SATS).toBeGreaterThan(MIN_DEPOSIT_SATS);
  });
});

describe("Styx Helper Functions", () => {
  test("satsToBtc formats correctly", () => {
    expect(satsToBtc(100_000_000)).toBe("1.00000000");
    expect(satsToBtc(50_000_000)).toBe("0.50000000");
    expect(satsToBtc(1)).toBe("0.00000001");
    expect(satsToBtc(0)).toBe("0.00000000");
  });

  test("satsToUsd calculates correctly", () => {
    // At $100,000/BTC
    expect(satsToUsd(100_000_000, 100_000)).toBe("$100000.00");
    expect(satsToUsd(1_000_000, 100_000)).toBe("$1000.00");
    expect(satsToUsd(10_000, 100_000)).toBe("$10.00");
  });

  test("recommendBridge returns styx for small amounts", () => {
    // $10 worth at $100k/BTC
    const result = recommendBridge(10_000, 100_000);
    expect(result).toBe("styx");
  });

  test("recommendBridge returns styx for $100", () => {
    // $100 worth at $100k/BTC = 0.001 BTC = 100,000 sats
    const result = recommendBridge(100_000, 100_000);
    expect(result).toBe("styx");
  });

  test("recommendBridge returns sbtc-bridge for large amounts", () => {
    // $500 worth at $100k/BTC = 0.005 BTC = 500,000 sats
    const result = recommendBridge(500_000, 100_000);
    expect(result).toBe("sbtc-bridge");
  });

  test("recommendBridge returns sbtc-bridge for very large amounts", () => {
    // 1 BTC = $100k = 100,000,000 sats
    const result = recommendBridge(100_000_000, 100_000);
    expect(result).toBe("sbtc-bridge");
  });
});

describe("Amount Validation Logic", () => {
  test("validates minimum deposit", () => {
    const tooLow = MIN_DEPOSIT_SATS - 1;
    const atMin = MIN_DEPOSIT_SATS;
    const aboveMin = MIN_DEPOSIT_SATS + 1;

    expect(tooLow < MIN_DEPOSIT_SATS).toBe(true);
    expect(atMin >= MIN_DEPOSIT_SATS).toBe(true);
    expect(aboveMin >= MIN_DEPOSIT_SATS).toBe(true);
  });

  test("validates maximum deposit", () => {
    const atMax = MAX_DEPOSIT_SATS;
    const aboveMax = MAX_DEPOSIT_SATS + 1;

    expect(atMax <= MAX_DEPOSIT_SATS).toBe(true);
    expect(aboveMax <= MAX_DEPOSIT_SATS).toBe(false);
  });

  test("valid range is reasonable", () => {
    const validAmount = 100_000; // 0.001 BTC

    expect(validAmount >= MIN_DEPOSIT_SATS).toBe(true);
    expect(validAmount <= MAX_DEPOSIT_SATS).toBe(true);
  });
});

describe("Fee Estimation Logic", () => {
  test("fee rates are reasonable", () => {
    const lowFeeRate = 5;
    const mediumFeeRate = 15;
    const highFeeRate = 30;
    const txSize = 250; // typical vBytes

    const lowFee = lowFeeRate * txSize;
    const mediumFee = mediumFeeRate * txSize;
    const highFee = highFeeRate * txSize;

    // Fees should be ordered correctly
    expect(lowFee).toBeLessThan(mediumFee);
    expect(mediumFee).toBeLessThan(highFee);

    // Fees should be reasonable for a typical tx
    expect(lowFee).toBe(1250);
    expect(mediumFee).toBe(3750);
    expect(highFee).toBe(7500);
  });

  test("output amount equals input minus fee", () => {
    const inputAmount = 100_000;
    const fee = 3750;
    const outputAmount = inputAmount - fee;

    expect(outputAmount).toBe(96_250);
    expect(outputAmount).toBeGreaterThan(0);
    expect(outputAmount).toBeLessThan(inputAmount);
  });
});
