// tr-congress-panel.jsx — TradeRadar Congress-trading modal + tile.
//
// Documented alpha: Pelosi / Vance / Crenshaw / Tuberville regularly trade
// ahead of committee actions. This surfaces recent filings from
// Capitol Trades — pure OSINT, no key.
//
// Exposes:
//   window.TRCongressPanel  — React modal ({ open, onClose })
//   window.TRCongressTile   — compact summary tile ({ onOpen })
//   window.openTRCongress() — dispatches CustomEvent('tr:open-congress')
//
// Depends on:
//   window.CongressTrades    (engine/congress.js)
//   window.useAutoUpdate     (tr-hooks.jsx, defensive fallback below)

(function () {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };

  // --- formatting -----------------------------------------------------
  function fmtSize(n) {
    if (!isFinite(n) || n <= 0) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      if (!isFinite(dt.getTime())) return String(d).slice(0, 10);
      return dt.toISOString().slice(0, 10);
    } catch (_) { return String(d).slice(0, 10); }
  }

  function isNotable(name) {
    if (window.CongressTrades && typeof window.CongressTrades.isNotable === 'function') {
      return window.CongressTrades.isNotable(name);
    }
    return false;
  }

  // --- global trigger --------------------------------------------------
  window.openTRCongress = function openTRCongress() {
    try { window.dispatchEvent(new CustomEvent('tr:open-congress')); } catch (_) {}
  };

  // --- shared hook wrapper --------------------------------------------
  const useAuto = (window.useAutoUpdate || (() => ({ data: null, loading: false })));

  // ====================================================================
  // TRCongressTile — compact summary for the Signals lane
  // ====================================================================
  function TRCongressTile({ onOpen }) {
    const { data: rows } = useAuto(
      'congress-tile',
      async () => {
        if (!window.CongressTrades) return null;
        return window.CongressTrades.fetchRecent({ limit: 4 });
      },
      { refreshKey: 'signals' }
    );

    const list = Array.isArray(rows) ? rows.slice(0, 4) : [];

    return (
      <div
        onClick={() => onOpen && onOpen()}
        style={{
          background: T.ink100,
          border: `1px solid ${T.edge}`,
          borderRadius: 10,
          padding: '12px 14px',
          cursor: 'pointer',
          fontFamily: '"Inter Tight", system-ui, sans-serif',
          color: T.text,
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = T.edgeHi; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.edge; }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <div style={{
            fontSize: 9.5, letterSpacing: 1.0, color: T.signal,
            textTransform: 'uppercase', fontWeight: 700,
          }}>
            Congress
          </div>
          <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 }}>
            recent disclosures
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9.5, color: T.textDim }}>
            {list.length ? list.length + ' filings' : '—'}
          </div>
        </div>

        {!list.length && (
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim, padding: '8px 0' }}>
            Loading Capitol Trades…
          </div>
        )}

        {list.map((t, i) => {
          const buy = /buy/i.test(t.type);
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 70px 60px',
              alignItems: 'center', gap: 8,
              padding: '5px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${T.edge}`,
              fontFamily: T.mono, fontSize: 10.5,
            }}>
              <div style={{
                color: isNotable(t.politician) ? T.signal : T.text,
                fontWeight: isNotable(t.politician) ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {t.politician || '—'}
              </div>
              <div style={{ color: T.text, fontWeight: 600 }}>{t.ticker || '—'}</div>
              <div style={{
                color: buy ? T.bull : T.bear, fontWeight: 600, letterSpacing: 0.4,
              }}>
                {buy ? 'BUY' : /sell/i.test(t.type) ? 'SELL' : (t.type || '—').toUpperCase()}
              </div>
              <div style={{ color: T.textMid, textAlign: 'right' }}>{fmtSize(t.size)}</div>
            </div>
          );
        })}

        <div style={{
          marginTop: 8, fontFamily: T.mono, fontSize: 9.5,
          color: T.textDim, letterSpacing: 0.4,
        }}>
          Click to open · STOCK Act disclosures
        </div>
      </div>
    );
  }
  window.TRCongressTile = TRCongressTile;

  // ====================================================================
  // TRCongressPanel — full modal
  // ====================================================================
  function TRCongressPanel({ open, onClose }) {
    const [filter, setFilter] = React.useState('all'); // 'all'|'buys'|'sells'
    const [query, setQuery]   = React.useState('');
    const [refreshTick, setRefreshTick] = React.useState(0);

    const { data: rows, loading } = useAuto(
      `congress-panel-${filter}-${refreshTick}`,
      async () => {
        if (!window.CongressTrades) return null;
        return window.CongressTrades.fetchRecent({ limit: 100, filter });
      },
      { refreshKey: 'congress-panel' }
    );

    if (!open) return null;

    const list = Array.isArray(rows) ? rows : [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter(t =>
          (t.politician || '').toLowerCase().indexOf(q) !== -1 ||
          (t.ticker     || '').toLowerCase().indexOf(q) !== -1)
      : list;

    const countBuys  = list.filter(t => /buy/i.test(t.type)).length;
    const countSells = list.filter(t => /sell/i.test(t.type)).length;

    const Pill = ({ id, label, active, count, color }) => (
      <div
        onClick={() => setFilter(id)}
        style={{
          padding: '5px 12px',
          fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5,
          background: active ? (color || T.signal) : T.ink200,
          color: active ? T.ink000 : T.textMid,
          border: `1px solid ${active ? (color || T.signal) : T.edge}`,
          borderRadius: 5, cursor: 'pointer',
        }}
      >
        {label}
        {typeof count === 'number' && (
          <span style={{
            marginLeft: 6, opacity: 0.7, fontWeight: 500,
          }}>{count}</span>
        )}
      </div>
    );

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
        backdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 120, padding: 40,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 960, maxHeight: '92%', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          background: T.ink100, border: `1px solid ${T.edgeHi}`, borderRadius: 14,
          color: T.text,
          fontFamily: '"Inter Tight", system-ui, sans-serif',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}>

          {/* Header */}
          <div style={{
            padding: '18px 22px 12px 22px',
            borderBottom: `1px solid ${T.edge}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: 1.2, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 600,
            }}>
              Congress Trades
            </div>
            <div style={{
              padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
              letterSpacing: 0.6, color: T.signal,
              background: 'rgba(201,162,39,0.10)',
              borderRadius: 4, border: '0.5px solid rgba(201,162,39,0.4)',
            }}>
              STOCK ACT · CAPITOL TRADES
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 }}>
              {loading ? 'LOADING…' : (list.length + ' filings · 15m cache')}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <div onClick={() => setRefreshTick(x => x + 1)} style={{
                padding: '5px 12px', fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
                background: T.ink200, color: T.textMid,
                border: `1px solid ${T.edge}`, borderRadius: 5,
                cursor: 'pointer', letterSpacing: 0.4,
              }}>REFRESH</div>
              <div onClick={onClose} style={{
                width: 28, height: 28, borderRadius: 7,
                background: T.ink200, border: `1px solid ${T.edge}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: T.textMid, fontSize: 16,
              }}>×</div>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{
            padding: '12px 22px',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            borderBottom: `1px solid ${T.edge}`,
          }}>
            <Pill id="all"   label="ALL"   active={filter === 'all'}   count={list.length} />
            <Pill id="buys"  label="BUYS"  active={filter === 'buys'}  count={countBuys}  color={T.bull} />
            <Pill id="sells" label="SELLS" active={filter === 'sells'} count={countSells} color={T.bear} />
            <div style={{ flex: 1 }} />
            <input
              type="text"
              placeholder="Search politician / ticker…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                padding: '6px 10px', fontFamily: T.mono, fontSize: 11,
                background: T.ink000, border: `1px solid ${T.edge}`,
                color: T.text, borderRadius: 6, outline: 'none',
                width: 260,
              }}
            />
          </div>

          {/* Table header */}
          <div style={{
            padding: '10px 22px',
            display: 'grid',
            gridTemplateColumns: '1.6fr 0.7fr 0.7fr 1fr 0.9fr 0.9fr',
            gap: 10,
            fontFamily: T.mono, fontSize: 9, letterSpacing: 0.8,
            color: T.textDim, textTransform: 'uppercase', fontWeight: 600,
            borderBottom: `1px solid ${T.edge}`,
          }}>
            <div>POLITICIAN</div>
            <div>TICKER</div>
            <div>TYPE</div>
            <div>SIZE</div>
            <div>TX DATE</div>
            <div>DISCLOSED</div>
          </div>

          {/* Table body */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!filtered.length && (
              <div style={{
                padding: '40px 22px', textAlign: 'center',
                fontFamily: T.mono, fontSize: 11, color: T.textDim,
              }}>
                {loading ? 'Pulling Capitol Trades…'
                        : 'No trades matched. Try another filter or clear the search.'}
              </div>
            )}

            {filtered.map((t, i) => {
              const buy   = /buy/i.test(t.type);
              const sell  = /sell/i.test(t.type);
              const notable = isNotable(t.politician);
              return (
                <div
                  key={i}
                  onClick={() => { if (t.link) window.open(t.link, '_blank', 'noopener'); }}
                  style={{
                    padding: '9px 22px',
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 0.7fr 0.7fr 1fr 0.9fr 0.9fr',
                    gap: 10, alignItems: 'center',
                    fontFamily: T.mono, fontSize: 11,
                    borderBottom: `1px solid ${T.edge}`,
                    cursor: 'pointer',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,162,39,0.06)'; }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
                  }}
                >
                  <div style={{
                    color: notable ? T.signal : T.text,
                    fontWeight: notable ? 700 : 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {notable && <span style={{
                      fontSize: 8, letterSpacing: 0.8, padding: '1px 5px',
                      background: 'rgba(201,162,39,0.18)', color: T.signal,
                      border: '0.5px solid rgba(201,162,39,0.5)', borderRadius: 3,
                    }}>★</span>}
                    {t.politician || '—'}
                  </div>
                  <div style={{ color: T.text, fontWeight: 700, letterSpacing: 0.4 }}>
                    {t.ticker || '—'}
                  </div>
                  <div style={{
                    color: buy ? T.bull : sell ? T.bear : T.textMid,
                    fontWeight: 700, letterSpacing: 0.5,
                  }}>
                    {buy ? 'BUY' : sell ? 'SELL' : (t.type || '—').toUpperCase()}
                  </div>
                  <div style={{ color: T.text }}>
                    {t.size_str || fmtSize(t.size)}
                  </div>
                  <div style={{ color: T.textMid }}>{fmtDate(t.transactionDate)}</div>
                  <div style={{ color: T.textMid }}>{fmtDate(t.disclosureDate)}</div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 22px',
            borderTop: `1px solid ${T.edge}`,
            fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span>Source · capitoltrades.com (STOCK Act disclosures)</span>
            <span style={{ color: T.signal }}>★ = high-signal names</span>
            <span style={{ marginLeft: 'auto' }}>Click row → open Capitol Trades detail</span>
          </div>

        </div>
      </div>
    );
  }
  window.TRCongressPanel = TRCongressPanel;
})();
