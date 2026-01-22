/**
 * Stacks Wallet Connection
 * Support for Leather and Xverse wallets
 *
 * Used for:
 * - Signing BTC transactions (Styx deposits)
 * - Signing Stacks transactions (agent operations)
 * - Managing smart wallet permissions
 */

// ============================================
// TYPES
// ============================================

export type WalletType = "leather" | "xverse";

export interface WalletConfig {
  network: "mainnet" | "testnet";
  appName: string;
  appIcon?: string;
}

export interface ConnectedWallet {
  type: WalletType;
  stacksAddress: string;
  btcAddress: string;
  publicKey: string;
}

export interface SignatureRequest {
  message: string;
  type: "message" | "transaction" | "structured-data";
}

export interface SignedMessage {
  signature: string;
  publicKey: string;
}

export interface TransactionSignRequest {
  psbt: string; // Base64 encoded PSBT
  broadcast?: boolean;
  network?: "mainnet" | "testnet";
}

export interface SignedTransaction {
  txid: string;
  psbt?: string;
  broadcast: boolean;
}

// ============================================
// WALLET DETECTION
// ============================================

/**
 * Check which wallets are available in the browser
 */
export function detectWallets(): { leather: boolean; xverse: boolean } {
  if (typeof window === "undefined") {
    return { leather: false, xverse: false };
  }

  return {
    leather: typeof (window as any).LeatherProvider !== "undefined",
    xverse: typeof (window as any).BitcoinProvider !== "undefined" || typeof (window as any).XverseProviders !== "undefined",
  };
}

/**
 * Get recommended wallet based on availability
 */
export function getRecommendedWallet(): WalletType | null {
  const available = detectWallets();
  if (available.leather) return "leather";
  if (available.xverse) return "xverse";
  return null;
}

// ============================================
// LEATHER WALLET
// ============================================

export class LeatherWallet {
  private config: WalletConfig;
  private connected: ConnectedWallet | null = null;

  constructor(config: WalletConfig) {
    this.config = config;
  }

  /**
   * Check if Leather is installed
   */
  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof (window as any).LeatherProvider !== "undefined";
  }

  /**
   * Connect to Leather wallet
   */
  async connect(): Promise<ConnectedWallet> {
    if (!this.isAvailable()) {
      throw new Error("Leather wallet not installed. Get it at leather.io");
    }

    const provider = (window as any).LeatherProvider;

    // Request addresses
    const response = await provider.request("getAddresses");

    // Find Stacks and BTC addresses
    const stacksAddr = response.result.addresses.find(
      (a: any) => a.type === "p2wpkh" && a.symbol === "STX"
    );
    const btcAddr = response.result.addresses.find(
      (a: any) => a.type === "p2wpkh" && a.symbol === "BTC"
    );

    if (!stacksAddr || !btcAddr) {
      throw new Error("Could not get addresses from Leather");
    }

    this.connected = {
      type: "leather",
      stacksAddress: stacksAddr.address,
      btcAddress: btcAddr.address,
      publicKey: stacksAddr.publicKey || btcAddr.publicKey,
    };

    return this.connected;
  }

  /**
   * Sign a message
   */
  async signMessage(request: SignatureRequest): Promise<SignedMessage> {
    if (!this.connected) {
      throw new Error("Wallet not connected");
    }

    const provider = (window as any).LeatherProvider;

    const response = await provider.request("signMessage", {
      message: request.message,
      paymentType: "p2wpkh",
    });

    return {
      signature: response.result.signature,
      publicKey: response.result.publicKey,
    };
  }

  /**
   * Sign a Bitcoin transaction (PSBT)
   */
  async signBitcoinTransaction(request: TransactionSignRequest): Promise<SignedTransaction> {
    if (!this.connected) {
      throw new Error("Wallet not connected");
    }

    const provider = (window as any).LeatherProvider;

    const response = await provider.request("signPsbt", {
      hex: request.psbt,
      broadcast: request.broadcast ?? true,
      network: request.network || this.config.network,
    });

    return {
      txid: response.result.txid,
      psbt: response.result.hex,
      broadcast: request.broadcast ?? true,
    };
  }

  /**
   * Sign a Stacks transaction
   */
  async signStacksTransaction(txHex: string): Promise<string> {
    if (!this.connected) {
      throw new Error("Wallet not connected");
    }

    const provider = (window as any).LeatherProvider;

    const response = await provider.request("stx_signTransaction", {
      txHex,
      network: this.config.network,
    });

    return response.result.txHex;
  }

  /**
   * Get connected wallet info
   */
  getConnected(): ConnectedWallet | null {
    return this.connected;
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.connected = null;
  }
}

// ============================================
// XVERSE WALLET
// ============================================

export class XverseWallet {
  private config: WalletConfig;
  private connected: ConnectedWallet | null = null;

  constructor(config: WalletConfig) {
    this.config = config;
  }

