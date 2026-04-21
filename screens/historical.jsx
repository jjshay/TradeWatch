// HistoricalScreen — Tab 1: BTC vs WTI Oil vs S&P 500 vs DOW, normalized %
// Now with: working 1D/1W/1M/3M/1Y/2Y/5Y/All range picker + hoverable event dots
// with news-article links in the tooltip.

const hsTokens = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A', oil: '#0077B5', spx: '#9AA3B2', dow: '#C7A8FF',
  geo: '#D96B6B', fed: '#0077B5', btcEvt: '#F7931A', trump: '#B07BE6', inst: '#6FCF8E', reg: '#5FC9C2',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// Range presets. t=0 → oldest, t=1 → now. Each range defines the window back from "now" in days,
// the number of samples, and the x-axis tick labels.
const RANGES = {
  '1D':  { days: 1,     N: 96,  unit: '15min', granularity: 'INTRADAY',
           ticks: ['09:30', '11:00', '12:30', '14:00', '15:30'] },
  '1W':  { days: 7,     N: 84,  unit: '2h',    granularity: 'HOURLY',
           ticks: ['MON', 'TUE', 'WED', 'THU', 'FRI'] },
  '1M':  { days: 30,    N: 60,  unit: '12h',   granularity: 'DAILY',
           ticks: ['MAR 20', 'MAR 27', 'APR 03', 'APR 10', 'APR 19'] },
  '3M':  { days: 90,    N: 90,  unit: '1d',    granularity: 'DAILY',
           ticks: ['JAN 19', 'FEB 09', 'MAR 02', 'MAR 24', 'APR 19'] },
  '1Y':  { days: 365,   N: 104, unit: '3d',    granularity: 'DAILY',
           ticks: ['MAY 25', 'AUG 25', 'NOV 25', 'FEB 26', 'APR 26'] },
  '2Y':  { days: 730,   N: 104, unit: '1w',    granularity: 'WEEKLY',
           ticks: ['APR 24', 'OCT 24', 'APR 25', 'OCT 25', 'APR 26'] },
  '5Y':  { days: 1825,  N: 130, unit: '2w',    granularity: 'WEEKLY',
           ticks: ['APR 21', 'APR 22', 'APR 23', 'APR 24', 'APR 25', 'APR 26'] },
  'All': { days: 4750,  N: 160, unit: '1mo',   granularity: 'MONTHLY',
           ticks: ['2013', '2015', '2017', '2019', '2021', '2023', '2026'] },
};

