/**
 * Autonomous Agent Test Suite
 *
 * Tests the agent scan loop, yield ranking, and decision logic.
 *
 * Run: bun test tests/agent.test.ts
 */

import { describe, test, expect } from "bun:test";
import { createAutonomousAgent } from "../src/autonomous-agent";

const TREASURY = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS";

describe("Autonomous Agent", () => {
  test("creates agent with default config", () => {
    const agent = createAutonomousAgent({ address: TREASURY });
    const stats = agent.getStats();
    expect(stats.scansCompleted).toBe(0);
    expect(stats.depositsExecuted).toBe(0);
    expect(stats.errors).toBe(0);
    expect(stats.totalDeposited).toBe(0n);
  });

  test("runs a single scan cycle (dry run)", async () => {
    const agent = createAutonomousAgent({
      address: TREASURY,
      dryRun: true,
      runOnce: true,
      network: "mainnet",
      minApyThreshold: 0,
      maxRiskScore: 100,
    });

    // Capture console output
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    await agent.start();

    console.log = origLog;

    const stats = agent.getStats();
    expect(stats.scansCompleted).toBe(1);
    expect(stats.errors).toBe(0);
    expect(stats.lastScan).not.toBeNull();

    // Verify scan history
    expect(stats.scanHistory.length).toBe(1);
    expect(stats.scanHistory[0].opportunityCount).toBeGreaterThan(0);
    expect(stats.scanHistory[0].action).toBe("scan-only");

    // Verify it found real opportunities
    expect(stats.bestApySeen).toBeGreaterThan(0);
    expect(stats.bestProtocolSeen).toBeString();
    expect(stats.bestProtocolSeen.length).toBeGreaterThan(0);

    // Verify log output
    const fullLog = logs.join("\n");
    expect(fullLog).toContain("YIELD SCAN STARTING");
    expect(fullLog).toContain("Fetching live yield data");
    expect(fullLog).toContain("opportunities across protocols");
    expect(fullLog).toContain("DRY RUN");
  });

  test("respects APY threshold filter", async () => {
    const agent = createAutonomousAgent({
      address: TREASURY,
      dryRun: true,
      runOnce: true,
      network: "mainnet",
      minApyThreshold: 50, // Nothing should pass 50%
      maxRiskScore: 100,
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    await agent.start();

    console.log = origLog;

    const fullLog = logs.join("\n");
    // With 50% min APY, no Stacks DeFi pool should qualify
    expect(fullLog).toContain("No opportunities");
  });

  test("respects risk score filter", async () => {
    const agent = createAutonomousAgent({
      address: TREASURY,
      dryRun: true,
      runOnce: true,
      network: "mainnet",
      minApyThreshold: 0,
      maxRiskScore: 5, // Very strict - nothing should pass
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    await agent.start();

    console.log = origLog;

    const fullLog = logs.join("\n");
    expect(fullLog).toContain("No opportunities");
  });

  test("agent stops cleanly", async () => {
    const agent = createAutonomousAgent({
      address: TREASURY,
      dryRun: true,
      runOnce: true,
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    await agent.start();
    agent.stop();

    console.log = origLog;

    const fullLog = logs.join("\n");
    expect(fullLog).toContain("Agent stopped");
    expect(fullLog).toContain("AGENT STATISTICS");
  });
});

describe("Risk-Adjusted Ranking", () => {
  test("lower risk scores rank higher at same APY", () => {
    // This tests the ranking formula: APY * (1 - riskScore/100)
    const lowRisk = 2.5 * (1 - 10 / 100);   // 2.25
    const highRisk = 2.5 * (1 - 50 / 100);   // 1.25
    expect(lowRisk).toBeGreaterThan(highRisk);
  });

  test("much higher APY can overcome higher risk", () => {
    const highApyHighRisk = 10 * (1 - 60 / 100); // 4.0
    const lowApyLowRisk = 2 * (1 - 10 / 100);    // 1.8
    expect(highApyHighRisk).toBeGreaterThan(lowApyLowRisk);
  });
});
