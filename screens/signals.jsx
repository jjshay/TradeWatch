// SignalsScreen — Tab 6: live dashboard of every key input that moves BTC / Oil / SPX.
// Grouped into 7 lanes: Fed & Rates, Equities, Crypto Flows, Regulation (CLARITY Act),
// Geopolitics / Negotiations, China, Oil & Commodities.
// Each tile carries: label, mono value, delta, 28-pt sparkline, status chip, impact targets.

const sigT = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A', oil: '#0077B5', spx: '#9AA3B2',
  bull: '#6FCF8E', bear: '#D96B6B', neutral: 'rgba(180,188,200,0.5)',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// Seeded pseudo-random so sparklines are stable between renders
function seededSpark(seed, n = 28, trend = 0) {
  let s = seed;
  const out = [];
  let v = 50;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    v += (r - 0.5 + trend * 0.08) * 14;
    out.push(v);
  }
  const min = Math.min(...out), max = Math.max(...out);
  return out.map(x => (x - min) / (max - min || 1));
}

function Sparkline({ data, color, w = 68, h = 22, trend }) {
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - v * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={w} cy={h - data[data.length - 1] * h} r="1.5" fill={color} />
    </svg>
  );
}

function ImpactTags({ tags }) {
  const T = sigT;
  const map = { BTC: T.btc, OIL: T.oil, SPX: T.spx };
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {tags.map(t => (
        <div key={t} style={{
          fontFamily: T.mono, fontSize: 8, fontWeight: 600, letterSpacing: 0.5,
          color: map[t], border: `0.5px solid ${map[t]}55`,
          padding: '1px 4px', borderRadius: 3, background: `${map[t]}0D`,
        }}>{t}</div>
      ))}
    </div>
  );
}

