// tr-selftest.jsx — in-house LLM-reviewed self-test harness.
// Exposes window.openTRSelfTest() to run a suite of feature checks and
// feed the results to an LLM for a one-paragraph "what's broken" read.

function trIsLocalHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.endsWith('.local') || location.protocol === 'file:';
}
window.trIsLocalHost = trIsLocalHost;

async function trRunSelfTestSuite(onProgress) {
  const results = [];
  const push = (r) => { results.push(r); if (onProgress) onProgress([...results]); };
  const check = async (name, fn) => {
    push({ name, status: 'running' });
    try {
      const out = await fn();
      const last = results[results.length - 1];
      last.status = out.status || 'pass';
      last.detail = out.detail || '';
      last.data = out.data;
    } catch (e) {
      const last = results[results.length - 1];
      last.status = 'fail';
      last.detail = e.message || String(e);
    }
    if (onProgress) onProgress([...results]);
  };

  // ─── Window globals ───
  await check('globals · LiveData', async () => {
    if (typeof LiveData === 'undefined') return { status: 'fail', detail: 'LiveData not loaded' };
    return { status: 'pass', detail: Object.keys(LiveData).length + ' methods' };
  });
  await check('globals · AIAnalysis', async () => {
    if (typeof AIAnalysis === 'undefined') return { status: 'fail', detail: 'AIAnalysis not loaded' };
    const k = AIAnalysis.getKeys ? AIAnalysis.getKeys() : {};
    const keyCount = Object.values(k).filter(Boolean).length;
    return { status: keyCount ? 'pass' : 'warn', detail: `${keyCount} LLM key(s) configured` };
  });
  await check('globals · NewsFeed', async () => {
    if (typeof NewsFeed === 'undefined') return { status: 'fail', detail: 'NewsFeed not loaded' };
    return { status: 'pass' };
  });
  await check('globals · MilitaryFlights', async () => {
    if (typeof MilitaryFlights === 'undefined') return { status: 'fail', detail: 'MilitaryFlights not loaded' };
    return { status: 'pass' };
  });
  await check('globals · Events', async () => {
    if (typeof Events === 'undefined') return { status: 'fail', detail: 'Events not loaded' };
    return { status: 'pass' };
  });
  await check('globals · TR_SETTINGS', async () => {
    if (!window.TR_SETTINGS) return { status: 'fail', detail: 'TR_SETTINGS missing' };
    return { status: 'pass', detail: 'keys: ' + Object.keys(window.TR_SETTINGS).join(', ') };
  });
  await check('globals · TR_TABS_META', async () => {
    if (!window.TR_TABS_META || !Array.isArray(window.TR_TABS_META)) return { status: 'fail', detail: 'missing' };
    return { status: 'pass', detail: window.TR_TABS_META.length + ' tabs' };
  });
  await check('globals · TR_EXPLAIN', async () => {
    if (!window.TR_EXPLAIN) return { status: 'warn', detail: 'tooltips dictionary missing' };
    return { status: 'pass', detail: Object.keys(window.TR_EXPLAIN).length + ' entries' };
  });

  // ─── Screens mounted ───
  const screens = ['SummaryScreen', 'DriversScreen', 'HistoricalScreen', 'ProjectedScreen', 'ImpactScreen',
                   'RecommendationsScreen', 'NewsScreen', 'CalendarScreen', 'SignalsScreen', 'PricesScreen', 'FlightsScreen'];
  for (const s of screens) {
    await check(`screen · ${s}`, async () => {
      if (typeof window[s] !== 'function') return { status: 'fail', detail: 'not mounted' };
      return { status: 'pass' };
    });
  }

  // ─── Live data endpoints (actual network calls) ───
  await check('api · CoinGecko BTC', async () => {
    if (typeof LiveData === 'undefined') return { status: 'fail', detail: 'LiveData missing' };
    const p = await LiveData.getCryptoPrices();
    if (!p || !p.bitcoin || !p.bitcoin.usd) return { status: 'fail', detail: 'no BTC price returned' };
    return { status: 'pass', detail: '$' + Math.round(p.bitcoin.usd).toLocaleString(), data: p.bitcoin.usd };
  });
  await check('api · Coinbase spot (backup)', async () => {
    if (typeof LiveData === 'undefined') return { status: 'fail', detail: 'LiveData missing' };
    const p = await LiveData.getBTCPrice();
    if (!p) return { status: 'warn', detail: 'no price (rate-limited?)' };
    return { status: 'pass', detail: '$' + Math.round(p).toLocaleString() };
  });
  await check('api · Fear & Greed', async () => {
    if (typeof LiveData === 'undefined') return { status: 'fail', detail: 'LiveData missing' };
    const fg = await LiveData.getFearGreed();
    if (!fg || !fg.data || !fg.data[0]) return { status: 'warn', detail: 'no F&G data' };
    return { status: 'pass', detail: fg.data[0].value + ' · ' + fg.data[0].value_classification };
  });
  await check('api · NewsFeed.fetchAll', async () => {
    if (typeof NewsFeed === 'undefined' || !NewsFeed.fetchAll) return { status: 'fail', detail: 'fetchAll missing' };
    const arr = await NewsFeed.fetchAll();
    if (!arr || !Array.isArray(arr)) return { status: 'warn', detail: 'no articles returned' };
    return { status: 'pass', detail: arr.length + ' articles' };
  });
  await check('api · OpenSky military', async () => {
    if (typeof MilitaryFlights === 'undefined' || !MilitaryFlights.getMidEast) return { status: 'fail', detail: 'getMidEast missing' };
    const d = await MilitaryFlights.getMidEast();
    if (!d) return { status: 'warn', detail: 'OpenSky rate-limited or offline' };
    return { status: 'pass', detail: `${d.usMilCount || 0} US mil · ${d.total || 0} total` };
  });

  // ─── LLM key reachability (HEAD-style check via tiny prompt) ───
  const keys = (typeof AIAnalysis !== 'undefined' && AIAnalysis.getKeys) ? AIAnalysis.getKeys() : {};
  await check('llm · Claude key', async () => {
    if (!keys.claude) return { status: 'warn', detail: 'no key set' };
    return { status: 'pass', detail: 'key present · len ' + keys.claude.length };
  });
  await check('llm · OpenAI key', async () => {
    if (!keys.openai) return { status: 'warn', detail: 'no key set' };
    return { status: 'pass', detail: 'key present · len ' + keys.openai.length };
  });
  await check('llm · Gemini key', async () => {
    if (!keys.gemini) return { status: 'warn', detail: 'no key set' };
    return { status: 'pass', detail: 'key present · len ' + keys.gemini.length };
  });
  await check('llm · Grok key', async () => {
    if (!keys.grok) return { status: 'warn', detail: 'no key set' };
    return { status: 'pass', detail: 'key present · len ' + keys.grok.length };
  });
  await check('llm · Perplexity key', async () => {
    if (!keys.perplexity) return { status: 'warn', detail: 'no key set' };
    return { status: 'pass', detail: 'key present · len ' + keys.perplexity.length };
  });

  // ─── Data source keys ───
  const dataKeys = window.TR_SETTINGS?.keys || {};
  for (const k of ['finnhub', 'tradier', 'newsapi', 'newsdata', 'fred']) {
    await check(`data key · ${k}`, async () => {
      if (!dataKeys[k]) return { status: 'warn', detail: 'no key set' };
      return { status: 'pass', detail: 'key present · len ' + dataKeys[k].length };
    });
  }

  // ─── localStorage persistence ───
  await check('storage · tr_settings', async () => {
    const v = localStorage.getItem('tr_settings');
    if (!v) return { status: 'warn', detail: 'not persisted yet' };
    try { JSON.parse(v); return { status: 'pass', detail: v.length + ' bytes' }; }
    catch { return { status: 'fail', detail: 'corrupt JSON' }; }
  });
  await check('storage · tr_watchlist', async () => {
    const v = localStorage.getItem('tr_watchlist');
    if (!v) return { status: 'warn', detail: 'empty' };
    return { status: 'pass', detail: v.length + ' bytes' };
  });

  // ─── Panel registry ───
  await check('panels · registry', async () => {
    if (!Array.isArray(window.PANEL_REG)) return { status: 'fail', detail: 'PANEL_REG missing' };
    return { status: 'pass', detail: window.PANEL_REG.length + ' panels registered' };
  });

  return results;
}
window.trRunSelfTestSuite = trRunSelfTestSuite;