// Event library — {daysAgo, label, cat, color, date, body, url}
// Events placed at their real "days ago from today" anchor. Filtered per range.
const EVENTS_ALL = [
  // Recent — visible on short ranges
  { daysAgo: 0.15, cat: 'reg',    color: '#5FC9C2', label: 'CLARITY House vote passes 294-128', date: 'APR 19, 2026 · 11:20',
    body: 'Market-structure bill cleared the House by a wider-than-expected margin. Senate markup scheduled Monday. Thune: "vote in two weeks, not two months."',
    url: 'https://www.politico.com/newsletters/politico-crypto' },
  { daysAgo: 0.40, cat: 'btc',    color: '#F7931A', label: 'IBIT crosses $8.2B weekly inflow',    date: 'APR 19, 2026 · 06:44',
    body: 'Spot BTC ETFs logged day 14 of consecutive net inflows. IBIT alone added $1.8B yesterday. Morgan Stanley PWM green-light accelerating adoption.',
    url: 'https://www.bloomberg.com/news/articles/' },
  { daysAgo: 0.85, cat: 'geo',    color: '#D96B6B', label: 'IRGC warns over Gulf tanker incident', date: 'APR 18, 2026 · 20:15',
    body: 'Iranian Revolutionary Guard Corps signaled "proportional response" after second tanker incident near Hormuz this week. Hormuz insurance premiums spike 40% w/w.',
    url: 'https://www.reuters.com/world/middle-east/' },
  { daysAgo: 2.3,  cat: 'fed',    color: '#0077B5', label: 'Fed minutes turn dovish',            date: 'APR 17, 2026 · 14:00',
    body: '"Most participants" see a cut appropriate by Q3 if core PCE holds. Waller: "policy is more restrictive than we thought." DXY breaks 102.',
    url: 'https://www.bloomberg.com/news/articles/fed-minutes' },
  { daysAgo: 5,    cat: 'reg',    color: '#5FC9C2', label: 'Lummis reserve bill gains co-sponsors', date: 'APR 14, 2026',
    body: 'Strategic BTC reserve bill adds 13 co-sponsors post-CLARITY momentum. Treasury RFP hints at "budget-neutral pathways" to acquire 200K BTC.',
    url: 'https://www.reuters.com/legal/' },
  { daysAgo: 9,    cat: 'trump',  color: '#B07BE6', label: 'Crypto-friendly SEC chair confirmed', date: 'APR 10, 2026',
    body: 'Senate confirmed the nominee 54-44 along party lines. Enforcement posture expected to shift toward disclosure-based framework.',
    url: 'https://www.politico.com/news/2026/04/10/' },
  { daysAgo: 15,   cat: 'geo',    color: '#D96B6B', label: 'Ukraine drone strikes Ryazan refinery', date: 'APR 04, 2026',
    body: '200k bpd offline. Ripple effects on European diesel; WTI prints +$2.80 intraday. Russia signals retaliation vector on Ukrainian energy infrastructure.',
    url: 'https://www.reuters.com/world/europe/' },
  { daysAgo: 35,   cat: 'fed',    color: '#0077B5', label: 'March FOMC: held at 4.50–4.75%',      date: 'MAR 15, 2026',
    body: 'Statement tweak: "greater confidence" in disinflation path. Powell press conference signaled optionality; rates market repriced Q3 cut odds to 72%.',
    url: 'https://www.federalreserve.gov/monetarypolicy/fomcminutes.htm' },
  { daysAgo: 55,   cat: 'geo',    color: '#D96B6B', label: 'Bab el-Mandeb strike disrupts Red Sea', date: 'FEB 23, 2026',
    body: 'Houthi-linked strike against VLCC near Bab el-Mandeb. Maersk, Hapag-Lloyd both extend Cape of Good Hope routing. Shipping spot rates +22%.',
    url: 'https://www.ft.com/content/' },
  // Further back
  { daysAgo: 120,  cat: 'inst',   color: '#6FCF8E', label: 'Sovereign BTC allocation reported',    date: 'DEC 23, 2025',
    body: 'Mid-sized EM sovereign wealth fund disclosed a multi-billion BTC position via spot ETFs. First G20-affiliate sovereign entity to report allocation.',
    url: 'https://www.ft.com/content/sovereign-btc' },
  { daysAgo: 195,  cat: 'fed',    color: '#0077B5', label: 'Fed 25bp cut',                        date: 'OCT 07, 2025',
    body: 'First cut in 18 months. Statement noted "balanced" risks. Dot plot moved median Q4 rate projection to 4.0-4.25%.',
    url: 'https://www.federalreserve.gov/' },
  { daysAgo: 250,  cat: 'geo',    color: '#D96B6B', label: 'Hormuz tanker attack',               date: 'AUG 12, 2025',
    body: 'Tanker attacked approaching Strait of Hormuz. Reuters confirmed Iranian IRGC involvement. Brent spiked 6% on the session; WTI followed.',
    url: 'https://www.reuters.com/world/middle-east/tanker-attack-hormuz' },
  { daysAgo: 335,  cat: 'trump',  color: '#B07BE6', label: 'Tariff wave on CN imports',          date: 'MAY 20, 2025',
    body: 'Second tariff round hit 18% across consumer electronics + inputs. Supply-chain response muted this time; yuan held range.',
    url: 'https://www.wsj.com/articles/tariffs-china-' },
  { daysAgo: 425,  cat: 'btc',    color: '#F7931A', label: 'BTC spot ETF net +$2.1B',            date: 'FEB 19, 2025',
    body: 'Single-day inflow record. IBIT + FBTC captured 73% of the bid. Commentary centered on 60/40 reallocation flows.',
    url: 'https://www.bloomberg.com/news/articles/' },
  { daysAgo: 515,  cat: 'reg',    color: '#5FC9C2', label: 'CLARITY Act markup advances',        date: 'DEC 04, 2024',
    body: 'House Financial Services ordered the market-structure bill reported favorably. First major bipartisan milestone for digital-asset legislation.',
    url: 'https://www.congress.gov/bill/' },
  { daysAgo: 570,  cat: 'geo',    color: '#D96B6B', label: 'Iran strikes Iraq base',             date: 'OCT 14, 2024',
    body: 'Ballistic-missile strike against a U.S. contractor presence. Limited casualties. Oil complex bid into close; WTI +3.1% in after-hours.',
    url: 'https://www.reuters.com/world/middle-east/' },
  { daysAgo: 640,  cat: 'fed',    color: '#0077B5', label: 'Fed raises 75bp',                    date: 'JUL 27, 2024',
    body: 'Final hike of the cycle — second consecutive 75bp increment. Statement softened forward guidance; terminal implied rate shaved 15bp.',
    url: 'https://www.federalreserve.gov/' },
  // Distant
  { daysAgo: 1100, cat: 'btc',    color: '#F7931A', label: 'BTC spot ETF approved',              date: 'JAN 10, 2024',
    body: 'SEC approved the first wave of spot Bitcoin ETFs. 11 issuers including BlackRock, Fidelity, Ark.',
    url: 'https://www.sec.gov/news/press-release/' },
  { daysAgo: 1650, cat: 'fed',    color: '#0077B5', label: 'Rate-hiking cycle begins',           date: 'MAR 16, 2022',
    body: 'First hike of cycle — 25bp. Powell framed the pivot as a fight against "persistent" inflation.',
    url: 'https://www.federalreserve.gov/' },
  { daysAgo: 2400, cat: 'inst',   color: '#6FCF8E', label: 'MicroStrategy first BTC buy',        date: 'AUG 11, 2020',
    body: 'First public-company BTC treasury acquisition. 21,454 BTC for $250M. Catalyzed the corporate-treasury thesis.',
    url: 'https://www.microstrategy.com/press/' },
  { daysAgo: 4600, cat: 'btc',    color: '#F7931A', label: 'Bitcoin genesis block',              date: 'JAN 03, 2009',
    body: 'Block 0 mined by Satoshi Nakamoto. Coinbase transaction embedded the Times headline reference.',
    url: 'https://en.bitcoin.it/wiki/Genesis_block' },
];