function SignalTile({ sig, onOpen }) {
  const T = sigT;
  const deltaColor = sig.dir === 'up' ? T.bull : sig.dir === 'down' ? T.bear : T.neutral;
  const arrow = sig.dir === 'up' ? '↑' : sig.dir === 'down' ? '↓' : '—';
  return (
    <div
      onClick={() => onOpen && onOpen(sig)}
      style={{
      background: T.ink200, border: `1px solid ${sig.hot ? 'rgba(232,184,74,0.3)' : T.edge}`,
      borderRadius: 9, padding: '11px 13px',
      display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative', overflow: 'hidden',
      cursor: onOpen ? 'pointer' : 'default',
      transition: 'border-color 120ms cubic-bezier(0.2,0.7,0.2,1)',
    }}>
      {sig.hot && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: T.signal, opacity: 0.7,
        }} />
      )}

      {/* top: label + impact tags */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{
          fontSize: 10, color: T.textMid, letterSpacing: 0.4,
          fontWeight: 500, flex: 1, minWidth: 0, lineHeight: 1.3,
        }}>{sig.label}</div>
        <ImpactTags tags={sig.impact} />
      </div>

      {/* mid: value + delta + spark */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{
            fontFamily: T.mono, fontSize: 18, fontWeight: 500,
            color: T.text, letterSpacing: -0.3, lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>{sig.value}</div>
          <div style={{
            fontFamily: T.mono, fontSize: 10, color: deltaColor,
            letterSpacing: 0.2, fontWeight: 500,
          }}>
            {arrow} {sig.delta}
          </div>
        </div>
        <Sparkline data={sig.spark} color={sig.dir === 'up' ? T.bull : sig.dir === 'down' ? T.bear : T.neutral} />
      </div>

      {/* bottom: status chip */}
      {sig.status && (
        <div style={{
          fontSize: 9.5, color: sig.statusColor || T.textMid,
          letterSpacing: 0.3, fontWeight: 500, lineHeight: 1.3,
          borderTop: `0.5px solid ${T.edge}`, paddingTop: 6,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{sig.status}</div>
      )}
    </div>
  );
}

function SignalsScreen({ onNav }) {
  const [collapsedLanes, setCollapsedLanes] = React.useState(new Set());
  const [openSignal, setOpenSignal] = React.useState(null);
  const [assetFilter, setAssetFilter] = React.useState(null); // 'BTC' | 'OIL' | 'SPX' | null

  // LIVE — BTC spot + 24h change (CoinGecko)
  const { data: livePrices } = (window.useAutoUpdate || (() => ({})))(
    'signals-prices',
    async () => {
      if (typeof LiveData === 'undefined') return null;
      const p = await LiveData.getCryptoPrices();
      return p && p.bitcoin ? { btc: p.bitcoin } : null;
    },
    { refreshKey: 'signals' }
  );

  // LIVE — US equities via Finnhub (requires key in Settings)
  const finnhubKey = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';
  const { data: liveStocks } = (window.useAutoUpdate || (() => ({})))(
    `signals-stocks-${finnhubKey ? 'on' : 'off'}`,
    async () => {
      if (!finnhubKey) return null;
      // Include macro proxies: ^VIX (volatility), ^TNX (10Y yield ×10), DX-Y.NYB (DXY).
      const symbols = ['SPY', 'DIA', 'QQQ', 'NVDA', 'MSTR', 'COIN', 'IBIT', '^VIX', '^TNX', 'DX-Y.NYB'];
      const results = {};
      for (const sym of symbols) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`);
          if (r.ok) {
            const q = await r.json();
            if (q && typeof q.c === 'number' && q.c > 0) {
              results[sym] = { price: q.c, changePct: q.dp, change: q.d };
            }
          }
        } catch (_) { /* skip failed symbol */ }
      }
      return Object.keys(results).length ? results : null;
    },
    { refreshKey: 'signals' }
  );

  const toggleLane = (id) => setCollapsedLanes(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const filterSig = (s) => !assetFilter || (s.impact && s.impact.includes(assetFilter));

  const T = sigT;
  const W = 1280, H = 820;

  const lanes = [
    {
      id: 'fed',
      label: 'Fed & Rates',
      desc: 'Cost of capital · liquidity · USD',
      accent: T.oil,
      signals: [
        { label: 'Fed Funds Target', value: '4.50%', delta: '-25bp · FOMC Jan', dir: 'down', impact: ['BTC', 'SPX'], spark: seededSpark(11, 28, -0.3), status: 'Next decision Apr 22', statusColor: T.signal, hot: true },
        { label: '25bp Cut Odds · May', value: '38%', delta: '+4 wk-over-wk', dir: 'up', impact: ['BTC', 'SPX'], spark: seededSpark(12, 28, 0.2), status: 'Kalshi · prediction mkt' },
        { label: '10Y Treasury', value: '4.21%', delta: '-8bp · 1w', dir: 'down', impact: ['BTC', 'SPX'], spark: seededSpark(13, 28, -0.2), status: 'Below 200d MA' },
        { label: '2s10s Spread', value: '+0.38', delta: '+12bp · steepening', dir: 'up', impact: ['SPX'], spark: seededSpark(14, 28, 0.3), status: 'No longer inverted · 3mo' },
        { label: 'DXY Dollar Index', value: '102.4', delta: '-0.6% · 1w', dir: 'down', impact: ['BTC', 'OIL'], spark: seededSpark(15, 28, -0.2), status: 'Weakening · BTC tailwind' },
        { label: 'HY Credit Spread', value: '318bp', delta: '+14bp · 2w', dir: 'up', impact: ['SPX'], spark: seededSpark(16, 28, 0.2), status: 'Risk appetite thinning' },
      ],
    },
    {
      id: 'equity',
      label: 'Equities',
      desc: 'S&P earnings · VIX · mega-cap',
      accent: T.spx,
      signals: [
        { label: 'S&P 500', value: '5,847', delta: '+0.4% · today', dir: 'up', impact: ['SPX'], spark: seededSpark(21, 28, 0.3), status: 'ATH within 0.8%' },
        { label: 'VIX', value: '14.2', delta: '-1.1 · 1w', dir: 'down', impact: ['SPX', 'BTC'], spark: seededSpark(22, 28, -0.4), status: 'Complacent regime' },
        { label: 'S&P Fwd P/E', value: '22.4×', delta: '+0.3 · 1m', dir: 'up', impact: ['SPX'], spark: seededSpark(23, 28, 0.2), status: '+1.2σ above 10y avg' },
        { label: 'NVDA', value: '$142.80', delta: '+2.1% · today', dir: 'up', impact: ['SPX'], spark: seededSpark(24, 28, 0.4), status: 'Earnings Apr 23', statusColor: T.signal, hot: true },
        { label: 'MSTR', value: '$341.22', delta: '+3.8% · today', dir: 'up', impact: ['BTC', 'SPX'], spark: seededSpark(25, 28, 0.5), status: 'Leverages BTC exposure' },
        { label: 'Put/Call Ratio', value: '0.82', delta: '-0.09 · 1w', dir: 'down', impact: ['SPX'], spark: seededSpark(26, 28, -0.3), status: 'Bullish skew' },
      ],
    },
    {
      id: 'crypto',
      label: 'Crypto Flows',
      desc: 'ETFs · on-chain · funding · cycle',
      accent: T.btc,
      signals: [
        { label: 'BTC Spot', value: '$88,420', delta: '+2.4% · today', dir: 'up', impact: ['BTC'], spark: seededSpark(31, 28, 0.4), status: '12% below all-time high' },
        { label: 'IBIT Net Flow · 5d', value: '+$1.2B', delta: '+320M · vs prior wk', dir: 'up', impact: ['BTC'], spark: seededSpark(32, 28, 0.5), status: 'Institutional accumulation' },
        { label: 'Spot BTC ETFs AUM', value: '$148.7B', delta: '+$2.1B · 1w', dir: 'up', impact: ['BTC'], spark: seededSpark(33, 28, 0.6), status: '14 funds · steady inflows' },
        { label: 'Perp Funding · 8h', value: '0.011%', delta: '-0.004 · 1w', dir: 'down', impact: ['BTC'], spark: seededSpark(34, 28, -0.2), status: 'Cooled · no leverage froth' },
        { label: 'BTC Realized Cap', value: '$682B', delta: '+$14B · 1m', dir: 'up', impact: ['BTC'], spark: seededSpark(35, 28, 0.3), status: 'On-chain cost basis rising' },
        { label: 'MVRV Z-Score', value: '2.8', delta: '+0.2 · 1m', dir: 'up', impact: ['BTC'], spark: seededSpark(36, 28, 0.3), status: 'Mid-cycle · not euphoric' },
        { label: 'Strategy (MSTR) BTC', value: '582,000', delta: '+7,000 · 1m', dir: 'up', impact: ['BTC'], spark: seededSpark(37, 28, 0.4), status: 'Ongoing treasury adds' },
        { label: 'Days Past Halving', value: '735d', delta: 'cycle mid-phase', dir: 'flat', impact: ['BTC'], spark: seededSpark(38, 28, 0.1), status: 'Historical peak window: +400–550d' },
      ],
    },
    {
      id: 'reg',
      label: 'Regulation',
      desc: 'CLARITY Act · SEC · Treasury · state',
      accent: '#5FC9C2',
      signals: [
        { label: 'CLARITY Act · Senate', value: '68% pass', delta: '+11 · last month', dir: 'up', impact: ['BTC'], spark: seededSpark(41, 28, 0.5), status: 'Vote Apr 24 · Polymarket', statusColor: T.signal, hot: true },
        { label: 'Spot ETH ETF · SEC', value: 'In review', delta: 'decision by Jul', dir: 'flat', impact: ['BTC'], spark: seededSpark(42, 28, 0.2), status: 'Precedent set by BTC ETFs' },
        { label: 'Strategic BTC Reserve', value: 'Exec Order', delta: 'active · acquiring', dir: 'up', impact: ['BTC'], spark: seededSpark(43, 28, 0.3), status: 'No forced selling · sovereign bid' },
        { label: 'State BTC Reserves', value: '11 states', delta: '+3 · YTD', dir: 'up', impact: ['BTC'], spark: seededSpark(44, 28, 0.4), status: 'TX, FL, WY leading' },
        { label: 'Stablecoin Bill · House', value: 'Committee', delta: 'markup scheduled', dir: 'up', impact: ['BTC'], spark: seededSpark(45, 28, 0.3), status: 'USDC/USDT framework' },
        { label: 'Fair Accounting (FASB)', value: 'Adopted', delta: 'corporates hold BTC', dir: 'up', impact: ['BTC'], spark: seededSpark(46, 28, 0.2), status: 'Boosted treasury adoption' },
      ],
    },
    {
      id: 'geo',
      label: 'Geopolitics & Negotiations',
      desc: 'Diplomatic flashpoints · trade talks',
      accent: '#D96B6B',
      signals: [
        { label: 'Iran Nuclear Talks', value: 'Stalling', delta: 'deadline Apr 27', dir: 'down', impact: ['OIL', 'SPX'], spark: seededSpark(51, 28, -0.4), status: 'Hormuz risk rising', statusColor: T.bear, hot: true },
        { label: 'Ukraine Ceasefire', value: 'Drafting', delta: 'Paris round 3', dir: 'up', impact: ['OIL', 'SPX'], spark: seededSpark(52, 28, 0.3), status: 'Energy price relief if signed' },
        { label: 'Israel–Gaza', value: 'Phase 2', delta: 'hostage deal stalled', dir: 'flat', impact: ['OIL'], spark: seededSpark(53, 28, -0.1), status: 'Tail risk to Hezbollah front' },
        { label: 'Yemen Red Sea Attacks', value: '3 · 30d', delta: '-5 vs prior 30d', dir: 'down', impact: ['OIL'], spark: seededSpark(54, 28, -0.3), status: 'Bab-el-Mandeb shipping up' },
        { label: 'Russia Sanctions', value: 'Active', delta: 'price cap enforced', dir: 'flat', impact: ['OIL'], spark: seededSpark(55, 28, 0), status: 'Seaborne discount ~$15' },
        { label: 'Taiwan Strait', value: '2 incursions · wk', delta: 'stable · no escalation', dir: 'flat', impact: ['SPX', 'OIL'], spark: seededSpark(56, 28, 0.1), status: 'Monitored · baseline activity' },
      ],
    },
    {
      id: 'china',
      label: 'China',
      desc: 'Stimulus · CNY · tariff posture',
      accent: '#B07BE6',
      signals: [
        { label: 'China GDP · Q1', value: '+4.8% YoY', delta: '+0.2 vs est', dir: 'up', impact: ['OIL', 'SPX'], spark: seededSpark(61, 28, 0.3), status: 'Property drag easing' },
        { label: 'PBoC 7d Reverse Repo', value: '1.50%', delta: '-10bp · Mar', dir: 'down', impact: ['BTC', 'SPX'], spark: seededSpark(62, 28, -0.3), status: 'Easing cycle ongoing' },
        { label: 'USD/CNH', value: '7.18', delta: '+0.3% · 1w', dir: 'up', impact: ['BTC', 'OIL'], spark: seededSpark(63, 28, 0.2), status: 'Yuan weakness → offshore BTC bid' },
        { label: 'Tariff · EV Batteries', value: '52.5%', delta: 'effective May 1', dir: 'up', impact: ['SPX'], spark: seededSpark(64, 28, 0.4), status: 'Supply chain reroute', statusColor: T.bear },
        { label: 'China Oil Imports', value: '10.8 Mbd', delta: '+0.4 Mbd · 1m', dir: 'up', impact: ['OIL'], spark: seededSpark(65, 28, 0.3), status: 'Demand firming' },
        { label: 'Taiwan Semi Export', value: 'Restricted', delta: 'Nvidia H200 curb', dir: 'flat', impact: ['SPX'], spark: seededSpark(66, 28, -0.2), status: 'AI capex spillover risk' },
      ],
    },
    {
      id: 'oil',
      label: 'Oil & Commodities',
      desc: 'Supply · demand · inventory · OPEC',
      accent: T.oil,
      signals: [
        { label: 'WTI Crude', value: '$78.42', delta: '+1.2% · today', dir: 'up', impact: ['OIL'], spark: seededSpark(71, 28, 0.3), status: 'Testing $80 resistance' },
        { label: 'Brent', value: '$82.15', delta: '+1.4% · today', dir: 'up', impact: ['OIL'], spark: seededSpark(72, 28, 0.3), status: 'Spread to WTI $3.73' },
        { label: 'OPEC+ Production', value: '41.8 Mbd', delta: 'voluntary cuts held', dir: 'flat', impact: ['OIL'], spark: seededSpark(73, 28, 0), status: 'Ministerial May 8', statusColor: T.signal, hot: true },
        { label: 'US SPR', value: '396 Mbbl', delta: '+1.2M · 1w', dir: 'up', impact: ['OIL'], spark: seededSpark(74, 28, 0.3), status: 'Slow refill ongoing' },
        { label: 'EIA Crude Inv · 1w', value: '-4.1 Mbbl', delta: 'draw · bullish', dir: 'down', impact: ['OIL'], spark: seededSpark(75, 28, -0.3), status: 'Demand > refinery supply' },
        { label: 'Gold', value: '$3,418', delta: '+0.8% · today', dir: 'up', impact: ['BTC'], spark: seededSpark(76, 28, 0.4), status: 'Safe-haven bid alongside BTC' },
      ],
    },
  ];

  // LIVE overlay — merge live prices onto the matching lane cards if data arrived.
  const liveLabelMap = {
    'BTC Spot':  livePrices && livePrices.btc ? {
      value: '$' + Math.round(livePrices.btc.usd).toLocaleString('en-US'),
      delta: `${livePrices.btc.usd_24h_change >= 0 ? '+' : ''}${livePrices.btc.usd_24h_change.toFixed(2)}% · 24h`,
      dir: livePrices.btc.usd_24h_change >= 0 ? 'up' : 'down',
      status: 'LIVE · CoinGecko',
    } : null,
    'S&P 500':   liveStocks && liveStocks.SPY ? {
      value: liveStocks.SPY.price.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      delta: `${liveStocks.SPY.changePct >= 0 ? '+' : ''}${liveStocks.SPY.changePct.toFixed(2)}% · today`,
      dir: liveStocks.SPY.changePct >= 0 ? 'up' : 'down',
      status: 'LIVE · Finnhub · SPY proxy',
    } : null,
    'NVDA':      liveStocks && liveStocks.NVDA ? {
      value: '$' + liveStocks.NVDA.price.toFixed(2),
      delta: `${liveStocks.NVDA.changePct >= 0 ? '+' : ''}${liveStocks.NVDA.changePct.toFixed(2)}% · today`,
      dir: liveStocks.NVDA.changePct >= 0 ? 'up' : 'down',
      status: 'LIVE · Finnhub',
    } : null,
    'MSTR':      liveStocks && liveStocks.MSTR ? {
      value: '$' + liveStocks.MSTR.price.toFixed(2),
      delta: `${liveStocks.MSTR.changePct >= 0 ? '+' : ''}${liveStocks.MSTR.changePct.toFixed(2)}% · today`,
      dir: liveStocks.MSTR.changePct >= 0 ? 'up' : 'down',
      status: 'LIVE · Finnhub',
    } : null,
    'VIX':       liveStocks && liveStocks['^VIX'] ? {
      value: liveStocks['^VIX'].price.toFixed(2),
      delta: `${liveStocks['^VIX'].changePct >= 0 ? '+' : ''}${liveStocks['^VIX'].changePct.toFixed(2)}% · today`,
      // VIX going up = fear rising = bearish for risk; keep neutral semantics via dir
      dir: liveStocks['^VIX'].changePct >= 0 ? 'up' : 'down',
      status: 'LIVE · Finnhub · ^VIX',
    } : null,
    '10Y Treasury': liveStocks && liveStocks['^TNX'] ? {
      // ^TNX is yield ×10, e.g. 42.1 → 4.21%
      value: (liveStocks['^TNX'].price / 10).toFixed(2) + '%',
      delta: `${liveStocks['^TNX'].changePct >= 0 ? '+' : ''}${liveStocks['^TNX'].changePct.toFixed(2)}% · today`,
      dir: liveStocks['^TNX'].changePct >= 0 ? 'up' : 'down',
      status: 'LIVE · Finnhub · ^TNX',
    } : null,
    'DXY Dollar Index': liveStocks && liveStocks['DX-Y.NYB'] ? {
      value: liveStocks['DX-Y.NYB'].price.toFixed(2),
      delta: `${liveStocks['DX-Y.NYB'].changePct >= 0 ? '+' : ''}${liveStocks['DX-Y.NYB'].changePct.toFixed(2)}% · today`,
      dir: liveStocks['DX-Y.NYB'].changePct >= 0 ? 'up' : 'down',
      status: 'LIVE · Finnhub · DX-Y.NYB',
    } : null,
  };
  for (const lane of lanes) {
    lane.signals = lane.signals.map(s => {
      const live = liveLabelMap[s.label];
      return live ? { ...s, ...live, hot: true, statusColor: T.signal } : s;
    });
  }

  // Top-line composite
  const composite = [
    { label: 'Macro Tilt', value: 'Risk-On', sub: '64 of 100', color: T.bull },
    { label: 'BTC Cycle', value: 'Mid-Phase', sub: '+735d post-halving', color: T.btc },
    { label: 'Oil Regime', value: 'Geo-Risk', sub: 'Hormuz in focus', color: T.oil },
    { label: 'Fed Path', value: '1–2 Cuts', sub: '2026 implied', color: T.spx },
  ];

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`,
        background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="GG"
          style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(201,162,39,0.25))' }} />
        <div style={{ marginLeft: 10, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 600, color: T.signal, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: T.mono }}>Global Gauntlet</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>
        </div>

        <div style={{
          marginLeft: 32, display: 'flex', padding: 3,
          background: T.ink200, borderRadius: 10, border: `1px solid ${T.edge}`,
          height: 34, alignItems: 'center',
        }}>
          {['Historical', 'Projected', 'Impact', 'Recommend', 'News', 'Calendar', 'Signals'].map((t, idx) => {
            const active = idx === 6;
            return (
              <div key={t} onClick={() => !active && onNav && onNav(t === 'Recommend' ? 'recommend' : t.toLowerCase())} style={{
                cursor: active ? 'default' : 'pointer',
                padding: '0 13px', height: 28, display: 'flex', alignItems: 'center',
                fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                background: active ? T.ink400 : 'transparent',
                color: active ? T.text : T.textMid,
                boxShadow: active ? `inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)` : 'none',
              }}>{t}</div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <TRLiveStripInline />
          <TRGearInline />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: 3, background: T.bull,
              boxShadow: `0 0 8px ${T.bull}`,
            }} />
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textMid, letterSpacing: 0.4 }}>
              LIVE · 43 SIGNALS
            </div>
          </div>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: T.ink200,
            border: `1px solid ${T.edge}`, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center', gap: 3,
          }}>
            <div style={{ width: 12, height: 1, background: T.textMid }} />
            <div style={{ width: 12, height: 1, background: T.textMid }} />
            <div style={{ width: 12, height: 1, background: T.textMid }} />
          </div>
        </div>
      </div>

      {/* Composite strip */}
      <div style={{
        height: 60, display: 'flex',
        borderBottom: `1px solid ${T.edge}`, background: T.ink100,
      }}>
        {composite.map((c, idx) => (
          <div key={c.label} style={{
            flex: 1, padding: '10px 20px',
            borderRight: idx < composite.length - 1 ? `1px solid ${T.edge}` : 'none',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
          }}>
            <div style={{
              fontSize: 9, letterSpacing: 0.9, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500,
            }}>{c.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{
                fontFamily: T.mono, fontSize: 15, fontWeight: 500,
                color: c.color, letterSpacing: -0.2,
              }}>{c.value}</div>
              <div style={{
                fontFamily: T.mono, fontSize: 10, color: T.textMid, letterSpacing: 0.3,
              }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Lanes grid */}
      <div style={{
        height: H - 52 - 60, padding: '16px 20px',
        overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Asset filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: -4 }}>
          {[{ k: null, label: 'All' }, { k: 'BTC', label: 'BTC' }, { k: 'OIL', label: 'OIL' }, { k: 'SPX', label: 'SPX' }].map(p => {
            const on = assetFilter === p.k;
            return (
              <div key={p.label}
                onClick={() => setAssetFilter(p.k)}
                style={{
                  padding: '4px 10px', fontSize: 10.5, letterSpacing: 0.3,
                  fontFamily: T.mono, fontWeight: 600,
                  background: on ? T.signal : T.ink200,
                  color: on ? T.ink000 : T.textMid,
                  border: `1px solid ${on ? T.signal : T.edge}`, borderRadius: 6,
                  cursor: on ? 'default' : 'pointer',
                }}>{p.label}</div>
            );
          })}
          {assetFilter && (
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, alignSelf: 'center', marginLeft: 6 }}>
              filtering · {lanes.reduce((n, l) => n + l.signals.filter(filterSig).length, 0)} signals
            </div>
          )}
        </div>

        {lanes.map(lane => {
          const collapsed = collapsedLanes.has(lane.id);
          const visibleSigs = lane.signals.filter(filterSig);
          if (assetFilter && visibleSigs.length === 0) return null;
          return (
          <div key={lane.id}>
            {/* Lane header */}
            <div
              onClick={() => toggleLane(lane.id)}
              style={{
                display: 'flex', alignItems: 'baseline', marginBottom: 8, gap: 10,
                cursor: 'pointer', userSelect: 'none',
              }}>
              <div style={{
                width: 3, height: 14, background: lane.accent, borderRadius: 1.5,
                alignSelf: 'center',
              }} />
              <div style={{
                fontSize: 12, fontWeight: 500, color: T.text, letterSpacing: -0.1,
              }}>{lane.label}</div>
              <div style={{
                fontSize: 10, color: T.textDim, letterSpacing: 0.2,
              }}>{lane.desc}</div>
              <div style={{
                marginLeft: 'auto', fontFamily: T.mono, fontSize: 9,
                color: T.textDim, letterSpacing: 0.4,
              }}>{visibleSigs.length}{assetFilter ? '/' + lane.signals.length : ''} SIGNALS {collapsed ? '▸' : '▾'}</div>
            </div>

            {/* Signals grid */}
            {!collapsed && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 8,
              }}>
                {visibleSigs.map(sig => (
                  <SignalTile key={sig.label} sig={sig} onOpen={setOpenSignal} />
                ))}
              </div>
            )}
          </div>
        );})}

        <div style={{ height: 8 }} />
      </div>

      {/* Signal detail modal */}
      {openSignal && (
        <div
          onClick={() => setOpenSignal(null)}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(7,9,12,0.72)',
            backdropFilter: 'blur(12px) saturate(150%)',
            WebkitBackdropFilter: 'blur(12px) saturate(150%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50, padding: 40,
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, background: T.ink100, border: `1px solid ${T.edgeHi}`,
              borderRadius: 14, padding: '24px 28px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.08)',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: T.textDim,
                textTransform: 'uppercase', fontWeight: 600,
              }}>Signal Detail</div>
              {openSignal.hot && (
                <div style={{
                  padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(232,184,74,0.15)',
                  border: '0.5px solid rgba(232,184,74,0.4)',
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.8, color: T.signal,
                }}>HOT</div>
              )}
              <div style={{ marginLeft: 'auto' }}>
                <div
                  onClick={() => setOpenSignal(null)}
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: T.ink300, border: `1px solid ${T.edge}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: T.textMid, fontSize: 12, lineHeight: 1,
                  }}>✕</div>
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: T.text, letterSpacing: -0.2, marginBottom: 8 }}>
              {openSignal.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
              <div style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 500, color: T.text, letterSpacing: -0.3 }}>
                {openSignal.value}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: 12,
                color: openSignal.dir === 'up' ? T.bull : openSignal.dir === 'down' ? T.bear : T.neutral,
              }}>
                {openSignal.dir === 'up' ? '↑' : openSignal.dir === 'down' ? '↓' : '—'} {openSignal.delta}
              </div>
            </div>
            {/* Large sparkline */}
            <div style={{ background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <Sparkline data={openSignal.spark} color={openSignal.dir === 'down' ? T.bear : T.bull} w={460} h={80} />
            </div>
            {openSignal.status && (
              <div style={{ fontSize: 13, lineHeight: 1.55, color: T.textMid, marginBottom: 14 }}>
                {openSignal.status}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14, borderTop: `1px solid ${T.edge}` }}>
              <div style={{
                fontSize: 9.5, letterSpacing: 0.8, color: T.textDim,
                textTransform: 'uppercase', fontWeight: 500,
              }}>Impacts</div>
              <div style={{ marginLeft: 'auto' }}>
                <ImpactTags tags={openSignal.impact || []} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.SignalsScreen = SignalsScreen;
