// ProjectedScreen — Tab 2: BTC-only scenario projection driven by news consensus.
// Each news article carries Claude's $ impact estimate + ChatGPT's $ impact estimate on BTC price.
// Consensus = average of the two. Driver val = recency-weighted consensus $ impact, normalized to 0-100.
// Projected BTC price at horizon = current price + weighted sum of driver impacts.

const psTokens = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A',
  bull: '#4EA076', bear: '#D96B6B',
  claude: '#D97757', // Anthropic orange
  gpt:    '#0077B5', // neutral blue
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// Scoring tier — matches the explainer modal. Returns color + tag for a 0-100 value.
function driverTier(v) {
  if (v <= 25) return { tag: 'BENIGN',   color: '#4EA076' };
  if (v <= 45) return { tag: 'QUIET',    color: 'rgba(180,188,200,0.75)' };
  if (v <= 54) return { tag: 'NEUTRAL',  color: 'rgba(130,138,150,0.55)' };
  if (v <= 74) return { tag: 'ELEVATED', color: '#c9a227' };
  return         { tag: 'HOT',      color: '#D96B6B' };
}

// Per-driver news, BTC-only.
// Each article: claude = Claude's $ impact on BTC. gpt = ChatGPT's $ impact on BTC.
// Consensus displayed = (claude + gpt) / 2, rounded.
const DRIVER_NEWS = {
  'BTC Institutional': [
    { date: '2026-04-19', source: 'Bloomberg',  headline: 'Spot BTC ETFs log 14 straight days of net inflows — IBIT +$8.2B WTD',    url: 'https://www.bloomberg.com/crypto',          claude: +2800, gpt: +2400 },
    { date: '2026-04-17', source: 'CoinDesk',   headline: 'BlackRock files amendment for in-kind creations — approval expected',    url: 'https://www.coindesk.com/',                 claude: +1500, gpt: +1200 },
    { date: '2026-04-14', source: 'The Block',  headline: 'Fidelity, Ark add BTC to 60/40 model portfolios at 3% weight',           url: 'https://www.theblock.co/',                  claude: +2200, gpt: +1900 },
    { date: '2026-04-10', source: 'WSJ',        headline: 'Morgan Stanley PWM green-lights BTC ETFs for all tiers',                 url: 'https://www.wsj.com/finance/currencies',    claude: +1800, gpt: +1600 },
  ],
  'CLARITY Act': [
    { date: '2026-04-18', source: 'Politico',    headline: 'CLARITY Act clears House 294-128 — Senate markup Monday',                 url: 'https://www.politico.com/crypto',           claude: +4500, gpt: +3800 },
    { date: '2026-04-15', source: 'Coin Center', headline: 'Market-structure bill keeps SEC/CFTC split on securities vs commodities', url: 'https://www.coincenter.org/',               claude:  +800, gpt:  +500 },
    { date: '2026-04-11', source: 'Reuters',     headline: 'Thune: "vote in two weeks, not two months" — CLARITY timeline tightens',  url: 'https://www.reuters.com/legal/',            claude: +2200, gpt: +1800 },
  ],
  'Iran / Strait': [
    { date: '2026-04-18', source: 'Reuters',   headline: 'IRGC warns of "proportional response" after Gulf tanker incident',    url: 'https://www.reuters.com/world/middle-east/',        claude: +1200, gpt:  +900 },
    { date: '2026-04-15', source: 'Bloomberg', headline: 'Hormuz insurance premiums spike 40% w/w on escalation chatter',       url: 'https://www.bloomberg.com/markets/commodities',     claude:  +900, gpt:  +700 },
    { date: '2026-04-11', source: 'FT',        headline: 'U.S. Navy deploys second carrier group to CENTCOM AOR',               url: 'https://www.ft.com/world/mideast',                  claude:  +600, gpt:  +400 },
    { date: '2026-04-07', source: 'WSJ',       headline: 'Iran centrifuge count hits 60% HEU-capable threshold — IAEA report',  url: 'https://www.wsj.com/world/middle-east',             claude:  +400, gpt:  +300 },
  ],
  'Federal Reserve': [
    { date: '2026-04-17', source: 'Bloomberg', headline: 'Fed minutes: "most participants" see cut appropriate by Q3 if core PCE holds', url: 'https://www.bloomberg.com/markets/fed', claude: +2400, gpt: +2100 },
    { date: '2026-04-14', source: 'Reuters',   headline: 'Waller turns dovish: "policy is more restrictive than we thought"',       url: 'https://www.reuters.com/markets/us/',                        claude: +1800, gpt: +1500 },
    { date: '2026-04-10', source: 'CNBC',      headline: 'Core PCE prints 2.4% y/y — weakest since 2020',                           url: 'https://www.cnbc.com/fed/',                                  claude: +1200, gpt: +1000 },
  ],
  'Trump Policy': [
    { date: '2026-04-19', source: 'WSJ',       headline: 'White House weighs 25% universal tariff floor ahead of Q3 decisions',    url: 'https://www.wsj.com/politics/policy',   claude:  -600, gpt:  -400 },
    { date: '2026-04-16', source: 'Bloomberg', headline: 'Treasury to ease SLR for banks holding USTs — executive order draft',   url: 'https://www.bloomberg.com/politics',    claude: +1100, gpt:  +800 },
    { date: '2026-04-08', source: 'Politico',  headline: 'Crypto-friendly SEC chair confirmed 54-44 along party lines',             url: 'https://www.politico.com/',             claude: +1600, gpt: +1200 },
  ],
  'Strategic Reserve': [
    { date: '2026-04-19', source: 'Bloomberg', headline: 'Treasury RFP: "budget-neutral pathways" to acquire 200K BTC over 5 yrs', url: 'https://www.bloomberg.com/crypto',        claude: +3200, gpt: +2600 },
    { date: '2026-04-17', source: 'Reuters',   headline: 'Lummis reserve bill adds 13 co-sponsors post-CLARITY momentum',          url: 'https://www.reuters.com/legal/',          claude: +1400, gpt: +1100 },
    { date: '2026-04-14', source: 'Axios',     headline: 'WH digital-asset advisor: "gold is the model" for BTC accumulation',     url: 'https://www.axios.com/crypto',            claude:  +900, gpt:  +700 },
  ],
  'Elon Musk': [
    { date: '2026-04-19', source: 'X / @elonmusk', headline: '"₿" — single-character post triggers 4% spot move in 12 minutes',    url: 'https://x.com/elonmusk',                 claude: +1400, gpt:  +900 },
    { date: '2026-04-16', source: 'Bloomberg',     headline: 'Tesla 10-Q reveals additional BTC add — total now 51,200 coins',     url: 'https://www.bloomberg.com/tesla',        claude: +1100, gpt:  +800 },
    { date: '2026-04-12', source: 'The Block',    headline: 'xAI integrates on-chain attestations — Grok gains native BTC rails',  url: 'https://www.theblock.co/',               claude:  +500, gpt:  +400 },
    { date: '2026-04-09', source: 'Reuters',      headline: 'SpaceX balance-sheet disclosure confirms BTC treasury unchanged',     url: 'https://www.reuters.com/technology/',    claude:   +50, gpt:    +0 },
  ],
};

