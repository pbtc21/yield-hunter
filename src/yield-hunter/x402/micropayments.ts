/**
 * x402 Micropayment Integration
 * Machine-to-machine payments for agent compute and services
 *
 * Implements the x402 payment protocol for:
 * - Agent feeding (energy costs)
 * - API calls (data providers)
 * - Compute resources (AI inference)
 * - Transaction fees
 */

import type { TransactionResult } from "../types";

// ============================================
// CONSTANTS
// ============================================

const X402_VERSION = "1.0";
const SBTC_DECIMALS = 8;
const SATS_PER_BTC = 100_000_000;

// Payment endpoints
const X402_ENDPOINTS = {
  tenero: "https://api.tenero.io/x402",
  pyth: "https://stacks.pyth.network/x402",
  inference: "https://inference.aibtc.dev/x402",
};

// Default pricing (in sats)
const PRICING = {
  feedAgent: 10_000, // 10,000 sats per feed
  apiCall: 100, // 100 sats per API call
  inferenceCall: 1_000, // 1,000 sats per AI inference
  transactionFee: 500, // 500 sats transaction overhead
};

// ============================================
// TYPES
// ============================================

export interface X402PaymentRequest {
  version: string;
  recipient: string;
  amount: bigint;
  memo: string;
  serviceType: X402ServiceType;
  metadata?: Record<string, any>;
  expiresAt: number;
  nonce: string;
}

export interface X402PaymentResponse {
  success: boolean;
  paymentId?: string;
  receipt?: X402Receipt;
  error?: X402Error;
}

export interface X402Receipt {
  paymentId: string;
  txId: string;
  sender: string;
  recipient: string;
  amount: bigint;
  serviceType: X402ServiceType;
  timestamp: number;
  signature: string;
}

export interface X402Error {
  code: X402ErrorCode;
  message: string;
  retryable: boolean;
}

export type X402ServiceType = "feed" | "api" | "inference" | "transaction" | "oracle" | "compute";

export type X402ErrorCode = "INSUFFICIENT_BALANCE" | "INVALID_REQUEST" | "SERVICE_UNAVAILABLE" | "EXPIRED" | "RATE_LIMITED" | "SIGNATURE_INVALID";

// ============================================
// X402 PAYMENT MANAGER
// ============================================

export class X402PaymentManager {
  private agentAccount: string;
  private signer: (message: string) => Promise<string>;
  private balance: bigint = BigInt(0);
  private receipts: Map<string, X402Receipt> = new Map();
  private pendingPayments: Map<string, X402PaymentRequest> = new Map();

  constructor(agentAccount: string, signer: (message: string) => Promise<string>) {
    this.agentAccount = agentAccount;
    this.signer = signer;
  }

  /**
   * Initialize manager with current balance
   */
  async initialize(): Promise<void> {
    // In production: fetch actual sBTC balance from chain
    this.balance = BigInt(1_000_000); // Mock: 0.01 sBTC
  }

  /**
   * Create a payment request for a service
   */
  async createPaymentRequest(serviceType: X402ServiceType, recipient: string, customAmount?: bigint): Promise<X402PaymentRequest> {
    const amount = customAmount || BigInt(this.getDefaultPrice(serviceType));

    const request: X402PaymentRequest = {
      version: X402_VERSION,
      recipient,
      amount,
      memo: `x402:${serviceType}:${Date.now()}`,
      serviceType,
      expiresAt: Date.now() + 300_000, // 5 minutes
      nonce: this.generateNonce(),
    };

    this.pendingPayments.set(request.nonce, request);
    return request;
  }

