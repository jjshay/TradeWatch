#!/usr/bin/env node
/**
 * daily-briefing.js — TradeRadar daily email digest to jjshay@gmail.com.
 *
 * Fetches live data (BTC, Fear & Greed, RSS headlines, Finnhub portfolio),
 * runs Claude + ChatGPT + Gemini + Grok in parallel for consensus, formats
 * as HTML email, sends via Gmail SMTP.
 *
 * SETUP (once):
 *   1. Create a Gmail App Password at myaccount.google.com → Security → App
 *      Passwords → generate. Do NOT use your regular Gmail password.
 *   2. Copy .env.example → .env and fill the values (GMAIL_USER, GMAIL_APP_PW,
 *      plus the API keys you want to use).
 *   3. npm install node-fetch@2 nodemailer dotenv
 *   4. Test: node scripts/daily-briefing.js
 *   5. Schedule: see README section "Daily email schedule" for launchd/cron setup.
 *
 * Exit codes: 0 = sent, 1 = error (check stderr).
 */

require('dotenv').config();
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

const env = process.env;
const TO_EMAIL   = env.TO_EMAIL || 'jjshay@gmail.com';
const GMAIL_USER = env.GMAIL_USER;
const GMAIL_PW   = env.GMAIL_APP_PW;

if (!GMAIL_USER || !GMAIL_PW) {
    console.error('ERROR: set GMAIL_USER + GMAIL_APP_PW in .env');
    process.exit(1);
}

const keys = {
    claude:   env.ANTHROPIC_API_KEY,
    openai:   env.OPENAI_API_KEY,
    gemini:   env.GEMINI_API_KEY,
    grok:     env.XAI_API_KEY,
    finnhub:  env.FINNHUB_API_KEY,
};

// ─────────── DATA PULLS ───────────
async function getBTC() {
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const j = await r.json();
        return j && j.bitcoin ? { price: j.bitcoin.usd, change: j.bitcoin.usd_24h_change } : null;
    } catch { return null; }
}
async function getFearGreed() {
    try {
        const r = await fetch('https://api.alternative.me/fng/?limit=1');
        const j = await r.json();
        return j && j.data && j.data[0] ? { value: +j.data[0].value, label: j.data[0].value_classification } : null;
    } catch { return null; }
}
async function getPortfolio() {
    if (!keys.finnhub) return null;
    const syms = ['IBIT', 'MSTR', 'COIN', 'BITB', 'MARA'];
    const out = {};
    for (const s of syms) {
        try {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${keys.finnhub}`);
            const q = await r.json();
            if (q && q.c > 0) out[s] = { price: q.c, chg: q.dp };
        } catch {}
    }
    return Object.keys(out).length ? out : null;
}
async function getHeadlines() {
    const feeds = [
        'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
        'https://cointelegraph.com/rss',
    ];
    const all = [];
    for (const f of feeds) {
        try {
            const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f)}`);
            const j = await r.json();
            if (j && j.items) all.push(...j.items.slice(0, 10).map(x => ({ title: x.title, link: x.link, source: j.feed?.title || f })));
        } catch {}
    }
    return all.slice(0, 15);
}

// ─────────── LLM CONSENSUS ───────────
const promptOf = (hl) => `You are a crypto market analyst. Analyze these recent blockchain/crypto headlines and provide actionable trading insights.

HEADLINES:
${hl.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n')}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": 1-10,
  "summary": "2-3 sentence market summary",
  "actionable": [
    {"action": "BUY/SELL/WATCH", "asset": "BTC/IBIT/MSTR/COIN", "reasoning": "brief", "urgency": "high/medium/low"}
  ],
  "risks": ["risk 1", "risk 2"],
  "opportunities": ["opportunity 1", "opportunity 2"]
}`;

function parseJSON(t) {
    try { return JSON.parse(t.replace(/^```json?|```$/g, '').trim()); } catch { return null; }
}

