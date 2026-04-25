// tr-backtest-panel.jsx — TradeRadar 30-Day Backtest Harness.
//
// Replays past Trade-of-the-Day calls vs. realized outcomes to measure
// win rate, avg P&L, profit factor, Sharpe, max drawdown, and calibration
// by conviction bucket. Persists everything to localStorage so calls
// recorded today can be resolved tomorrow.
//
// Exposes:
//   window.TRBacktestPanel        — React modal ({ open, onClose })
//   window.openTRBacktest()       — dispatches CustomEvent('tr:open-backtest')
//   window.TRBacktest.recordCall(date, trade)         — append snapshot
//   window.TRBacktest.recordOutcome(date, outcome)    — fill realized
//   window.TRBacktest.getStats()                      — summary numbers
//   window.TRBacktest.getCalls()                      — raw array
//
// Storage key: localStorage.tr_backtest_v1
//   { calls: [{ date, trade, btcSpot, wtiSpot, vix, outcome }] }
//
// Auto-records on CustomEvent('tr:trade-of-day-generated') — the trade
// object from ev.detail.trade is appended with today's date.

(function () {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };

  const STORAGE_KEY = 'tr_backtest_v1';

  // ------------------------------------------------------------------
  // Storage helpers
  // ------------------------------------------------------------------
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.calls)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }
  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (_) {}
  }
  function todayStr() {
    try {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    } catch (_) { return ''; }
  }

  // ------------------------------------------------------------------
  // Seed data — 5 resolved example calls (only if no storage yet)
  // ------------------------------------------------------------------
  function seedStore() {
    const seed = {
      calls: [
        {
          date: '2026-03-25',
          trade: { instrument: 'SPY 520C 1DTE', conviction: 'HIGH', thesis: 'CPI beat, dovish Fed tape', estPremium: 3.80, maxLoss: 380, target: 600 },
          btcSpot: 71400, wtiSpot: 82.10, vix: 16.2,
          outcome: { wonPct: 62, mfe: 78, mae: -12, exitPrice: 6.15, closeReason: 'target' },
        },
        {
          date: '2026-03-28',
          trade: { instrument: 'USO 79P 14DTE', conviction: 'MEDIUM', thesis: 'OPEC+ supply creep', estPremium: 1.45, maxLoss: 145, target: 250 },
          btcSpot: 69800, wtiSpot: 83.90, vix: 17.8,
          outcome: { wonPct: -88, mfe: 14, mae: -92, exitPrice: 0.17, closeReason: 'stop' },
        },
        {
          date: '2026-04-02',
          trade: { instrument: 'MARA 22C 7DTE', conviction: 'HIGH', thesis: 'BTC breakout, miner beta', estPremium: 1.10, maxLoss: 110, target: 200 },
          btcSpot: 73200, wtiSpot: 85.40, vix: 15.5,
          outcome: { wonPct: 145, mfe: 170, mae: -18, exitPrice: 2.70, closeReason: 'target' },
        },
        {
          date: '2026-04-08',
          trade: { instrument: 'TLT 95P 21DTE', conviction: 'LOW', thesis: 'Steepener trade, long-end sell', estPremium: 0.85, maxLoss: 85, target: 150 },
          btcSpot: 67100, wtiSpot: 88.20, vix: 19.1,
          outcome: { wonPct: 18, mfe: 42, mae: -26, exitPrice: 1.00, closeReason: 'time' },
        },
        {
          date: '2026-04-15',
          trade: { instrument: 'IWM 210C 3DTE', conviction: 'MEDIUM', thesis: 'Small-cap catch-up, soft PPI', estPremium: 2.20, maxLoss: 220, target: 400 },
          btcSpot: 75800, wtiSpot: 89.70, vix: 18.4,
          outcome: { wonPct: -45, mfe: 28, mae: -55, exitPrice: 1.21, closeReason: 'stop' },
        },
      ],
    };
    saveStore(seed);
    return seed;
  }

  function getOrInitStore() {
    const existing = loadStore();
    if (existing) return existing;
    return seedStore();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  function recordCall(date, trade) {
    const store = loadStore() || { calls: [] };
    const d = date || todayStr();
    // de-dupe same-day entries
    const idx = store.calls.findIndex(c => c.date === d);
    const snapshot = {
      date: d,
      trade: trade || {},
      btcSpot: (window.TR_LAST_BTC && window.TR_LAST_BTC.spot) || null,
      wtiSpot: (window.TR_LAST_WTI && window.TR_LAST_WTI.spot) || null,
      vix: (window.TR_LAST_VIX && window.TR_LAST_VIX.spot) || null,
      outcome: null,
    };
    if (idx >= 0) store.calls[idx] = Object.assign({}, store.calls[idx], snapshot);
    else store.calls.push(snapshot);
    saveStore(store);
    return snapshot;
  }

  function recordOutcome(date, outcome) {
    const store = loadStore() || { calls: [] };
    const idx = store.calls.findIndex(c => c.date === date);
    if (idx < 0) return null;
    store.calls[idx].outcome = outcome || null;
    saveStore(store);
    return store.calls[idx];
  }

  function computeStats(calls) {
    const resolved = (calls || []).filter(c => c.outcome && typeof c.outcome.wonPct === 'number');
    const count = (calls || []).length;
    if (!resolved.length) {
      return { count, resolved: 0, winRate: null, avgPL: null, avgWin: null, avgLoss: null, profitFactor: null, sharpe: null, maxDD: null };
    }
    const pls = resolved.map(c => c.outcome.wonPct);
    const wins = pls.filter(p => p > 0);
    const losses = pls.filter(p => p <= 0);
    const winRate = (wins.length / resolved.length) * 100;
    const avgPL = pls.reduce((a, b) => a + b, 0) / pls.length;
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const sumWins = wins.reduce((a, b) => a + b, 0);
    const sumLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = sumLosses > 0 ? sumWins / sumLosses : (sumWins > 0 ? Infinity : 0);
    // Sharpe (daily, unitless) = mean / stdev
    const mean = avgPL;
    const variance = pls.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, pls.length - 1);
    const stdev = Math.sqrt(variance);
    const sharpe = stdev > 0 ? mean / stdev : 0;
    // Max drawdown on cumulative wonPct curve
    let cum = 0, peak = 0, maxDD = 0;
    for (const p of pls) {
      cum += p;
      if (cum > peak) peak = cum;
      const dd = cum - peak;
      if (dd < maxDD) maxDD = dd;
    }
    return {
      count, resolved: resolved.length,
      winRate, avgPL, avgWin, avgLoss,
      profitFactor, sharpe, maxDD,
    };
  }

  function getStats() {
    const store = loadStore() || { calls: [] };
    return computeStats(store.calls);
  }
  function getCalls() {
    const store = loadStore() || { calls: [] };
    return store.calls.slice();
  }

  window.TRBacktest = {
    recordCall: recordCall,
    recordOutcome: recordOutcome,
    getStats: getStats,
    getCalls: getCalls,
    _seed: seedStore,
    _load: loadStore,
  };

  window.openTRBacktest = function openTRBacktest() {
    try { window.dispatchEvent(new CustomEvent('tr:open-backtest')); } catch (_) {}
  };

  // Auto-record on Trade-of-Day generation
  try {
    window.addEventListener('tr:trade-of-day-generated', function (ev) {
      try {
        const trade = (ev && ev.detail && ev.detail.trade) || ev.detail || null;
        if (!trade) return;
        recordCall(todayStr(), trade);
      } catch (_) {}
    });
  } catch (_) {}

  // Ensure seed exists the moment this module loads
  getOrInitStore();

  // ------------------------------------------------------------------
  // Formatters
  // ------------------------------------------------------------------
  function fmtPct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const d = digits == null ? 1 : digits;
    const sign = n > 0 ? '+' : '';
    return sign + n.toFixed(d) + '%';
  }
  function fmtNum(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const d = digits == null ? 2 : digits;
    return n.toFixed(d);
  }

  function winRateColor(wr) {
    if (wr === null || wr === undefined || !isFinite(wr)) return T.textMid;
    if (wr > 55) return T.bull;
    if (wr < 45) return T.bear;
    return T.signal;
  }
  function plColor(v) {
    if (v === null || v === undefined || !isFinite(v)) return T.textMid;
    if (v > 0) return T.bull;
    if (v < 0) return T.bear;
    return T.signal;
  }
  function pfColor(pf) {
    if (pf === null || pf === undefined || !isFinite(pf)) return T.textMid;
    if (pf > 1.5) return T.bull;
    if (pf > 1) return T.signal;
    return T.bear;
  }

  // ------------------------------------------------------------------
  // Stat card
  // ------------------------------------------------------------------
  function StatCard({ label, value, color, sub }) {
    return (
      <div style={{
        flex: 1, minWidth: 110,
        padding: '12px 14px',
        background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 9, letterSpacing: 1.0, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: color || T.text, fontFamily: T.mono, letterSpacing: 0.4 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 9.5, color: T.textDim, fontFamily: T.mono }}>{sub}</div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Equity curve (SVG polyline of cumulative wonPct)
  // ------------------------------------------------------------------
  function EquityCurve({ calls }) {
    const W = 520, H = 180, padL = 40, padR = 10, padT = 14, padB = 20;
    const resolved = (calls || []).filter(c => c.outcome && typeof c.outcome.wonPct === 'number');
    if (!resolved.length) {
      return (
        <div style={{
          width: W, height: H,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 8,
          color: T.textDim, fontFamily: T.mono, fontSize: 11,
        }}>No resolved calls yet</div>
      );
    }
    const cum = [];
    let running = 0;
    for (const c of resolved) {
      running += c.outcome.wonPct;
      cum.push(running);
    }
    const minY = Math.min(0, ...cum);
    const maxY = Math.max(0, ...cum);
    const spanY = Math.max(1, maxY - minY);
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const xAt = i => padL + (cum.length === 1 ? innerW / 2 : (i / (cum.length - 1)) * innerW);
    const yAt = v => padT + (1 - (v - minY) / spanY) * innerH;
    const zeroY = yAt(0);

    // Split polyline into above-zero (bull) and below-zero (bear) fills
    const ptsUp = [];
    const ptsDn = [];
    for (let i = 0; i < cum.length; i++) {
      const x = xAt(i), y = yAt(cum[i]);
      (cum[i] >= 0 ? ptsUp : ptsDn).push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    const line = cum.map((v, i) => xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1)).join(' ');
    const finalVal = cum[cum.length - 1];
    const finalColor = finalVal >= 0 ? T.bull : T.bear;

    return (
      <svg width={W} height={H} style={{
        background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 8,
      }}>
        {/* y-axis labels */}
        <text x={6} y={padT + 10} fill={T.textDim} fontSize="9" fontFamily={T.mono}>{fmtPct(maxY, 0)}</text>
        <text x={6} y={H - padB + 2} fill={T.textDim} fontSize="9" fontFamily={T.mono}>{fmtPct(minY, 0)}</text>
        <text x={6} y={zeroY + 3} fill={T.textDim} fontSize="9" fontFamily={T.mono}>0</text>
        {/* zero line */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke={T.edgeHi} strokeDasharray="2 3" />
        {/* fill under curve */}
        <polygon
          points={`${padL},${zeroY} ${line} ${xAt(cum.length - 1).toFixed(1)},${zeroY}`}
          fill={finalVal >= 0 ? 'rgba(111,207,142,0.12)' : 'rgba(217,107,107,0.12)'}
        />
        {/* main polyline */}
        <polyline points={line} fill="none" stroke={finalColor} strokeWidth="1.6" />
        {/* points */}
        {cum.map((v, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.5"
            fill={v >= 0 ? T.bull : T.bear} />
        ))}
        {/* x-axis label */}
        <text x={W / 2} y={H - 4} fill={T.textDim} fontSize="9" fontFamily={T.mono} textAnchor="middle">
          call # (1 → {cum.length}) · cumulative P&amp;L: <tspan fill={finalColor} fontWeight="700">{fmtPct(finalVal, 1)}</tspan>
        </text>
      </svg>
    );
  }

  // ------------------------------------------------------------------
  // Conviction breakdown (stacked bars W/L by bucket)
  // ------------------------------------------------------------------
  function ConvictionBreakdown({ calls }) {
    const buckets = ['HIGH', 'MEDIUM', 'LOW', 'PASS'];
    const rows = buckets.map(b => {
      const matching = (calls || []).filter(c => {
        const conv = (c.trade && c.trade.conviction) ? String(c.trade.conviction).toUpperCase() : '';
        if (b === 'PASS') return conv === 'PASS' || conv === 'SKIP';
        return conv === b || (b === 'MEDIUM' && conv === 'MED');
      });
      const resolved = matching.filter(c => c.outcome && typeof c.outcome.wonPct === 'number');
      const wins = resolved.filter(c => c.outcome.wonPct > 0).length;
      const losses = resolved.length - wins;
      const total = matching.length;
      const winPct = resolved.length ? (wins / resolved.length) * 100 : null;
      return { bucket: b, total, resolved: resolved.length, wins, losses, winPct };
    });

    const maxTotal = Math.max(1, ...rows.map(r => r.total));

    return (
      <div style={{
        background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 8,
        padding: '12px 14px',
      }}>
        <div style={{ fontSize: 9, letterSpacing: 1.0, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
          By Conviction
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const barW = (r.total / maxTotal) * 100;
            const winShare = r.resolved ? (r.wins / r.resolved) * 100 : 0;
            return (
              <div key={r.bucket} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 110px', gap: 10, alignItems: 'center' }}>
                <div style={{ fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, color: T.text, letterSpacing: 0.5 }}>
                  {r.bucket}
                </div>
                <div style={{ position: 'relative', height: 14, background: T.ink300, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: barW + '%',
                    display: 'flex',
                  }}>
                    <div style={{
                      width: winShare + '%', background: T.bull, opacity: 0.85,
                    }} />
                    <div style={{
                      flex: 1, background: T.bear, opacity: 0.7,
                    }} />
                  </div>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textMid, textAlign: 'right', letterSpacing: 0.3 }}>
                  {r.resolved ? (
                    <>
                      <span style={{ color: T.bull, fontWeight: 700 }}>{r.wins}</span>
                      <span style={{ color: T.textDim }}> / </span>
                      <span style={{ color: T.text }}>{r.resolved}</span>
                      <span style={{ color: T.textDim }}> · </span>
                      <span style={{ color: winRateColor(r.winPct), fontWeight: 600 }}>{fmtPct(r.winPct, 0)}</span>
                    </>
                  ) : (
                    <span style={{ color: T.textDim }}>
                      {r.total ? `${r.total} pending` : '—'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Calls table row
  // ------------------------------------------------------------------
  function CallsTable({ calls }) {
    const sorted = (calls || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return (
      <div style={{
        background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px',
          display: 'grid',
          gridTemplateColumns: '80px 1.6fr 70px 120px 70px 90px',
          gap: 8,
          fontFamily: T.mono, fontSize: 9, letterSpacing: 0.8,
          color: T.textDim, textTransform: 'uppercase', fontWeight: 600,
          borderBottom: `1px solid ${T.edge}`,
        }}>
          <div>DATE</div>
          <div>INSTRUMENT</div>
          <div>CONV</div>
          <div style={{ textAlign: 'right' }}>ENTRY → EXIT</div>
          <div style={{ textAlign: 'right' }}>RESULT</div>
          <div style={{ textAlign: 'right' }}>MFE / MAE</div>
        </div>
        <div style={{ maxHeight: 220, overflow: 'auto' }}>
          {sorted.map((c, i) => {
            const conv = (c.trade && c.trade.conviction) ? String(c.trade.conviction).toUpperCase() : '—';
            const entry = c.trade && c.trade.estPremium;
            const exit = c.outcome && c.outcome.exitPrice;
            const won = c.outcome && typeof c.outcome.wonPct === 'number' ? c.outcome.wonPct : null;
            const pending = !c.outcome;
            const badgeClr = pending ? T.textDim : (won > 0 ? T.bull : T.bear);
            const badgeText = pending ? '…' : (won > 0 ? 'W' : 'L');
            const convClr = conv === 'HIGH' ? T.bull : conv === 'LOW' ? T.bear : T.signal;
            return (
              <div key={c.date + '-' + i} style={{
                padding: '8px 12px',
                display: 'grid',
                gridTemplateColumns: '80px 1.6fr 70px 120px 70px 90px',
                gap: 8, alignItems: 'center',
                fontFamily: T.mono, fontSize: 10.5,
                borderBottom: `1px solid ${T.edge}`,
                color: T.text,
              }}>
                <div style={{ color: T.textMid }}>{c.date || '—'}</div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.text }}>
                  {(c.trade && c.trade.instrument) || '—'}
                </div>
                <div style={{ color: convClr, fontWeight: 600 }}>{conv}</div>
                <div style={{ textAlign: 'right', color: T.textMid }}>
                  {isFinite(entry) ? fmtNum(entry, 2) : '—'}
                  <span style={{ color: T.textDim }}> → </span>
                  {isFinite(exit) ? fmtNum(exit, 2) : '—'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-block', minWidth: 22,
                    padding: '1px 6px', borderRadius: 3,
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
                    color: T.ink000, background: badgeClr,
                  }}>{badgeText}</span>
                  <span style={{ marginLeft: 6, color: won === null ? T.textDim : plColor(won), fontWeight: 600 }}>
                    {won === null ? '—' : fmtPct(won, 0)}
                  </span>
                </div>
                <div style={{ textAlign: 'right', color: T.textDim }}>
                  {c.outcome && isFinite(c.outcome.mfe) ? (
                    <>
                      <span style={{ color: T.bull }}>{fmtPct(c.outcome.mfe, 0)}</span>
                      <span> / </span>
                      <span style={{ color: T.bear }}>{fmtPct(c.outcome.mae, 0)}</span>
                    </>
                  ) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // TRBacktestPanel
  // ------------------------------------------------------------------
  function TRBacktestPanel({ open, onClose }) {
    const [tick, setTick] = React.useState(0);

    // Re-read on every open so fresh writes show up
    const store = React.useMemo(() => {
      return loadStore() || { calls: [] };
    }, [open, tick]);

    // Listen for new records while panel is open
    React.useEffect(() => {
      if (!open) return;
      const handler = () => setTick(x => x + 1);
      window.addEventListener('tr:trade-of-day-generated', handler);
      window.addEventListener('storage', handler);
      return () => {
        window.removeEventListener('tr:trade-of-day-generated', handler);
        window.removeEventListener('storage', handler);
      };
    }, [open]);

    if (!open) return null;

    const calls = store.calls || [];
    const stats = computeStats(calls);
    const empty = calls.length === 0;

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
        backdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 120, padding: 40,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 720, maxHeight: '92%', overflow: 'hidden',
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
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>
              30-Day Backtest
            </div>
            <div style={{
              padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
              letterSpacing: 0.6, color: T.signal,
              background: 'rgba(201,162,39,0.10)',
              borderRadius: 4, border: '0.5px solid rgba(201,162,39,0.4)',
            }}>
              TRADE OF DAY · REPLAY
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 }}>
              {stats.count} calls · {stats.resolved} resolved
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <div onClick={() => setTick(x => x + 1)} style={{
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

          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {empty ? (
              <div style={{
                padding: '44px 20px', textAlign: 'center',
                background: T.ink200, border: `1px dashed ${T.edgeHi}`, borderRadius: 10,
                color: T.textMid, fontFamily: T.mono, fontSize: 12, letterSpacing: 0.4,
              }}>
                Start logging trade calls to begin tracking.
                <br />
                <span style={{ color: T.textDim, fontSize: 11 }}>
                  Calls auto-record from Trade of the Day card.
                </span>
              </div>
            ) : (
              <>
                {/* Top stats row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <StatCard
                    label="Total Calls"
                    value={String(stats.count)}
                    sub={`${stats.resolved} resolved`}
                  />
                  <StatCard
                    label="Win Rate"
                    value={stats.winRate === null ? '—' : stats.winRate.toFixed(0) + '%'}
                    color={winRateColor(stats.winRate)}
                    sub={stats.resolved ? `of ${stats.resolved}` : 'no resolved'}
                  />
                  <StatCard
                    label="Avg P&L"
                    value={stats.avgPL === null ? '—' : fmtPct(stats.avgPL, 1)}
                    color={plColor(stats.avgPL)}
                    sub={`Sharpe ${stats.sharpe === null ? '—' : fmtNum(stats.sharpe, 2)}`}
                  />
                  <StatCard
                    label="Profit Factor"
                    value={stats.profitFactor === null ? '—'
                         : stats.profitFactor === Infinity ? '∞'
                         : fmtNum(stats.profitFactor, 2)}
                    color={pfColor(stats.profitFactor)}
                    sub={stats.resolved ? `${fmtPct(stats.avgWin, 0)} / ${fmtPct(stats.avgLoss, 0)}` : '—'}
                  />
                  <StatCard
                    label="Max DD"
                    value={stats.maxDD === null ? '—' : fmtPct(stats.maxDD, 0)}
                    color={T.bear}
                    sub="cum wonPct"
                  />
                </div>

                {/* Equity curve */}
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 1.0, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
                    Equity Curve · cumulative wonPct
                  </div>
                  <EquityCurve calls={calls} />
                </div>

                {/* Calls table */}
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 1.0, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
                    Calls Log
                  </div>
                  <CallsTable calls={calls} />
                </div>

                {/* Conviction breakdown */}
                <ConvictionBreakdown calls={calls} />
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 22px',
            borderTop: `1px solid ${T.edge}`,
            fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span>Local · localStorage.tr_backtest_v1</span>
            <span style={{ color: T.signal }}>PF &gt; 1.5 = edge</span>
            <span style={{ marginLeft: 'auto' }}>Auto-records on tr:trade-of-day-generated</span>
          </div>

        </div>
      </div>
    );
  }
  window.TRBacktestPanel = TRBacktestPanel;
})();
