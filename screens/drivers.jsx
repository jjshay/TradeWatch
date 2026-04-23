// DriversScreen — Tab 1 (new default): distilled scoreboard of the
// ~15 signals that actually move BTC / WTI / SPX before price.
// Each tile pulls live data from an engine module, interprets direction
// into a long/short/neutral signal, and deep-links to the full panel.

const drT = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B', neutral: 'rgba(180,188,200,0.55)',
  btc: '#F7931A', oil: '#0077B5', spx: '#9AA3B2',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

function arrow(sig) { return sig === 'long' ? '↑' : sig === 'short' ? '↓' : '↔'; }
function sigColor(T, sig) { return sig === 'long' ? T.bull : sig === 'short' ? T.bear : T.neutral; }

// Driver tile — self-contained cell. `loader` returns { value, delta, signal, note }.
function DriverTile({ label, kicker, loader, onClick, T, bgAccent, explainKey }) {
  const [state, setState] = React.useState({ loading: true });
  React.useEffect(() => {
    let active = true;
    const go = async () => {
      try {
        const res = await loader();
        if (active) setState({ loading: false, ...(res || {}) });
      } catch (e) {
        if (active) setState({ loading: false, error: (e && e.message) || '—' });
      }
    };
    go();
    const iv = setInterval(go, 120_000); // 2 min refresh
    return () => { active = false; clearInterval(iv); };
  }, []);

  const sig = state.signal || 'neutral';
  const col = sigColor(T, sig);

  return (
    <div onClick={onClick} title={state.note || ''} style={{
      background: T.ink200,
      border: `1px solid ${bgAccent ? `${col}55` : T.edge}`,
      borderRadius: 9, padding: '10px 12px',
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column', gap: 4,
      minHeight: 78,
      transition: 'border-color 120ms cubic-bezier(0.2,0.7,0.2,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          fontSize: 9.5, letterSpacing: 0.5, color: T.textMid,
          fontWeight: 500, lineHeight: 1.3, flex: 1, display: 'flex', alignItems: 'center',
        }}>
          {label}
          {explainKey && typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && window.TR_EXPLAIN[explainKey] &&
            <TRInfoIcon text={window.TR_EXPLAIN[explainKey]} size={10} />}
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: 14, fontWeight: 700,
          color: col, lineHeight: 1,
        }}>{arrow(sig)}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{
          fontFamily: T.mono, fontSize: 14, fontWeight: 500,
          color: state.loading ? T.textDim : T.text, letterSpacing: -0.2,
        }}>{state.loading ? '…' : (state.value != null ? state.value : '—')}</div>
        {state.delta != null && (
          <div style={{
            fontFamily: T.mono, fontSize: 10, color: col, letterSpacing: 0.2,
          }}>{state.delta}</div>
        )}
      </div>
      {kicker && (
        <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.3, lineHeight: 1.3 }}>
          {kicker}
        </div>
      )}
    </div>
  );
}

// Group consensus — did its tiles net bullish / bearish / mixed?
function groupConsensus(signals) {
  const L = signals.filter(s => s === 'long').length;
  const S = signals.filter(s => s === 'short').length;
  if (L === 0 && S === 0) return { label: 'NO DATA', color: 'dim' };
  if (L >= signals.length - 1 && S === 0) return { label: 'BULL', color: 'bull' };
  if (S >= signals.length - 1 && L === 0) return { label: 'BEAR', color: 'bear' };
  if (L > S * 1.5) return { label: 'LEAN BULL', color: 'bull' };
  if (S > L * 1.5) return { label: 'LEAN BEAR', color: 'bear' };
  return { label: 'MIXED', color: 'neutral' };
}

