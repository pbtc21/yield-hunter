/**
 * Yield Hunter - TypeScript Types
 * Core interfaces for the yield hunting AI agent
 */

// ============================================
// CONFIGURATION
// ============================================

export interface YieldHunterConfig {
  network: "mainnet" | "testnet" | "devnet";
  agentAccount: string;
  owner: string;
  agent: string;
  bitcoinAgentId: number;
  identityId: number;
  strategyConfig: StrategyConfig;
}

export interface StrategyConfig {
  minApyThreshold: number; // Minimum APY in basis points
  maxRiskScore: number; // Max acceptable risk (0-100)
  autoCompound: boolean;
  rebalanceThresholdBps: number;
  maxPositionSizeBps: number; // Max single position size
  maxTotalPositions: number;
}

// ============================================
// YIELD OPPORTUNITIES
// ============================================

export interface YieldOpportunity {
  poolContract: string;
  poolName: string;
  tokenX: string;
  tokenY: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  liquidity: bigint;
  volume24h: bigint;
  feeTier: number;
  apy: number; // In basis points
  riskScore: number; // 0-100
  holderCount: number;
  poolAge: number; // In blocks
  lastUpdated: number;
}

export interface PoolData {
  contract: string;
  name: string;
  tokenX: TokenInfo;
  tokenY: TokenInfo;
  reserveX: bigint;
  reserveY: bigint;
  totalLpSupply: bigint;
  feeBps: number;
  volume24h: bigint;
  fees24h: bigint;
  tvl: bigint;
  apy: number;
  holderCount: number;
  createdAt: number;
}

export interface TokenInfo {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number; // In USD
}

// ============================================
// POSITIONS
// ============================================

export interface Position {
  positionId: number;
  hunter: string;
  poolContract: string;
  tokenX: string;
  tokenY: string;
  amountInvested: bigint;
  lpTokensHeld: bigint;
  entryBlock: number;
  entryPriceX: bigint;
  entryPriceY: bigint;
  lastCompoundBlock: number;
  riskScore: number;
  active: boolean;
  // Calculated fields
  currentValue?: bigint;
  unrealizedPnL?: bigint;
  currentApy?: number;
}

export interface PortfolioSummary {
  totalInvested: bigint;
  totalCurrentValue: bigint;
  totalUnrealizedPnL: bigint;
  totalRealizedPnL: bigint;
  activePositions: number;
  closedPositions: number;
  avgRiskScore: number;
  avgApy: number;
  diversificationScore: number; // 0-100
}

// ============================================
// AGENT STATE
// ============================================

export interface HunterState {
  agentAccount: string;
  owner: string;
  agent: string;
  bitcoinAgentId: number;
  identityId: number;
  initializedAt: number;
  totalInvested: bigint;
  totalYieldsEarned: bigint;
  totalPositionsOpened: number;
  totalPositionsClosed: number;
  lastHuntBlock: number;
  lastProfitableBlock: number;
  peakPortfolioValue: bigint;
  alive: boolean;
  strategyConfig: StrategyConfig;
}

export interface BitcoinAgentState {
  agentId: number;
  owner: string;
  name: string;
  hunger: number; // 0-100
  health: number; // 0-100
  xp: number;
  level: number;
  levelName: string;
  birthBlock: number;
  lastFed: number;
  totalFedCount: number;
  alive: boolean;
}

// ============================================
// LEADERBOARD
// ============================================

export interface LeaderboardEntry {
  rank: number;
  hunterAccount: string;
  name: string;
  owner: string;
  bitcoinFaceId: number;
  totalEarnings: bigint;
  totalInvested: bigint;
  positionsOpened: number;
  positionsClosed: number;
  profitablePositions: number;
  winRateBps: number;
  bestApyBps: number;
  worstLossBps: number;
  registeredAt: number;
  lastActive: number;
  alive: boolean;
}

