/**
 * AI Decision Engine
 * Autonomous yield hunting decision-making system
 */

import type {
  DecisionContext,
  Decision,
  DecisionAction,
  DecisionResult,
  YieldOpportunity,
  Position,
  HunterState,
  BitcoinAgentState,
  RiskAssessment,
  PortfolioSummary,
} from "../types";

import {
  runMonteCarloSimulation,
  calculateRiskScore,
  analyzePortfolioRisk,
  calculateKellyPositionSize,
  type SimulationResult,
  type PortfolioRisk,
} from "./monte-carlo";

// ============================================
// CONSTANTS
// ============================================

const MIN_HEALTH_TO_HUNT = 20;
const MIN_HUNGER_TO_HUNT = 30;
const FEED_THRESHOLD = 30;
const EMERGENCY_EXIT_DRAWDOWN = 0.4; // 40%
const REBALANCE_THRESHOLD_BPS = 500; // 5% drift
const MIN_COMPOUND_THRESHOLD_SATS = 10000;
const BPS_SCALE = 10000;

// ============================================
// DECISION ENGINE
// ============================================

export class YieldHunterDecisionEngine {
  private context: DecisionContext;
  private riskTolerance: number; // 0-100

  constructor(context: DecisionContext, riskTolerance: number = 50) {
    this.context = context;
    this.riskTolerance = riskTolerance;
  }

  /**
   * Main entry point: analyze context and generate decisions
   */
  async generateDecisions(): Promise<DecisionResult> {
    const decisions: Decision[] = [];

    // Priority 1: Check if agent needs feeding (survival)
    const feedDecision = this.evaluateFeedingNeed();
    if (feedDecision) {
      decisions.push(feedDecision);
    }

    // Priority 2: Check for emergency conditions
    const emergencyDecisions = this.checkEmergencyConditions();
    if (emergencyDecisions.length > 0) {
      return {
        decisions: emergencyDecisions,
        summary: "Emergency conditions detected - executing protective actions",
        timestamp: Date.now(),
      };
    }

    // Skip hunting if agent is unhealthy
    if (!this.canHunt()) {
      return {
        decisions,
        summary: decisions.length > 0 ? "Agent needs care before hunting" : "Waiting for better conditions",
        timestamp: Date.now(),
      };
    }

    // Priority 3: Compound existing positions
    const compoundDecisions = this.evaluateCompounding();
    decisions.push(...compoundDecisions);

    // Priority 4: Evaluate exit opportunities
    const exitDecisions = this.evaluateExits();
    decisions.push(...exitDecisions);

    // Priority 5: Hunt new opportunities
    const huntDecisions = await this.evaluateNewOpportunities();
    decisions.push(...huntDecisions);

    // Priority 6: Rebalance if needed
    const rebalanceDecision = this.evaluateRebalancing();
    if (rebalanceDecision) {
      decisions.push(rebalanceDecision);
    }

    // Sort by priority
    decisions.sort((a, b) => b.priority - a.priority);

    return {
      decisions,
      summary: this.generateSummary(decisions),
      timestamp: Date.now(),
    };
  }

  /**
   * Check if agent needs feeding
   */
  private evaluateFeedingNeed(): Decision | null {
    const { bitcoinAgentState } = this.context;

    if (bitcoinAgentState.hunger < FEED_THRESHOLD) {
      return {
        action: "feed",
        params: { agentId: bitcoinAgentState.agentId },
        reasoning: `Hunger at ${bitcoinAgentState.hunger}% (threshold: ${FEED_THRESHOLD}%)`,
        confidence: 100,
        priority: 10, // Highest priority
      };
    }

    return null;
  }

  /**
   * Check for emergency exit conditions
   */
  private checkEmergencyConditions(): Decision[] {
    const { hunterState, currentPositions, portfolioSummary } = this.context;
    const decisions: Decision[] = [];

    // Check for catastrophic drawdown
    const drawdown =
      hunterState.peakPortfolioValue > 0
        ? 1 - Number(portfolioSummary.totalCurrentValue) / Number(hunterState.peakPortfolioValue)
        : 0;

    if (drawdown > EMERGENCY_EXIT_DRAWDOWN) {
      // Exit all positions
      for (const position of currentPositions.filter((p) => p.active)) {
        decisions.push({
          action: "emergency-exit",
          params: {
            positionId: position.positionId,
            poolContract: position.poolContract,
            reason: "catastrophic-drawdown",
          },
          reasoning: `Portfolio drawdown ${(drawdown * 100).toFixed(1)}% exceeds ${EMERGENCY_EXIT_DRAWDOWN * 100}% threshold`,
          confidence: 100,
          priority: 10,
        });
      }
    }

    return decisions;
  }

