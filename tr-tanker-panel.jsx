// tr-tanker-panel.jsx — Tanker tracking modal for Strait of Hormuz.
// Pairs with the Flights tab. Coordinator wires the tile into the flights
// header; this file exposes three globals:
//   window.TRTankerPanel({ open, onClose })  — full-screen modal
//   window.TRTankerTile({ onOpen })          — compact trigger tile
//   window.openTRTanker()                    — fire the open event
//
// Iframe provider notes (tested 2026-04):
//   MarineTraffic → blocked (x-frame-options: SAMEORIGIN)
//   VesselFinder  → no X-Frame header returned, likely embeddable; root
//                   is bot-protected (Apache 403 to curl) but loads in a
//                   real browser. Used as primary.
//   Fallback      → if the iframe 403s inside the client too, the user
//                   can hit any of the four public-map buttons under the
//                   frame (bottom strip).

const trT = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B', oil: '#0077B5',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

const TANKER_PUBLIC_MAPS = [
  { name: 'MarineTraffic · Gulf',  url: 'https://www.marinetraffic.com/en/ais/home/centerx:56.5/centery:26.5/zoom:7' },
  { name: 'VesselFinder · Gulf',   url: 'https://www.vesselfinder.com/?zoom=7&lat=26.5&lon=56.5' },
  { name: 'AISMarineTraffic',      url: 'https://www.aismarinetraffic.com/' },
  { name: '@TankerTrackers (X)',   url: 'https://x.com/TankerTrackers' },
];

// Primary iframe — VesselFinder passed X-Frame check.
const TANKER_IFRAME_SRC = 'https://www.vesselfinder.com/?zoom=7&lat=26.5&lon=56.5';

