// tr-hooks.jsx — Auto-update hook + global settings.
// Exposes:
//   window.useAutoUpdate(key, fetcherFn, intervalMsOverride)
//   window.TR_SETTINGS  (reactive singleton backed by localStorage)
//   window.TRSettingsSheet  (slide-up panel React component)
//   window.TRGearButton  (tiny header button that opens the sheet)
//
// Settings shape (localStorage key "tr_settings"):
// {
//   keys: { coingecko, tradier, polygon, claude, alpaca, finnhub },
//   refresh: { header, historical, news, calendar, signals, impact, projected, recommend }  // seconds
//   sources: { stocks: 'yahoo'|'polygon'|'alpaca', options: 'tradier' }
// }

const TR_DEFAULT_SETTINGS = {
  keys: { coingecko: '', tradier: '', polygon: '', claude: '', openai: '', gemini: '', grok: '', perplexity: '', alpaca: '', finnhub: '', newsapi: '', newsdata: '', bitly: '' },
  refresh: {
    header: 60, historical: 300, news: 180, calendar: 600,
    signals: 120, impact: 60, projected: 600, recommend: 600,
  },
  sources: { stocks: 'yahoo', options: 'tradier' },
};

function trLoadSettings() {
  try {
    const raw = localStorage.getItem('tr_settings');
    if (!raw) return JSON.parse(JSON.stringify(TR_DEFAULT_SETTINGS));
    const parsed = JSON.parse(raw);
    // merge with defaults so new fields pick up
    return {
      keys: { ...TR_DEFAULT_SETTINGS.keys, ...(parsed.keys || {}) },
      refresh: { ...TR_DEFAULT_SETTINGS.refresh, ...(parsed.refresh || {}) },
      sources: { ...TR_DEFAULT_SETTINGS.sources, ...(parsed.sources || {}) },
    };
  } catch { return JSON.parse(JSON.stringify(TR_DEFAULT_SETTINGS)); }
}
function trSaveSettings(s) {
  localStorage.setItem('tr_settings', JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('tr:settings-changed', { detail: s }));
}

// Reactive settings singleton
window.TR_SETTINGS = trLoadSettings();

function useTRSettings() {
  const [s, setS] = React.useState(window.TR_SETTINGS);
  React.useEffect(() => {
    const h = (e) => { window.TR_SETTINGS = e.detail; setS(e.detail); };
    window.addEventListener('tr:settings-changed', h);
    return () => window.removeEventListener('tr:settings-changed', h);
  }, []);
  return [s, (next) => { trSaveSettings(next); }];
}

