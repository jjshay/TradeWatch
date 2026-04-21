// CalendarScreen — Tab 5: upcoming key events, week-grid view + detail rail.
// Valuable to a macro trader: every scheduled catalyst tagged with
// importance, category, expected direction on BTC/OIL/SPX, and days until.

const calTokens = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A', oil: '#0077B5', spx: '#9AA3B2',
  geo: '#D96B6B', fed: '#0077B5', btcEvt: '#F7931A',
  trump: '#B07BE6', inst: '#6FCF8E', reg: '#5FC9C2', earn: '#C7A8FF',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

function CalendarScreen({ onNav }) {
  const T = calTokens;
  const W = 1280, H = 820;

  // "Today" is Apr 19, 2026 (Sun). Build 5 weeks starting the week of Apr 13.
  const weekStart = new Date(2026, 3, 13); // Mon Apr 13
  const weeks = [];
  for (let w = 0; w < 5; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(weekStart);
      dt.setDate(dt.getDate() + w * 7 + d);
      days.push(dt);
    }
    weeks.push(days);
  }
  const todayStr = '2026-04-19';
  const iso = (d) => d.toISOString().slice(0, 10);

  // Hardcoded fallback/baseline events. dir: +1/-1/0 per asset, importance 1-5, cat color
  const baseEvents = [
    { date: '2026-04-20', time: '08:30', cat: 'Macro Data',   c: T.fed,   imp: 3, title: 'US Retail Sales · Mar',       ex: { btc: +1, oil: 0, spx: +1 } },
    { date: '2026-04-21', time: '10:00', cat: 'Fed',          c: T.fed,   imp: 4, title: 'Powell · Economic Club NY',   ex: { btc: +1, oil: 0, spx: +1 } },
    { date: '2026-04-22', time: '14:00', cat: 'Fed',          c: T.fed,   imp: 5, title: 'FOMC Rate Decision',           ex: { btc: +1, oil: +1, spx: +1 }, pulse: true },
    { date: '2026-04-23', time: '16:00', cat: 'Earnings',     c: T.earn,  imp: 4, title: 'NVDA · Q1 Earnings',           ex: { btc: +1, oil: 0, spx: +1 } },
    { date: '2026-04-24', time: '09:00', cat: 'Regulatory',   c: T.reg,   imp: 5, title: 'CLARITY Act · Senate Vote',    ex: { btc: +1, oil: 0, spx: 0 }, pulse: true },
    { date: '2026-04-27', time: '00:00', cat: 'Geopolitical', c: T.geo,   imp: 4, title: 'Iran Nuclear Deadline',        ex: { btc: 0, oil: +1, spx: -1 } },
    { date: '2026-04-28', time: '10:30', cat: 'Oil',          c: T.oil,   imp: 3, title: 'EIA Crude Inventory',          ex: { btc: 0, oil: -1, spx: 0 } },
    { date: '2026-04-29', time: '08:30', cat: 'Macro Data',   c: T.fed,   imp: 5, title: 'US GDP · Q1 Advance',          ex: { btc: +1, oil: 0, spx: +1 } },
    { date: '2026-04-30', time: '16:00', cat: 'Earnings',     c: T.earn,  imp: 4, title: 'MSTR · Q1 Earnings',           ex: { btc: +1, oil: 0, spx: 0 } },
    { date: '2026-05-01', time: '08:30', cat: 'Macro Data',   c: T.fed,   imp: 4, title: 'Non-Farm Payrolls',            ex: { btc: +1, oil: 0, spx: +1 } },
    { date: '2026-05-01', time: '00:00', cat: 'Trump Policy', c: T.trump, imp: 4, title: 'China EV Battery Tariff · Eff.', ex: { btc: -1, oil: 0, spx: -1 } },
    { date: '2026-05-05', time: '14:00', cat: 'Geopolitical', c: T.geo,   imp: 3, title: 'G7 Foreign Ministers · Hormuz', ex: { btc: 0, oil: -1, spx: 0 } },
    { date: '2026-05-07', time: '10:00', cat: 'BTC Inst',     c: T.inst,  imp: 3, title: 'SEC · Spot ETH ETF Review',    ex: { btc: +1, oil: 0, spx: 0 } },
    { date: '2026-05-08', time: '09:00', cat: 'OPEC',         c: T.oil,   imp: 5, title: 'OPEC+ Ministerial Meeting',    ex: { btc: 0, oil: +1, spx: 0 }, pulse: true },
    { date: '2026-05-13', time: '08:30', cat: 'Macro Data',   c: T.fed,   imp: 4, title: 'CPI · April',                  ex: { btc: +1, oil: 0, spx: +1 } },
    { date: '2026-05-14', time: '00:00', cat: 'BTC Inst',     c: T.inst,  imp: 2, title: 'Bitcoin Conference · Miami',   ex: { btc: +1, oil: 0, spx: 0 } },
    { date: '2026-05-15', time: '16:00', cat: 'Earnings',     c: T.earn,  imp: 3, title: 'COIN · Q1 Earnings',           ex: { btc: +1, oil: 0, spx: +1 } },
  ];

  // View + selection state
  const [view, setView] = React.useState('Month');      // Month | Week | Agenda
  const [selectedDate, setSelectedDate] = React.useState('2026-04-22'); // default FOMC
  const [activeCats, setActiveCats] = React.useState(null); // null = all, or Set of cat labels
  const [monthShift, setMonthShift] = React.useState(0); // 0 = base (Apr-May)
  const [customEvents, setCustomEvents] = React.useState([]); // user-added via "+ Add Event"

  // LIVE — pull Finnhub economic + earnings calendar for next 30d and transform to event shape
  const liveHook = (window.useAutoUpdate || (() => ({ data: null })))(
    'calendar-live',
    async () => {
      const key = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';
      if (!key) return null;
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const toDt = new Date(today.getTime() + 30 * 86400000);
      const to = toDt.toISOString().slice(0, 10);

      // importance: Finnhub impact strings → 2/3/5 (low/medium/high). Numeric 0-3 also handled.
      const impactToImp = (v) => {
        if (typeof v === 'number') return v >= 3 ? 5 : v === 2 ? 3 : 2;
        const s = String(v || '').toLowerCase();
        if (s.indexOf('high') >= 0) return 5;
        if (s.indexOf('medium') >= 0) return 3;
        return 2;
      };

      // Classify a macro/economic event into cat/c/ex/imp/title
      const classifyEcon = (e) => {
        const raw = (e.event || e.title || '').trim();
        const up = raw.toUpperCase();
        const country = (e.country || '').toUpperCase();
        // Filter non-US unless it's OPEC/Crude-related
        if (country && country !== 'US' && !/OPEC|CRUDE|OIL/.test(up)) return null;

        let cat = 'Macro Data', c = T.fed, imp = impactToImp(e.impact);
        let ex = { btc: 0, oil: 0, spx: 0 };

        if (/FOMC|FED FUNDS|FEDERAL FUNDS|RATE DECISION|POWELL|FED CHAIR/.test(up)) {
          cat = 'Fed'; c = T.fed; imp = Math.max(imp, 5);
          ex = { btc: +1, oil: +1, spx: +1 };
        } else if (/\bCPI\b|CORE PCE|\bPCE\b|NON-?FARM|NONFARM|PAYROLLS|\bPPI\b|\bGDP\b/.test(up)) {
          cat = 'Macro Data'; c = T.fed; imp = Math.max(imp, 4);
          ex = { btc: +1, oil: 0, spx: +1 };
        } else if (/OPEC|CRUDE|OIL INVENTOR|EIA/.test(up)) {
          cat = 'Oil'; c = T.oil;
          ex = { btc: 0, oil: -1, spx: 0 };
        }

        // Time: Finnhub economic events often only have a date, sometimes actual/estimate at release time.
        const timeRaw = e.time || '';
        const time = /^\d{2}:\d{2}/.test(timeRaw) ? timeRaw.slice(0, 5) : '08:30';
        const date = (e.time && /^\d{4}-\d{2}-\d{2}/.test(e.time)) ? e.time.slice(0, 10) : (e.date || '').slice(0, 10);
        if (!date) return null;

        return {
          date, time, cat, c, imp, title: raw || 'Economic Release', ex,
          _live: true,
        };
      };

      // Classify an earnings event — only surface the watchlist tickers the trader cares about
      const EARN_WATCH = ['NVDA', 'MSTR', 'COIN', 'IBIT', 'MARA'];
      const classifyEarn = (e) => {
        const sym = (e.symbol || '').toUpperCase();
        if (!sym || EARN_WATCH.indexOf(sym) === -1) return null;
        const date = (e.date || '').slice(0, 10);
        if (!date) return null;
        const hour = (e.hour || '').toLowerCase(); // 'bmo' | 'amc' | 'dmh' | ''
        const time = hour === 'bmo' ? '08:00' : hour === 'amc' ? '16:00' : '16:00';
        const ex = sym === 'NVDA' ? { btc: +1, oil: 0, spx: +1 }
                 : sym === 'MSTR' ? { btc: +1, oil: 0, spx: 0 }
                 : sym === 'COIN' ? { btc: +1, oil: 0, spx: +1 }
                 : { btc: +1, oil: 0, spx: 0 };
        return {
          date, time, cat: 'Earnings', c: T.earn, imp: 4,
          title: `${sym} · Q${e.quarter || ''} Earnings`.replace('Q · ', ' · '),
          ex, _live: true,
        };
      };

      const urls = {
        econ: `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`,
        earn: `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
      };
      const [econRes, earnRes] = await Promise.all([
        fetch(urls.econ).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(urls.earn).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const econList = (econRes && econRes.economicCalendar) || [];
      const earnList = (earnRes && earnRes.earningsCalendar) || [];

      const transformed = [
        ...econList.map(classifyEcon).filter(Boolean),
        ...earnList.map(classifyEarn).filter(Boolean),
      ];
      return transformed.length ? transformed : null;
    },
    { refreshKey: 'calendar' }
  );
  const liveEvents = liveHook && liveHook.data;
  const liveOn = !!(liveEvents && liveEvents.length);

  // Merge live + hardcoded + user-added. De-dupe by (date + normalized-title-keyword) — prefer live.
  const events = React.useMemo(() => {
    const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
    const keyFor = (e) => `${e.date}|${norm(e.title)}`;
    // Also match looser: date + shared category root word for "FOMC Rate Decision" vs "Fed Funds Target Rate"
    const looseTag = (e) => {
      const up = (e.title || '').toUpperCase();
      if (/FOMC|FED FUNDS|RATE DECISION/.test(up)) return `${e.date}|FED_RATE`;
      if (/\bCPI\b/.test(up)) return `${e.date}|CPI`;
      if (/\bPPI\b/.test(up)) return `${e.date}|PPI`;
      if (/NON.?FARM|PAYROLLS/.test(up)) return `${e.date}|NFP`;
      if (/\bGDP\b/.test(up)) return `${e.date}|GDP`;
      if (/OPEC/.test(up)) return `${e.date}|OPEC`;
      if (/EIA|CRUDE INVENT/.test(up)) return `${e.date}|EIA`;
      const sym = (up.match(/^([A-Z]{2,5})\s*·/) || [])[1];
      if (sym) return `${e.date}|SYM_${sym}`;
      return null;
    };
    const seen = new Set();
    const looseSeen = new Set();
    const out = [];
    const pushIfNew = (e) => {
      const k = keyFor(e);
      const lt = looseTag(e);
      if (seen.has(k)) return;
      if (lt && looseSeen.has(lt)) return;
      seen.add(k);
      if (lt) looseSeen.add(lt);
      out.push(e);
    };
    // Live first so they take priority on de-dupe
    (liveEvents || []).forEach(pushIfNew);
    baseEvents.forEach(pushIfNew);
    customEvents.forEach(pushIfNew);
    // sort by date then time
    out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return out;
  }, [liveEvents, customEvents]);

  // Event derived from selected date — picks highest-importance event that day
  const selected = React.useMemo(() => {
    const dayEvents = events.filter(e => e.date === selectedDate);
    if (!dayEvents.length) return null;
    return dayEvents.sort((a, b) => b.imp - a.imp)[0];
  }, [selectedDate, events]);

  const toggleCat = (label) => {
    setActiveCats(prev => {
      const cur = prev ? new Set(prev) : new Set();
      if (cur.has(label)) cur.delete(label); else cur.add(label);
      return cur.size === 0 ? null : cur;
    });
  };
  const catActive = (label) => !activeCats || activeCats.has(label);

  const eventsByDate = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  // Days-until helper
  const daysUntil = (d) => Math.ceil((new Date(d) - new Date(todayStr)) / 86400000);

  const ImportanceDots = ({ n, size = 3 }) => (
    <div style={{ display: 'flex', gap: 2 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: size, height: size, borderRadius: size / 2,
          background: i < n ? T.signal : 'rgba(255,255,255,0.10)',
        }} />
      ))}
    </div>
  );

  const DirArrow = ({ v, c }) => {
    if (v === 0) return <span style={{ color: T.textDim, fontFamily: T.mono, fontSize: 11 }}>—</span>;
    return (
      <span style={{ color: c, fontFamily: T.mono, fontSize: 12, fontWeight: 600 }}>
        {v > 0 ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`,
        background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="GG"
          style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(201,162,39,0.25))' }} />
        <div style={{ marginLeft: 10, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 600, color: T.signal, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: T.mono }}>Global Gauntlet</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>
        </div>

        <div style={{
          marginLeft: 32, display: 'flex', padding: 3,
          background: T.ink200, borderRadius: 10, border: `1px solid ${T.edge}`,
          height: 34, alignItems: 'center',
        }}>
          {['Historical', 'Projected', 'Impact', 'Recommend', 'News', 'Calendar', 'Signals'].map((t, idx) => {
            const active = idx === 5;
            return (
              <div key={t} onClick={() => !active && onNav && onNav(t === 'Recommend' ? 'recommend' : t.toLowerCase())} style={{
                cursor: active ? 'default' : 'pointer',
                padding: '0 13px', height: 28, display: 'flex', alignItems: 'center',
                fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                background: active ? T.ink400 : 'transparent',
                color: active ? T.text : T.textMid,
                boxShadow: active ? `inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)` : 'none',
              }}>{t}</div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          {liveOn && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 6,
              background: 'rgba(111,207,142,0.10)',
              border: '1px solid rgba(111,207,142,0.35)',
              fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
              color: '#6FCF8E', letterSpacing: 0.7, textTransform: 'uppercase',
            }} title={`Live Finnhub calendar · ${liveEvents.length} upcoming events`}>
              <div style={{
                width: 5, height: 5, borderRadius: 3, background: '#6FCF8E',
                boxShadow: '0 0 6px rgba(111,207,142,0.8)',
              }} />
              LIVE · Finnhub
            </div>
          )}
          <TRLiveStripInline />
          <TRGearInline />
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            SUN · APR 19 · 2026
          </div>
          <div onClick={() => window.openTRSettings && window.openTRSettings()} title="Settings · refresh · API keys" style={{
            width: 28, height: 28, borderRadius: 7, background: T.ink200,
            border: `1px solid ${T.edge}`, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center', gap: 3, cursor: 'pointer',
          }}>
            <div style={{ width: 12, height: 1, background: T.textMid }} />
            <div style={{ width: 12, height: 1, background: T.textMid }} />
            <div style={{ width: 12, height: 1, background: T.textMid }} />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        height: 50, display: 'flex', alignItems: 'center',
        padding: '0 28px', gap: 20,
        borderBottom: `1px solid ${T.edge}`, background: T.ink000,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            fontSize: 18, fontWeight: 500, color: T.text, letterSpacing: -0.3,
          }}>April — May 2026</div>
          <div style={{
            display: 'flex', gap: 4, marginLeft: 8,
          }}>
            {[{ s: '‹', d: -1 }, { s: '›', d: 1 }].map(btn => (
              <div key={btn.s}
                onClick={() => setMonthShift(prev => prev + btn.d)}
                style={{
                  width: 24, height: 24, borderRadius: 5,
                  background: T.ink200, border: `1px solid ${T.edge}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.textMid, fontSize: 13, cursor: 'pointer',
                }}>{btn.s}</div>
            ))}
          </div>
          <div
            onClick={() => { setMonthShift(0); setSelectedDate(todayStr); }}
            style={{
              height: 24, padding: '0 10px', display: 'flex', alignItems: 'center',
              background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 5,
              fontSize: 10, color: T.textMid, letterSpacing: 0.5, marginLeft: 6,
              fontFamily: T.mono, cursor: 'pointer',
            }}>TODAY</div>
        </div>

        <div style={{ width: 1, height: 22, background: T.edge }} />

        {/* View pill */}
        <div style={{
          display: 'flex', padding: 3, background: T.ink200,
          border: `1px solid ${T.edge}`, borderRadius: 9, height: 28,
        }}>
          {['Month', 'Week', 'Agenda'].map(label => {
            const active = view === label;
            return (
              <div key={label}
                onClick={() => setView(label)}
                style={{
                  padding: '0 12px', height: 22, display: 'flex',
                  alignItems: 'center', fontSize: 11, fontWeight: 500,
                  color: active ? T.ink000 : T.textMid,
                  background: active ? T.signal : 'transparent',
                  borderRadius: 6, letterSpacing: 0.2,
                  cursor: active ? 'default' : 'pointer',
                }}>{label}</div>
            );
          })}
        </div>

        {/* Category filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[
            { label: 'Fed',     c: T.fed,   n: 4 },
            { label: 'Geo',     c: T.geo,   n: 2 },
            { label: 'Earn',    c: T.earn,  n: 3 },
            { label: 'Oil',     c: T.oil,   n: 2 },
            { label: 'Reg',     c: T.reg,   n: 1 },
            { label: 'Trump',   c: T.trump, n: 1 },
          ].map(c => {
            const on = catActive(c.label);
            return (
              <div key={c.label}
                onClick={() => toggleCat(c.label)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 8px',
                  background: on ? T.ink200 : T.ink100,
                  border: `1px solid ${on ? T.edge : 'transparent'}`,
                  borderRadius: 6,
                  opacity: on ? 1 : 0.4, cursor: 'pointer',
                  transition: 'opacity 120ms cubic-bezier(0.2,0.7,0.2,1)',
                }}>
                <div style={{ width: 5, height: 5, borderRadius: 2.5, background: c.c }} />
                <div style={{ fontSize: 11, color: T.textMid, fontWeight: 500 }}>{c.label}</div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginLeft: 2 }}>{c.n}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <div
            onClick={() => {
              const title = window.prompt('Event title');
              if (!title) return;
              const time = window.prompt('Time (HH:MM ET, 24h)', '14:00') || '14:00';
              setCustomEvents(prev => prev.concat([{
                date: selectedDate, time, cat: 'Custom', c: T.signal, imp: 3,
                title, ex: { btc: 0, oil: 0, spx: 0 },
              }]));
            }}
            style={{
              height: 28, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6,
              background: T.signal, color: T.ink000, borderRadius: 7,
              fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3)',
              cursor: 'pointer',
            }}>
            + Add Event
          </div>
        </div>
      </div>

      {/* Body: calendar grid + detail rail */}
      <div style={{ display: 'flex', height: H - 52 - 50 }}>
        {/* Calendar grid */}
        <div style={{
          flex: 1, background: T.ink000, padding: '16px 20px 16px 28px',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Weekday header */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6, marginBottom: 8,
          }}>
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => (
              <div key={d} style={{
                fontSize: 9, letterSpacing: 1, color: T.textDim,
                fontWeight: 500, padding: '0 6px',
              }}>{d}</div>
            ))}
          </div>

          {/* Weeks */}
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateRows: `repeat(${weeks.length}, 1fr)`,
            gap: 6,
          }}>
            {weeks.map((days, wIdx) => (
              <div key={wIdx} style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6,
              }}>
                {days.map((dt) => {
                  const key = iso(dt);
                  const allDayEvents = eventsByDate[key] || [];
                  const catMap = { 'Fed': 'Fed', 'Macro Data': 'Fed', 'Geopolitical': 'Geo', 'Earnings': 'Earn',
                                    'Oil': 'Oil', 'OPEC': 'Oil', 'Regulatory': 'Reg', 'Trump Policy': 'Trump',
                                    'BTC Inst': 'Trump' };
                  const dayEvents = allDayEvents.filter(ev => catActive(catMap[ev.cat] || ev.cat));
                  const isToday = key === todayStr;
                  const isPast = key < todayStr;
                  const isSelected = key === selectedDate;
                  return (
                    <div key={key}
                      onClick={() => setSelectedDate(key)}
                      style={{
                      background: isSelected ? T.ink300 : (isToday ? 'rgba(232,184,74,0.05)' : T.ink100),
                      border: `1px solid ${isSelected ? T.edgeHi : (isToday ? 'rgba(232,184,74,0.3)' : T.edge)}`,
                      borderRadius: 8, padding: '8px 9px', minHeight: 0,
                      opacity: isPast ? 0.45 : 1,
                      boxShadow: isSelected ? 'inset 0 0.5px 0 rgba(255,255,255,0.08)' : 'none',
                      display: 'flex', flexDirection: 'column', gap: 4,
                      overflow: 'hidden', cursor: 'pointer',
                      transition: 'background 120ms cubic-bezier(0.2,0.7,0.2,1)',
                    }}>
                      {/* Date row */}
                      <div style={{
                        display: 'flex', alignItems: 'center', marginBottom: 2,
                      }}>
                        <div style={{
                          fontFamily: T.mono, fontSize: 11, fontWeight: 500,
                          color: isToday ? T.signal : T.text,
                          letterSpacing: 0.2,
                        }}>{dt.getDate()}</div>
                        {isToday && (
                          <div style={{
                            marginLeft: 'auto', fontSize: 8.5, fontWeight: 600,
                            color: T.signal, letterSpacing: 0.6, fontFamily: T.mono,
                          }}>TODAY</div>
                        )}
                        {!isToday && dayEvents.length > 0 && (
                          <div style={{ marginLeft: 'auto' }}>
                            <ImportanceDots
                              n={Math.max(...dayEvents.map(e => e.imp))}
                              size={3}
                            />
                          </div>
                        )}
                      </div>

                      {/* Event chips */}
                      {dayEvents.slice(0, 3).map((e, idx) => {
                        const isSel = selected && e === selected;
                        return (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 5px',
                            background: isSel ? 'rgba(232,184,74,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `0.5px solid ${isSel ? 'rgba(232,184,74,0.4)' : T.edge}`,
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: 4, height: 4, borderRadius: 2, background: e.c, flexShrink: 0,
                            }} />
                            <div style={{
                              fontSize: 9.5, fontWeight: 500,
                              color: isSel ? T.signal : T.text,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              letterSpacing: 0.05,
                            }}>{e.title}</div>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div style={{
                          fontFamily: T.mono, fontSize: 9, color: T.textDim,
                          padding: '0 5px', letterSpacing: 0.3,
                        }}>+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Detail rail */}
        <div style={{
          width: 360, background: T.ink100, borderLeft: `1px solid ${T.edge}`,
          padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16,
          overflow: 'hidden',
        }}>
          {/* Selected event */}
          <div>
            <div style={{
              fontSize: 10, letterSpacing: 1, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500, marginBottom: 10,
            }}>Selected · {new Date(selectedDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>

            {!selected && (
              <div style={{
                background: T.ink200, border: `1px solid ${T.edge}`,
                borderRadius: 12, padding: '22px 18px',
                fontSize: 12, color: T.textMid, letterSpacing: 0.2,
              }}>No scheduled events on this day. Click a day with an event dot to preview.</div>
            )}

            {selected && <div style={{
              background: T.ink200, border: `1px solid ${T.edgeHi}`,
              borderRadius: 12, padding: '16px 18px',
              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.06)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: selected.c }} />
                <div style={{
                  fontSize: 9.5, fontWeight: 500, letterSpacing: 0.8,
                  color: T.textMid, textTransform: 'uppercase',
                }}>{selected.cat}</div>
                <div style={{ marginLeft: 'auto' }}>
                  <ImportanceDots n={selected.imp} size={4} />
                </div>
              </div>

              <div style={{
                fontSize: 16, fontWeight: 500, color: T.text,
                letterSpacing: -0.2, marginBottom: 8, lineHeight: 1.25,
              }}>{selected.title}</div>

              <div style={{
                display: 'flex', gap: 16, marginBottom: 14,
                fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.3,
              }}>
                <span>{selected.time} ET</span>
                <span style={{ color: T.signal }}>IN {daysUntil(selected.date)}D</span>
              </div>

              {/* Expected direction on three assets */}
              <div style={{
                borderTop: `1px solid ${T.edge}`, paddingTop: 12,
              }}>
                <div style={{
                  fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                  textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
                }}>Expected Direction · On Hawkish Beat</div>
                <div style={{ display: 'flex', gap: 0 }}>
                  {[
                    { label: 'BTC', v: selected.ex.btc, c: T.btc },
                    { label: 'OIL', v: selected.ex.oil, c: T.oil },
                    { label: 'SPX', v: selected.ex.spx, c: T.spx },
                  ].map((r, idx) => (
                    <div key={r.label} style={{
                      flex: 1, paddingLeft: idx === 0 ? 0 : 12,
                      borderLeft: idx === 0 ? 'none' : `1px solid ${T.edge}`,
                    }}>
                      <div style={{
                        fontSize: 8.5, letterSpacing: 0.8, color: T.textDim,
                        textTransform: 'uppercase', marginBottom: 4,
                      }}>{r.label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <DirArrow v={r.v} c={r.c} />
                        <span style={{
                          fontFamily: T.mono, fontSize: 11, color: T.textMid,
                        }}>{r.v === 0 ? 'neutral' : r.v > 0 ? 'bullish' : 'bearish'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prediction market */}
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: T.ink300, border: `0.5px solid ${T.edge}`,
                borderRadius: 7,
              }}>
                <div style={{
                  fontSize: 8.5, letterSpacing: 0.8, color: T.textDim,
                  textTransform: 'uppercase', fontWeight: 500, marginBottom: 4,
                }}>KALSHI · 25bp CUT</div>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 6,
                }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 18, fontWeight: 500, color: T.signal,
                    letterSpacing: -0.3,
                  }}>38%</div>
                  <div style={{
                    fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 0.3,
                  }}>+4 from last week</div>
                </div>
              </div>
            </div>}
          </div>

          {/* Upcoming this week */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 10, letterSpacing: 1, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500, marginBottom: 10,
            }}>This Week · 5 Events</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events
                .filter(e => {
                  const du = daysUntil(e.date);
                  return du >= 0 && du <= 7;
                })
                .map((e, idx) => (
                  <div key={idx}
                    onClick={() => setSelectedDate(e.date)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 11px',
                      background: e.date === selectedDate ? T.ink300
                                : e.pulse ? 'rgba(232,184,74,0.05)' : T.ink200,
                      border: `0.5px solid ${e.date === selectedDate ? T.edgeHi
                                : e.pulse ? 'rgba(232,184,74,0.3)' : T.edge}`,
                      borderRadius: 7, cursor: 'pointer',
                      transition: 'background 120ms cubic-bezier(0.2,0.7,0.2,1)',
                    }}>
                    <div style={{ width: 5, height: 5, borderRadius: 2.5, background: e.c, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 11.5, fontWeight: 500, color: T.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginBottom: 2,
                      }}>{e.title}</div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3,
                      }}>
                        {new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
                        &nbsp;·&nbsp;{e.time}
                      </div>
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                      color: daysUntil(e.date) <= 1 ? T.signal : T.textMid,
                      padding: '2px 6px', borderRadius: 4,
                      background: daysUntil(e.date) <= 1 ? 'rgba(232,184,74,0.12)' : 'rgba(255,255,255,0.03)',
                      letterSpacing: 0.3,
                    }}>
                      {daysUntil(e.date) === 0 ? 'TODAY' : daysUntil(e.date) === 1 ? 'TMRW' : `${daysUntil(e.date)}D`}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.CalendarScreen = CalendarScreen;
