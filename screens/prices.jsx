// PricesScreen — Tab 8: unified real-time ticker board. Three lanes:
//   STOCKS (equities)  — Finnhub /quote
//   FUTURES / COMMODS  — Finnhub /quote with futures symbols (=F)
//   CRYPTO             — CoinGecko /simple/price
// Each tile shows: ticker, name, price, today change%, mini sparkline.

const prT = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A', oil: '#0077B5', spx: '#9AA3B2', eth: '#627EEA',
  bull: '#6FCF8E', bear: '#D96B6B',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

const STOCKS = [
  { sym: 'SPY',  name: 'S&P 500 ETF',          demo: { price: 580.12, change: +0.42 } },
  { sym: 'QQQ',  name: 'Nasdaq 100 ETF',       demo: { price: 498.40, change: +0.61 } },
  { sym: 'DIA',  name: 'Dow Jones ETF',        demo: { price: 440.88, change: +0.22 } },
  { sym: 'IWM',  name: 'Russell 2000 ETF',     demo: { price: 228.15, change: -0.33 } },
  { sym: 'NVDA', name: 'Nvidia',               demo: { price: 142.80, change: +2.14 } },
  { sym: 'TSLA', name: 'Tesla',                demo: { price: 258.46, change: +1.02 } },
  { sym: 'AAPL', name: 'Apple',                demo: { price: 232.95, change: +0.18 } },
  { sym: 'MSFT', name: 'Microsoft',            demo: { price: 438.20, change: +0.74 } },
  { sym: 'MSTR', name: 'MicroStrategy',        demo: { price: 341.22, change: +3.80 } },
  { sym: 'COIN', name: 'Coinbase',             demo: { price: 268.40, change: +1.95 } },
  { sym: 'IBIT', name: 'iShares Bitcoin Trust', demo: { price: 54.82, change: +2.14 } },
  { sym: 'MARA', name: 'Marathon Digital',     demo: { price: 21.75, change: +4.25 } },
];

// Stooq is CORS-enabled and serves free CSV futures quotes. Finnhub free
// tier rejects Yahoo-style =F symbols, so futures live on Stooq here.
const FUTURES = [
  { sym: 'CL',   stooq: 'cl.f',  name: 'WTI Crude Oil',      unit: '/bbl' },
  { sym: 'BZ',   stooq: 'cb.f',  name: 'Brent Crude',        unit: '/bbl' },
  { sym: 'NG',   stooq: 'ng.f',  name: 'Natural Gas',        unit: '/MMBtu' },
  { sym: 'GC',   stooq: 'gc.f',  name: 'Gold',               unit: '/oz' },
  { sym: 'SI',   stooq: 'si.f',  name: 'Silver',             unit: '/oz' },
  { sym: 'HG',   stooq: 'hg.f',  name: 'Copper',             unit: '/lb' },
  { sym: 'ES',   stooq: 'es.f',  name: 'S&P 500 Futures',    unit: '' },
  { sym: 'NQ',   stooq: 'nq.f',  name: 'Nasdaq 100 Futures', unit: '' },
  { sym: 'YM',   stooq: 'ym.f',  name: 'Dow Jones Futures',  unit: '' },
  { sym: 'DXY',  stooq: 'dx.f',  name: 'US Dollar Index',    unit: '' },
];

const CRYPTO = [
  { id: 'bitcoin',       sym: 'BTC',   name: 'Bitcoin' },
  { id: 'ethereum',      sym: 'ETH',   name: 'Ethereum' },
  { id: 'solana',        sym: 'SOL',   name: 'Solana' },
  { id: 'ripple',        sym: 'XRP',   name: 'XRP' },
  { id: 'cardano',       sym: 'ADA',   name: 'Cardano' },
  { id: 'chainlink',     sym: 'LINK',  name: 'Chainlink' },
  { id: 'avalanche-2',   sym: 'AVAX',  name: 'Avalanche' },
  { id: 'matic-network', sym: 'MATIC', name: 'Polygon' },
  { id: 'dogecoin',      sym: 'DOGE',  name: 'Dogecoin' },
  { id: 'polkadot',      sym: 'DOT',   name: 'Polkadot' },
];

// Tiny sparkline renderer
function PriceSpark({ data, color, w = 64, h = 20 }) {
  if (!data || data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={w} cy={h - ((data[data.length - 1] - min) / span) * h} r="1.5" fill={color} />
    </svg>
  );
}

