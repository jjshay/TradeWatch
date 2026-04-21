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
  { sym: 'SPY',  name: 'S&P 500 ETF' },
  { sym: 'QQQ',  name: 'Nasdaq 100 ETF' },
  { sym: 'DIA',  name: 'Dow Jones ETF' },
  { sym: 'IWM',  name: 'Russell 2000 ETF' },
  { sym: 'NVDA', name: 'Nvidia' },
  { sym: 'TSLA', name: 'Tesla' },
  { sym: 'AAPL', name: 'Apple' },
  { sym: 'MSFT', name: 'Microsoft' },
  { sym: 'MSTR', name: 'MicroStrategy' },
  { sym: 'COIN', name: 'Coinbase' },
  { sym: 'IBIT', name: 'iShares Bitcoin Trust' },
  { sym: 'MARA', name: 'Marathon Digital' },
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

function PriceTile({ sym, name, price, change, unit, spark, color, loading, error }) {
  const T = prT;
  const up = change >= 0;
  const deltaColor = up ? T.bull : T.bear;
  return (
    <div style={{
      background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 9,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative', overflow: 'hidden', minHeight: 110,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: color || T.textMid }} />
        <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: T.text }}>
          {sym}
        </div>
        <div style={{
          marginLeft: 'auto', fontSize: 9, color: T.textDim, letterSpacing: 0.3,
          textAlign: 'right', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</div>
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

function PricesScreen({ onNav }) {
  const T = prT;
  const W = 1280, H = 820;

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

  // Build per-tile data
  const stocksData = STOCKS.map(s => ({
    ...s,
    price:  stockQuotes && stockQuotes[s.sym] ? stockQuotes[s.sym].price  : null,
    change: stockQuotes && stockQuotes[s.sym] ? stockQuotes[s.sym].change : null,
    color: s.sym === 'MSTR' || s.sym === 'COIN' || s.sym === 'IBIT' || s.sym === 'MARA' ? T.btc : T.spx,
  }));
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

  const Lane = ({ title, desc, data }) => {
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
          {['Historical', 'Projected', 'Impact', 'Recommend', 'News', 'Calendar', 'Signals', 'Prices'].map((t, idx) => {
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
        <Lane title="Stocks &amp; ETFs" desc="Equities · Bitcoin-adjacent tickers · Finnhub quotes" data={stocksData} />
        <Lane title="Futures &amp; Commodities" desc="Oil, gold, silver, copper, index futures, DXY · Finnhub" data={futuresData} />
        <Lane title="Crypto" desc="Top 10 by liquidity · CoinGecko · no key required" data={cryptoData} />
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

window.PricesScreen = PricesScreen;
