#!/usr/bin/env bun
/**
 * Yield Hunter MCP Server
 *
 * Run: bun run src/mcp/server.ts
 *
 * Add to Claude Code settings:
 *   ~/.claude/claude_desktop_config.json
 *   {
 *     "mcpServers": {
 *       "yield-hunter": {
 *         "command": "bun",
 *         "args": ["run", "/path/to/yield-hunter/src/mcp/server.ts"]
 *       }
 *     }
 *   }
 */

import "./yield-hunter-tools";
