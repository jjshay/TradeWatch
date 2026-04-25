// tr-journal-panel.jsx — Trade journal + running P&L modal.
//
// Exposes:
//   window.TRJournalPanel({ open, onClose })   — React modal
//   window.openTRJournal()                     — dispatches 'tr:open-journal'
//
// Data source:  window.TRJournal (engine/journal.js)
// Optional:
//   window.TradierAPI   — "Import from Tradier" pulls positions + recent orders
//   window.LiveData.getQuote / window.TradierAPI.getQuote — pre-fill exit price at close
//
// Dark palette matches other tr-*-panel.jsx files.

(function () {
  var T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B', accent: '#60a5fa',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    ui: '"Inter Tight", system-ui, -apple-system, sans-serif',
  };

  window.openTRJournal = function openTRJournal() {
    try { window.dispatchEvent(new CustomEvent('tr:open-journal')); } catch (_) {}
  };

  // ---------- formatters ----------
  function fmtUsd(n, opts) {
    opts = opts || {};
    if (n == null || !isFinite(n)) return '—';
    var sign = n < 0 ? '-' : (opts.forceSign ? '+' : '');
    var abs = Math.abs(n);
    var s = abs >= 1000
      ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : abs.toFixed(2);
    return sign + '$' + s;
  }
  function fmtPct(n) {
    if (n == null || !isFinite(n)) return '—';
    var sign = n > 0 ? '+' : '';
    return sign + (n * 100).toFixed(1) + '%';
  }
  function fmtDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    if (!isFinite(dt.getTime())) return '—';
    var now = new Date();
    var diff = (now - dt) / 1000;
    if (diff < 60)      return Math.floor(diff) + 's ago';
    if (diff < 3600)    return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400)   return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return dt.toISOString().slice(0, 10);
  }
  function fmtShortDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    if (!isFinite(dt.getTime())) return '—';
    return dt.toISOString().slice(0, 10);
  }
  function duration(a, b) {
    if (!a || !b) return '—';
    var ms = new Date(b).getTime() - new Date(a).getTime();
    if (!isFinite(ms) || ms < 0) return '—';
    var days = ms / (1000 * 60 * 60 * 24);
    if (days < 1) return Math.max(1, Math.round(ms / (1000 * 60 * 60))) + 'h';
    if (days < 30) return Math.round(days) + 'd';
    return (days / 30).toFixed(1) + 'mo';
  }
  function pnlPct(e) {
    if (!e || e.entryPrice == null || e.exitPrice == null || !e.entryPrice) return null;
    if (e.side === 'long')   return (e.exitPrice - e.entryPrice) / e.entryPrice;
    if (e.side === 'short')  return (e.entryPrice - e.exitPrice) / e.entryPrice;
    if (e.side === 'option') return (e.exitPrice - e.entryPrice) / e.entryPrice;
    return null;
  }

  // ---------- LLM model calibration ----------
  var LLMS = [
    { id: 'claude', label: 'Claude',  color: '#D97757' },
    { id: 'gpt',    label: 'GPT',     color: '#10A37F' },
    { id: 'gemini', label: 'Gemini',  color: '#4285F4' },
    { id: 'grok',   label: 'Grok',    color: '#E5E7EB' },
  ];

  // Read per-LLM predictions snapshot (if available) to capture conviction the
  // day a trade was opened. Shape (flexible):
  //   { claude: { direction: 'bull'|'bear'|'neutral', conviction: 'HIGH'|'MED'|'LOW' }, ... }
  function readLastPredictions() {
    try {
      var raw = localStorage.getItem('tr_last_predictions');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  // Turn a conviction string or number into a 0..1 probability.
  function convictionToProb(c) {
    if (c == null) return 0.5;
    if (typeof c === 'number' && isFinite(c)) {
      if (c > 1) return Math.min(1, c / 100);
      return Math.max(0, Math.min(1, c));
    }
    var s = String(c).toLowerCase();
    if (s.indexOf('high') >= 0) return 0.8;
    if (s.indexOf('med')  >= 0) return 0.6;
    if (s.indexOf('low')  >= 0) return 0.4;
    return 0.5;
  }

  // Per-LLM stats built from closed, attributed journal entries.
  function computeModelStats(entries) {
    var out = {};
    LLMS.forEach(function (m) {
      out[m.id] = {
        id: m.id, label: m.label, color: m.color,
        total: 0, wins: 0, losses: 0,
        winPcts: [], lossPcts: [],
        brierNum: 0, brierDen: 0,
      };
    });
    (entries || []).forEach(function (e) {
      if (!e || e.status !== 'closed') return;
      var attr = Array.isArray(e.attributedModels) ? e.attributedModels : [];
      if (!attr.length) return;
      var pct = pnlPct(e);
      if (pct == null) return;
      var win = pct > 0;
      attr.forEach(function (mid) {
        var slot = out[mid];
        if (!slot) return;
        slot.total++;
        if (win) { slot.wins++; slot.winPcts.push(pct); }
        else     { slot.losses++; slot.lossPcts.push(pct); }
        // Brier: use snapshot conviction if present on the entry, else 0.5
        var snap = e.modelSnapshot && e.modelSnapshot[mid];
        var p = convictionToProb(snap && (snap.conviction || snap.prob));
        var outcome = win ? 1 : 0;
        slot.brierNum += (p - outcome) * (p - outcome);
        slot.brierDen += 1;
      });
    });
    function avg(a) {
      if (!a.length) return null;
      var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
      return s / a.length;
    }
    Object.keys(out).forEach(function (k) {
      var r = out[k];
      r.accuracy  = r.total ? r.wins / r.total : null;
      r.avgWin    = avg(r.winPcts);
      r.avgLoss   = avg(r.lossPcts);
      r.brier     = r.brierDen ? (r.brierNum / r.brierDen) : null;
      r.trust = (r.total >= 10 && r.accuracy > 0.60) ? 'TRUSTED'
              : (r.total >= 3  && r.accuracy != null && r.accuracy < 0.45) ? 'WEAK'
              : 'NEUTRAL';
    });
    return out;
  }

  // Expose getModelWeights() for tr-trade-of-day and other consumers.
  function installModelWeights() {
    if (!window.TRJournal) return;
    if (window.TRJournal.getModelWeights) return; // already installed
    window.TRJournal.getModelWeights = function () {
      var entries = [];
      try { entries = window.TRJournal.getEntries() || []; } catch (_) {}
      var stats = computeModelStats(entries);
      var w = {};
      LLMS.forEach(function (m) {
        var r = stats[m.id];
        w[m.id] = (r && r.accuracy != null && r.total >= 3) ? r.accuracy : 0.5;
      });
      return w;
    };
  }

  // ---------- stat card ----------
  function StatCard(props) {
    var color = props.color || T.text;
    return (
      <div style={{
        flex: '1 1 120px', minWidth: 120,
        padding: '12px 14px', background: T.ink200,
        border: '1px solid ' + T.edge, borderRadius: 8,
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.8,
          color: T.textDim, textTransform: 'uppercase', marginBottom: 6,
        }}>{props.label}</div>
        <div style={{
          fontSize: 20, fontWeight: 600, color: color,
          fontFamily: T.mono, letterSpacing: -0.5,
        }}>{props.value}</div>
        {props.sub && (
          <div style={{ fontSize: 10.5, color: T.textMid, marginTop: 4 }}>
            {props.sub}
          </div>
        )}
      </div>
    );
  }

  // ---------- equity curve SVG ----------
  function EquityCurve(props) {
    var curve = props.curve || [];
    var W = 760, H = 140, padX = 44, padY = 16;
    if (curve.length < 2) {
      return (
        <div style={{
          height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.textDim, fontSize: 11, fontFamily: T.mono, letterSpacing: 0.4,
          background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
        }}>NO CLOSED TRADES YET — CLOSE A TRADE TO BUILD YOUR EQUITY CURVE</div>
      );
    }
    var ys = curve.map(function (p) { return p.cumulativePnl; });
    var yMin = Math.min.apply(null, ys);
    var yMax = Math.max.apply(null, ys);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    var xs = curve.map(function (p) { return new Date(p.date).getTime(); });
    var xMin = xs[0], xMax = xs[xs.length - 1];
    if (xMin === xMax) xMax = xMin + 1;
    function toX(x) { return padX + (x - xMin) / (xMax - xMin) * (W - padX * 2); }
    function toY(y) { return H - padY - (y - yMin) / (yMax - yMin) * (H - padY * 2); }
    var points = curve.map(function (p) {
      return toX(new Date(p.date).getTime()) + ',' + toY(p.cumulativePnl);
    }).join(' ');
    var zeroY = yMin <= 0 && yMax >= 0 ? toY(0) : null;
    var lastPnl = ys[ys.length - 1];
    var stroke = lastPnl >= 0 ? T.bull : T.bear;
    var fill = lastPnl >= 0 ? 'rgba(111,207,142,0.12)' : 'rgba(217,107,107,0.12)';
    // Area path
    var area = 'M ' + toX(xs[0]) + ' ' + (zeroY != null ? zeroY : H - padY) + ' L '
      + points.replace(/ /g, ' L ') + ' L ' + toX(xs[xs.length - 1]) + ' '
      + (zeroY != null ? zeroY : H - padY) + ' Z';
    return (
      <div style={{
        background: T.ink200, border: '1px solid ' + T.edge, borderRadius: 8,
        padding: '10px 12px',
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.8,
          color: T.textDim, textTransform: 'uppercase', marginBottom: 4,
        }}>EQUITY CURVE · {curve.length - 1} closed trades</div>
        <svg width="100%" viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block' }}>
          {zeroY != null && (
            <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY}
              stroke={T.edgeHi} strokeDasharray="3,4" />
          )}
          <path d={area} fill={fill} stroke="none" />
          <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.75}
            strokeLinejoin="round" strokeLinecap="round" />
          <text x={padX - 6} y={toY(yMax) + 4} fill={T.textDim}
            fontSize="9" fontFamily={T.mono} textAnchor="end">
            {fmtUsd(yMax)}
          </text>
          <text x={padX - 6} y={toY(yMin) + 4} fill={T.textDim}
            fontSize="9" fontFamily={T.mono} textAnchor="end">
            {fmtUsd(yMin)}
          </text>
          {zeroY != null && (
            <text x={padX - 6} y={zeroY + 4} fill={T.textDim}
              fontSize="9" fontFamily={T.mono} textAnchor="end">$0</text>
          )}
        </svg>
      </div>
    );
  }

  // ---------- trade form ----------
  function TradeForm(props) {
    var editing = props.editing || null;
    var initial = editing || {};
    var init = function (k, d) { return initial[k] != null ? initial[k] : d; };
    var initialTags = Array.isArray(initial.tags) ? initial.tags.join(', ') : '';
    var initialDate = initial.entryDate
      ? String(initial.entryDate).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    var initialAttr = Array.isArray(initial.attributedModels)
      ? initial.attributedModels.slice() : [];
    var st = React.useState({
      symbol: init('symbol', ''),
      side: init('side', 'long'),
      qty: init('qty', ''),
      entryPrice: init('entryPrice', ''),
      entryDate: initialDate,
      exitPrice: init('exitPrice', ''),
      exitDate: initial.exitDate ? String(initial.exitDate).slice(0, 10) : '',
      tags: initialTags,
      thesis: init('thesis', ''),
      notes: init('notes', ''),
      attributedModels: initialAttr,
    });
    var form = st[0], setForm = st[1];
    function toggleModel(mid) {
      setForm(function (f) {
        var cur = Array.isArray(f.attributedModels) ? f.attributedModels.slice() : [];
        var i = cur.indexOf(mid);
        if (i >= 0) cur.splice(i, 1); else cur.push(mid);
        return Object.assign({}, f, { attributedModels: cur });
      });
    }
    function onChange(k) {
      return function (e) {
        var v = e && e.target ? e.target.value : e;
        setForm(function (f) { var n = {}; n[k] = v; return Object.assign({}, f, n); });
      };
    }

    function submit() {
      if (!form.symbol || !form.qty || form.entryPrice === '') {
        alert('Symbol, qty, and entry price are required.');
        return;
      }
      var attributed = (form.attributedModels || []).filter(function (m) {
        return ['claude','gpt','gemini','grok'].indexOf(m) >= 0;
      });
      // Snapshot per-model conviction at log time (if available) for Brier scoring later.
      var snap = null;
      if (attributed.length) {
        var preds = readLastPredictions();
        if (preds && typeof preds === 'object') {
          snap = {};
          attributed.forEach(function (mid) {
            if (preds[mid]) snap[mid] = preds[mid];
          });
        }
        // Preserve any prior snapshot already on the entry when editing.
        if (editing && editing.modelSnapshot) {
          snap = Object.assign({}, editing.modelSnapshot, snap || {});
        }
      } else if (editing && editing.modelSnapshot) {
        snap = editing.modelSnapshot;
      }
      var payload = {
        symbol: form.symbol.trim().toUpperCase(),
        side: form.side,
        qty: Number(form.qty),
        entryPrice: Number(form.entryPrice),
        entryDate: form.entryDate ? new Date(form.entryDate).toISOString() : new Date().toISOString(),
        exitPrice: form.exitPrice === '' ? null : Number(form.exitPrice),
        exitDate: form.exitDate ? new Date(form.exitDate).toISOString() : null,
        tags: form.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
        thesis: form.thesis,
        notes: form.notes,
        source: editing && editing.source ? editing.source : 'manual',
        attributedModels: attributed,
        modelSnapshot: snap,
      };
      if (editing && editing.id) {
        window.TRJournal.updateEntry(editing.id, payload);
      } else {
        window.TRJournal.addEntry(payload);
      }
      props.onDone && props.onDone();
    }

    var inputStyle = {
      width: '100%', padding: '8px 10px', background: T.ink100,
      border: '1px solid ' + T.edge, borderRadius: 5, color: T.text,
      fontFamily: T.mono, fontSize: 12, outline: 'none',
    };
    var labelStyle = {
      fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.8,
      color: T.textDim, textTransform: 'uppercase', marginBottom: 4,
    };

    return (
      <div style={{
        padding: 16, background: T.ink300, border: '1px solid ' + T.edgeHi,
        borderRadius: 8, margin: '12px 0',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
        }}>
          <div>
            <div style={labelStyle}>Symbol</div>
            <input style={inputStyle} value={form.symbol}
              onChange={onChange('symbol')} placeholder="AAPL" />
          </div>
          <div>
            <div style={labelStyle}>Side</div>
            <select style={inputStyle} value={form.side} onChange={onChange('side')}>
              <option value="long">Long</option>
              <option value="short">Short</option>
              <option value="option">Option</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>Qty {form.side === 'option' ? '(contracts)' : '(shares)'}</div>
            <input type="number" style={inputStyle} value={form.qty}
              onChange={onChange('qty')} placeholder="100" />
          </div>
          <div>
            <div style={labelStyle}>Entry Price</div>
            <input type="number" step="0.01" style={inputStyle} value={form.entryPrice}
              onChange={onChange('entryPrice')} placeholder="185.50" />
          </div>
          <div>
            <div style={labelStyle}>Entry Date</div>
            <input type="date" style={inputStyle} value={form.entryDate}
              onChange={onChange('entryDate')} />
          </div>
          <div>
            <div style={labelStyle}>Exit Price (opt)</div>
            <input type="number" step="0.01" style={inputStyle} value={form.exitPrice}
              onChange={onChange('exitPrice')} placeholder="—" />
          </div>
          <div>
            <div style={labelStyle}>Exit Date (opt)</div>
            <input type="date" style={inputStyle} value={form.exitDate}
              onChange={onChange('exitDate')} />
          </div>
          <div>
            <div style={labelStyle}>Tags (comma-sep)</div>
            <input style={inputStyle} value={form.tags} onChange={onChange('tags')}
              placeholder="earnings, tech" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>Thesis</div>
          <input style={inputStyle} value={form.thesis} onChange={onChange('thesis')}
            placeholder="Why am I in this trade?" />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>Notes</div>
          <textarea style={Object.assign({}, inputStyle, { minHeight: 60, fontFamily: T.ui })}
            value={form.notes} onChange={onChange('notes')}
            placeholder="Setup, adjustments, post-mortem..." />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>Inspired By (leave blank for own thesis)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LLMS.map(function (m) {
              var on = (form.attributedModels || []).indexOf(m.id) >= 0;
              return (
                <label key={m.id} onClick={function (e) { e.preventDefault(); toggleModel(m.id); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', cursor: 'pointer',
                    background: on ? T.ink100 : T.ink200,
                    border: '1px solid ' + (on ? m.color : T.edge),
                    borderRadius: 5, fontFamily: T.mono, fontSize: 11,
                    color: on ? T.text : T.textMid, letterSpacing: 0.4,
                    userSelect: 'none',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: m.color, display: 'inline-block',
                  }} />
                  <input type="checkbox" readOnly checked={on}
                    style={{ accentColor: m.color, margin: 0 }} />
                  {m.label}
                </label>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={props.onCancel} style={{
            padding: '7px 14px', background: 'transparent', color: T.textMid,
            border: '1px solid ' + T.edge, borderRadius: 5, cursor: 'pointer',
            fontFamily: T.mono, fontSize: 11, letterSpacing: 0.4,
          }}>CANCEL</button>
          <button onClick={submit} style={{
            padding: '7px 14px', background: T.signal, color: T.ink000,
            border: '1px solid ' + T.signal, borderRadius: 5, cursor: 'pointer',
            fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
          }}>{editing ? 'SAVE' : 'LOG TRADE'}</button>
        </div>
      </div>
    );
  }

  // ---------- trade row ----------
  function TradeRow(props) {
    var e = props.entry;
    var pct = pnlPct(e);
    var pnlColor = (e.pnl || 0) > 0 ? T.bull : ((e.pnl || 0) < 0 ? T.bear : T.textMid);
    var cell = {
      padding: '10px 8px', fontSize: 11.5, color: T.text, fontFamily: T.mono,
      borderBottom: '1px solid ' + T.edge, verticalAlign: 'top',
    };
    var cellMid = Object.assign({}, cell, { color: T.textMid });
    var sideColor = e.side === 'long' ? T.bull : e.side === 'short' ? T.bear : T.accent;

    return (
      <tr>
        <td style={cellMid}>{fmtShortDate(e.entryDate)}</td>
        <td style={Object.assign({}, cell, { color: T.signal, fontWeight: 600 })}>
          {e.symbol}
        </td>
        <td style={cell}>
          <span style={{
            padding: '1px 6px', fontSize: 9.5, letterSpacing: 0.6,
            color: sideColor, border: '1px solid ' + sideColor, borderRadius: 3,
            textTransform: 'uppercase', fontWeight: 600,
          }}>{e.side}</span>
        </td>
        <td style={cell}>{e.qty}</td>
        <td style={cell}>{e.entryPrice != null ? e.entryPrice.toFixed(2) : '—'}</td>
        <td style={cell}>{e.exitPrice != null ? e.exitPrice.toFixed(2) : '—'}</td>
        <td style={Object.assign({}, cell, { color: pnlColor })}>
          {pct != null ? fmtPct(pct) : '—'}
        </td>
        <td style={Object.assign({}, cell, { color: pnlColor, fontWeight: 600 })}>
          {e.pnl != null ? fmtUsd(e.pnl, { forceSign: true }) : '—'}
        </td>
        <td style={cellMid}>
          {e.status === 'closed' ? duration(e.entryDate, e.exitDate) : fmtDate(e.entryDate)}
        </td>
        <td style={Object.assign({}, cellMid, { fontFamily: T.ui, fontSize: 10.5 })}>
          {(e.tags || []).map(function (t, i) {
            return (
              <span key={i} style={{
                display: 'inline-block', padding: '1px 6px', marginRight: 4,
                fontSize: 9.5, color: T.textMid, background: T.ink300,
                border: '1px solid ' + T.edge, borderRadius: 3,
              }}>{t}</span>
            );
          })}
        </td>
        <td style={Object.assign({}, cellMid, { fontFamily: T.ui, fontSize: 10.5, maxWidth: 200 })}>
          <div style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{e.notes || e.thesis || ''}</div>
        </td>
        <td style={cell}>
          <div style={{ display: 'flex', gap: 4 }}>
            {e.status === 'open' && (
              <button onClick={function () { props.onClose(e); }} style={{
                padding: '3px 8px', background: T.ink200, color: T.signal,
                border: '1px solid ' + T.edge, borderRadius: 4, cursor: 'pointer',
                fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.4,
              }}>CLOSE</button>
            )}
            <button onClick={function () { props.onEdit(e); }} style={{
              padding: '3px 8px', background: T.ink200, color: T.textMid,
              border: '1px solid ' + T.edge, borderRadius: 4, cursor: 'pointer',
              fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.4,
            }}>EDIT</button>
            <button onClick={function () { props.onDelete(e); }} style={{
              padding: '3px 8px', background: T.ink200, color: T.bear,
              border: '1px solid ' + T.edge, borderRadius: 4, cursor: 'pointer',
              fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.4,
            }}>DEL</button>
          </div>
        </td>
      </tr>
    );
  }

  // ---------- Tradier import helper ----------
  async function importFromTradier() {
    if (!window.TradierAPI) {
      alert('TradierAPI not available. Set a Tradier key in Settings.');
      return { added: 0 };
    }
    try {
      var positions = await window.TradierAPI.getPositions();
      if (!positions || !positions.length) {
        alert('No open Tradier positions found.');
        return { added: 0 };
      }
      var existing = (window.TRJournal.getEntries() || []).filter(function (e) {
        return e.source === 'tradier';
      });
      var seen = {};
      existing.forEach(function (e) { seen[e.symbol + '|' + e.qty] = true; });

      var added = 0;
      positions.forEach(function (p) {
        var qty = Number(p.quantity) || 0;
        var cb = Number(p.cost_basis) || 0;
        if (!qty || !cb) return;
        var entryPrice = cb / qty;
        var sideGuess = qty < 0 ? 'short' : 'long';
        var absQty = Math.abs(qty);
        var key = p.symbol + '|' + absQty;
        if (seen[key]) return;
        // Rough option detection: OCC symbols are longer w/ digits
        var isOption = /^[A-Z]+\d{6}[CP]\d+$/.test(p.symbol || '');
        window.TRJournal.addEntry({
          symbol: p.symbol,
          side: isOption ? 'option' : sideGuess,
          qty: absQty,
          entryPrice: Math.round(entryPrice * 100) / 100,
          entryDate: p.date_acquired || new Date().toISOString(),
          tags: ['tradier'],
          source: 'tradier',
          notes: 'Imported from Tradier (cost_basis ' + cb + ')',
        });
        added++;
      });
      alert('Imported ' + added + ' Tradier position(s). Existing entries skipped.');
      return { added: added };
    } catch (e) {
      alert('Tradier import failed: ' + (e && e.message));
      return { added: 0 };
    }
  }

  // ---------- model calibration dashboard ----------
  function ModelCalibration(props) {
    var entries = props.entries || [];
    var stats = computeModelStats(entries);
    // Find best (highest accuracy with at least 3 trades)
    var bestId = null, bestAcc = -1;
    LLMS.forEach(function (m) {
      var r = stats[m.id];
      if (r.total >= 3 && r.accuracy != null && r.accuracy > bestAcc) {
        bestAcc = r.accuracy; bestId = m.id;
      }
    });
    var anyAttributed = LLMS.some(function (m) { return stats[m.id].total > 0; });

    var headerLabel = (
      <div style={{
        fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.8,
        color: T.signal, textTransform: 'uppercase',
        marginBottom: 8, fontWeight: 700,
      }}>MODEL CALIBRATION · LLM accuracy on YOUR closed trades</div>
    );

    if (!anyAttributed) {
      return (
        <div style={{ marginBottom: 16 }}>
          {headerLabel}
          <div style={{
            padding: '14px 16px', background: T.ink200,
            border: '1px solid ' + T.edge, borderRadius: 8,
            color: T.textDim, fontSize: 11.5, fontFamily: T.mono,
            letterSpacing: 0.4, textAlign: 'center',
          }}>NO ATTRIBUTED CLOSED TRADES YET — TAG TRADES "INSPIRED BY" TO BUILD MODEL CALIBRATION</div>
        </div>
      );
    }

    function trustColor(t) {
      if (t === 'TRUSTED') return T.bull;
      if (t === 'WEAK')    return T.bear;
      return T.textMid;
    }

    var bestLabel = bestId ? LLMS.filter(function (m) { return m.id === bestId; })[0].label : null;

    return (
      <div style={{ marginBottom: 16 }}>
        {headerLabel}
        {bestId && (
          <div style={{
            padding: '8px 12px', marginBottom: 10,
            background: 'rgba(201,162,39,0.08)',
            border: '1px solid ' + T.signal, borderRadius: 6,
            fontFamily: T.mono, fontSize: 11, color: T.signal, letterSpacing: 0.4,
          }}>MOST RELIABLE ON YOUR SETUPS · {bestLabel.toUpperCase()} · {(bestAcc * 100).toFixed(0)}% accuracy</div>
        )}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
        }}>
          {LLMS.map(function (m) {
            var r = stats[m.id];
            var isBest = m.id === bestId;
            var hasData = r.total > 0;
            var accStr = r.accuracy != null
              ? (r.accuracy * 100).toFixed(0) + '%'
              : '—';
            var brierStr = r.brier != null ? r.brier.toFixed(2) : '—';
            return (
              <div key={m.id} style={{
                padding: '12px 14px', background: T.ink200,
                border: '1px solid ' + (isBest ? T.signal : T.edge),
                borderRadius: 8, position: 'relative',
                boxShadow: isBest ? '0 0 0 1px ' + T.signal + ' inset' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: m.color, display: 'inline-block',
                  }} />
                  <span style={{
                    fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                    color: T.text, letterSpacing: 0.6, textTransform: 'uppercase',
                  }}>{m.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{
                    padding: '1px 6px', fontSize: 8.5, letterSpacing: 0.6,
                    color: trustColor(r.trust),
                    border: '1px solid ' + trustColor(r.trust),
                    borderRadius: 3, fontFamily: T.mono, fontWeight: 600,
                  }}>{r.trust}</span>
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 600,
                  color: hasData
                    ? (r.accuracy >= 0.6 ? T.bull : r.accuracy < 0.45 ? T.bear : T.text)
                    : T.textDim,
                  fontFamily: T.mono, letterSpacing: -0.5,
                }}>{accStr}</div>
                <div style={{
                  fontSize: 10, color: T.textMid, marginTop: 4, fontFamily: T.mono,
                }}>{r.wins}W / {r.losses}L · {r.total} trades</div>
                <div style={{
                  fontSize: 9.5, color: T.textDim, marginTop: 6, fontFamily: T.mono,
                  display: 'flex', justifyContent: 'space-between', gap: 6,
                }}>
                  <span>avg W {r.avgWin != null ? fmtPct(r.avgWin) : '—'}</span>
                  <span>avg L {r.avgLoss != null ? fmtPct(r.avgLoss) : '—'}</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 6px',
                    fontSize: 9, fontFamily: T.mono, letterSpacing: 0.4,
                    color: T.textMid, background: T.ink300,
                    border: '1px solid ' + T.edge, borderRadius: 3,
                  }}>calibration: {brierStr}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- main panel ----------
  function TRJournalPanel(props) {
    var open = props.open, onClose = props.onClose;
    var s1 = React.useState(0); var tick = s1[0], setTick = s1[1];
    var s2 = React.useState('open'); var tab = s2[0], setTab = s2[1];
    var s3 = React.useState(false); var showForm = s3[0], setShowForm = s3[1];
    var s4 = React.useState(null); var editing = s4[0], setEditing = s4[1];

    var refresh = function () { setTick(function (t) { return t + 1; }); };

    var data = React.useMemo(function () {
      if (!window.TRJournal) return { entries: [], stats: null, curve: [] };
      installModelWeights();
      return {
        entries: window.TRJournal.getEntries(),
        stats: window.TRJournal.getStats(),
        curve: window.TRJournal.getPnLCurve(),
      };
    }, [tick, open]);

    if (!open) return null;

    var stats = data.stats || {};
    var entries = data.entries || [];
    var filtered = entries.filter(function (e) {
      if (tab === 'open') return e.status === 'open';
      if (tab === 'closed') return e.status === 'closed';
      return true;
    });

    var pnlColor = (stats.totalPnl || 0) > 0 ? T.bull : ((stats.totalPnl || 0) < 0 ? T.bear : T.text);

    async function handleClose(entry) {
      var prompt1 = window.prompt('Exit price for ' + entry.symbol + ':',
        entry.entryPrice != null ? String(entry.entryPrice) : '');
      if (prompt1 == null) return;
      var px = Number(prompt1);
      if (!isFinite(px)) { alert('Invalid price'); return; }
      var prompt2 = window.prompt('Exit date (YYYY-MM-DD):',
        new Date().toISOString().slice(0, 10));
      if (prompt2 == null) return;
      var dateIso = prompt2 ? new Date(prompt2).toISOString() : new Date().toISOString();
      window.TRJournal.closeTrade(entry.id, px, dateIso);
      refresh();
    }
    function handleDelete(entry) {
      if (!window.confirm('Delete ' + entry.symbol + ' trade? This cannot be undone.')) return;
      window.TRJournal.deleteEntry(entry.id);
      refresh();
    }
    function handleEdit(entry) {
      setEditing(entry);
      setShowForm(true);
    }
    function handleExport() {
      var csv = window.TRJournal.exportCSV();
      try {
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'tr-journal-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } catch (_) {
        // Fallback — copy to clipboard
        try {
          navigator.clipboard.writeText(csv);
          alert('CSV copied to clipboard (download unavailable).');
        } catch (__) {
          alert('Export failed.');
        }
      }
    }

    var hasTradier = !!window.TradierAPI && !!(window.TR_SETTINGS
      && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.tradier);

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(4,6,10,0.82)',
        backdropFilter: 'blur(8px)', zIndex: 9000,
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        fontFamily: T.ui, color: T.text,
      }}>
        <div onClick={function (e) { e.stopPropagation(); }} style={{
          flex: 1, margin: '2vh 2vw', background: T.ink100,
          border: '1px solid ' + T.edge, borderRadius: 12, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Header */}
          <div style={{
            padding: '14px 22px', borderBottom: '1px solid ' + T.edge,
            display: 'flex', alignItems: 'center', gap: 12, background: T.ink200,
          }}>
            <div>
              <div style={{
                fontSize: 10, letterSpacing: 1.4, color: T.signal,
                textTransform: 'uppercase', fontWeight: 700,
              }}>TRADE JOURNAL · Running P&amp;L</div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                Executed trades · win rate · equity curve
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={function () { setEditing(null); setShowForm(function (s) { return !s; }); }} style={{
              padding: '7px 14px', background: T.signal, color: T.ink000,
              border: '1px solid ' + T.signal, borderRadius: 5, cursor: 'pointer',
              fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
            }}>+ LOG NEW TRADE</button>
            {hasTradier && (
              <button onClick={async function () { await importFromTradier(); refresh(); }} style={{
                padding: '7px 14px', background: T.ink300, color: T.accent,
                border: '1px solid ' + T.edgeHi, borderRadius: 5, cursor: 'pointer',
                fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              }}>IMPORT FROM TRADIER</button>
            )}
            <button onClick={handleExport} style={{
              padding: '7px 14px', background: T.ink300, color: T.textMid,
              border: '1px solid ' + T.edgeHi, borderRadius: 5, cursor: 'pointer',
              fontFamily: T.mono, fontSize: 11, letterSpacing: 0.4,
            }}>EXPORT CSV</button>
            <button onClick={onClose} style={{
              background: 'transparent', color: T.textMid, border: '1px solid ' + T.edge,
              padding: '7px 14px', borderRadius: 5, cursor: 'pointer',
              fontSize: 11, fontFamily: T.mono, letterSpacing: 0.4,
            }}>CLOSE ✕</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

            {/* MODEL CALIBRATION */}
            <ModelCalibration entries={entries} />

            {/* STAT STRIP */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatCard label="Total P&L"
                value={fmtUsd(stats.totalPnl, { forceSign: true })}
                color={pnlColor}
                sub={(stats.closedCount || 0) + ' closed trades'} />
              <StatCard label="Win Rate"
                value={stats.closedCount ? (stats.winRate * 100).toFixed(0) + '%' : '—'}
                color={(stats.winRate || 0) >= 0.5 ? T.bull : T.bear}
                sub={stats.closedCount ? Math.round((stats.winRate || 0) * (stats.closedCount || 0)) + ' W / '
                  + (stats.closedCount - Math.round((stats.winRate || 0) * (stats.closedCount || 0))) + ' L' : '—'} />
              <StatCard label="Open" value={stats.openCount || 0} color={T.signal}
                sub="positions" />
              <StatCard label="Closed" value={stats.closedCount || 0} color={T.text}
                sub="trades" />
              <StatCard label="Avg Win" value={fmtUsd(stats.avgWin, { forceSign: true })}
                color={T.bull} />
              <StatCard label="Avg Loss" value={fmtUsd(stats.avgLoss, { forceSign: true })}
                color={T.bear} />
              <StatCard label="Profit Factor"
                value={isFinite(stats.profitFactor) ? (stats.profitFactor || 0).toFixed(2) : '∞'}
                color={(stats.profitFactor || 0) >= 1.5 ? T.bull : T.textMid}
                sub="gross win / loss" />
              <StatCard label="Trades / Week"
                value={(stats.tradesPerWeek || 0).toFixed(1)}
                color={T.textMid} />
            </div>

            {/* EQUITY CURVE */}
            <div style={{ marginTop: 16 }}>
              <EquityCurve curve={data.curve} />
            </div>

            {/* FORM (collapsible) */}
            {showForm && (
              <TradeForm editing={editing}
                onDone={function () {
                  setShowForm(false); setEditing(null); refresh();
                }}
                onCancel={function () { setShowForm(false); setEditing(null); }} />
            )}

            {/* TABS */}
            <div style={{
              marginTop: 16, display: 'flex', gap: 6, borderBottom: '1px solid ' + T.edge,
              paddingBottom: 8,
            }}>
              {['open', 'closed', 'all'].map(function (t) {
                var active = t === tab;
                return (
                  <div key={t} onClick={function () { setTab(t); }} style={{
                    padding: '6px 14px', fontFamily: T.mono, fontSize: 10.5,
                    fontWeight: 600, letterSpacing: 0.6,
                    background: active ? T.signal : T.ink200,
                    color: active ? T.ink000 : T.textMid,
                    border: '1px solid ' + (active ? T.signal : T.edge),
                    borderRadius: 5, cursor: 'pointer',
                    textTransform: 'uppercase',
                  }}>{t} {t === 'open' ? '(' + (stats.openCount || 0) + ')'
                    : t === 'closed' ? '(' + (stats.closedCount || 0) + ')'
                    : '(' + (entries.length) + ')'}</div>
                );
              })}
            </div>

            {/* TABLE */}
            <div style={{
              marginTop: 10, background: T.ink200,
              border: '1px solid ' + T.edge, borderRadius: 8, overflowX: 'auto',
            }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', minWidth: 1100,
              }}>
                <thead>
                  <tr style={{ background: T.ink300 }}>
                    {['Date', 'Symbol', 'Side', 'Qty', 'Entry', 'Exit',
                      'P&L %', 'P&L $', 'Dur', 'Tags', 'Notes', ''].map(function (h, i) {
                      return (
                        <th key={i} style={{
                          padding: '8px', textAlign: 'left', fontFamily: T.mono,
                          fontSize: 9.5, letterSpacing: 0.8, color: T.textDim,
                          textTransform: 'uppercase', fontWeight: 600,
                          borderBottom: '1px solid ' + T.edge,
                        }}>{h}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={12} style={{
                        padding: '30px 14px', textAlign: 'center',
                        color: T.textDim, fontSize: 12,
                      }}>No {tab === 'all' ? '' : tab} trades. Click LOG NEW TRADE to add one.</td>
                    </tr>
                  )}
                  {filtered.map(function (e) {
                    return (
                      <TradeRow key={e.id} entry={e}
                        onClose={handleClose} onEdit={handleEdit} onDelete={handleDelete} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 22px', borderTop: '1px solid ' + T.edge,
            background: T.ink200,
            fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Storage: localStorage · tr_journal_entries · {entries.length} total rows</span>
            <span>
              Expectancy: {fmtUsd(stats.expectancy, { forceSign: true })}
              &nbsp;·&nbsp;Gross: {fmtUsd(stats.grossWin, { forceSign: true })} / {fmtUsd(stats.grossLoss, { forceSign: true })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  window.TRJournalPanel = TRJournalPanel;

  // Try to install getModelWeights immediately; if TRJournal isn't ready yet,
  // poll briefly so other panels (tr-trade-of-day) can call it.
  try {
    if (window.TRJournal) {
      installModelWeights();
    } else {
      var _wTries = 0;
      var _wTimer = setInterval(function () {
        _wTries++;
        if (window.TRJournal) { installModelWeights(); clearInterval(_wTimer); }
        else if (_wTries > 40) { clearInterval(_wTimer); }
      }, 250);
    }
  } catch (_) {}
})();
