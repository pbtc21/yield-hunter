// AIBTC Yield Hunter - Full Functional App

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Yield Hunter | AIBTC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@stacks/connect@7.7.1/dist/umd/index.js"></script>
  <script src="https://unpkg.com/@stacks/network@6.13.0/dist/umd/index.js"></script>
  <script src="https://unpkg.com/@stacks/transactions@6.13.0/dist/umd/index.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --orange: #ff4f03;
      --orange-hover: #e54600;
      --green: #22c55e;
      --green-dim: rgba(34, 197, 94, 0.15);
      --red: #ef4444;
      --red-dim: rgba(239, 68, 68, 0.15);
      --blue: #3b82f6;
      --bg: #09090b;
      --bg-subtle: #0f0f12;
      --bg-card: #18181b;
      --border: #27272a;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --text-dim: #52525b;
      --radius: 8px;
    }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

    /* Nav */
    nav {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(9, 9, 11, 0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 20px;
    }
    .nav-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 60px;
    }
    .logo {
      font-weight: 700;
      font-size: 18px;
      color: var(--text);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-mark {
      width: 32px;
      height: 32px;
      background: var(--orange);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #000;
    }
    .nav-tabs {
      display: flex;
      gap: 8px;
    }
    .nav-tab {
      padding: 8px 16px;
      border-radius: var(--radius);
      font-size: 14px;
      font-weight: 500;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }
    .nav-tab:hover { color: var(--text); background: var(--bg-card); }
    .nav-tab.active { color: var(--text); background: var(--bg-card); }
    .nav-right { display: flex; align-items: center; gap: 12px; }
    .wallet-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: var(--radius);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      font-family: inherit;
    }
    .wallet-btn.connect {
      background: var(--orange);
      color: #000;
    }
    .wallet-btn.connect:hover { background: var(--orange-hover); }
    .wallet-btn.connected {
      background: var(--bg-card);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .wallet-btn.connected:hover { border-color: var(--text-dim); }
    .wallet-dot {
      width: 8px;
      height: 8px;
      background: var(--green);
      border-radius: 50%;
    }

    /* Main content */
    main { padding: 24px 0; }
    .view { display: none; }
    .view.active { display: block; }

    /* Cards */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 18px;
      font-weight: 600;
    }

    /* Grid */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

    /* Stats */
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .stat-label {
      font-size: 12px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }
    .stat-value.orange { color: var(--orange); }
    .stat-value.green { color: var(--green); }
    .stat-change {
      font-size: 13px;
      margin-top: 4px;
    }
    .stat-change.up { color: var(--green); }
    .stat-change.down { color: var(--red); }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: var(--radius);
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      font-family: inherit;
      text-decoration: none;
    }
    .btn-primary { background: var(--orange); color: #000; }
    .btn-primary:hover { background: var(--orange-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: var(--bg-subtle);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { border-color: var(--text-dim); }
    .btn-sm { padding: 8px 14px; font-size: 13px; }
    .btn-lg { padding: 14px 28px; font-size: 16px; }

    /* Forms */
    .form-group { margin-bottom: 20px; }
    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--text-muted);
    }
    .form-input {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 16px;
      font-size: 15px;
      color: var(--text);
      font-family: inherit;
      transition: border-color 0.15s;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--orange);
    }
    .form-input::placeholder { color: var(--text-dim); }
    .form-hint {
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 6px;
    }
    .input-group {
      display: flex;
      gap: 8px;
    }
    .input-group .form-input { flex: 1; }

    /* Table */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 14px 16px; text-align: left; }
    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-dim);
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
    }
    td {
      font-size: 14px;
      border-bottom: 1px solid var(--border);
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: rgba(255,255,255,0.02); }

    /* Agent row */
    .agent-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .agent-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bg);
      border: 2px solid var(--border);
    }
    .agent-name { font-weight: 600; }
    .agent-addr {
      font-size: 12px;
      color: var(--text-dim);
      font-family: 'JetBrains Mono', monospace;
    }

    /* Status badge */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-green { background: var(--green-dim); color: var(--green); }
    .badge-red { background: var(--red-dim); color: var(--red); }
    .badge-orange { background: rgba(255,79,3,0.15); color: var(--orange); }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      background: var(--bg-subtle);
      padding: 4px;
      border-radius: var(--radius);
      margin-bottom: 20px;
    }
    .tab {
      flex: 1;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab:hover { color: var(--text); }
    .tab.active { background: var(--bg-card); color: var(--text); }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    .empty-state h3 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 8px;
    }
    .empty-state p { margin-bottom: 20px; }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      z-index: 200;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }
    .modal-title { font-size: 18px; font-weight: 600; }
    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
    }
    .modal-close:hover { color: var(--text); }
    .modal-body { padding: 24px; }
    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    /* Positions */
    .position-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .position-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .position-pool { font-weight: 600; font-size: 16px; }
    .position-protocol {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .position-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .position-stat-label {
      font-size: 12px;
      color: var(--text-dim);
      margin-bottom: 4px;
    }
    .position-stat-value {
      font-size: 15px;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Alert */
    .alert {
      padding: 16px 20px;
      border-radius: var(--radius);
      margin-bottom: 20px;
      font-size: 14px;
    }
    .alert-warning {
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      color: #eab308;
    }
    .alert-error {
      background: var(--red-dim);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--red);
    }

    /* Loading */
    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--orange);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Responsive */
    @media (max-width: 768px) {
      .nav-tabs { display: none; }
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
      .position-stats { grid-template-columns: repeat(2, 1fr); }
      th, td { padding: 10px 12px; }
      .hide-mobile { display: none; }
    }

    /* Connect prompt */
    .connect-prompt {
      text-align: center;
      padding: 80px 20px;
    }
    .connect-prompt h2 {
      font-size: 24px;
      margin-bottom: 12px;
    }
    .connect-prompt p {
      color: var(--text-muted);
      margin-bottom: 24px;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    /* Risk banner */
    .risk-banner {
      background: var(--red-dim);
      border-bottom: 1px solid rgba(239, 68, 68, 0.2);
      padding: 10px 20px;
      font-size: 13px;
      color: var(--red);
      text-align: center;
    }
    .risk-banner a { color: inherit; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="risk-banner">
    This is experimental software. You may lose funds. <a href="#" onclick="showRisks()">Read risks</a>
  </div>

  <nav>
    <div class="nav-inner">
      <a href="/" class="logo">
        <span class="logo-mark">YH</span>
        Yield Hunter
      </a>
      <div class="nav-tabs">
        <button class="nav-tab active" onclick="showView('dashboard')">Dashboard</button>
        <button class="nav-tab" onclick="showView('deposit')">Deposit</button>
        <button class="nav-tab" onclick="showView('agents')">My Agents</button>
        <button class="nav-tab" onclick="showView('leaderboard')">Leaderboard</button>
      </div>
      <div class="nav-right">
        <button class="wallet-btn connect" id="walletBtn" onclick="connectWallet()">
          Connect Wallet
        </button>
      </div>
    </div>
  </nav>

  <main class="container">
    <!-- Not connected state -->
    <div id="notConnected" class="connect-prompt">
      <h2>Connect your wallet to start</h2>
      <p>Sign in with your Stacks wallet to deploy yield hunters, deposit sBTC, and track performance.</p>
      <button class="btn btn-primary btn-lg" onclick="connectWallet()">
        Connect Stacks Wallet
      </button>
      <p style="margin-top: 24px; font-size: 13px; color: var(--text-dim);">
        Works with Leather and Xverse wallets
      </p>
    </div>

    <!-- Connected views -->
    <div id="connectedViews" style="display: none;">
      <!-- Dashboard -->
      <div id="view-dashboard" class="view active">
        <div class="grid-4" style="margin-bottom: 24px;">
          <div class="stat-card">
            <div class="stat-label">Portfolio Value</div>
            <div class="stat-value" id="statPortfolio">0.00 sBTC</div>
            <div class="stat-change up" id="statPortfolioChange">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Earned</div>
            <div class="stat-value green" id="statEarned">0.00 sBTC</div>
            <div class="stat-change" id="statEarnedChange">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Active Agents</div>
            <div class="stat-value" id="statAgents">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg APY</div>
            <div class="stat-value orange" id="statAPY">--%</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Active Positions</h3>
              <button class="btn btn-sm btn-secondary" onclick="showView('agents')">View All</button>
            </div>
            <div id="dashboardPositions">
              <div class="empty-state">
                <h3>No active positions</h3>
                <p>Deploy an agent to start hunting yields</p>
                <button class="btn btn-primary" onclick="openDeployModal()">Deploy Agent</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Recent Activity</h3>
            </div>
            <div id="dashboardActivity">
              <div class="empty-state">
                <p>No recent activity</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Deposit -->
      <div id="view-deposit" class="view">
        <div class="grid-2">
          <div class="card">
            <h3 class="card-title" style="margin-bottom: 20px;">Deposit BTC</h3>
            <p style="color: var(--text-muted); margin-bottom: 24px;">
              Convert native BTC to sBTC via the Styx bridge. sBTC is required to fund yield hunters.
            </p>

            <div class="form-group">
              <label class="form-label">Amount (BTC)</label>
              <div class="input-group">
                <input type="number" class="form-input mono" id="depositAmount" placeholder="0.001" step="0.0001" min="0.0001">
                <button class="btn btn-secondary" onclick="setMaxDeposit()">Max</button>
              </div>
              <div class="form-hint">Min: 0.0001 BTC (~$10) | Max: 0.1 BTC (~$10,000)</div>
            </div>

            <div class="form-group">
              <label class="form-label">You will receive</label>
              <div class="form-input mono" style="background: var(--bg-subtle);" id="depositReceive">0.00000000 sBTC</div>
              <div class="form-hint">1:1 conversion minus network fees</div>
            </div>

            <button class="btn btn-primary btn-lg" style="width: 100%;" onclick="initiateDeposit()" id="depositBtn">
              Connect Wallet to Deposit
            </button>
          </div>

          <div class="card">
            <h3 class="card-title" style="margin-bottom: 20px;">Your Balances</h3>

            <div style="padding: 20px; background: var(--bg-subtle); border-radius: var(--radius); margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 13px; color: var(--text-dim);">sBTC Balance</div>
                  <div style="font-size: 24px; font-weight: 700; font-family: 'JetBrains Mono', monospace;" id="balanceSbtc">--</div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="refreshBalances()">Refresh</button>
              </div>
            </div>

            <div style="padding: 20px; background: var(--bg-subtle); border-radius: var(--radius);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 13px; color: var(--text-dim);">STX Balance</div>
                  <div style="font-size: 24px; font-weight: 700; font-family: 'JetBrains Mono', monospace;" id="balanceStx">--</div>
                </div>
              </div>
            </div>

            <div class="alert alert-warning" style="margin-top: 20px;">
              You need STX for transaction fees. Get STX from an exchange or faucet.
            </div>
          </div>
        </div>
      </div>

      <!-- My Agents -->
      <div id="view-agents" class="view">
        <div class="card-header" style="margin-bottom: 20px;">
          <h2 style="font-size: 24px; font-weight: 700;">My Agents</h2>
          <button class="btn btn-primary" onclick="openDeployModal()">Deploy New Agent</button>
        </div>

        <div id="agentsList">
          <div class="empty-state">
            <h3>No agents deployed</h3>
            <p>Deploy your first yield hunter to start earning</p>
            <button class="btn btn-primary" onclick="openDeployModal()">Deploy Agent</button>
          </div>
        </div>
      </div>

      <!-- Leaderboard -->
      <div id="view-leaderboard" class="view">
        <div class="card-header" style="margin-bottom: 20px;">
          <h2 style="font-size: 24px; font-weight: 700;">Leaderboard</h2>
          <div class="tabs" style="margin-bottom: 0; width: auto;">
            <button class="tab active">All Time</button>
            <button class="tab">30 Days</button>
            <button class="tab">7 Days</button>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>Total Earned</th>
                <th>Win Rate</th>
                <th class="hide-mobile">Best APY</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="leaderboardBody">
              <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                  <span class="loading"></span> Loading leaderboard...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- Deploy Agent Modal -->
  <div class="modal-overlay" id="deployModal">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Deploy Yield Hunter</h3>
        <button class="modal-close" onclick="closeDeployModal()">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Agent Name</label>
          <input type="text" class="form-input" id="agentName" placeholder="My Yield Hunter" maxlength="32">
          <div class="form-hint">Choose a unique name for your agent</div>
        </div>

        <div class="form-group">
          <label class="form-label">Initial Funding (sBTC)</label>
          <input type="number" class="form-input mono" id="agentFunding" placeholder="0.01" step="0.001" min="0.001">
          <div class="form-hint">Minimum: 0.001 sBTC. This funds the agent's operations.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Risk Tolerance</label>
          <select class="form-input" id="agentRisk">
            <option value="low">Conservative (Low Risk, Lower APY)</option>
            <option value="medium" selected>Balanced (Medium Risk)</option>
            <option value="high">Aggressive (High Risk, Higher APY)</option>
          </select>
        </div>

        <div class="alert alert-warning">
          Deploying an agent costs 10,000 sats (0.0001 sBTC) plus network fees.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeDeployModal()">Cancel</button>
        <button class="btn btn-primary" onclick="deployAgent()" id="deployAgentBtn">Deploy Agent</button>
      </div>
    </div>
  </div>

  <!-- Risk Modal -->
  <div class="modal-overlay" id="riskModal">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title" style="color: var(--red);">Risk Disclosure</h3>
        <button class="modal-close" onclick="closeRiskModal()">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div style="font-size: 14px; color: var(--text-muted); line-height: 1.7;">
          <p style="margin-bottom: 16px;"><strong style="color: var(--text);">Loss of Funds:</strong> AI agents can and do lose funds. Past performance does not predict future results. You may lose all invested sBTC.</p>
          <p style="margin-bottom: 16px;"><strong style="color: var(--text);">Smart Contract Risk:</strong> Despite testing, contracts may contain bugs that could result in loss of funds.</p>
          <p style="margin-bottom: 16px;"><strong style="color: var(--text);">Protocol Risk:</strong> Third-party DeFi protocols may be exploited, hacked, or rug-pulled.</p>
          <p style="margin-bottom: 16px;"><strong style="color: var(--text);">Impermanent Loss:</strong> LP positions are subject to impermanent loss when token prices diverge.</p>
          <p><strong style="color: var(--text);">This is experimental software.</strong> Do not invest more than you can afford to lose completely.</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeRiskModal()">I Understand</button>
      </div>
    </div>
  </div>

  <script>
    // App State
    const state = {
      connected: false,
      address: null,
      network: 'mainnet',
      balances: { sbtc: 0, stx: 0 },
      agents: [],
      positions: []
    };

    // Stacks Config
    const appDetails = {
      name: 'Yield Hunter',
      icon: 'https://yield-hunter.p-d07.workers.dev/icon.png'
    };

    // Network config
    const NETWORK = new StacksNetwork.StacksMainnet();
    const API_BASE = 'https://api.hiro.so';

    // Contract addresses (mainnet)
    const CONTRACTS = {
      yieldHunter: 'SP2J6Y09JMFWWZCT4JYR2XGPQ5WG0YKNEX6YRXGR.yield-hunter',
      sbtcToken: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
      oracle: 'SP2J6Y09JMFWWZCT4JYR2XGPQ5WG0YKNEX6YRXGR.yield-hunter-oracle'
    };

    // Connect Wallet
    async function connectWallet() {
      try {
        const response = await StacksConnect.showConnect({
          appDetails,
          onFinish: (data) => {
            state.connected = true;
            state.address = data.userSession.loadUserData().profile.stxAddress.mainnet;
            onConnect();
          },
          onCancel: () => {
            console.log('User cancelled');
          },
          userSession: new StacksConnect.UserSession()
        });
      } catch (err) {
        console.error('Connect error:', err);
        alert('Failed to connect wallet. Make sure you have Leather or Xverse installed.');
      }
    }

    // On successful connection
    function onConnect() {
      document.getElementById('notConnected').style.display = 'none';
      document.getElementById('connectedViews').style.display = 'block';

      const btn = document.getElementById('walletBtn');
      btn.className = 'wallet-btn connected';
      btn.innerHTML = '<span class="wallet-dot"></span>' + truncateAddress(state.address);
      btn.onclick = disconnectWallet;

      document.getElementById('depositBtn').textContent = 'Deposit BTC';

      refreshBalances();
      loadAgents();
      loadLeaderboard();
    }

    // Disconnect
    function disconnectWallet() {
      state.connected = false;
      state.address = null;

      document.getElementById('notConnected').style.display = 'block';
      document.getElementById('connectedViews').style.display = 'none';

      const btn = document.getElementById('walletBtn');
      btn.className = 'wallet-btn connect';
      btn.innerHTML = 'Connect Wallet';
      btn.onclick = connectWallet;
    }

    // Fetch balances
    async function refreshBalances() {
      if (!state.address) return;

      try {
        // Fetch STX balance
        const stxRes = await fetch(API_BASE + '/extended/v1/address/' + state.address + '/balances');
        const stxData = await stxRes.json();

        state.balances.stx = parseInt(stxData.stx.balance) / 1000000;
        document.getElementById('balanceStx').textContent = state.balances.stx.toFixed(2) + ' STX';

        // Fetch sBTC balance (fungible token)
        const sbtcBalance = stxData.fungible_tokens['SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc'];
        if (sbtcBalance) {
          state.balances.sbtc = parseInt(sbtcBalance.balance) / 100000000;
        }
        document.getElementById('balanceSbtc').textContent = state.balances.sbtc.toFixed(8) + ' sBTC';

        // Update dashboard
        document.getElementById('statPortfolio').textContent = state.balances.sbtc.toFixed(4) + ' sBTC';
      } catch (err) {
        console.error('Balance fetch error:', err);
      }
    }

    // Load user's agents
    async function loadAgents() {
      // In production, this would query the contract
      // For now, show empty state
      const container = document.getElementById('agentsList');

      // Simulated check - replace with actual contract call
      if (state.agents.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <h3>No agents deployed</h3>
            <p>Deploy your first yield hunter to start earning</p>
            <button class="btn btn-primary" onclick="openDeployModal()">Deploy Agent</button>
          </div>
        \`;
      }
    }

    // Load leaderboard from contract
    async function loadLeaderboard() {
      const tbody = document.getElementById('leaderboardBody');

      try {
        // In production, query the oracle contract for leaderboard data
        // For now, show that we're fetching real data
        const response = await fetch(API_BASE + '/extended/v1/contract/' + CONTRACTS.oracle.replace('.', '/') + '/read-only/get-top-hunters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: state.address || 'SP000000000000000000002Q6VF78',
            arguments: ['0x0000000000000000000000000000000a'] // u10
          })
        });

        if (!response.ok) {
          throw new Error('Contract not deployed yet');
        }

        const data = await response.json();
        // Parse and display results

      } catch (err) {
        // Contract not deployed yet - show placeholder
        tbody.innerHTML = \`
          <tr>
            <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
              Leaderboard data will appear once agents are deployed on mainnet.
            </td>
          </tr>
        \`;
      }
    }

    // Deposit flow
    async function initiateDeposit() {
      if (!state.connected) {
        connectWallet();
        return;
      }

      const amount = parseFloat(document.getElementById('depositAmount').value);
      if (!amount || amount < 0.0001 || amount > 0.1) {
        alert('Please enter a valid amount between 0.0001 and 0.1 BTC');
        return;
      }

      // In production, this would initiate Styx bridge deposit
      // For now, show instructions
      alert('Styx bridge integration coming soon. For now, acquire sBTC via supported exchanges.');
    }

    // Update receive amount
    document.getElementById('depositAmount')?.addEventListener('input', (e) => {
      const amount = parseFloat(e.target.value) || 0;
      const fee = 0.00001; // Estimated fee
      const receive = Math.max(0, amount - fee);
      document.getElementById('depositReceive').textContent = receive.toFixed(8) + ' sBTC';
    });

    // Deploy agent
    async function deployAgent() {
      if (!state.connected) {
        alert('Please connect your wallet first');
        return;
      }

      const name = document.getElementById('agentName').value.trim();
      const funding = parseFloat(document.getElementById('agentFunding').value);
      const risk = document.getElementById('agentRisk').value;

      if (!name || name.length < 3) {
        alert('Please enter a valid agent name (at least 3 characters)');
        return;
      }

      if (!funding || funding < 0.001) {
        alert('Please enter at least 0.001 sBTC for funding');
        return;
      }

      const btn = document.getElementById('deployAgentBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading"></span> Deploying...';

      try {
        // Build the contract call transaction
        const txOptions = {
          contractAddress: CONTRACTS.yieldHunter.split('.')[0],
          contractName: CONTRACTS.yieldHunter.split('.')[1],
          functionName: 'initialize-hunter',
          functionArgs: [
            StacksTransactions.stringAsciiCV(name),
            StacksTransactions.uintCV(Math.floor(funding * 100000000)),
            StacksTransactions.uintCV(risk === 'low' ? 30 : risk === 'high' ? 70 : 50)
          ],
          network: NETWORK,
          appDetails,
          onFinish: (data) => {
            alert('Agent deployment transaction submitted! TX: ' + data.txId);
            closeDeployModal();
            loadAgents();
          },
          onCancel: () => {
            console.log('User cancelled');
          }
        };

        await StacksConnect.openContractCall(txOptions);
      } catch (err) {
        console.error('Deploy error:', err);
        alert('Failed to deploy agent: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Deploy Agent';
      }
    }

    // View switching
    function showView(viewId) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

      document.getElementById('view-' + viewId).classList.add('active');
      event.target.classList.add('active');
    }

    // Modals
    function openDeployModal() {
      document.getElementById('deployModal').classList.add('open');
    }
    function closeDeployModal() {
      document.getElementById('deployModal').classList.remove('open');
    }
    function showRisks() {
      document.getElementById('riskModal').classList.add('open');
    }
    function closeRiskModal() {
      document.getElementById('riskModal').classList.remove('open');
    }

    // Helpers
    function truncateAddress(addr) {
      if (!addr) return '';
      return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function setMaxDeposit() {
      document.getElementById('depositAmount').value = '0.1';
      document.getElementById('depositAmount').dispatchEvent(new Event('input'));
    }

    // Check if already connected on load
    window.addEventListener('load', () => {
      // Check for existing session
      const userSession = new StacksConnect.UserSession();
      if (userSession.isUserSignedIn()) {
        const userData = userSession.loadUserData();
        state.connected = true;
        state.address = userData.profile.stxAddress.mainnet;
        onConnect();
      }
    });
  </script>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // API routes for backend functionality
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, url);
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "no-cache"
      },
    });
  },
};

// API handler
async function handleAPI(request, url) {
  const path = url.pathname.replace('/api/', '');

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  // GET /api/leaderboard
  if (path === 'leaderboard' && request.method === 'GET') {
    // Query Stacks API for contract data
    try {
      const response = await fetch('https://api.hiro.so/extended/v1/contract/SP2J6Y09JMFWWZCT4JYR2XGPQ5WG0YKNEX6YRXGR.yield-hunter-oracle/read-only/get-leaderboard-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: 'SP000000000000000000002Q6VF78',
          arguments: []
        })
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Contract not deployed' }), { headers, status: 503 });
    }
  }

  // GET /api/agent/:address
  if (path.startsWith('agent/') && request.method === 'GET') {
    const address = path.replace('agent/', '');
    // Query agent data from contract
    return new Response(JSON.stringify({ address, agents: [] }), { headers });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { headers, status: 404 });
}