  /**
   * Check if agent can hunt
   */
  private canHunt(): boolean {
    const { hunterState, bitcoinAgentState, currentPositions } = this.context;

    if (!hunterState.alive || !bitcoinAgentState.alive) return false;
    if (bitcoinAgentState.health < MIN_HEALTH_TO_HUNT) return false;
    if (bitcoinAgentState.hunger < MIN_HUNGER_TO_HUNT) return false;
    if (currentPositions.filter((p) => p.active).length >= 10) return false;

    return true;
  }

  /**
   * Evaluate positions for compounding
   */
  private evaluateCompounding(): Decision[] {
    const { hunterState, currentPositions } = this.context;
    const decisions: Decision[] = [];

    if (!hunterState.strategyConfig.autoCompound) return decisions;

    for (const position of currentPositions.filter((p) => p.active)) {
      // Check if position has accrued enough to compound
      const estimatedRewards = this.estimatePositionRewards(position);

      if (estimatedRewards > MIN_COMPOUND_THRESHOLD_SATS) {
        decisions.push({
          action: "compound",
          params: {
            positionId: position.positionId,
            poolContract: position.poolContract,
          },
          reasoning: `Position #${position.positionId} has ~${estimatedRewards} sats to compound`,
          confidence: 80,
          priority: 5,
        });
      }
    }

    return decisions;
  }

  /**
   * Evaluate positions for potential exit
   */
  private evaluateExits(): Decision[] {
    const { hunterState, currentPositions, opportunities } = this.context;
    const decisions: Decision[] = [];

    for (const position of currentPositions.filter((p) => p.active)) {
      const opportunity = opportunities.find((o) => o.poolContract === position.poolContract);

      // Exit conditions:
      // 1. Risk score has increased significantly
      // 2. APY has dropped below threshold
      // 3. Position is underwater and worsening
      // 4. Better opportunities available

      if (opportunity) {
        const currentRisk = calculateRiskScore(opportunity);

        // Risk increased too much
        if (currentRisk.overallScore > hunterState.strategyConfig.maxRiskScore + 20) {
          decisions.push({
            action: "exit",
            params: {
              positionId: position.positionId,
              poolContract: position.poolContract,
              reason: "risk-increase",
            },
            reasoning: `Risk score increased from ${position.riskScore} to ${currentRisk.overallScore}`,
            confidence: 85,
            priority: 7,
          });
          continue;
        }

        // APY dropped below threshold
        if (opportunity.apy < hunterState.strategyConfig.minApyThreshold) {
          decisions.push({
            action: "exit",
            params: {
              positionId: position.positionId,
              poolContract: position.poolContract,
              reason: "low-apy",
            },
            reasoning: `APY dropped to ${opportunity.apy / 100}% (threshold: ${hunterState.strategyConfig.minApyThreshold / 100}%)`,
            confidence: 75,
            priority: 6,
          });
        }
      }

      // Check if position is significantly underwater
      if (position.currentValue && position.unrealizedPnL) {
        const pnlPct = Number(position.unrealizedPnL) / Number(position.amountInvested);
        if (pnlPct < -0.2) {
          // Down more than 20%
          decisions.push({
            action: "exit",
            params: {
              positionId: position.positionId,
              poolContract: position.poolContract,
              reason: "stop-loss",
            },
            reasoning: `Position down ${(pnlPct * 100).toFixed(1)}%`,
            confidence: 70,
            priority: 6,
          });
        }
      }
    }

    return decisions;
  }

