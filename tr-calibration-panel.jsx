// tr-calibration-panel.jsx — TradeRadar Prediction Market Calibration Tracker.
//
// Tracks how well Polymarket / Kalshi predictions match reality. A market
// that says 70% should result in YES happening 70% of the time — we plot
// the gap (reliability diagram) and score with Brier. Well-calibrated
// markets are worth following; uncalibrated ones are contrarian signals.
//
// Exposes:
//   window.openTRCalibration()                         — CustomEvent('tr:open-calibration')
//   window.TRCalibrationPanel                          — React modal
//   window.TRCalibration.recordSnapshot(id,label,src,p)— append snapshot to localStorage
//   window.TRCalibration.recordResolution(id,outcome)  — finalize with 'YES'/'NO'
//
// Storage: localStorage key `tr_calibration_v1`

(function () {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    teal: '#4FC3D9',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };

  const STORAGE_KEY = 'tr_calibration_v1';

  const SOURCE_COLOR = {
    Polymarket: T.signal,
    Kalshi: T.teal,
  };

  // --------------------------------------------------------------------
  // Storage helpers
  // --------------------------------------------------------------------
  function todayISO() {
    try { return new Date().toISOString().slice(0, 10); } catch (_) { return '1970-01-01'; }
  }

  function defaultSeed() {
    return {
      markets: [
        {
          id: 'polymarket-btc-80k-jan-2026',
          label: 'BTC > $80K Jan 2026',
          source: 'Polymarket',
          snapshots: [
            { date: '2025-12-15', probability: 0.62 },
            { date: '2026-01-15', probability: 0.71 },
          ],
          resolution: 'YES',
        },
        {
          id: 'kalshi-fed-cut-dec-2025',
          label: 'Fed cut Dec 2025',
          source: 'Kalshi',
          snapshots: [
            { date: '2025-11-01', probability: 0.45 },
            { date: '2025-12-01', probability: 0.58 },
          ],
          resolution: 'YES',
        },
        {
          id: 'polymarket-trump-tariff-2025',
          label: 'Trump tariff bill 2025',
          source: 'Polymarket',
          snapshots: [
            { date: '2025-09-01', probability: 0.78 },
            { date: '2025-10-15', probability: 0.82 },
          ],
          resolution: 'NO',
        },
        {
          id: 'polymarket-iran-deal-eoy-2026',
          label: 'Iran nuclear deal EOY 2026',
          source: 'Polymarket',
          snapshots: [
            { date: '2026-04-01', probability: 0.42 },
            { date: '2026-04-15', probability: 0.31 },
          ],
          resolution: null,
        },
        {
          id: 'kalshi-btc-150k-eoy-2026',
          label: 'BTC > $150K EOY 2026',
          source: 'Kalshi',
          snapshots: [
            { date: '2026-04-01', probability: 0.28 },
            { date: '2026-04-15', probability: 0.22 },
          ],
          resolution: null,
        },
      ],
    };
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = defaultSeed();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.markets)) return defaultSeed();
      return parsed;
    } catch (_) {
      return defaultSeed();
    }
  }

  function writeStore(store) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (_) {}
  }

  function findMarket(store, id) {
    return store.markets.find(m => m.id === id) || null;
  }

  // --------------------------------------------------------------------
  // Public API: recordSnapshot / recordResolution
  // --------------------------------------------------------------------
  function recordSnapshot(marketId, label, source, probability) {
    if (!marketId) return;
    const p = Math.max(0, Math.min(1, Number(probability) || 0));
    const store = readStore();
    let m = findMarket(store, marketId);
    if (!m) {
      m = {
        id: marketId,
        label: label || marketId,
        source: source || 'Polymarket',
        snapshots: [],
        resolution: null,
      };
      store.markets.push(m);
    } else {
      if (label) m.label = label;
      if (source) m.source = source;
    }
    // Replace same-day snapshot if present, else append
    const date = todayISO();
    const existing = m.snapshots.findIndex(s => s.date === date);
    const snap = { date, probability: p };
    if (existing >= 0) m.snapshots[existing] = snap;
    else m.snapshots.push(snap);
    m.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    writeStore(store);
  }

  function recordResolution(marketId, outcome) {
    if (!marketId) return;
    const o = outcome === 'YES' ? 'YES' : outcome === 'NO' ? 'NO' : null;
    if (!o) return;
    const store = readStore();
    const m = findMarket(store, marketId);
    if (!m) return;
    m.resolution = o;
    writeStore(store);
  }

  window.TRCalibration = {
    recordSnapshot,
    recordResolution,
    _read: readStore,
    _write: writeStore,
  };

  window.openTRCalibration = function openTRCalibration() {
    try { window.dispatchEvent(new CustomEvent('tr:open-calibration')); } catch (_) {}
  };

  // --------------------------------------------------------------------
  // Stats: reliability buckets + Brier score
  // --------------------------------------------------------------------
  function buildBuckets(store) {
    // 10 deciles, per-source
    // bucket[i] = { mid: (i+0.5)/10, bySource: { Polymarket: {n,yes}, Kalshi: {n,yes} } }
    const buckets = [];
    for (let i = 0; i < 10; i++) {
      buckets.push({
        mid: (i + 0.5) / 10,
        lo: i / 10,
        hi: (i + 1) / 10,
        bySource: {},
      });
    }
    (store.markets || []).forEach(m => {
      if (m.resolution !== 'YES' && m.resolution !== 'NO') return;
      const outcome = m.resolution === 'YES' ? 1 : 0;
      (m.snapshots || []).forEach(s => {
        const p = Math.max(0, Math.min(0.9999, Number(s.probability) || 0));
        const idx = Math.min(9, Math.floor(p * 10));
        const src = m.source || 'Other';
        if (!buckets[idx].bySource[src]) buckets[idx].bySource[src] = { n: 0, yes: 0 };
        buckets[idx].bySource[src].n += 1;
        buckets[idx].bySource[src].yes += outcome;
      });
    });
    return buckets;
  }

  function brierBySource(store) {
    // Per source: mean over resolved markets of mean((p-o)^2) across snapshots,
    // weighted simply by total snapshot count (flat average of snapshot errors).
    const agg = {}; // src -> { sumSq, n, markets:Set }
    (store.markets || []).forEach(m => {
      if (m.resolution !== 'YES' && m.resolution !== 'NO') return;
      const outcome = m.resolution === 'YES' ? 1 : 0;
      const src = m.source || 'Other';
      if (!agg[src]) agg[src] = { sumSq: 0, n: 0, markets: new Set() };
      (m.snapshots || []).forEach(s => {
        const p = Number(s.probability) || 0;
        agg[src].sumSq += (p - outcome) * (p - outcome);
        agg[src].n += 1;
      });
      agg[src].markets.add(m.id);
    });
    return Object.keys(agg).map(src => ({
      source: src,
      brier: agg[src].n > 0 ? agg[src].sumSq / agg[src].n : null,
      nResolved: agg[src].markets.size,
      nSnapshots: agg[src].n,
    })).sort((a, b) => a.source.localeCompare(b.source));
  }

  function brierColor(score) {
    if (score == null) return T.textDim;
    if (score < 0.10) return T.bull;
    if (score <= 0.20) return T.signal;
    if (score <= 0.25) return '#E8A33F';
    return T.bear;
  }

  function brierLabel(score) {
    if (score == null) return '—';
    if (score < 0.10) return 'excellent';
    if (score <= 0.20) return 'decent';
    if (score <= 0.25) return 'fair';
    return 'poor';
  }

  function activeMarkets(store) {
    return (store.markets || []).filter(m => m.resolution !== 'YES' && m.resolution !== 'NO');
  }

  function currentProb(m) {
    if (!m.snapshots || !m.snapshots.length) return null;
    return m.snapshots[m.snapshots.length - 1].probability;
  }

  function probAtDaysAgo(m, days) {
    if (!m.snapshots || !m.snapshots.length) return null;
    const cutoffMs = Date.now() - days * 86400 * 1000;
    // Find snapshot with date <= cutoff (most recent on/before cutoff)
    let best = null;
    for (let i = 0; i < m.snapshots.length; i++) {
      const s = m.snapshots[i];
      const t = Date.parse(s.date + 'T00:00:00Z');
      if (!isFinite(t)) continue;
      if (t <= cutoffMs) {
        if (!best || Date.parse(best.date + 'T00:00:00Z') < t) best = s;
      }
    }
    return best ? best.probability : null;
  }

  // --------------------------------------------------------------------
  // SVG Reliability Diagram
  // --------------------------------------------------------------------
  function ReliabilityDiagram({ buckets, sources }) {
    const W = 360, H = 260;
    const PAD = { t: 14, r: 14, b: 34, l: 40 };
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;

    const xOf = x => PAD.l + x * iw;
    const yOf = y => PAD.t + (1 - y) * ih;

    // Gridlines at 0, 0.25, 0.5, 0.75, 1
    const ticks = [0, 0.25, 0.5, 0.75, 1];

    // Per-source points (only buckets with data)
    const pointsBySrc = {};
    sources.forEach(src => {
      const pts = [];
      buckets.forEach(b => {
        const cell = b.bySource[src];
        if (!cell || !cell.n) return;
        const actual = cell.yes / cell.n;
        pts.push({ x: b.mid, y: actual, n: cell.n });
      });
      pts.sort((a, b) => a.x - b.x);
      pointsBySrc[src] = pts;
    });

    const anyData = Object.values(pointsBySrc).some(pts => pts.length > 0);

    return (
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Background */}
        <rect x={0} y={0} width={W} height={H} fill={T.ink200} rx={8} />

        {/* Gridlines */}
        {ticks.map(t2 => (
          <g key={'gx' + t2}>
            <line
              x1={xOf(t2)} x2={xOf(t2)}
              y1={PAD.t} y2={PAD.t + ih}
              stroke={T.edge} strokeWidth={1}
            />
            <text
              x={xOf(t2)} y={H - 12}
              fill={T.textDim} fontSize={10} textAnchor="middle"
              fontFamily={T.mono}
            >{Math.round(t2 * 100)}%</text>
          </g>
        ))}
        {ticks.map(t2 => (
          <g key={'gy' + t2}>
            <line
              x1={PAD.l} x2={PAD.l + iw}
              y1={yOf(t2)} y2={yOf(t2)}
              stroke={T.edge} strokeWidth={1}
            />
            <text
              x={PAD.l - 6} y={yOf(t2) + 3}
              fill={T.textDim} fontSize={10} textAnchor="end"
              fontFamily={T.mono}
            >{Math.round(t2 * 100)}%</text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={PAD.l + iw / 2} y={H - 2}
          fill={T.textMid} fontSize={10} textAnchor="middle"
        >predicted probability</text>
        <text
          x={10} y={PAD.t + ih / 2}
          fill={T.textMid} fontSize={10} textAnchor="middle"
          transform={`rotate(-90 10 ${PAD.t + ih / 2})`}
        >actual YES rate</text>

        {/* Diagonal y=x reference */}
        <line
          x1={xOf(0)} y1={yOf(0)}
          x2={xOf(1)} y2={yOf(1)}
          stroke={T.edgeHi} strokeWidth={1} strokeDasharray="4 3"
        />

        {/* Source lines + points */}
        {sources.map(src => {
          const pts = pointsBySrc[src] || [];
          if (!pts.length) return null;
          const color = SOURCE_COLOR[src] || T.textMid;
          const path = pts.map((p, i) =>
            (i === 0 ? 'M' : 'L') + xOf(p.x) + ' ' + yOf(p.y)
          ).join(' ');
          return (
            <g key={src}>
              <path d={path} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={xOf(p.x)} cy={yOf(p.y)}
                  r={Math.min(7, 3 + Math.sqrt(p.n))}
                  fill={color} stroke={T.ink100} strokeWidth={1.5}
                  opacity={0.95}
                />
              ))}
            </g>
          );
        })}

        {/* Empty-state text */}
        {!anyData && (
          <text
            x={W / 2} y={H / 2}
            fill={T.textDim} fontSize={11} textAnchor="middle"
          >no resolved snapshots yet</text>
        )}
      </svg>
    );
  }

  // --------------------------------------------------------------------
  // Main Panel
  // --------------------------------------------------------------------
  function TRCalibrationPanel({ open, onClose }) {
    const [tick, setTick] = React.useState(0);
    const store = React.useMemo(() => readStore(), [tick]);

    if (!open) return null;

    const buckets = buildBuckets(store);
    const brier = brierBySource(store);
    const active = activeMarkets(store);
    const resolvedCount = (store.markets || []).filter(m => m.resolution === 'YES' || m.resolution === 'NO').length;
    const sources = Array.from(new Set((store.markets || []).map(m => m.source).filter(Boolean)));
    sources.sort();

    const refresh = () => setTick(t => t + 1);

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
            padding: '18px 22px 14px 22px',
            borderBottom: `1px solid ${T.edge}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2 }}>
                Prediction Market Calibration
              </div>
              <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                Do Polymarket / Kalshi probabilities match reality? Lower Brier = better.
              </div>
            </div>
            <button onClick={refresh} style={{
              background: T.ink300, color: T.text, border: `1px solid ${T.edge}`,
              borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Refresh</button>
            <button onClick={onClose} style={{
              background: 'transparent', color: T.textMid, border: `1px solid ${T.edge}`,
              borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Close</button>
          </div>

          {/* Body */}
          <div style={{ padding: '16px 22px 20px 22px', overflowY: 'auto' }}>

            {/* Reliability diagram + Brier */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: '0 0 auto' }}>
                <div style={{
                  fontSize: 11, color: T.textMid,
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                }}>Reliability Diagram</div>
                <ReliabilityDiagram buckets={buckets} sources={sources} />
                {/* Legend */}
                <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: T.textMid }}>
                  {sources.map(src => (
                    <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: 5,
                        background: SOURCE_COLOR[src] || T.textMid,
                      }} />
                      {src}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      display: 'inline-block', width: 14, height: 0,
                      borderTop: `1px dashed ${T.edgeHi}`,
                    }} />
                    perfect (y=x)
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, color: T.textMid,
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                }}>Brier Score by Source</div>
                {brier.length === 0 && (
                  <div style={{
                    fontSize: 11, color: T.textDim,
                    padding: '10px 0',
                  }}>No resolved markets yet.</div>
                )}
                {brier.map(row => (
                  <div key={row.source} style={{
                    background: T.ink200, border: `1px solid ${T.edge}`,
                    borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 4,
                        background: SOURCE_COLOR[row.source] || T.textMid,
                        display: 'inline-block',
                      }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.source}</div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 14, fontWeight: 600,
                        color: brierColor(row.brier), marginLeft: 'auto',
                      }}>
                        {row.brier == null ? '—' : row.brier.toFixed(3)}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 10, color: T.textMid, marginTop: 4,
                    }}>
                      <span>{row.nResolved} resolved · {row.nSnapshots} snapshots</span>
                      <span style={{ color: brierColor(row.brier), fontWeight: 600 }}>
                        {brierLabel(row.brier)}
                      </span>
                    </div>
                  </div>
                ))}
                <div style={{
                  fontSize: 10, color: T.textDim, marginTop: 4,
                  lineHeight: 1.5,
                }}>
                  <span style={{ color: T.bull }}>&lt; 0.10</span> excellent ·{' '}
                  <span style={{ color: T.signal }}>0.10–0.20</span> decent ·{' '}
                  <span style={{ color: T.bear }}>&gt; 0.25</span> poor
                </div>
              </div>
            </div>

            {/* Empty-state note when no resolutions */}
            {resolvedCount === 0 && (
              <div style={{
                marginTop: 16, padding: '10px 12px',
                background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 8,
                fontSize: 11, color: T.textMid, lineHeight: 1.5,
              }}>
                No resolutions yet — calibration appears after first resolved market.
                Currently tracking <span style={{ color: T.text, fontWeight: 600 }}>{active.length}</span> active
                markets across <span style={{ color: T.text, fontWeight: 600 }}>{sources.length}</span>{' '}
                source{sources.length === 1 ? '' : 's'}.
              </div>
            )}

            {/* Active markets table */}
            <div style={{ marginTop: 18 }}>
              <div style={{
                fontSize: 11, color: T.textMid,
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
              }}>Active Markets ({active.length})</div>
              {active.length === 0 && (
                <div style={{ fontSize: 11, color: T.textDim, padding: '6px 0' }}>
                  No active markets.
                </div>
              )}
              {active.length > 0 && (
                <div style={{
                  background: T.ink200, border: `1px solid ${T.edge}`,
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 80px 80px 80px',
                    padding: '8px 12px',
                    fontSize: 10, color: T.textDim,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                    borderBottom: `1px solid ${T.edge}`,
                  }}>
                    <div>Market</div>
                    <div style={{ textAlign: 'right' }}>Source</div>
                    <div style={{ textAlign: 'right' }}>Current</div>
                    <div style={{ textAlign: 'right' }}>Δ 7d</div>
                    <div style={{ textAlign: 'right' }}>Δ 30d</div>
                  </div>
                  {active.map(m => {
                    const cur = currentProb(m);
                    const p7 = probAtDaysAgo(m, 7);
                    const p30 = probAtDaysAgo(m, 30);
                    const d7 = (cur != null && p7 != null) ? cur - p7 : null;
                    const d30 = (cur != null && p30 != null) ? cur - p30 : null;
                    const deltaColor = d => d == null ? T.textDim : (d > 0 ? T.bull : d < 0 ? T.bear : T.textMid);
                    const deltaFmt = d => d == null ? '—' : (d > 0 ? '+' : '') + (d * 100).toFixed(0) + 'pp';
                    return (
                      <div key={m.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 80px 80px 80px',
                        padding: '10px 12px',
                        fontSize: 12,
                        borderTop: `1px solid ${T.edge}`,
                      }}>
                        <div style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={m.label}>{m.label}</div>
                        <div style={{
                          textAlign: 'right', fontSize: 11,
                          color: SOURCE_COLOR[m.source] || T.textMid, fontWeight: 600,
                        }}>{m.source}</div>
                        <div style={{
                          textAlign: 'right', fontFamily: T.mono, fontWeight: 600,
                        }}>{cur == null ? '—' : Math.round(cur * 100) + '%'}</div>
                        <div style={{
                          textAlign: 'right', fontFamily: T.mono,
                          color: deltaColor(d7),
                        }}>{deltaFmt(d7)}</div>
                        <div style={{
                          textAlign: 'right', fontFamily: T.mono,
                          color: deltaColor(d30),
                        }}>{deltaFmt(d30)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div style={{
              marginTop: 16, fontSize: 10, color: T.textDim,
              fontFamily: T.mono, lineHeight: 1.5,
            }}>
              TRCalibration.recordSnapshot(id, label, source, p) ·
              TRCalibration.recordResolution(id, 'YES'|'NO')
            </div>

          </div>
        </div>
      </div>
    );
  }

  window.TRCalibrationPanel = TRCalibrationPanel;
})();