function PriceTile({ sym, name, price, change, unit, spark, color, loading, error, onClick, saved, onToggleSave }) {
  const T = prT;
  const up = change >= 0;
  const deltaColor = up ? T.bull : T.bear;
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click for 1Y chart + options chain' : ''}
      style={{
        background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 9,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        position: 'relative', overflow: 'hidden', minHeight: 110,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms cubic-bezier(0.2,0.7,0.2,1)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: color || T.textMid }} />
        <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: T.text }}>
          {sym}
        </div>
        <div style={{
          marginLeft: 'auto', fontSize: 9, color: T.textDim, letterSpacing: 0.3,
          textAlign: 'right', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</div>
        {onToggleSave && typeof TRStar !== 'undefined' && (
          <TRStar saved={saved} onToggle={onToggleSave} size={12} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: T.mono, fontSize: 18, fontWeight: 500,
            color: price == null ? T.textDim : T.text,
            letterSpacing: -0.3, lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            {price == null ? (loading ? '…' : '—')
              : (typeof price === 'number' ? '$' + price.toLocaleString('en-US', { maximumFractionDigits: price < 10 ? 4 : 2 }) : price)}
            {unit && price != null && <span style={{ fontSize: 10, color: T.textDim, marginLeft: 3 }}>{unit}</span>}
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: 10, color: change == null ? T.textDim : deltaColor,
            letterSpacing: 0.2, fontWeight: 500, marginTop: 3,
          }}>
            {change == null ? '' : `${up ? '↑' : '↓'} ${up ? '+' : ''}${change.toFixed(2)}% today`}
          </div>
        </div>
        {spark && <PriceSpark data={spark} color={up ? T.bull : T.bear} />}
      </div>

      {error && (
        <div style={{
          fontSize: 9, color: T.bear, fontFamily: T.mono, letterSpacing: 0.3,
          borderTop: `0.5px solid ${T.edge}`, paddingTop: 5,
        }}>⚠ {error}</div>
      )}
    </div>
  );
}