const NEWS_TODAY = '2026-04-19';
function daysAgo(dateStr) {
  const a = new Date(NEWS_TODAY + 'T00:00:00Z');
  const b = new Date(dateStr    + 'T00:00:00Z');
  return Math.max(0, Math.round((a - b) / 86400000));
}

// Consensus $ impact for an article = average of Claude and GPT.
function consensus(n) { return Math.round((n.claude + n.gpt) / 2); }

// Recency weight — today ≈ 1.0, 5d ≈ 0.37, 10d ≈ 0.14.
function recencyWeight(dateStr) { return Math.exp(-daysAgo(dateStr) / 5); }

// For a driver, weighted consensus $ impact. Sum of (w_i × consensus_i).
// We treat recent articles as strictly more signal — weighted SUM (not average) so a cluster of
// recent bullish items can push the implied value harder than a single stale one.
function driverImpliedDollar(name) {
  const arr = DRIVER_NEWS[name] || [];
  let total = 0;
  for (const n of arr) total += recencyWeight(n.date) * consensus(n);
  return Math.round(total);
}

// Map the $ impact back to a 0-100 slider position. We use each driver's max observed magnitude
// to anchor the scale so every driver's slider feels comparable.
// Calibrated so that a strongly bullish news flow → ~80, balanced → 50, strongly bearish → ~20.
function dollarToScore(dollars, scale = 8000) {
  // scale is the $ value that maps to 100 (clamped). -scale → 0. 0 → 50.
  const clamped = Math.max(-scale, Math.min(scale, dollars));
  return Math.round(50 + (clamped / scale) * 50);
}

// Driver weights — how much of each driver's implied impact flows into the BTC projection.
// Sums to 1.0. Multiply a driver's weighted consensus $ impact by its weight and sum to get
// the delta from today's BTC price.
const DRIVER_WEIGHTS = {
  'BTC Institutional': 0.28,
  'CLARITY Act':       0.23,
  'Iran / Strait':     0.20,
  'Federal Reserve':   0.14,
  'Trump Policy':      0.08,
  'Strategic Reserve': 0.04,
  'Elon Musk':         0.03,
};

// Horizon multiplier — the news impact compounds over the projection window.
// News provides the 0-90d signal; we extrapolate out to year-end.
const HORIZON_MULT = 4.2;

const BTC_PRICE_NOW = 95400;