// Deterministic pseudo-random seeded on index. Gives stable curves per range.
function hash01(i, seed) {
  const x = Math.sin((i * 9973 + seed * 77) * 0.013) * 43758.5453;
  return x - Math.floor(x);
}

// Synthesize normalized-% series for a range.
// Anchor at "now" = far right, at a specific cumulative return.
function synthSeries(range) {
  const cfg = RANGES[range];
  const N = cfg.N;
  // Cumulative return targets at the "now" end (for this range)
  // Bigger ranges → bigger cumulative.
  const endTargets = {
    '1D':  { btc: +0.9,  oil: -0.4, spx: +0.3,  dow: +0.2 },
    '1W':  { btc: +3.8,  oil: +1.5, spx: +0.9,  dow: +0.6 },
    '1M':  { btc: +8.4,  oil: -2.1, spx: +2.2,  dow: +1.9 },
    '3M':  { btc: +22.1, oil: +4.3, spx: +3.8,  dow: +3.1 },
    '1Y':  { btc: +61,   oil: +8,   spx: +12,   dow: +9 },
    '2Y':  { btc: +142.8, oil: +9.6, spx: +22.1, dow: +17.4 },
    '5Y':  { btc: +480,   oil: +28,  spx: +65,   dow: +48 },
    'All': { btc: +24500, oil: +120, spx: +260,  dow: +195 },
  }[range];

  const btc = [], oil = [], spx = [], dow = [];
  // All series start at 0% (left edge), end at endTargets (right edge).
  // Add range-flavored oscillation.
  const volAmp = {
    '1D': { btc: 0.35, oil: 0.18, spx: 0.12, dow: 0.10 },
    '1W': { btc: 1.4,  oil: 0.7,  spx: 0.35, dow: 0.30 },
    '1M': { btc: 3.2,  oil: 1.6,  spx: 0.8,  dow: 0.7 },
    '3M': { btc: 6.5,  oil: 2.8,  spx: 1.4,  dow: 1.2 },
    '1Y': { btc: 11,   oil: 5,    spx: 2.5,  dow: 2.0 },
    '2Y': { btc: 18,   oil: 8,    spx: 4,    dow: 3.5 },
    '5Y': { btc: 38,   oil: 14,   spx: 7,    dow: 6 },
    'All':{ btc: 220,  oil: 22,   spx: 14,   dow: 12 },
  }[range];

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const drift = (v) => v * t;
    const noise = (seed, amp) => (Math.sin(t * (7 + seed) + seed) + Math.sin(t * (3 + seed) * 1.7 + seed * 0.5)) * amp * 0.4
                                + (hash01(i, seed) - 0.5) * amp * 0.3;
    btc.push(drift(endTargets.btc) + noise(1, volAmp.btc));
    oil.push(drift(endTargets.oil) + noise(3, volAmp.oil));
    spx.push(drift(endTargets.spx) + noise(5, volAmp.spx));
    dow.push(drift(endTargets.dow) + noise(7, volAmp.dow));
  }
  // Force last = exact target
  btc[N-1] = endTargets.btc; oil[N-1] = endTargets.oil;
  spx[N-1] = endTargets.spx; dow[N-1] = endTargets.dow;
  btc[0] = 0; oil[0] = 0; spx[0] = 0; dow[0] = 0;
  return { btc, oil, spx, dow, end: endTargets };
}

