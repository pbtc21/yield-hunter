/**
 * Monte Carlo Risk Simulation Engine
 * Probabilistic risk assessment for yield hunting decisions
 */

import type { YieldOpportunity, RiskFactors, RiskAssessment, Position, MarketConditions } from "../types";

// ============================================
// CONSTANTS
// ============================================

const SIMULATION_RUNS = 10000;
const TIME_HORIZONS = [7, 30, 90]; // days
const BLOCKS_PER_DAY = 144;
const BPS_SCALE = 10000;

// Default volatility assumptions (annualized)
const DEFAULT_VOLATILITY = {
  btc: 0.6, // 60% annual volatility
  stx: 0.8, // 80% annual volatility
  lpToken: 0.5, // 50% for LP tokens (IL + underlying)
};

// ============================================
// MONTE CARLO SIMULATION
// ============================================

export interface SimulationParams {
  initialInvestment: bigint;
  apy: number; // basis points
  volatility: number; // annualized (0-1)
  timeHorizonDays: number;
  riskFactors: RiskFactors;
}

export interface SimulationResult {
  expectedReturn: number;
  medianReturn: number;
  worstCase5Pct: number; // 5th percentile (VaR)
  bestCase95Pct: number; // 95th percentile
  probabilityOfLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  confidenceInterval95: [number, number];
}

/**
 * Run Monte Carlo simulation for a yield opportunity
 * Uses Geometric Brownian Motion to model returns
 */
export function runMonteCarloSimulation(params: SimulationParams): SimulationResult {
  const { initialInvestment, apy, volatility, timeHorizonDays, riskFactors } = params;

  // Convert APY to daily return
  const annualReturn = apy / BPS_SCALE;
  const dailyReturn = annualReturn / 365;
  const dailyVolatility = volatility / Math.sqrt(365);

  // Adjust for risk factors
  const riskAdjustedVolatility = adjustVolatilityForRisk(dailyVolatility, riskFactors);

  const returns: number[] = [];
  const maxDrawdowns: number[] = [];

  // Run simulations
  for (let i = 0; i < SIMULATION_RUNS; i++) {
    let portfolioValue = Number(initialInvestment);
    let peakValue = portfolioValue;
    let maxDrawdown = 0;

    for (let day = 0; day < timeHorizonDays; day++) {
      // Generate random normal using Box-Muller
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      // Geometric Brownian Motion step
      const dailyChange = dailyReturn + riskAdjustedVolatility * z;
      portfolioValue *= 1 + dailyChange;

      // Track drawdown
      if (portfolioValue > peakValue) {
        peakValue = portfolioValue;
      }
      const drawdown = (peakValue - portfolioValue) / peakValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Simulate potential impermanent loss events
      if (Math.random() < riskFactors.concentrationRisk / 100 / 365) {
        portfolioValue *= 0.95; // 5% IL shock
      }
    }

    returns.push((portfolioValue - Number(initialInvestment)) / Number(initialInvestment));
    maxDrawdowns.push(maxDrawdown);
  }

  // Sort returns for percentile calculations
  returns.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);

  // Calculate statistics
  const expectedReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const medianReturn = returns[Math.floor(returns.length / 2)];
  const worstCase5Pct = returns[Math.floor(returns.length * 0.05)];
  const bestCase95Pct = returns[Math.floor(returns.length * 0.95)];
  const probabilityOfLoss = returns.filter((r) => r < 0).length / returns.length;
  const maxDrawdown = maxDrawdowns[Math.floor(maxDrawdowns.length * 0.95)];

  // Calculate Sharpe Ratio (assuming 0% risk-free rate for simplicity)
  const stdDev = Math.sqrt(returns.map((r) => (r - expectedReturn) ** 2).reduce((a, b) => a + b, 0) / returns.length);
  const sharpeRatio = stdDev > 0 ? expectedReturn / stdDev : 0;

  return {
    expectedReturn,
    medianReturn,
    worstCase5Pct,
    bestCase95Pct,
    probabilityOfLoss,
    sharpeRatio,
    maxDrawdown,
    confidenceInterval95: [returns[Math.floor(returns.length * 0.025)], returns[Math.floor(returns.length * 0.975)]],
  };
}

/**
 * Adjust volatility based on risk factors
 */
