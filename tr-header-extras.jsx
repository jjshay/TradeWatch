// tr-header-extras.jsx — shared header components reused by every screen.
// Exposes window.TRLiveStripInline (BTC + F&G polled every 60s) and
// window.TRGearInline (⚙ → opens Settings sheet).

function TRLiveStripInline() {
  const T = {
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  const [btc, setBtc] = React.useState(null);
  const [fng, setFng] = React.useState(null);
  const [lastUpdate, setLastUpdate] = React.useState(null);
  const [, setNow] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    async function tick() {
      try {
        if (typeof LiveData !== 'undefined') {
          // Primary: CoinGecko (includes 24h change). Fallback: Coinbase spot.
          const prices = await LiveData.getCryptoPrices();
          if (active && prices && prices.bitcoin) {
            setBtc({ price: prices.bitcoin.usd, change24h: prices.bitcoin.usd_24h_change });
            setLastUpdate(Date.now());
          } else {
            const spot = await LiveData.getBTCPrice();
            if (active && spot) {
              setBtc(prev => ({ price: spot, change24h: prev ? prev.change24h : 0 }));
              setLastUpdate(Date.now());
            }
          }
          const fg = await LiveData.getFearGreed();
          if (active && fg && fg.data && fg.data[0]) {
            setFng({ value: parseInt(fg.data[0].value, 10), classification: fg.data[0].value_classification });
          }
        }
      } catch (_) {}
    }
    tick();
    // Poll every 30s. Cache TTL (45s for crypto prices) means ~every other
    // poll actually hits the network — balances freshness vs rate limits.
    const iv = setInterval(tick, 30_000);
    // Separate 5s timer just to re-render the "Xs ago" age string.
    const ageTick = setInterval(() => setNow(t => t + 1), 5_000);
    return () => { active = false; clearInterval(iv); clearInterval(ageTick); };
  }, []);

  if (!btc && !fng) return null;
  const ageSecs = lastUpdate ? Math.round((Date.now() - lastUpdate) / 1000) : null;
  const ageTxt = ageSecs == null ? ''
               : ageSecs < 60   ? `${ageSecs}s`
               : ageSecs < 3600 ? `${Math.round(ageSecs / 60)}m`
               :                  `${Math.round(ageSecs / 3600)}h`;
  const ageColor = ageSecs == null ? T.textDim
                 : ageSecs < 90   ? '#6FCF8E'   // fresh
                 : ageSecs < 300  ? '#c9a227'   // stale
                 :                  '#D96B6B';  // very stale

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: T.mono, fontSize: 11 }}
      title={lastUpdate ? 'BTC updated ' + new Date(lastUpdate).toLocaleTimeString() : ''}>
      {btc && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#F7931A', fontSize: 10 }}>●</span>
          <span style={{ color: T.textDim, letterSpacing: 0.4 }}>BTC</span>
          <span style={{ color: T.text, fontWeight: 600 }}>
            ${Math.round(btc.price).toLocaleString('en-US')}
          </span>
          <span style={{ color: btc.change24h >= 0 ? '#6FCF8E' : '#D96B6B', fontSize: 10.5 }}>
            {btc.change24h >= 0 ? '+' : ''}{btc.change24h.toFixed(2)}%
          </span>
          {ageTxt && (
            <span style={{ color: ageColor, fontSize: 9, letterSpacing: 0.3, opacity: 0.9 }}>
              · {ageTxt}
            </span>
          )}
        </div>
      )}
      {fng && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: T.textDim, letterSpacing: 0.4 }}>F&amp;G</span>
          <span style={{ color: T.text, fontWeight: 600 }}>{fng.value}</span>
        </div>
      )}
    </div>
  );
}

function TRGearInline() {
  const btn = (icon, title, onClick, fs) => (
    <div onClick={onClick} title={title}
      style={{
        width: 28, height: 28, borderRadius: 7,
        background: '#10141B', border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'rgba(180,188,200,0.75)', fontSize: fs || 13,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontWeight: 600,
      }}>{icon}</div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {btn('⬚',  'Panel launcher (⌘⇧P)',         () => window.openTRPanelLauncher && window.openTRPanelLauncher(), 14)}
      {btn('⌘K', 'Command palette (⌘K or /)',    () => window.openTRCmdK    && window.openTRCmdK(),    10)}
      {btn('📘', 'Trade journal (J)',             () => window.openTRJournal && window.openTRJournal(),  12)}
      {btn('🔔',  'Alerts · Telegram triggers',   () => window.openTRAlerts  && window.openTRAlerts())}
      {btn('⚙',  'Settings · refresh · API keys',() => window.openTRSettings && window.openTRSettings(), 14)}
    </div>
  );
}

