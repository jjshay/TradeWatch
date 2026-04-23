// tr-walkthrough-content.jsx — per-tab guided tour content.
//
// Each entry is an array of { title, body, target? }. When `target` is set,
// the walkthrough engine highlights the matching CSS selector. If omitted,
// the step renders centered.
//
// Targets should be data-walk="<label>" attributes — look for those in the
// individual screen files. When the selector isn't found we still show the
// step centered (graceful fallback).

window.TR_WALKTHROUGHS = {

  // ─────────────────────────── DRIVERS ───────────────────────────
  drivers: [
    {
      title: 'Welcome to TradeRadar',
      body: 'This is the Drivers scoreboard — the distilled signals that actually move BTC, Oil, and SPX.\n\nEverything else on the app is a deeper cut of what you see here. Take 30 seconds to learn the layout.',
    },
    {
      title: 'Regime strip',
      body: 'Top-level market regime: DXY, VIX, Fear & Greed, GDELT news tone. These four frame the entire risk backdrop.\n\nHover any tile for the plain-English explanation of what it means.',
      target: '[data-walk="regime-strip"]',
    },
    {
      title: 'Three asset columns',
      body: 'Each column shows the five drivers that matter most for that asset. An ↑ means it supports going long, ↓ means short, ↔ neutral.\n\nWhen all 5 tiles align, the column chip shows BULL or BEAR. That is a high-conviction setup.',
      target: '[data-walk="asset-columns"]',
    },
    {
      title: 'Click any tile for the deep panel',
      body: 'Every tile is a shortcut. Click it to open the full intelligence panel with charts, history, and raw data.',
    },
    {
      title: 'Other tabs go deeper',
      body: 'Drivers is the "what to trade" tab.\n\n• Summary — today\'s LLM consensus read\n• Signals — 7 lanes, 43 tiles\n• Impact — oil-driver → BTC cross-asset model\n• News — full feed\n• Flights — Iran airspace (live)\n\n⌘⇧P opens the panel launcher. Press / or ⌘K for quick command palette.',
    },
  ],

  // ─────────────────────────── SUMMARY ───────────────────────────
  summary: [
    {
      title: 'Today\'s Catalyst Read',
      body: 'Summary is your morning briefing: live BTC/WTI/F&G, the top 6 news catalysts, and three independent LLM year-end forecasts.',
    },
    {
      title: 'Multi-LLM consensus',
      body: 'Claude · ChatGPT · Gemini each read the same headlines and forecast year-end BTC independently.\n\nWhen all three ALIGN, the regime is high-conviction. When they DIVERGE, stay small.',
      target: '[data-walk="llm-grid"]',
    },
    {
      title: '↻ Refresh pulls fresh news + re-runs LLMs',
      body: 'Click Refresh to pull the latest headlines and re-generate all three forecasts. Takes ~8-15 seconds.',
      target: '[data-walk="summary-refresh"]',
    },
    {
      title: 'TEST button (local only)',
      body: 'The red TEST button runs ~35 self-checks and asks an LLM to verify every feature works. Useful after code changes or if something feels off.',
      target: '[data-walk="summary-test"]',
    },
    {
      title: 'Hover any "i" icon',
      body: 'Every metric on every page has a hover explanation. Hover the small ℹ icons for a plain-English definition + how to read it.',
    },
  ],

  // ─────────────────────────── HISTORICAL ───────────────────────────
  historical: [
    {
      title: 'Historical Performance',
      body: 'Multi-series chart of BTC, WTI, SPX, Gold, and DXY normalized over time. Use this to see whether current moves are normal or outliers.',
    },
    {
      title: 'Toggle series',
      body: 'Click the legend chips to show/hide each asset. Useful for comparing just BTC vs SPX, or oil vs DXY.',
    },
    {
      title: 'Range picker',
      body: '1M · 3M · 1Y · 5Y. Longer ranges show structural regime; shorter ranges show tactical price action.',
    },
  ],

  // ─────────────────────────── PROJECTED ───────────────────────────
  projected: [
    {
      title: 'BTC Price Projection',
      body: 'Fan chart of where BTC is likely to end the year based on the current 7 drivers (institutional, macro, reg, cycle, etc.).',
    },
    {
      title: 'Driver accordions',
      body: 'Each driver is collapsible. Click any driver to expand and see the news items, LLM-scored dollar impact, and how they aggregate into the projected price.',
      target: '[data-walk="driver-accordion"]',
    },
    {
      title: 'Triple-LLM target overlay',
      body: 'Claude, ChatGPT, and Gemini each independently target year-end BTC. The fan chart shows the consensus + disagreement width.',
    },
  ],

  // ─────────────────────────── IMPACT ───────────────────────────
  impact: [
    {
      title: 'Oil → BTC Cross-Asset Model',
      body: 'A two-stage model: (1) oil drivers project WTI, (2) WTI delta feeds back as a headwind/tailwind on BTC.\n\nThis is where you see if oil is the dominant macro force today.',
    },
    {
      title: 'Stage 1 — Oil drivers',
      body: 'Seven oil-specific drivers: Iran/Strait, OPEC+, Shale, China, Fed/Dollar, SPR, Russia/Ukraine. Each weighted by importance.',
    },
    {
      title: 'Driver accordions',
      body: 'Click any driver to expand and see the news items that feed its $/bbl impact score. The default-open driver is the highest-weighted.',
      target: '[data-walk="driver-accordion"]',
    },
    {
      title: 'Stage 2 — BTC from Oil',
      body: 'Shows BTC NOW vs the model-implied BTC price if only oil mattered. When they diverge a lot, oil is NOT the dominant force — check Impact tab drivers instead.',
    },
  ],

  // ─────────────────────────── RECOMMEND ───────────────────────────
  recommend: [
    {
      title: 'Portfolio Recommendations',
      body: 'AI-generated position recommendations based on your current signals + LLM consensus. Long/short/hold for BTC, oil-related ETFs, and SPX.',
    },
    {
      title: 'Why this position?',
      body: 'Each recommendation expands into a rationale: which drivers support it, which work against it, confidence level, and suggested size.',
    },
    {
      title: 'Risk-managed',
      body: 'Every rec comes with a stop-loss suggestion. Pair with the Position Sizing panel (⌘⇧P → Position Sizing) to compute contracts/shares for your account.',
    },
  ],

  // ─────────────────────────── NEWS ───────────────────────────
  news: [
    {
      title: 'News Feed',
      body: 'Curated feed organized into themed buckets: Fed, CLARITY Act, Institutional, Geopolitics, etc. Each bucket has a narrative synopsis at the top.',
    },
    {
      title: 'Left-rail bucket selector',
      body: 'Click a bucket to switch the stream on the right. Each bucket\'s "heat" indicator shows how active the narrative is right now.',
    },
    {
      title: 'Article cards',
      body: 'Scroll horizontally to see articles within a bucket. Double-click any card to open the full article. The RISK badge (HIGH/MED/LOW) tells you whether to act now or just track.',
    },
  ],

  // ─────────────────────────── CALENDAR ───────────────────────────
  calendar: [
    {
      title: 'Economic Calendar',
      body: 'Upcoming catalysts: Fed decisions, CPI prints, OPEC meetings, earnings. Color-coded by type.',
    },
    {
      title: 'Category filter',
      body: 'Filter to Fed / Geopolitics / Earnings / Oil / Regulation / Trump-related events. Combine with the day picker to plan your week.',
    },
    {
      title: 'Day dots',
      body: 'Dots under calendar days = scheduled events. Click any day to preview all events that day. The "Next 7 Days" card updates live.',
    },
  ],

  // ─────────────────────────── SIGNALS ───────────────────────────
  signals: [
    {
      title: 'Signals Dashboard',
      body: '43 live signal tiles across 7 lanes. Each lane has its own composite score. This is the deepest quant view of the market.',
    },
    {
      title: 'Composite strip',
      body: 'Top-level BTC / SPX / OIL / Macro scores — weighted across every tile that tags that asset.\n\nClick any chip for an LLM rationale: why is BTC scoring BULLISH 72 right now? You get a 2-paragraph explanation.',
      target: '[data-walk="composite-strip"]',
    },
    {
      title: 'Meta-tabs: Macro · Flow · Geo',
      body: 'Seven lanes grouped into 3 tabs so you don\'t drown in data:\n• Macro: Fed + Equities\n• Flow: Crypto + Regulation\n• Geo: Geopolitics + China + Oil',
      target: '[data-walk="meta-tabs"]',
    },
    {
      title: 'Click any tile for detail',
      body: 'Each tile opens a modal with source data, historical chart, and a direct link to the primary data source (FRED, Coinglass, etc.).',
    },
  ],

  // ─────────────────────────── PRICES ───────────────────────────
  prices: [
    {
      title: 'Live Prices',
      body: 'Real-time quotes for stocks, futures, and crypto. Click any ticker for the 1-year chart, 52-week range, and the options chain.',
    },
    {
      title: 'Tab switcher',
      body: 'Three tabs: Stocks · Futures/Commods · Crypto. Your watchlist stays visible above regardless of which tab is active.',
      target: '[data-walk="prices-tabs"]',
    },
    {
      title: 'Star to save',
      body: 'Star any ticker to add it to your persistent watchlist. Star an option contract inside the options chain to track that specific strike/expiry.',
    },
    {
      title: 'Options chain shortcut',
      body: 'Open any stock, click "⚡ OPTIONS CHAIN" for the full bid/ask/volume/OI grid by strike and expiry. Requires Tradier key (free sandbox).',
    },
  ],

  // ─────────────────────────── FLIGHTS ───────────────────────────
  flights: [
    {
      title: 'Iran Airspace Tracker',
      body: 'Live military aircraft over Iran and the Gulf. Refueler-heavy buildup = strike-ops prep. Quiet skies = routine.',
    },
    {
      title: 'Color-coded aircraft key',
      body: 'Seven categories visible on the legend:\n• Red — Refuelers (strike-ops prep)\n• Dark red — Bombers / Strategic\n• Teal — Navy Patrol (P-8)\n• Gold — Transport (C-17/C-5)\n• Purple — Exec / VIP\n• Green — ISR / Recon\n• Gray — Other US Mil',
      target: '[data-walk="flights-legend"]',
    },
    {
      title: 'AI commentary',
      body: 'Every 2 minutes the tracker re-polls OpenSky, and Claude writes an OSINT read: what does the current mix of aircraft imply for oil, BTC, and risk assets?',
    },
    {
      title: 'Period toggle',
      body: 'Now / 1H / 24H / 7D trails. Longer trails reveal operational tempo — sustained high traffic = elevated oil risk premium.',
    },
  ],
};