function adjustVolatilityForRisk(baseVolatility: number, factors: RiskFactors): number {
  // Higher risk = higher volatility
  const liquidityMultiplier = 1 + (factors.liquidityRisk / 100) * 0.5;
  const volumeMultiplier = 1 + (factors.volumeRisk / 100) * 0.3;
  const concentrationMultiplier = 1 + (factors.concentrationRisk / 100) * 0.4;
  const ageMultiplier = 1 + (factors.ageRisk / 100) * 0.2;

  return baseVolatility * liquidityMultiplier * volumeMultiplier * concentrationMultiplier * ageMultiplier;
}

// ============================================
// RISK SCORING
// ============================================

export interface RiskWeights {
  liquidity: number;
  volume: number;
  concentration: number;
  age: number;
}

const DEFAULT_WEIGHTS: RiskWeights = {
  liquidity: 0.4,
  volume: 0.25,
  concentration: 0.2,
  age: 0.15,
};

/**
 * Calculate overall risk score for a pool
 */
export function calculateRiskScore(opportunity: YieldOpportunity, weights: RiskWeights = DEFAULT_WEIGHTS): RiskAssessment {
  const factors = calculateRiskFactors(opportunity);

  const overallScore = Math.round(
    factors.liquidityRisk * weights.liquidity +
      factors.volumeRisk * weights.volume +
      factors.concentrationRisk * weights.concentration +
      factors.ageRisk * weights.age
  );

  const category = overallScore <= 25 ? "very-low" : overallScore <= 50 ? "low" : overallScore <= 75 ? "medium" : "high";

  // Max position size based on risk (higher risk = smaller position)
  const maxPositionSizeBps = Math.max(500, 2500 - overallScore * 25);

  const recommendation =
    overallScore <= 40 ? "hunt" : overallScore <= 60 ? "monitor" : "avoid";

  return {
    poolContract: opportunity.poolContract,
    overallScore,
    category,
    factors,
    maxPositionSizeBps,
    recommendation,
    calculatedAt: Date.now(),
  };
}

/**
 * Calculate individual risk factors
 */
function calculateRiskFactors(opportunity: YieldOpportunity): RiskFactors {
  const { liquidity, volume24h, holderCount, poolAge } = opportunity;

  // Liquidity risk: lower liquidity = higher risk
  const liquidityBtc = Number(liquidity) / 1e8;
  const liquidityRisk =
    liquidityBtc > 100
      ? 10
      : liquidityBtc > 50
        ? 20
        : liquidityBtc > 10
          ? 35
          : liquidityBtc > 1
            ? 55
            : 80;

  // Volume risk: lower volume = higher risk (illiquid)
  const volumeBtc = Number(volume24h) / 1e8;
  const volumeRisk =
    volumeBtc > 10
      ? 10
      : volumeBtc > 5
        ? 25
        : volumeBtc > 1
          ? 40
          : volumeBtc > 0.1
            ? 60
            : 85;

  // Concentration risk: fewer holders = higher risk
  const concentrationRisk =
    holderCount > 1000
      ? 10
      : holderCount > 500
        ? 20
        : holderCount > 100
          ? 35
          : holderCount > 20
            ? 55
            : 80;

  // Age risk: newer pools = higher risk
  const ageInDays = poolAge / BLOCKS_PER_DAY;
  const ageRisk = ageInDays > 365 ? 10 : ageInDays > 90 ? 25 : ageInDays > 30 ? 45 : ageInDays > 7 ? 65 : 90;

  return {
    liquidityRisk,
    volumeRisk,
    concentrationRisk,
    ageRisk,
  };
}

// ============================================
// PORTFOLIO RISK ANALYSIS
// ============================================

export interface PortfolioRisk {
  totalExposure: bigint;
  weightedRiskScore: number;
  correlationRisk: number;
  concentrationByProtocol: Map<string, number>;
  maxSinglePositionPct: number;
  diversificationScore: number;
  portfolioVaR5Pct: number;
}

/**
 * Analyze portfolio-level risk
 */