// Last-fetched badge for a specific refreshKey in Settings.
function TRLastFetchedBadge({ lastFetch, label = 'updated' }) {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const iv = setInterval(() => tick(t => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  if (!lastFetch) return null;
  const secs = Math.round((Date.now() - lastFetch.getTime()) / 1000);
  const txt = secs < 60 ? `${secs}s ago`
            : secs < 3600 ? `${Math.round(secs / 60)}m ago`
            : `${Math.round(secs / 3600)}h ago`;
  return (
    <div style={{
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 9.5, color: 'rgba(180,188,200,0.55)', letterSpacing: 0.3,
    }}>{label} {txt}</div>
  );
}

// Tradier options chain — modal. Opens from anywhere via window.openTROptions().
function TROptionsChain({ open, onClose, initialSymbol }) {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  const POPULAR = ['SPY', 'QQQ', 'IBIT', 'NVDA', 'MSTR', 'COIN', 'MARA', 'AAPL', 'TSLA'];
  const [symbol, setSymbol] = React.useState(initialSymbol || 'SPY');
  React.useEffect(() => { if (initialSymbol) setSymbol(initialSymbol); }, [initialSymbol, open]);
  const [expirations, setExpirations] = React.useState([]);
  const [selectedExp, setSelectedExp] = React.useState('');
  const [chain, setChain] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [quote, setQuote] = React.useState(null);
  const wl = typeof useTRWatchlist !== 'undefined' ? useTRWatchlist() : null;

  React.useEffect(() => {
    if (!open || !symbol) return;
    let active = true;
    (async () => {
      setLoading(true); setChain(null); setQuote(null);
      const [exps, q] = await Promise.all([
        window.TradierAPI ? window.TradierAPI.getExpirations(symbol) : null,
        window.TradierAPI ? window.TradierAPI.getQuote(symbol) : null,
      ]);
      if (!active) return;
      setExpirations(exps || []);
      setQuote(q);
      if (exps && exps.length) setSelectedExp(exps[0]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open, symbol]);

  React.useEffect(() => {
    if (!open || !symbol || !selectedExp) return;
    let active = true;
    (async () => {
      setLoading(true);
      const c = window.TradierAPI ? await window.TradierAPI.getChain(symbol, selectedExp) : null;
      if (!active) return;
      setChain(c);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [symbol, selectedExp, open]);

  if (!open) return null;

  // Split chain into calls + puts; keep ATM ±10 strikes
  let calls = [], puts = [];
  if (chain && quote) {
    const spot = quote.last || quote.close || 0;
    const filtered = chain.filter(o => Math.abs(o.strike - spot) < Math.max(spot * 0.25, 20));
    calls = filtered.filter(o => o.option_type === 'call').sort((a, b) => a.strike - b.strike);
    puts  = filtered.filter(o => o.option_type === 'put' ).sort((a, b) => a.strike - b.strike);
  }

  const Row = ({ o, isCall }) => {
    const saved = wl && wl.isOptionSaved(o.symbol);
    const onStar = () => wl && wl.toggleOption({
      symbol: o.symbol,
      underlying: symbol,
      strike: o.strike,
      expiration: selectedExp,
      optionType: o.option_type,
      bid: o.bid, ask: o.ask,
      volume: o.volume, oi: o.open_interest,
    });
    return (
      <tr style={{ borderBottom: `0.5px solid ${T.edge}` }}>
        <td style={{ padding: '4px 4px', textAlign: isCall ? 'left' : 'right', width: 20 }}>
          {wl && <TRStar saved={saved} onToggle={onStar} size={11} />}
        </td>
        <td style={{ padding: '4px 6px', fontFamily: T.mono, fontSize: 10.5, color: T.text, fontWeight: 500, textAlign: isCall ? 'right' : 'left' }}>
          ${(o.bid || 0).toFixed(2)}
        </td>
        <td style={{ padding: '4px 6px', fontFamily: T.mono, fontSize: 10.5, color: T.textMid, textAlign: isCall ? 'right' : 'left' }}>
          ${(o.ask || 0).toFixed(2)}
        </td>
        <td style={{ padding: '4px 6px', fontFamily: T.mono, fontSize: 10, color: T.textDim, textAlign: isCall ? 'right' : 'left' }}>
          {o.volume || 0}
        </td>
        <td style={{ padding: '4px 6px', fontFamily: T.mono, fontSize: 10, color: T.textDim, textAlign: isCall ? 'right' : 'left' }}>
          {o.open_interest || 0}
        </td>
      </tr>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
        backdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 40,
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 920, maxHeight: '90%', overflow: 'auto',
        background: T.ink100, border: `1px solid ${T.edgeHi}`, borderRadius: 14,
        padding: '22px 26px', color: T.text,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Tradier Options Chain</div>
          <div style={{
            padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6,
            color: T.signal, background: 'rgba(201,162,39,0.12)', borderRadius: 4,
            border: '0.5px solid rgba(201,162,39,0.4)',
          }}>{(window.TR_SETTINGS?.meta?.tradierMode || 'sandbox').toUpperCase()}</div>
          <div onClick={onClose} style={{
            marginLeft: 'auto', width: 28, height: 28, borderRadius: 7,
            background: T.ink300, border: `1px solid ${T.edge}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.textMid, fontSize: 13,
          }}>✕</div>
        </div>

        {/* Symbol picker + quote */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {POPULAR.map(s => {
            const on = s === symbol;
            return (
              <div key={s} onClick={() => setSymbol(s)} style={{
                padding: '5px 12px', fontFamily: T.mono, fontSize: 11, fontWeight: 600,
                background: on ? T.signal : T.ink200, color: on ? T.ink000 : T.textMid,
                border: `1px solid ${on ? T.signal : T.edge}`, borderRadius: 6,
                cursor: on ? 'default' : 'pointer',
              }}>{s}</div>
            );
          })}
          <input
            value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
            style={{
              padding: '5px 10px', fontFamily: T.mono, fontSize: 11, width: 80,
              background: T.ink000, border: `1px solid ${T.edge}`, color: T.text,
              borderRadius: 6, outline: 'none',
            }} placeholder="TICKER"
          />
        </div>

        {/* Quote */}
        {quote && (
          <div style={{
            background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
            padding: '12px 16px', marginBottom: 14,
            display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 500, color: T.text }}>
              {quote.symbol} ${(quote.last || quote.close || 0).toFixed(2)}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: 12,
              color: (quote.change || 0) >= 0 ? T.bull : T.bear,
            }}>
              {(quote.change || 0) >= 0 ? '+' : ''}{(quote.change || 0).toFixed(2)} · {(quote.change_percentage || 0).toFixed(2)}%
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginLeft: 'auto' }}>
              BID {(quote.bid || 0).toFixed(2)} · ASK {(quote.ask || 0).toFixed(2)} · VOL {(quote.volume || 0).toLocaleString()}
            </div>
          </div>
        )}

        {/* Expirations */}
        {expirations.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10, letterSpacing: 0.8, color: T.textDim, alignSelf: 'center', textTransform: 'uppercase', fontWeight: 600, marginRight: 6 }}>Exp</div>
            {expirations.slice(0, 8).map(exp => {
              const on = exp === selectedExp;
              return (
                <div key={exp} onClick={() => setSelectedExp(exp)} style={{
                  padding: '4px 9px', fontFamily: T.mono, fontSize: 10, fontWeight: 500,
                  background: on ? T.signal : T.ink200, color: on ? T.ink000 : T.textMid,
                  border: `1px solid ${on ? T.signal : T.edge}`, borderRadius: 5,
                  cursor: on ? 'default' : 'pointer',
                }}>{exp}</div>
              );
            })}
          </div>
        )}

        {loading && (
          <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 11, color: T.textDim }}>
            LOADING TRADIER CHAIN…
          </div>
        )}

        {!loading && !chain && !quote && (
          <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: T.textDim }}>
            No chain available. Check that Tradier key is set in Settings ⚙ and mode matches (sandbox vs live).
          </div>
        )}

        {chain && calls.length > 0 && puts.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 10 }}>
            {/* Calls */}
            <div>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: T.bull, textTransform: 'uppercase', fontWeight: 600,
                marginBottom: 6, textAlign: 'right',
              }}>Calls</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: `0.5px solid ${T.edgeHi}` }}>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500 }}>BID</th>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500 }}>ASK</th>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500 }}>VOL</th>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500 }}>OI</th>
                </tr></thead>
                <tbody>{calls.map((o, i) => <Row key={i} o={o} isCall={true} />)}</tbody>
              </table>
            </div>
            {/* Strike column */}
            <div>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: T.signal, textTransform: 'uppercase', fontWeight: 600,
                marginBottom: 6, textAlign: 'center',
              }}>Strike</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: `0.5px solid ${T.edgeHi}` }}>
                  <th style={{ padding: '4px', fontSize: 9, color: T.textDim, textAlign: 'center', fontWeight: 500 }}>$</th>
                </tr></thead>
                <tbody>{calls.map((o, i) => (
                  <tr key={i} style={{ borderBottom: `0.5px solid ${T.edge}` }}>
                    <td style={{
                      padding: '4px', fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
                      textAlign: 'center',
                      color: Math.abs(o.strike - (quote?.last || 0)) < 1 ? T.signal : T.text,
                    }}>{o.strike}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {/* Puts */}
            <div>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: T.bear, textTransform: 'uppercase', fontWeight: 600,
                marginBottom: 6, textAlign: 'left',
              }}>Puts</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: `0.5px solid ${T.edgeHi}` }}>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500 }}>BID</th>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500 }}>ASK</th>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500 }}>VOL</th>
                  <th style={{ padding: '4px 6px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500 }}>OI</th>
                </tr></thead>
                <tbody>{puts.map((o, i) => <Row key={i} o={o} isCall={false} />)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
window.TROptionsChain = TROptionsChain;

// Small button — "Options" — opens the chain. Usable in any screen header.
function TROptionsButton() {
  return (
    <div
      onClick={() => window.openTROptions && window.openTROptions()}
      title="Tradier options chain"
      style={{
        padding: '0 10px', height: 26, display: 'flex', alignItems: 'center', gap: 5,
        background: '#10141B', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6, cursor: 'pointer', color: 'rgba(180,188,200,0.75)',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
      }}>⚡ CHAIN</div>
  );
}
window.TROptionsButton = TROptionsButton;

// ============================================================================
// Tradier TRADE modal — submits paper/live orders, shows positions + orders.
// Opens via window.openTRTrade(). Polls account every 15s while open.
// ============================================================================
function TRTradeModal({ open, onClose }) {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  const mode = (window.TR_SETTINGS?.meta?.tradierMode || 'sandbox').toLowerCase();
  const isLive = mode === 'live';

  // Account / positions / orders state
  const [account, setAccount]     = React.useState(null);
  const [positions, setPositions] = React.useState([]);
  const [orders, setOrders]       = React.useState([]);
  const [bottomTab, setBottomTab] = React.useState('positions');

  // Ticket state
  const [ticketTab, setTicketTab] = React.useState('stock'); // 'stock' | 'option'
  const [symbol, setSymbol]       = React.useState('SPY');
  const [side, setSide]           = React.useState('buy');
  const [quantity, setQuantity]   = React.useState(1);
  const [orderType, setOrderType] = React.useState('market');
  const [price, setPrice]         = React.useState('');
  const [duration, setDuration]   = React.useState('day');
  // Option fields
  const [strike, setStrike]       = React.useState('');
  const [expiration, setExpiration] = React.useState('');
  const [callPut, setCallPut]     = React.useState('call');
  const [expirations, setExpirations] = React.useState([]);

  const [previewResult, setPreviewResult] = React.useState(null);
  const [submitResult, setSubmitResult]   = React.useState(null);
  const [working, setWorking]             = React.useState(false);
  const [hasPreviewed, setHasPreviewed]   = React.useState(false);

  // Poll account every 15s while open
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    async function tick() {
      if (!window.TradierAPI) return;
      const [a, p, o] = await Promise.all([
        window.TradierAPI.getAccount(),
        window.TradierAPI.getPositions(),
        window.TradierAPI.getOrders(),
      ]);
      if (!active) return;
      setAccount(a); setPositions(p || []); setOrders(o || []);
    }
    tick();
    const iv = setInterval(tick, 15_000);
    return () => { active = false; clearInterval(iv); };
  }, [open]);

  // Pull expirations when symbol changes in option mode
  React.useEffect(() => {
    if (!open || ticketTab !== 'option' || !symbol) return;
    let active = true;
    (async () => {
      const ex = window.TradierAPI ? await window.TradierAPI.getExpirations(symbol) : null;
      if (!active) return;
      setExpirations(ex || []);
      if (ex && ex.length && !expiration) setExpiration(ex[0]);
    })();
    return () => { active = false; };
  }, [open, ticketTab, symbol]);

  // OCC option symbol builder (e.g. SPY240419C00500000)
  function buildOccSymbol() {
    if (!symbol || !expiration || !strike) return '';
    const exp = expiration.replace(/-/g, '').slice(2); // YYMMDD
    const cp = callPut === 'call' ? 'C' : 'P';
    const k = Math.round(parseFloat(strike) * 1000).toString().padStart(8, '0');
    return `${symbol.toUpperCase()}${exp}${cp}${k}`;
  }

  function buildOpts() {
    const base = {
      symbol,
      side,
      quantity: Number(quantity) || 0,
      type: orderType,
      duration,
    };
    if (orderType === 'limit' || orderType === 'stop_limit') {
      base.price = parseFloat(price) || 0;
    }
    if (ticketTab === 'option') {
      base.option_symbol = buildOccSymbol();
    }
    return base;
  }

  async function doPreview() {
    setWorking(true); setSubmitResult(null);
    const r = window.TradierAPI ? await window.TradierAPI.previewOrder(buildOpts()) : null;
    setPreviewResult(r); setHasPreviewed(true); setWorking(false);
  }
  async function doSubmit() {
    if (isLive && !hasPreviewed) {
      setSubmitResult({ _error: true, body: { errors: { error: 'Preview required before live submit.' } } });
      return;
    }
    setWorking(true);
    const r = window.TradierAPI ? await window.TradierAPI.placeOrder(buildOpts()) : null;
    setSubmitResult(r); setWorking(false);
    if (window.TradierAPI && r && !r._error) {
      const o = await window.TradierAPI.getOrders();
      setOrders(o || []);
    }
  }
  async function doCancel(orderId) {
    if (!window.TradierAPI) return;
    await window.TradierAPI.cancelOrder(orderId);
    const o = await window.TradierAPI.getOrders();
    setOrders(o || []);
  }

  if (!open) return null;

  // Common style snippets
  const inputStyle = {
    padding: '6px 10px', fontFamily: T.mono, fontSize: 11,
    background: T.ink000, border: `1px solid ${T.edge}`, color: T.text,
    borderRadius: 6, outline: 'none', width: '100%',
  };
  const labelStyle = {
    fontSize: 9, letterSpacing: 0.8, color: T.textDim,
    textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
  };
  const Pill = ({ on, label, onClick }) => (
    <div onClick={onClick} style={{
      padding: '5px 10px', fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
      background: on ? T.signal : T.ink200, color: on ? T.ink000 : T.textMid,
      border: `1px solid ${on ? T.signal : T.edge}`, borderRadius: 5,
      cursor: on ? 'default' : 'pointer', letterSpacing: 0.4,
    }}>{label}</div>
  );

  // Preview/submit display normalization
  function renderResult(r, kind) {
    if (!r) return null;
    if (r._error) {
      const msg = r.body && r.body.errors ? JSON.stringify(r.body.errors) : (r.message || `HTTP ${r.status || '?'}`);
      return (
        <div style={{
          marginTop: 10, padding: '8px 12px', fontFamily: T.mono, fontSize: 10.5,
          background: 'rgba(217,107,107,0.10)', border: `1px solid ${T.bear}`, borderRadius: 6,
          color: T.bear,
        }}>{kind} ERROR · {msg}</div>
      );
    }
    const body = r.order || r;
    return (
      <div style={{
        marginTop: 10, padding: '10px 14px', fontFamily: T.mono, fontSize: 10.5,
        background: T.ink200, border: `1px solid ${T.edgeHi}`, borderRadius: 6,
        color: T.text, lineHeight: 1.55,
      }}>
        <div style={{ color: T.signal, fontWeight: 600, marginBottom: 4, letterSpacing: 0.6 }}>{kind} OK</div>
        {body.id && <div>ORDER ID · {body.id}</div>}
        {body.status && <div>STATUS · {body.status}</div>}
        {body.cost != null && <div>COST · ${Number(body.cost).toFixed(2)}</div>}
        {body.commission != null && <div>COMMISSION · ${Number(body.commission).toFixed(2)}</div>}
        {body.fees != null && <div>FEES · ${Number(body.fees).toFixed(2)}</div>}
        {body.symbol && <div>SYMBOL · {body.symbol}</div>}
        {body.quantity != null && <div>QTY · {body.quantity}</div>}
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
      backdropFilter: 'blur(12px) saturate(150%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 40,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 980, maxHeight: '92%', overflow: 'auto',
        background: T.ink100, border: `1px solid ${T.edgeHi}`, borderRadius: 14,
        padding: '22px 26px', color: T.text,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Tradier Trading</div>
          <div style={{
            padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6,
            color: isLive ? T.bear : T.signal,
            background: isLive ? 'rgba(217,107,107,0.12)' : 'rgba(201,162,39,0.12)',
            borderRadius: 4,
            border: `0.5px solid ${isLive ? T.bear : 'rgba(201,162,39,0.4)'}`,
          }}>{mode.toUpperCase()}</div>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 }}>
            ACCT · {(window.TradierAPI && window.TradierAPI._accountId && window.TradierAPI._accountId()) || 'VA43420796'}
          </div>
          <div onClick={onClose} style={{
            marginLeft: 'auto', width: 28, height: 28, borderRadius: 7,
            background: T.ink300, border: `1px solid ${T.edge}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.textMid, fontSize: 13,
          }}>✕</div>
        </div>

        {/* Live mode warning */}
        {isLive && (
          <div style={{
            marginBottom: 14, padding: '10px 14px',
            background: 'rgba(217,107,107,0.10)',
            border: `1px solid ${T.bear}`, borderRadius: 8,
            color: T.bear, fontFamily: T.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: 0.5, textAlign: 'center',
          }}>
            ⚠ LIVE MODE — REAL MONEY. Orders will execute. Preview required before Submit.
          </div>
        )}

        {/* (a) TOP — Account summary */}
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '14px 16px', marginBottom: 14,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
        }}>
          <div>
            <div style={labelStyle}>Total Equity</div>
            <div style={{ fontFamily: T.mono, fontSize: 18, color: T.text, fontWeight: 600 }}>
              {account && account.total_equity != null ? `$${Number(account.total_equity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Cash</div>
            <div style={{ fontFamily: T.mono, fontSize: 18, color: T.text, fontWeight: 600 }}>
              {account && account.cash != null ? `$${Number(account.cash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Day Change (Open P&L)</div>
            <div style={{
              fontFamily: T.mono, fontSize: 18, fontWeight: 600,
              color: account && account.day_change != null ? (account.day_change >= 0 ? T.bull : T.bear) : T.text,
            }}>
              {account && account.day_change != null
                ? `${account.day_change >= 0 ? '+' : ''}$${Number(account.day_change).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Buying Power</div>
            <div style={{ fontFamily: T.mono, fontSize: 18, color: T.text, fontWeight: 600 }}>
              {account && account.buying_power != null ? `$${Number(account.buying_power).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
        </div>

        {/* (b) MIDDLE — Order ticket */}
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '16px 18px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Order Ticket</div>
            <div style={{ marginLeft: 12, display: 'flex', gap: 6 }}>
              <Pill on={ticketTab === 'stock'}  label="STOCK"  onClick={() => { setTicketTab('stock');  setHasPreviewed(false); setPreviewResult(null); }} />
              <Pill on={ticketTab === 'option'} label="OPTION" onClick={() => { setTicketTab('option'); setHasPreviewed(false); setPreviewResult(null); }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 0.8fr 0.9fr 0.9fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={labelStyle}>Symbol</div>
              <input value={symbol} onChange={e => { setSymbol(e.target.value.toUpperCase()); setHasPreviewed(false); }} style={inputStyle} placeholder="SPY" />
            </div>
            <div>
              <div style={labelStyle}>Side</div>
              <select value={side} onChange={e => { setSide(e.target.value); setHasPreviewed(false); }} style={inputStyle}>
                {ticketTab === 'stock' ? (
                  <>
                    <option value="buy">buy</option>
                    <option value="sell">sell</option>
                    <option value="sell_short">sell_short</option>
                    <option value="buy_to_cover">buy_to_cover</option>
                  </>
                ) : (
                  <>
                    <option value="buy_to_open">buy_to_open</option>
                    <option value="sell_to_close">sell_to_close</option>
                    <option value="sell_to_open">sell_to_open</option>
                    <option value="buy_to_close">buy_to_close</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Quantity</div>
              <input type="number" min="1" value={quantity} onChange={e => { setQuantity(e.target.value); setHasPreviewed(false); }} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Type</div>
              <select value={orderType} onChange={e => { setOrderType(e.target.value); setHasPreviewed(false); }} style={inputStyle}>
                <option value="market">market</option>
                <option value="limit">limit</option>
                <option value="stop">stop</option>
                <option value="stop_limit">stop_limit</option>
              </select>
            </div>
            <div>
              <div style={labelStyle}>Duration</div>
              <select value={duration} onChange={e => { setDuration(e.target.value); setHasPreviewed(false); }} style={inputStyle}>
                <option value="day">day</option>
                <option value="gtc">gtc</option>
                <option value="pre">pre</option>
                <option value="post">post</option>
              </select>
            </div>
          </div>

          {(orderType === 'limit' || orderType === 'stop_limit') && (
            <div style={{ display: 'grid', gridTemplateColumns: '0.5fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={labelStyle}>Limit Price</div>
                <input type="number" step="0.01" value={price} onChange={e => { setPrice(e.target.value); setHasPreviewed(false); }} style={inputStyle} placeholder="0.00" />
              </div>
            </div>
          )}

          {ticketTab === 'option' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr 1.4fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={labelStyle}>Expiration</div>
                <select value={expiration} onChange={e => { setExpiration(e.target.value); setHasPreviewed(false); }} style={inputStyle}>
                  {!expirations.length && <option value="">— pick a symbol —</option>}
                  {expirations.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>Strike</div>
                <input type="number" step="0.5" value={strike} onChange={e => { setStrike(e.target.value); setHasPreviewed(false); }} style={inputStyle} placeholder="500" />
              </div>
              <div>
                <div style={labelStyle}>C/P</div>
                <select value={callPut} onChange={e => { setCallPut(e.target.value); setHasPreviewed(false); }} style={inputStyle}>
                  <option value="call">call</option>
                  <option value="put">put</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>OCC Symbol</div>
                <div style={{
                  ...inputStyle, color: T.textMid,
                  display: 'flex', alignItems: 'center', minHeight: 26,
                }}>{buildOccSymbol() || '—'}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <div onClick={!working ? doPreview : null} style={{
              padding: '7px 16px', fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
              background: T.ink300, color: T.text, border: `1px solid ${T.edgeHi}`, borderRadius: 6,
              cursor: working ? 'default' : 'pointer', opacity: working ? 0.5 : 1,
            }}>PREVIEW</div>
            <div onClick={!working && (!isLive || hasPreviewed) ? doSubmit : null} style={{
              padding: '7px 16px', fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
              background: side.startsWith('buy') ? T.bull : T.bear,
              color: T.ink000, border: `1px solid ${side.startsWith('buy') ? T.bull : T.bear}`,
              borderRadius: 6,
              cursor: (working || (isLive && !hasPreviewed)) ? 'not-allowed' : 'pointer',
              opacity: (working || (isLive && !hasPreviewed)) ? 0.45 : 1,
            }}>{isLive && !hasPreviewed ? 'PREVIEW REQUIRED' : 'SUBMIT'}</div>
            {working && (
              <div style={{ alignSelf: 'center', fontFamily: T.mono, fontSize: 10, color: T.textDim }}>WORKING…</div>
            )}
          </div>

          {renderResult(previewResult, 'PREVIEW')}
          {renderResult(submitResult,  'SUBMIT')}
        </div>

        {/* (c) BOTTOM — Positions / Orders tabs */}
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <Pill on={bottomTab === 'positions'} label={`POSITIONS · ${positions.length}`} onClick={() => setBottomTab('positions')} />
            <Pill on={bottomTab === 'orders'}    label={`ORDERS · ${orders.length}`}        onClick={() => setBottomTab('orders')} />
          </div>

          {bottomTab === 'positions' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: `0.5px solid ${T.edgeHi}` }}>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500, letterSpacing: 0.6 }}>SYMBOL</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500, letterSpacing: 0.6 }}>QTY</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500, letterSpacing: 0.6 }}>COST BASIS</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500, letterSpacing: 0.6 }}>ACQUIRED</th>
              </tr></thead>
              <tbody>
                {!positions.length && (
                  <tr><td colSpan="4" style={{ padding: '14px', textAlign: 'center', fontSize: 11, color: T.textDim }}>
                    No positions.
                  </td></tr>
                )}
                {positions.map((p, i) => (
                  <tr key={i} style={{ borderBottom: `0.5px solid ${T.edge}` }}>
                    <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 11, color: T.text, fontWeight: 600 }}>{p.symbol}</td>
                    <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 11, color: T.textMid, textAlign: 'right' }}>{p.quantity}</td>
                    <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 11, color: T.textMid, textAlign: 'right' }}>${Number(p.cost_basis || 0).toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 10, color: T.textDim, textAlign: 'right' }}>{(p.date_acquired || '').slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {bottomTab === 'orders' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: `0.5px solid ${T.edgeHi}` }}>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500, letterSpacing: 0.6 }}>ID</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500, letterSpacing: 0.6 }}>SYMBOL</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500, letterSpacing: 0.6 }}>SIDE</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500, letterSpacing: 0.6 }}>QTY</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500, letterSpacing: 0.6 }}>TYPE</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500, letterSpacing: 0.6 }}>PRICE</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'left', fontWeight: 500, letterSpacing: 0.6 }}>STATUS</th>
                <th style={{ padding: '6px 8px', fontSize: 9, color: T.textDim, textAlign: 'right', fontWeight: 500, letterSpacing: 0.6 }}>—</th>
              </tr></thead>
              <tbody>
                {!orders.length && (
                  <tr><td colSpan="8" style={{ padding: '14px', textAlign: 'center', fontSize: 11, color: T.textDim }}>
                    No active orders.
                  </td></tr>
                )}
                {orders.map((o, i) => {
                  const cancellable = ['open', 'pending', 'partially_filled', 'submitted'].indexOf((o.status || '').toLowerCase()) >= 0;
                  return (
                    <tr key={i} style={{ borderBottom: `0.5px solid ${T.edge}` }}>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 10, color: T.textDim }}>{o.id}</td>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 11, color: T.text, fontWeight: 600 }}>{o.symbol || o.option_symbol}</td>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 10, color: (o.side || '').startsWith('buy') ? T.bull : T.bear }}>{o.side}</td>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 11, color: T.textMid, textAlign: 'right' }}>{o.quantity}</td>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 10, color: T.textMid }}>{o.type}</td>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 11, color: T.textMid, textAlign: 'right' }}>{o.price != null ? `$${Number(o.price).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '6px 8px', fontFamily: T.mono, fontSize: 10, color: T.signal, letterSpacing: 0.4 }}>{(o.status || '').toUpperCase()}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {cancellable && (
                          <span onClick={() => doCancel(o.id)} style={{
                            fontFamily: T.mono, fontSize: 9.5, color: T.bear,
                            border: `1px solid ${T.bear}`, padding: '2px 7px', borderRadius: 4,
                            cursor: 'pointer', letterSpacing: 0.5,
                          }}>CANCEL</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
window.TRTradeModal = TRTradeModal;

// Small button — "TRADE" — opens the modal. Usable in any screen header.
function TRTradeButton() {
  return (
    <div
      onClick={() => window.openTRTrade && window.openTRTrade()}
      title="Tradier paper/live trading"
      style={{
        padding: '0 10px', height: 26, display: 'flex', alignItems: 'center', gap: 5,
        background: '#10141B', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6, cursor: 'pointer', color: 'rgba(180,188,200,0.75)',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
      }}>⚡ TRADE</div>
  );
}
window.TRTradeButton = TRTradeButton;

// Single source of truth for tab nav. Add/remove/rename tabs here only.
window.TR_TABS_META = [
  { key: 'drivers',     label: 'Drivers'     },
  { key: 'summary',     label: 'Summary'     },
  { key: 'historical',  label: 'Historical'  },
  { key: 'projected',   label: 'Projected'   },
  { key: 'impact',      label: 'Impact'      },
  { key: 'recommend',   label: 'Recommend'   },
  { key: 'news',        label: 'News'        },
  { key: 'calendar',    label: 'Calendar'    },
  { key: 'signals',     label: 'Signals'     },
  { key: 'prices',      label: 'Prices'      },
  { key: 'flights',     label: 'Flights'     },
];

// Reusable tab bar — drops into every screen header. `current` = the tab key
// of the screen rendering this; everything else is highlight + click logic.
function TRTabBar({ current, onNav }) {
  const T = {
    ink200: '#10141B', ink400: '#1E2430', edge: 'rgba(255,255,255,0.06)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  return (
    <div style={{
      display: 'flex', padding: 3,
      background: T.ink200, borderRadius: 10, border: `1px solid ${T.edge}`,
      height: 34, alignItems: 'center',
    }}>
      {window.TR_TABS_META.map((t, idx) => {
        const active = t.key === current;
        return (
          <div key={t.key}
            onClick={() => !active && onNav && onNav(t.key)}
            style={{
              padding: '0 10px', height: 28, display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, fontWeight: 500, borderRadius: 7,
              background: active ? T.ink400 : 'transparent',
              color: active ? T.text : T.textMid,
              boxShadow: active ? 'inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)' : 'none',
              cursor: active ? 'default' : 'pointer',
              transition: 'background 120ms cubic-bezier(0.2,0.7,0.2,1), color 120ms cubic-bezier(0.2,0.7,0.2,1)',
            }}>
            <span style={{
              fontFamily: T.mono, fontSize: 9, color: active ? T.signal : T.textDim,
              fontWeight: 600, letterSpacing: 0.3,
            }}>{idx + 1}.</span>
            {t.label}
          </div>
        );
      })}
    </div>
  );
}
window.TRTabBar = TRTabBar;

// First-visit welcome modal — gently tells new users to paste keys for full
// functionality. Dismissal persisted in localStorage so it never re-shows.
function TRWelcome() {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  const [show, setShow] = React.useState(() => {
    try {
      return localStorage.getItem('tr_welcomed') !== 'true';
    } catch { return false; }
  });
  if (!show) return null;

  const dismiss = (opened) => {
    try { localStorage.setItem('tr_welcomed', 'true'); } catch {}
    setShow(false);
    if (opened && window.openTRSettings) setTimeout(window.openTRSettings, 100);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.85)',
      backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 120, padding: 40,
    }}>
      <div style={{
        width: 560, background: T.ink100, border: `1px solid ${T.edgeHi}`,
        borderRadius: 14, padding: '32px 36px', color: T.text,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        boxShadow: '0 32px 100px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <img src="assets/gg-logo.png" alt="" style={{ width: 52, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(201,162,39,0.35))' }} />
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.4, color: T.signal, textTransform: 'uppercase', fontWeight: 600, fontFamily: T.mono, marginBottom: 4 }}>Welcome to</div>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.3 }}>TradeRadar</div>
          </div>
        </div>

        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: T.textMid, marginBottom: 18 }}>
          A trading dashboard that fuses real-time crypto + macro data with multi-LLM consensus analysis.
          Built for traders who want to see cause before price.
        </div>

        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '14px 16px', marginBottom: 18,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 1, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>What works out of the box</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: T.text, marginBottom: 12 }}>
            <div><span style={{ color: T.bull, marginRight: 6 }}>✓</span>Crypto prices (top 10)</div>
            <div><span style={{ color: T.bull, marginRight: 6 }}>✓</span>Futures + commodities</div>
            <div><span style={{ color: T.bull, marginRight: 6 }}>✓</span>Live news RSS feed</div>
            <div><span style={{ color: T.bull, marginRight: 6 }}>✓</span>BTC + Fear &amp; Greed</div>
          </div>

          <div style={{ fontSize: 10, letterSpacing: 1, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Add your keys in ⚙ for</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: T.textMid }}>
            <div>• Stock prices (Finnhub, free)</div>
            <div>• Options chains (Tradier)</div>
            <div>• Multi-LLM rationale</div>
            <div>• AI recommendations</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.55, marginBottom: 20, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 7 }}>
          Your API keys live only in this browser's localStorage — never sent to any TradeRadar server.
          No tracking, no telemetry.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div
            onClick={() => dismiss(false)}
            style={{
              flex: 1, padding: '12px 16px',
              background: T.ink300, border: `1px solid ${T.edge}`,
              borderRadius: 8, textAlign: 'center', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 500, color: T.textMid,
            }}>Continue in demo mode</div>
          <div
            onClick={() => dismiss(true)}
            style={{
              flex: 1, padding: '12px 16px',
              background: T.signal, color: T.ink000,
              borderRadius: 8, textAlign: 'center', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2,
              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3)',
            }}>⚙ Add API keys</div>
        </div>
      </div>
    </div>
  );
}
window.TRWelcome = TRWelcome;

// Reusable star button — toggles saved state on a ticker or option.
// Parent decides what `saved` + `onToggle` do; this just renders the ★.
function TRStar({ saved, onToggle, size = 14, title }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggle && onToggle(e); }}
      title={title || (saved ? 'Remove from watchlist' : 'Add to watchlist')}
      style={{
        width: size + 6, height: size + 6, borderRadius: (size + 6) / 2,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        color: saved ? '#c9a227' : 'rgba(180,188,200,0.45)',
        fontSize: size,
        transition: 'color 120ms cubic-bezier(0.2,0.7,0.2,1)',
      }}>
      {saved ? '★' : '☆'}
    </div>
  );
}
window.TRStar = TRStar;

window.TRLiveStripInline = TRLiveStripInline;
window.TRGearInline = TRGearInline;
window.TRLastFetchedBadge = TRLastFetchedBadge;
