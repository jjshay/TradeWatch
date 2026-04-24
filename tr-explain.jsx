// tr-explain.jsx — reusable hover tooltip + explanation dictionary.
// Exposes:
//   window.TRTooltip({ text, children, side, maxWidth })  - wrapper component
//   window.TRInfoIcon({ text, size })                     - standalone ℹ hover chip
//   window.TR_EXPLAIN                                     - id → text dictionary

window.TR_EXPLAIN = {
  // ─── REGIME tiles ───
  'dxy': 'The US Dollar Index measures the dollar against a basket of major currencies. Rising DXY = stronger dollar = headwind for BTC, oil, and emerging-market equities. Cross-border buyers need more of their currency to buy dollar-denominated assets.',
  'vix': 'The CBOE Volatility Index ("fear gauge") — 30-day implied volatility on S&P 500 options. Below 15 = complacent risk-on regime. Above 22 = elevated fear, typically coincides with drawdowns. Mean-reverting.',
  'fng': 'Fear & Greed Index (alternative.me) blends volatility, momentum, social media, trends, BTC dominance, surveys into a 0-100 score. Extreme fear (<25) = contrarian long setup. Extreme greed (>75) = contrarian trim.',
  'gdelt': 'GDELT global event tone — average sentiment score across 100M+ news articles in the last 24h. Below -5 = broadly negative news cycle = risk-off. Above 0 = constructive. Leading indicator for geopolitical shocks.',

  // ─── BTC drivers ───
  'ibit-flow':   'Net institutional flows into spot BTC ETFs (led by IBIT at ~$80B AUM). Persistent positive weekly flows = structural bid. Reversals signal institutional de-risking. 7-day streak indicates conviction.',
  'btc-funding': 'Annualized funding rate on BTC perpetual futures averaged across Binance/Bybit/OKX/dYdX. Positive funding = longs pay shorts (crowded long, contrarian short). Negative = shorts pay longs (capitulation, contrarian long).',
  'btc-reserves':'BTC held on centralized exchanges. Outflows (balance dropping) indicate holders moving coins to cold storage (accumulation). Inflows suggest preparation to sell. 7-day trend is the read.',
  'btc-stables': 'Stablecoin (USDT, USDC) total supply. Rising supply = new dollars entering crypto (fresh dry powder). Falling = redemptions / capital leaving. Leading indicator for crypto buying power.',
  'btc-policy':  'Polymarket/Kalshi-implied probability that the CLARITY Act passes the Senate. Above 70% = priced in structural regulatory win + Strategic BTC Reserve pathway. Below 40% = political risk resurfacing.',

  // ─── WTI drivers ───
  'hormuz-mil':  'Count of US military aircraft (callsigns RCH/HAVEN/BAT/CNV/SPAR/etc.) currently tracked in the CENTCOM bbox (Iran/Gulf). Refueler-heavy buildup = sustained-operations prep. Above 10 = elevated oil risk premium.',
  'wti-spot':    'WTI Crude Oil futures (CL=F) via Stooq. Confirming indicator — shows whether the drivers above are already being priced in by the market.',
  'oil-dxy':     'Same DXY tile as in Regime but interpreted inverse for oil. Strong dollar = oil priced in other currencies becomes more expensive = demand destruction = bearish oil.',
  'opec':        'OPEC+ production vs voluntary quota. Supply discipline above quota cuts = bullish oil. Cheating (overproduction) = bearish. Monthly EIA data; panel also uses Brent-WTI spread as a real-time tightness proxy (>$4 = tight).',
  'iran-deadline':'Days until the next Iran nuclear milestone or JCPOA-2 deadline. Within 7 days = escalation premium builds into oil. Passed = either deal-done (bearish oil) or collapse (very bullish oil).',

  // ─── SPX drivers ───
  'spx-10y':     '10-Year US Treasury yield — the discount rate for every equity multiple on the planet. Rising yields compress P/Es (bearish SPX). Falling yields = multiple expansion tailwind. Above 4.5% = headwind zone.',
  'spx-hy':      'Bank of America High Yield Option-Adjusted Spread (BAMLH0A0HYM2). How much extra yield investors demand to hold junk-rated corporate debt vs Treasuries. Widening = risk-off repricing (bearish SPX).',
  'spx-2s10s':   '10Y minus 2Y Treasury yield spread. When inverted (2Y > 10Y) historically precedes recessions by 6-18 months. Re-steepening from inversion is the late-cycle signal — recession typically hits shortly after.',
  'spx-vix':     'Same VIX as Regime tile — included here because it directly drives equity risk appetite. Sustained VIX < 15 = dip-buying works. Spikes above 25 = de-risk.',
  'spx-recession':'NY Fed 12-month-ahead recession probability from the yield-curve model (RECPROUSM156N). Above 30% historically precedes recessions within 12 months. Rising probability = de-risk equities.',

  // ─── Summary / LLMs ───
  'llm-claude':   'Anthropic Claude Sonnet 4.6 — strong reasoning and forecasting. Tends to weight institutional flows + regulatory events. Independently generates a BTC year-end target from current news.',
  'llm-gpt':      'OpenAI GPT-4o-mini — broadest training data. Tends to weight macro + sentiment signals. Generated target often differs from Claude by $3-8k, making the consensus useful.',
  'llm-gemini':   'Google Gemini 2.5 Flash — fast, grounded in Google\'s search index. Weights news recency heavily. When all three LLMs agree (ALIGNED) = high-conviction regime.',
  'consensus':    'Average of whichever LLMs returned valid predictions. Spread (high - low) indicates disagreement width. ALIGNED sentiment across all three = high conviction. DIVERGENT = reduce size until alignment returns.',

  // ─── Generic concepts ───
  'signal-arrow': 'Tile direction arrow: ↑ supports long exposure · ↓ supports short · ↔ neutral. Computed from current value vs threshold (see tile tooltip for specific rule).',
  'consensus-chip':'Column consensus: BULL (all 5 tiles long) · LEAN BULL (>60% long) · MIXED (split) · LEAN BEAR · BEAR. High-conviction trades take the all-aligned direction. Mixed = patience.',

  // ─── Signals page ───
  'signals-composite': 'Composite signal — weighted score across every tile that tags this asset. Each ↑ adds +1, ↓ subtracts 1, HOT tiles count 1.5×. Scaled to 0-100 (50 = neutral). BULLISH ≥65 · LEAN BULL 55-64 · NEUTRAL 45-55 · LEAN BEAR 36-44 · BEARISH ≤35. Click the chip for LLM rationale.',
  'signals-macro-tilt':'Macro Tilt — average of BTC + SPX scores. Read: is the overall risk regime risk-on or risk-off right now? Independent of oil, which often moves counter-cyclically.',
  'signals-live-count':'Total live signal tiles across all 7 lanes. Each tile is either a live API read (Finnhub / CoinGecko) or a curated mock until the API key is wired. LIVE dot pulses when any feed is currently refreshing.',
  'signals-lane-fed':  'Fed & Rates lane — policy rate, cut odds, Treasury curve, DXY, credit spreads. Defines cost of capital for everything else. Bullish when rates falling + DXY weakening + spreads tight.',
  'signals-lane-equity':'Equities lane — S&P level, forward P/E, VIX, single-name mega-caps (NVDA, MSTR). Driver of SPX score + secondary read on BTC via MSTR proxy.',
  'signals-lane-crypto':'Crypto Flows lane — on-chain cost basis, ETF flows, funding rates, halving cycle position, MSTR holdings. The core BTC fundamental stack.',
  'signals-lane-reg':   'Regulation lane — CLARITY Act progress, SEC ETF decisions, state BTC reserves, stablecoin bills, FASB accounting. Event-driven; single vote can move BTC 10%+.',
  'signals-lane-geo':   'Geopolitics lane — Iran talks, Ukraine ceasefire, Israel/Gaza, Red Sea attacks, Russia sanctions, Taiwan. Primarily oil-driver; SPX secondary via risk-off spillover.',
  'irgc-control':       'Tracks Iran civilian vs military balance — when the IRGC (Revolutionary Guard) sidelines the elected civilian president, oil prices a direct risk premium and BTC catches a safe-haven bid. Watch indicators: media ban expansions, arrests of reformist figures, cabinet shuffles, and public IRGC-affiliated appointments. When the indicator flips BALANCED → ELEVATED → CRISIS, oil typically moves +$5-15 and BTC +3-6% intraday — precedent: April 2024 strike-escalation chain.',
  'signals-lane-china': 'China lane — GDP, PBoC policy, USD/CNH, tariffs, oil imports. CNH weakening = BTC bid (capital flight). Stronger China demand = oil bid.',
  'signals-lane-oil':   'Oil & Commodities lane — WTI, Brent, OPEC production, SPR refill, EIA inventories, gold. Primary oil-driver stack; gold doubles as BTC correlate (both safe-haven).',

  // ─── News page ───
  'news-risk-high':   'HIGH risk — article contains keywords suggesting imminent market impact (Fed decision, war, major data surprise, regulatory action). Expect near-term volatility; size down or wait.',
  'news-risk-medium': 'MEDIUM risk — relevant news that will influence price over days, not minutes. Worth reading for context; not a trigger on its own.',
  'news-risk-low':    'LOW risk — informational / secondary. Useful for mental model building; don\'t change positioning based on this alone.',
  'news-category':    'Source category: Crypto · Oil · Macro · Geopolitics · Policy. Color-coded so you can filter to the lane you trade.',

  // ─── Prices page ───
  'price-spot':       'Live spot price. Crypto = Coinbase/Binance last trade · equities/futures = Finnhub/Stooq delayed 15-20min during market hours, realtime at close.',
  'price-change':     '24-hour % change vs same time yesterday. Color: bull green = up · bear red = down. Not intraday — compare to your entry, not today\'s open.',
  'price-52w':        '52-week high / low range. Where we are in the range (e.g., 85% = near highs) informs risk: mean-reversion trades favored near extremes, momentum near breakouts.',
  'price-options':    'Options chain with bid/ask/volume/open interest by strike. Wide spreads (bid-ask > 5%) = illiquid, skip. Volume > OI = fresh positioning today · OI > volume = existing positions.',
  'price-watchlist':  'Click the star to save a ticker/option contract to your persistent watchlist (tr_watchlist in localStorage). Survives refresh.',

  // ─── Flights page ───
  'flight-opensky':   'OpenSky Network — free community ADS-B receivers, global coverage, ~30 sec latency. Best for spotting known military callsigns (RCH, HAVEN, BAT, CNV, SPAR) in bulk.',
  'flight-adsbex':    'ADS-B Exchange — no-filter receivers (military aircraft visible, even ones blocked elsewhere). Complementary to OpenSky; cross-reference for confirmation.',
  'flight-callsign':  'Callsign prefix decoded: RCH = Reach (cargo) · HAVEN = Hospital · BAT = AWACS/ISR · CNV = Navy transport · SPAR = VIP · ELF = refueling. Refuelers + ISR buildup = elevated operational tempo.',
  'flight-bbox':      'CENTCOM bounding box (Iran/Gulf/Iraq/Arabian Peninsula). Traffic density here is the Hormuz escalation tell — sustained > 10 military aircraft = oil risk premium.',

  // ─── Impact page ───
  'impact-from-oil':  'BTC price modeled from WTI crude, using historical correlation (~-0.35). Useful to see implied BTC if oil is the dominant macro force. Divergence from live BTC = other factors dominating.',
  'impact-live-model':'Live model — timestamp shows when the calculation last ran (refreshes on each page load). Model uses the latest WTI print + stored correlation, not a forecast.',
  'impact-correlation':'Rolling correlation coefficient. -1 = perfect inverse · 0 = uncorrelated · +1 = moves together. BTC-Oil typically -0.2 to -0.4 (loose inverse). Check whether the relationship is currently holding before trading it.',
};