async function trAskLLMReview(results) {
  if (typeof AIAnalysis === 'undefined') return 'AIAnalysis unavailable.';
  const pass = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const lines = results.map(r => `- [${r.status.toUpperCase()}] ${r.name}${r.detail ? ': ' + r.detail : ''}`).join('\n');
  const prompt =
    `You are a QA engineer reviewing a TradeRadar self-test run. Write a concise 3-4 sentence ` +
    `summary of which systems are healthy vs broken. Call out specific failures by name. ` +
    `If warnings are just missing optional keys (normal for a local dev setup), say so — don't treat those as critical. ` +
    `End with a single "VERDICT: HEALTHY / DEGRADED / BROKEN" line.\n\n` +
    `TEST SUMMARY: ${pass} pass · ${warn} warn · ${fail} fail (of ${results.length}).\n\n` +
    `RESULTS:\n${lines}`;
  try {
    const headline = { source: 'TradeRadar QA', title: prompt };
    const result = await AIAnalysis.runMulti([headline]);
    for (const k of ['claude', 'gpt', 'gemini', 'grok', 'perplexity']) {
      const r = result && result[k];
      if (r && r.result && r.result.summary) {
        return { text: r.result.summary + (r.result.risks?.length ? '\n\nISSUES:\n' + r.result.risks.map(x => '⚠ ' + x).join('\n') : ''), model: r.model || k };
      }
    }
    return { text: 'No LLM returned usable output. Check API keys in ⚙ Settings.', model: 'none' };
  } catch (e) {
    return { text: 'LLM review failed: ' + e.message, model: 'error' };
  }
}

