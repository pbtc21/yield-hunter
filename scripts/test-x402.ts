#!/usr/bin/env bun
/**
 * x402 Payment Flow Test Client
 *
 * Tests all payment scenarios against the deployed API:
 * 1. No payment headers → 402
 * 2. Invalid JSON → 400
 * 3. Insufficient amount → 402
 * 4. Expired timestamp → 402
 * 5. Sender mismatch → 400
 * 6. Replay (same nonce) → 402
 * 7. Valid payment → 200 with yield data
 * 8. Valid payment with custom query → 200
 * 9. Earnings check → reflects payments
 */

const API_URL = process.argv[2] || "https://yield-hunter-x402.p-d07.workers.dev";
const SENDER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"; // Testnet address

let passed = 0;
let failed = 0;

function nonce(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeProof(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    sender: SENDER,
    amount: "10000",
    nonce: nonce(),
    signature: "test-sig-" + Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    ...overrides,
  });
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ============================================
// TESTS
// ============================================

async function run() {
  console.log(`\nx402 Payment Flow Tests`);
  console.log(`API: ${API_URL}\n`);

  // -- Test 0: Health check --
  await test("Health check returns ok", async () => {
    const res = await fetch(`${API_URL}/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data: any = await res.json();
    assert(data.status === "ok", `Expected status ok, got ${data.status}`);
  });

  // -- Test 1: Cost endpoint shows payment format --
  await test("Cost endpoint includes payment schema", async () => {
    const res = await fetch(`${API_URL}/api/cost`);
    const data: any = await res.json();
    assert(data.cost === 10000, `Expected cost 10000, got ${data.cost}`);
    assert(data.paymentFormat !== undefined, "Missing paymentFormat");
    assert(data.paymentFormat.header === "X-402-Payment", "Wrong header name");
  });

  // -- Test 2: No headers → 402 --
  await test("No payment headers returns 402", async () => {
    const res = await fetch(`${API_URL}/api/yield`, { method: "POST" });
    assert(res.status === 402, `Expected 402, got ${res.status}`);
    const data: any = await res.json();
    assert(data.code === "PAYMENT_REQUIRED", `Expected PAYMENT_REQUIRED, got ${data.code}`);
    assert(data.instructions !== undefined, "Missing instructions");
  });

  // -- Test 3: Invalid JSON → 400 --
  await test("Invalid payment JSON returns 400", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": "not-valid-json{{{",
        "X-402-Sender": SENDER,
      },
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data: any = await res.json();
    assert(data.code === "INVALID_FORMAT", `Expected INVALID_FORMAT, got ${data.code}`);
  });

  // -- Test 4: Insufficient amount → 402 --
  await test("Insufficient payment returns 402", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": makeProof({ amount: "5000" }),
        "X-402-Sender": SENDER,
      },
    });
    assert(res.status === 402, `Expected 402, got ${res.status}`);
    const data: any = await res.json();
    assert(data.code === "PAYMENT_INVALID", `Expected PAYMENT_INVALID, got ${data.code}`);
    assert(data.error!.includes("Insufficient"), `Expected insufficient error, got: ${data.error}`);
  });

  // -- Test 5: Expired timestamp → 402 --
  await test("Expired payment returns 402", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": makeProof({ timestamp: Date.now() - 10 * 60 * 1000 }), // 10 min ago
        "X-402-Sender": SENDER,
      },
    });
    assert(res.status === 402, `Expected 402, got ${res.status}`);
    const data: any = await res.json();
    assert(data.error!.includes("expired"), `Expected expired error, got: ${data.error}`);
  });

  // -- Test 6: Sender mismatch → 400 --
  await test("Sender mismatch returns 400", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "X-402-Payment": makeProof({ sender: "ST1DIFFERENT_ADDRESS" }),
        "X-402-Sender": SENDER,
      },
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data: any = await res.json();
    assert(data.code === "SENDER_MISMATCH", `Expected SENDER_MISMATCH, got ${data.code}`);
  });

  // -- Test 7: Valid payment → 200 with yield data --
  const validNonce = nonce();
  await test("Valid payment returns 200 with yields", async () => {
    const proof = makeProof({ nonce: validNonce });
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": proof,
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "medium" }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data: any = await res.json();
    assert(data.success === true, `Expected success true`);
    assert(data.payment.verified === true, `Expected payment.verified true`);
    assert(data.payment.sender === SENDER, `Wrong sender in response`);
    assert(Array.isArray(data.results), `Expected results array`);
    assert(data.bestOption !== null || data.results.length === 0, `Missing bestOption`);
  });

  // -- Test 8: Replay protection → 402 --
  await test("Replayed nonce returns 402", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof({ nonce: validNonce }), // Reuse nonce from test 7
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000 }),
    });
    assert(res.status === 402, `Expected 402, got ${res.status}`);
    const data: any = await res.json();
    assert(data.error!.includes("replay"), `Expected replay error, got: ${data.error}`);
  });

  // -- Test 9: Valid payment with different risk → 200 --
  await test("Low risk query filters results", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof(),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "low" }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data: any = await res.json();
    assert(data.query.riskTolerance === "low", `Expected low risk query`);
    // All results should have riskScore <= 25
    for (const r of data.results) {
      assert(r.riskScore <= 25, `Result ${r.pool} has risk ${r.riskScore} > 25`);
    }
  });

  // -- Test 10: High risk query → more results --
  await test("High risk query returns more results", async () => {
    const res = await fetch(`${API_URL}/api/yield`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": makeProof(),
        "X-402-Sender": SENDER,
      },
      body: JSON.stringify({ amount: 100000, riskTolerance: "high" }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data: any = await res.json();
    assert(data.query.riskTolerance === "high", `Expected high risk query`);
    assert(data.results.length > 0, `Expected some high-risk results`);
  });

  // -- Test 11: Earnings reflect payments --
  await test("Earnings endpoint reflects 3 successful payments", async () => {
    const res = await fetch(`${API_URL}/api/earnings`);
    const data: any = await res.json();
    assert(data.totalQueries >= 3, `Expected >= 3 queries, got ${data.totalQueries}`);
    assert(data.totalEarned.sats >= 30000, `Expected >= 30000 sats earned, got ${data.totalEarned.sats}`);
    assert(Array.isArray(data.recentPayments), `Expected recentPayments array`);
    assert(data.recentPayments.length > 0, `Expected recent payment records`);
    assert(data.recentPayments[0].sender === SENDER, `Expected sender in payments`);
  });

  // ============================================
  // SUMMARY
  // ============================================

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed === 0) {
    console.log(`\nx402 payment flow verified successfully.`);
  } else {
    console.log(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