function ProjectedScreen({ onNav }) {
  const T = psTokens;
  const W = 1280, H = 820;

  const [drivers, setDrivers] = React.useState([
    { name: 'BTC Institutional', low: 'Outflows',     high: 'Heavy Inflows',  val: dollarToScore(driverImpliedDollar('BTC Institutional')) },
    { name: 'CLARITY Act',       low: 'Stalled',      high: 'Passed',         val: dollarToScore(driverImpliedDollar('CLARITY Act')) },
    { name: 'Iran / Strait',     low: 'Strait Open',  high: 'Strait Closed',  val: dollarToScore(driverImpliedDollar('Iran / Strait')) },
    { name: 'Federal Reserve',   low: 'Hawkish',      high: 'Dovish',         val: dollarToScore(driverImpliedDollar('Federal Reserve')) },
    { name: 'Trump Policy',      low: 'Steady',       high: 'Volatile',       val: dollarToScore(driverImpliedDollar('Trump Policy')) },
    { name: 'Strategic Reserve', low: 'No Action',    high: 'Active Buying',  val: dollarToScore(driverImpliedDollar('Strategic Reserve')) },
    { name: 'Elon Musk',         low: 'Silent',       high: 'Active',         val: dollarToScore(driverImpliedDollar('Elon Musk')) },
  ]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [dragIdx, setDragIdx] = React.useState(null);
  const [showScoring, setShowScoring] = React.useState(false);
  const [readSet, setReadSet] = React.useState(() => new Set());
  // Accordion: which driver's news panel is expanded. Default to highest-weight driver (BTC Institutional).
  const [expandedDriver, setExpandedDriver] = React.useState('BTC Institutional');

  // News auto-refresh every 5 minutes. (Data is hardcoded; we stamp & re-render.)
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [lastRefresh, setLastRefresh] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => {
      setRefreshTick(t => t + 1);
      setLastRefresh(new Date());
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  // Tick the "Xs ago" pill every 15s without re-pulling.
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => forceTick(x => x + 1), 15 * 1000);
    return () => clearInterval(id);
  }, []);
  const refreshAgo = (() => {
    const s = Math.max(0, Math.round((Date.now() - lastRefresh.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    return `${m}m ago`;
  })();

  const MAX_WEIGHT = 0.28;

  // Compute BTC projection from current drivers + weights.
  // driver val 0..100 → signed contribution ((val-50)/50) × weight × $scale
  // Use a per-driver $scale proportional to its typical magnitude.
  const projection = React.useMemo(() => {
    let dollarDelta = 0;
    let volDollar = 0;
    drivers.forEach(d => {
      const w = DRIVER_WEIGHTS[d.name] || 0;
      const signed = (d.val - 50) / 50; // -1..+1
      const perDriverScale = 45000;      // full-extreme single-driver BTC impact
      dollarDelta += signed * w * perDriverScale * HORIZON_MULT / 4.2;
      volDollar   += Math.abs(signed) * w * perDriverScale * 0.35;
    });
    const baseDelta = dollarDelta * HORIZON_MULT;
    const spread = 12000 + volDollar * HORIZON_MULT;
    const base = BTC_PRICE_NOW + baseDelta;
    const bull = base + spread;
    const bear = base - spread * 1.55 - 6000;
    return { baseDelta, base, bull, bear, spread };
  }, [drivers]);

  // Build fan arrays over 80 steps
  const fanX = 40, fanY = 40, fanW = 600, fanH = 240;
  const N = 80;
  const baseArr = [], bullArr = [], bearArr = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const drift = projection.baseDelta * t;
    const wobble = Math.sin(t * 3.1) * 800;
    const widen  = projection.spread * t;
    baseArr.push(BTC_PRICE_NOW + drift + wobble);
    bullArr.push(BTC_PRICE_NOW + drift + widen);
    bearArr.push(BTC_PRICE_NOW + drift - widen * 1.55 - 6000 * t);
  }
  const allVals = [...bullArr, ...bearArr, BTC_PRICE_NOW];
  const dataMin = Math.min(...allVals), dataMax = Math.max(...allVals);
  const pad = (dataMax - dataMin) * 0.15;
  const yMin = dataMin - pad, yMax = dataMax + pad;
  const yTo = (v) => fanY + fanH - ((v - yMin) / (yMax - yMin)) * fanH;
  const xTo = (i) => fanX + (i / (N - 1)) * fanW;
  const pathFrom = (arr) => {
    let d = `M ${xTo(0).toFixed(1)} ${yTo(arr[0]).toFixed(1)}`;
    for (let i = 1; i < arr.length; i++) d += ` L ${xTo(i).toFixed(1)} ${yTo(arr[i]).toFixed(1)}`;
    return d;
  };
  const areaFrom = (top, bot) => {
    let d = `M ${xTo(0).toFixed(1)} ${yTo(top[0]).toFixed(1)}`;
    for (let i = 1; i < top.length; i++) d += ` L ${xTo(i).toFixed(1)} ${yTo(top[i]).toFixed(1)}`;
    for (let i = bot.length - 1; i >= 0; i--) d += ` L ${xTo(i).toFixed(1)} ${yTo(bot[i]).toFixed(1)}`;
    return d + ' Z';
  };
  const yGrid = [];
  const gStep = (yMax - yMin) / 5;
  for (let i = 0; i <= 5; i++) yGrid.push(yMin + gStep * i);
  const xTicks = [
    { i: 0,  label: 'NOW' },
    { i: 16, label: 'JUN 26' },
    { i: 33, label: 'AUG 26' },
    { i: 50, label: 'OCT 26' },
    { i: 66, label: 'DEC 26' },
    { i: 79, label: 'END' },
  ];
  const fmtK = (v) => `$${(v/1000).toFixed(0)}k`;
  const fmtDollar = (v) => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString();

  // Driver interaction
  const trackRefs = React.useRef({});
  const setDriverVal = (idx, val) => {
    setDrivers(prev => prev.map((d, i) => i === idx ? { ...d, val: Math.max(0, Math.min(100, Math.round(val))) } : d));
  };
  const valFromEvent = (idx, e) => {
    const el = trackRefs.current[idx];
    if (!el) return 50;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    return Math.max(0, Math.min(100, (x / r.width) * 100));
  };
  const handlePointerDown = (idx) => (e) => {
    e.preventDefault();
    setDragIdx(idx);
    setActiveIdx(idx);
    setDriverVal(idx, valFromEvent(idx, e));
    const move = (ev) => setDriverVal(idx, valFromEvent(idx, ev));
    const up = () => {
      setDragIdx(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const handleKeyDown = (idx) => (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { e.preventDefault(); setDriverVal(idx, drivers[idx].val + (e.shiftKey ? 10 : 1)); setActiveIdx(idx); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { e.preventDefault(); setDriverVal(idx, drivers[idx].val - (e.shiftKey ? 10 : 1)); setActiveIdx(idx); }
    if (e.key === 'Home') { e.preventDefault(); setDriverVal(idx, 0); }
    if (e.key === 'End')  { e.preventDefault(); setDriverVal(idx, 100); }
  };

  // LIVE — multi-LLM projection narrative. Builds a hybrid prompt combining
  // current driver slider values + real recent news headlines, fans out to
  // Claude + ChatGPT + Gemini + Perplexity, returns consensus summary.
  const driverSignature = drivers.map(d => `${d.name.slice(0, 3)}${d.val}`).join(',');
  const { data: proj, loading: projLoading } = (window.useAutoUpdate || (() => ({})))(
    `projected-llm-${driverSignature}`,
    async () => {
      if (typeof AIAnalysis === 'undefined') return null;
      const keys = AIAnalysis.getKeys();
      if (!keys.claude && !keys.openai && !keys.gemini) return null;

      // Driver-regime prompt: compact label tier for each driver so the model
      // sees BOTH the numeric position AND the qualitative tag.
      const driverPrompt = {
        source: 'TradeRadar Driver Regime',
        title:
          'Driver state: ' +
          drivers.map(d => `${d.name}=${d.val}/100 (${driverTier(d.val).tag})`).join(', ') +
          '. Project BTC price through Dec 2026 base/bull/bear.',
      };

      // Fetch real recent headlines and append. Fail silent → synthetic only.
      let combined = [driverPrompt];
      try {
        if (typeof NewsFeed !== 'undefined' && NewsFeed && typeof NewsFeed.fetchAll === 'function') {
          const headlines = await NewsFeed.fetchAll();
          if (Array.isArray(headlines) && headlines.length) {
            const recent = headlines.slice(0, 10).map(h => ({
              source: h.source || 'News',
              title: h.title || '',
            }));
            combined = [driverPrompt, ...recent];
          }
        }
      } catch (_e) {
        // fall back to driver-only prompt
      }

      return await AIAnalysis.runMulti(combined, { full: true });
    },
    { refreshKey: 'projected' }
  );

  // Narrative
  const regime = (() => {
    const inst = drivers.find(d => d.name === 'BTC Institutional').val;
    const fed  = drivers.find(d => d.name === 'Federal Reserve').val;
    const clarity = drivers.find(d => d.name === 'CLARITY Act').val;
    if (inst > 65 && fed > 55 && clarity > 55) return 'risk-on-with-tail';
    if (fed < 40) return 'defensive';
    if (inst > 70) return 'liquidity-led';
    return 'mixed-regime';
  })();
  const regimePhrase = {
    'risk-on-with-tail': 'risk-on-with-tail',
    'defensive': 'defensive / cash-heavy',
    'liquidity-led': 'liquidity-led rally',
    'mixed-regime': 'mixed / sideways',
  }[regime];

  const activeDriverImplied = driverImpliedDollar(drivers[activeIdx].name);

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
      userSelect: dragIdx !== null ? 'none' : 'auto',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`,
        background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="Global Gauntlet"
        style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
      <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>

        <TRTabBar current="projected" onNav={onNav} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <TRLiveStripInline />
          <TRGearInline />
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; BITCOIN · LIVE NEWS-DRIVEN MODEL
          </div>
          <div onClick={() => window.openTRSettings && window.openTRSettings()} title="Settings · refresh · API keys" style={{
            width: 28, height: 28, borderRadius: 7, background: T.ink200,
            border: `1px solid ${T.edge}`, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center', gap: 3, cursor: 'pointer',
          }}>
            <div style={{ width: 12, height: 1, background: T.textMid }} />
            <div style={{ width: 12, height: 1, background: T.textMid }} />
            <div style={{ width: 12, height: 1, background: T.textMid }} />
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', height: H - 52 }}>

        {/* LEFT — Drivers */}
        <div style={{
          width: 400, background: T.ink100, borderRight: `1px solid ${T.edge}`,
          padding: '16px 18px 0', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
            <div style={{
              fontSize: 10, letterSpacing: 1, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500,
            }}>Drivers</div>
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setShowScoring(true); }}
              title="How is each driver scored?"
              style={{
                marginLeft: 8, width: 16, height: 16, padding: 0,
                border: `1px solid ${T.edge}`, borderRadius: 8,
                background: T.ink200, color: T.textMid,
                fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                lineHeight: 1, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>i</button>
            <div style={{
              marginLeft: 'auto', fontSize: 9.5, letterSpacing: 0.5, color: T.textDim,
              fontFamily: T.mono,
            }}>DRAG · ← → · SHIFT ±10</div>
          </div>
          <div style={{
            fontSize: 15, fontWeight: 500, color: T.text,
            letterSpacing: -0.2, marginBottom: 14,
          }}>7 drivers · news-implied scores</div>

          <div data-walk="driver-accordion" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, overflowY: 'auto', flex: 1 }}>
            {drivers.map((d, idx) => {
              const active = idx === activeIdx;
              const isOpen = expandedDriver === d.name;
              const tier = driverTier(d.val);
              const weight = DRIVER_WEIGHTS[d.name] || 0;
              const barW = (weight / MAX_WEIGHT) * 100;
              const implied = driverImpliedDollar(d.name);
              return (
                <div key={d.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Accordion header — driver tile */}
                  <div
                    onClick={() => {
                      setActiveIdx(idx);
                      setExpandedDriver(isOpen ? null : d.name);
                    }}
                    style={{
                      background: isOpen ? T.ink200 : T.ink100,
                      border: `1px solid ${isOpen ? T.signal + '55' : T.edge}`,
                      borderRadius: 8, padding: '10px 14px',
                      boxShadow: isOpen ? `0 0 0 1px rgba(201,162,39,0.12), inset 0 0.5px 0 rgba(255,255,255,0.06)` : 'none',
                      cursor: 'pointer',
                      transition: 'background 160ms cubic-bezier(0.2,0.7,0.2,1), border-color 160ms cubic-bezier(0.2,0.7,0.2,1)',
                    }}
                    onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = T.ink200; }}
                    onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = T.ink100; }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: T.text }}>{d.name}</div>
                      <div style={{
                        marginLeft: 8, fontFamily: T.mono, fontSize: 8.5, fontWeight: 600,
                        letterSpacing: 0.8, color: tier.color,
                      }}>{tier.tag}</div>
                      <div style={{
                        marginLeft: 'auto', fontFamily: T.mono, fontSize: 12,
                        fontWeight: 500, color: active ? T.signal : T.textMid,
                        padding: '2px 8px', borderRadius: 5,
                        background: active ? 'rgba(232,184,74,0.12)' : T.ink100,
                        border: `0.5px solid ${active ? 'rgba(232,184,74,0.3)' : T.edge}`,
                        letterSpacing: 0.3,
                        minWidth: 32, textAlign: 'center',
                      }}>{d.val}</div>
                      <div style={{
                        marginLeft: 10, fontFamily: T.mono, fontSize: 12,
                        color: T.textMid, width: 12, textAlign: 'center',
                        transition: 'transform 160ms cubic-bezier(0.2,0.7,0.2,1)',
                      }}>{isOpen ? '▾' : '▸'}</div>
                    </div>

                    {/* Weight bar */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                    }}>
                      <div style={{
                        fontFamily: T.mono, fontSize: 8.5, color: T.textDim,
                        letterSpacing: 0.6, fontWeight: 600, width: 44,
                      }}>WEIGHT</div>
                      <div style={{
                        flex: 1, height: 4, background: 'rgba(255,255,255,0.04)',
                        borderRadius: 2, overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${barW}%`,
                          background: isOpen ? T.signal : 'rgba(232,184,74,0.5)',
                          borderRadius: 2,
                          transition: 'width 200ms ease, background 140ms ease',
                        }} />
                      </div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 10, color: isOpen ? T.signal : T.textMid,
                        fontWeight: 500, letterSpacing: 0.3, width: 32, textAlign: 'right',
                      }}>{Math.round(weight * 100)}%</div>
                    </div>

                    {/* News-implied $ readout */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    }}>
                      <div style={{
                        fontFamily: T.mono, fontSize: 8.5, color: T.textDim,
                        letterSpacing: 0.6, fontWeight: 600, width: 44,
                      }}>NEWS</div>
                      <div style={{
                        flex: 1, fontSize: 10.5, color: T.textMid, letterSpacing: 0.01,
                      }}>
                        Consensus $ from {(DRIVER_NEWS[d.name] || []).length} articles
                      </div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 11, fontWeight: 600,
                        color: implied > 0 ? T.bull : implied < 0 ? T.bear : T.textMid,
                        letterSpacing: 0.3,
                      }}>{fmtDollar(implied)}</div>
                    </div>

                    {/* Slider */}
                    <div
                      ref={el => trackRefs.current[idx] = el}
                      onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(idx)(e); }}
                      onClick={(e) => e.stopPropagation()}
                      tabIndex={0}
                      onKeyDown={handleKeyDown(idx)}
                      role="slider"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={d.val}
                      aria-label={d.name}
                      style={{
                        position: 'relative', height: 20, marginBottom: 6,
                        cursor: 'pointer', touchAction: 'none',
                        outline: 'none',
                      }}>
                      <div style={{
                        position: 'absolute', top: 9, left: 0, right: 0, height: 2,
                        background: 'rgba(255,255,255,0.06)', borderRadius: 1,
                      }} />
                      <div style={{
                        position: 'absolute', top: 9, left: 0, width: `${d.val}%`, height: 2,
                        background: tier.color,
                        opacity: active ? 1 : 0.55,
                        borderRadius: 1,
                        transition: dragIdx === idx ? 'none' : 'width 120ms ease, background 140ms ease',
                      }} />
                      <div style={{
                        position: 'absolute', top: 3, left: `calc(${d.val}% - 7px)`,
                        width: 14, height: 14, borderRadius: 7,
                        background: tier.color,
                        boxShadow: active
                          ? `0 0 0 4px ${tier.color}26, 0 2px 4px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.3)`
                          : '0 2px 4px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.3)',
                        transition: dragIdx === idx ? 'none' : 'left 120ms ease, background 140ms ease, box-shadow 140ms ease',
                      }} />
                    </div>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4,
                      pointerEvents: 'none',
                    }}>
                      <span>{d.low.toUpperCase()}</span>
                      <span>{d.high.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Accordion body — news for this driver */}
                  {isOpen && (
                    <div style={{
                      background: T.ink100, border: `1px solid ${T.edge}`,
                      borderRadius: 8, padding: '10px 12px',
                      display: 'flex', flexDirection: 'column', gap: 5,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontFamily: T.mono, fontSize: 9, color: T.textDim,
                        letterSpacing: 0.5, marginBottom: 2,
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.claude }} />CLAUDE
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.gpt }} />GPT
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#4EA076' }} />NEW
                        </span>
                        <span style={{ marginLeft: 'auto' }}>DBL-CLICK TO OPEN</span>
                      </div>
                      {(DRIVER_NEWS[d.name] || []).map((n, i) => {
                        const isRead = readSet.has(n.url);
                        const isNew = n.date === NEWS_TODAY;
                        const sourceColor = isRead ? T.signal : (isNew ? '#4EA076' : T.textMid);
                        const cons = consensus(n);
                        return (
                          <div key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadSet(prev => { const next = new Set(prev); next.add(n.url); return next; });
                            }}
                            onDoubleClick={(e) => { e.stopPropagation(); window.open(n.url, '_blank', 'noopener,noreferrer'); }}
                            title={`Double-click to open — ${n.source}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '46px 72px 1fr 46px 46px 50px',
                              gap: 6, alignItems: 'baseline',
                              padding: '6px 8px',
                              background: T.ink200,
                              border: `0.5px solid ${T.edge}`,
                              borderRadius: 6, cursor: 'pointer', userSelect: 'none',
                              transition: 'background 140ms ease, border-color 140ms ease',
                            }}>
                            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3 }}>
                              {n.date.slice(5)}
                            </div>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              fontFamily: T.mono, fontSize: 9.5, color: sourceColor, fontWeight: 500,
                              letterSpacing: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {isNew && !isRead && <span style={{
                                width: 5, height: 5, borderRadius: 3, background: '#4EA076',
                                boxShadow: '0 0 5px rgba(78,160,118,0.8)', flexShrink: 0,
                              }} />}
                              {n.source}
                            </div>
                            <div style={{ fontSize: 10.5, color: T.text, lineHeight: 1.35 }}>{n.headline}</div>
                            <div style={{
                              fontFamily: T.mono, fontSize: 9.5, fontWeight: 500, color: T.claude,
                              textAlign: 'right', letterSpacing: 0.3,
                            }}>{fmtDollar(n.claude)}</div>
                            <div style={{
                              fontFamily: T.mono, fontSize: 9.5, fontWeight: 500, color: T.gpt,
                              textAlign: 'right', letterSpacing: 0.3,
                            }}>{fmtDollar(n.gpt)}</div>
                            <div style={{
                              fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                              color: cons > 0 ? T.bull : cons < 0 ? T.bear : T.textMid,
                              textAlign: 'right', letterSpacing: 0.3,
                            }}>{fmtDollar(cons)}</div>
                          </div>
                        );
                      })}
                      {(!DRIVER_NEWS[d.name] || DRIVER_NEWS[d.name].length === 0) && (
                        <div style={{
                          padding: 8, fontSize: 10.5, color: T.textDim,
                          textAlign: 'center', fontStyle: 'italic',
                        }}>No recent items tagged to this driver.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Chart + Narrative + News */}
        <div style={{
          flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column',
          background: T.ink000, overflow: 'hidden', minWidth: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{
              fontSize: 10, letterSpacing: 1, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500,
            }}>Bitcoin Projection</div>
            <div style={{
              marginLeft: 'auto', display: 'flex', gap: 10, fontFamily: T.mono, fontSize: 11,
              color: T.textMid,
            }}>
              <span>BASE <span style={{ color: T.btc }}>{fmtK(projection.base)}</span></span>
              <span style={{ color: T.textDim }}>·</span>
              <span>BULL <span style={{ color: T.bull }}>{fmtK(projection.bull)}</span></span>
              <span style={{ color: T.textDim }}>·</span>
              <span>BEAR <span style={{ color: T.bear }}>{fmtK(projection.bear)}</span></span>
            </div>
          </div>
          <div style={{
            fontSize: 18, fontWeight: 500, color: T.text, letterSpacing: -0.3,
            marginBottom: 10,
          }}>
            BTC through Dec 2026{'  '}
            <span style={{
              fontFamily: T.mono, fontSize: 12, color: T.textMid, marginLeft: 8, fontWeight: 400,
            }}>
              {projection.baseDelta >= 0 ? '+' : ''}{Math.round(projection.baseDelta / 1000)}k base move
            </span>
          </div>

          {/* Fan chart */}
          <div style={{
            background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
            padding: 10, marginBottom: 10, flexShrink: 0,
          }}>
            <svg width={fanW + 60} height={fanH + 60}>
              {yGrid.map((v, gi) => {
                const y = yTo(v);
                return (
                  <g key={gi}>
                    <line x1={fanX} y1={y} x2={fanX + fanW} y2={y}
                          stroke="rgba(255,255,255,0.04)" strokeWidth={0.5}
                          strokeDasharray="2,3" />
                    <text x={fanX - 8} y={y + 3} fill={T.textDim}
                          fontFamily={T.mono} fontSize={9.5} textAnchor="end">
                      {fmtK(v)}
                    </text>
                  </g>
                );
              })}
              <line x1={fanX} y1={yTo(BTC_PRICE_NOW)} x2={fanX + fanW} y2={yTo(BTC_PRICE_NOW)}
                    stroke={T.textMid} strokeWidth={0.5} strokeDasharray="1,4" />
              <text x={fanX + fanW + 4} y={yTo(BTC_PRICE_NOW) + 3}
                    fill={T.textMid} fontFamily={T.mono} fontSize={10}>
                NOW
              </text>
              <path d={areaFrom(bullArr, bearArr)} fill={T.btc} fillOpacity={0.08} />
              <path d={areaFrom(
                baseArr.map((v, i) => v + (bullArr[i] - v) * 0.45),
                baseArr.map((v, i) => v - (v - bearArr[i]) * 0.45)
              )} fill={T.btc} fillOpacity={0.15} />
              <path d={pathFrom(bullArr)} fill="none" stroke={T.bull} strokeWidth={1}
                    strokeOpacity={0.7} strokeDasharray="3,3" />
              <path d={pathFrom(bearArr)} fill="none" stroke={T.bear} strokeWidth={1}
                    strokeOpacity={0.7} strokeDasharray="3,3" />
              <path d={pathFrom(baseArr)} fill="none" stroke={T.btc} strokeWidth={1.75}
                    strokeLinecap="round" />
              <circle cx={xTo(N - 1)} cy={yTo(bullArr[N - 1])} r={3} fill={T.bull} />
              <text x={xTo(N - 1) + 8} y={yTo(bullArr[N - 1]) + 3}
                    fill={T.bull} fontFamily={T.mono} fontSize={10.5} fontWeight={500}>
                {fmtK(bullArr[N - 1])}
              </text>
              <circle cx={xTo(N - 1)} cy={yTo(baseArr[N - 1])} r={3} fill={T.btc} />
              <text x={xTo(N - 1) + 8} y={yTo(baseArr[N - 1]) + 3}
                    fill={T.btc} fontFamily={T.mono} fontSize={11} fontWeight={500}>
                {fmtK(baseArr[N - 1])}
              </text>
              <circle cx={xTo(N - 1)} cy={yTo(bearArr[N - 1])} r={3} fill={T.bear} />
              <text x={xTo(N - 1) + 8} y={yTo(bearArr[N - 1]) + 3}
                    fill={T.bear} fontFamily={T.mono} fontSize={10.5} fontWeight={500}>
                {fmtK(bearArr[N - 1])}
              </text>
              {xTicks.map(t => (
                <text key={t.i} x={xTo(t.i)} y={fanY + fanH + 16} fill={T.textDim}
                      fontFamily={T.mono} fontSize={9.5} textAnchor="middle" letterSpacing={0.5}>
                  {t.label}
                </text>
              ))}
            </svg>
          </div>

          {/* Narrative */}
          <div style={{
            background: T.ink100, border: `1px solid ${T.edge}`,
            borderRadius: 10, padding: '10px 14px 12px', marginBottom: 10, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5,
                background: 'linear-gradient(180deg, rgba(232,184,74,0.2) 0%, rgba(232,184,74,0.05) 100%)',
                border: `0.5px solid rgba(232,184,74,0.3)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: 3, background: T.signal,
                  boxShadow: `0 0 6px ${T.signal}`,
                }} />
              </div>
              <div style={{
                fontSize: 10, letterSpacing: 1, color: T.textMid,
                textTransform: 'uppercase', fontWeight: 500,
              }}>Narrative · Live Model</div>
            </div>
            <div style={{
              fontSize: 12, lineHeight: 1.55, color: T.text, letterSpacing: 0.02,
              fontWeight: 400, fontStyle: 'italic',
            }}>
              Consensus news flow implies a{' '}
              <span style={{ color: T.signal, fontWeight: 500 }}>{regimePhrase}</span>{' '}
              regime for BTC. Base case prints{' '}
              <span style={{ color: T.btc, fontWeight: 500, fontFamily: T.mono }}>{fmtK(projection.base)}</span>{' '}
              by Dec '26 ({projection.baseDelta >= 0 ? '+' : ''}${Math.round(projection.baseDelta).toLocaleString()} from spot).
              Bull path:{' '}
              <span style={{ color: T.bull, fontWeight: 500, fontFamily: T.mono }}>{fmtK(projection.bull)}</span>{' '}
              on continued ETF bid plus dovish Fed. Bear floor:{' '}
              <span style={{ color: T.bear, fontWeight: 500, fontFamily: T.mono }}>{fmtK(projection.bear)}</span>{' '}
              if CLARITY stalls and institutional flows reverse.
            </div>

            {/* Triple-LLM live overlay — renders when any model responded */}
            {proj && proj.consensus && (
              <div style={{
                marginTop: 10, padding: '10px 12px',
                background: proj.consensus.agree ? 'rgba(78,160,118,0.08)' : 'rgba(217,107,107,0.08)',
                border: `0.5px solid ${proj.consensus.agree ? 'rgba(78,160,118,0.4)' : 'rgba(217,107,107,0.4)'}`,
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: 0.8,
                    color: proj.consensus.agree ? T.bull : T.bear,
                  }}>
                    LIVE · {proj.consensus.modelCount} LLMs · {proj.consensus.label}
                  </div>
                  <div style={{
                    marginLeft: 'auto', fontFamily: T.mono, fontSize: 9,
                    color: T.textDim, letterSpacing: 0.3,
                  }}>CONF {proj.consensus.avgConfidence}/10</div>
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.55, color: T.textMid }}>
                  {proj.consensus.summary}
                </div>
              </div>
            )}
            {projLoading && !proj && (
              <div style={{
                marginTop: 10, fontFamily: T.mono, fontSize: 9.5, color: T.textDim,
                letterSpacing: 0.6,
              }}>ANALYZING DRIVERS ACROSS CLAUDE + GPT + GEMINI…</div>
            )}
          </div>

          {/* Live news-refresh indicator */}
          <div
            title={`News auto-refreshes every 5 minutes. Last pulled ${lastRefresh.toLocaleTimeString()}`}
            style={{
              alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px',
              background: 'rgba(78,160,118,0.1)',
              border: `0.5px solid rgba(78,160,118,0.3)`,
              borderRadius: 5,
              fontFamily: T.mono, fontSize: 9, color: T.bull, letterSpacing: 0.3,
              fontWeight: 500, marginTop: 4,
            }}>
            <span style={{
              width: 5, height: 5, borderRadius: 3, background: T.bull,
              boxShadow: `0 0 5px rgba(78,160,118,0.9)`,
              animation: 'tw-pulse 1.8s ease-in-out infinite',
            }} />
            LIVE · {refreshAgo}
          </div>
        </div>
      </div>

      {/* Scoring explainer modal */}
      {showScoring && (
        <div
          onClick={() => setShowScoring(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(3,5,8,0.72)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40,
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 760, maxHeight: '100%',
              background: T.ink100, border: `1px solid ${T.edgeHi}`,
              borderRadius: 14, padding: '28px 32px 24px',
              boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column', gap: 16,
              overflow: 'hidden',
            }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: T.signal,
                textTransform: 'uppercase', fontWeight: 600,
              }}>Scoring · How drivers work</div>
              <button type="button"
                onClick={() => setShowScoring(false)}
                title="Close"
                style={{
                  marginLeft: 'auto', width: 26, height: 26, padding: 0,
                  border: `1px solid ${T.edge}`, borderRadius: 7,
                  background: T.ink200, color: T.textMid, cursor: 'pointer',
                  fontSize: 14, lineHeight: 1,
                }}>×</button>
            </div>

            <div style={{
              fontSize: 22, fontWeight: 500, color: T.text,
              letterSpacing: -0.3, lineHeight: 1.25,
            }}>Each article carries a Claude $ and a ChatGPT $. Consensus drives the driver.</div>

            <div style={{
              fontSize: 13, lineHeight: 1.6, color: T.textMid, letterSpacing: 0.01,
            }}>
              Every news item is independently scored by <span style={{ color: T.claude }}>Claude</span>{' '}
              and <span style={{ color: T.gpt }}>ChatGPT</span> for its expected{' '}
              <span style={{ color: T.text }}>$ impact on BTC</span>. The displayed{' '}
              <span style={{ color: T.text }}>consensus</span> is the average. Articles are aggregated
              per driver with a <span style={{ color: T.text }}>recency weight</span> — today &asymp; 1.0,
              5 days &asymp; 0.37, 10 days &asymp; 0.14 — producing the driver's implied $ impact.
              That value maps to the 0&ndash;100 slider position and then flows, multiplied by the driver's
              weight, into the BTC projection.
            </div>

            <div style={{
              background: T.ink200, border: `1px solid ${T.edge}`,
              borderRadius: 10, padding: '14px 16px',
            }}>
              <div style={{
                fontSize: 9.5, letterSpacing: 0.9, color: T.textDim,
                textTransform: 'uppercase', fontWeight: 600, marginBottom: 10,
              }}>Range anchors · 0 · 50 · 100</div>
              {[
                { label: '0–25',   tag: 'BENIGN',   c: '#4EA076',
                  body: "Heavy bearish consensus \u2014 articles net out sharply negative. Driver acts as a tail risk to the projection." },
                { label: '25–45',  tag: 'QUIET',    c: T.textMid,
                  body: "Slightly negative. Articles lean bearish but not aggressively." },
                { label: '46–54',  tag: 'NEUTRAL',  c: T.textDim,
                  body: "Balanced. Article $ impacts cancel; driver contributes ~0 to the projection." },
                { label: '55–74',  tag: 'ELEVATED', c: T.signal,
                  body: "Bullish tilt. Consensus $ impact is positive; driver starts to dominate the scenario." },
                { label: '75–100', tag: 'HOT',      c: '#D96B6B',
                  body: "Strong bullish regime. Maximum consensus $. Fan widens, narrative flips to this driver." },
              ].map(r => (
                <div key={r.label} style={{
                  display: 'grid', gridTemplateColumns: '70px 92px 1fr',
                  gap: 14, padding: '7px 0',
                  borderBottom: `0.5px solid ${T.edge}`,
                }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 11, color: T.text,
                    fontWeight: 500, letterSpacing: 0.3,
                  }}>{r.label}</div>
                  <div style={{
                    fontFamily: T.mono, fontSize: 10, letterSpacing: 0.8,
                    color: r.c, fontWeight: 600,
                  }}>{r.tag}</div>
                  <div style={{
                    fontSize: 11.5, color: T.textMid, lineHeight: 1.5,
                  }}>{r.body}</div>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
              fontSize: 11, color: T.textDim, letterSpacing: 0.01,
            }}>
              <span style={{ color: T.signal, fontSize: 13 }}>●</span>
              Drag a slider to manually override the news-implied value. Shift + arrow snaps ±10.
              Double-click an article to open its source in a new tab.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.ProjectedScreen = ProjectedScreen;