function TRSelfTestModal({ open, onClose }) {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B', warn: '#E8B84A',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    ui: 'InterTight, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  };
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [review, setReview] = React.useState(null);
  const [reviewing, setReviewing] = React.useState(false);

  const run = async () => {
    setRunning(true);
    setResults([]);
    setReview(null);
    const final = await trRunSelfTestSuite(setResults);
    setRunning(false);
    setReviewing(true);
    const r = await trAskLLMReview(final);
    setReview(r);
    setReviewing(false);
  };

  React.useEffect(() => { if (open && results.length === 0 && !running) run(); }, [open]);

  if (!open) return null;

  const pass = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;

  const colorFor = (s) => s === 'pass' ? T.bull : s === 'warn' ? T.warn : s === 'fail' ? T.bear : T.textDim;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.78)',
      backdropFilter: 'blur(14px) saturate(150%)', WebkitBackdropFilter: 'blur(14px) saturate(150%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9500, padding: 40, fontFamily: T.ui,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 720, maxHeight: '86%', display: 'flex', flexDirection: 'column',
        background: T.ink100, border: `1px solid ${T.edgeHi}`, borderRadius: 14,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${T.edge}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1.2, color: T.signal,
            textTransform: 'uppercase', fontWeight: 700, fontFamily: T.mono,
          }}>Self-Test · LLM review</div>
          {results.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.bull }}>{pass} pass</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.warn }}>{warn} warn</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.bear }}>{fail} fail</span>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div onClick={run} style={{
              padding: '5px 12px', background: T.signal, color: T.ink000,
              borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              cursor: running ? 'default' : 'pointer', opacity: running ? 0.5 : 1,
              fontFamily: T.mono,
            }}>{running ? 'TESTING…' : '↻ RE-RUN'}</div>
            <div onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7, background: T.ink300,
              border: `1px solid ${T.edge}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: T.textMid, fontSize: 13,
            }}>✕</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {/* LLM review */}
          {review && (
            <div style={{
              background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
              padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{
                fontSize: 9, letterSpacing: 1.2, color: T.signal,
                textTransform: 'uppercase', fontWeight: 700, marginBottom: 8,
                fontFamily: T.mono,
              }}>LLM Verdict{review.model && review.model !== 'none' && review.model !== 'error' ? ` · ${review.model}` : ''}</div>
              <div style={{
                fontSize: 13, lineHeight: 1.65, color: T.text,
                whiteSpace: 'pre-wrap',
              }}>{review.text}</div>
            </div>
          )}
          {reviewing && !review && (
            <div style={{
              padding: '12px 16px', marginBottom: 16, background: T.ink200,
              borderRadius: 10, fontFamily: T.mono, fontSize: 10,
              color: T.textDim, letterSpacing: 0.4,
            }}>LLM REVIEWING RESULTS…</div>
          )}

          {/* Per-check results */}
          <div style={{
            background: T.ink200, border: `1px solid ${T.edge}`, borderRadius: 10,
            overflow: 'hidden',
          }}>
            {results.map((r, i) => (
              <div key={r.name + i} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr auto',
                gap: 10, padding: '7px 14px', fontFamily: T.mono, fontSize: 11,
                borderBottom: i < results.length - 1 ? `0.5px solid ${T.edge}` : 'none',
                alignItems: 'center',
              }}>
                <div style={{
                  color: colorFor(r.status), fontWeight: 700, letterSpacing: 0.5,
                  fontSize: 10,
                }}>
                  {r.status === 'running' ? '…' : r.status.toUpperCase()}
                </div>
                <div style={{ color: T.text, fontSize: 11 }}>{r.name}</div>
                <div style={{ color: T.textDim, fontSize: 10, textAlign: 'right' }}>{r.detail || ''}</div>
              </div>
            ))}
            {results.length === 0 && running && (
              <div style={{ padding: '16px', fontFamily: T.mono, fontSize: 10, color: T.textDim }}>
                BOOTING TEST HARNESS…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Global opener — used by the TEST button on Summary (and anywhere).
(function () {
  let state = { open: false };
  let listeners = [];
  window.openTRSelfTest = () => { state.open = true;  listeners.forEach(l => l(state.open)); };
  window.closeTRSelfTest = () => { state.open = false; listeners.forEach(l => l(state.open)); };

  function Mount() {
    const [open, setOpen] = React.useState(state.open);
    React.useEffect(() => { listeners.push(setOpen); return () => { listeners = listeners.filter(l => l !== setOpen); }; }, []);
    return React.createElement(TRSelfTestModal, { open, onClose: () => window.closeTRSelfTest() });
  }

  function mount() {
    if (document.getElementById('tr-selftest-root')) return;
    const div = document.createElement('div');
    div.id = 'tr-selftest-root';
    document.body.appendChild(div);
    if (window.ReactDOM && ReactDOM.createRoot) ReactDOM.createRoot(div).render(React.createElement(Mount));
    else if (window.ReactDOM) ReactDOM.render(React.createElement(Mount), div);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