// Generic auto-update hook. intervalMs comes from settings if `refreshKey` passed.
function useAutoUpdate(key, fetcher, { refreshKey = 'header', manualMs = null, enabled = true } = {}) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [lastFetch, setLastFetch] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  // Resolve interval from settings or override (seconds → ms)
  const [settings] = useTRSettings();
  const intervalMs = manualMs ?? (settings.refresh[refreshKey] || 60) * 1000;

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer = null;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetcherRef.current();
        if (!active) return;
        setData(res); setError(null); setLastFetch(new Date());
      } catch (e) {
        if (!active) return;
        setError(e.message || String(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    if (intervalMs > 0 && intervalMs < 3_600_000) {
      timer = setInterval(run, intervalMs);
    }
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [key, intervalMs, enabled, tick]);

  const refresh = React.useCallback(() => setTick(t => t + 1), []);
  return { data, loading, error, lastFetch, refresh, intervalMs };
}

window.useAutoUpdate = useAutoUpdate;
window.useTRSettings = useTRSettings;

// ───── Settings sheet ─────
// Per-provider test — returns { ok, ms, detail } or throws.
async function trTestProvider(k, key) {
  if (!key) return { ok: false, detail: 'no key' };
  const t0 = Date.now();
  try {
    if (k === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'grok') {
      const r = await fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'perplexity') {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'finnhub') {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${key}`);
      const j = await r.json();
      return { ok: !!(j && typeof j.c === 'number' && j.c > 0), ms: Date.now() - t0, detail: j.c > 0 ? `AAPL $${j.c}` : 'empty' };
    }
    if (k === 'tradier') {
      const mode = (window.TR_SETTINGS && window.TR_SETTINGS.meta && window.TR_SETTINGS.meta.tradierMode) || 'sandbox';
      const base = mode === 'live' ? 'https://api.tradier.com/v1' : 'https://sandbox.tradier.com/v1';
      const r = await fetch(`${base}/markets/quotes?symbols=SPY`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? `${mode} ok` : `HTTP ${r.status}` };
    }
    if (k === 'newsapi') {
      const r = await fetch(`https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${key}`);
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'newsdata') {
      const r = await fetch(`https://newsdata.io/api/1/news?apikey=${key}&q=bitcoin&size=1`);
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'bitly') {
      const r = await fetch('https://api-ssl.bitly.com/v4/user', { headers: { Authorization: `Bearer ${key}` } });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'coingecko') {
      const r = await fetch(`https://api.coingecko.com/api/v3/ping?x_cg_demo_api_key=${key}`);
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'polygon') {
      const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${key}`);
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'ok' : `HTTP ${r.status}` };
    }
    if (k === 'alpaca') {
      const [id, secret] = key.split(':');
      const r = await fetch('https://paper-api.alpaca.markets/v2/account', {
        headers: { 'APCA-API-KEY-ID': id || '', 'APCA-API-SECRET-KEY': secret || '' },
      });
      return { ok: r.ok, ms: Date.now() - t0, detail: r.ok ? 'paper ok' : `HTTP ${r.status}` };
    }
    return { ok: false, detail: 'unknown provider' };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: e.message };
  }
}
window.trTestProvider = trTestProvider;

function TRSettingsSheet({ open, onClose }) {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  const [s, save] = useTRSettings();
  const [testResults, setTestResults] = React.useState({});   // { k: {ok, ms, detail, testing} }

  const runTest = async (k) => {
    setTestResults(prev => ({ ...prev, [k]: { ...(prev[k] || {}), testing: true } }));
    const res = await trTestProvider(k, s.keys[k]);
    setTestResults(prev => ({ ...prev, [k]: { ...res, testing: false } }));
  };

  if (!open) return null;

  const updateKey = (k, v) => save({ ...s, keys: { ...s.keys, [k]: v } });
  const updateRefresh = (k, v) => save({ ...s, refresh: { ...s.refresh, [k]: v } });
  const updateSource = (k, v) => save({ ...s, sources: { ...s.sources, [k]: v } });

  const refreshLabel = (sec) => sec <= 0 ? 'Off' : sec < 60 ? `${sec}s` : `${Math.round(sec / 60)}m`;
  const refreshOptions = [15, 30, 60, 120, 300, 600, 0];

  const keyFields = [
    { k: 'coingecko', label: 'CoinGecko API Key',  hint: 'Optional · higher rate limits' },
    { k: 'tradier',   label: 'Tradier Token',      hint: 'Real-time stock quotes + options chains' },
    { k: 'polygon',   label: 'Polygon.io API Key', hint: 'Alt stock/options data provider' },
    { k: 'finnhub',   label: 'Finnhub API Key',    hint: 'Free stock prices + news' },
    { k: 'alpaca',    label: 'Alpaca Keys (id:secret)', hint: 'Paper/live trading + quotes' },
    { k: 'claude',     label: 'Anthropic (Claude) API Key',  hint: 'Main 4 · Claude POV + discovery' },
    { k: 'openai',     label: 'OpenAI (ChatGPT) API Key',    hint: 'Main 4 · ChatGPT POV + discovery' },
    { k: 'gemini',     label: 'Google AI Studio (Gemini) Key', hint: 'Main 4 · Gemini POV + discovery' },
    { k: 'grok',       label: 'xAI (Grok) API Key',          hint: 'Main 4 · Grok POV — X/Twitter angle' },
    { k: 'perplexity', label: 'Perplexity API Key',          hint: 'Search-augmented LLM for fact-checked takes' },
    { k: 'newsapi',    label: 'NewsAPI Key (newsapi.org)',   hint: 'Aggregated global news beyond crypto RSS' },
    { k: 'newsdata',   label: 'NewsData Key (newsdata.io)',  hint: 'Alternative news aggregator, richer metadata' },
    { k: 'bitly',      label: 'Bitly API Key',               hint: 'Auto-shorten article links for sharing' },
  ];

  const refreshRows = [
    { k: 'header',     label: 'Header strip (BTC · F&G)' },
    { k: 'historical', label: 'Historical chart series' },
    { k: 'news',       label: 'News feeds (RSS)' },
    { k: 'signals',    label: 'Signals dashboard' },
    { k: 'impact',     label: 'Impact tab (stocks + options)' },
    { k: 'projected',  label: 'Projected (AI narrative)' },
    { k: 'calendar',   label: 'Calendar events' },
    { k: 'recommend',  label: 'Recommend (AI consensus)' },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.72)',
        backdropFilter: 'blur(14px) saturate(150%)', WebkitBackdropFilter: 'blur(14px) saturate(150%)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
        zIndex: 100,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, background: T.ink100, borderLeft: `1px solid ${T.edgeHi}`,
          overflowY: 'auto', padding: '28px 32px',
          fontFamily: '"Inter Tight", system-ui, sans-serif', color: T.text,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>
            TradeRadar
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.3, color: T.text }}>Settings</div>
          <div
            onClick={onClose}
            style={{
              marginLeft: 'auto', width: 28, height: 28, borderRadius: 7,
              background: T.ink300, border: `1px solid ${T.edge}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.textMid, fontSize: 13,
            }}>✕</div>
        </div>

        {/* REFRESH */}
        <div style={{
          fontSize: 10, letterSpacing: 1.2, color: T.signal,
          textTransform: 'uppercase', fontWeight: 600, marginBottom: 10,
        }}>Auto-refresh frequency</div>
        <div style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.55, marginBottom: 14 }}>
          Per-screen poll interval. Set to Off to freeze data on that page.
        </div>
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24,
        }}>
          {refreshRows.map(r => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: T.text, flex: 1 }}>{r.label}</div>
              <div style={{ display: 'flex', gap: 3, padding: 2, background: T.ink000, borderRadius: 6, border: `1px solid ${T.edge}` }}>
                {refreshOptions.map(sec => {
                  const on = (s.refresh[r.k] || 0) === sec;
                  return (
                    <div key={sec}
                      onClick={() => updateRefresh(r.k, sec)}
                      style={{
                        padding: '3px 8px', fontFamily: T.mono, fontSize: 10, fontWeight: 500,
                        color: on ? T.ink000 : T.textMid,
                        background: on ? T.signal : 'transparent',
                        borderRadius: 4, cursor: on ? 'default' : 'pointer',
                      }}>{refreshLabel(sec)}</div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* DATA SOURCES */}
        <div style={{
          fontSize: 10, letterSpacing: 1.2, color: T.signal,
          textTransform: 'uppercase', fontWeight: 600, marginBottom: 10,
        }}>Data sources</div>
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12.5, color: T.text, flex: 1 }}>Tradier mode</div>
            {['sandbox', 'live'].map(v => {
              const on = (s.meta?.tradierMode || 'sandbox') === v;
              return (
                <div key={v}
                  onClick={() => save({ ...s, meta: { ...(s.meta || {}), tradierMode: v } })}
                  style={{
                    padding: '4px 10px', fontSize: 10.5, letterSpacing: 0.3,
                    fontFamily: T.mono, fontWeight: 600,
                    background: on ? T.signal : T.ink000,
                    color: on ? T.ink000 : T.textMid,
                    border: `1px solid ${on ? T.signal : T.edge}`, borderRadius: 5,
                    cursor: on ? 'default' : 'pointer',
                  }}>{v}</div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12.5, color: T.text, flex: 1 }}>Stock prices</div>
            {['yahoo', 'polygon', 'alpaca', 'finnhub'].map(v => {
              const on = s.sources.stocks === v;
              return (
                <div key={v}
                  onClick={() => updateSource('stocks', v)}
                  style={{
                    padding: '4px 10px', fontSize: 10.5, letterSpacing: 0.3,
                    fontFamily: T.mono, fontWeight: 600,
                    background: on ? T.signal : T.ink000,
                    color: on ? T.ink000 : T.textMid,
                    border: `1px solid ${on ? T.signal : T.edge}`, borderRadius: 5,
                    cursor: on ? 'default' : 'pointer',
                  }}>{v}</div>
              );
            })}
          </div>
        </div>

        {/* API KEYS */}
        <div style={{
          fontSize: 10, letterSpacing: 1.2, color: T.signal,
          textTransform: 'uppercase', fontWeight: 600, marginBottom: 10,
        }}>API keys</div>
        <div style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.55, marginBottom: 14 }}>
          Stored locally in this browser only. Never sent to any TradeRadar server.
        </div>
        <div style={{
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24,
        }}>
          {keyFields.map(f => {
            const res = testResults[f.k];
            return (
              <div key={f.k}>
                <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: T.text }}>{f.label}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 10, color: T.textDim }}>{f.hint}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    value={s.keys[f.k] || ''}
                    onChange={(e) => updateKey(f.k, e.target.value)}
                    placeholder={s.keys[f.k] ? '•••• saved' : 'Paste key to enable live data'}
                    style={{
                      flex: 1, padding: '8px 12px', fontFamily: T.mono, fontSize: 12,
                      background: T.ink000, border: `1px solid ${T.edge}`, color: T.text,
                      borderRadius: 6, outline: 'none',
                    }}
                  />
                  <div
                    onClick={() => s.keys[f.k] && !res?.testing && runTest(f.k)}
                    style={{
                      padding: '0 12px', display: 'flex', alignItems: 'center',
                      background: !s.keys[f.k] ? T.ink300
                        : res?.testing ? T.ink300
                        : res?.ok === true ? 'rgba(111,207,142,0.18)'
                        : res?.ok === false ? 'rgba(217,107,107,0.18)'
                        : T.ink200,
                      border: `1px solid ${!s.keys[f.k] ? T.edge
                        : res?.ok === true ? 'rgba(111,207,142,0.5)'
                        : res?.ok === false ? 'rgba(217,107,107,0.5)'
                        : T.edge}`,
                      borderRadius: 6, cursor: s.keys[f.k] ? 'pointer' : 'default',
                      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                      color: !s.keys[f.k] ? T.textDim
                        : res?.ok === true ? '#6FCF8E'
                        : res?.ok === false ? '#D96B6B'
                        : T.textMid,
                      fontFamily: T.mono,
                    }}>
                    {res?.testing ? '…' : res ? (res.ok ? `✓ ${res.ms}ms` : '✕') : 'Test'}
                  </div>
                </div>
                {res && !res.testing && res.detail && (
                  <div style={{
                    fontSize: 9.5, marginTop: 4,
                    color: res.ok ? '#6FCF8E' : '#D96B6B',
                    fontFamily: T.mono, letterSpacing: 0.3,
                  }}>{res.detail}</div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 10.5, color: T.textDim, letterSpacing: 0.3, lineHeight: 1.55 }}>
          Tradier sandbox (delayed data) is free. Polygon.io starts at $29/mo. Finnhub has a generous free tier
          for US stock prices. Alpaca paper-trading keys are free. CoinGecko works without a key but has lower limits.
        </div>
      </div>
    </div>
  );
}

window.TRSettingsSheet = TRSettingsSheet;

// Tiny gear button for the header — uses state local to caller.
function TRGearButton({ onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 7,
        background: '#10141B', border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'rgba(180,188,200,0.75)', fontSize: 14,
      }}
      title="Settings · refresh frequency · API keys"
    >⚙</div>
  );
}
window.TRGearButton = TRGearButton;