  /**
   * Execute a payment
   */
  async executePayment(request: X402PaymentRequest): Promise<X402PaymentResponse> {
    // Validate request
    if (Date.now() > request.expiresAt) {
      return {
        success: false,
        error: {
          code: "EXPIRED",
          message: "Payment request has expired",
          retryable: true,
        },
      };
    }

    // Check balance
    if (this.balance < request.amount) {
      return {
        success: false,
        error: {
          code: "INSUFFICIENT_BALANCE",
          message: `Insufficient balance: have ${this.balance}, need ${request.amount}`,
          retryable: false,
        },
      };
    }

    try {
      // Sign the payment
      const messageToSign = this.createPaymentMessage(request);
      const signature = await this.signer(messageToSign);

      // In production: broadcast transaction to Stacks
      const txId = this.mockBroadcastTransaction(request, signature);

      // Update balance
      this.balance -= request.amount;

      // Create receipt
      const receipt: X402Receipt = {
        paymentId: this.generatePaymentId(),
        txId,
        sender: this.agentAccount,
        recipient: request.recipient,
        amount: request.amount,
        serviceType: request.serviceType,
        timestamp: Date.now(),
        signature,
      };

      this.receipts.set(receipt.paymentId, receipt);
      this.pendingPayments.delete(request.nonce);

      return {
        success: true,
        paymentId: receipt.paymentId,
        receipt,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }

  /**
   * Pay for agent feeding
   */
  async payForFeed(agentContract: string): Promise<X402PaymentResponse> {
    const request = await this.createPaymentRequest("feed", agentContract);
    return this.executePayment(request);
  }

  /**
   * Pay for API access
   */
  async payForApiCall(endpoint: string): Promise<X402PaymentResponse> {
    const request = await this.createPaymentRequest("api", endpoint);
    return this.executePayment(request);
  }

  /**
   * Pay for AI inference
   */
  async payForInference(model: string): Promise<X402PaymentResponse> {
    const request = await this.createPaymentRequest("inference", X402_ENDPOINTS.inference, BigInt(PRICING.inferenceCall));
    request.metadata = { model };
    return this.executePayment(request);
  }

  /**
   * Pay for oracle price feed
   */
  async payForOracle(feedId: string): Promise<X402PaymentResponse> {
    const request = await this.createPaymentRequest("oracle", X402_ENDPOINTS.pyth);
    request.metadata = { feedId };
    return this.executePayment(request);
  }

  /**
   * Get payment receipt
   */
  getReceipt(paymentId: string): X402Receipt | undefined {
    return this.receipts.get(paymentId);
  }

  /**
   * Get all receipts for a time period
   */
  getReceiptsByPeriod(startTime: number, endTime: number): X402Receipt[] {
    return Array.from(this.receipts.values()).filter((r) => r.timestamp >= startTime && r.timestamp <= endTime);
  }

  /**
   * Calculate total spent by service type
   */
  getTotalSpentByService(serviceType: X402ServiceType): bigint {
    return Array.from(this.receipts.values())
      .filter((r) => r.serviceType === serviceType)
      .reduce((sum, r) => sum + r.amount, BigInt(0));
  }

  /**
   * Get current balance
   */
  getBalance(): bigint {
    return this.balance;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getDefaultPrice(serviceType: X402ServiceType): number {
    switch (serviceType) {
      case "feed":
        return PRICING.feedAgent;
      case "api":
        return PRICING.apiCall;
      case "inference":
        return PRICING.inferenceCall;
      case "transaction":
        return PRICING.transactionFee;
      case "oracle":
        return PRICING.apiCall;
      case "compute":
        return PRICING.inferenceCall;
      default:
        return PRICING.apiCall;
    }
  }

  private generateNonce(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private generatePaymentId(): string {
    return `x402-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }

  private createPaymentMessage(request: X402PaymentRequest): string {
    return JSON.stringify({
      version: request.version,
      recipient: request.recipient,
      amount: request.amount.toString(),
      memo: request.memo,
      nonce: request.nonce,
    });
  }

  private mockBroadcastTransaction(request: X402PaymentRequest, signature: string): string {
    // In production: actual Stacks transaction broadcast
    return `0x${Math.random().toString(16).substring(2, 66)}`;
  }
}

// ============================================
// PAYMENT DECORATOR
// ============================================

/**
 * Decorator to automatically pay for service calls
 */
export function withX402Payment(paymentManager: X402PaymentManager, serviceType: X402ServiceType) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (...args: any[]) {
      // Create and execute payment
      const request = await paymentManager.createPaymentRequest(
        serviceType,
        `service:${propertyKey}`,
      );
      const paymentResult = await paymentManager.executePayment(request);

      if (!paymentResult.success) {
        throw new Error(`Payment failed: ${paymentResult.error?.message}`);
      }

      // Call original method
      return originalMethod.apply(this, args);
    } as T;

    return descriptor;
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format sats to BTC string
 */
export function satsTobtc(sats: bigint): string {
  const btc = Number(sats) / SATS_PER_BTC;
  return btc.toFixed(8);
}

/**
 * Format sats for display
 */
export function formatSats(sats: bigint): string {
  if (sats >= BigInt(SATS_PER_BTC)) {
    return `${satsTobtc(sats)} BTC`;
  }
  if (sats >= BigInt(1_000_000)) {
    return `${(Number(sats) / 1_000_000).toFixed(2)}M sats`;
  }
  if (sats >= BigInt(1_000)) {
    return `${(Number(sats) / 1_000).toFixed(1)}k sats`;
  }
  return `${sats} sats`;
}

/**
 * Estimate total cost for an operation
 */
export function estimateOperationCost(operations: Array<{ type: X402ServiceType; count: number }>): bigint {
  return operations.reduce((sum, op) => {
    const unitPrice =
      op.type === "feed"
        ? PRICING.feedAgent
        : op.type === "inference"
          ? PRICING.inferenceCall
          : op.type === "transaction"
            ? PRICING.transactionFee
            : PRICING.apiCall;
    return sum + BigInt(unitPrice * op.count);
  }, BigInt(0));
}

// ============================================
// FACTORY
// ============================================

export function createPaymentManager(agentAccount: string, signer: (message: string) => Promise<string>): X402PaymentManager {
  return new X402PaymentManager(agentAccount, signer);
}
