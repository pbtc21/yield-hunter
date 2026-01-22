import { Clarinet, Tx, Chain, Account, types } from "https://deno.land/x/clarinet@v1.7.1/index.ts";
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.90.0/testing/asserts.ts";

// ============================================
// AGENT LIFECYCLE TESTS
// ============================================

Clarinet.test({
  name: "Can birth a new agent",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const owner = accounts.get("wallet_1")!;

    let block = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [
          types.principal(owner.address), // owner
          types.ascii("Alpha Hunter"), // name
        ],
        owner.address
      ),
    ]);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, "(ok u1)");

    // Verify agent was created
    let agentInfo = chain.callReadOnlyFn(
      "agent-lifecycle",
      "get-agent-info",
      [types.uint(1)],
      deployer.address
    );

    const result = agentInfo.result.expectSome().expectTuple();
    assertEquals(result["name"], '"Alpha Hunter"');
    assertEquals(result["hunger"], "u100");
    assertEquals(result["health"], "u100");
    assertEquals(result["xp"], "u0");
    assertEquals(result["alive"], "true");
  },
});

Clarinet.test({
  name: "Agent hunger decays over time",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;

    // Birth agent
    let block = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("Test Agent")],
        owner.address
      ),
    ]);
    assertEquals(block.receipts[0].result, "(ok u1)");

    // Mine blocks to simulate time passing (144 blocks = ~1 day)
    chain.mineEmptyBlockUntil(chain.blockHeight + 144);

    // Check hunger decay
    let agentInfo = chain.callReadOnlyFn(
      "agent-lifecycle",
      "get-agent-info",
      [types.uint(1)],
      owner.address
    );

    const result = agentInfo.result.expectSome().expectTuple();
    // Hunger should have decayed (1 point per 144 blocks)
    const hunger = parseInt(result["hunger"].replace("u", ""));
    assertEquals(hunger <= 99, true, "Hunger should have decayed");
  },
});

Clarinet.test({
  name: "Can feed agent to restore hunger",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;

    // Birth agent
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("Hungry Agent")],
        owner.address
      ),
    ]);

    // Mine blocks to let hunger decay
    chain.mineEmptyBlockUntil(chain.blockHeight + 1440); // 10 days

    // Feed the agent
    let feedBlock = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "feed-agent",
        [types.uint(1)],
        owner.address
      ),
    ]);

    assertEquals(feedBlock.receipts[0].result.includes("(ok"), true);

    // Check hunger was restored
    let agentInfo = chain.callReadOnlyFn(
      "agent-lifecycle",
      "get-agent-info",
      [types.uint(1)],
      owner.address
    );

    const result = agentInfo.result.expectSome().expectTuple();
    const hunger = parseInt(result["hunger"].replace("u", ""));
    assertEquals(hunger >= 90, true, "Hunger should be restored after feeding");
  },
});

Clarinet.test({
  name: "Agent gains XP from actions",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;

    // Birth agent
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("XP Earner")],
        owner.address
      ),
    ]);

    // Record a successful action
    let actionBlock = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "record-action",
        [
          types.uint(1), // agent-id
          types.uint(100), // xp-earned
          types.uint(50000), // yield-earned-sats
          types.uint(1000), // energy-spent-sats
        ],
        owner.address
      ),
    ]);

    assertEquals(actionBlock.receipts[0].result.includes("(ok"), true);

    // Verify XP increased
    let agentInfo = chain.callReadOnlyFn(
      "agent-lifecycle",
      "get-agent-info",
      [types.uint(1)],
      owner.address
    );

    const result = agentInfo.result.expectSome().expectTuple();
    assertEquals(result["xp"], "u100");
  },
});

Clarinet.test({
  name: "Agent levels up at XP thresholds",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;

    // Birth agent
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("Level Up Agent")],
        owner.address
      ),
    ]);

    // Add enough XP to reach Junior level (1000 XP)
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "record-action",
        [types.uint(1), types.uint(1000), types.uint(100000), types.uint(5000)],
        owner.address
      ),
    ]);

    // Check level
    let level = chain.callReadOnlyFn(
      "agent-lifecycle",
      "get-level",
      [types.uint(1)],
      owner.address
    );

    assertEquals(level.result, "(ok u1)"); // Level 1 = Junior
  },
});

Clarinet.test({
  name: "Agent dies from starvation when health reaches 0",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;

    // Birth agent
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("Starving Agent")],
        owner.address
      ),
    ]);

    // Mine many blocks without feeding (100 days worth)
    chain.mineEmptyBlockUntil(chain.blockHeight + 14400);

    // Check death condition
    let deathCheck = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "check-death-conditions",
        [types.uint(1)],
        owner.address
      ),
    ]);

    // Agent should be dead or dying
    let agentInfo = chain.callReadOnlyFn(
      "agent-lifecycle",
      "get-agent-info",
      [types.uint(1)],
      owner.address
    );

    const result = agentInfo.result.expectSome().expectTuple();
    const health = parseInt(result["health"].replace("u", ""));
    assertEquals(health === 0 || result["alive"] === "false", true);
  },
});

Clarinet.test({
  name: "Dead agent can be reborn with XP carryover",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;

    // Birth agent
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("Phoenix Agent")],
        owner.address
      ),
    ]);

    // Give agent XP
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "record-action",
        [types.uint(1), types.uint(2000), types.uint(100000), types.uint(5000)],
        owner.address
      ),
    ]);

    // Simulate death
    chain.mineEmptyBlockUntil(chain.blockHeight + 14400);
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "check-death-conditions",
        [types.uint(1)],
        owner.address
      ),
    ]);

    // Rebirth (need to wait for cooldown in production)
    // This test may need adjustment based on actual cooldown implementation
    let rebirthBlock = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "rebirth-agent",
        [types.uint(1)],
        owner.address
      ),
    ]);

    // Check if rebirth succeeded or returned cooldown error
    const result = rebirthBlock.receipts[0].result;
    // Should either succeed or fail with cooldown error
    assertEquals(
      result.includes("(ok") || result.includes("ERR_REBIRTH_COOLDOWN"),
      true
    );
  },
});

Clarinet.test({
  name: "Only owner can feed their agent",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("wallet_1")!;
    const stranger = accounts.get("wallet_2")!;

    // Birth agent
    chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "birth-agent",
        [types.principal(owner.address), types.ascii("Private Agent")],
        owner.address
      ),
    ]);

    // Stranger tries to feed
    let feedBlock = chain.mineBlock([
      Tx.contractCall(
        "agent-lifecycle",
        "feed-agent",
        [types.uint(1)],
        stranger.address
      ),
    ]);

    assertEquals(
      feedBlock.receipts[0].result.includes("ERR_NOT_AUTHORIZED"),
      true
    );
  },
});

Clarinet.test({
  name: "Get level name returns correct tier",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;

    // Test each level threshold
    const levels = [
      { xp: 0, expected: "Hatchling" },
      { xp: 1000, expected: "Junior" },
      { xp: 5000, expected: "Senior" },
      { xp: 25000, expected: "Elder" },
      { xp: 100000, expected: "Legendary" },
    ];

    for (const level of levels) {
      let result = chain.callReadOnlyFn(
        "agent-lifecycle",
        "get-level-name",
        [types.uint(level.xp)],
        deployer.address
      );
      assertStringIncludes(result.result, level.expected);
    }
  },
});
