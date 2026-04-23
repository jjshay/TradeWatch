// ImpactScreen — Tab 3: Oil price projection driven by 7 oil-specific drivers,
// then oil-price delta feeds back as a headwind/tailwind on BTC.
//
// Two-stage model:
//   Stage 1  drivers → weighted $ impact on oil → projected oil price
//   Stage 2  oil delta → Claude & GPT both score "$ impact on BTC" per dollar of oil move
//            consensus of (Claude, GPT) on "$ BTC impact from oil" = the cross-asset read

const isTokens = {
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

const OIL_PRICE_NOW = 78.40; // WTI $/bbl
const BTC_PRICE_NOW_I = 95400;

// Oil-specific driver news. claude/gpt = estimated $ impact on WTI per-barrel.
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

// Oil driver weights — must sum to 1.0.
const OIL_DRIVER_WEIGHTS = {
  'Iran / Strait':    0.25,
  'OPEC+ Policy':     0.20,
  'US Shale':         0.13,
  'China Demand':     0.15,
  'Fed / Dollar':     0.07,
  'SPR / Reserves':   0.05,
  'Russia / Ukraine': 0.15,
};

const I_TODAY = '2026-04-19';
function iDaysAgo(dateStr) {
  const a = new Date(I_TODAY + 'T00:00:00Z');
  const b = new Date(dateStr + 'T00:00:00Z');
  return Math.max(0, Math.round((a - b) / 86400000));
}
function iConsensus(n) { return +(((n.claude + n.gpt) / 2)).toFixed(2); }
function iRecencyWeight(dateStr) { return Math.exp(-iDaysAgo(dateStr) / 5); }
function oilDriverImpliedDollar(name) {
  const arr = OIL_DRIVER_NEWS[name] || [];
  let total = 0;
  for (const n of arr) total += iRecencyWeight(n.date) * iConsensus(n);
  return +(total.toFixed(2));
}
// Map the $ impact back to a 0..100 slider position (for oil).
// $25 move on oil is "full range" (strait shutdown scenario).
function oilDollarToScore(d, scale = 25) {
  const c = Math.max(-scale, Math.min(scale, d));
  return Math.round(50 + (c / scale) * 50);
}

function iDriverTier(v) {
  if (v <= 25) return { tag: 'BENIGN',   color: '#4EA076' };
  if (v <= 45) return { tag: 'QUIET',    color: 'rgba(180,188,200,0.75)' };
  if (v <= 54) return { tag: 'NEUTRAL',  color: 'rgba(130,138,150,0.55)' };
  if (v <= 74) return { tag: 'ELEVATED', color: '#c9a227' };
  return         { tag: 'HOT',      color: '#D96B6B' };
}

// Stage 2: oil → BTC. For each $1 move in WTI, LLMs estimate $ impact on BTC.
// Positive oil shock is typically inflationary/risk-off for BTC (historically).
// These are stable LLM coefficients of BTC-per-$1-oil.
const OIL_TO_BTC = {
  claude: -340,  // every +$1 WTI → -$340 BTC (inflation headwind, stronger dollar)
  gpt:    -280,  // GPT reads it less negatively (some safe-haven offset)
};
const OIL_TO_BTC_CONSENSUS = (OIL_TO_BTC.claude + OIL_TO_BTC.gpt) / 2; // -310

function ImpactScreen({ onNav }) {
  const T = isTokens;
  const W = 1280, H = 820;

  const [drivers, setDrivers] = React.useState([
    { name: 'Iran / Strait',    low: 'Strait Open',  high: 'Strait Closed', val: oilDollarToScore(oilDriverImpliedDollar('Iran / Strait')) },
    { name: 'OPEC+ Policy',     low: 'More Supply',  high: 'Deeper Cuts',   val: oilDollarToScore(oilDriverImpliedDollar('OPEC+ Policy')) },
    { name: 'US Shale',         low: 'Surging',      high: 'Disciplined',   val: oilDollarToScore(oilDriverImpliedDollar('US Shale')) },
    { name: 'China Demand',     low: 'Weak',         high: 'Roaring',       val: oilDollarToScore(oilDriverImpliedDollar('China Demand')) },
    { name: 'Fed / Dollar',     low: 'Strong USD',   high: 'Weak USD',      val: oilDollarToScore(oilDriverImpliedDollar('Fed / Dollar')) },
    { name: 'SPR / Reserves',   low: 'Releases',     high: 'Refilling',     val: oilDollarToScore(oilDriverImpliedDollar('SPR / Reserves')) },
    { name: 'Russia / Ukraine', low: 'Ceasefire',    high: 'Escalation',    val: oilDollarToScore(oilDriverImpliedDollar('Russia / Ukraine')) },
  ]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [dragIdx, setDragIdx] = React.useState(null);
  const [readSet, setReadSet] = React.useState(() => new Set());
  // Accordion: which driver's news panel is expanded. Default to highest-weight driver (Iran / Strait).
  const [expandedDriver, setExpandedDriver] = React.useState('Iran / Strait');

  const MAX_WEIGHT = 0.25;
  const trackRefs = React.useRef({});

  // Stage 1: driver vals → oil delta
  // Each driver's contribution = (val-50)/50 × weight × scale ($25 if fully dialed)
  const oilMath = React.useMemo(() => {
    let oilDelta = 0;
    const contribs = drivers.map(d => {
      const w = OIL_DRIVER_WEIGHTS[d.name] || 0;
      const signed = (d.val - 50) / 50;
      const contrib = signed * w * 25; // full-range driver contrib = $25 × weight
      oilDelta += contrib;
      return { name: d.name, contrib, weight: w };
    });
    const projectedOil = OIL_PRICE_NOW + oilDelta;
    return { oilDelta, projectedOil, contribs };
  }, [drivers]);

  // Stage 2: oil delta → BTC headwind/tailwind
  const btcMath = React.useMemo(() => {
    const claudeBtc = oilMath.oilDelta * OIL_TO_BTC.claude;
    const gptBtc    = oilMath.oilDelta * OIL_TO_BTC.gpt;
    const consensusBtc = (claudeBtc + gptBtc) / 2;
    const projectedBtc = BTC_PRICE_NOW_I + consensusBtc;
    return { claudeBtc, gptBtc, consensusBtc, projectedBtc };
  }, [oilMath]);

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

  const fmtDollar = (v, pref = '$') => (v >= 0 ? '+' : '-') + pref + Math.abs(v).toFixed(2);
  const fmtBigDollar = (v) => (v >= 0 ? '+' : '') + '$' + Math.round(v).toLocaleString();
  const fmtOil = (v) => `$${v.toFixed(2)}`;

  const activeImplied = oilDriverImpliedDollar(drivers[activeIdx].name);

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
      userSelect: dragIdx !== null ? 'none' : 'auto',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`, background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="Global Gauntlet"
        style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
      <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>

        <TRTabBar current="impact" onNav={onNav} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <TRLiveStripInline />
          <TROptionsButton />
          <TRTradeButton />
          <TRGearInline />
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.oil }}>●</span>&nbsp; OIL → BTC · TWO-STAGE MODEL
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', height: H - 52 }}>

        {/* LEFT — Oil drivers */}
        <div style={{
          width: 480, background: T.ink100, borderRight: `1px solid ${T.edge}`,
          padding: '20px 22px 0', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1, color: T.textDim,
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 4,
          }}>Oil Drivers · 7 · Weighted Consensus</div>
          <div style={{
            fontSize: 15, fontWeight: 500, color: T.text,
            letterSpacing: -0.2, marginBottom: 14,
          }}>Weighted $/bbl sums to projected WTI</div>

          <div data-walk="driver-accordion" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 20, overflowY: 'auto', flex: 1 }}>
            {drivers.map((d, idx) => {
              const active = idx === activeIdx;
              const isOpen = expandedDriver === d.name;
              const tier = iDriverTier(d.val);
              const weight = OIL_DRIVER_WEIGHTS[d.name] || 0;
              const barW = (weight / MAX_WEIGHT) * 100;
              const implied = oilDriverImpliedDollar(d.name);
              const contrib = oilMath.contribs[idx].contrib;
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
                        marginLeft: 'auto', fontFamily: T.mono, fontSize: 10.5,
                        fontWeight: 600, color: contrib > 0 ? T.bull : contrib < 0 ? T.bear : T.textMid,
                        letterSpacing: 0.3, minWidth: 60, textAlign: 'right',
                      }}>{fmtDollar(contrib)}/bbl</div>
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
                        fontWeight: 500, width: 32, textAlign: 'right',
                      }}>{Math.round(weight * 100)}%</div>
                    </div>

                    <div
                      ref={el => trackRefs.current[idx] = el}
                      onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(idx)(e); }}
                      onClick={(e) => e.stopPropagation()}
                      tabIndex={0}
                      onKeyDown={handleKeyDown(idx)}
                      role="slider" aria-valuemin={0} aria-valuemax={100}
                      aria-valuenow={d.val} aria-label={d.name}
                      style={{ position: 'relative', height: 18, marginBottom: 4, cursor: 'pointer', touchAction: 'none', outline: 'none' }}>
                      <div style={{
                        position: 'absolute', top: 8, left: 0, right: 0, height: 2,
                        background: 'rgba(255,255,255,0.06)', borderRadius: 1,
                      }} />
                      <div style={{
                        position: 'absolute', top: 8, left: 0, width: `${d.val}%`, height: 2,
                        background: tier.color,
                        opacity: active ? 1 : 0.55,
                        borderRadius: 1,
                        transition: dragIdx === idx ? 'none' : 'width 120ms ease, background 140ms ease',
                      }} />
                      <div style={{
                        position: 'absolute', top: 2, left: `calc(${d.val}% - 7px)`,
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
                      fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.4,
                      pointerEvents: 'none',
                    }}>
                      <span>{d.low.toUpperCase()}</span>
                      <span>NEWS {fmtDollar(implied)}/bbl</span>
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
                        <span style={{ marginLeft: 'auto' }}>DBL-CLICK TO OPEN</span>
                      </div>
                      {(OIL_DRIVER_NEWS[d.name] || []).map((n, i) => {
                        const isRead = readSet.has(n.url);
                        const isNew = n.date === I_TODAY;
                        const sourceColor = isRead ? T.signal : (isNew ? '#4EA076' : T.textMid);
                        const cons = iConsensus(n);
                        return (
                          <div key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadSet(prev => { const next = new Set(prev); next.add(n.url); return next; });
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

        {/* RIGHT — Stage 1 oil readout + Stage 2 BTC headwind + contribution bars */}
        <div style={{
          flex: 1, padding: '20px 28px', display: 'flex', flexDirection: 'column',
          background: T.ink000, overflowY: 'auto',
        }}>
          {/* Stage 1 — Oil price projection */}
          <div style={{
            background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
            padding: '14px 18px 16px', marginBottom: 12,
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
              }}>{fmtDollar(oilMath.oilDelta)}/bbl</div>
            </div>

            {/* Contribution bars */}
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
                    onClick={() => setActiveIdx(i)}
                    style={{
                      display: 'grid', gridTemplateColumns: '140px 1fr 1fr 60px',
                      gap: 8, alignItems: 'center', cursor: 'pointer',
                      padding: '3px 4px',
                      borderRadius: 4,
                      background: i === activeIdx ? 'rgba(232,184,74,0.06)' : 'transparent',
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
                    }}>{fmtDollar(c.contrib)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage 2 — BTC headwind */}
          <div style={{
            background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
            padding: '14px 18px 16px', marginBottom: 12,
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
                  ${BTC_PRICE_NOW_I.toLocaleString()}
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
    </div>
  );
}

window.ImpactScreen = ImpactScreen;
