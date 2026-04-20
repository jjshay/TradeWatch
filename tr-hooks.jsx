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
  keys: { coingecko: '', tradier: '', polygon: '', claude: '', alpaca: '', finnhub: '' },
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
function TRSettingsSheet({ open, onClose }) {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };
  const [s, save] = useTRSettings();

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
    { k: 'claude',    label: 'Anthropic API Key',  hint: 'AI narrative + recommendation ranking' },
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
          {keyFields.map(f => (
            <div key={f.k}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: T.text }}>{f.label}</div>
                <div style={{ marginLeft: 'auto', fontSize: 10, color: T.textDim }}>{f.hint}</div>
              </div>
              <input
                type="password"
                value={s.keys[f.k] || ''}
                onChange={(e) => updateKey(f.k, e.target.value)}
                placeholder={s.keys[f.k] ? '•••• saved' : 'Paste key to enable live data'}
                style={{
                  width: '100%', padding: '8px 12px', fontFamily: T.mono, fontSize: 12,
                  background: T.ink000, border: `1px solid ${T.edge}`, color: T.text,
                  borderRadius: 6, outline: 'none',
                }}
              />
            </div>
          ))}
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
