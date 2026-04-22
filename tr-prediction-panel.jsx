// tr-prediction-panel.jsx — Live prediction-market panel (Kalshi + Polymarket).
//
// Exposes:
//   window.TRPredictionPanel({ open, onClose })   — full modal, category tabs + rows.
//   window.TRPredictionTile({ marketTitle, onOpen }) — compact tile for Signals.
//   window.openTRPrediction()                     — fires 'tr:open-prediction' CustomEvent
//                                                   (coordinator wires mount).
//
// Data source: window.PredictionMarkets (engine/prediction-markets.js).
// Live refresh: useAutoUpdate('predict-live', fetcher, { refreshKey: 'signals' })
// with a 60s manual fallback when the hook is not loaded yet.

(function () {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    gold: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    kalshi: '#7a5cff', polymarket: '#2b6cff',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };

  const CATEGORIES = ['All', 'Fed', 'Crypto', 'Politics', 'Geo', 'Macro'];

  // Fallback if PredictionMarkets script didn't load.
  async function safeFetchAll() {
    const pm = window.PredictionMarkets;
    if (!pm || typeof pm.fetchRelevant !== 'function') return [];
    try { return await pm.fetchRelevant(); } catch (_) { return []; }
  }

  function fmtPct(p) {
    if (p == null || !isFinite(p)) return '--';
    return Math.round(p * 100) + '%';
  }
  function fmtVol(v) {
    if (!isFinite(v) || v <= 0) return '--';
    if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function fmtClose(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const now = Date.now();
      const diff = d.getTime() - now;
      if (diff < 0) return 'closed';
      const days = Math.floor(diff / 86400000);
      if (days < 1) return Math.round(diff / 3600000) + 'h';
      if (days < 30) return days + 'd';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) { return ''; }
  }

  // ---------- shared live-fetch hook (compatible w/ or w/o useAutoUpdate) ----------
  function usePredictionMarkets() {
    const hook = window.useAutoUpdate;
    if (typeof hook === 'function') {
      const out = hook('predict-live', safeFetchAll, { refreshKey: 'signals' });
      return {
        data: out && out.data ? out.data : [],
        loading: !!(out && out.loading),
        lastFetch: (out && out.lastFetch) || null,
      };
    }
    // Fallback: manual 60s poll.
    const [data, setData] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [lastFetch, setLastFetch] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      async function tick() {
        setLoading(true);
        const d = await safeFetchAll();
        if (!alive) return;
        setData(d);
        setLoading(false);
        setLastFetch(Date.now());
      }
      tick();
      const id = setInterval(tick, 60_000);
      return () => { alive = false; clearInterval(id); };
    }, []);
    return { data, loading, lastFetch };
  }

  // ------------------------------ TILE ------------------------------
  function TRPredictionTile({ marketTitle, onOpen }) {
    const hint = (marketTitle || 'fed').toLowerCase();
    const { data, loading } = usePredictionMarkets();
    const market = React.useMemo(() => {
      if (!data || !data.length) return null;
      let hit = data.find(m => m.title.toLowerCase().includes(hint));
      if (hit) return hit;
      // token intersection fallback
      const tokens = hint.split(/\s+/).filter(Boolean);
      hit = data.find(m => tokens.every(tok => m.title.toLowerCase().includes(tok)));
      if (hit) return hit;
      // first Fed market if hint is fed-ish
      if (/fed|rate|fomc|cut|hike/.test(hint)) return data.find(m => m.category === 'Fed') || data[0];
      return data[0];
    }, [data, hint]);

    const pct = market ? Math.round(market.yesPrice * 100) : null;
    const handleClick = () => { if (typeof onOpen === 'function') onOpen(); else if (typeof window.openTRPrediction === 'function') window.openTRPrediction(); };

    return (
      <div onClick={handleClick} style={{
        cursor: 'pointer',
        background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
        padding: '10px 12px', minWidth: 200,
        fontFamily: '"Inter Tight", system-ui, sans-serif', color: T.text,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, fontWeight: 600, textTransform: 'uppercase' }}>
            Prediction
          </div>
          {market && (
            <div style={{
              fontSize: 8.5, letterSpacing: 0.5, fontWeight: 700,
              padding: '1px 6px', borderRadius: 3,
              color: market.source === 'Kalshi' ? T.kalshi : T.polymarket,
              background: (market.source === 'Kalshi' ? 'rgba(122,92,255,0.15)' : 'rgba(43,108,255,0.15)'),
            }}>
              {market.source.toUpperCase()}
            </div>
          )}
          <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9, color: T.textDim }}>
            {loading ? '…' : 'LIVE'}
          </div>
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: 26, fontWeight: 700,
          color: T.gold, letterSpacing: -0.5, lineHeight: 1,
        }}>
          {pct != null ? pct + '%' : '--'}
        </div>
        <div style={{
          marginTop: 6, fontSize: 11, color: T.textMid,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 240,
        }}>
          {market ? market.title : (marketTitle || 'Fed rate cut odds')}
        </div>
      </div>
    );
  }
  window.TRPredictionTile = TRPredictionTile;

  // ------------------------------ PANEL -----------------------------
  function TRPredictionPanel({ open, onClose }) {
    const [category, setCategory] = React.useState('All');
    const { data, loading, lastFetch } = usePredictionMarkets();

    if (!open) return null;

    const filtered = React.useMemo(() => {
      if (!data) return [];
      if (category === 'All') return data.slice(0, 80);
      return data.filter(m => m.category === category).slice(0, 80);
    }, [data, category]);

    const counts = React.useMemo(() => {
      const c = { All: (data || []).length };
      for (const cat of CATEGORIES) if (cat !== 'All') c[cat] = (data || []).filter(m => m.category === cat).length;
      return c;
    }, [data]);

    function fmtAgo(ts) {
      if (!ts) return '—';
      const d = Date.now() - ts;
      if (d < 60_000) return Math.round(d / 1000) + 's ago';
      if (d < 3_600_000) return Math.round(d / 60_000) + 'm ago';
      return Math.round(d / 3_600_000) + 'h ago';
    }

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
        backdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 120, padding: 40,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 860, maxHeight: '92%', overflow: 'auto',
          background: T.ink100, border: `1px solid ${T.edgeHi}`, borderRadius: 14,
          padding: '22px 26px', color: T.text,
          fontFamily: '"Inter Tight", system-ui, sans-serif',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>
              Prediction Markets
            </div>
            <div style={{
              padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6,
              color: loading ? T.gold : T.bull,
              background: loading ? 'rgba(201,162,39,0.10)' : 'rgba(111,207,142,0.10)',
              borderRadius: 4,
              border: `0.5px solid ${loading ? 'rgba(201,162,39,0.4)' : 'rgba(111,207,142,0.4)'}`,
            }}>
              {loading ? 'REFRESH' : 'LIVE'}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 }}>
              UPDATED · {fmtAgo(lastFetch)} · {(data || []).length} MARKETS
            </div>
            <div onClick={onClose} style={{
              marginLeft: 'auto', padding: '4px 10px', fontFamily: T.mono, fontSize: 10, fontWeight: 600,
              background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 5,
              cursor: 'pointer', color: T.textMid, letterSpacing: 0.4,
            }}>CLOSE</div>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => {
              const active = cat === category;
              const n = counts[cat] != null ? counts[cat] : 0;
              return (
                <div key={cat} onClick={() => setCategory(cat)} style={{
                  padding: '5px 12px', fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
                  background: active ? T.gold : T.ink200,
                  color: active ? T.ink000 : T.textMid,
                  border: `1px solid ${active ? T.gold : T.edge}`,
                  borderRadius: 5, cursor: 'pointer', letterSpacing: 0.4,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{cat.toUpperCase()}</span>
                  <span style={{ opacity: 0.6, fontSize: 9 }}>{n}</span>
                </div>
              );
            })}
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(!filtered || filtered.length === 0) && (
              <div style={{ color: T.textDim, fontSize: 12, padding: '24px 0', textAlign: 'center' }}>
                {loading ? 'Loading live markets…' : 'No markets found for this category.'}
              </div>
            )}
            {filtered.map((m) => {
              const pct = Math.round(m.yesPrice * 100);
              const src = m.source === 'Kalshi' ? T.kalshi : T.polymarket;
              return (
                <a key={(m.ticker || m.title) + '::' + m.source}
                   href={m.url || '#'} target="_blank" rel="noopener noreferrer"
                   style={{ textDecoration: 'none', color: T.text }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 80px 80px',
                    alignItems: 'center', gap: 12,
                    padding: '10px 12px',
                    background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 7,
                    fontFamily: T.mono, fontSize: 11,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{
                        fontSize: 9, letterSpacing: 0.6, fontWeight: 700,
                        padding: '2px 6px', borderRadius: 3,
                        color: src, background: m.source === 'Kalshi' ? 'rgba(122,92,255,0.14)' : 'rgba(43,108,255,0.14)',
                        border: `0.5px solid ${m.source === 'Kalshi' ? 'rgba(122,92,255,0.4)' : 'rgba(43,108,255,0.4)'}`,
                        flexShrink: 0,
                      }}>{m.source.toUpperCase()}</div>
                      <div style={{
                        fontFamily: '"Inter Tight", system-ui, sans-serif', fontSize: 12, color: T.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                      }}>{m.title}</div>
                    </div>
                    {/* YES probability bar */}
                    <div style={{
                      position: 'relative', height: 20, background: T.ink000,
                      border: `1px solid ${T.edge}`, borderRadius: 4, overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: pct + '%', background: T.gold, opacity: 0.75,
                      }} />
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: T.text,
                        letterSpacing: 0.4, textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}>{pct}%</div>
                    </div>
                    <div style={{ color: T.textMid, fontSize: 11, textAlign: 'right' }}>
                      {fmtVol(m.volume)}
                    </div>
                    <div style={{ color: T.textDim, fontSize: 10, textAlign: 'right' }}>
                      {m.category} · {fmtClose(m.closeDate)}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>

          <div style={{ marginTop: 16, fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3 }}>
            Cached 5 min · Kalshi api.elections.kalshi.com · Polymarket gamma-api.polymarket.com · click row to open source
          </div>
        </div>
      </div>
    );
  }
  window.TRPredictionPanel = TRPredictionPanel;

  // Global open trigger
  window.openTRPrediction = function openTRPrediction() {
    try { window.dispatchEvent(new CustomEvent('tr:open-prediction')); } catch (_) {}
  };
})();