// The tooltip component. Shows on hover with 150ms delay.
function TRTooltip({ text, children, side = 'top', maxWidth = 280 }) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const ref = React.useRef(null);
  const tRef = React.useRef(null);

  const show = React.useCallback((e) => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ x: r.left + r.width / 2, y: side === 'top' ? r.top : r.bottom, r });
      setOpen(true);
    }, 160);
  }, [side]);
  const hide = React.useCallback(() => {
    if (tRef.current) clearTimeout(tRef.current);
    setOpen(false);
  }, []);

  if (!text) return children;

  return React.createElement(
    'span',
    {
      ref, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
      style: { display: 'inline-flex', alignItems: 'center' },
    },
    children,
    open && coords && React.createElement(
      'div',
      {
        style: {
          position: 'fixed',
          left: Math.max(8, Math.min(coords.x - maxWidth / 2, window.innerWidth - maxWidth - 8)),
          top: side === 'top' ? coords.y - 10 : coords.y + 10,
          transform: side === 'top' ? 'translateY(-100%)' : 'none',
          maxWidth, minWidth: 180,
          background: 'rgba(10,13,19,0.96)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          border: '1px solid rgba(201,162,39,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.05)',
          padding: '10px 13px', borderRadius: 8,
          fontSize: 11, lineHeight: 1.55, color: 'rgba(235,238,244,0.95)',
          fontFamily: '"Inter Tight", InterTight, system-ui, sans-serif',
          letterSpacing: 0.1, textAlign: 'left',
          zIndex: 10000, pointerEvents: 'none',
          animation: 'trFadeIn 140ms cubic-bezier(0.2,0.7,0.2,1)',
          willChange: 'opacity',
        },
      },
      text
    )
  );
}
window.TRTooltip = TRTooltip;

function TRInfoIcon({ text, size = 11 }) {
  if (!text) return null;
  return React.createElement(
    TRTooltip,
    { text },
    React.createElement(
      'span',
      {
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size + 4, height: size + 4, borderRadius: '50%',
          background: 'rgba(201,162,39,0.14)', border: '0.5px solid rgba(201,162,39,0.4)',
          color: '#c9a227', fontSize: size - 1, fontWeight: 700, cursor: 'help',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          marginLeft: 5,
        },
      },
      'i'
    )
  );
}
window.TRInfoIcon = TRInfoIcon;

// Inject CSS keyframes once
(function () {
  if (document.getElementById('tr-explain-styles')) return;
  const s = document.createElement('style');
  s.id = 'tr-explain-styles';
  // Pure opacity fade — the container handles positioning/transform itself
  // (varies by `side` prop), so keyframes stay transform-agnostic.
  s.textContent = `
    @keyframes trFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();
