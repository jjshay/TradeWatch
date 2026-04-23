// SummaryScreen — Tab 1 (new landing page): today's catalyst read.
// - Top strip: live BTC, WTI, F&G with delta
// - Today's news: top 6 Mideast/crypto/macro headlines
// - Three LLMs side-by-side: Claude / ChatGPT / Gemini year-end BTC predictions
//   with 3 bullets each and a consensus block below
// - Each prediction compared to the last-saved snapshot to show DELTA

const suT = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
  btc: '#F7931A', oil: '#0077B5',
  claude: '#D97757', gpt: '#0077B5', gemini: '#4285F4',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// Persistent baseline — compare today's LLM outputs against the last snapshot
const PREDICTION_STORE_KEY = 'tr_last_predictions';
function loadLastPredictions() {
  try { return JSON.parse(localStorage.getItem(PREDICTION_STORE_KEY) || 'null'); } catch { return null; }
}
function saveLastPredictions(p) {
  try { localStorage.setItem(PREDICTION_STORE_KEY, JSON.stringify(p)); } catch {}
}

// Prompt sent to each LLM — asks for structured JSON we can parse for the
// year-end BTC price target + 3 bullets + year-end oil target.
function buildPrompt(headlines) {
  const hl = headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n');
  return `You are a macro/crypto analyst. Given current news context, predict the year-end price of Bitcoin and WTI Crude Oil for December 31. Base your prediction on the specific signals in the headlines below.

HEADLINES (last 24-48h):
${hl}

Respond in this exact JSON format (no markdown fences, raw JSON only):
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": 1-10,
  "summary": "2 sentence top-line read",
  "bitcoin_year_end_usd": <number>,
  "oil_year_end_usd": <number>,
  "three_bullets": ["bullet 1", "bullet 2", "bullet 3"],
  "risks": ["risk 1", "risk 2"]
}`;
}

async function callModel(which, headlines) {
  // Returns parsed prediction obj on success, { _error, _detail } on failure.
  if (typeof AIAnalysis === 'undefined') return { _error: 'engine-missing' };
  const keys = AIAnalysis.getKeys();
  const keyMap = { claude: keys.claude, gpt: keys.openai, gemini: keys.gemini };
  if (!keyMap[which]) return { _error: 'nokey' };
  const prompt = buildPrompt(headlines);
  try {
    let resp;
    if (which === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return { _error: `http-${r.status}`, _detail: detail.slice(0, 160) };
      }
      const j = await r.json();
      resp = j.content?.[0]?.text || '';
    } else if (which === 'gpt') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openai}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 1000 }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return { _error: `http-${r.status}`, _detail: detail.slice(0, 160) };
      }
      const j = await r.json();
      resp = j.choices?.[0]?.message?.content || '';
    } else if (which === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.gemini}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 1000 } }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return { _error: `http-${r.status}`, _detail: detail.slice(0, 160) };
      }
      const j = await r.json();
      resp = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    const cleaned = resp.replace(/^```json\s*|\s*```$/g, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      return { _error: 'parse', _detail: cleaned.slice(0, 160) };
    }
  } catch (e) { return { _error: 'network', _detail: (e && e.message) || String(e) }; }
}

