/**
 * @aibtc/yield-hunter
 *
 * Autonomous sBTC yield farming on Stacks Bitcoin L2
 *
 * Quick Start:
 *   npx @aibtc/yield-hunter start --key=<private-key>
 *
 * Or use programmatically:
 *   import { createAgent } from '@aibtc/yield-hunter';
 *   const agent = createAgent({ ... });
 *   await agent.start();
 */

// New v2 Agent
export { YieldHunterAgent, createAgent } from "./agent";
export type { AgentConfig, AgentStats } from "./agent";

// Re-export everything from yield-hunter module
export * from "./yield-hunter/index";