function DriversScreen({ onNav }) {
  const T = drT;
  const W = 1280, H = 820;
  const [tileSigs, setTileSigs] = React.useState({}); // id -> signal
  const reportSig = React.useCallback((id, sig) => {
    setTileSigs(prev => (prev[id] === sig ? prev : { ...prev, [id]: sig }));
  }, []);

  // ═════════════════════════ DRIVER DEFINITIONS ═════════════════════════
  // Each: { id, label, group, kicker, load, onOpen }
  // load() must return { value, delta, signal, note }. signal ∈ long|short|neutral.

  const fnum = (n, d = 0) => n == null || !isFinite(n) ? null : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
  const fusd = (n, d = 0) => n == null || !isFinite(n) ? null : '$' + fnum(n, d);
  const fpct = (n, d = 1) => n == null || !isFinite(n) ? null : (n >= 0 ? '+' : '') + n.toFixed(d) + '%';

  const DRIVERS = [
    // ─── REGIME ───
    {
      id: 'regime-dxy', explain: 'dxy', group: 'regime', label: 'DXY · Dollar Index', kicker: 'Strong USD = headwind for BTC/oil',
      onOpen: () => window.openTRFRED && window.openTRFRED(),
      load: async () => {
        const k = window.TR_SETTINGS?.keys?.finnhub;
        if (!k) return { value: '—', note: 'Add Finnhub key' };
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent('DX-Y.NYB')}&token=${k}`);
        const j = await r.json();
        if (!j?.c) return {};
        return {
          value: j.c.toFixed(2),
          delta: fpct(j.dp),
          signal: j.dp > 0.3 ? 'short' : j.dp < -0.3 ? 'long' : 'neutral', // strong USD = bad for risk
          note: 'Rising DXY compresses risk-asset prices',
        };
      },
    },
    {
      id: 'regime-vix', explain: 'vix', group: 'regime', label: 'VIX · Equity Fear', kicker: 'VIX >20 = risk-off',
      onOpen: () => onNav && onNav('signals'),
      load: async () => {
        const k = window.TR_SETTINGS?.keys?.finnhub;
        if (!k) return { value: '—', note: 'Add Finnhub key' };
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent('^VIX')}&token=${k}`);
        const j = await r.json();
        if (!j?.c) return {};
        return {
          value: j.c.toFixed(2),
          delta: fpct(j.dp),
          signal: j.c < 15 ? 'long' : j.c > 22 ? 'short' : 'neutral',
          note: 'Calm VIX supports risk-on rallies',
        };
      },
    },
    {
      id: 'regime-fg', explain: 'fng', group: 'regime', label: 'Fear & Greed', kicker: 'Contrarian at extremes',
      onOpen: () => onNav && onNav('summary'),
      load: async () => {
        if (typeof LiveData === 'undefined') return {};
        const j = await LiveData.getFearGreed();
        if (!j?.data?.[0]) return {};
        const v = parseInt(j.data[0].value, 10);
        return {
          value: v,
          delta: j.data[0].value_classification,
          signal: v < 30 ? 'long' : v > 75 ? 'short' : 'neutral', // contrarian
          note: 'Extreme fear = contrarian buy · Extreme greed = trim',
        };
      },
    },
    {
      id: 'regime-gdelt', explain: 'gdelt', group: 'regime', label: 'GDELT Tone · World', kicker: 'Global conflict heat',
      onOpen: () => window.openTRGDELT && window.openTRGDELT(),
      load: async () => {
        if (typeof GDELTData === 'undefined') return {};
        try {
          const rows = await GDELTData.search('', { timespan: '1d', limit: 50 });
          if (!rows?.length) return {};
          const tones = rows.map(r => Number(r.tone || 0)).filter(n => isFinite(n));
          const avg = tones.reduce((a, b) => a + b, 0) / (tones.length || 1);
          return {
            value: avg.toFixed(2),
            delta: `${rows.length} articles`,
            signal: avg < -5 ? 'short' : avg > 0 ? 'long' : 'neutral',
            note: 'More negative = risk-off geopolitical narrative',
          };
        } catch { return {}; }
      },
    },

    // ═══ BTC ═══
    {
      id: 'btc-ibit', explain: 'ibit-flow', group: 'btc', label: 'IBIT · ETF Net Flow', kicker: '7-day institutional demand',
      onOpen: () => window.openTRETF && window.openTRETF(),
      load: async () => {
        if (typeof ETFFlows === 'undefined') return {};
        try {
          const sum = await ETFFlows.getSummary();
          if (!sum?.btc) return {};
          const wtd = sum.btc.wtd;
          return {
            value: fusd(wtd, 0) + 'M',
            delta: `${sum.btc.streakDays || 0}d streak`,
            signal: wtd > 500 ? 'long' : wtd < -300 ? 'short' : 'neutral',
            note: 'Persistent ETF inflows = structural bid',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'btc-funding', explain: 'btc-funding', group: 'btc', label: 'BTC Perp Funding · Avg', kicker: 'Leverage crowding',
      onOpen: () => window.openTRFunding && window.openTRFunding(),
      load: async () => {
        if (typeof FundingRates === 'undefined') return {};
        try {
          const a = await FundingRates.getAverage();
          const r = a?.btc?.avg;
          if (r == null) return {};
          const pct = r * 100;
          return {
            value: pct.toFixed(3) + '%',
            delta: `${a.btc.exchanges || 0} ex`,
            // Hot long = contrarian short signal
            signal: pct > 0.015 ? 'short' : pct < -0.005 ? 'long' : 'neutral',
            note: 'High positive funding = crowded long · reverse is true',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'btc-reserves', explain: 'btc-reserves', group: 'btc', label: 'BTC on Exchanges', kicker: 'Outflows = accumulation',
      onOpen: () => window.openTRReserves && window.openTRReserves(),
      load: async () => {
        if (typeof ExchangeReserves === 'undefined') return {};
        try {
          const d = await ExchangeReserves.getBTCReserves();
          if (!d) return {};
          return {
            value: '$' + (d.total / 1e9).toFixed(0) + 'B',
            delta: fpct((d.trend7d || 0) * 100, 2),
            signal: (d.trend7d || 0) < -0.005 ? 'long' : (d.trend7d || 0) > 0.005 ? 'short' : 'neutral',
            note: 'BTC leaving exchanges = holders moving to cold storage',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'btc-stables', explain: 'btc-stables', group: 'btc', label: 'Stablecoin Supply · USDT', kicker: 'Fresh liquidity',
      onOpen: () => window.openTRStables && window.openTRStables(),
      load: async () => {
        if (typeof StableData === 'undefined') return {};
        try {
          const c = await StableData.getAllCurrent?.();
          if (!c?.tether) return {};
          const delta7d = c.tether.change7d;
          return {
            value: '$' + (c.tether.supply / 1e9).toFixed(1) + 'B',
            delta: fpct(delta7d, 2),
            signal: delta7d > 0.3 ? 'long' : delta7d < -0.3 ? 'short' : 'neutral',
            note: 'USDT minting = new dry powder entering crypto',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'btc-policy', explain: 'btc-policy', group: 'btc', label: 'CLARITY Act · Senate', kicker: 'Binary regulatory catalyst',
      onOpen: () => window.openTRPrediction && window.openTRPrediction(),
      load: async () => {
        if (typeof PredictionMarkets === 'undefined') return {};
        try {
          const rows = await PredictionMarkets.fetchRelevant?.();
          const m = (rows || []).find(r => /clarity/i.test(r.title));
          if (!m) return { value: 'no live mkt' };
          const pct = Math.round((m.yesPrice || 0) * 100);
          return {
            value: pct + '%',
            delta: m.source,
            signal: pct > 70 ? 'long' : pct < 40 ? 'short' : 'neutral',
            note: 'Passage = structural BTC bid via Strategic Reserve path',
          };
        } catch { return {}; }
      },
    },

    // ═══ WTI Oil ═══
    {
      id: 'oil-hormuz', explain: 'hormuz-mil', group: 'wti', label: 'Hormuz · US MIL flights', kicker: 'Live CENTCOM aircraft',
      onOpen: () => onNav && onNav('flights'),
      load: async () => {
        if (typeof MilitaryFlights === 'undefined') return {};
        try {
          const d = await MilitaryFlights.getMidEast();
          if (!d) return {};
          const n = d.usMilCount;
          return {
            value: n,
            delta: `${d.total || 0} tot`,
            signal: n > 10 ? 'long' : n < 4 ? 'short' : 'neutral',
            note: 'Refueler/bomber buildup = oil risk-premium spike',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'oil-wti', explain: 'wti-spot', group: 'wti', label: 'WTI Spot', kicker: 'Underlying price',
      onOpen: () => onNav && onNav('prices'),
      load: async () => {
        try {
          const r = await fetch('https://stooq.com/q/l/?s=cl.f&f=sohlc&h&e=csv');
          const text = await r.text();
          const row = text.trim().split('\n')[1]?.split(',');
          if (!row) return {};
          const open = parseFloat(row[1]), close = parseFloat(row[4]);
          if (!isFinite(close)) return {};
          const chg = ((close - open) / open) * 100;
          return {
            value: '$' + close.toFixed(2),
            delta: fpct(chg, 2),
            signal: chg > 1.5 ? 'long' : chg < -1.5 ? 'short' : 'neutral',
            note: 'Confirms direction signal from drivers above',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'oil-dxy', explain: 'oil-dxy', group: 'wti', label: 'DXY (inverse)', kicker: 'Stronger $ = oil headwind',
      onOpen: () => window.openTRFRED && window.openTRFRED(),
      load: async () => {
        const k = window.TR_SETTINGS?.keys?.finnhub;
        if (!k) return {};
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent('DX-Y.NYB')}&token=${k}`);
        const j = await r.json();
        if (!j?.c) return {};
        return {
          value: j.c.toFixed(2),
          delta: fpct(j.dp),
          signal: j.dp > 0.3 ? 'short' : j.dp < -0.3 ? 'long' : 'neutral',
          note: 'Inverse to oil — see DXY tile in Regime',
        };
      },
    },
    {
      id: 'oil-opec', explain: 'opec', group: 'wti', label: 'Brent − WTI Spread', kicker: 'Global supply tightness proxy',
      onOpen: () => window.openTROPEC && window.openTROPEC(),
      load: async () => {
        // Free, no-key proxy via Stooq futures quotes.
        // cb.f = Brent front month, cl.f = WTI front month.
        try {
          const [rB, rW] = await Promise.all([
            fetch('https://stooq.com/q/l/?s=cb.f&f=sohlc&h&e=csv'),
            fetch('https://stooq.com/q/l/?s=cl.f&f=sohlc&h&e=csv'),
          ]);
          const [tB, tW] = await Promise.all([rB.text(), rW.text()]);
          const brent = parseFloat(tB.trim().split('\n')[1]?.split(',')[4]);
          const wti = parseFloat(tW.trim().split('\n')[1]?.split(',')[4]);
          if (!isFinite(brent) || !isFinite(wti)) return {};
          const spread = brent - wti;
          return {
            value: '$' + spread.toFixed(2),
            delta: 'Brent $' + brent.toFixed(2),
            // Wide Brent premium = tight global supply / geo risk → long oil
            signal: spread > 4 ? 'long' : spread < 1.5 ? 'short' : 'neutral',
            note: 'Brent > WTI by $4+ = tight global supply / OPEC discipline',
          };
        } catch { return {}; }
      },
    },
    {
      id: 'oil-iran', explain: 'iran-deadline', group: 'wti', label: 'Iran Nuclear · Deadline', kicker: 'JCPOA-2 countdown',
      onOpen: () => onNav && onNav('calendar'),
      load: async () => {
        const deadline = new Date('2026-04-27T00:00:00Z');
        const days = Math.ceil((deadline - Date.now()) / 86400000);
        return {
          value: days > 0 ? `${days}d` : 'passed',
          delta: '27 Apr 2026',
          signal: days > 0 && days <= 7 ? 'long' : 'neutral', // near deadline = risk premium
          note: 'Near-deadline = escalation premium in oil',
        };
      },
    },

    // ═══ SPX ═══
    {
      id: 'spx-10y', explain: 'spx-10y', group: 'spx', label: '10Y Treasury', kicker: 'Discount rate for multiples',
      onOpen: () => window.openTRTreasury && window.openTRTreasury(),
      load: async () => {
        const k = window.TR_SETTINGS?.keys?.finnhub;
        if (!k) return {};
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent('^TNX')}&token=${k}`);
        const j = await r.json();
        if (!j?.c) return {};
        const yld = j.c / 10;
        return {
          value: yld.toFixed(2) + '%',
          delta: fpct(j.dp),
          signal: yld > 4.5 ? 'short' : yld < 3.8 ? 'long' : 'neutral',
          note: 'Falling 10Y = multiple expansion tailwind',
        };
      },
    },
    {
      id: 'spx-hy', explain: 'spx-hy', group: 'spx', label: 'HY Credit Spread', kicker: 'Risk-off canary',
      onOpen: () => window.openTRFRED && window.openTRFRED(),
      load: async () => {
        if (typeof window.FREDData === 'undefined') return {};
        const rows = await window.FREDData.getSeries('BAMLH0A0HYM2', 10);
        if (!rows || !rows.length) return {};
        const vals = rows.filter(r => r.value != null);
        if (!vals.length) return {};
        const latest = vals[0].value;
        const prior = vals[1] ? vals[1].value : null;
        const delta = prior != null ? latest - prior : null;
        return {
          value: latest.toFixed(2) + '%',
          delta: delta != null ? ((delta >= 0 ? '+' : '') + delta.toFixed(2) + ' bp') : vals[0].date,
          // Widening HY OAS = risk-off; >3.5% = stress
          signal: latest > 3.8 ? 'short' : latest < 3.0 ? 'long' : 'neutral',
          note: 'Widening HY OAS = risk-off repricing · BAMLH0A0HYM2',
        };
      },
    },
    {
      id: 'spx-2s10s', explain: 'spx-2s10s', group: 'spx', label: '2s10s Spread', kicker: 'Recession lead',
      onOpen: () => window.openTRRecession && window.openTRRecession(),
      load: async () => {
        if (typeof window.FREDData === 'undefined') return {};
        const rows = await window.FREDData.getSeries('T10Y2Y', 10);
        if (!rows || !rows.length) return {};
        const vals = rows.filter(r => r.value != null);
        if (!vals.length) return {};
        const latest = vals[0].value;
        const prior = vals[1] ? vals[1].value : null;
        const delta = prior != null ? latest - prior : null;
        return {
          value: latest.toFixed(2) + '%',
          delta: delta != null ? ((delta >= 0 ? '+' : '') + (delta * 100).toFixed(0) + ' bp') : vals[0].date,
          // Inverted (<0) = recession warning for equities; re-steepening (>0.5) = late-cycle
          signal: latest < 0 ? 'short' : latest > 0.5 ? 'neutral' : 'neutral',
          note: 'Re-steepening from inversion = late-cycle · T10Y2Y',
        };
      },
    },
    {
      id: 'spx-vix', explain: 'spx-vix', group: 'spx', label: 'VIX', kicker: 'Fear regime',
      onOpen: () => onNav && onNav('signals'),
      load: async () => {
        const k = window.TR_SETTINGS?.keys?.finnhub;
        if (!k) return {};
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent('^VIX')}&token=${k}`);
        const j = await r.json();
        if (!j?.c) return {};
        return {
          value: j.c.toFixed(2),
          delta: fpct(j.dp),
          signal: j.c < 15 ? 'long' : j.c > 22 ? 'short' : 'neutral',
          note: 'Calm VIX = dip-buying works',
        };
      },
    },
    {
      id: 'spx-recession', explain: 'spx-recession', group: 'spx', label: 'NY Fed Recession Prob', kicker: '12-month ahead',
      onOpen: () => window.openTRRecession && window.openTRRecession(),
      load: async () => {
        if (typeof window.FREDData === 'undefined') return {};
        const rows = await window.FREDData.getSeries('RECPROUSM156N', 12);
        if (!rows || !rows.length) return {};
        const vals = rows.filter(r => r.value != null);
        if (!vals.length) return {};
        const latest = vals[0].value;
        const prior = vals[1] ? vals[1].value : null;
        const delta = prior != null ? latest - prior : null;
        return {
          value: (latest * 100).toFixed(1) + '%',
          delta: delta != null ? ((delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + ' pp') : vals[0].date,
          // Rising probability = de-risk equities
          signal: latest > 0.25 ? 'short' : latest < 0.10 ? 'long' : 'neutral',
          note: 'Rising probability = de-risk equities · NY Fed RECPROUSM156N',
        };
      },
    },
  ];

  // Render helpers
  const groupTiles = (group) => DRIVERS.filter(d => d.group === group);

  const consensusFor = (group) => {
    const ids = groupTiles(group).map(d => d.id);
    const sigs = ids.map(id => tileSigs[id] || 'neutral');
    return groupConsensus(sigs);
  };
  const verdictColor = (c) => c.color === 'bull' ? T.bull : c.color === 'bear' ? T.bear : T.neutral;

  const ReportingTile = (d) => (
    <DriverTile
      key={d.id}
      T={T}
      label={d.label}
      kicker={d.kicker}
      explainKey={d.explain}
      onClick={d.onOpen}
      bgAccent
      loader={async () => {
        const r = await d.load();
        reportSig(d.id, r?.signal || 'neutral');
        return r;
      }}
    />
  );

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`, background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="GG"
          style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
        <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>
        <div style={{ marginLeft: 32 }}>
          {typeof TRTabBar !== 'undefined' && <TRTabBar current="drivers" onNav={onNav} />}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {typeof TRLiveStripInline !== 'undefined' && <TRLiveStripInline />}
          {typeof TRGearInline !== 'undefined' && <TRGearInline />}
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; KEY DRIVERS
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{
        height: H - 52, padding: '16px 20px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Regime strip */}
        <div>
          <div style={{
            fontSize: 10, letterSpacing: 1.2, color: T.signal,
            textTransform: 'uppercase', fontWeight: 600, marginBottom: 8,
          }}>Regime · top-of-book</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {groupTiles('regime').map(ReportingTile)}
          </div>
        </div>

        {/* Three asset columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
          {[
            { k: 'btc', label: '₿ BTC',   color: T.btc },
            { k: 'wti', label: '🛢 WTI',  color: T.oil },
            { k: 'spx', label: '📈 SPX', color: T.spx },
          ].map(col => {
            const cons = consensusFor(col.k);
            return (
              <div key={col.k} style={{
                background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 12,
                padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: col.color, letterSpacing: 0.2,
                  }}>{col.label}</div>
                  <div style={{ marginLeft: 'auto',
                    padding: '3px 9px', borderRadius: 5,
                    background: `${verdictColor(cons)}1a`,
                    border: `0.5px solid ${verdictColor(cons)}55`,
                    fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
                    color: verdictColor(cons), letterSpacing: 0.6,
                  }}>{cons.label}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {groupTiles(col.k).map(ReportingTile)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          fontSize: 10.5, color: T.textDim, letterSpacing: 0.2, lineHeight: 1.55, paddingTop: 4,
        }}>
          Click any tile to open its deep panel. Auto-refresh every 2min. Signal arrows:
          ↑ supports long · ↓ supports short · ↔ neutral. Consensus labels reflect the net of
          each column's tiles.
        </div>
      </div>
    </div>
  );
}

window.DriversScreen = DriversScreen;