function fmtPrice(n, prefix = '$') {
  if (n == null || !isFinite(n)) return '—';
  return `${prefix}${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtDelta(curr, prev) {
  if (curr == null || prev == null || !isFinite(curr) || !isFinite(prev)) return null;
  const d = curr - prev;
  const pct = (d / prev) * 100;
  return { d, pct, up: d >= 0 };
}

function PredictionCard({ brand, brandName, rec, prev, T }) {
  const hasError = !rec || rec._error;
  if (hasError) {
    const msg = !rec                       ? { title: 'No response yet', body: 'Click ↻ REFRESH to run.', tone: 'dim' }
              : rec._error === 'nokey'     ? { title: `No ${brandName} key`, body: 'Add it in ⚙ Settings → Core.', tone: 'dim' }
              : rec._error === 'parse'     ? { title: `${brandName} returned invalid JSON`, body: rec._detail || 'Response did not parse.', tone: 'bear' }
              : rec._error === 'network'   ? { title: `Network error · ${brandName}`, body: rec._detail || 'CORS, DNS or offline.', tone: 'bear' }
              : /^http-/.test(rec._error)  ? { title: `${brandName} ${rec._error.toUpperCase()}`, body: rec._detail || 'API refused the request.', tone: 'bear' }
              :                              { title: `${brandName} failed`, body: rec._error, tone: 'bear' };
    const toneColor = msg.tone === 'bear' ? T.bear : T.textDim;
    return (
      <div style={{
        background: T.ink200, border: `1px solid ${msg.tone === 'bear' ? `${T.bear}55` : T.edge}`, borderRadius: 10,
        padding: '16px 18px', minHeight: 280,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: 4, background: brand }} />
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{brandName}</div>
          {rec && rec._error && (
            <div style={{
              marginLeft: 'auto', padding: '2px 7px',
              background: `${toneColor}18`, border: `0.5px solid ${toneColor}55`,
              borderRadius: 4, fontFamily: T.mono, fontSize: 9, fontWeight: 600,
              color: toneColor, letterSpacing: 0.6,
            }}>{rec._error.toUpperCase()}</div>
          )}
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          gap: 8, padding: '0 8px',
        }}>
          <div style={{ fontSize: 12, color: T.text, fontWeight: 500, textAlign: 'center' }}>{msg.title}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: toneColor, letterSpacing: 0.3, textAlign: 'center', wordBreak: 'break-word' }}>
            {msg.body}
          </div>
        </div>
      </div>
    );
  }
  const dBtc = fmtDelta(rec.bitcoin_year_end_usd, prev?.bitcoin_year_end_usd);
  const dOil = fmtDelta(rec.oil_year_end_usd, prev?.oil_year_end_usd);

  return (
    <div style={{
      background: T.ink200, border: `1px solid ${brand}44`, borderRadius: 10,
      padding: '16px 18px', display: 'flex', flexDirection: 'column',
      boxShadow: `inset 0 0.5px 0 rgba(255,255,255,0.05), 0 0 0 0.5px ${brand}18`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 7, height: 7, borderRadius: 4, background: brand }} />
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text, display: 'flex', alignItems: 'center' }}>
          {brandName}
          {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN && (
            <TRInfoIcon text={window.TR_EXPLAIN['llm-' + brandName.toLowerCase().replace('chatgpt', 'gpt')]} size={10} />
          )}
        </div>
        {rec.sentiment && (
          <div style={{
            marginLeft: 'auto', padding: '2px 7px',
            background: `${brand}22`, border: `0.5px solid ${brand}55`,
            borderRadius: 4, fontFamily: T.mono, fontSize: 8.5, fontWeight: 600,
            color: brand, letterSpacing: 0.6, textTransform: 'uppercase',
          }}>{rec.sentiment}</div>
        )}
        {rec.confidence != null && (
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3 }}>
            {rec.confidence}/10
          </div>
        )}
      </div>

      {/* BTC year-end target */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>BTC year-end</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.btc, letterSpacing: -0.3 }}>
            {fmtPrice(rec.bitcoin_year_end_usd)}
          </div>
          {dBtc && prev && (
            <div style={{
              fontFamily: T.mono, fontSize: 10.5, fontWeight: 500,
              color: dBtc.up ? T.bull : T.bear,
            }}>
              {dBtc.up ? '↑' : '↓'} {fmtPrice(Math.abs(dBtc.d))} ({dBtc.up ? '+' : ''}{dBtc.pct.toFixed(1)}%)
            </div>
          )}
        </div>
      </div>

      {/* Oil year-end target */}
      {rec.oil_year_end_usd != null && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>WTI YE</div>
          <div style={{ fontFamily: T.mono, fontSize: 13, color: T.oil, fontWeight: 500 }}>
            ${rec.oil_year_end_usd}/bbl
          </div>
          {dOil && prev && (
            <div style={{ fontFamily: T.mono, fontSize: 10, color: dOil.up ? T.bull : T.bear }}>
              {dOil.up ? '↑' : '↓'} {Math.abs(dOil.d).toFixed(1)}
            </div>
          )}
        </div>
      )}

      {/* Top 3 bullets */}
      {rec.three_bullets && rec.three_bullets.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
          {rec.three_bullets.slice(0, 3).map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 7, fontSize: 11.5, color: T.textMid, lineHeight: 1.5 }}>
              <span style={{ color: brand, fontFamily: T.mono, flexShrink: 0, fontWeight: 600 }}>→</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {rec.summary && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${T.edge}`,
          fontSize: 11, color: T.textDim, lineHeight: 1.5, fontStyle: 'italic',
        }}>{rec.summary}</div>
      )}
    </div>
  );
}

