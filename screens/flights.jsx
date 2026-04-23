// FlightsScreen — Tab 9: Live Iran / Gulf military flight tracker with 7-day accumulation.
// Visible map is an embedded ADSBExchange globe (military-only, centered on Iran).
// A hidden Leaflet instance polls OpenSky ADS-B state vectors every 2min so history
// accumulates in localStorage. AI commentary panel to the right summarizes what the
// aircraft mix implies geopolitically.

const flT = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
  btc: '#F7931A', oil: '#0077B5',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

const PUBLIC_MAPS = [
  { name: 'ADSBExchange · Military-only', url: 'https://globe.adsbexchange.com/?mil=1' },
  { name: 'FlightRadar24 · Middle East',  url: 'https://www.flightradar24.com/27.5,53.0/6' },
  { name: 'OpenSky · CENTCOM',            url: 'https://opensky-network.org/network/explorer?lat=27&lon=50&zoom=5' },
  { name: '@AircraftSpots (X)',           url: 'https://x.com/AircraftSpots' },
  { name: '@Osint613 (X)',                url: 'https://x.com/Osint613' },
];

function callsignHint(cs) {
  const c = (cs || '').toUpperCase();
  if (c.startsWith('RCH'))   return 'C-17 / C-5 · transport';
  if (c.startsWith('CNV'))   return 'Navy · P-8 or supply';
  if (c.startsWith('PAT'))   return 'Army · various';
  if (c.startsWith('SPAR'))  return 'USAF · exec transport';
  if (c.startsWith('HAVEN')) return 'KC-135 · refueler';
  if (c.startsWith('BAT'))   return 'Strategic bomber support';
  if (c.startsWith('BLUE'))  return 'USAF';
  if (c.startsWith('RYDR'))  return 'USN · P-8 Poseidon';
  if (c.startsWith('SLAM'))  return 'USAF · strategic';
  if (c.startsWith('GOLD'))  return 'USAF';
  return '';
}

// Color-coded aircraft categories — trader-friendly buckets so you can
// tell at a glance what the posture is. Colors match the on-map legend.
function aircraftCategory(cs) {
  const c = (cs || '').toUpperCase();
  if (/^HAVEN|^KC|^PACK|^QID/.test(c))                    return { cat: 'REFUELER',  color: '#E85D75', label: 'Refueler · strike-ops prep' };
  if (/^BAT|^SLAM|^BONE|^DOOM|^NOBLE|^STEEL/.test(c))     return { cat: 'BOMBER',    color: '#D96B6B', label: 'Bomber / strategic' };
  if (/^CNV|^RYDR|^POSEIDON|^NAVY/.test(c))               return { cat: 'PATROL',    color: '#5FC9C2', label: 'Navy patrol · P-8 ASW' };
  if (/^RCH|^BOXR|^MOOSE|^PEACH/.test(c))                 return { cat: 'TRANSPORT', color: '#c9a227', label: 'Transport · C-17/C-5' };
  if (/^SPAR|^BLUE|^GOLD|^MAGMA/.test(c))                 return { cat: 'EXEC',      color: '#B07BE6', label: 'Exec / VIP transport' };
  if (/^DRAGON|^OLIVE|^SEMPRA|^HAWK|^HAMMER/.test(c))     return { cat: 'ISR',       color: '#6FCF8E', label: 'ISR / recon' };
  return                                                     { cat: 'OTHER',     color: '#9AA3B2', label: 'Other US military' };
}

// Legend definitions — single source of truth for the on-map key
// and the right-side aircraft list color stripes.
const AIRCRAFT_LEGEND = [
  { cat: 'REFUELER',  color: '#E85D75', label: 'Refueler' },
  { cat: 'BOMBER',    color: '#D96B6B', label: 'Bomber / Strategic' },
  { cat: 'PATROL',    color: '#5FC9C2', label: 'Navy Patrol (P-8)' },
  { cat: 'TRANSPORT', color: '#c9a227', label: 'Transport (C-17/C-5)' },
  { cat: 'EXEC',      color: '#B07BE6', label: 'Exec / VIP' },
  { cat: 'ISR',       color: '#6FCF8E', label: 'ISR / Recon' },
  { cat: 'OTHER',     color: '#9AA3B2', label: 'Other US Mil' },
];

