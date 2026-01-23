#!/usr/bin/env node
/**
 * Yield Hunter CLI Entry Point
 *
 * Usage:
 *   npx @aibtc/yield-hunter start --key=<private-key>
 *   npx @aibtc/yield-hunter status --address=<stacks-address>
 */
import('../dist/cli.js').catch((err) => {
  // If dist doesn't exist, run from source
  import('../src/cli.ts').catch(() => {
    console.error('Failed to start yield-hunter:', err.message);
    process.exit(1);
  });
});
