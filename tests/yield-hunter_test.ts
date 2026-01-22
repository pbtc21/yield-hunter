/**
 * Yield Hunter Tests
 * Run with: clarinet test
 */

import { Clarinet, Tx, Chain, Account, types } from "https://deno.land/x/clarinet@v1.7.1/index.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.90.0/testing/asserts.ts";

// ============================================
// YIELD HUNTER TESTS
// ============================================

Clarinet.test({
  name: "yield-hunter: can initialize hunter",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const owner = accounts.get("wallet_1")!;
    const agent = accounts.get("wallet_2")!;

    const block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter",
        "initialize-hunter",
        [
          types.principal(owner.address), // agent-account
          types.principal(owner.address), // owner
          types.principal(agent.address), // agent
          types.uint(1), // bitcoin-agent-id
          types.uint(1), // identity-id
          types.uint(100), // min-apy-threshold (1%)
          types.uint(50), // max-risk-score
          types.bool(true), // auto-compound
          types.uint(1000), // rebalance-threshold-bps
        ],
        owner.address
      ),
    ]);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, "(ok true)");
  },
});

Clarinet.test({
  name: "yield-hunter: can get hunter state",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const owner = accounts.get("wallet_1")!;
    const agent = accounts.get("wallet_2")!;

    // Initialize hunter first
    chain.mineBlock([
      Tx.contractCall(
        "yield-hunter",
        "initialize-hunter",
        [
          types.principal(owner.address),
          types.principal(owner.address),
          types.principal(agent.address),
          types.uint(1),
          types.uint(1),
          types.uint(100),
          types.uint(50),
          types.bool(true),
          types.uint(1000),
        ],
        owner.address
      ),
    ]);

    // Get hunter state
    const result = chain.callReadOnlyFn(
      "yield-hunter",
      "get-hunter",
      [types.principal(owner.address)],
      deployer.address
    );

    assertExists(result.result);
  },
});

Clarinet.test({
  name: "yield-hunter: unauthorized cannot initialize",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;
    const agent = accounts.get("wallet_2")!;
    const attacker = accounts.get("wallet_3")!;

    const block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter",
        "initialize-hunter",
        [
          types.principal(owner.address),
          types.principal(owner.address),
          types.principal(agent.address),
          types.uint(1),
          types.uint(1),
          types.uint(100),
          types.uint(50),
          types.bool(true),
          types.uint(1000),
        ],
        attacker.address // Not the owner
      ),
    ]);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, "(err u1001)"); // ERR_NOT_AUTHORIZED
  },
});

// ============================================
// ORACLE TESTS
// ============================================

Clarinet.test({
  name: "oracle: can calculate risk score",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const pool = accounts.get("wallet_1")!;

    const block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter-oracle",
        "calculate-risk-score",
        [
          types.principal(pool.address), // pool-contract
          types.uint(1000000000), // liquidity (10 BTC)
          types.uint(100000000), // volume-24h (1 BTC)
          types.uint(100), // holder-count
          types.uint(5000), // age-blocks (~35 days)
        ],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts.length, 1);
    // Should return a risk score
    const result = block.receipts[0].result;
    // Risk score should be reasonable (not too high for good metrics)
    assertEquals(result.startsWith("(ok u"), true);
  },
});

Clarinet.test({
  name: "oracle: can register hunter on leaderboard",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const hunter = accounts.get("wallet_1")!;

    const block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter-oracle",
        "register-hunter",
        [
          types.principal(hunter.address), // hunter-account
          types.utf8("Test Hunter"), // name
          types.principal(hunter.address), // owner
          types.uint(12345), // bitcoin-face-id
        ],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, "(ok true)");
  },
});

Clarinet.test({
  name: "oracle: risk score factors work correctly",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;

    // Test liquidity risk
    let result = chain.callReadOnlyFn(
      "yield-hunter-oracle",
      "get-liquidity-risk",
      [types.uint(50000000)], // 0.5 BTC - should be high risk
      deployer.address
    );
    assertEquals(result.result, "u80"); // High risk

    result = chain.callReadOnlyFn(
      "yield-hunter-oracle",
      "get-liquidity-risk",
      [types.uint(50000000000)], // 500 BTC - should be low risk
      deployer.address
    );
    assertEquals(result.result, "u10"); // Very low risk
  },
});

// ============================================
// ADAPTER TESTS
// ============================================

Clarinet.test({
  name: "adapter: calculates min output correctly",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;

    // 3% slippage on 1 BTC
    const result = chain.callReadOnlyFn(
      "yield-hunter-adapter",
      "calculate-min-out",
      [
        types.uint(100000000), // 1 BTC
        types.uint(300), // 3% slippage
      ],
      deployer.address
    );

    // Should be 97% of input
    assertEquals(result.result, "u97000000");
  },
});

// ============================================
// INTEGRATION TESTS
// ============================================

Clarinet.test({
  name: "integration: full hunter lifecycle",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const owner = accounts.get("wallet_1")!;
    const agent = accounts.get("wallet_2")!;

    // 1. Initialize hunter
    let block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter",
        "initialize-hunter",
        [
          types.principal(owner.address),
          types.principal(owner.address),
          types.principal(agent.address),
          types.uint(1),
          types.uint(1),
          types.uint(100),
          types.uint(50),
          types.bool(true),
          types.uint(1000),
        ],
        owner.address
      ),
    ]);
    assertEquals(block.receipts[0].result, "(ok true)");

    // 2. Register on leaderboard
    block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter-oracle",
        "register-hunter",
        [
          types.principal(owner.address),
          types.utf8("Test Hunter"),
          types.principal(owner.address),
          types.uint(1),
        ],
        owner.address
      ),
    ]);
    assertEquals(block.receipts[0].result, "(ok true)");

    // 3. Verify hunter can hunt (check permissions)
    const canHunt = chain.callReadOnlyFn(
      "yield-hunter",
      "can-hunt",
      [types.principal(owner.address)],
      deployer.address
    );
    assertEquals(canHunt.result, "true");

    // 4. Check death (should not be dead yet)
    block = chain.mineBlock([
      Tx.contractCall(
        "yield-hunter",
        "check-hunt-death",
        [types.principal(owner.address)],
        owner.address
      ),
    ]);
    assertEquals(block.receipts[0].result, "(ok false)");
  },
});