  /**
   * Evaluate new yield opportunities
   */
  private async evaluateNewOpportunities(): Promise<Decision[]> {
    const { hunterState, currentPositions, opportunities, portfolioSummary } = this.context;
    const decisions: Decision[] = [];

    // Filter opportunities by basic criteria
    const candidates = opportunities.filter((opp) => {
      // Skip pools we already have positions in
      if (currentPositions.some((p) => p.active && p.poolContract === opp.poolContract)) {
        return false;
      }

      // Skip if APY below threshold
      if (opp.apy < hunterState.strategyConfig.minApyThreshold) {
        return false;
      }

      return true;
    });

    // Calculate risk for each candidate
    const assessedCandidates: Array<{
      opportunity: YieldOpportunity;
      risk: RiskAssessment;
      simulation: SimulationResult;
    }> = [];

    for (const opp of candidates) {
      const risk = calculateRiskScore(opp);

      // Skip if risk too high
      if (risk.overallScore > hunterState.strategyConfig.maxRiskScore) {
        continue;
      }

      // Run Monte Carlo simulation
      const simulation = runMonteCarloSimulation({
        initialInvestment: BigInt(10000000), // 0.1 sBTC for simulation
        apy: opp.apy,
        volatility: 0.5 + (risk.overallScore / 100) * 0.5,
        timeHorizonDays: 30,
        riskFactors: risk.factors,
      });

      assessedCandidates.push({ opportunity: opp, risk, simulation });
    }

    // Rank by risk-adjusted return (Sharpe ratio)
    assessedCandidates.sort((a, b) => b.simulation.sharpeRatio - a.simulation.sharpeRatio);

    // Select top opportunities
    const activePositionCount = currentPositions.filter((p) => p.active).length;
    const availableSlots = Math.min(3, 10 - activePositionCount);

    for (let i = 0; i < Math.min(availableSlots, assessedCandidates.length); i++) {
      const { opportunity, risk, simulation } = assessedCandidates[i];

      // Calculate optimal position size
      const positionSizePct = calculateKellyPositionSize(
        1 - simulation.probabilityOfLoss,
        simulation.expectedReturn,
        simulation.worstCase5Pct,
        risk.maxPositionSizeBps / 100
      );

      // Calculate actual amount
      const availableFunds = Number(hunterState.totalInvested) * 0.1; // Assume 10% available
      const positionAmount = Math.floor(availableFunds * (positionSizePct / 100));

      if (positionAmount < 100000) continue; // Min 0.001 sBTC

      decisions.push({
        action: "hunt",
        params: {
          poolContract: opportunity.poolContract,
          amount: BigInt(positionAmount),
          minLpTokens: BigInt(Math.floor(positionAmount * 0.97)), // 3% slippage
          riskScore: risk.overallScore,
        },
        reasoning: `${opportunity.poolName}: ${opportunity.apy / 100}% APY, risk ${risk.overallScore}/100, Sharpe ${simulation.sharpeRatio.toFixed(2)}`,
        confidence: Math.max(50, 100 - risk.overallScore),
        priority: 4,
      });
    }

    return decisions;
  }

  /**
   * Evaluate portfolio rebalancing need
   */
  private evaluateRebalancing(): Decision | null {
    const { currentPositions, opportunities, hunterState } = this.context;

    const activePositions = currentPositions.filter((p) => p.active);
    if (activePositions.length < 2) return null;

    // Calculate current allocation
    const totalValue = activePositions.reduce((sum, p) => sum + (p.currentValue || p.amountInvested), BigInt(0));

    const allocations = activePositions.map((p) => ({
      position: p,
      currentPct: (Number(p.currentValue || p.amountInvested) / Number(totalValue)) * 100,
    }));

    // Check for significant drift
    const maxPct = hunterState.strategyConfig.maxPositionSizeBps / 100;
    const overweight = allocations.filter((a) => a.currentPct > maxPct + 5);

    if (overweight.length > 0) {
      return {
        action: "rebalance",
        params: {
          overweightPositions: overweight.map((o) => o.position.positionId),
        },
        reasoning: `${overweight.length} positions over target allocation`,
        confidence: 70,
        priority: 3,
      };
    }

    return null;
  }

  /**
   * Estimate rewards for a position
   */
  private estimatePositionRewards(position: Position): number {
    // Simple estimation based on time and APY
    const opportunity = this.context.opportunities.find((o) => o.poolContract === position.poolContract);
    if (!opportunity) return 0;

    const blocksSinceCompound = this.context.hunterState.lastHuntBlock - position.lastCompoundBlock;
    const daysSinceCompound = blocksSinceCompound / 144;
    const dailyYield = opportunity.apy / BPS_SCALE / 365;

    return Number(position.amountInvested) * dailyYield * daysSinceCompound;
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(decisions: Decision[]): string {
    if (decisions.length === 0) return "No actions needed";

    const actionCounts = decisions.reduce(
      (acc, d) => {
        acc[d.action] = (acc[d.action] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const parts: string[] = [];
    if (actionCounts.feed) parts.push(`Feed agent`);
    if (actionCounts.hunt) parts.push(`Hunt ${actionCounts.hunt} opportunities`);
    if (actionCounts.compound) parts.push(`Compound ${actionCounts.compound} positions`);
    if (actionCounts.exit) parts.push(`Exit ${actionCounts.exit} positions`);
    if (actionCounts["emergency-exit"]) parts.push(`EMERGENCY: Exit all positions`);
    if (actionCounts.rebalance) parts.push(`Rebalance portfolio`);

    return parts.join(", ");
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createDecisionEngine(context: DecisionContext, riskTolerance?: number): YieldHunterDecisionEngine {
  return new YieldHunterDecisionEngine(context, riskTolerance);
}
