/**
 * Wallet Integration Module
 *
 * Provides:
 * - Styx bridge for BTC → sBTC conversion (under $100)
 * - Leather wallet support
 * - Xverse wallet support
 * - Smart wallet signing
 */

export * from "./styx-bridge";
export * from "./connect";

// Re-export main classes for convenience
export { StyxBridge, createStyxBridge } from "./styx-bridge";
export { WalletManager, LeatherWallet, XverseWallet, createWalletManager, detectWallets } from "./connect";