export interface LeaderboardStats {
  totalHunters: number;
  totalEarningsDistributed: bigint;
  topEarner: LeaderboardEntry | null;
  avgWinRate: number;
  lastUpdated: number;
}

// ============================================
// RISK ASSESSMENT
// ============================================

export interface RiskFactors {
  liquidityRisk: number;
  volumeRisk: number;
  concentrationRisk: number;
  ageRisk: number;
  priceVolatilityRisk?: number;
}

export interface RiskAssessment {
  poolContract: string;
  overallScore: number; // 0-100
  category: "very-low" | "low" | "medium" | "high";
  factors: RiskFactors;
  maxPositionSizeBps: number;
  recommendation: "hunt" | "avoid" | "monitor";
  calculatedAt: number;
}

export interface RiskWeights {
  liquidity: number;
  volume: number;
  concentration: number;
  age: number;
}

// ============================================
// TRANSACTIONS
// ============================================

export interface HuntYieldParams {
  hunterAccount: string;
  poolContract: string;
  amount: bigint;
  minLpTokens: bigint;
  riskScore: number;
}

export interface CompoundYieldsParams {
  hunterAccount: string;
  positionId: number;
  poolContract: string;
}

export interface ExitPositionParams {
  hunterAccount: string;
  positionId: number;
  poolContract: string;
  minReceive: bigint;
}

export interface TransactionResult {
  success: boolean;
  txId?: string;
  error?: string;
  data?: any;
}

// ============================================
// AI DECISION ENGINE
// ============================================

export interface DecisionContext {
  hunterState: HunterState;
  bitcoinAgentState: BitcoinAgentState;
  currentPositions: Position[];
  portfolioSummary: PortfolioSummary;
  opportunities: YieldOpportunity[];
  marketConditions: MarketConditions;
}

export interface MarketConditions {
  btcPrice: number;
  stxPrice: number;
  btcPriceChange24h: number;
  stxPriceChange24h: number;
  overallSentiment: "bullish" | "neutral" | "bearish";
  volatilityIndex: number;
}

export interface Decision {
  action: DecisionAction;
  params: any;
  reasoning: string;
  confidence: number; // 0-100
  priority: number; // 1-10
}

export type DecisionAction =
  | "feed"
  | "hunt"
  | "compound"
  | "exit"
  | "rebalance"
  | "wait"
  | "emergency-exit";

export interface DecisionResult {
  decisions: Decision[];
  summary: string;
  timestamp: number;
}

// ============================================
// API RESPONSES
// ============================================

export interface TeneroPoolResponse {
  id: string;
  contract: string;
  name: string;
  token_a: string;
  token_b: string;
  token_a_symbol: string;
  token_b_symbol: string;
  tvl: string;
  volume_24h: string;
  fees_24h: string;
  apy: number;
  created_at: number;
}

export interface TeneroHolderResponse {
  address: string;
  balance: string;
  percentage: number;
  rank: number;
}

export interface PythPriceResponse {
  price: number;
  confidence: number;
  expo: number;
  publishTime: number;
}

// ============================================
// EVENTS
// ============================================

export interface YieldHunterEvent {
  notification: string;
  payload: any;
  block: number;
  txId: string;
}

export type EventType =
  | "HunterInitialized"
  | "YieldHunted"
  | "YieldsCompounded"
  | "PositionExited"
  | "HunterDied"
  | "StrategyUpdated"
  | "EarningsRecorded"
  | "RiskScoreCalculated";

// ============================================
// ZEST PROTOCOL
// ============================================

export interface ZestReserveState {
  totalSupply: bigint;      // Total sBTC supplied
  totalBorrow: bigint;      // Total sBTC borrowed
  supplyRate: number;       // APY in basis points (e.g., 500 = 5%)
  borrowRate: number;       // Borrow APY in basis points
  utilizationRate: number;  // Utilization as percentage (e.g., 75.5)
}

export interface ZestPosition {
  supplied: bigint;         // Amount of sBTC supplied
  asCollateral: boolean;    // Whether position is used as collateral
}