function SummaryScreen({ onNav }) {
  const T = suT;
  const W = 1280, H = 820;

  const [headlines, setHeadlines] = React.useState([]);
  const [preds, setPreds] = React.useState({ claude: null, gpt: null, gemini: null });
  const [prevPreds, setPrevPreds] = React.useState(() => loadLastPredictions());
  const [loading, setLoading] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState(null);
  const [btcNow, setBtcNow] = React.useState(null);
  const [fngNow, setFngNow] = React.useState(null);

  // Pull live BTC + F&G once
  React.useEffect(() => {
    (async () => {
      if (typeof LiveData === 'undefined') return;
      try {
        const p = await LiveData.getCryptoPrices();
        if (p && p.bitcoin) setBtcNow({ price: p.bitcoin.usd, change24h: p.bitcoin.usd_24h_change });
      } catch (_) {}
      try {
        const fg = await LiveData.getFearGreed();
        if (fg && fg.data?.[0]) setFngNow({ value: parseInt(fg.data[0].value, 10), label: fg.data[0].value_classification });
      } catch (_) {}
    })();
  }, []);

  // Fetch headlines + fire the 3 LLMs
  const runBriefing = React.useCallback(async () => {
    setLoading(true);
    try {
      let articles = [];
      if (typeof NewsFeed !== 'undefined') {
        articles = (await NewsFeed.fetchAll()) || [];
      }
      // Pick 8 most recent, prefer Mideast/macro/crypto content
      const relKw = /iran|hormuz|israel|gaza|opec|crude|fed|fomc|cpi|clarity|btc|bitcoin|eth|etf|sbr|tariff|china/i;
      const top = (articles.filter(a => relKw.test(a.title)).slice(0, 5).concat(articles.slice(0, 3))).slice(0, 8);
      setHeadlines(top);

      const [cl, gp, ge] = await Promise.all([
        callModel('claude', top),
        callModel('gpt',    top),
        callModel('gemini', top),
      ]);
      const next = { claude: cl, gpt: gp, gemini: ge };
      setPreds(next);
      setLastRefresh(new Date());

      // Save snapshot for next-time delta, only if we got at least one valid prediction
      const anyValid = [cl, gp, ge].some(r => r && r.bitcoin_year_end_usd);
      if (anyValid) saveLastPredictions({ ...next, ts: Date.now() });

      // Publish for TRAlertsManager's CONSENSUS_DIVERGENT rule
      window.TR_LAST_PREDS = next;
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { runBriefing(); }, [runBriefing]);

  // Consensus = average of valid predictions
  const consensus = React.useMemo(() => {
    const valid = Object.values(preds).filter(p => p && p.bitcoin_year_end_usd);
    if (!valid.length) return null;
    const btc = valid.reduce((a, p) => a + (p.bitcoin_year_end_usd || 0), 0) / valid.length;
    const oilValid = valid.filter(p => p.oil_year_end_usd);
    const oil = oilValid.length ? oilValid.reduce((a, p) => a + p.oil_year_end_usd, 0) / oilValid.length : null;
    const sentiments = valid.map(p => p.sentiment).filter(Boolean);
    const aligned = sentiments.length && new Set(sentiments).size === 1;
    const conf = valid.reduce((a, p) => a + (Number(p.confidence) || 0), 0) / valid.length;
    const high = Math.max(...valid.map(p => p.bitcoin_year_end_usd));
    const low  = Math.min(...valid.map(p => p.bitcoin_year_end_usd));
    return { btc, oil, aligned, sentiment: aligned ? sentiments[0] : 'mixed', conf, spread: high - low, high, low, count: valid.length };
  }, [preds]);

  const consensusPrev = React.useMemo(() => {
    if (!prevPreds) return null;
    const valid = [prevPreds.claude, prevPreds.gpt, prevPreds.gemini].filter(p => p && p.bitcoin_year_end_usd);
    if (!valid.length) return null;
    return { btc: valid.reduce((a, p) => a + p.bitcoin_year_end_usd, 0) / valid.length };
  }, [prevPreds]);

  const consensusDelta = consensus && consensusPrev ? fmtDelta(consensus.btc, consensusPrev.btc) : null;

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* HEADER */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`, background: T.ink100,
      }}>
        <img src="assets/gg-logo.png" alt="Global Gauntlet"
          style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
        <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>

        <TRTabBar current="summary" onNav={onNav} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {typeof TRGearInline !== 'undefined' && <TRGearInline />}
          {typeof window.trIsLocalHost === 'function' && window.trIsLocalHost() && (
            <div
              onClick={() => window.openTRSelfTest && window.openTRSelfTest()}
              title="In-house self-test · LLM reviews every feature"
              style={{
                padding: '5px 12px',
                background: 'rgba(217,107,107,0.14)',
                color: T.bear,
                border: `0.5px solid ${T.bear}55`,
                borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                cursor: 'pointer', fontFamily: T.mono,
              }}>⚡ TEST</div>
          )}
          <div
            onClick={runBriefing}
            style={{
              padding: '5px 12px', background: T.signal, color: T.ink000,
              borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
              fontFamily: T.mono,
            }}>{loading ? 'REFRESHING…' : '↻ REFRESH'}</div>
        </div>
      </div>

      {/* BODY */}
      <div style={{
        height: H - 52, padding: '16px 24px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* MARKET SNAPSHOT strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
          background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
          padding: '12px 18px',
        }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>BTC · live</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 500, color: T.btc, letterSpacing: -0.3 }}>
                {btcNow ? fmtPrice(btcNow.price) : '—'}
              </div>
              {btcNow && (
                <div style={{ fontFamily: T.mono, fontSize: 11, color: btcNow.change24h >= 0 ? T.bull : T.bear }}>
                  {btcNow.change24h >= 0 ? '+' : ''}{btcNow.change24h?.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Fear & Greed</div>
            <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 500, color: T.text, letterSpacing: -0.3 }}>
              {fngNow ? fngNow.value : '—'}
              {fngNow && <span style={{ fontSize: 11, color: T.textMid, marginLeft: 6, fontWeight: 500, letterSpacing: 0.4 }}>{fngNow.label}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Consensus BTC YE</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 500, color: T.signal, letterSpacing: -0.3 }}>
                {consensus ? fmtPrice(consensus.btc) : (loading ? '…' : '—')}
              </div>
              {consensusDelta && prevPreds && (
                <div style={{ fontFamily: T.mono, fontSize: 11, color: consensusDelta.up ? T.bull : T.bear }}>
                  {consensusDelta.up ? '↑' : '↓'} {consensusDelta.pct.toFixed(1)}% since last
                </div>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Last refresh</div>
            <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 500, color: T.textMid, letterSpacing: 0.2 }}>
              {lastRefresh ? lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (loading ? 'running' : '—')}
            </div>
          </div>
        </div>

        {/* HEADLINES + THREE LLMS side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14, flex: 1 }}>
          {/* LEFT: headlines */}
          <div style={{
            background: T.ink100, border: `1px solid ${T.edge}`, borderRadius: 10,
            padding: '14px 16px', overflow: 'auto',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.signal, textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
              Today's catalysts · {headlines.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {headlines.map((h, i) => (
                <a key={i} href={h.link} target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: '8px 10px', background: T.ink200,
                    border: `0.5px solid ${T.edge}`, borderRadius: 6,
                    textDecoration: 'none',
                  }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: T.text, lineHeight: 1.4, marginBottom: 3 }}>{h.title}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.3 }}>{h.source}</div>
                </a>
              ))}
              {!headlines.length && (
                <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center', padding: '20px 0' }}>
                  {loading ? 'Pulling feeds…' : 'No headlines loaded.'}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: three LLM predictions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
              <PredictionCard brand={T.claude} brandName="Claude" rec={preds.claude} prev={prevPreds?.claude} T={T} />
              <PredictionCard brand={T.gpt}    brandName="ChatGPT" rec={preds.gpt}    prev={prevPreds?.gpt}    T={T} />
              <PredictionCard brand={T.gemini} brandName="Gemini" rec={preds.gemini} prev={prevPreds?.gemini} T={T} />
            </div>

            {/* CONSENSUS */}
            {consensus && (
              <div style={{
                background: 'linear-gradient(180deg, rgba(201,162,39,0.1) 0%, rgba(201,162,39,0.02) 100%)',
                border: `1px solid rgba(201,162,39,0.4)`, borderRadius: 10,
                padding: '14px 18px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                  background: `linear-gradient(90deg, transparent 0%, ${T.signal} 50%, transparent 100%)`,
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.signal, textTransform: 'uppercase', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                    Consensus · {consensus.count} models
                    {typeof TRInfoIcon !== 'undefined' && window.TR_EXPLAIN &&
                      <TRInfoIcon text={window.TR_EXPLAIN['consensus']} size={10} />}
                  </div>
                  <div style={{
                    padding: '2px 8px',
                    background: consensus.aligned ? 'rgba(111,207,142,0.18)' : 'rgba(217,107,107,0.18)',
                    border: `0.5px solid ${consensus.aligned ? 'rgba(111,207,142,0.5)' : 'rgba(217,107,107,0.5)'}`,
                    borderRadius: 4, fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: 0.6,
                    color: consensus.aligned ? T.bull : T.bear, textTransform: 'uppercase',
                  }}>{consensus.aligned ? 'ALIGNED' : 'DIVERGENT'} · {consensus.sentiment}</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'baseline' }}>
                    <div>
                      <span style={{ fontSize: 9, letterSpacing: 1, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>BTC YE</span>
                      <span style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.btc, letterSpacing: -0.3, marginLeft: 8 }}>
                        {fmtPrice(consensus.btc)}
                      </span>
                    </div>
                    {consensus.oil != null && (
                      <div>
                        <span style={{ fontSize: 9, letterSpacing: 1, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>WTI YE</span>
                        <span style={{ fontFamily: T.mono, fontSize: 15, color: T.oil, marginLeft: 7 }}>${consensus.oil.toFixed(0)}</span>
                      </div>
                    )}
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim }}>conf {consensus.conf.toFixed(1)}/10</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5, display: 'flex', gap: 20 }}>
                  <div>
                    <span style={{ color: T.textDim }}>Range:</span>
                    <span style={{ fontFamily: T.mono, color: T.text, marginLeft: 6 }}>
                      {fmtPrice(consensus.low)} – {fmtPrice(consensus.high)}
                    </span>
                    <span style={{ fontFamily: T.mono, color: T.textDim, marginLeft: 6 }}>
                      (spread {fmtPrice(consensus.spread)})
                    </span>
                  </div>
                  {consensusDelta && prevPreds && (
                    <div>
                      <span style={{ color: T.textDim }}>Δ since last:</span>
                      <span style={{
                        fontFamily: T.mono, marginLeft: 6,
                        color: consensusDelta.up ? T.bull : T.bear,
                      }}>
                        {consensusDelta.up ? '+' : ''}{fmtPrice(consensusDelta.d)} ({consensusDelta.up ? '+' : ''}{consensusDelta.pct.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.SummaryScreen = SummaryScreen;
