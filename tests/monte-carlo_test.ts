/**
 * Monte Carlo Simulation Tests
 * Run with: bun test tests/monte-carlo_test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  runMonteCarloSimulation,
  calculateRiskScore,
  calculateKellyPositionSize,
  calculateVaR,
  calculateCVaR,
  simulateImpermanentLoss,
  type SimulationParams,
} from "../src/yield-hunter/engine/monte-carlo";
import type { YieldOpportunity } from "../src/yield-hunter/types";

describe("Monte Carlo Simulation", () => {
  test("runMonteCarloSimulation returns valid results", () => {
    const params: SimulationParams = {
      initialInvestment: BigInt(10_000_000), // 0.1 sBTC
      apy: 1500, // 15% APY
      volatility: 0.5,
      timeHorizonDays: 30,
      riskFactors: {
        liquidityRisk: 20,
        volumeRisk: 25,
        concentrationRisk: 30,
        ageRisk: 15,
      },
    };

    const result = runMonteCarloSimulation(params);

    // Expected return should be defined
    expect(typeof result.expectedReturn).toBe("number");
    expect(typeof result.medianReturn).toBe("number");
    expect(typeof result.worstCase5Pct).toBe("number");
    expect(typeof result.bestCase95Pct).toBe("number");

    // Probability of loss should be between 0 and 1
    expect(result.probabilityOfLoss).toBeGreaterThanOrEqual(0);
    expect(result.probabilityOfLoss).toBeLessThanOrEqual(1);

    // Sharpe ratio should be defined
    expect(typeof result.sharpeRatio).toBe("number");

    // Max drawdown should be positive
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);

    // Confidence interval should be ordered correctly
    expect(result.confidenceInterval95[0]).toBeLessThan(result.confidenceInterval95[1]);

    // Worst case should be less than median
    expect(result.worstCase5Pct).toBeLessThanOrEqual(result.medianReturn);

    // Best case should be greater than median
    expect(result.bestCase95Pct).toBeGreaterThanOrEqual(result.medianReturn);
  });

  test("higher risk factors increase volatility", () => {
    const baseParams: SimulationParams = {
      initialInvestment: BigInt(10_000_000),
      apy: 1500,
      volatility: 0.5,
      timeHorizonDays: 30,
      riskFactors: {
        liquidityRisk: 10,
        volumeRisk: 10,
        concentrationRisk: 10,
        ageRisk: 10,
      },
    };

    const highRiskParams: SimulationParams = {
      ...baseParams,
      riskFactors: {
        liquidityRisk: 80,
        volumeRisk: 80,
        concentrationRisk: 80,
        ageRisk: 80,
      },
    };

    const lowRiskResult = runMonteCarloSimulation(baseParams);
    const highRiskResult = runMonteCarloSimulation(highRiskParams);

    // Higher risk should have higher probability of loss
    expect(highRiskResult.probabilityOfLoss).toBeGreaterThan(lowRiskResult.probabilityOfLoss);

    // Higher risk should have worse worst-case scenario
    expect(highRiskResult.worstCase5Pct).toBeLessThan(lowRiskResult.worstCase5Pct);
  });

  test("longer time horizon affects results", () => {
    const shortTermParams: SimulationParams = {
      initialInvestment: BigInt(10_000_000),
      apy: 1500,
      volatility: 0.5,
      timeHorizonDays: 7,
      riskFactors: {
        liquidityRisk: 20,
        volumeRisk: 20,
        concentrationRisk: 20,
        ageRisk: 20,
      },
    };

    const longTermParams: SimulationParams = {
      ...shortTermParams,
      timeHorizonDays: 90,
    };

    const shortResult = runMonteCarloSimulation(shortTermParams);
    const longResult = runMonteCarloSimulation(longTermParams);

    // Longer time horizon should have higher expected returns (compound effect)
    expect(longResult.expectedReturn).toBeGreaterThan(shortResult.expectedReturn);
  });
});

describe("Risk Score Calculation", () => {
  test("calculates risk score for low-risk opportunity", () => {
    const opportunity: YieldOpportunity = {
      poolContract: "SP123.pool",
      poolName: "Test Pool",
      tokenX: "SP123.tokenX",
      tokenY: "SP123.tokenY",
      tokenXSymbol: "SBTC",
      tokenYSymbol: "STX",
      liquidity: BigInt(100_000_000_000), // 1000 BTC - high liquidity
      volume24h: BigInt(10_000_000_000), // 100 BTC - high volume
      feeTier: 30,
      apy: 1000,
      riskScore: 0,
      holderCount: 2000, // Many holders
      poolAge: 100000, // Old pool
      lastUpdated: Date.now(),
    };

    const assessment = calculateRiskScore(opportunity);

    // Low risk opportunity should have low score
    expect(assessment.overallScore).toBeLessThan(30);
    expect(assessment.category).toBe("very-low");
    expect(assessment.recommendation).toBe("hunt");
    expect(assessment.maxPositionSizeBps).toBeGreaterThan(2000);
  });

  test("calculates risk score for high-risk opportunity", () => {
    const opportunity: YieldOpportunity = {
      poolContract: "SP123.pool",
      poolName: "Risky Pool",
      tokenX: "SP123.tokenX",
      tokenY: "SP123.tokenY",
      tokenXSymbol: "SBTC",
      tokenYSymbol: "MEME",
      liquidity: BigInt(10_000_000), // 0.1 BTC - very low liquidity
      volume24h: BigInt(1_000_000), // 0.01 BTC - very low volume
      feeTier: 30,
      apy: 50000, // Very high APY (red flag)
      riskScore: 0,
      holderCount: 5, // Very few holders
      poolAge: 100, // New pool
      lastUpdated: Date.now(),
    };

    const assessment = calculateRiskScore(opportunity);

    // High risk opportunity should have high score
    expect(assessment.overallScore).toBeGreaterThan(60);
    expect(assessment.category).toBe("high");
    expect(assessment.recommendation).toBe("avoid");
    expect(assessment.maxPositionSizeBps).toBeLessThan(1000);
  });
});

describe("Kelly Criterion Position Sizing", () => {
  test("calculates optimal position size", () => {
    // 60% win rate, 2:1 win/loss ratio
    const position = calculateKellyPositionSize(0.6, 0.2, 0.1, 25);

    expect(position).toBeGreaterThan(0);
    expect(position).toBeLessThanOrEqual(25);
  });

  test("returns minimum position for unfavorable odds", () => {
    // 40% win rate, 1:1 win/loss ratio (negative expected value)
    const position = calculateKellyPositionSize(0.4, 0.1, 0.1, 25);

    expect(position).toBeGreaterThanOrEqual(1);
    expect(position).toBeLessThanOrEqual(25);
  });

  test("respects max position limit", () => {
    // Very favorable odds (would suggest > 25%)
    const position = calculateKellyPositionSize(0.9, 0.5, 0.1, 25);

    expect(position).toBeLessThanOrEqual(25);
  });
});

describe("Value at Risk (VaR)", () => {
  test("calculates VaR correctly", () => {
    const returns = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const var95 = calculateVaR(returns, 0.95);

    // At 95% confidence, VaR should be around the 5th percentile loss
    expect(var95).toBeGreaterThan(0); // Positive = loss
    expect(var95).toBeLessThanOrEqual(0.3); // Should not exceed worst case
  });

  test("calculates CVaR (Expected Shortfall)", () => {
    const returns = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const cvar = calculateCVaR(returns, 0.95);

    // CVaR should be >= VaR (average of tail losses)
    const var95 = calculateVaR(returns, 0.95);
    expect(cvar).toBeGreaterThanOrEqual(var95);
  });
});

describe("Impermanent Loss Simulation", () => {
  test("no IL when price unchanged", () => {
    const il = simulateImpermanentLoss(1.0);
    expect(il).toBeCloseTo(0, 5);
  });

  test("calculates IL for 2x price increase", () => {
    const il = simulateImpermanentLoss(2.0);
    // IL for 2x price change is approximately 5.7%
    expect(il).toBeGreaterThan(0.05);
    expect(il).toBeLessThan(0.06);
  });

  test("calculates IL for 50% price decrease", () => {
    const il = simulateImpermanentLoss(0.5);
    // IL for 0.5x price change is approximately 5.7%
    expect(il).toBeGreaterThan(0.05);
    expect(il).toBeLessThan(0.06);
  });

  test("IL increases with larger price divergence", () => {
    const il2x = simulateImpermanentLoss(2.0);
    const il4x = simulateImpermanentLoss(4.0);

    expect(il4x).toBeGreaterThan(il2x);
  });
});