export function analyzePortfolioRisk(positions: Position[], opportunities: Map<string, YieldOpportunity>): PortfolioRisk {
  if (positions.length === 0) {
    return {
      totalExposure: BigInt(0),
      weightedRiskScore: 0,
      correlationRisk: 0,
      concentrationByProtocol: new Map(),
      maxSinglePositionPct: 0,
      diversificationScore: 100,
      portfolioVaR5Pct: 0,
    };
  }

  let totalExposure = BigInt(0);
  let weightedRiskSum = 0;
  const protocolExposures = new Map<string, bigint>();

  for (const position of positions) {
    if (!position.active) continue;

    totalExposure += position.amountInvested;

    // Get opportunity data for risk calculation
    const opp = opportunities.get(position.poolContract);
    if (opp) {
      const weight = Number(position.amountInvested) / Number(totalExposure);
      weightedRiskSum += position.riskScore * weight;

      // Track protocol concentration (extract protocol from contract)
      const protocol = position.poolContract.split(".")[0];
      const current = protocolExposures.get(protocol) || BigInt(0);
      protocolExposures.set(protocol, current + position.amountInvested);
    }
  }

  // Calculate concentration by protocol
  const concentrationByProtocol = new Map<string, number>();
  for (const [protocol, exposure] of protocolExposures) {
    concentrationByProtocol.set(protocol, Number(exposure) / Number(totalExposure));
  }

  // Max single position percentage
  const maxPosition = positions
    .filter((p) => p.active)
    .reduce((max, p) => (p.amountInvested > max ? p.amountInvested : max), BigInt(0));
  const maxSinglePositionPct = totalExposure > 0 ? (Number(maxPosition) / Number(totalExposure)) * 100 : 0;

  // Diversification score (inverse of concentration)
  const hhi = Array.from(protocolExposures.values()).reduce((sum, exp) => {
    const pct = Number(exp) / Number(totalExposure);
    return sum + pct * pct;
  }, 0);
  const diversificationScore = Math.max(0, Math.round((1 - hhi) * 100));

  // Correlation risk (simplified - assume similar assets are correlated)
  const correlationRisk = positions.length > 1 ? 30 : 0;

  // Portfolio VaR using weighted average
  const portfolioVaR5Pct = weightedRiskSum * 0.05; // Simplified

  return {
    totalExposure,
    weightedRiskScore: Math.round(weightedRiskSum),
    correlationRisk,
    concentrationByProtocol,
    maxSinglePositionPct,
    diversificationScore,
    portfolioVaR5Pct,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate optimal position size using Kelly Criterion
 */
export function calculateKellyPositionSize(
  winProbability: number,
  avgWin: number,
  avgLoss: number,
  maxPositionPct: number = 25
): number {
  if (avgLoss === 0) return maxPositionPct;

  // Kelly formula: f* = (p * b - q) / b
  // where p = win prob, q = loss prob, b = win/loss ratio
  const q = 1 - winProbability;
  const b = avgWin / Math.abs(avgLoss);

  const kelly = (winProbability * b - q) / b;

  // Use half-Kelly for safety
  const halfKelly = kelly / 2;

  // Clamp to reasonable bounds
  return Math.max(1, Math.min(maxPositionPct, halfKelly * 100));
}

/**
 * Calculate Value at Risk (VaR) at a given confidence level
 */
export function calculateVaR(returns: number[], confidenceLevel: number = 0.95): number {
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * (1 - confidenceLevel));
  return -sorted[index]; // Return as positive loss
}

/**
 * Calculate Conditional VaR (Expected Shortfall)
 * CVaR is the expected loss given that we're in the tail beyond VaR
 */
export function calculateCVaR(returns: number[], confidenceLevel: number = 0.95): number {
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.max(1, Math.floor(sorted.length * (1 - confidenceLevel)));
  const tailReturns = sorted.slice(0, cutoffIndex);
  if (tailReturns.length === 0) {
    return calculateVaR(returns, confidenceLevel); // Fallback to VaR if no tail
  }
  const avgTailLoss = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
  return -avgTailLoss;
}

/**
 * Simulate impermanent loss for LP positions
 */
export function simulateImpermanentLoss(priceChangeRatio: number): number {
  // IL = 2 * sqrt(priceRatio) / (1 + priceRatio) - 1
  const sqrtRatio = Math.sqrt(priceChangeRatio);
  const il = (2 * sqrtRatio) / (1 + priceChangeRatio) - 1;
  return Math.abs(il);
}
