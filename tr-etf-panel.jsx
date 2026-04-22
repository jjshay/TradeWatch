// tr-etf-panel.jsx — Spot BTC / ETH ETF flow dashboard (Farside data).
//
// Exposes:
//   window.TRETFPanel({ open, onClose })   — full modal
//   window.TRETFTile({ onOpen })           — compact Signals-lane tile
//                                             ("IBIT · 5D NET · +$1.2B")
//   window.openTRETF()                      — global trigger (fires
//                                             'tr:open-etf' CustomEvent so
//                                             the coordinator can mount)
//
// Depends on window.ETFFlows (engine/etf-flows.js). Degrades gracefully
// when ETFFlows is missing or returns null.

(function () {
  if (typeof window === 'undefined') return;

  // ---------- theme (mirrors tr-funding-panel.jsx) ----------
  var T = {
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

  // ---------- formatters ----------
  function fmtFlowMn(x) {
    if (x == null || !isFinite(x)) return '—';
    var sign = x > 0 ? '+' : x < 0 ? '-' : '';
    var abs = Math.abs(x);
    if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(2) + 'B';
    if (abs >= 10) return sign + '$' + abs.toFixed(0) + 'M';
    if (abs >= 1) return sign + '$' + abs.toFixed(1) + 'M';
    if (abs >= 0.01) return sign + '$' + (abs * 1000).toFixed(0) + 'K';
    return sign + '$0';
  }
  function fmtCell(x) {
    if (x == null || !isFinite(x) || x === 0) return '—';
    var sign = x > 0 ? '+' : '';
    if (Math.abs(x) >= 100) return sign + x.toFixed(0);
    return sign + x.toFixed(1);
  }
  function colorForFlow(x) {
    if (x == null || !isFinite(x) || x === 0) return T.textDim;
    return x > 0 ? T.bull : T.bear;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return months[parseInt(m[2], 10) - 1] + ' ' + String(parseInt(m[3], 10));
  }
  function fmtAge(ts) {
    if (!ts) return '—';
    var d = Date.now() - ts;
    if (d < 60_000) return Math.round(d / 1000) + 's ago';
    if (d < 3_600_000) return Math.round(d / 60_000) + 'm ago';
    if (d < 86_400_000) return Math.round(d / 3_600_000) + 'h ago';
    return Math.round(d / 86_400_000) + 'd ago';
  }

  // Pick the top-N issuer columns by absolute-sum across the given rows.
  function rankIssuers(rows, preferred, maxCols) {
    var tally = {};
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var by = rows[i].byIssuer || {};
      for (var k in by) {
        if (!Object.prototype.hasOwnProperty.call(by, k)) continue;
        seen[k] = true;
        tally[k] = (tally[k] || 0) + Math.abs(by[k] || 0);
      }
    }
    var all = Object.keys(seen);
    // Sort by preferred list first, then by activity.
    all.sort(function (a, b) {
      var ai = preferred.indexOf(a);
      var bi = preferred.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return (tally[b] || 0) - (tally[a] || 0);
    });
    return all.slice(0, maxCols || 10);
  }

  // Find the single biggest issuer (by |flow|) in a given day's row.
  function biggestIssuerOfRow(row) {
    if (!row || !row.byIssuer) return null;
    var best = null;
    var bestAbs = 0;
    for (var k in row.byIssuer) {
      if (!Object.prototype.hasOwnProperty.call(row.byIssuer, k)) continue;
      var v = row.byIssuer[k];
      if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); best = k; }
    }
    return best;
  }

  // ---------- bar chart ----------
  function FlowBars(props) {
    var rows = props.rows || [];
    var width = props.width || 820;
    var height = props.height || 110;
    if (!rows.length) {
      return React.createElement('div', {
        style: { width: width, height: height, fontFamily: T.mono, fontSize: 10,
                 color: T.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, 'no data');
    }
    // Oldest on the left, newest on the right.
    var series = rows.slice().reverse();
    var vals = series.map(function (r) { return r.total; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    var span = Math.max(Math.abs(max), Math.abs(min)) || 1;
    var mid = height / 2;
    var barArea = width;
    var step = barArea / series.length;
    var bw = Math.max(2, step - 2);

    var bars = [];
    for (var i = 0; i < series.length; i++) {
      var v = series[i].total;
      var h = (Math.abs(v) / span) * (mid - 6);
      var x = i * step;
      var y = v >= 0 ? (mid - h) : mid;
      var fill = v >= 0 ? T.bull : T.bear;
      bars.push(React.createElement('rect', {
        key: 'b' + i, x: x, y: y, width: bw, height: Math.max(1, h),
        fill: fill, opacity: 0.85,
      }));
    }
    // Midline
    bars.push(React.createElement('line', {
      key: 'mid',
      x1: 0, x2: width, y1: mid, y2: mid,
      stroke: T.edgeHi, strokeWidth: 0.5, strokeDasharray: '3,3',
    }));

    return React.createElement('svg', {
      width: width, height: height, viewBox: '0 0 ' + width + ' ' + height,
      style: { display: 'block' },
    }, bars);
  }

  // ---------- main panel ----------
  function TRETFPanel(props) {
    var open = props && props.open;
    var onClose = props && props.onClose;

    var hookState = React.useState('btc');         var coin = hookState[0];         var setCoin = hookState[1];
    var hookRows  = React.useState(null);           var rows = hookRows[0];           var setRows = hookRows[1];
    var hookSum   = React.useState(null);           var summary = hookSum[0];         var setSummary = hookSum[1];
    var hookLoad  = React.useState(false);          var loading = hookLoad[0];        var setLoading = hookLoad[1];
    var hookErr   = React.useState(null);           var err = hookErr[0];             var setErr = hookErr[1];
    var hookUpdat = React.useState(null);           var updatedAt = hookUpdat[0];     var setUpdatedAt = hookUpdat[1];

    var refresh = React.useCallback(async function (force) {
      if (!window.ETFFlows) { setErr('ETFFlows engine missing'); return; }
      setLoading(true); setErr(null);
      try {
        if (force) { try { window.ETFFlows.clearCache(); } catch (_) {} }
        var get = coin === 'btc' ? window.ETFFlows.getBTCFlows : window.ETFFlows.getETHFlows;
        var data = await get({ days: 30 });
        if (!data) {
          setErr('data source unreachable');
          setRows([]);
        } else {
          setRows(data);
        }
        var sum = await window.ETFFlows.getSummary();
        setSummary(sum);
        setUpdatedAt(Date.now());
      } catch (e) {
        setErr((e && e.message) ? e.message : 'fetch failed');
      } finally {
        setLoading(false);
      }
    }, [coin]);

    React.useEffect(function () {
      if (!open) return;
      refresh(false);
      var iv = setInterval(function () { refresh(false); }, 10 * 60 * 1000);
      return function () { clearInterval(iv); };
    }, [open, refresh]);

    if (!open) return null;

    var preferred = coin === 'btc'
      ? (window.ETFFlows && window.ETFFlows.BTC_ISSUERS) || []
      : (window.ETFFlows && window.ETFFlows.ETH_ISSUERS) || [];
    var issuerCols = rows && rows.length ? rankIssuers(rows, preferred, 8) : [];
    var sumForCoin = summary ? summary[coin] : null;

    // ---- layout ----
    var tabBtn = function (key, label) {
      var active = coin === key;
      return React.createElement('div', {
        onClick: function () { setCoin(key); },
        style: {
          padding: '6px 16px', fontFamily: T.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: 0.8, cursor: 'pointer', borderRadius: 6,
          color: active ? T.ink000 : T.textMid,
          background: active ? T.signal : T.ink200,
          border: '1px solid ' + T.edge,
        },
      }, label);
    };

    var summaryStrip = React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        padding: '12px 14px',
        background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
        marginBottom: 16,
      },
    },
      summaryCell('Today',       sumForCoin ? sumForCoin.today : null, true),
      summaryCell('Week-to-Date', sumForCoin ? sumForCoin.wtd   : null, true),
      summaryCell('Month-to-Date', sumForCoin ? sumForCoin.mtd  : null, true),
      streakCell(sumForCoin)
    );

    var lastUpdated = updatedAt ? fmtAge(updatedAt) : '—';

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
          width: 920, maxHeight: '94%', overflow: 'auto',
          background: T.ink100, border: '1px solid ' + T.edgeHi, borderRadius: 14,
          padding: '22px 26px', color: T.text,
          fontFamily: T.sans,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        },
      },
        // Header
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
        },
          React.createElement('div', {
            style: { fontSize: 10, letterSpacing: 1.2, color: T.textDim,
                     textTransform: 'uppercase', fontWeight: 600 },
          }, 'Spot ETF Flows · Farside'),
          React.createElement('div', {
            style: {
              padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
              letterSpacing: 0.6,
              color: loading ? T.signal : (err ? T.bear : T.bull),
              background: loading ? 'rgba(201,162,39,0.10)'
                        : err ? 'rgba(217,107,107,0.10)'
                        : 'rgba(111,207,142,0.10)',
              borderRadius: 4,
              border: '0.5px solid ' + (loading ? 'rgba(201,162,39,0.4)'
                                        : err ? 'rgba(217,107,107,0.4)'
                                        : 'rgba(111,207,142,0.4)'),
            },
          }, loading ? 'LOADING' : err ? 'OFFLINE' : 'LIVE'),
          React.createElement('div', {
            style: { fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 },
          }, 'UPDATED · ' + lastUpdated),

          React.createElement('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
            React.createElement('div', {
              onClick: function () { refresh(true); },
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
            }, '×')
          )
        ),

        // Coin toggle
        React.createElement('div', {
          style: { display: 'flex', gap: 8, marginBottom: 14 },
        },
          tabBtn('btc', 'BTC'),
          tabBtn('eth', 'ETH')
        ),

        // Error banner
        err ? React.createElement('div', {
          style: {
            padding: '9px 12px', marginBottom: 12,
            background: 'rgba(217,107,107,0.08)', border: '1px solid rgba(217,107,107,0.3)',
            borderRadius: 6, fontFamily: T.mono, fontSize: 10.5, color: T.bear, letterSpacing: 0.4,
          },
        }, 'DATA · ' + err + ' · retry later') : null,

        // Summary strip
        summaryStrip,

        // Bar chart
        React.createElement('div', {
          style: {
            padding: '14px 16px', marginBottom: 16,
            background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
          },
        },
          React.createElement('div', {
            style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                     textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 },
          }, 'Last 30 days · daily net flow ($M)'),
          React.createElement(FlowBars, { rows: (rows || []).slice(0, 30), width: 820, height: 110 })
        ),

        // Table
        renderTable(rows || [], issuerCols)
      )
    );
  }

  function summaryCell(label, val, showDollars) {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      React.createElement('div', {
        style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                 textTransform: 'uppercase', fontWeight: 600 },
      }, label),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 18, fontWeight: 600,
                 color: colorForFlow(val), letterSpacing: 0.3 },
      }, showDollars ? fmtFlowMn(val) : (val == null ? '—' : val))
    );
  }

  function streakCell(sum) {
    var label = 'Streak';
    var val = sum ? sum.streakDays : null;
    var txt;
    var col;
    if (val == null || val === 0) { txt = '—'; col = T.textDim; }
    else if (val > 0) { txt = val + 'd · IN';   col = T.bull; }
    else               { txt = Math.abs(val) + 'd · OUT'; col = T.bear; }
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      React.createElement('div', {
        style: { fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                 textTransform: 'uppercase', fontWeight: 600 },
      }, label),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 18, fontWeight: 600, color: col,
                 letterSpacing: 0.3 },
      }, txt)
    );
  }

  function renderTable(rows, issuerCols) {
    if (!rows.length) {
      return React.createElement('div', {
        style: {
          padding: '20px 12px', textAlign: 'center',
          background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
          fontFamily: T.mono, fontSize: 11, color: T.textDim,
        },
      }, 'No flow data available. Farside may be rate-limiting or offline.');
    }
    var cols = issuerCols || [];
    var headerRow = React.createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: '80px 80px ' + cols.map(function () { return '1fr'; }).join(' '),
        gap: 4, padding: '8px 10px',
        fontSize: 9, letterSpacing: 0.8, color: T.textDim,
        textTransform: 'uppercase', fontWeight: 700,
        borderBottom: '1px solid ' + T.edge,
      },
    },
      React.createElement('div', null, 'Date'),
      React.createElement('div', { style: { textAlign: 'right' } }, 'Total'),
      cols.map(function (c) {
        return React.createElement('div', { key: c, style: { textAlign: 'right' } }, c);
      })
    );

    var dataRows = rows.slice(0, 30).map(function (r, idx) {
      var biggest = biggestIssuerOfRow(r);
      return React.createElement('div', {
        key: r.date + '_' + idx,
        style: {
          display: 'grid',
          gridTemplateColumns: '80px 80px ' + cols.map(function () { return '1fr'; }).join(' '),
          gap: 4, padding: '7px 10px',
          fontFamily: T.mono, fontSize: 11,
          borderBottom: '0.5px solid ' + T.edge,
          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
        },
      },
        React.createElement('div', {
          style: { color: T.textMid, letterSpacing: 0.3 },
        }, fmtDate(r.date)),
        React.createElement('div', {
          style: { textAlign: 'right', color: colorForFlow(r.total), fontWeight: 600 },
        }, fmtCell(r.total)),
        cols.map(function (c) {
          var v = (r.byIssuer && r.byIssuer[c]) || 0;
          var isBiggest = c === biggest && Math.abs(v) > 0;
          return React.createElement('div', {
            key: c,
            style: {
              textAlign: 'right',
              color: colorForFlow(v),
              fontWeight: isBiggest ? 700 : 400,
              background: isBiggest ? 'rgba(201,162,39,0.08)' : 'transparent',
              borderRadius: 3, padding: isBiggest ? '0 4px' : 0,
            },
          }, fmtCell(v));
        })
      );
    });

    return React.createElement('div', {
      style: {
        background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
        overflow: 'hidden',
      },
    }, headerRow, dataRows);
  }

  // ---------- compact Signals tile ----------
  //   "IBIT · 5D NET · +$1.2B"
  function TRETFTile(props) {
    var onOpen = props && props.onOpen;

    var sState = React.useState('btc');   var coin = sState[0];   var setCoin = sState[1];
    var rState = React.useState(null);     var rows = rState[0];   var setRows = rState[1];
    var lState = React.useState(true);     var loading = lState[0]; var setLoading = lState[1];

    React.useEffect(function () {
      var alive = true;
      function load() {
        if (!window.ETFFlows) { if (alive) setLoading(false); return; }
        var get = coin === 'btc' ? window.ETFFlows.getBTCFlows : window.ETFFlows.getETHFlows;
        get({ days: 7 }).then(function (d) {
          if (!alive) return;
          setRows(d || []);
          setLoading(false);
        }).catch(function () { if (alive) setLoading(false); });
      }
      load();
      var iv = setInterval(load, 10 * 60 * 1000);
      return function () { alive = false; clearInterval(iv); };
    }, [coin]);

    // Largest issuer over last 5 biz days + 5-day cumulative flow.
    var tallies = {};
    if (rows && rows.length) {
      var slice = rows.slice(0, 5);
      for (var i = 0; i < slice.length; i++) {
        var by = slice[i].byIssuer || {};
        for (var k in by) {
          if (!Object.prototype.hasOwnProperty.call(by, k)) continue;
          tallies[k] = (tallies[k] || 0) + (by[k] || 0);
        }
      }
    }
    var topIssuer = null;
    var topAbs = 0;
    for (var kk in tallies) {
      if (!Object.prototype.hasOwnProperty.call(tallies, kk)) continue;
      if (Math.abs(tallies[kk]) > topAbs) { topAbs = Math.abs(tallies[kk]); topIssuer = kk; }
    }
    var topVal = topIssuer ? tallies[topIssuer] : null;

    var handleOpen = function () {
      if (typeof onOpen === 'function') onOpen();
      else if (typeof window.openTRETF === 'function') window.openTRETF();
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
          setCoin(coin === 'btc' ? 'eth' : 'btc');
        },
        style: {
          padding: '3px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 700,
          letterSpacing: 0.8, color: T.signal,
          background: 'rgba(201,162,39,0.10)',
          border: '0.5px solid rgba(201,162,39,0.3)', borderRadius: 4,
        },
      }, coin.toUpperCase()),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                 color: topIssuer ? T.text : T.textDim, letterSpacing: 0.8 },
      }, topIssuer || '—'),
      React.createElement('div', {
        style: { fontSize: 10, letterSpacing: 0.6, color: T.textDim,
                 textTransform: 'uppercase', fontWeight: 600 },
      }, '5D Net'),
      React.createElement('div', {
        style: { fontFamily: T.mono, fontSize: 13, fontWeight: 600,
                 color: colorForFlow(topVal), marginLeft: 'auto' },
      }, loading ? '…' : fmtFlowMn(topVal))
    );
  }

  // ---------- global trigger ----------
  window.openTRETF = function openTRETF() {
    try { window.dispatchEvent(new CustomEvent('tr:open-etf')); } catch (_) {}
  };

  window.TRETFPanel = TRETFPanel;
  window.TRETFTile  = TRETFTile;
})();
