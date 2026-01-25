#!/bin/bash
# Setup Yield Hunter MCP Server for Claude Code
#
# Usage: ./scripts/setup-mcp.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up Yield Hunter MCP Server..."

# 1. Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_DIR"
bun install

# 2. Create Claude config directory if needed
CLAUDE_CONFIG_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_CONFIG_DIR"

# 3. Add to Claude config
CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

if [ -f "$CONFIG_FILE" ]; then
  echo "Existing config found. Adding yield-hunter server..."

  # Check if yield-hunter already exists
  if grep -q "yield-hunter" "$CONFIG_FILE"; then
    echo "yield-hunter already configured in $CONFIG_FILE"
  else
    # Add to existing config (simple append - may need manual adjustment)
    echo "Please add the following to $CONFIG_FILE manually:"
    cat <<EOF

{
  "mcpServers": {
    "yield-hunter": {
      "command": "bun",
      "args": ["run", "$PROJECT_DIR/src/mcp/server.ts"]
    }
  }
}
EOF
  fi
else
  echo "Creating new Claude config..."
  cat > "$CONFIG_FILE" <<EOF
{
  "mcpServers": {
    "yield-hunter": {
      "command": "bun",
      "args": ["run", "$PROJECT_DIR/src/mcp/server.ts"]
    }
  }
}
EOF
  echo "Created $CONFIG_FILE"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Available commands:"
echo "  bun run mcp          - Run MCP server (stdio mode)"
echo "  bun run dev:x402     - Run x402 API locally"
echo "  bun run deploy:x402  - Deploy x402 API to Cloudflare"
echo ""
echo "MCP Tools available in Claude Code:"
echo "  - yield_scan      : Scan all protocols for yields"
echo "  - yield_optimize  : Get optimal allocation strategy"
echo "  - yield_portfolio : Check positions for an address"
echo "  - yield_quote     : Quote deposit to specific protocol"
echo "  - yield_compare   : Side-by-side protocol comparison"