function TRTankerPanel({ open, onClose }) {
  const T = trT;
  const [news, setNews]             = React.useState([]);
  const [count, setCount]           = React.useState(null);
  const [insight, setInsight]       = React.useState(null);
  const [insightLoading, setIL]     = React.useState(false);
  const [iframeFailed, setIfFailed] = React.useState(false);
  const [tick, setTick]             = React.useState(0); // rotating ship emoji

  // Rotate the little ship emoji in the header every 1.4s — purely cosmetic.
  React.useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => setTick(t => (t + 1) % 4), 1400);
    return () => clearInterval(iv);
  }, [open]);

  // Initial load — news + count + AI commentary.
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        if (window.TankerData) {
          const [n, c] = await Promise.all([
            window.TankerData.getRecentTankerNews(25),
            window.TankerData.getHormuzCount(),
          ]);
          if (!active) return;
          setNews(n || []);
          setCount(c);

          // Kick AI commentary off the top 10 headlines.
          if (n && n.length && window.AIAnalysis && window.AIAnalysis.runMulti) {
            setIL(true);
            const head = n.slice(0, 10).map(a => ({
              title: a.title, source: a.source || 'shipping',
            }));
            // Reuse the existing multi-model framework — the default prompt
            // is crypto-flavored but still picks up macro & oil signals.
            window.AIAnalysis.runMulti(head, {})
              .then(res => { if (active) setInsight(res); })
              .catch(() => {})
              .finally(() => { if (active) setIL(false); });
          }
        }
      } catch (e) {
        console.warn('[TRTankerPanel] load failed:', e && e.message);
      }
    })();
    return () => { active = false; };
  }, [open]);

  if (!open) return null;

  const shipEmoji = ['🚢', '⛴️', '🛳️', '🚢'][tick];

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: 'rgba(4,6,10,0.82)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    fontFamily: T.ui, color: T.text,
  };
  const shell = {
    flex: 1, margin: '2vh 2vw', background: T.ink100,
    border: `1px solid ${T.edge}`, borderRadius: 10, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={shell} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${T.edge}`,
          display: 'flex', alignItems: 'center', gap: 14, background: T.ink200,
        }}>
          <span style={{ fontSize: 18 }}>{shipEmoji}</span>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: 1.4, color: T.signal,
              textTransform: 'uppercase', fontWeight: 600,
            }}>Hormuz Traffic · Live</div>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
              Strait of Hormuz · Tanker tracking
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {count && count.tankerCount != null && (
            <div style={{
              fontFamily: T.mono, fontSize: 11, color: T.textMid,
              padding: '5px 10px', background: T.ink300, borderRadius: 4,
              border: `0.5px solid ${T.edgeHi}`,
            }}>
              {count.tankerCount} tankers · {count.totalVessels} vessels
            </div>
          )}
          <button onClick={onClose} style={{
            background: 'transparent', color: T.textMid, border: `1px solid ${T.edge}`,
            padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
            fontSize: 11, fontFamily: T.mono, letterSpacing: 0.4,
          }}>CLOSE ✕</button>
        </div>

        {/* BODY — iframe + right AI/news panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* MAP */}
          <div style={{ flex: 1, position: 'relative', background: T.ink200 }}>
            {!iframeFailed ? (
              <iframe
                src={TANKER_IFRAME_SRC}
                onError={() => setIfFailed(true)}
                style={{ width: '100%', height: '100%', border: 'none', background: '#0a0d13' }}
                title="VesselFinder · Strait of Hormuz"
                allow="geolocation"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            ) : (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14,
                padding: 30, textAlign: 'center',
              }}>
                <div style={{ fontSize: 32 }}>⛴️</div>
                <div style={{ fontSize: 13, color: T.textMid, maxWidth: 380 }}>
                  Embedded map blocked. Launch an external map to see live tanker traffic through the Strait of Hormuz.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {TANKER_PUBLIC_MAPS.map(m => (
                    <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer" style={{
                      background: T.ink300, color: T.text, border: `1px solid ${T.edgeHi}`,
                      padding: '8px 14px', borderRadius: 5, fontSize: 11,
                      fontFamily: T.mono, letterSpacing: 0.4, textDecoration: 'none',
                    }}>{m.name} →</a>
                  ))}
                </div>
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: 10, left: 10, zIndex: 5,
              background: 'rgba(7,9,12,0.7)', backdropFilter: 'blur(6px)',
              padding: '6px 10px', borderRadius: 6,
              border: '0.5px solid rgba(255,255,255,0.12)',
              fontFamily: T.mono, fontSize: 9.5, color: T.textMid, letterSpacing: 0.3,
            }}>
              VesselFinder · Hormuz
            </div>
          </div>

          {/* RIGHT PANEL — AI + news */}
          <div style={{
            width: 400, background: T.ink100, borderLeft: `1px solid ${T.edge}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* AI commentary */}
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.edge}` }}>
              <div style={{
                fontSize: 10, letterSpacing: 1.2, color: T.signal,
                textTransform: 'uppercase', fontWeight: 600, marginBottom: 8,
              }}>AI Commentary · Hormuz disruption</div>
              {insightLoading && !insight && (
                <div style={{ fontSize: 11, color: T.textDim, fontStyle: 'italic' }}>
                  Analyzing tanker traffic + news…
                </div>
              )}
              {!insightLoading && !insight && (
                <div style={{ fontSize: 11, color: T.textDim }}>
                  Add a Claude or OpenAI key in Settings to see disruption probability.
                </div>
              )}
              {insight && insight.consensus && (
                <div style={{ fontSize: 11.5, color: T.text, lineHeight: 1.55 }}>
                  <div style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                    background: insight.consensus.agree ? 'rgba(111,207,142,0.15)' : 'rgba(217,107,107,0.15)',
                    color: insight.consensus.agree ? T.bull : T.bear,
                    fontSize: 9.5, fontFamily: T.mono, letterSpacing: 0.6, marginBottom: 6,
                  }}>{insight.consensus.label}</div>
                  <div>{insight.consensus.summary}</div>
                </div>
              )}
            </div>

            {/* News list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{
                padding: '12px 18px 6px', fontSize: 10, letterSpacing: 1.2,
                color: T.textDim, textTransform: 'uppercase', fontWeight: 600,
              }}>Recent tanker news · {news.length}</div>
              {news.length === 0 && (
                <div style={{ padding: '10px 18px', fontSize: 11, color: T.textDim }}>
                  No matching headlines in the last news cycle.
                </div>
              )}
              {news.map((a, i) => (
                <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" style={{
                  display: 'block', padding: '10px 18px',
                  borderBottom: `1px solid ${T.edge}`,
                  textDecoration: 'none', color: T.text,
                }}>
                  <div style={{
                    fontSize: 9.5, fontFamily: T.mono, color: a.sourceColor || T.textDim,
                    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3,
                  }}>{a.source || 'news'}</div>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4 }}>
                    {a.title}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* BOTTOM STRIP — public map launchers */}
        <div style={{
          padding: '10px 18px', borderTop: `1px solid ${T.edge}`,
          background: T.ink200, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{
            fontSize: 9.5, fontFamily: T.mono, color: T.textDim,
            letterSpacing: 0.8, textTransform: 'uppercase', marginRight: 6,
          }}>Launch external →</div>
          {TANKER_PUBLIC_MAPS.map(m => (
            <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer" style={{
              background: T.ink300, color: T.text, border: `1px solid ${T.edgeHi}`,
              padding: '5px 10px', borderRadius: 4, fontSize: 10.5,
              fontFamily: T.mono, letterSpacing: 0.3, textDecoration: 'none',
            }}>{m.name} →</a>
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact tile — stays embeddable in the Flights header.
function TRTankerTile({ onOpen }) {
  const T = trT;
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const iv = setInterval(() => setTick(t => (t + 1) % 4), 1600);
    return () => clearInterval(iv);
  }, []);
  const shipEmoji = ['🚢', '⛴️', '🛳️', '🚢'][tick];
  return (
    <button onClick={() => (onOpen ? onOpen() : window.openTRTanker && window.openTRTanker())}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: T.ink200, border: `1px solid ${T.edgeHi}`,
        padding: '6px 12px', borderRadius: 5, cursor: 'pointer',
        fontFamily: T.mono, fontSize: 11, color: T.text, letterSpacing: 0.4,
      }}>
      <span style={{ fontSize: 14 }}>{shipEmoji}</span>
      <span style={{ color: T.signal, fontWeight: 600 }}>HORMUZ TRAFFIC</span>
      <span style={{ color: T.textDim }}>·</span>
      <span style={{ color: T.textMid }}>LIVE</span>
      <span style={{ color: T.textDim, fontSize: 10 }}>· click to open map</span>
    </button>
  );
}

// Global openers — coordinator wires these in.
window.TRTankerPanel = TRTankerPanel;
window.TRTankerTile  = TRTankerTile;
window.openTRTanker  = function () {
  try { window.dispatchEvent(new CustomEvent('tr:tanker:open')); }
  catch (e) { console.warn('openTRTanker failed', e); }
};