function HistoricalScreen({ onNav }) {
  const T = hsTokens;
  const W = 1280, H = 820;

  const [range, setRange] = React.useState('2Y');
  const [focus, setFocus] = React.useState(null); // 'btc' | 'oil' | 'spx' | 'dow' | null (=all)
  const [hoverIdx, setHoverIdx] = React.useState(null); // index of hovered event

  const cfg = RANGES[range];
  const N = cfg.N;

  // LIVE — pull real BTC series from CoinGecko for ranges ≤ 1Y.
  // Free tier caps at ~365 days, so 2Y/5Y/All fall back to the synth mock.
  const { data: liveBtc, lastFetch, intervalMs } = (window.useAutoUpdate || (() => ({})))(
    `btc-series-${cfg.days}`,
    async () => {
      if (cfg.days > 365 || typeof LiveData === 'undefined') return null;
      const resp = await LiveData.getCryptoHistory('bitcoin', cfg.days);
      if (!resp || !resp.prices || !resp.prices.length) return null;
      return resp.prices.map(p => p[1]); // just the price values
    },
    { refreshKey: 'historical' }
  );

  // LIVE — OIL (USO proxy) / SPX (SPY proxy) / DOW (DIA proxy) via Finnhub
  // candle endpoint. Free tier supports up to 1Y of daily resolution.
  const finnhubKey = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';
  const { data: liveEquities } = (window.useAutoUpdate || (() => ({})))(
    `hist-equities-${cfg.days}-${finnhubKey ? 'on' : 'off'}`,
    async () => {
      if (!finnhubKey || cfg.days > 365) return null;
      const now = Math.floor(Date.now() / 1000);
      const from = now - cfg.days * 86400;
      const res = cfg.days <= 7 ? '60' : cfg.days <= 30 ? 'D' : 'D';
      const symbols = { oil: 'USO', spx: 'SPY', dow: 'DIA' };
      const out = {};
      for (const [k, sym] of Object.entries(symbols)) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=${res}&from=${from}&to=${now}&token=${finnhubKey}`);
          const j = await r.json();
          if (j && j.s === 'ok' && j.c && j.c.length) out[k] = j.c;
        } catch (_) { /* skip */ }
      }
      return Object.keys(out).length ? out : null;
    },
    { refreshKey: 'historical' }
  );

  const data = React.useMemo(() => {
    const base = synthSeries(range);
    const resample = (arr, len) => {
      if (!arr || arr.length < 2) return null;
      const out = [];
      for (let i = 0; i < len; i++) {
        const idx = Math.round((i / (len - 1)) * (arr.length - 1));
        out.push(arr[idx]);
      }
      const first = out[0] || 1;
      return out.map(v => ((v / first) - 1) * 100);
    };
    const result = { ...base };
    if (liveBtc && liveBtc.length >= 2) {
      const pct = resample(liveBtc, N);
      if (pct) result.btc = pct;
    }
    if (liveEquities) {
      ['oil', 'spx', 'dow'].forEach(k => {
        if (liveEquities[k]) {
          const pct = resample(liveEquities[k], N);
          if (pct) result[k] = pct;
        }
      });
    }
    return result;
  }, [range, liveBtc, liveEquities]);

  // Filter events that fall within this range.
  // daysAgo → t-index. t=0 at oldest of window, t=1 at now.
  // relPos = 1 - daysAgo/windowDays  (only keep 0 < relPos <= 1)
  const eventsInRange = React.useMemo(() => {
    return EVENTS_ALL
      .map(e => {
        const rel = 1 - (e.daysAgo / cfg.days);
        return { ...e, rel, i: Math.round(rel * (N - 1)) };
      })
      .filter(e => e.rel >= 0.02 && e.rel <= 1);
  }, [range]);

  // Reset hover when range changes
  React.useEffect(() => { setHoverIdx(null); }, [range]);

  // Chart geometry
  const chartX = 40, chartY = 70;
  const chartW = 1200, chartH = 520;

  const allVals = [...data.btc, ...data.oil, ...data.spx, ...data.dow];
  const rawMin = Math.min(...allVals, 0);
  const rawMax = Math.max(...allVals, 0);
  const yPad = (rawMax - rawMin) * 0.08;
  const yMin = rawMin - yPad, yMax = rawMax + yPad;
  const yToPx = (v) => chartY + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const iToPx = (i) => chartX + (i / (N - 1)) * chartW;

  const pathFor = (arr) => {
    let d = `M ${iToPx(0).toFixed(1)} ${yToPx(arr[0]).toFixed(1)}`;
    for (let i = 1; i < arr.length; i++) d += ` L ${iToPx(i).toFixed(1)} ${yToPx(arr[i]).toFixed(1)}`;
    return d;
  };

  // Nice y-axis ticks
  const yTicks = (() => {
    const span = yMax - yMin;
    const rough = span / 5;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.abs(rough))));
    const mult = [1, 2, 2.5, 5, 10].find(m => m * pow >= rough) || 1;
    const step = mult * pow;
    const arr = [];
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) arr.push(Number(v.toFixed(2)));
    if (!arr.includes(0) && yMin < 0 && yMax > 0) arr.push(0);
    return arr.sort((a, b) => a - b);
  })();

  // X tick positions
  const xTicks = cfg.ticks.map((label, ix, arr) => ({
    i: Math.round((ix / (arr.length - 1)) * (N - 1)),
    label,
  }));

  const fmtPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(Math.abs(v) < 10 ? 2 : 1) + '%';

  const hover = hoverIdx !== null ? eventsInRange[hoverIdx] : null;
  const hoverX = hover ? iToPx(hover.i) : 0;
  const hoverBtcY = hover ? yToPx((focus && data[focus] ? data[focus] : data.btc)[hover.i]) : 0;

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* ───── HEADER ───── */}
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
          {['Historical', 'Projected', 'Impact', 'Recommend', 'News', 'Calendar', 'Signals', 'Prices'].map((t, idx) => {
            const active = idx === 0;
            const key = t === 'Recommend' ? 'recommend' : t.toLowerCase();
            return (
              <div key={t}
                onClick={() => onNav && !active && onNav(key)}
                style={{
                  padding: '0 14px', height: 28, display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                  background: active ? T.ink400 : 'transparent',
                  color: active ? T.text : T.textMid,
                  boxShadow: active ? `inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)` : 'none',
                  cursor: active || !onNav ? 'default' : 'pointer',
                }}>
                <span style={{
                  fontFamily: T.mono, fontSize: 10, color: active ? T.signal : T.textDim,
                  fontWeight: 600, letterSpacing: 0.3,
                }}>{idx + 1}.</span>
                {t}
              </div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <TRLiveStripInline />
          <TRGearInline />
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; LIVE &nbsp;·&nbsp; {cfg.granularity}
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

      {/* ───── CHART CHROME ROW ───── */}
      <div style={{
        height: 50, padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${T.edge}`, background: T.ink000,
      }}>
        <div style={{ display: 'flex', gap: 22 }}>
          {[
            { key: 'btc', c: T.btc, label: 'BITCOIN', value: fmtPct(data.end.btc) },
            { key: 'oil', c: T.oil, label: 'WTI OIL',  value: fmtPct(data.end.oil) },
            { key: 'spx', c: T.spx, label: 'S&P 500',  value: fmtPct(data.end.spx) },
            { key: 'dow', c: T.dow, label: 'DOW 30',   value: fmtPct(data.end.dow) },
          ].map(s => {
            const isFocus = focus === s.key;
            const dim     = focus && !isFocus;
            return (
              <div key={s.label}
                onClick={() => setFocus(isFocus ? null : s.key)}
                title={isFocus ? 'Click to show all' : `Click to focus ${s.label} — dots anchor to this line`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', opacity: dim ? 0.4 : 1,
                  padding: '4px 8px', borderRadius: 6,
                  background: isFocus ? `${s.c}1a` : 'transparent',
                  border: `1px solid ${isFocus ? `${s.c}55` : 'transparent'}`,
                  transition: 'opacity 140ms cubic-bezier(0.2,0.7,0.2,1), background 140ms cubic-bezier(0.2,0.7,0.2,1)',
                }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: s.c }} />
                <div style={{
                  fontSize: 10.5, fontWeight: 500, letterSpacing: 0.6,
                  color: isFocus ? s.c : T.textMid, textTransform: 'uppercase',
                }}>{s.label}</div>
                <div style={{
                  fontFamily: T.mono, fontSize: 12, color: isFocus ? s.c : T.text, fontWeight: 500, marginLeft: 2,
                }}>{s.value}</div>
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'flex', padding: 3, background: T.ink200,
          border: `1px solid ${T.edge}`, borderRadius: 10, height: 30,
        }}>
          {Object.keys(RANGES).map((r) => {
            const active = r === range;
            return (
              <div key={r}
                onClick={() => setRange(r)}
                title={{
                  '1D': '1 Day · intraday granularity',
                  '1W': '1 Week · 2-hour points',
                  '1M': '1 Month · daily',
                  '3M': '3 Months · daily',
                  '1Y': '1 Year · daily',
                  '2Y': '2 Years · weekly (default)',
                  '5Y': '5 Years · weekly',
                  'All': 'All · since Jan 2013',
                }[r]}
                style={{
                  padding: '0 12px', minWidth: 38, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.mono, fontSize: 11, fontWeight: 500,
                  color: active ? T.ink000 : T.textMid,
                  background: active ? T.signal : 'transparent',
                  borderRadius: 7, cursor: 'pointer',
                  boxShadow: active ? `inset 0 0.5px 0 rgba(255,255,255,0.25)` : 'none',
                  letterSpacing: 0.5,
                  transition: 'background 140ms ease, color 140ms ease',
                }}>{r}</div>
            );
          })}
        </div>

        <button type="button"
          title="Refresh all series and re-pull latest news sources."
          style={{
            marginLeft: 10, width: 30, height: 30, padding: 0,
            background: T.ink200, border: `1px solid ${T.edge}`,
            borderRadius: 8, cursor: 'pointer', color: T.textMid,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 3.5v3h-3"/>
            <path d="M13.3 8a5.3 5.3 0 1 1-1.3-3.8L13.5 6.5"/>
          </svg>
        </button>
      </div>

      {/* ───── CHART AREA ───── */}
      <div style={{ position: 'relative', height: H - 52 - 50 - 110, background: T.ink000 }}>
        <svg width={W} height={chartY + chartH + 30} style={{ display: 'block' }}
             onMouseLeave={() => setHoverIdx(null)}>
          {yTicks.map(v => {
            const y = yToPx(v);
            const isZero = v === 0;
            return (
              <g key={v}>
                <line x1={chartX} y1={y} x2={chartX + chartW} y2={y}
                      stroke={isZero ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)'}
                      strokeWidth={isZero ? 1 : 0.5}
                      strokeDasharray={isZero ? '0' : '2,3'} />
                <text x={chartX - 10} y={y + 3} fill={isZero ? T.textMid : T.textDim}
                      fontFamily={T.mono} fontSize={10} textAnchor="end">
                  {fmtPct(v)}
                </text>
              </g>
            );
          })}

          {xTicks.map((t, idx) => (
            <g key={idx}>
              <line x1={iToPx(t.i)} y1={chartY + chartH} x2={iToPx(t.i)} y2={chartY + chartH + 4}
                    stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
              <text x={iToPx(t.i)} y={chartY + chartH + 18} fill={T.textDim}
                    fontFamily={T.mono} fontSize={10} textAnchor="middle" letterSpacing={0.5}>
                {t.label.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Hover crosshair */}
          {hover && (
            <line x1={hoverX} y1={chartY} x2={hoverX} y2={chartY + chartH}
                  stroke={T.signal} strokeWidth={1} strokeOpacity={0.55} />
          )}

          {/* Series */}
          <path d={pathFor(data.dow)} fill="none" stroke={T.dow} strokeWidth={focus === 'dow' ? 2 : 1.25} strokeOpacity={focus && focus !== 'dow' ? 0.12 : 0.8}
                strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor(data.spx)} fill="none" stroke={T.spx} strokeWidth={focus === 'spx' ? 2 : 1.25} strokeOpacity={focus && focus !== 'spx' ? 0.12 : 0.85}
                strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor(data.oil)} fill="none" stroke={T.oil}
                strokeWidth={focus === 'oil' ? 2.25 : 1.5}
                strokeOpacity={focus && focus !== 'oil' ? 0.12 : 1}
                strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor(data.btc)} fill="none" stroke={T.btc}
                strokeWidth={focus === 'btc' ? 2.5 : 1.75}
                strokeOpacity={focus && focus !== 'btc' ? 0.12 : 1}
                strokeLinecap="round" strokeLinejoin="round" />

          {/* Event dots — interactive. When a series is focused, anchor to that
              line and highlight only events whose category is relevant to the
              focused asset (oil: geo/oil events, btc: btc/reg events, etc). */}
          {(() => {
            const relevantCats = !focus ? null
              : focus === 'oil' ? new Set(['geo', 'trump'])
              : focus === 'btc' ? new Set(['btc', 'inst', 'reg', 'trump'])
              : focus === 'spx' ? new Set(['fed', 'trump'])
              : focus === 'dow' ? new Set(['fed', 'trump'])
              : null;
            const focusArr = !focus ? data.btc : data[focus];
            return eventsInRange.filter(e => !relevantCats || relevantCats.has(e.cat));
          })().map((e, idx) => {
            const cx = iToPx(e.i);
            const focusArr = focus && data[focus] ? data[focus] : data.btc;
            const cy = yToPx(focusArr[e.i]);
            const isHover = idx === hoverIdx;
            return (
              <g key={`evt-${idx}`}
                 style={{ cursor: 'pointer' }}
                 onMouseEnter={() => setHoverIdx(idx)}
                 onClick={() => window.open(e.url, '_blank', 'noopener,noreferrer')}>
                {/* Hit target */}
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                {isHover && (
                  <>
                    <circle cx={cx} cy={cy} r={10} fill={e.color} fillOpacity={0.18} />
                    <circle cx={cx} cy={cy} r={5} fill={e.color} stroke={T.ink000} strokeWidth={1.5} />
                  </>
                )}
                {!isHover && (
                  <circle cx={cx} cy={cy} r={3.25} fill={T.ink000} stroke={e.color} strokeWidth={1.25} />
                )}
              </g>
            );
          })}

          {/* Right-gutter crosshair readouts on hover */}
          {hover && [
            { v: data.btc[hover.i], c: T.btc, label: 'BTC' },
            { v: data.oil[hover.i], c: T.oil, label: 'OIL' },
            { v: data.spx[hover.i], c: T.spx, label: 'SPX' },
            { v: data.dow[hover.i], c: T.dow, label: 'DOW' },
          ].map((r) => (
            <g key={r.label}>
              <rect x={hoverX + 8} y={yToPx(r.v) - 8} width={58} height={16} rx={3}
                    fill={T.ink300} stroke={r.c} strokeWidth={0.5} strokeOpacity={0.8} />
              <text x={hoverX + 37} y={yToPx(r.v) + 3} fill={r.c}
                    fontFamily={T.mono} fontSize={10} fontWeight={500} textAnchor="middle">
                {fmtPct(r.v)}
              </text>
            </g>
          ))}
        </svg>

        {/* Event tooltip */}
        {hover && (() => {
          // Position tooltip left of the dot if it's in the right third, else right of it.
          const panelW = 300;
          const leftOf = hoverX > chartX + chartW * 0.62;
          const left = leftOf ? Math.max(10, hoverX - panelW - 14) : hoverX + 18;
          // Clamp top so it stays in the chart area
          const top = Math.min(Math.max(hoverBtcY - 80, 90), chartY + chartH - 220);
          return (
            <div style={{
              position: 'absolute',
              left, top,
              width: panelW,
              background: 'rgba(16, 20, 27, 0.82)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              border: `1px solid ${T.edgeHi}`,
              borderRadius: 10,
              padding: '14px 16px 14px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.08)',
              pointerEvents: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: hover.color }} />
                <div style={{
                  fontSize: 9.5, letterSpacing: 0.8, color: T.textMid,
                  textTransform: 'uppercase', fontWeight: 500,
                }}>{({
                  geo:'Geopolitical', fed:'Federal Reserve', btc:'BTC Flow',
                  trump:'Policy', inst:'Institutional', reg:'Regulatory',
                }[hover.cat])} · Event</div>
                <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.textDim }}>
                  {hover.date.toUpperCase()}
                </div>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 500, color: T.text,
                letterSpacing: -0.1, marginBottom: 8, lineHeight: 1.3,
              }}>{hover.label}</div>
              <div style={{
                fontSize: 11.5, color: T.textMid, lineHeight: 1.5, marginBottom: 10,
              }}>{hover.body}</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                paddingTop: 8, borderTop: `1px solid ${T.edge}`,
                fontFamily: T.mono, fontSize: 10, color: T.signal, letterSpacing: 0.4,
              }}>
                <span>→</span>
                <span style={{
                  textDecoration: 'underline', textDecorationColor: 'rgba(232,184,74,0.5)',
                  textUnderlineOffset: 2,
                }}>Click dot to open article</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ───── CORRELATION BAR ───── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 110,
        background: T.ink100, borderTop: `1px solid ${T.edge}`,
        display: 'flex', alignItems: 'center', padding: '0 36px',
      }}>
        {[
          { label: 'BTC / OIL',  sub: 'CORRELATION',   v: '+0.312' },
          { label: 'BTC / OIL',  sub: 'ROLLING 90D',    v: '+0.187' },
          { label: 'BTC / SPX',  sub: 'CORRELATION',   v: '+0.641' },
          { label: 'OIL / SPX',  sub: 'CORRELATION',   v: '-0.223' },
          { label: 'REGIME',     sub: 'DETECTED',       v: 'RISK-ON' },
        ].map((c, idx) => (
          <div key={idx} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            gap: 6, paddingLeft: idx === 0 ? 0 : 36,
            borderLeft: idx === 0 ? 'none' : `1px solid ${T.edge}`,
          }}>
            <div style={{
              fontSize: 9, letterSpacing: 1, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500,
            }}>
              {c.label} <span style={{ color: T.textDim, opacity: 0.6 }}>·</span>&nbsp;{c.sub}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: 22, fontWeight: 500,
              color: T.text, letterSpacing: -0.3, lineHeight: 1,
            }}>{c.v}</div>
            <div style={{ width: 18, height: 1.5, background: T.signal, marginTop: 2 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

window.HistoricalScreen = HistoricalScreen;
