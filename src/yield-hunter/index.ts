/**
 * Yield Hunter - Module Exports
 * Autonomous yield-hunting AI agent for AIBTC on Stacks Bitcoin L2
 */

// Types
export * from "./types";

// API Clients
export { TeneroClient, tenero } from "./api/tenero-client";
export { ContractClient, contracts } from "./api/contract-client";

// Leaderboard API (for Cloudflare Workers)
export { default as leaderboardApp } from "./api/leaderboard-api";

// Decision Engine
export { YieldHunterDecisionEngine, createDecisionEngine } from "./engine/decision-engine";
export {
  runMonteCarloSimulation,
  calculateRiskScore,
  analyzePortfolioRisk,
  calculateKellyPositionSize,
} from "./engine/monte-carlo";

// x402 Micropayments
export { X402PaymentManager, createPaymentManager, formatSats, estimateOperationCost } from "./x402/micropayments";

// Wallet Integration (Styx BTC→sBTC, Leather, Xverse)
export {
  StyxBridge,
  createStyxBridge,
  MIN_DEPOSIT_SATS,
  MAX_DEPOSIT_SATS,
  satsToBtc,
  satsToUsd,
  recommendBridge,
} from "./wallet/styx-bridge";
export {
  WalletManager,
  LeatherWallet,
  XverseWallet,
  createWalletManager,
  detectWallets,
  getRecommendedWallet,
} from "./wallet/connect";

// Re-export for convenience
export const VERSION = "1.0.0";
