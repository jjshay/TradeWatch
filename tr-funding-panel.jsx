// tr-funding-panel.jsx — cross-exchange perpetual funding rates UI.
//
// Exposes:
//   window.TRFundingPanel({ open, onClose })   — full modal
//   window.TRFundingTile({ onOpen })           — compact Signals-lane tile
//   window.openTRFunding()                      — global trigger (fires
//                                                 'tr:open-funding' CustomEvent
//                                                 so the coordinator can mount)
//
// Depends on window.FundingRates (engine/funding.js).

(function () {
  if (typeof window === 'undefined') return;

  // ---------- theme (mirrors tr-alerts.jsx for consistency) ----------
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge:   'rgba(255,255,255,0.06)',
    edgeHi: 'rgba(255,255,255,0.10)',
    text:   '#ffffff',
    textMid:'rgba(180,188,200,0.75)',
    textDim:'rgba(130,138,150,0.55)',
    signal: '#c9a227',
    bull:   '#6FCF8E',
    bear:   '#D96B6B',
    mono:   '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    sans:   '"Inter Tight", system-ui, sans-serif',
  };

  const EXCHANGES = [
    { key: 'binance', label: 'Binance', },
    { key: 'bybit',   label: 'Bybit',   },
    { key: 'okx',     label: 'OKX',     },
    { key: 'dydx',    label: 'dYdX',    },
  ];

  // ---------- formatters ----------
  function fmtPct(x, digits) {
    if (x == null || !isFinite(x)) return '—';
    const d = digits == null ? 4 : digits;
    const s = (x >= 0 ? '+' : '') + x.toFixed(d) + '%';
    return s;
  }
  function fmtUsd(x) {
    if (x == null || !isFinite(x)) return '—';
    if (x >= 1000) return '$' + Math.round(x).toLocaleString();
    return '$' + x.toFixed(2);
  }
  function fmtCountdown(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    const diff = ms - Date.now();
    if (diff <= 0) return 'now';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function colorForRate(r) {
    if (r == null || !isFinite(r)) return T.textDim;
    if (r >  0.003) return T.bull;
    if (r < -0.003) return T.bear;
    return T.textMid;
  }
  function verdictColor(v) {
    if (v === 'CROWDED LONG')  return T.bull;
    if (v === 'CROWDED SHORT') return T.bear;
    if (v === 'BALANCED')       return T.signal;
    return T.textDim;
  }

  // ---------- sparkline ----------
  function Sparkline({ data, width, height }) {
    const w = width || 120;
    const h = height || 24;
    if (!data || !data.length) {
      return React.createElement('div', {
        style: { width: w, height: h, background: 'transparent',
                 fontFamily: T.mono, fontSize: 9, color: T.textDim,
                 display: 'flex', alignItems: 'center' },
      }, '—');
    }
    const vals = data.map(d => (d && isFinite(d.ratePct8h)) ? d.ratePct8h : 0);
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const range = (max - min) || 1;
    const step = vals.length > 1 ? w / (vals.length - 1) : 0;
    const pts = vals.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const last = vals[vals.length - 1];
    const stroke = colorForRate(last);
    // Zero baseline (if 0 is inside range)
    const zeroY = (0 >= min && 0 <= max) ? h - ((0 - min) / range) * (h - 2) - 1 : null;
    return React.createElement('svg', {
      width: w, height: h, viewBox: '0 0 ' + w + ' ' + h,
      style: { display: 'block' },
    },
      zeroY != null && React.createElement('line', {
        x1: 0, x2: w, y1: zeroY, y2: zeroY,
        stroke: T.edgeHi, strokeWidth: 0.5, strokeDasharray: '2,2',
      }),
      React.createElement('polyline', {
        points: pts, fill: 'none', stroke, strokeWidth: 1.2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      })
    );
  }

  // ---------- exchange card ----------
  function ExchangeCard({ ex, data, history }) {
    const rate = data && data.ratePct8h;
    const dir  = rate == null ? '·' : rate > 0 ? '↑' : rate < 0 ? '↓' : '·';
    const dirLabel = rate == null ? '' :
      rate > 0.0005 ? 'longs pay shorts' :
      rate < -0.0005 ? 'shorts pay longs' : 'flat';
    const rateColor = colorForRate(rate);

    return React.createElement('div', {
      style: {
        background: T.ink200, border: '1px solid ' + T.edge,
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150,
      },
    },
      // Header row: exchange name + direction arrow
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      },
        React.createElement('div', {
          style: { fontSize: 10, letterSpacing: 1.0, color: T.textMid,
                   textTransform: 'uppercase', fontWeight: 600 },
        }, ex.label),
        React.createElement('div', {
          style: { fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: rateColor },
        }, dir)
      ),
      // Rate
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 20, fontWeight: 600, color: rateColor,
                 letterSpacing: 0.3 },
      }, data ? fmtPct(rate, 4) : '—'),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 },
      }, data ? (data.intervalHours + 'h interval · ' + dirLabel) : 'unavailable'),
      // Sparkline
      React.createElement('div', {
        style: { paddingTop: 2 },
      },
        React.createElement(Sparkline, { data: history, width: 180, height: 26 })
      ),
      // Footer: mark price + next funding
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between',
                 fontFamily: T.mono, fontSize: 10, color: T.textMid, marginTop: 'auto' },
      },
        React.createElement('div', null, 'MARK · ',
          React.createElement('span', { style: { color: T.text } },
            data ? fmtUsd(data.markPrice) : '—')),
        React.createElement('div', null, 'NEXT · ',
          React.createElement('span', { style: { color: T.text } },
            data ? fmtCountdown(data.nextFundingTime) : '—'))
      )
    );
  }

  // ---------- main panel ----------
  function TRFundingPanel(props) {
    const open = props && props.open;
    const onClose = props && props.onClose;

    const [symbol, setSymbol] = React.useState('btc');
    const [all, setAll]         = React.useState(null);
    const [avg, setAvg]         = React.useState(null);
    const [hist, setHist]       = React.useState({});   // { [exchange]: rows }
    const [loading, setLoading] = React.useState(false);
    const [err, setErr]         = React.useState(null);

    const refresh = React.useCallback(async function () {
      if (!window.FundingRates) { setErr('FundingRates engine missing'); return; }
      setLoading(true); setErr(null);
      try {
        const [a, g] = await Promise.all([
          window.FundingRates.getAll(),
          window.FundingRates.getAverage(),
        ]);
        setAll(a); setAvg(g);
        // Fetch history per exchange in parallel for the active symbol.
        const entries = await Promise.all(EXCHANGES.map(async function (ex) {
          try {
            const rows = await window.FundingRates.getHistory(ex.key, symbol, 20);
            return [ex.key, rows];
          } catch (_) { return [ex.key, []]; }
        }));
        const map = {};
        entries.forEach(function (p) { map[p[0]] = p[1]; });
        setHist(map);
      } catch (e) {
        setErr(e && e.message ? e.message : 'fetch failed');
      } finally {
        setLoading(false);
      }
    }, [symbol]);

    React.useEffect(function () {
      if (!open) return;
      refresh();
      const iv = setInterval(refresh, 60_000);
      return function () { clearInterval(iv); };
    }, [open, refresh]);

    if (!open) return null;

    const perEx = all ? {
      binance: all.binance && all.binance[symbol],
      bybit:   all.bybit   && all.bybit[symbol],
      okx:     all.okx     && all.okx[symbol],
      dydx:    all.dydx    && all.dydx[symbol],
    } : {};
    const symAgg = avg ? avg[symbol] : null;

    const tabBtn = function (key, label) {
      const active = symbol === key;
      return React.createElement('div', {
        onClick: function () { setSymbol(key); },
        style: {
          padding: '6px 14px', fontFamily: T.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: 0.8, cursor: 'pointer', borderRadius: 6,
          color: active ? T.ink000 : T.textMid,
          background: active ? T.signal : T.ink200,
          border: '1px solid ' + T.edge,
        },
      }, label);
    };

    return React.createElement('div', {
      onClick: onClose,
      style: {
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
        backdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 120, padding: 40,
      },
    },
      React.createElement('div', {
        onClick: function (e) { e.stopPropagation(); },
        style: {
          width: 880, maxHeight: '92%', overflow: 'auto',
          background: T.ink100, border: '1px solid ' + T.edgeHi, borderRadius: 14,
          padding: '22px 26px', color: T.text,
          fontFamily: T.sans,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        },
      },
        // Header
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
        },
          React.createElement('div', {
            style: { fontSize: 10, letterSpacing: 1.2, color: T.textDim,
                     textTransform: 'uppercase', fontWeight: 600 },
          }, 'Perp Funding · Cross-Exchange'),
          React.createElement('div', {
            style: { padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5,
                     fontWeight: 600, letterSpacing: 0.6,
                     color: loading ? T.signal : T.bull,
                     background: loading ? 'rgba(201,162,39,0.10)' : 'rgba(111,207,142,0.10)',
                     borderRadius: 4,
                     border: '0.5px solid ' + (loading ? 'rgba(201,162,39,0.4)' : 'rgba(111,207,142,0.4)') },
          }, loading ? 'LOADING' : 'LIVE'),
          React.createElement('div', {
            style: { marginLeft: 'auto', display: 'flex', gap: 8 },
          },
            React.createElement('div', {
              onClick: refresh,
              style: {
                padding: '5px 12px', fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
                background: T.ink200, color: T.textMid,
                border: '1px solid ' + T.edge, borderRadius: 5,
                cursor: 'pointer', letterSpacing: 0.4,
              },
            }, 'REFRESH'),
            React.createElement('div', {
              onClick: onClose,
              style: {
                width: 28, height: 28, borderRadius: 7,
                background: T.ink200, border: '1px solid ' + T.edge,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: T.textMid, fontSize: 16,
              },
            }, '\u00d7')
          )
        ),

        // Symbol tabs
        React.createElement('div', {
          style: { display: 'flex', gap: 8, marginBottom: 16 },
        },
          tabBtn('btc', 'BTC'),
          tabBtn('eth', 'ETH')
        ),

        // Error banner
        err && React.createElement('div', {
          style: {
            padding: '10px 14px', background: 'rgba(217,107,107,0.08)',
            border: '1px solid rgba(217,107,107,0.3)', borderRadius: 8,
            color: T.bear, fontSize: 11, fontFamily: T.mono, marginBottom: 12,
          },
        }, 'Error: ' + err),

        // Cross-exchange summary row
        React.createElement('div', {
          style: {
            padding: '14px 18px', background: T.ink200,
            border: '1px solid ' + T.edgeHi, borderRadius: 10, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          },
        },
          React.createElement('div', null,
            React.createElement('div', {
              style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                       textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 },
            }, 'Cross-Exchange Avg'),
            React.createElement('div', {
              style: { fontFamily: T.mono, fontSize: 18, fontWeight: 600,
                       color: colorForRate(symAgg && symAgg.ratePct8h) },
            }, symAgg ? fmtPct(symAgg.ratePct8h, 4) : '—')
          ),
          React.createElement('div', null,
            React.createElement('div', {
              style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                       textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 },
            }, 'Spread (max-min)'),
            React.createElement('div', {
              style: { fontFamily: T.mono, fontSize: 14, color: T.text },
            }, symAgg && symAgg.spread != null ? symAgg.spread.toFixed(4) + '%' : '—')
          ),
          React.createElement('div', null,
            React.createElement('div', {
              style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                       textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 },
            }, 'Exchanges'),
            React.createElement('div', {
              style: { fontFamily: T.mono, fontSize: 14, color: T.text },
            }, symAgg ? (symAgg.exchanges + ' / ' + EXCHANGES.length) : '—')
          ),
          React.createElement('div', { style: { marginLeft: 'auto' } },
            React.createElement('div', {
              style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                       textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
                       textAlign: 'right' },
            }, 'Verdict'),
            React.createElement('div', {
              style: { fontFamily: T.mono, fontSize: 15, fontWeight: 700,
                       letterSpacing: 0.8, color: verdictColor(symAgg && symAgg.verdict) },
            }, symAgg ? symAgg.verdict : '—')
          )
        ),

        // Exchange grid
        React.createElement('div', {
          style: {
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
          },
        },
          EXCHANGES.map(function (ex) {
            return React.createElement(ExchangeCard, {
              key: ex.key, ex: ex, data: perEx[ex.key], history: hist[ex.key] || [],
            });
          })
        ),

        // Footnote
        React.createElement('div', {
          style: {
            marginTop: 14, fontFamily: T.mono, fontSize: 9.5,
            color: T.textDim, letterSpacing: 0.3, lineHeight: 1.5,
          },
        }, 'All rates normalised to 8h-equivalent %. dYdX funds hourly (1h rate × 8). Refreshes every 60s. ' +
           'Verdict: >0.010% = CROWDED LONG, <-0.005% = CROWDED SHORT.')
      )
    );
  }

  // ---------- compact signals-lane tile ----------
  function TRFundingTile(props) {
    const onOpen = props && props.onOpen;
    const [sym, setSym] = React.useState('btc');
    const [agg, setAgg] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(function () {
      let alive = true;
      function load() {
        if (!window.FundingRates) return;
        window.FundingRates.getAverage().then(function (d) {
          if (!alive) return;
          setAgg(d); setLoading(false);
        }).catch(function () { if (alive) setLoading(false); });
      }
      load();
      const iv = setInterval(load, 60_000);
      return function () { alive = false; clearInterval(iv); };
    }, []);

    const symAgg = agg ? agg[sym] : null;
    const handleOpen = function () {
      if (typeof onOpen === 'function') onOpen();
      else if (typeof window.openTRFunding === 'function') window.openTRFunding();
    };

    return React.createElement('div', {
      onClick: handleOpen,
      style: {
        cursor: 'pointer', padding: '10px 14px',
        background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 12, minHeight: 44,
        fontFamily: T.sans,
      },
    },
      React.createElement('div', {
        onClick: function (e) {
          e.stopPropagation();
          setSym(sym === 'btc' ? 'eth' : 'btc');
        },
        style: {
          padding: '3px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 700,
          letterSpacing: 0.8, color: T.signal,
          background: 'rgba(201,162,39,0.10)',
          border: '0.5px solid rgba(201,162,39,0.3)', borderRadius: 4,
        },
      }, sym.toUpperCase()),
      React.createElement('div', {
        style: { fontSize: 10, letterSpacing: 0.6, color: T.textDim,
                 textTransform: 'uppercase', fontWeight: 600 },
      }, 'Perp Funding · 8h'),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 13, fontWeight: 600,
                 color: colorForRate(symAgg && symAgg.ratePct8h), marginLeft: 'auto' },
      }, loading ? '…' : (symAgg ? fmtPct(symAgg.ratePct8h, 3) : '—')),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
                 color: verdictColor(symAgg && symAgg.verdict) },
      }, symAgg ? symAgg.verdict : '—')
    );
  }

  // ---------- global trigger ----------
  window.openTRFunding = function openTRFunding() {
    try { window.dispatchEvent(new CustomEvent('tr:open-funding')); } catch (_) {}
  };

  window.TRFundingPanel = TRFundingPanel;
  window.TRFundingTile  = TRFundingTile;
})();