// Persistent history — append every poll, cap at ~20k records (7d at 2min = 5040).
function loadFlightHistory() {
  try { return JSON.parse(localStorage.getItem('tr_flight_history') || '[]'); } catch { return []; }
}
function saveFlightHistory(arr) {
  try { localStorage.setItem('tr_flight_history', JSON.stringify(arr.slice(-20000))); } catch {}
}

function FlightsScreen({ onNav }) {
  const T = flT;
  const W = 1280, H = 820;
  const mapRef = React.useRef(null);
  const mapElRef = React.useRef(null);
  const markerLayerRef = React.useRef(null);
  const trailLayerRef = React.useRef(null);

  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [period, setPeriod] = React.useState('now'); // 'now' | '1h' | '24h' | '7d'
  const [history, setHistory] = React.useState(loadFlightHistory());
  const [insight, setInsight] = React.useState(null);
  const [insightLoading, setInsightLoading] = React.useState(false);

  // Initialize Leaflet map once
  React.useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    if (typeof L === 'undefined') return; // Leaflet not loaded yet
    const map = L.map(mapElRef.current, {
      center: [27, 50], zoom: 5, zoomControl: true, attributionControl: false,
      preferCanvas: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 10, minZoom: 3,
    }).addTo(map);
    L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap · CARTO').addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    trailLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Legacy Iran/Gulf bbox outline — kept for the hidden Leaflet container
    // so existing map effects don't blow up. Visible map is the ADSBExchange iframe.
    L.rectangle([[15, 30], [40, 65]], {
      color: '#c9a227', weight: 1, fillOpacity: 0.03, dashArray: '4 4',
    }).addTo(map);
  }, []);

  // Poll OpenSky every 2 min
  const tick = React.useCallback(async () => {
    if (typeof MilitaryFlights === 'undefined') return;
    setLoading(true);
    try {
      const d = await MilitaryFlights.getMidEast();
      if (d) {
        setData(d); setError(null);
        // Append to history with timestamp
        const snapshots = (d.usMil || []).map(a => ({
          t: d.timestamp, icao24: a.icao24, callsign: a.callsign,
          lat: a.lat, lon: a.lon, alt: a.alt, vel: a.velocity,
        })).filter(s => s.lat && s.lon);
        if (snapshots.length) {
          setHistory(prev => {
            const merged = [...prev, ...snapshots];
            saveFlightHistory(merged);
            return merged;
          });
        }
      } else {
        setError('OpenSky unreachable or rate-limited.');
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => {
    tick();
    const iv = setInterval(tick, 120_000);
    return () => clearInterval(iv);
  }, [tick]);

  // Render markers + trails based on current period
  React.useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current || !trailLayerRef.current) return;
    markerLayerRef.current.clearLayers();
    trailLayerRef.current.clearLayers();

    // Live markers (current snapshot)
    if (data && data.usMil) {
      for (const a of data.usMil) {
        if (!a.lat || !a.lon) continue;
        const icon = L.divIcon({
          className: 'tr-aircraft',
          html: `<div style="transform: rotate(${a.heading || 0}deg); color: #c9a227; font-size: 18px; line-height: 18px;">✈</div>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        });
        const marker = L.marker([a.lat, a.lon], { icon }).addTo(markerLayerRef.current);
        marker.bindTooltip(
          `<b style="color:#c9a227">${a.callsign}</b><br>${callsignHint(a.callsign)}<br>alt ${Math.round(a.alt || 0)}m · vel ${Math.round(a.velocity || 0)}m/s`,
          { direction: 'top', offset: [0, -6] }
        );
      }
    }

    // Historical trails — filter by period
    const now = Date.now() / 1000;
    const cutoffSecs = period === 'now' ? now - 600       // last 10 min
                    : period === '1h'   ? now - 3600
                    : period === '24h'  ? now - 86400
                    :                     now - 604800;   // 7d
    const byIcao = {};
    for (const s of history) {
      if (s.t < cutoffSecs) continue;
      (byIcao[s.icao24] = byIcao[s.icao24] || []).push(s);
    }
    for (const [, pts] of Object.entries(byIcao)) {
      pts.sort((a, b) => a.t - b.t);
      if (pts.length < 2) continue;
      L.polyline(pts.map(p => [p.lat, p.lon]), {
        color: '#c9a227', weight: 1, opacity: 0.35,
      }).addTo(trailLayerRef.current);
    }
  }, [data, history, period]);

  // AI commentary — re-run when data changes
  React.useEffect(() => {
    if (!data || !data.usMil) return;
    if (typeof AIAnalysis === 'undefined') return;
    const keys = AIAnalysis.getKeys();
    if (!keys.claude && !keys.openai && !keys.gemini) {
      setInsight({ text: 'Add an Anthropic / OpenAI / Gemini key in ⚙ Settings to see AI commentary on flight activity.', model: 'none' });
      return;
    }
    let active = true;
    setInsightLoading(true);
    (async () => {
      try {
        // Build rich context: current aircraft, type mix, 24h trend from
        // localStorage history, and top 5 recent geopolitical headlines.
        const typeCount = { refueler: 0, transport: 0, bomber: 0, patrol: 0, exec: 0, other: 0 };
        for (const a of data.usMil) {
          const h = (callsignHint(a.callsign) || '').toLowerCase();
          if      (h.includes('refueler')) typeCount.refueler++;
          else if (h.includes('transport')) typeCount.transport++;
          else if (h.includes('bomber'))    typeCount.bomber++;
          else if (h.includes('poseidon') || h.includes('navy')) typeCount.patrol++;
          else if (h.includes('exec'))      typeCount.exec++;
          else                              typeCount.other++;
        }

        // 24-hour trend from localStorage history — counts per rolling 6h bucket
        const now = Date.now() / 1000;
        const buckets = [0, 0, 0, 0]; // [24-18h ago, 18-12h, 12-6h, 6h-now]
        const seenPerBucket = [new Set(), new Set(), new Set(), new Set()];
        for (const s of history) {
          const hoursAgo = (now - s.t) / 3600;
          if (hoursAgo > 24 || hoursAgo < 0) continue;
          const idx = hoursAgo > 18 ? 0 : hoursAgo > 12 ? 1 : hoursAgo > 6 ? 2 : 3;
          seenPerBucket[idx].add(s.icao24);
        }
        const trendStr = seenPerBucket.map(s => s.size).join(' → ');

        // Current news context — pull a few recent Mideast/geo headlines
        let geoContext = '';
        try {
          if (typeof NewsFeed !== 'undefined') {
            const articles = await NewsFeed.fetchAll();
            const mideastKw = /iran|hormuz|yemen|red sea|israel|gaza|syria|iraq|saudi|tehran|idf|irgc|opec/i;
            const relevant = (articles || []).filter(a => mideastKw.test(a.title)).slice(0, 5);
            if (relevant.length) {
              geoContext = '\n\nCURRENT GEOPOLITICAL HEADLINES (last 24h):\n' +
                relevant.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');
            }
          }
        } catch (_) {}

        const aircraftSummary = data.usMil.slice(0, 30).map(a =>
          `  ${a.callsign} · ${callsignHint(a.callsign) || 'unknown'} · alt ${Math.round((a.alt || 0) / 1000)}k m · vel ${Math.round(a.velocity || 0)} m/s`
        ).join('\n');

        const prompt =
          `You are a former USAF intelligence officer writing an OSINT read for an oil/BTC trader. ` +
          `Analyze live US military flight activity over CENTCOM and provide a POV.\n\n` +
          `CURRENT SNAPSHOT (OpenSky, CENTCOM bbox 15–40°N, 30–65°E):\n` +
          `  Total aircraft in theater: ${data.total}\n` +
          `  US military tracked: ${data.usMilCount}\n` +
          `  Type mix — refuelers: ${typeCount.refueler}, transport: ${typeCount.transport}, bomber support: ${typeCount.bomber}, patrol (P-8): ${typeCount.patrol}, exec: ${typeCount.exec}, other: ${typeCount.other}\n\n` +
          `AIRCRAFT LIST:\n${aircraftSummary}\n\n` +
          `24H TREND (unique US mil aircraft seen per 6h bucket, oldest→newest):\n  ${trendStr}` +
          geoContext +
          `\n\nWrite your POV in this structure:\n` +
          `1. OPERATIONAL READ (1-2 sentences): what posture does this mix suggest? Refueler-heavy = strike ops prep. Transport-heavy = supply/troop. Bomber orbit = signaling. P-8 = ASW/surveillance. Quiet = routine.\n` +
          `2. TREND DELTA (1 sentence): is activity escalating, stable, or declining vs the 24h baseline? Cross-reference the headlines if relevant.\n` +
          `3. MARKET IMPLICATIONS (2-3 sentences): what moves if this escalates? Quantify — "oil +$4-8/bbl if..." or "BTC -5% if..."\n` +
          `4. WATCH FOR (2 bullets): specific next-step indicators that would confirm escalation vs normalization.`;

        const headline = { source: 'TradeRadar Flight Analyst', title: prompt };
        const result = await AIAnalysis.runMulti([headline]);
        if (!active) return;
        const order = ['claude', 'gpt', 'gemini'];
        for (const k of order) {
          const r = result && result[k];
          if (r && r.result && r.result.summary) {
            // runMulti's JSON parser gives {sentiment, summary, actionable, risks, opportunities}.
            // The structured POV prompt will most often land in `summary` + arrays.
            const sections = [];
            if (r.result.summary) sections.push({ label: 'READ', body: r.result.summary });
            if (r.result.opportunities && r.result.opportunities.length) {
              sections.push({ label: 'MARKET IMPLICATIONS', body: r.result.opportunities.map(o => '→ ' + o).join('\n') });
            }
            if (r.result.risks && r.result.risks.length) {
              sections.push({ label: 'WATCH FOR', body: r.result.risks.map(x => '⚠ ' + x).join('\n') });
            }
            if (r.result.actionable && r.result.actionable.length) {
              sections.push({ label: 'TRADE NOTE', body: r.result.actionable.map(a => `${a.action} ${a.asset} · ${a.reasoning} · ${a.urgency}`).join('\n') });
            }
            setInsight({
              sections,
              model: r.model || k,
              sentiment: r.result.sentiment,
              confidence: r.result.confidence,
              raw: sections.length ? null : (r.raw || r.result.summary),
            });
            return;
          }
        }
        setInsight({ text: 'No LLM returned usable output.', model: 'none' });
      } catch (e) {
        if (active) setInsight({ text: 'Error: ' + e.message, model: 'error' });
      } finally { if (active) setInsightLoading(false); }
    })();
    return () => { active = false; };
  }, [data]);

  const clearHistory = () => {
    if (confirm('Clear all accumulated flight history?')) {
      saveFlightHistory([]);
      setHistory([]);
    }
  };

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`, background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="GG"
          style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
        <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>

        <TRTabBar current="flights" onNav={onNav} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {typeof TRLiveStripInline !== 'undefined' && <TRLiveStripInline />}
          {typeof TRGearInline !== 'undefined' && <TRGearInline />}
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4, display: 'flex', alignItems: 'center' }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; OPENSKY · CENTCOM
            {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && window.TR_EXPLAIN['flight-opensky'] && (
              <TRInfoIcon text={window.TR_EXPLAIN['flight-opensky']} size={10} />
            )}
          </div>
        </div>
      </div>

      {/* Period selector + stats */}
      <div style={{
        height: 50, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 24px', background: T.ink100,
        borderBottom: `1px solid ${T.edge}`,
      }}>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>View</div>
        <div style={{
          display: 'flex', padding: 3, background: T.ink200,
          border: `1px solid ${T.edge}`, borderRadius: 9,
        }}>
          {[
            { k: 'now',  label: 'Now',  desc: 'current snapshot' },
            { k: '1h',   label: '1H',   desc: 'hourly trail' },
            { k: '24h',  label: '24H',  desc: 'day trail' },
            { k: '7d',   label: '7D',   desc: 'week trail' },
          ].map(p => {
            const on = period === p.k;
            return (
              <div key={p.k}
                onClick={() => setPeriod(p.k)}
                onDoubleClick={() => {
                  // Double-click drills finer: 7d→24h, 24h→1h, 1h→now
                  const drill = { '7d': '24h', '24h': '1h', '1h': 'now', 'now': '7d' }[p.k];
                  setPeriod(drill);
                }}
                title={p.desc + ' · double-click to drill'}
                style={{
                  padding: '0 14px', height: 26, display: 'flex', alignItems: 'center',
                  fontSize: 11, fontWeight: 500, color: on ? T.ink000 : T.textMid,
                  background: on ? T.signal : 'transparent',
                  borderRadius: 6, letterSpacing: 0.2, cursor: on ? 'default' : 'pointer',
                  fontFamily: T.mono,
                  transition: 'background 120ms cubic-bezier(0.2,0.7,0.2,1), color 120ms cubic-bezier(0.2,0.7,0.2,1)',
                }}>{p.label}</div>
            );
          })}
        </div>

        {data && (
          <>
            <div style={{ width: 1, height: 22, background: T.edge }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 0.8, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                US MIL
                {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && window.TR_EXPLAIN['flight-callsign'] && (
                  <TRInfoIcon text={window.TR_EXPLAIN['flight-callsign']} size={9} />
                )}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: 14, fontWeight: 600,
                color: data.usMilCount > 8 ? T.bear : data.usMilCount > 3 ? T.signal : T.bull,
              }}>{data.usMilCount}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 0.8, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>TOTAL</div>
              <div style={{ fontFamily: T.mono, fontSize: 13, color: T.text }}>{data.total}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 0.8, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>HISTORY</div>
              <div style={{ fontFamily: T.mono, fontSize: 13, color: T.text }}>{history.length}</div>
              <div onClick={clearHistory} style={{
                fontFamily: T.mono, fontSize: 9, color: T.bear, cursor: 'pointer', marginLeft: 4,
              }}>clear</div>
            </div>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {PUBLIC_MAPS.slice(0, 3).map(m => (
            <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: T.mono, fontSize: 10, color: T.signal, letterSpacing: 0.3,
                textDecoration: 'none',
              }}>{m.name} →</a>
          ))}
        </div>
      </div>

      {/* Body: map + AI panel */}
      <div style={{ display: 'flex', height: H - 52 - 50 }}>
        {/* MAP — ADSBExchange globe embedded. Centered on Iran, always
            military-only (mil=1). Zoom 6 = Iran + Gulf + eastern Iraq fills
            the viewport. URL params: replay = scrubbable history. */}
        <div style={{ flex: 1, position: 'relative', background: T.ink200 }}>
          <iframe
            src={`https://globe.adsbexchange.com/?replay&lat=32&lon=53&zoom=6&mil=1`}
            style={{ width: '100%', height: '100%', border: 'none', background: '#0a0d13' }}
            title="ADSBExchange Iran · military only"
            allow="geolocation"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          {/* Hidden Leaflet container — kept so existing mapRef effects don't blow up. */}
          <div ref={mapElRef} style={{ position: 'absolute', width: 1, height: 1, top: -9999, left: -9999 }} />
          {error && !data && (
            <div style={{
              position: 'absolute', top: 20, left: 20, right: 20,
              padding: '12px 16px', background: 'rgba(217,107,107,0.12)',
              border: '0.5px solid rgba(217,107,107,0.45)', borderRadius: 8,
              fontSize: 12, color: T.bear, zIndex: 5,
            }}>{error}</div>
          )}

          {/* COLOR KEY — legend overlay (top-right) */}
          <div data-walk="flights-legend" style={{
            position: 'absolute', top: 12, right: 12, zIndex: 5,
            background: 'rgba(7,9,12,0.85)', backdropFilter: 'blur(10px) saturate(150%)',
            WebkitBackdropFilter: 'blur(10px) saturate(150%)',
            padding: '10px 12px', borderRadius: 8,
            border: '0.5px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 168,
          }}>
            <div style={{
              fontSize: 9, letterSpacing: 1.2, color: T.signal,
              textTransform: 'uppercase', fontWeight: 700, marginBottom: 8,
              fontFamily: T.mono,
            }}>Aircraft Key</div>
            {AIRCRAFT_LEGEND.map(l => (
              <div key={l.cat} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 0', fontFamily: T.mono, fontSize: 9.5,
                color: T.textMid, letterSpacing: 0.2,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 2, background: l.color,
                  boxShadow: `0 0 6px ${l.color}88`,
                  flexShrink: 0,
                }} />
                <div style={{ color: T.text, fontSize: 10 }}>{l.label}</div>
              </div>
            ))}
            <div style={{
              marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${T.edge}`,
              fontSize: 8.5, color: T.textDim, letterSpacing: 0.3,
              fontFamily: T.mono, lineHeight: 1.4,
            }}>
              Map uses ADSBExchange altitude palette.<br />Category colors show on right panel list.
            </div>
          </div>

          <div style={{
            position: 'absolute', bottom: 10, left: 10, zIndex: 5,
            background: 'rgba(7,9,12,0.7)', backdropFilter: 'blur(6px)',
            padding: '6px 10px', borderRadius: 6,
            border: '0.5px solid rgba(255,255,255,0.12)',
            fontFamily: T.mono, fontSize: 9.5, color: T.textMid, letterSpacing: 0.3,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              IRAN · MIL ONLY · {period === 'now' ? 'live' : `${period.toUpperCase()} replay`}
              {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && window.TR_EXPLAIN['flight-adsbex'] && (
                <TRInfoIcon text={window.TR_EXPLAIN['flight-adsbex']} size={9} />
              )}
            </span>
          </div>
        </div>

        {/* AI INSIGHT */}
        <div style={{
          width: 380, background: T.ink100, borderLeft: `1px solid ${T.edge}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 18px', borderBottom: `1px solid ${T.edge}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.signal, textTransform: 'uppercase', fontWeight: 600 }}>AI Commentary</div>
              {insight && insight.model && insight.model !== 'none' && (
                <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.3 }}>{insight.model}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.textMid, lineHeight: 1.5 }}>
              What does the current mix of aircraft imply for oil, BTC, and risk assets?
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            {insightLoading && !insight && (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 0.4 }}>
                ANALYZING AIRCRAFT MIX…
              </div>
            )}
            {insight && insight.sections && insight.sections.length > 0 && (
              <div>
                {insight.sentiment && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                    padding: '6px 10px',
                    background: insight.sentiment === 'bullish' ? 'rgba(111,207,142,0.1)'
                              : insight.sentiment === 'bearish' ? 'rgba(217,107,107,0.1)'
                              : 'rgba(201,162,39,0.1)',
                    border: `0.5px solid ${insight.sentiment === 'bullish' ? 'rgba(111,207,142,0.4)' : insight.sentiment === 'bearish' ? 'rgba(217,107,107,0.4)' : 'rgba(201,162,39,0.4)'}`,
                    borderRadius: 6,
                  }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6,
                      color: insight.sentiment === 'bullish' ? T.bull : insight.sentiment === 'bearish' ? T.bear : T.signal,
                      textTransform: 'uppercase',
                    }}>{insight.sentiment} · posture</div>
                    {insight.confidence != null && (
                      <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9.5, color: T.textDim }}>
                        conf {insight.confidence}/10
                      </div>
                    )}
                  </div>
                )}
                {insight.sections.map((s, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 9, letterSpacing: 1.2, color: T.signal,
                      textTransform: 'uppercase', fontWeight: 600, marginBottom: 5,
                    }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{s.body}</div>
                  </div>
                ))}
              </div>
            )}
            {insight && insight.raw && (
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {insight.raw}
              </div>
            )}
          </div>

          {/* Aircraft list footer */}
          {data && data.usMil && data.usMil.length > 0 && (
            <div style={{ borderTop: `1px solid ${T.edge}`, padding: '12px 18px 16px', maxHeight: 260, overflowY: 'auto' }}>
              <div style={{ fontSize: 9.5, letterSpacing: 0.9, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                Tracked · {data.usMil.length}
              </div>
              {data.usMil.slice(0, 12).map(a => {
                const cat = aircraftCategory(a.callsign);
                return (
                  <div key={a.icao24} title={cat.label} style={{
                    display: 'grid', gridTemplateColumns: '8px 74px 1fr 50px',
                    gap: 6, padding: '5px 0', fontFamily: T.mono, fontSize: 10.5,
                    borderBottom: `0.5px solid ${T.edge}`, alignItems: 'center',
                  }}>
                    <div style={{
                      width: 4, height: 14, background: cat.color, borderRadius: 1,
                      boxShadow: `0 0 4px ${cat.color}88`,
                    }} />
                    <div style={{ color: T.signal, fontWeight: 600 }}>{a.callsign}</div>
                    <div style={{ color: T.textMid, fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {callsignHint(a.callsign) || a.icao24}
                    </div>
                    <div style={{ color: T.text, textAlign: 'right', fontSize: 10 }}>
                      {a.alt ? Math.round(a.alt / 1000) + 'k' : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.FlightsScreen = FlightsScreen;
