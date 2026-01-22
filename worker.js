// AIBTC Yield Hunter - Production Landing Page

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Yield Hunter | Autonomous Bitcoin Yield Agents</title>
  <meta name="description" content="Autonomous AI agents that hunt DeFi yields on Bitcoin L2. Built on Stacks, powered by sBTC.">
  <meta property="og:title" content="Yield Hunter | AIBTC">
  <meta property="og:description" content="Autonomous AI agents hunting yields on Bitcoin.">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --orange: #ff4f03;
      --orange-hover: #e54600;
      --green: #22c55e;
      --red: #ef4444;
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
      overflow-x: hidden;
    }

    .mono { font-family: 'JetBrains Mono', monospace; }

    .container {
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* NAV */
    nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: rgba(9, 9, 11, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }

    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
    }

    .logo {
      font-weight: 700;
      font-size: 18px;
      color: var(--text);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logo-mark {
      width: 28px;
      height: 28px;
      background: var(--orange);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #000;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 32px;
    }

    .nav-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.15s;
    }

    .nav-links a:hover { color: var(--text); }

    .nav-cta {
      background: var(--orange);
      color: #000;
      padding: 8px 16px;
      border-radius: var(--radius);
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: background 0.15s;
    }

    .nav-cta:hover { background: var(--orange-hover); color: #000; }

    /* Mobile menu */
    .menu-toggle {
      display: none;
      background: none;
      border: none;
      color: var(--text);
      cursor: pointer;
      padding: 8px;
    }

    .menu-toggle svg {
      width: 24px;
      height: 24px;
    }

    .mobile-menu {
      display: none;
      position: fixed;
      top: 64px;
      left: 0;
      right: 0;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      flex-direction: column;
      gap: 16px;
    }

    .mobile-menu.open { display: flex; }

    .mobile-menu a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 16px;
      font-weight: 500;
      padding: 8px 0;
    }

    /* HERO */
    .hero {
      padding: 140px 0 80px;
      text-align: center;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 100px;
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .badge-dot {
      width: 8px;
      height: 8px;
      background: var(--orange);
      border-radius: 50%;
    }

    .hero h1 {
      font-size: clamp(32px, 6vw, 56px);
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin-bottom: 20px;
      max-width: 720px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero h1 span {
      color: var(--orange);
    }

    .hero .lead {
      font-size: clamp(16px, 2.5vw, 20px);
      color: var(--text-muted);
      max-width: 540px;
      margin: 0 auto 32px;
    }

    .hero-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: var(--radius);
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      transition: all 0.15s;
      cursor: pointer;
      border: none;
      font-family: inherit;
    }

    .btn-primary {
      background: var(--orange);
      color: #000;
    }

    .btn-primary:hover {
      background: var(--orange-hover);
    }

    .btn-secondary {
      background: var(--bg-card);
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-subtle);
      border-color: var(--text-dim);
    }

    /* STATS */
    .stats {
      padding: 48px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      background: var(--bg-subtle);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
      text-align: center;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-value.orange { color: var(--orange); }

    .stat-label {
      font-size: 13px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* SECTION */
    .section {
      padding: 80px 0;
    }

    .section-header {
      text-align: center;
      margin-bottom: 48px;
    }

    .section-header h2 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 12px;
    }

    .section-header p {
      color: var(--text-muted);
      font-size: 16px;
    }

    /* FEATURES */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    .feature {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px;
    }

    .feature-icon {
      width: 40px;
      height: 40px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      color: var(--orange);
    }

    .feature h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .feature p {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* HOW IT WORKS */
    .steps {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 32px;
    }

    .step {
      text-align: center;
    }

    .step-num {
      width: 48px;
      height: 48px;
      background: var(--bg-card);
      border: 2px solid var(--orange);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      margin: 0 auto 16px;
      color: var(--orange);
    }

    .step h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .step p {
      font-size: 14px;
      color: var(--text-muted);
    }

    /* ARCHITECTURE */
    .arch-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
    }

    .arch-code {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.8;
      color: var(--text-muted);
      overflow-x: auto;
    }

    .arch-code .comment { color: var(--text-dim); }
    .arch-code .highlight { color: var(--orange); }
    .arch-code .green { color: var(--green); }

    /* WAITLIST */
    .waitlist {
      background: var(--bg-subtle);
      border-top: 1px solid var(--border);
      padding: 80px 0;
    }

    .waitlist-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      max-width: 560px;
      margin: 0 auto;
    }

    .waitlist h2 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
    }

    .waitlist p {
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .waitlist-form {
      display: flex;
      gap: 12px;
      max-width: 400px;
      margin: 0 auto;
    }

    .waitlist-form input {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 16px;
      font-size: 15px;
      color: var(--text);
      font-family: inherit;
    }

    .waitlist-form input::placeholder {
      color: var(--text-dim);
    }

    .waitlist-form input:focus {
      outline: none;
      border-color: var(--orange);
    }

    /* RISKS */
    .risks {
      padding: 64px 0;
      border-top: 1px solid var(--border);
    }

    .risks-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--red);
      border-radius: 8px;
      padding: 24px;
    }

    .risks h3 {
      font-size: 14px;
      font-weight: 600;
      color: var(--red);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }

    .risks ul {
      list-style: none;
      display: grid;
      gap: 12px;
    }

    .risks li {
      font-size: 13px;
      color: var(--text-muted);
      padding-left: 16px;
      position: relative;
    }

    .risks li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      width: 4px;
      height: 4px;
      background: var(--text-dim);
      border-radius: 50%;
    }

    .risks li strong {
      color: var(--text);
    }

    /* FOOTER */
    footer {
      padding: 32px 0;
      border-top: 1px solid var(--border);
    }

    .footer-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .footer-links {
      display: flex;
      gap: 24px;
    }

    .footer-links a {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 13px;
    }

    .footer-links a:hover {
      color: var(--text-muted);
    }

    .footer-copy {
      font-size: 13px;
      color: var(--text-dim);
    }

    /* MOBILE */
    @media (max-width: 768px) {
      .nav-links { display: none; }
      .menu-toggle { display: block; }

      .hero { padding: 100px 0 60px; }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      .stat-value { font-size: 24px; }

      .features-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .steps {
        grid-template-columns: 1fr;
        gap: 24px;
      }

      .step {
        display: flex;
        align-items: flex-start;
        text-align: left;
        gap: 16px;
      }

      .step-num {
        margin: 0;
        flex-shrink: 0;
      }

      .section { padding: 48px 0; }

      .waitlist-card { padding: 32px 24px; }

      .waitlist-form {
        flex-direction: column;
      }

      .hero-buttons {
        flex-direction: column;
        align-items: stretch;
        padding: 0 24px;
      }

      .footer-inner {
        flex-direction: column;
        text-align: center;
      }

      .footer-links {
        flex-wrap: wrap;
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <nav>
    <div class="container nav-inner">
      <a href="/" class="logo">
        <span class="logo-mark">YH</span>
        Yield Hunter
      </a>
      <div class="nav-links">
        <a href="#how">How It Works</a>
        <a href="#architecture">Architecture</a>
        <a href="https://github.com/aibtcdev" target="_blank">GitHub</a>
        <a href="#waitlist" class="nav-cta">Get Early Access</a>
      </div>
      <button class="menu-toggle" onclick="toggleMenu()" aria-label="Menu">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
    </div>
    <div class="mobile-menu" id="mobileMenu">
      <a href="#how" onclick="toggleMenu()">How It Works</a>
      <a href="#architecture" onclick="toggleMenu()">Architecture</a>
      <a href="https://github.com/aibtcdev" target="_blank">GitHub</a>
      <a href="#waitlist" onclick="toggleMenu()">Get Early Access</a>
    </div>
  </nav>

  <section class="hero">
    <div class="container">
      <div class="badge">
        <span class="badge-dot"></span>
        In Development
      </div>
      <h1>Autonomous agents that hunt <span>Bitcoin yields</span></h1>
      <p class="lead">AI-powered yield optimization on Stacks. On-chain logic, verifiable decisions, sBTC-native returns.</p>
      <div class="hero-buttons">
        <a href="#waitlist" class="btn btn-primary">Join Waitlist</a>
        <a href="https://github.com/aibtcdev/yield-hunter" target="_blank" class="btn btn-secondary">View Source</a>
      </div>
    </div>
  </section>

  <section class="stats">
    <div class="container">
      <div class="stats-grid">
        <div>
          <div class="stat-value">12</div>
          <div class="stat-label">Smart Contracts</div>
        </div>
        <div>
          <div class="stat-value">5</div>
          <div class="stat-label">Protocol Adapters</div>
        </div>
        <div>
          <div class="stat-value orange">27</div>
          <div class="stat-label">Unit Tests</div>
        </div>
        <div>
          <div class="stat-value">100%</div>
          <div class="stat-label">Open Source</div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="how">
    <div class="container">
      <div class="section-header">
        <h2>How it works</h2>
        <p>From deployment to compounding yields</p>
      </div>
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <div>
            <h3>Deploy Agent</h3>
            <p>Mint your agent identity and fund it with sBTC through the Styx bridge</p>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div>
            <h3>Scan Protocols</h3>
            <p>Agent queries Bitflow, Alex, Zest, and other DeFi protocols for yield opportunities</p>
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div>
            <h3>Evaluate Risk</h3>
            <p>Monte Carlo simulations assess liquidity, volume, and concentration risk</p>
          </div>
        </div>
        <div class="step">
          <div class="step-num">4</div>
          <div>
            <h3>Execute & Compound</h3>
            <p>Deploy capital to approved pools, harvest yields, auto-compound returns</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" style="background: var(--bg-subtle); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
    <div class="container">
      <div class="section-header">
        <h2>Built for trust</h2>
        <p>Every decision auditable on-chain</p>
      </div>
      <div class="features-grid">
        <div class="feature">
          <div class="feature-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <h3>Clarity Smart Contracts</h3>
          <p>All agent logic lives in auditable Clarity code. No hidden behavior, no black boxes.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <h3>Risk Scoring Engine</h3>
          <p>Weighted analysis of liquidity, volume, holder concentration, and pool age before any position.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h3>Post-Condition Security</h3>
          <p>Explicit token transfer limits on every transaction. Contracts cannot move funds arbitrarily.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <h3>Styx Bridge Integration</h3>
          <p>Native BTC to sBTC conversion. No wrapped tokens, no custodians, no counterparty risk.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <h3>Governance Controls</h3>
          <p>Admin-only pool approvals. You control which protocols your agent can interact with.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
            </svg>
          </div>
          <h3>Open Source</h3>
          <p>MIT licensed. Fork it, audit it, improve it. Every line of code is public.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="architecture">
    <div class="container">
      <div class="section-header">
        <h2>Architecture</h2>
        <p>Modular design for extensibility and security</p>
      </div>
      <div class="arch-card">
        <div class="arch-code">
<span class="comment">// Contract Architecture</span>

<span class="highlight">yield-hunter.clar</span>          <span class="comment">Core agent logic, position management</span>
<span class="highlight">yield-hunter-adapter.clar</span>   <span class="comment">Bitflow XYK swap integration</span>
<span class="highlight">yield-hunter-oracle.clar</span>    <span class="comment">Risk scoring, Pyth price feeds</span>
<span class="highlight">agent-lifecycle.clar</span>        <span class="comment">Birth, feed, evolve, death mechanics</span>

<span class="comment">// Protocol Adapters</span>
<span class="green">bitflow-adapter.clar</span>        <span class="comment">Bitflow AMM pools</span>
<span class="green">alex-adapter.clar</span>           <span class="comment">ALEX DEX integration</span>
<span class="green">zest-adapter.clar</span>           <span class="comment">Zest lending protocol</span>
<span class="green">hermetica-adapter.clar</span>      <span class="comment">Hermetica basis vaults</span>
<span class="green">arkadiko-adapter.clar</span>       <span class="comment">Arkadiko CDP + staking</span>

<span class="comment">// TypeScript Engine</span>
src/yield-hunter/
  scanning/       <span class="comment">Pool discovery via Tenero API</span>
  engine/         <span class="comment">Monte Carlo risk simulations</span>
  execution/      <span class="comment">Contract interaction layer</span>
  wallet/         <span class="comment">Styx bridge, Xverse/Leather connect</span>
        </div>
      </div>
    </div>
  </section>

  <section class="waitlist" id="waitlist">
    <div class="container">
      <div class="waitlist-card">
        <h2>Get early access</h2>
        <p>Be first to deploy a yield hunter when we launch on testnet.</p>
        <form class="waitlist-form" action="https://aibtc.dev/waitlist" method="POST">
          <input type="email" name="email" placeholder="you@example.com" required>
          <button type="submit" class="btn btn-primary">Join Waitlist</button>
        </form>
      </div>
    </div>
  </section>

  <section class="risks" id="risks">
    <div class="container">
      <div class="risks-card">
        <h3>Risk Disclosure</h3>
        <ul>
          <li><strong>Loss of funds is possible.</strong> AI agents can make poor decisions. Past performance does not predict future results.</li>
          <li><strong>Smart contract risk.</strong> Despite testing, contracts may contain bugs that could result in loss of funds.</li>
          <li><strong>Protocol risk.</strong> Third-party DeFi protocols may be exploited, hacked, or rug-pulled.</li>
          <li><strong>This is experimental software.</strong> Do not invest more than you can afford to lose completely.</li>
        </ul>
      </div>
    </div>
  </section>

  <footer>
    <div class="container footer-inner">
      <div class="footer-links">
        <a href="https://aibtc.dev" target="_blank">AIBTC</a>
        <a href="https://stacks.co" target="_blank">Stacks</a>
        <a href="https://github.com/aibtcdev" target="_blank">GitHub</a>
        <a href="#risks">Risks</a>
      </div>
      <div class="footer-copy">Built on Bitcoin</div>
    </div>
  </footer>

  <script>
    function toggleMenu() {
      document.getElementById('mobileMenu').classList.toggle('open');
    }
  </script>
</body>
</html>`;

export default {
  async fetch(request) {
    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "public, max-age=3600"
      },
    });
  },
};
