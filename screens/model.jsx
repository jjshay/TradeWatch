// ModelScreen — Merged "Model" tab (replaces Projected + Impact).
// Primary: BTC news-driven scenario projection (fan chart, drivers, multi-LLM).
// Collapsible bottom section: Oil → BTC two-stage cross-asset model.
//
// Scoring logic is identical to the original two screens — nothing here has
// changed the math, only the layout.

const modelTokens = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A',
  oil: '#9AA3B0',
  bull: '#4EA076', bear: '#D96B6B',
  claude: '#D97757',
  gpt:    '#0077B5',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

function modelDriverTier(v) {
  if (v <= 25) return { tag: 'BENIGN',   color: '#4EA076' };
  if (v <= 45) return { tag: 'QUIET',    color: 'rgba(180,188,200,0.75)' };
  if (v <= 54) return { tag: 'NEUTRAL',  color: 'rgba(130,138,150,0.55)' };
  if (v <= 74) return { tag: 'ELEVATED', color: '#c9a227' };
  return         { tag: 'HOT',      color: '#D96B6B' };
}

// ============================================================================
// STAGE 1 — BTC Projection (from projected.jsx)
// ============================================================================

const MODEL_DRIVER_NEWS = {
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

const MODEL_TODAY = '2026-04-19';
function modelDaysAgo(dateStr) {
  const a = new Date(MODEL_TODAY + 'T00:00:00Z');
  const b = new Date(dateStr    + 'T00:00:00Z');
  return Math.max(0, Math.round((a - b) / 86400000));
}
function modelConsensus(n) { return Math.round((n.claude + n.gpt) / 2); }
function modelRecencyWeight(dateStr) { return Math.exp(-modelDaysAgo(dateStr) / 5); }
function modelDriverImpliedDollar(name) {
  const arr = MODEL_DRIVER_NEWS[name] || [];
  let total = 0;
  for (const n of arr) total += modelRecencyWeight(n.date) * modelConsensus(n);
  return Math.round(total);
}
function modelDollarToScore(dollars, scale = 8000) {
  const clamped = Math.max(-scale, Math.min(scale, dollars));
  return Math.round(50 + (clamped / scale) * 50);
}

const MODEL_DRIVER_WEIGHTS = {
  'BTC Institutional': 0.28,
  'CLARITY Act':       0.23,
  'Iran / Strait':     0.20,
  'Federal Reserve':   0.14,
  'Trump Policy':      0.08,
  'Strategic Reserve': 0.04,
  'Elon Musk':         0.03,
};

const MODEL_HORIZON_MULT = 4.2;
const MODEL_BTC_PRICE_NOW = 95400;

// ============================================================================
// STAGE 2 — Oil → BTC cross-asset (from impact.jsx)
// ============================================================================

const OIL_PRICE_NOW = 78.40;

const OIL_DRIVER_NEWS = {
  'Iran / Strait': [
    { date: '2026-04-19', source: 'Reuters',   headline: 'IRGC warns "any action" against proxies will close Hormuz',                url: 'https://www.reuters.com/world/middle-east/',    claude: +9.20, gpt: +7.80 },
    { date: '2026-04-17', source: 'Bloomberg', headline: 'Hormuz tanker war risk premium hits 5-year high',                          url: 'https://www.bloomberg.com/markets/commodities', claude: +4.80, gpt: +3.90 },
    { date: '2026-04-12', source: 'FT',        headline: 'U.S. 5th Fleet moves second carrier group to Gulf',                        url: 'https://www.ft.com/world/mideast',              claude: +2.10, gpt: +1.70 },
    { date: '2026-04-08', source: 'WSJ',       headline: 'Iran proxies strike Saudi Abqaiq — limited damage, Aramco confirms',       url: 'https://www.wsj.com/world/middle-east',         claude: +3.40, gpt: +2.80 },
  ],
  'OPEC+ Policy': [
    { date: '2026-04-18', source: 'Reuters',   headline: 'OPEC+ extends 2.2mb/d voluntary cuts through Q3',                          url: 'https://www.reuters.com/business/energy/',      claude: +3.80, gpt: +3.20 },
    { date: '2026-04-14', source: 'Bloomberg', headline: 'Saudi Arabia signals defending "fair price" above $75',                   url: 'https://www.bloomberg.com/markets/commodities', claude: +2.20, gpt: +1.80 },
    { date: '2026-04-09', source: 'Platts',    headline: 'UAE compliance drops — sources say 200k bpd over quota',                   url: 'https://www.spglobal.com/commodityinsights',    claude: -1.40, gpt: -1.10 },
  ],
  'US Shale': [
    { date: '2026-04-19', source: 'EIA',       headline: 'DUC count hits 5-year low — drilling discipline intact',                  url: 'https://www.eia.gov/petroleum/',                claude: +1.90, gpt: +1.50 },
    { date: '2026-04-16', source: 'Reuters',   headline: 'Permian growth to slow to 200k bpd in 2026 — HalliburtonCEO',             url: 'https://www.reuters.com/business/energy/',      claude: +2.40, gpt: +2.00 },
    { date: '2026-04-11', source: 'Bloomberg', headline: 'Capex guidance flat across top 10 shale producers',                        url: 'https://www.bloomberg.com/energy',              claude: +1.60, gpt: +1.30 },
    { date: '2026-04-07', source: 'WSJ',       headline: 'Exxon Pioneer integration complete — efficiency gains accelerate',        url: 'https://www.wsj.com/business/energy-oil',       claude: -0.80, gpt: -0.60 },
  ],
  'China Demand': [
    { date: '2026-04-18', source: 'Bloomberg', headline: 'China Q1 oil demand +4.2% y/y — stimulus flowing to refineries',          url: 'https://www.bloomberg.com/news/china',          claude: +3.10, gpt: +2.60 },
    { date: '2026-04-15', source: 'Reuters',   headline: 'Sinopec imports surge as teapot refiners return',                          url: 'https://www.reuters.com/business/energy/',      claude: +1.80, gpt: +1.40 },
    { date: '2026-04-10', source: 'FT',        headline: 'SPR fill accelerates — Beijing targets 1bn barrel stockpile',              url: 'https://www.ft.com/china',                      claude: +2.20, gpt: +1.90 },
  ],
  'Fed / Dollar': [
    { date: '2026-04-17', source: 'Bloomberg', headline: 'DXY breaks 102 on dovish Fed minutes — commodities catch bid',            url: 'https://www.bloomberg.com/markets/fed',         claude: +1.60, gpt: +1.30 },
    { date: '2026-04-14', source: 'Reuters',   headline: 'Real rates turn negative for first time since 2022',                       url: 'https://www.reuters.com/markets/us/',           claude: +1.20, gpt: +1.00 },
    { date: '2026-04-09', source: 'CNBC',      headline: 'Fed cut odds for Q3 now 72% per OIS market',                               url: 'https://www.cnbc.com/fed/',                     claude: +0.90, gpt: +0.70 },
  ],
  'SPR / Reserves': [
    { date: '2026-04-18', source: 'DOE',       headline: 'SPR refill pace cut to 1.5 mbbl/wk — price ceiling hit',                   url: 'https://www.energy.gov/spr',                     claude: -0.60, gpt: -0.40 },
    { date: '2026-04-12', source: 'Reuters',   headline: 'Biden-era release authority officially expired',                           url: 'https://www.reuters.com/world/us/',             claude: +0.80, gpt: +0.70 },
    { date: '2026-04-06', source: 'Bloomberg', headline: 'OECD commercial inventories at 5-year lows',                               url: 'https://www.bloomberg.com/commodities',         claude: +1.40, gpt: +1.10 },
  ],
  'Russia / Ukraine': [
    { date: '2026-04-19', source: 'Reuters',   headline: 'Ukraine drone strikes hit Ryazan refinery — 200k bpd offline',             url: 'https://www.reuters.com/world/europe/',         claude: +2.40, gpt: +2.00 },
    { date: '2026-04-13', source: 'FT',        headline: 'EU tightens G7 price-cap enforcement — shadow fleet squeeze',              url: 'https://www.ft.com/russia',                     claude: +1.50, gpt: +1.20 },
    { date: '2026-04-08', source: 'Bloomberg', headline: 'Russian seaborne exports down 380k bpd on attacks + sanctions',            url: 'https://www.bloomberg.com/markets/commodities', claude: +2.10, gpt: +1.80 },
  ],
};

const OIL_DRIVER_WEIGHTS = {
  'Iran / Strait':    0.25,
  'OPEC+ Policy':     0.20,
  'US Shale':         0.13,
  'China Demand':     0.15,
  'Fed / Dollar':     0.07,
  'SPR / Reserves':   0.05,
  'Russia / Ukraine': 0.15,
};

function oilConsensus(n) { return +(((n.claude + n.gpt) / 2)).toFixed(2); }
function oilRecencyWeight(dateStr) { return Math.exp(-modelDaysAgo(dateStr) / 5); }
function oilDriverImpliedDollar(name) {
  const arr = OIL_DRIVER_NEWS[name] || [];
  let total = 0;
  for (const n of arr) total += oilRecencyWeight(n.date) * oilConsensus(n);
  return +(total.toFixed(2));
}
function oilDollarToScore(d, scale = 25) {
  const c = Math.max(-scale, Math.min(scale, d));
  return Math.round(50 + (c / scale) * 50);
}

const OIL_TO_BTC = { claude: -340, gpt: -280 };
const OIL_TO_BTC_CONSENSUS = (OIL_TO_BTC.claude + OIL_TO_BTC.gpt) / 2;

// ============================================================================
// AUTO-WIRE: Polymarket / Kalshi → Driver sliders
// ============================================================================
// Off by default. When ON, pulls relevant contracts from
// window.PredictionMarkets.fetchRelevant() and maps each contract to a driver
// slider via contractRegex. Slider values are derived from yesPrice (0..1):
//   formula 'direct'  → slider = round(prob * 100)
//   formula 'inverse' → slider = round(100 - prob * 100)
// US Shale and SPR/Reserves have no clean prediction-market analog → stay manual.
const MODEL_AUTOWIRE_MAP = {
  'Iran / Strait': {
    contractRegex: /iran.*deal|hormuz.*close|iran.*strike|iran.*nuclear/i,
    formula: 'inverse',
    rationale: 'higher deal probability → lower oil tension',
  },
  'OPEC+ Policy': {
    contractRegex: /opec.*cut|opec.*production|saudi.*output/i,
    formula: 'direct',
    rationale: 'higher cut probability → higher slider (bullish oil)',
  },
  'Fed / Dollar': {
    contractRegex: /fed.*cut|fomc.*cut|rate.*cut/i,
    formula: 'inverse',
    rationale: 'rate cut probability → weaker dollar → bullish risk',
  },
  'China Demand': {
    contractRegex: /china.*gdp|china.*recession|china.*stimulus/i,
    formula: 'direct',
    rationale: 'higher growth probability → higher demand',
  },
  'Russia / Ukraine': {
    contractRegex: /russia.*ukraine|ukraine.*ceasefire|russia.*sanction/i,
    formula: 'inverse',
    rationale: 'higher ceasefire probability → less oil supply risk',
  },
  // 'US Shale' and 'SPR / Reserves' intentionally absent — no clean analog.
};
const MODEL_AUTOWIRE_STORAGE_KEY = 'tr_model_autowire_v1';
function modelAutowireMatch(driverName, markets) {
  const cfg = MODEL_AUTOWIRE_MAP[driverName];
  if (!cfg || !Array.isArray(markets) || !markets.length) return null;
  const hit = markets.find(m => cfg.contractRegex.test(m.title || ''));
  if (!hit) return null;
  const prob = Math.max(0, Math.min(1, Number(hit.yesPrice) || 0));
  const sliderVal = cfg.formula === 'inverse'
    ? Math.round(100 - prob * 100)
    : Math.round(prob * 100);
  return { market: hit, prob, sliderVal, formula: cfg.formula, rationale: cfg.rationale };
}

// ============================================================================
// Component
// ============================================================================

function ModelScreen({ onNav }) {
  const T = modelTokens;
  const W = 1280, H = 820;

  // ---- Stage 1 state: BTC drivers ----
  const [drivers, setDrivers] = React.useState([
    { name: 'BTC Institutional', low: 'Outflows',     high: 'Heavy Inflows',  val: modelDollarToScore(modelDriverImpliedDollar('BTC Institutional')) },
    { name: 'CLARITY Act',       low: 'Stalled',      high: 'Passed',         val: modelDollarToScore(modelDriverImpliedDollar('CLARITY Act')) },
    { name: 'Iran / Strait',     low: 'Strait Open',  high: 'Strait Closed',  val: modelDollarToScore(modelDriverImpliedDollar('Iran / Strait')) },
    { name: 'Federal Reserve',   low: 'Hawkish',      high: 'Dovish',         val: modelDollarToScore(modelDriverImpliedDollar('Federal Reserve')) },
    { name: 'Trump Policy',      low: 'Steady',       high: 'Volatile',       val: modelDollarToScore(modelDriverImpliedDollar('Trump Policy')) },
    { name: 'Strategic Reserve', low: 'No Action',    high: 'Active Buying',  val: modelDollarToScore(modelDriverImpliedDollar('Strategic Reserve')) },
    { name: 'Elon Musk',         low: 'Silent',       high: 'Active',         val: modelDollarToScore(modelDriverImpliedDollar('Elon Musk')) },
  ]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [dragIdx, setDragIdx] = React.useState(null);
  const [showScoring, setShowScoring] = React.useState(false);
  const [readSet, setReadSet] = React.useState(() => new Set());
  const [expandedDriver, setExpandedDriver] = React.useState('BTC Institutional');

  // ---- Stage 2 state: Oil drivers ----
  const [oilCollapsed, setOilCollapsed] = React.useState(true);
  const [oilDrivers, setOilDrivers] = React.useState([
    { name: 'Iran / Strait',    low: 'Strait Open',  high: 'Strait Closed', val: oilDollarToScore(oilDriverImpliedDollar('Iran / Strait')) },
    { name: 'OPEC+ Policy',     low: 'More Supply',  high: 'Deeper Cuts',   val: oilDollarToScore(oilDriverImpliedDollar('OPEC+ Policy')) },
    { name: 'US Shale',         low: 'Surging',      high: 'Disciplined',   val: oilDollarToScore(oilDriverImpliedDollar('US Shale')) },
    { name: 'China Demand',     low: 'Weak',         high: 'Roaring',       val: oilDollarToScore(oilDriverImpliedDollar('China Demand')) },
    { name: 'Fed / Dollar',     low: 'Strong USD',   high: 'Weak USD',      val: oilDollarToScore(oilDriverImpliedDollar('Fed / Dollar')) },
    { name: 'SPR / Reserves',   low: 'Releases',     high: 'Refilling',     val: oilDollarToScore(oilDriverImpliedDollar('SPR / Reserves')) },
    { name: 'Russia / Ukraine', low: 'Ceasefire',    high: 'Escalation',    val: oilDollarToScore(oilDriverImpliedDollar('Russia / Ukraine')) },
  ]);
  const [oilActiveIdx, setOilActiveIdx] = React.useState(0);
  const [oilDragIdx, setOilDragIdx] = React.useState(null);
  const [oilExpanded, setOilExpanded] = React.useState('Iran / Strait');
  const [oilReadSet, setOilReadSet] = React.useState(() => new Set());

  // News refresh tick
  const [, setRefreshTick] = React.useState(0);
  const [lastRefresh, setLastRefresh] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => {
      setRefreshTick(t => t + 1);
      setLastRefresh(new Date());
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => forceTick(x => x + 1), 15 * 1000);
    return () => clearInterval(id);
  }, []);
  const refreshAgo = (() => {
    const s = Math.max(0, Math.round((Date.now() - lastRefresh.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    return `${Math.round(s / 60)}m ago`;
  })();

  const MAX_WEIGHT = 0.28;
  const OIL_MAX_WEIGHT = 0.25;

  // ---- AUTO-WIRE state (Polymarket / Kalshi → Oil driver sliders) ----
  const autowireEngineAvailable = (typeof window !== 'undefined'
    && window.PredictionMarkets
    && typeof window.PredictionMarkets.fetchRelevant === 'function');
  const [autowireOn, setAutowireOn] = React.useState(() => {
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem(MODEL_AUTOWIRE_STORAGE_KEY) === 'true';
    } catch (_e) { return false; }
  });
  // Map<driverName, { market, prob, sliderVal, formula, rationale }>
  const [autowireMatches, setAutowireMatches] = React.useState({});
  const [autowireLastTs, setAutowireLastTs] = React.useState(null);
  const [autowireFetching, setAutowireFetching] = React.useState(false);

  React.useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MODEL_AUTOWIRE_STORAGE_KEY, autowireOn ? 'true' : 'false');
      }
    } catch (_e) {}
  }, [autowireOn]);

  const runAutowirePull = React.useCallback(async () => {
    if (!autowireEngineAvailable) return;
    setAutowireFetching(true);
    try {
      const markets = await window.PredictionMarkets.fetchRelevant();
      const next = {};
      Object.keys(MODEL_AUTOWIRE_MAP).forEach(name => {
        const m = modelAutowireMatch(name, markets);
        if (m) next[name] = m;
      });
      setAutowireMatches(next);
      setAutowireLastTs(new Date());
    } catch (_e) {
      // graceful degrade — keep previous matches
    } finally {
      setAutowireFetching(false);
    }
  }, [autowireEngineAvailable]);

  // Pull on toggle-ON + refresh every 5 minutes while ON.
  React.useEffect(() => {
    if (!autowireOn || !autowireEngineAvailable) return;
    runAutowirePull();
    const id = setInterval(() => { runAutowirePull(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [autowireOn, autowireEngineAvailable, runAutowirePull]);

  // When new matches arrive (or toggle flips), push values into the relevant
  // oil driver sliders. (BTC driver "Iran / Strait" is intentionally left
  // manual — auto-wire operates on the oil driver surface only.)
  React.useEffect(() => {
    if (!autowireOn) return;
    setOilDrivers(prev => prev.map(d => {
      const m = autowireMatches[d.name];
      if (!m) return d;
      if (d.val === m.sliderVal) return d;
      return { ...d, val: m.sliderVal };
    }));
  }, [autowireOn, autowireMatches]);

  const autowireAgo = (() => {
    if (!autowireLastTs) return null;
    const s = Math.max(0, Math.round((Date.now() - autowireLastTs.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    return `${Math.round(s / 60)}m ago`;
  })();

  // BTC Projection math
  const projection = React.useMemo(() => {
    let dollarDelta = 0;
    let volDollar = 0;
    drivers.forEach(d => {
      const w = MODEL_DRIVER_WEIGHTS[d.name] || 0;
      const signed = (d.val - 50) / 50;
      const perDriverScale = 45000;
      dollarDelta += signed * w * perDriverScale * MODEL_HORIZON_MULT / 4.2;
      volDollar   += Math.abs(signed) * w * perDriverScale * 0.35;
    });
    const baseDelta = dollarDelta * MODEL_HORIZON_MULT;
    const spread = 12000 + volDollar * MODEL_HORIZON_MULT;
    const base = MODEL_BTC_PRICE_NOW + baseDelta;
    const bull = base + spread;
    const bear = base - spread * 1.55 - 6000;
    return { baseDelta, base, bull, bear, spread };
  }, [drivers]);

  // Fan chart geometry
  const fanX = 40, fanY = 40, fanW = 600, fanH = 240;
  const N = 80;
  const baseArr = [], bullArr = [], bearArr = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const drift = projection.baseDelta * t;
    const wobble = Math.sin(t * 3.1) * 800;
    const widen  = projection.spread * t;
    baseArr.push(MODEL_BTC_PRICE_NOW + drift + wobble);
    bullArr.push(MODEL_BTC_PRICE_NOW + drift + widen);
    bearArr.push(MODEL_BTC_PRICE_NOW + drift - widen * 1.55 - 6000 * t);
  }
  const allVals = [...bullArr, ...bearArr, MODEL_BTC_PRICE_NOW];
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

  // BTC driver interactions
  const trackRefs = React.useRef({});
  const setDriverVal = (idx, val) => {
    setDrivers(prev => prev.map((d, i) => i === idx ? { ...d, val: Math.max(0, Math.min(100, Math.round(val))) } : d));
  };
  const valFromEvent = (idx, e) => {
    const el = trackRefs.current[idx];
    if (!el) return 50;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
  };
  const handlePointerDown = (idx) => (e) => {
    e.preventDefault();
    setDragIdx(idx); setActiveIdx(idx);
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

  // Multi-LLM narrative hook
  const driverSignature = drivers.map(d => `${d.name.slice(0, 3)}${d.val}`).join(',');
  const { data: proj, loading: projLoading } = (window.useAutoUpdate || (() => ({})))(
    `model-llm-${driverSignature}`,
    async () => {
      if (typeof AIAnalysis === 'undefined') return null;
      const keys = AIAnalysis.getKeys();
      if (!keys.claude && !keys.openai && !keys.gemini) return null;
      const driverPrompt = {
        source: 'TradeRadar Driver Regime',
        title:
          'Driver state: ' +
          drivers.map(d => `${d.name}=${d.val}/100 (${modelDriverTier(d.val).tag})`).join(', ') +
          '. Project BTC price through Dec 2026 base/bull/bear.',
      };
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
      } catch (_e) {}
      return await AIAnalysis.runMulti(combined, { full: true });
    },
    { refreshKey: 'model' }
  );

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

  // ---- Stage 2: Oil math ----
  const oilTrackRefs = React.useRef({});
  const oilMath = React.useMemo(() => {
    let oilDelta = 0;
    const contribs = oilDrivers.map(d => {
      const w = OIL_DRIVER_WEIGHTS[d.name] || 0;
      const signed = (d.val - 50) / 50;
      const contrib = signed * w * 25;
      oilDelta += contrib;
      return { name: d.name, contrib, weight: w };
    });
    const projectedOil = OIL_PRICE_NOW + oilDelta;
    return { oilDelta, projectedOil, contribs };
  }, [oilDrivers]);

  const btcMath = React.useMemo(() => {
    const claudeBtc = oilMath.oilDelta * OIL_TO_BTC.claude;
    const gptBtc    = oilMath.oilDelta * OIL_TO_BTC.gpt;
    const consensusBtc = (claudeBtc + gptBtc) / 2;
    const projectedBtc = MODEL_BTC_PRICE_NOW + consensusBtc;
    return { claudeBtc, gptBtc, consensusBtc, projectedBtc };
  }, [oilMath]);

  const setOilDriverVal = (idx, val) => {
    setOilDrivers(prev => prev.map((d, i) => i === idx ? { ...d, val: Math.max(0, Math.min(100, Math.round(val))) } : d));
  };
  const oilValFromEvent = (idx, e) => {
    const el = oilTrackRefs.current[idx];
    if (!el) return 50;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
  };
  // A driver is locked (read-only) when auto-wire is ON AND we have a matched
  // contract for that driver. Sliders without a matched contract (e.g. US Shale,
  // SPR/Reserves, or any mapped driver whose regex didn't hit today) stay manual.
  const isOilDriverLocked = (idx) => {
    if (!autowireOn) return false;
    const name = oilDrivers[idx] && oilDrivers[idx].name;
    return !!(name && autowireMatches[name]);
  };
  const oilHandlePointerDown = (idx) => (e) => {
    if (isOilDriverLocked(idx)) { e.preventDefault(); setOilActiveIdx(idx); return; }
    e.preventDefault();
    setOilDragIdx(idx); setOilActiveIdx(idx);
    setOilDriverVal(idx, oilValFromEvent(idx, e));
    const move = (ev) => setOilDriverVal(idx, oilValFromEvent(idx, ev));
    const up = () => {
      setOilDragIdx(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const oilHandleKeyDown = (idx) => (e) => {
    if (isOilDriverLocked(idx)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { e.preventDefault(); setOilDriverVal(idx, oilDrivers[idx].val + (e.shiftKey ? 10 : 1)); setOilActiveIdx(idx); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { e.preventDefault(); setOilDriverVal(idx, oilDrivers[idx].val - (e.shiftKey ? 10 : 1)); setOilActiveIdx(idx); }
    if (e.key === 'Home') { e.preventDefault(); setOilDriverVal(idx, 0); }
    if (e.key === 'End')  { e.preventDefault(); setOilDriverVal(idx, 100); }
  };

  const fmtDollar2 = (v, pref = '$') => (v >= 0 ? '+' : '-') + pref + Math.abs(v).toFixed(2);
  const fmtBigDollar = (v) => (v >= 0 ? '+' : '') + '$' + Math.round(v).toLocaleString();
  const fmtOil = (v) => `$${v.toFixed(2)}`;

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
      userSelect: (dragIdx !== null || oilDragIdx !== null) ? 'none' : 'auto',
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

        <TRTabBar current="model" onNav={onNav} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <TRLiveStripInline />
          <TRGearInline />

          {/* AUTO-WIRE toggle — Polymarket/Kalshi → oil driver sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <button
              type="button"
              disabled={!autowireEngineAvailable}
              onClick={() => { if (autowireEngineAvailable) setAutowireOn(v => !v); }}
              title={
                !autowireEngineAvailable
                  ? 'Prediction Markets engine not available'
                  : autowireOn
                    ? 'LIVE FROM MARKETS — sliders driven by Polymarket/Kalshi probabilities. Click to disable.'
                    : 'Click to drive sliders from Polymarket/Kalshi probabilities.'
              }
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: autowireOn ? 'rgba(201,162,39,0.14)' : T.ink200,
                border: `1px solid ${autowireOn ? T.signal : T.edge}`,
                color: autowireOn ? T.signal : (autowireEngineAvailable ? T.textMid : T.textDim),
                fontFamily: T.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                cursor: autowireEngineAvailable ? 'pointer' : 'not-allowed',
                opacity: autowireEngineAvailable ? 1 : 0.55,
                boxShadow: autowireOn ? '0 0 0 2px rgba(201,162,39,0.08)' : 'none',
                transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
              }}>
              <span style={{ fontSize: 11 }}>🔗</span>
              <span>{autowireOn ? 'LIVE FROM MARKETS' : 'LIVE FROM MARKETS · OFF'}</span>
              {autowireFetching && (
                <span style={{ width: 5, height: 5, borderRadius: 3, background: T.signal, animation: 'tw-pulse 1s ease-in-out infinite' }} />
              )}
            </button>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.3 }}>
              {autowireOn
                ? (autowireAgo ? `Updated ${autowireAgo}` : (autowireFetching ? 'Updating…' : 'Updating…'))
                : (autowireEngineAvailable ? 'Manual driver mode' : 'Markets engine offline')}
            </div>
          </div>

          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; MODEL · BTC + OIL CROSS-ASSET
          </div>
        </div>
      </div>

      {/* Scrollable body so oil section can expand below the fold */}
      <div style={{ height: H - 52, overflowY: 'auto' }}>
        {/* Stage 1: Two-column BTC layout — matches projected.jsx primary */}
        <div style={{ display: 'flex', minHeight: H - 52 }}>
          {/* LEFT — Drivers */}
          <div style={{
            width: 400, background: T.ink100, borderRight: `1px solid ${T.edge}`,
            padding: '16px 18px 20px', display: 'flex', flexDirection: 'column',
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

            <div data-walk="driver-accordion" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16 }}>
              {drivers.map((d, idx) => {
                const active = idx === activeIdx;
                const isOpen = expandedDriver === d.name;
                const tier = modelDriverTier(d.val);
                const weight = MODEL_DRIVER_WEIGHTS[d.name] || 0;
                const barW = (weight / MAX_WEIGHT) * 100;
                const implied = modelDriverImpliedDollar(d.name);
                return (
                  <div key={d.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{
                          fontFamily: T.mono, fontSize: 8.5, color: T.textDim,
                          letterSpacing: 0.6, fontWeight: 600, width: 44,
                        }}>NEWS</div>
                        <div style={{
                          flex: 1, fontSize: 10.5, color: T.textMid, letterSpacing: 0.01,
                        }}>
                          Consensus $ from {(MODEL_DRIVER_NEWS[d.name] || []).length} articles
                        </div>
                        <div style={{
                          fontFamily: T.mono, fontSize: 11, fontWeight: 600,
                          color: implied > 0 ? T.bull : implied < 0 ? T.bear : T.textMid,
                          letterSpacing: 0.3,
                        }}>{fmtDollar(implied)}</div>
                      </div>

                      <div
                        ref={el => trackRefs.current[idx] = el}
                        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(idx)(e); }}
                        onClick={(e) => e.stopPropagation()}
                        tabIndex={0}
                        onKeyDown={handleKeyDown(idx)}
                        role="slider"
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.val} aria-label={d.name}
                        style={{
                          position: 'relative', height: 20, marginBottom: 6,
                          cursor: 'pointer', touchAction: 'none', outline: 'none',
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
                        {(MODEL_DRIVER_NEWS[d.name] || []).map((n, i) => {
                          const isRead = readSet.has(n.url);
                          const isNew = n.date === MODEL_TODAY;
                          const sourceColor = isRead ? T.signal : (isNew ? '#4EA076' : T.textMid);
                          const cons = modelConsensus(n);
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT — Chart + Narrative */}
          <div style={{
            flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column',
            background: T.ink000, minWidth: 0,
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
                <line x1={fanX} y1={yTo(MODEL_BTC_PRICE_NOW)} x2={fanX + fanW} y2={yTo(MODEL_BTC_PRICE_NOW)}
                      stroke={T.textMid} strokeWidth={0.5} strokeDasharray="1,4" />
                <text x={fanX + fanW + 4} y={yTo(MODEL_BTC_PRICE_NOW) + 3}
                      fill={T.textMid} fontFamily={T.mono} fontSize={10}>NOW</text>
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

        {/* ============================================================== */}
        {/* Section divider */}
        {/* ============================================================== */}
        <div style={{
          borderTop: `1px solid ${T.edge}`,
          background: T.ink100,
          padding: '14px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
        }}
          onClick={() => setOilCollapsed(c => !c)}>
          <div style={{
            fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
            letterSpacing: 1.2, color: T.signal, textTransform: 'uppercase',
          }}>OIL → BTC CROSS-ASSET</div>
          <div style={{
            fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.5,
          }}>TWO-STAGE MODEL · OIL DRIVERS + LLM CROSS-ASSET COEFFICIENT</div>
          <div style={{
            marginLeft: 'auto',
            fontFamily: T.mono, fontSize: 10, color: T.textMid, letterSpacing: 0.4,
          }}>
            {oilCollapsed
              ? `WTI ${fmtOil(OIL_PRICE_NOW)} → ${fmtOil(oilMath.projectedOil)} · BTC ${fmtBigDollar(btcMath.consensusBtc)}`
              : 'CLICK TO COLLAPSE'}
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: 12, color: T.textMid, width: 16, textAlign: 'center',
          }}>{oilCollapsed ? '▸' : '▾'}</div>
        </div>

        {/* Oil Section — expanded */}
        {!oilCollapsed && (
          <div style={{
            background: T.ink000, padding: '16px 24px 24px',
            display: 'flex', gap: 16,
          }}>
            {/* LEFT — Oil drivers */}
            <div style={{
              width: 480, background: T.ink100, border: `1px solid ${T.edge}`,
              borderRadius: 10, padding: '18px 20px',
            }}>
              <div style={{
                fontSize: 10, letterSpacing: 1, color: T.textDim,
                textTransform: 'uppercase', fontWeight: 500, marginBottom: 4,
              }}>Oil Drivers · 7 · Weighted Consensus</div>
              <div style={{
                fontSize: 14, fontWeight: 500, color: T.text,
                letterSpacing: -0.2, marginBottom: 14,
              }}>Weighted $/bbl sums to projected WTI</div>

              <div data-walk="oil-driver-accordion" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {oilDrivers.map((d, idx) => {
                  const active = idx === oilActiveIdx;
                  const isOpen = oilExpanded === d.name;
                  const tier = modelDriverTier(d.val);
                  const weight = OIL_DRIVER_WEIGHTS[d.name] || 0;
                  const barW = (weight / OIL_MAX_WEIGHT) * 100;
                  const implied = oilDriverImpliedDollar(d.name);
                  const contrib = oilMath.contribs[idx].contrib;
                  const autowireCfg = MODEL_AUTOWIRE_MAP[d.name];
                  const autowireHit = autowireOn ? autowireMatches[d.name] : null;
                  const isLocked = !!autowireHit;
                  const autowireOffButMappable = autowireOn && autowireCfg && !autowireHit;
                  const linkTooltip = autowireHit
                    ? `from ${autowireHit.market.source || 'market'}: ${autowireHit.market.title} · ${Math.round(autowireHit.prob * 100)}% · ${autowireHit.formula === 'inverse' ? 'inverse' : 'direct'} formula → slider ${autowireHit.sliderVal}`
                    : autowireOffButMappable
                      ? 'Auto-wire ON but no matching contract found — slider remains manual'
                      : (autowireCfg ? 'Auto-wireable — enable LIVE FROM MARKETS to drive from probabilities' : 'No prediction-market analog — manual only');
                  return (
                    <div key={d.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div
                        onClick={() => {
                          setOilActiveIdx(idx);
                          setOilExpanded(isOpen ? null : d.name);
                        }}
                        style={{
                          background: isOpen ? T.ink200 : T.ink100,
                          border: isLocked
                            ? `1px dashed ${T.signal}`
                            : `1px solid ${isOpen ? T.signal + '55' : T.edge}`,
                          borderRadius: 8, padding: '10px 14px',
                          boxShadow: isLocked
                            ? `0 0 0 1px rgba(201,162,39,0.14), inset 0 0.5px 0 rgba(255,255,255,0.04)`
                            : (isOpen ? `0 0 0 1px rgba(201,162,39,0.12), inset 0 0.5px 0 rgba(255,255,255,0.06)` : 'none'),
                          cursor: 'pointer',
                          transition: 'background 160ms cubic-bezier(0.2,0.7,0.2,1), border-color 160ms cubic-bezier(0.2,0.7,0.2,1)',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: T.text }}>{d.name}</div>
                          {isLocked && (
                            <span
                              title={linkTooltip}
                              style={{
                                marginLeft: 6, padding: '1px 5px', borderRadius: 4,
                                fontFamily: T.mono, fontSize: 9, letterSpacing: 0.3,
                                background: 'rgba(201,162,39,0.14)', color: T.signal,
                                border: `0.5px solid rgba(201,162,39,0.4)`,
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                              }}>🔗 {Math.round(autowireHit.prob * 100)}%</span>
                          )}
                          {autowireOffButMappable && (
                            <span
                              title={linkTooltip}
                              style={{
                                marginLeft: 6, padding: '1px 5px', borderRadius: 4,
                                fontFamily: T.mono, fontSize: 9, letterSpacing: 0.3,
                                background: T.ink200, color: T.textDim,
                                border: `0.5px dashed ${T.edge}`,
                              }}>🔗 OFF</span>
                          )}
                          <div style={{
                            marginLeft: 8, fontFamily: T.mono, fontSize: 8.5, fontWeight: 600,
                            letterSpacing: 0.8, color: tier.color,
                          }}>{tier.tag}</div>
                          <div style={{
                            marginLeft: 'auto', fontFamily: T.mono, fontSize: 10.5,
                            fontWeight: 600, color: contrib > 0 ? T.bull : contrib < 0 ? T.bear : T.textMid,
                            letterSpacing: 0.3, minWidth: 60, textAlign: 'right',
                          }}>{fmtDollar2(contrib)}/bbl</div>
                          <div style={{
                            marginLeft: 10, fontFamily: T.mono, fontSize: 12,
                            color: T.textMid, width: 12, textAlign: 'center',
                          }}>{isOpen ? '▾' : '▸'}</div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
                            }} />
                          </div>
                          <div style={{
                            fontFamily: T.mono, fontSize: 10, color: isOpen ? T.signal : T.textMid,
                            fontWeight: 500, width: 32, textAlign: 'right',
                          }}>{Math.round(weight * 100)}%</div>
                        </div>

                        <div
                          ref={el => oilTrackRefs.current[idx] = el}
                          onPointerDown={(e) => { e.stopPropagation(); oilHandlePointerDown(idx)(e); }}
                          onClick={(e) => e.stopPropagation()}
                          tabIndex={0}
                          onKeyDown={oilHandleKeyDown(idx)}
                          role="slider" aria-valuemin={0} aria-valuemax={100}
                          aria-valuenow={d.val} aria-label={d.name}
                          aria-readonly={isLocked}
                          title={isLocked ? linkTooltip : undefined}
                          style={{ position: 'relative', height: 18, marginBottom: 4, cursor: isLocked ? 'not-allowed' : 'pointer', touchAction: 'none', outline: 'none' }}>
                          <div style={{
                            position: 'absolute', top: 8, left: 0, right: 0, height: 2,
                            background: 'rgba(255,255,255,0.06)', borderRadius: 1,
                          }} />
                          <div style={{
                            position: 'absolute', top: 8, left: 0, width: `${d.val}%`, height: 2,
                            background: isLocked
                              ? `linear-gradient(90deg, rgba(201,162,39,0.5) 0%, ${T.signal} 100%)`
                              : tier.color,
                            opacity: isLocked ? 1 : (active ? 1 : 0.55),
                            borderRadius: 1,
                          }} />
                          <div style={{
                            position: 'absolute', top: 2, left: `calc(${d.val}% - 7px)`,
                            width: 14, height: 14, borderRadius: 7,
                            background: isLocked ? T.signal : tier.color,
                            boxShadow: isLocked
                              ? `0 0 0 3px rgba(201,162,39,0.22), 0 2px 4px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.3)`
                              : (active
                                ? `0 0 0 4px ${tier.color}26, 0 2px 4px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.3)`
                                : '0 2px 4px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.3)'),
                          }} />
                        </div>

                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.4,
                          pointerEvents: 'none',
                        }}>
                          <span>{d.low.toUpperCase()}</span>
                          <span>
                            {isLocked
                              ? <span style={{ color: T.signal }}>LIVE {Math.round(autowireHit.prob * 100)}% · slider {autowireHit.sliderVal}</span>
                              : `NEWS ${fmtDollar2(implied)}/bbl`}
                          </span>
                          <span>{d.high.toUpperCase()}</span>
                        </div>
                      </div>

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
                            <span style={{ marginLeft: 'auto' }}>DBL-CLICK TO OPEN</span>
                          </div>
                          {(OIL_DRIVER_NEWS[d.name] || []).map((n, i) => {
                            const isRead = oilReadSet.has(n.url);
                            const isNew = n.date === MODEL_TODAY;
                            const sourceColor = isRead ? T.signal : (isNew ? '#4EA076' : T.textMid);
                            const cons = oilConsensus(n);
                            return (
                              <div key={i}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOilReadSet(prev => { const next = new Set(prev); next.add(n.url); return next; });
                                }}
                                onDoubleClick={(e) => { e.stopPropagation(); window.open(n.url, '_blank', 'noopener,noreferrer'); }}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '46px 74px 1fr 46px 46px 50px',
                                  gap: 6, alignItems: 'baseline',
                                  padding: '6px 8px',
                                  background: T.ink200,
                                  border: `0.5px solid ${T.edge}`,
                                  borderRadius: 6, cursor: 'pointer', userSelect: 'none',
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
                                }}>{fmtDollar2(n.claude)}</div>
                                <div style={{
                                  fontFamily: T.mono, fontSize: 9.5, fontWeight: 500, color: T.gpt,
                                  textAlign: 'right', letterSpacing: 0.3,
                                }}>{fmtDollar2(n.gpt)}</div>
                                <div style={{
                                  fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                                  color: cons > 0 ? T.bull : cons < 0 ? T.bear : T.textMid,
                                  textAlign: 'right', letterSpacing: 0.3,
                                }}>{fmtDollar2(cons)}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT — Stage 1 oil readout + Stage 2 BTC headwind */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              {/* Stage 1 Oil */}
              <div style={{
                background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
                padding: '14px 18px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{
                    fontSize: 9.5, letterSpacing: 1, color: T.textDim,
                    textTransform: 'uppercase', fontWeight: 600,
                  }}>Stage 1 · Oil Price · Weighted Sum</div>
                  <div style={{
                    marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.textDim,
                  }}>WTI · $/BBL</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 9.5, color: T.textDim, fontFamily: T.mono, letterSpacing: 0.5 }}>NOW</div>
                    <div style={{ fontSize: 26, fontWeight: 500, color: T.textMid, fontFamily: T.mono, letterSpacing: -0.3 }}>
                      {fmtOil(OIL_PRICE_NOW)}
                    </div>
                  </div>
                  <div style={{ color: T.textDim, fontSize: 18, fontFamily: T.mono, marginBottom: 8 }}>→</div>
                  <div>
                    <div style={{ fontSize: 9.5, color: T.textDim, fontFamily: T.mono, letterSpacing: 0.5 }}>PROJECTED</div>
                    <div style={{
                      fontSize: 32, fontWeight: 500, color: T.oil, fontFamily: T.mono, letterSpacing: -0.5,
                    }}>{fmtOil(oilMath.projectedOil)}</div>
                  </div>
                  <div style={{
                    marginBottom: 8, padding: '4px 12px',
                    background: oilMath.oilDelta >= 0 ? 'rgba(78,160,118,0.12)' : 'rgba(217,107,107,0.12)',
                    border: `1px solid ${oilMath.oilDelta >= 0 ? 'rgba(78,160,118,0.3)' : 'rgba(217,107,107,0.3)'}`,
                    borderRadius: 6,
                    fontFamily: T.mono, fontSize: 13, fontWeight: 600,
                    color: oilMath.oilDelta >= 0 ? T.bull : T.bear,
                  }}>{fmtDollar2(oilMath.oilDelta)}/bbl</div>
                </div>

                <div style={{
                  fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                  fontFamily: T.mono, fontWeight: 600, marginBottom: 8,
                }}>CONTRIBUTION BY DRIVER · WEIGHTED $/BBL</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {oilMath.contribs.map((c, i) => {
                    const maxAbs = Math.max(...oilMath.contribs.map(x => Math.abs(x.contrib)), 0.5);
                    const pct = (Math.abs(c.contrib) / maxAbs) * 100;
                    const pos = c.contrib >= 0;
                    return (
                      <div key={c.name}
                        onClick={() => setOilActiveIdx(i)}
                        style={{
                          display: 'grid', gridTemplateColumns: '140px 1fr 1fr 60px',
                          gap: 8, alignItems: 'center', cursor: 'pointer',
                          padding: '3px 4px',
                          borderRadius: 4,
                          background: i === oilActiveIdx ? 'rgba(232,184,74,0.06)' : 'transparent',
                        }}>
                        <div style={{ fontSize: 10.5, color: T.textMid, letterSpacing: 0.01 }}>{c.name}</div>
                        <div style={{ position: 'relative', height: 12, display: 'flex', justifyContent: 'flex-end' }}>
                          {!pos && (
                            <div style={{
                              width: `${pct}%`, height: 6, marginTop: 3,
                              background: T.bear, borderRadius: 1,
                            }} />
                          )}
                        </div>
                        <div style={{ position: 'relative', height: 12 }}>
                          {pos && (
                            <div style={{
                              width: `${pct}%`, height: 6, marginTop: 3,
                              background: T.bull, borderRadius: 1,
                            }} />
                          )}
                        </div>
                        <div style={{
                          fontFamily: T.mono, fontSize: 10, fontWeight: 500,
                          color: pos ? T.bull : T.bear, textAlign: 'right', letterSpacing: 0.3,
                        }}>{fmtDollar2(c.contrib)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stage 2 BTC */}
              <div style={{
                background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
                padding: '14px 18px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{
                    fontSize: 9.5, letterSpacing: 1, color: T.textDim,
                    textTransform: 'uppercase', fontWeight: 600,
                  }}>Stage 2 · Oil → BTC · LLMs Score Cross-Asset</div>
                  <div style={{
                    marginLeft: 'auto', fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4,
                  }}>$ BTC per $1 WTI</div>
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12,
                }}>
                  {[
                    { label: 'CLAUDE',    c: T.claude, coef: OIL_TO_BTC.claude, val: btcMath.claudeBtc },
                    { label: 'GPT',       c: T.gpt,    coef: OIL_TO_BTC.gpt,    val: btcMath.gptBtc },
                    { label: 'CONSENSUS', c: T.signal, coef: OIL_TO_BTC_CONSENSUS, val: btcMath.consensusBtc },
                  ].map(b => (
                    <div key={b.label} style={{
                      background: T.ink200, border: `1px solid ${T.edge}`,
                      borderRadius: 8, padding: '10px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: b.c }} />
                        <span style={{ fontFamily: T.mono, fontSize: 10, color: b.c, fontWeight: 600, letterSpacing: 0.5 }}>
                          {b.label}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 9, color: T.textDim, marginBottom: 4, letterSpacing: 0.3,
                      }}>coef · ${b.coef}/$1</div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 18, fontWeight: 500,
                        color: b.val >= 0 ? T.bull : T.bear, letterSpacing: -0.3,
                      }}>{fmtBigDollar(b.val)}</div>
                    </div>
                  ))}
                </div>

                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 12,
                  padding: '12px 14px',
                  background: 'linear-gradient(180deg, rgba(232,184,74,0.08) 0%, rgba(232,184,74,0.02) 100%)',
                  border: `0.5px solid rgba(232,184,74,0.25)`,
                  borderRadius: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.mono, letterSpacing: 0.5, marginBottom: 2 }}>
                      BTC NOW
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 14, color: T.textMid }}>
                      ${MODEL_BTC_PRICE_NOW.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ color: T.textDim, fontFamily: T.mono }}>→</div>
                  <div>
                    <div style={{ fontSize: 9, color: T.signal, fontFamily: T.mono, letterSpacing: 0.5, marginBottom: 2, display: 'flex', alignItems: 'center' }}>
                      BTC FROM OIL
                      {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && window.TR_EXPLAIN['impact-from-oil'] && (
                        <TRInfoIcon text={window.TR_EXPLAIN['impact-from-oil']} size={9} />
                      )}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 18, color: T.btc, fontWeight: 500 }}>
                      ${Math.round(btcMath.projectedBtc).toLocaleString()}
                    </div>
                  </div>
                  <div style={{
                    marginLeft: 'auto', fontSize: 11, lineHeight: 1.5, color: T.textMid, maxWidth: 330,
                    fontStyle: 'italic', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
                  }}>
                    <div>
                      Oil at {fmtOil(oilMath.projectedOil)} acts as a{' '}
                      <span style={{
                        color: btcMath.consensusBtc >= 0 ? T.bull : T.bear, fontWeight: 500, fontStyle: 'normal',
                        fontFamily: T.mono,
                      }}>
                        {btcMath.consensusBtc >= 0 ? 'tailwind' : 'headwind'}
                      </span>{' '}
                      on BTC — expected to{' '}
                      {btcMath.consensusBtc >= 0 ? 'lift' : 'cap'} price by{' '}
                      <span style={{ color: T.btc, fontFamily: T.mono, fontWeight: 500, fontStyle: 'normal' }}>
                        {fmtBigDollar(btcMath.consensusBtc)}
                      </span>.
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9.5, color: T.textDim,
                      letterSpacing: 0.3, fontStyle: 'normal',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span>{new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} ET · live model</span>
                      {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && window.TR_EXPLAIN['impact-live-model'] && (
                        <TRInfoIcon text={window.TR_EXPLAIN['impact-live-model']} size={9} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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

window.ModelScreen = ModelScreen;