// Price-detail modal — 1Y chart + 52W range + stats + options-chain button.
// Data sources by asset class:
//   stocks/ETFs  — Finnhub candles (res=D, from=1Y ago)
//   futures      — Stooq historical CSV (https://stooq.com/q/d/l/?s=X&i=d)
//   crypto       — CoinGecko /coins/{id}/market_chart?days=365
function PriceDetailModal({ open, onClose, ticker }) {
  const T = prT;
  const [series, setSeries] = React.useState(null); // array of prices
  const [stats, setStats]   = React.useState(null); // { hi52, lo52, ytdPct, todayHi, todayLo }
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open || !ticker) return;
    let active = true;
    const finnhubKey = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';

    (async () => {
      setLoading(true); setSeries(null); setStats(null); setError(null);
      let prices = null, fetchedStats = {};
      try {
        if (ticker.kind === 'crypto') {
          const r = await fetch(`https://api.coingecko.com/api/v3/coins/${ticker.id}/market_chart?vs_currency=usd&days=365&interval=daily`);
          if (r.ok) {
            const j = await r.json();
            if (j && j.prices) prices = j.prices.map(p => p[1]);
          }
        } else if (ticker.kind === 'stock') {
          if (finnhubKey) {
            const now = Math.floor(Date.now() / 1000);
            const from = now - 365 * 86400;
            const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(ticker.sym)}&resolution=D&from=${from}&to=${now}&token=${finnhubKey}`);
            if (r.ok) {
              const j = await r.json();
              if (j && j.s === 'ok' && j.c) prices = j.c;
            }
            const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker.sym)}&token=${finnhubKey}`).then(r => r.ok ? r.json() : null).catch(() => null);
            if (q) { fetchedStats.todayHi = q.h; fetchedStats.todayLo = q.l; fetchedStats.last = q.c; }
          }
        } else if (ticker.kind === 'future') {
          // Stooq daily CSV for 1Y
          const r = await fetch(`https://stooq.com/q/d/l/?s=${ticker.stooq}&i=d`);
          if (r.ok) {
            const text = await r.text();
            const rows = text.trim().split('\n').slice(1); // skip header
            const cutoff = Date.now() - 365 * 86400000;
            prices = rows.map(row => row.split(',')).filter(c => {
              const d = new Date(c[0]);
              return !isNaN(d) && d.getTime() > cutoff;
            }).map(c => parseFloat(c[4])).filter(v => isFinite(v));
          }
        }

        if (!active) return;
        if (prices && prices.length >= 10) {
          const hi52 = Math.max(...prices);
          const lo52 = Math.min(...prices);
          const first = prices[0], last = prices[prices.length - 1];
          const ytdPct = ((last - first) / first) * 100;
          setSeries(prices);
          setStats({ hi52, lo52, ytdPct, ...fetchedStats, last });
        } else {
          setError(ticker.kind === 'stock' && !finnhubKey ? 'Add a Finnhub key in ⚙ Settings for stock candles.' : 'No historical data available.');
        }
      } catch (e) {
        setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, ticker]);

  if (!open || !ticker) return null;

  // Inline chart renderer (simple SVG path)
  const Chart = ({ data }) => {
    const W = 700, H = 260, pad = 20;
    if (!data || data.length < 2) return <svg width={W} height={H} />;
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2);
      const y = H - pad - ((v - min) / span) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = data[data.length - 1];
    const first = data[0];
    const up = last >= first;
    const color = up ? T.bull : T.bear;
    const area = `M ${pad},${H - pad} L ` + pts + ` L ${W - pad},${H - pad} Z`;
    return (
      <svg width={W} height={H} style={{ display: 'block' }}>
        <path d={area} fill={color} fillOpacity={0.08} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.78)',
        backdropFilter: 'blur(12px) saturate(150%)',
        WebkitBackdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 80, padding: 40,
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 780, maxHeight: '90%', overflow: 'auto',
        background: T.ink100, border: `1px solid ${T.edgeHi}`,
        borderRadius: 14, padding: '22px 26px',
        color: T.text, fontFamily: T.ui,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 600, color: T.text, letterSpacing: -0.3 }}>
            {ticker.sym}
          </div>
          <div style={{ fontSize: 13, color: T.textMid }}>{ticker.name}</div>
          <div style={{
            padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.6,
            color: T.signal, background: 'rgba(201,162,39,0.14)',
            border: '0.5px solid rgba(201,162,39,0.4)', borderRadius: 4,
            textTransform: 'uppercase',
          }}>{ticker.kind}</div>
          <div onClick={onClose} style={{
            marginLeft: 'auto', width: 28, height: 28, borderRadius: 7,
            background: T.ink300, border: `1px solid ${T.edge}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.textMid, fontSize: 13,
          }}>✕</div>
        </div>

        {/* Stats row */}
        {stats && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
            background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
            padding: '12px 14px', marginBottom: 14,
          }}>
            {[
              { k: 'LAST', v: stats.last != null ? '$' + stats.last.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—' },
              { k: '1Y %',   v: (stats.ytdPct >= 0 ? '+' : '') + stats.ytdPct.toFixed(1) + '%', c: stats.ytdPct >= 0 ? T.bull : T.bear },
              { k: '52W HI', v: '$' + stats.hi52.toLocaleString('en-US', { maximumFractionDigits: 2 }) },
              { k: '52W LO', v: '$' + stats.lo52.toLocaleString('en-US', { maximumFractionDigits: 2 }) },
            ].map(s => (
              <div key={s.k}>
                <div style={{ fontSize: 9, letterSpacing: 0.9, color: T.textDim, textTransform: 'uppercase', fontWeight: 500, marginBottom: 3 }}>{s.k}</div>
                <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 500, color: s.c || T.text, letterSpacing: -0.2 }}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '14px 18px', marginBottom: 14, minHeight: 280,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 0.8, color: T.textDim,
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
          }}>1-Year Daily Close</div>
          {loading && <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 11, color: T.textDim }}>LOADING 1Y SERIES…</div>}
          {error && !loading && <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 12, color: T.bear }}>{error}</div>}
          {!loading && series && <Chart data={series} />}
        </div>

        {/* Options CTA — stocks/ETFs only (futures + crypto don't have Tradier chains) */}
        {ticker.kind === 'stock' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14,
            borderTop: `1px solid ${T.edge}`,
          }}>
            <div style={{ fontSize: 11.5, color: T.textMid }}>
              Options chain: strikes × expirations with bid/ask/volume/OI spread
            </div>
            <div
              onClick={() => { onClose(); setTimeout(() => window.openTROptions && window.openTROptions(ticker.sym), 80); }}
              style={{
                marginLeft: 'auto', padding: '8px 14px',
                background: T.signal, color: T.ink000, borderRadius: 7,
                fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                cursor: 'pointer',
                boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3)',
              }}>⚡ OPTIONS CHAIN →</div>
          </div>
        )}
      </div>
    </div>
  );
}

function PricesScreen({ onNav }) {
  const T = prT;
  const W = 1280, H = 820;
  const [openTicker, setOpenTicker] = React.useState(null);
  const wl = typeof useTRWatchlist !== 'undefined' ? useTRWatchlist() : null;

  const finnhubKey = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';

  // Stocks fetch
  const { data: stockQuotes, loading: stocksLoading, lastFetch: stocksLast } = (window.useAutoUpdate || (() => ({})))(
    `prices-stocks-${finnhubKey ? 'on' : 'off'}`,
    async () => {
      if (!finnhubKey) return null;
      const out = {};
      for (const s of STOCKS) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s.sym}&token=${finnhubKey}`);
          if (r.ok) {
            const q = await r.json();
            if (q && typeof q.c === 'number' && q.c > 0) {
              out[s.sym] = { price: q.c, change: q.dp, high: q.h, low: q.l };
            }
          }
        } catch (_) {}
      }
      return Object.keys(out).length ? out : null;
    },
    { refreshKey: 'prices' }
  );

  // Futures fetch — via Stooq (CORS-friendly, free, no key). One batch CSV
  // call for all tickers. Format:
  //   https://stooq.com/q/l/?s=cl.f,gc.f,...&f=sohlcv&h&e=csv
  // Response CSV header: Symbol,Open,High,Low,Close,Volume
  const { data: futuresQuotes } = (window.useAutoUpdate || (() => ({})))(
    'prices-futures-stooq',
    async () => {
      try {
        const syms = FUTURES.map(f => f.stooq).join(',');
        const r = await fetch(`https://stooq.com/q/l/?s=${syms}&f=sohlcv&h&e=csv`);
        if (!r.ok) return null;
        const text = await r.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) return null;
        const out = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          const [symRaw, openS, , , closeS] = cols;
          const open = parseFloat(openS);
          const close = parseFloat(closeS);
          if (!isFinite(close) || close <= 0) continue;
          // Match back to our FUTURES entry by stooq code
          const entry = FUTURES.find(f => f.stooq.toLowerCase() === symRaw.toLowerCase());
          if (!entry) continue;
          const chg = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : null;
          out[entry.sym] = { price: close, change: chg };
        }
        return Object.keys(out).length ? out : null;
      } catch (_) { return null; }
    },
    { refreshKey: 'prices' }
  );

  // Crypto fetch — CoinGecko (no key needed)
  const { data: cryptoQuotes, loading: cryptoLoading } = (window.useAutoUpdate || (() => ({})))(
    'prices-crypto',
    async () => {
      const ids = CRYPTO.map(c => c.id).join(',');
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        if (!r.ok) return null;
        const j = await r.json();
        return j;
      } catch (_) { return null; }
    },
    { refreshKey: 'prices' }
  );

  // Demo mode: when no Finnhub key, fall back to sample prices so tiles
  // don't render as empty dashes. _demo flag used to show a tag on the tile.
  const demoMode = !finnhubKey;
  const stocksData = STOCKS.map(s => {
    const live = stockQuotes && stockQuotes[s.sym];
    return {
      ...s,
      price:  live ? live.price  : (demoMode && s.demo ? s.demo.price  : null),
      change: live ? live.change : (demoMode && s.demo ? s.demo.change : null),
      color: s.sym === 'MSTR' || s.sym === 'COIN' || s.sym === 'IBIT' || s.sym === 'MARA' ? T.btc : T.spx,
      _demo: !live && demoMode,
    };
  });
  const futuresData = FUTURES.map(f => ({
    ...f,
    price:  futuresQuotes && futuresQuotes[f.sym] ? futuresQuotes[f.sym].price  : null,
    change: futuresQuotes && futuresQuotes[f.sym] ? futuresQuotes[f.sym].change : null,
    color: f.sym.startsWith('CL') || f.sym.startsWith('BZ') || f.sym.startsWith('NG') ? T.oil
         : f.sym.startsWith('GC') || f.sym.startsWith('SI') || f.sym.startsWith('HG') ? T.signal
         : T.spx,
  }));
  const cryptoData = CRYPTO.map(c => ({
    ...c,
    price:  cryptoQuotes && cryptoQuotes[c.id] ? cryptoQuotes[c.id].usd : null,
    change: cryptoQuotes && cryptoQuotes[c.id] ? cryptoQuotes[c.id].usd_24h_change : null,
    color: c.sym === 'BTC' ? T.btc : c.sym === 'ETH' ? T.eth : T.spx,
  }));

  // Lane header summary — count up/down tiles
  function laneStats(data) {
    const loaded = data.filter(d => d.change != null);
    if (!loaded.length) return null;
    const up = loaded.filter(d => d.change >= 0).length;
    const down = loaded.length - up;
    return { up, down, total: loaded.length };
  }

  const Lane = ({ title, desc, data, kind }) => {
    const stats = laneStats(data);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 3, height: 14, background: T.signal, borderRadius: 1.5,
            alignSelf: 'center',
          }} />
          <div style={{ fontSize: 12, fontWeight: 500, color: T.text, letterSpacing: -0.1 }}>{title}</div>
          <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 0.2 }}>{desc}</div>
          {stats && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.3 }}>
              <span style={{ color: T.bull }}>↑ {stats.up}</span>
              <span style={{ color: T.bear }}>↓ {stats.down}</span>
              <span style={{ color: T.textDim }}>· {data.length} tickers</span>
            </div>
          )}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
        }}>
          {data.map(d => (
            <PriceTile key={d.sym || d.id}
              sym={d.sym} name={d.name}
              price={d.price} change={d.change}
              unit={d.unit}
              color={d.color}
              loading={!d.price && (stocksLoading || cryptoLoading)}
              onClick={() => setOpenTicker({ ...d, kind })}
              saved={wl && wl.isTickerSaved(d.sym)}
              onToggleSave={wl ? () => wl.toggleTicker({ ...d, kind }) : null}
            />
          ))}
        </div>
      </div>
    );
  };

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
        <img src="assets/gg-logo.png" alt="Global Gauntlet"
        style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
      <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>

        <div style={{
          marginLeft: 32, display: 'flex', padding: 3,
          background: T.ink200, borderRadius: 10, border: `1px solid ${T.edge}`,
          height: 34, alignItems: 'center',
        }}>
          {['Historical', 'Projected', 'Impact', 'Recommend', 'News', 'Calendar', 'Signals', 'Prices', 'Flights'].map((t, idx) => {
            const active = idx === 7;
            const key = t === 'Recommend' ? 'recommend' : t.toLowerCase();
            return (
              <div key={t}
                onClick={() => !active && onNav && onNav(key)}
                style={{
                  padding: '0 12px', height: 28, display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                  background: active ? T.ink400 : 'transparent',
                  color: active ? T.text : T.textMid,
                  boxShadow: active ? 'inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)' : 'none',
                  cursor: active ? 'default' : 'pointer',
                }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: active ? T.signal : T.textDim, fontWeight: 600, letterSpacing: 0.3 }}>{idx + 1}.</span>
                {t}
              </div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {typeof TRLiveStripInline !== 'undefined' && <TRLiveStripInline />}
          {typeof TRGearInline !== 'undefined' && <TRGearInline />}
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; LIVE MARKETS
          </div>
        </div>
      </div>

      {/* Body — three lanes scrollable */}
      <div style={{
        height: H - 52, padding: '16px 20px', overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* WATCHLIST — shown when there's anything saved */}
        {wl && (wl.watchlist.tickers.length > 0 || wl.watchlist.options.length > 0) && (
          <div style={{
            background: 'linear-gradient(180deg, rgba(201,162,39,0.04) 0%, transparent 100%)',
            border: '1px solid rgba(201,162,39,0.28)', borderRadius: 10,
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                color: T.signal, fontSize: 16, lineHeight: 1,
              }}>★</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>My Watchlist</div>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 0.2 }}>
                saved locally · persists across reloads
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3 }}>
                <span>{wl.watchlist.tickers.length} tickers</span>
                <span>{wl.watchlist.options.length} options</span>
                {(wl.watchlist.tickers.length + wl.watchlist.options.length) > 0 && (
                  <span
                    onClick={() => { if (confirm('Clear entire watchlist?')) wl.clearAll(); }}
                    style={{ cursor: 'pointer', color: T.bear }}>clear all</span>
                )}
              </div>
            </div>

            {/* Saved tickers */}
            {wl.watchlist.tickers.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: wl.watchlist.options.length ? 10 : 0 }}>
                {wl.watchlist.tickers.map(t => {
                  // resolve live price from whichever bucket matches kind
                  let price = null, change = null;
                  if (t.kind === 'stock' && stockQuotes && stockQuotes[t.sym]) {
                    price = stockQuotes[t.sym].price; change = stockQuotes[t.sym].change;
                  } else if (t.kind === 'future' && futuresQuotes && futuresQuotes[t.sym]) {
                    price = futuresQuotes[t.sym].price; change = futuresQuotes[t.sym].change;
                  } else if (t.kind === 'crypto' && cryptoQuotes && cryptoQuotes[t.id]) {
                    price = cryptoQuotes[t.id].usd; change = cryptoQuotes[t.id].usd_24h_change;
                  }
                  const color = t.kind === 'crypto' ? (t.sym === 'BTC' ? T.btc : t.sym === 'ETH' ? T.eth : T.spx)
                              : t.kind === 'future' ? T.oil
                              : T.spx;
                  return (
                    <PriceTile key={`${t.kind}-${t.sym}`}
                      sym={t.sym} name={t.name}
                      price={price} change={change}
                      color={color}
                      onClick={() => setOpenTicker({ ...t, kind: t.kind })}
                      saved={true}
                      onToggleSave={() => wl.toggleTicker(t)}
                    />
                  );
                })}
              </div>
            )}

            {/* Saved options */}
            {wl.watchlist.options.length > 0 && (
              <div>
                <div style={{
                  fontSize: 9.5, letterSpacing: 0.8, color: T.textDim,
                  textTransform: 'uppercase', fontWeight: 500, marginBottom: 6,
                }}>Saved option contracts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {wl.watchlist.options.map(o => (
                    <div key={o.symbol} style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 70px 60px 1fr 80px 80px 80px 80px 28px',
                      gap: 10, alignItems: 'center',
                      padding: '7px 10px',
                      background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 7,
                      fontFamily: T.mono, fontSize: 11,
                    }}>
                      <div style={{ color: T.signal, fontWeight: 600, letterSpacing: 0.3 }}>{o.underlying}</div>
                      <div style={{ color: T.text }}>{o.expiration}</div>
                      <div style={{
                        color: o.optionType === 'call' ? T.bull : T.bear,
                        fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 10,
                      }}>{o.optionType}</div>
                      <div style={{ color: T.text, fontWeight: 500 }}>${o.strike}</div>
                      <div style={{ color: T.textMid, fontSize: 10 }}>BID ${((o.bid || 0).toFixed ? (o.bid || 0).toFixed(2) : o.bid)}</div>
                      <div style={{ color: T.textMid, fontSize: 10 }}>ASK ${((o.ask || 0).toFixed ? (o.ask || 0).toFixed(2) : o.ask)}</div>
                      <div style={{ color: T.textDim, fontSize: 10 }}>VOL {o.volume || 0}</div>
                      <div style={{ color: T.textDim, fontSize: 10 }}>OI {o.oi || 0}</div>
                      <div onClick={() => wl.toggleOption(o)} title="Remove" style={{
                        color: T.textDim, cursor: 'pointer', fontSize: 14, textAlign: 'center',
                      }}>★</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Lane title="Stocks &amp; ETFs" desc={demoMode ? "DEMO prices — add Finnhub key in ⚙ for live" : "Equities · Bitcoin-adjacent tickers · Finnhub quotes · click for 1Y + options"} data={stocksData} kind="stock" />
        <Lane title="Futures &amp; Commodities" desc="Oil, gold, silver, copper, index futures, DXY · Stooq 1Y daily" data={futuresData} kind="future" />
        <Lane title="Crypto" desc="Top 10 by liquidity · CoinGecko · click for 1Y chart" data={cryptoData} kind="crypto" />
        <div style={{ height: 12 }} />

        <PriceDetailModal open={!!openTicker} onClose={() => setOpenTicker(null)} ticker={openTicker} />
      </div>
    </div>
  );
}

window.PricesScreen = PricesScreen;