  /**
   * Check if Xverse is installed
   */
  isAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      (typeof (window as any).BitcoinProvider !== "undefined" ||
        typeof (window as any).XverseProviders !== "undefined")
    );
  }

  /**
   * Connect to Xverse wallet
   * Uses sats-connect library in production
   */
  async connect(): Promise<ConnectedWallet> {
    if (!this.isAvailable()) {
      throw new Error("Xverse wallet not installed. Get it at xverse.app");
    }

    // In production, use sats-connect:
    // import { getAddress, AddressPurpose } from "sats-connect";
    //
    // const response = await getAddress({
    //   payload: {
    //     purposes: [AddressPurpose.Payment, AddressPurpose.Stacks],
    //     message: `Connect to ${this.config.appName}`,
    //     network: { type: this.config.network === "mainnet" ? "Mainnet" : "Testnet" }
    //   },
    //   onFinish: (response) => resolve(response),
    //   onCancel: () => reject(new Error("User cancelled"))
    // });

    // Mock for development
    this.connected = {
      type: "xverse",
      stacksAddress: "SP123...",
      btcAddress: "bc1q...",
      publicKey: "02abc...",
    };

    return this.connected;
  }

  /**
   * Sign a message
   */
  async signMessage(request: SignatureRequest): Promise<SignedMessage> {
    if (!this.connected) {
      throw new Error("Wallet not connected");
    }

    // In production, use sats-connect:
    // import { signMessage } from "sats-connect";
    //
    // const response = await signMessage({
    //   payload: {
    //     message: request.message,
    //     address: this.connected.btcAddress,
    //     network: { type: this.config.network === "mainnet" ? "Mainnet" : "Testnet" }
    //   }
    // });

    return {
      signature: "mock-signature",
      publicKey: this.connected.publicKey,
    };
  }

  /**
   * Sign a Bitcoin transaction (PSBT)
   */
  async signBitcoinTransaction(request: TransactionSignRequest): Promise<SignedTransaction> {
    if (!this.connected) {
      throw new Error("Wallet not connected");
    }

    // In production, use sats-connect:
    // import { signTransaction } from "sats-connect";
    //
    // const response = await signTransaction({
    //   payload: {
    //     psbtBase64: request.psbt,
    //     broadcast: request.broadcast ?? true,
    //     network: { type: this.config.network === "mainnet" ? "Mainnet" : "Testnet" }
    //   }
    // });

    return {
      txid: `xverse-${Date.now().toString(16)}`,
      broadcast: request.broadcast ?? true,
    };
  }

  /**
   * Sign a Stacks transaction
   */
  async signStacksTransaction(txHex: string): Promise<string> {
    if (!this.connected) {
      throw new Error("Wallet not connected");
    }

    // In production, use stacks-connect for Xverse Stacks signing
    return txHex;
  }

  /**
   * Get connected wallet info
   */
  getConnected(): ConnectedWallet | null {
    return this.connected;
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.connected = null;
  }
}

// ============================================
// UNIFIED WALLET MANAGER
// ============================================

export class WalletManager {
  private config: WalletConfig;
  private leather: LeatherWallet;
  private xverse: XverseWallet;
  private activeWallet: WalletType | null = null;

  constructor(config: WalletConfig) {
    this.config = config;
    this.leather = new LeatherWallet(config);
    this.xverse = new XverseWallet(config);
  }

  /**
   * Get available wallets
   */
  getAvailableWallets(): WalletType[] {
    const wallets: WalletType[] = [];
    if (this.leather.isAvailable()) wallets.push("leather");
    if (this.xverse.isAvailable()) wallets.push("xverse");
    return wallets;
  }

  /**
   * Connect to a specific wallet
   */
  async connect(walletType: WalletType): Promise<ConnectedWallet> {
    const wallet = walletType === "leather" ? this.leather : this.xverse;
    const connected = await wallet.connect();
    this.activeWallet = walletType;
    return connected;
  }

  /**
   * Connect to the first available wallet
   */
  async connectAny(): Promise<ConnectedWallet> {
    const available = this.getAvailableWallets();
    if (available.length === 0) {
      throw new Error("No Stacks wallet detected. Install Leather or Xverse.");
    }
    return this.connect(available[0]);
  }

  /**
   * Get the active wallet instance
   */
  getActiveWallet(): LeatherWallet | XverseWallet | null {
    if (this.activeWallet === "leather") return this.leather;
    if (this.activeWallet === "xverse") return this.xverse;
    return null;
  }

  /**
   * Get connected wallet info
   */
  getConnected(): ConnectedWallet | null {
    return this.getActiveWallet()?.getConnected() || null;
  }

  /**
   * Sign a message using active wallet
   */
  async signMessage(request: SignatureRequest): Promise<SignedMessage> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No wallet connected");
    return wallet.signMessage(request);
  }

  /**
   * Sign a Bitcoin transaction using active wallet
   */
  async signBitcoinTransaction(request: TransactionSignRequest): Promise<SignedTransaction> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No wallet connected");
    return wallet.signBitcoinTransaction(request);
  }

  /**
   * Sign a Stacks transaction using active wallet
   */
  async signStacksTransaction(txHex: string): Promise<string> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No wallet connected");
    return wallet.signStacksTransaction(txHex);
  }

  /**
   * Disconnect active wallet
   */
  disconnect(): void {
    this.leather.disconnect();
    this.xverse.disconnect();
    this.activeWallet = null;
  }
}

// ============================================
// FACTORY
// ============================================

export function createWalletManager(config: WalletConfig): WalletManager {
  return new WalletManager(config);
}