async function callClaude(hl) {
    if (!keys.claude) return null;
    try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: promptOf(hl) }] }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        return parseJSON(j.content?.[0]?.text || '');
    } catch { return null; }
}
async function callOpenAI(hl) {
    if (!keys.openai) return null;
    try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openai}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: promptOf(hl) }], temperature: 0.3, max_tokens: 1500 }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        return parseJSON(j.choices?.[0]?.message?.content || '');
    } catch { return null; }
}
async function callGemini(hl) {
    if (!keys.gemini) return null;
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptOf(hl) }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1500 } }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        return parseJSON(j.candidates?.[0]?.content?.parts?.[0]?.text || '');
    } catch { return null; }
}
async function callGrok(hl) {
    if (!keys.grok) return null;
    try {
        const r = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.grok}` },
            body: JSON.stringify({ model: 'grok-3-mini-fast', messages: [{ role: 'user', content: promptOf(hl) }], temperature: 0.3, max_tokens: 1500 }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        return parseJSON(j.choices?.[0]?.message?.content || '');
    } catch { return null; }
}

// ─────────── HTML RENDER ───────────
function renderHTML({ btc, fg, portfolio, headlines, models }) {
    const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    const navy = '#1a3a6b', gold = '#c9a227', bull = '#4EA076', bear = '#D96B6B';

    const live = Object.entries(models).filter(([, v]) => v);
    const sentiments = live.map(([, v]) => v.sentiment);
    const agree = sentiments.length && new Set(sentiments).size === 1;
    const avgConf = live.length ? (live.reduce((a, [, v]) => a + (+v.confidence || 0), 0) / live.length).toFixed(1) : '—';

    return `<!doctype html><html><body style="margin:0;padding:0;background:#07090C;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#fff">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.1)">
    <div style="width:28px;height:28px;border-radius:7px;background:${navy};display:inline-block"></div>
    <div>
      <div style="font-size:9px;letter-spacing:1.4px;color:${gold};text-transform:uppercase;font-weight:600">Global Gauntlet</div>
      <div style="font-size:16px;font-weight:500">TradeRadar · Daily Brief · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:10px;letter-spacing:1.2px;color:rgba(180,188,200,0.75);text-transform:uppercase;margin-bottom:10px">Pre-Market Snapshot</div>
    <div style="display:flex;gap:22px;flex-wrap:wrap">
      ${btc ? `<div><div style="font-size:10px;color:rgba(180,188,200,0.55);letter-spacing:0.6px">BTC</div><div style="font-size:20px;font-weight:500;font-family:Menlo,monospace">${fmt$(btc.price)}</div><div style="font-size:11px;color:${btc.change >= 0 ? bull : bear};font-family:Menlo,monospace">${fmtPct(btc.change)} · 24h</div></div>` : ''}
      ${fg ? `<div><div style="font-size:10px;color:rgba(180,188,200,0.55);letter-spacing:0.6px">Fear &amp; Greed</div><div style="font-size:20px;font-weight:500;font-family:Menlo,monospace">${fg.value}</div><div style="font-size:11px;color:rgba(180,188,200,0.75);letter-spacing:0.3px">${fg.label}</div></div>` : ''}
    </div>
  </div>

  ${live.length >= 2 ? `
  <div style="background:${agree ? 'rgba(78,160,118,0.1)' : 'rgba(217,107,107,0.1)'};border:1px solid ${agree ? 'rgba(78,160,118,0.4)' : 'rgba(217,107,107,0.4)'};border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:10px;letter-spacing:1.2px;color:${agree ? bull : bear};text-transform:uppercase;font-weight:600;margin-bottom:8px">Consensus · ${live.length} LLMs · ${agree ? 'Aligned' : 'Divergent'} · Avg ${avgConf}/10</div>
    <div style="font-size:14px;line-height:1.6">${live.map(([k, v]) => `<b style="color:${gold}">${k.toUpperCase()}:</b> ${v.summary || ''}`).join('<br><br>')}</div>
  </div>` : ''}

  ${portfolio ? `
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:10px;letter-spacing:1.2px;color:rgba(180,188,200,0.75);text-transform:uppercase;margin-bottom:10px">BTC-Tied Portfolio · Live</div>
    <table style="width:100%;border-collapse:collapse;font-family:Menlo,monospace;font-size:12px">
      ${Object.entries(portfolio).map(([k, v]) => `<tr><td style="padding:6px 0;color:${gold};font-weight:600">${k}</td><td style="text-align:right">$${v.price.toFixed(2)}</td><td style="text-align:right;color:${v.chg >= 0 ? bull : bear}">${fmtPct(v.chg)}</td></tr>`).join('')}
    </table>
  </div>` : ''}

  ${headlines.length ? `
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:10px;letter-spacing:1.2px;color:rgba(180,188,200,0.75);text-transform:uppercase;margin-bottom:10px">Top Headlines</div>
    ${headlines.slice(0, 8).map(h => `<div style="padding:6px 0;font-size:13px;line-height:1.5"><a href="${h.link}" style="color:#fff;text-decoration:none">${h.title}</a><div style="font-size:10px;color:rgba(180,188,200,0.55);font-family:Menlo,monospace;margin-top:2px">${h.source}</div></div>`).join('')}
  </div>` : ''}

  ${(live[0] && live[0][1].actionable && live[0][1].actionable.length) ? `
  <div style="background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.3);border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:10px;letter-spacing:1.2px;color:${gold};text-transform:uppercase;font-weight:600;margin-bottom:10px">Actionable · From ${live[0][0].toUpperCase()}</div>
    ${live[0][1].actionable.slice(0, 3).map(a => `<div style="padding:6px 0;font-size:13px"><b style="color:${gold}">${a.action} ${a.asset}</b> · ${a.reasoning} <span style="font-size:10px;color:rgba(180,188,200,0.55);letter-spacing:0.6px;text-transform:uppercase">${a.urgency}</span></div>`).join('')}
  </div>` : ''}

  <div style="margin-top:24px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.1);font-size:10px;color:rgba(180,188,200,0.55);letter-spacing:0.3px;line-height:1.6">
    Generated by TradeRadar · ${new Date().toISOString()}<br>
    Not investment advice. Data from CoinGecko, Finnhub, alternative.me, RSS feeds, and LLM synthesis.
  </div>
</div></body></html>`;
}

// ─────────── MAIN ───────────
(async () => {
    console.log('[briefing] fetching data…');
    const [btc, fg, portfolio, headlines] = await Promise.all([
        getBTC(), getFearGreed(), getPortfolio(), getHeadlines(),
    ]);
    console.log('[briefing] firing LLMs…');
    const [cl, op, ge, gr] = await Promise.all([
        callClaude(headlines), callOpenAI(headlines), callGemini(headlines), callGrok(headlines),
    ]);
    const models = { claude: cl, gpt: op, gemini: ge, grok: gr };
    const respondedCount = Object.values(models).filter(Boolean).length;
    console.log(`[briefing] ${respondedCount}/4 LLMs responded`);

    const html = renderHTML({ btc, fg, portfolio, headlines, models });

    const tx = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_PW },
    });
    const info = await tx.sendMail({
        from: `"TradeRadar" <${GMAIL_USER}>`,
        to: TO_EMAIL,
        subject: `TradeRadar · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${btc ? `BTC $${Math.round(btc.price).toLocaleString()}` : 'Daily Brief'}`,
        html,
    });
    console.log('[briefing] sent:', info.messageId);
})().catch((e) => { console.error(e); process.exit(1); });
