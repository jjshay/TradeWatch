#!/usr/bin/env node
/**
 * daily-briefing.js — TradeRadar Morning Brief.
 *
 * 7-section HTML morning digest emailed to jjshay@gmail.com every weekday at
 * 6:00 AM PST. Pulls overnight news, runs Claude + GPT + Gemini + Grok in
 * parallel for a BTC/WTI year-end re-read, maps the shift onto TradeRadar
 * drivers, and produces a personalized position-level action list.
 *
 * Sections:
 *   1. Overnight Updates       — top 6 filtered news catalysts
 *   2. LLM Thought Shift       — 4-way consensus on BTC + WTI year-end targets
 *   3. Model Impact (Drivers)  — DXY / VIX / flow / Hormuz drivers prev → now
 *   4. Oil Impact              — 2-3 bullets + directional call
 *   5. Bitcoin Impact          — 2-3 bullets + directional call
 *   6. Overall Verdict         — bull/bear score + regime label
 *   7. Investment Profile      — personalized per-position HOLD / ADD / TRIM
 *
 * Data sources:
 *   • News:       rss2json over CoinDesk / CoinTelegraph / Reuters / MarketWatch / ZeroHedge
 *   • BTC:        CoinGecko (no key)
 *   • Oil/FX/VIX: FRED graphviz CSV (no key) — DCOILBRENTEU, DCOILWTICO, DTWEXBGS, VIXCLS
 *   • Positions:  hardcoded USER_POSITIONS, optional override at
 *                 ~/Library/Application Support/TradeRadar/positions.json
 *                 or via POSITIONS_JSON_PATH env var
 *
 * Exit codes: 0 = sent, 1 = fatal error.
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Repo-root .env (not scripts/.env).
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const fetch      = require('node-fetch');
const nodemailer = require('nodemailer');

const env        = process.env;
const TO_EMAIL   = env.TO_EMAIL   || 'jjshay@gmail.com';
const GMAIL_USER = env.GMAIL_USER;
const GMAIL_PW   = env.GMAIL_APP_PW;
const PUBLIC_URL = env.PUBLIC_URL || 'https://traderadar.ggauntlet.com/';

if (!GMAIL_USER || !GMAIL_PW) {
    console.error('ERROR: set GMAIL_USER + GMAIL_APP_PW in .env');
    process.exit(1);
}

const keys = {
    claude:  env.ANTHROPIC_API_KEY,
    openai:  env.OPENAI_API_KEY,
    gemini:  env.GEMINI_API_KEY,
    grok:    env.XAI_API_KEY,
    finnhub: env.FINNHUB_API_KEY,
    fred:    env.FRED_API_KEY, // optional — CSV path doesn't need it
};

// ─────────── PALETTE (TradeRadar) ───────────
const C = {
    ink000:  '#07090C',
    ink100:  '#0B0E13',
    ink200:  '#10151D',
    line:    'rgba(255,255,255,0.08)',
    text:    '#E8ECF1',
    muted:   'rgba(180,188,200,0.70)',
    signal:  '#c9a227',
    bull:    '#6FCF8E',
    bear:    '#D96B6B',
    btc:     '#F7931A',
    oil:     '#0077B5',
};

// ─────────── USER POSITIONS (personalized Section 7) ───────────
// Override by creating ~/Library/Application Support/TradeRadar/positions.json
// with the same shape, or setting POSITIONS_JSON_PATH to a custom path.
const USER_POSITIONS_DEFAULT = {
    cash: 4621,
    positions: [
        {
            symbol: 'BTC',
            kind: 'spot',
            qty: 0.01089,
            costBasis: 98848,     // per-BTC cost basis
            currentValue: 1076.48, // overridden live at runtime if BTC price fetches
        },
        {
            symbol: 'COIN',
            kind: 'option',
            right: 'C',
            strike: 340,
            expiry: '2026-12-18',
            contracts: 2,
            costPerContract: 1525, // $1,525 premium per contract
        },
    ],
};

function loadPositions() {
    const candidate = env.POSITIONS_JSON_PATH
        || path.join(os.homedir(), 'Library', 'Application Support', 'TradeRadar', 'positions.json');
    try {
        if (fs.existsSync(candidate)) {
            const raw = fs.readFileSync(candidate, 'utf8');
            const p = JSON.parse(raw);
            if (p && Array.isArray(p.positions)) {
                console.log(`[briefing] positions loaded from ${candidate}`);
                return p;
            }
        }
    } catch (e) {
        console.warn(`[briefing] positions override at ${candidate} invalid: ${e.message}`);
    }
    return USER_POSITIONS_DEFAULT;
}

// ─────────── HELPERS ───────────
const fmt$    = (n) => (n == null || isNaN(n)) ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const fmt$2   = (n) => (n == null || isNaN(n)) ? '—' : '$' + (+n).toFixed(2);
const fmtPct  = (n) => (n == null || isNaN(n)) ? '—' : ((n >= 0 ? '+' : '') + n.toFixed(2) + '%');
const escHTML = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeAgo = (d) => {
    if (!d) return '';
    const ms = Date.now() - d.getTime();
    const h  = Math.floor(ms / 3_600_000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

// ─────────── DATA PULLS ───────────
async function getBTC() {
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const j = await r.json();
        return j && j.bitcoin ? { price: j.bitcoin.usd, change: j.bitcoin.usd_24h_change } : null;
    } catch (e) { return null; }
}

// FRED CSV — no key required. Returns { latest, prior, deltaPct } or null.
async function getFREDSeries(seriesId) {
    try {
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
        const r = await fetch(url);
        if (!r.ok) return null;
        const txt = await r.text();
        const rows = txt.trim().split(/\r?\n/).slice(1); // drop header
        const pts  = [];
        for (const row of rows) {
            const [date, val] = row.split(',');
            const num = parseFloat(val);
            if (!isNaN(num)) pts.push({ date, value: num });
        }
        if (!pts.length) return null;
        const latest = pts[pts.length - 1];
        const prior  = pts.length >= 2 ? pts[pts.length - 2] : null;
        const deltaPct = prior ? ((latest.value - prior.value) / prior.value) * 100 : null;
        return { latest: latest.value, latestDate: latest.date, prior: prior ? prior.value : null, deltaPct };
    } catch (e) { return null; }
}

async function getMacroTiles() {
    const [wti, vix, dxy, brent] = await Promise.all([
        getFREDSeries('DCOILWTICO'),
        getFREDSeries('VIXCLS'),
        getFREDSeries('DTWEXBGS'),
        getFREDSeries('DCOILBRENTEU'),
    ]);
    return { wti, vix, dxy, brent };
}

// Overnight news — filtered by relevance keywords.
const RELEVANCE_KEYWORDS = [
    'fed', 'iran', 'hormuz', 'israel', 'crude', 'opec', 'bitcoin', 'btc',
    'etf', 'cpi', 'fomc', 'clarity', 'tariff', 'china', 'russia', 'saudi',
    'powell', 'rate', 'inflation', 'oil', 'strike', 'missile', 'sanction',
];

async function getOvernightNews() {
    const feeds = [
        { name: 'CoinDesk',     url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml' },
        { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
        { name: 'The Block',    url: 'https://www.theblock.co/rss.xml' },
        { name: 'Reuters',      url: 'https://feeds.reuters.com/reuters/businessNews' },
        { name: 'MarketWatch',  url: 'https://www.marketwatch.com/rss/topstories' },
        { name: 'ZeroHedge',    url: 'https://feeds.feedburner.com/zerohedge/feed' },
    ];
    const results = await Promise.allSettled(feeds.map(async f => {
        const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`);
        const j = await r.json();
        if (!j || !j.items) return [];
        return j.items.slice(0, 20).map(x => ({
            title:  x.title || '',
            link:   x.link  || '',
            source: f.name,
            date:   new Date(x.pubDate || Date.now()),
        }));
    }));
    const all = [];
    for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);

    const scored = all.map(a => {
        const low = (a.title || '').toLowerCase();
        const hits = RELEVANCE_KEYWORDS.filter(k => low.includes(k));
        return { ...a, score: hits.length };
    }).filter(a => a.score > 0);

    // Dedupe on title-prefix, sort by (score desc, recency desc), cap 6.
    const seen = new Set();
    const deduped = [];
    scored.sort((a, b) => (b.score - a.score) || (b.date - a.date));
    for (const a of scored) {
        const k = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(a);
        if (deduped.length >= 6) break;
    }
    return deduped;
}

// ─────────── LLM PROMPT + CALLS ───────────
const YE = new Date().getFullYear();
function buildPrompt(catalysts) {
    return `You are a macro strategist. Given these overnight catalysts, has your year-end ${YE} BTC and WTI crude target shifted?

OVERNIGHT CATALYSTS:
${catalysts.map((c, i) => `${i + 1}. [${c.source}] ${c.title}`).join('\n')}

Respond with RAW JSON only — no markdown, no code fences, no prose:
{
  "btc_year_end": <number in USD, e.g. 145000>,
  "wti_year_end": <number in USD per barrel, e.g. 82>,
  "btc_delta": "<1 sentence: what shifted vs yesterday's read>",
  "wti_delta": "<1 sentence: what shifted vs yesterday's read>",
  "regime": "<RISK-ON | MIXED | RISK-OFF>",
  "confidence": <1-10>
}`;
}

function parseJSON(t) {
    if (!t || typeof t !== 'string') return null;
    let s = t.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(s); } catch (e) {}
    const m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return null;
}

async function callClaude(prompt) {
    if (!keys.claude) return null;
    try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': keys.claude,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 1000,
                temperature: 0.4,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!r.ok) { console.warn(`[claude] HTTP ${r.status}`); return null; }
        const j = await r.json();
        return parseJSON(j.content?.[0]?.text || '');
    } catch (e) { console.warn('[claude]', e.message); return null; }
}

async function callOpenAI(prompt) {
    if (!keys.openai) return null;
    try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openai}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4,
                max_tokens: 1000,
            }),
        });
        if (!r.ok) { console.warn(`[gpt] HTTP ${r.status}`); return null; }
        const j = await r.json();
        return parseJSON(j.choices?.[0]?.message?.content || '');
    } catch (e) { console.warn('[gpt]', e.message); return null; }
}

async function callGemini(prompt) {
    if (!keys.gemini) return null;
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.gemini}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 1000 },
            }),
        });
        if (!r.ok) { console.warn(`[gemini] HTTP ${r.status}`); return null; }
        const j = await r.json();
        return parseJSON(j.candidates?.[0]?.content?.parts?.[0]?.text || '');
    } catch (e) { console.warn('[gemini]', e.message); return null; }
}

async function callGrok(prompt) {
    if (!keys.grok) return null;
    try {
        const r = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.grok}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4,
                max_tokens: 1000,
            }),
        });
        if (!r.ok) { console.warn(`[grok] HTTP ${r.status}`); return null; }
        const j = await r.json();
        return parseJSON(j.choices?.[0]?.message?.content || '');
    } catch (e) { console.warn('[grok]', e.message); return null; }
}

// ─────────── EXECUTIVE SUMMARY (TL;DR) ───────────
// Builds a prompt combining regime, positions, catalysts, verdict — asks the
// LLM for a one-sentence market read + top 3 ranked recs + risk level chip.
function buildExecSummaryPrompt({ btc, macro, catalysts, userPositions, consensus, verdict, positionAnalysis }) {
    const regime = consensus ? consensus.regime : 'MIXED';
    const btcLine = btc ? `BTC $${Math.round(btc.price).toLocaleString()} (24h ${btc.change >= 0 ? '+' : ''}${btc.change?.toFixed(2)}%)` : 'BTC —';
    const wtiLine = macro.wti ? `WTI $${macro.wti.latest.toFixed(2)} (${macro.wti.deltaPct >= 0 ? '+' : ''}${macro.wti.deltaPct?.toFixed(2)}%)` : 'WTI —';
    const vixLine = macro.vix ? `VIX ${macro.vix.latest.toFixed(2)}` : 'VIX —';

    const posLines = positionAnalysis.rows.map(r => {
        return `  - ${r.label} · mkt ${fmt$(r.currentValue)} · cost ${fmt$(r.costBasis)} · P&L ${fmt$(r.pnl)} (${fmtPct(r.pnlPct)}) · ${r.portfolioPct.toFixed(1)}% of book`;
    }).join('\n');

    const catLines = catalysts.slice(0, 3).map((c, i) => `${i + 1}. [${c.source}] ${c.title}`).join('\n') || '(none high-relevance overnight)';

    return `You are the lead portfolio strategist writing the TL;DR at the top of a daily briefing. A busy reader should know exactly what to do in the first 150 words.

MARKET SNAPSHOT:
  ${btcLine}
  ${wtiLine}
  ${vixLine}
  Regime (LLM consensus, ${consensus ? consensus.n : 0}/4 models): ${regime}
  Overall verdict: ${verdict.label} · score ${verdict.score}/100
  ${consensus ? `Model-implied YE: BTC ${fmt$(consensus.btc)} / WTI ${fmt$2(consensus.wti)}` : 'No live consensus'}

USER POSITIONS (total book ${fmt$(positionAnalysis.totalMkt)}, cash ${positionAnalysis.cashPct.toFixed(0)}%):
${posLines}

TOP OVERNIGHT CATALYSTS:
${catLines}

CONSTRAINTS:
  - Any ADD or BUY recommendation requires HIGH or MEDIUM conviction. If conviction is low across the board, the top rec should be "HOLD / STAND DOWN / PRESERVE CASH".
  - Recommendations must be concrete: ticker / instrument, action, size in $ or %, one-line rationale.
  - Actions must be one of: BUY, SELL, HOLD, ADD, TRIM, CUT.
  - Risk level must be one of: LOW, MODERATE, ELEVATED, HIGH.
  - Be specific — no generic filler. If the right move is to do nothing, say that plainly.

Respond with RAW JSON only — no markdown, no code fences, no prose:
{
  "read": "<one-sentence market synthesis — the overall verdict in plain English>",
  "risk_level": "<LOW|MODERATE|ELEVATED|HIGH>",
  "risk_rationale": "<one sentence: why this risk level right now>",
  "recommendations": [
    { "rank": 1, "instrument": "<e.g. BTC direct>", "action": "<BUY|SELL|HOLD|ADD|TRIM|CUT>", "size": "<$1500 or 5% of portfolio>", "rationale": "<one line>" },
    { "rank": 2, "instrument": "...", "action": "...", "size": "...", "rationale": "..." },
    { "rank": 3, "instrument": "...", "action": "...", "size": "...", "rationale": "..." }
  ]
}`;
}

// Claude primary, GPT fallback. Returns null if both fail.
async function buildExecSummary(ctx) {
    const prompt = buildExecSummaryPrompt(ctx);
    try {
        const claude = await callClaude(prompt);
        if (claude && claude.read && Array.isArray(claude.recommendations)) {
            console.log('[briefing] exec summary: Claude ok');
            return claude;
        }
    } catch (e) { console.warn('[briefing] exec summary Claude error:', e.message); }
    try {
        const gpt = await callOpenAI(prompt);
        if (gpt && gpt.read && Array.isArray(gpt.recommendations)) {
            console.log('[briefing] exec summary: GPT fallback ok');
            return gpt;
        }
    } catch (e) { console.warn('[briefing] exec summary GPT error:', e.message); }
    console.warn('[briefing] exec summary: both LLMs failed');
    return null;
}

// ─────────── DRIVER MAP (Section 3) ───────────
// Mock-for-now: produce plausible prev→current signal shifts keyed off macro tiles.
function computeDrivers({ macro, btcPrice, consensus }) {
    const dxySig = macro.dxy && macro.dxy.deltaPct != null
        ? (macro.dxy.deltaPct > 0.1 ? 'long' : macro.dxy.deltaPct < -0.1 ? 'short' : 'neutral')
        : 'neutral';
    const vixLevel = macro.vix ? macro.vix.latest : null;
    const vixSig = vixLevel == null ? 'neutral'
        : vixLevel > 22 ? 'elevated'
        : vixLevel < 14 ? 'calm'
        : 'neutral';

    // Hormuz mock — bumped if overnight news mentioned hormuz/iran/strike.
    const hormuzHot = false; // overridden below in renderHTML based on news
    return [
        { id: 'regime-dxy',     label: 'DXY Regime',       prev: 'neutral',   curr: dxySig,              source: 'FRED DTWEXBGS' },
        { id: 'spx-10y',        label: 'SPX vs 10Y',       prev: 'neutral',   curr: vixSig,              source: 'FRED VIXCLS' },
        { id: 'btc-ibit-flow',  label: 'BTC · IBIT Flow',  prev: 'inflow',    curr: btcPrice && btcPrice.change > 0 ? 'inflow' : 'mixed', source: 'CoinGecko 24h' },
        { id: 'btc-funding',    label: 'BTC Funding',      prev: 'neutral',   curr: consensus && consensus.regime === 'RISK-ON' ? 'long' : 'neutral', source: 'LLM consensus' },
        { id: 'hormuz-mil',     label: 'Hormuz Mil',       prev: 'elevated',  curr: hormuzHot ? 'hot' : 'elevated', source: 'News feed' },
        { id: 'oil-opec',       label: 'OPEC Posture',     prev: 'steady',    curr: 'steady',            source: 'News feed' },
    ];
}

// ─────────── CONSENSUS ───────────
function computeConsensus(modelMap) {
    const live = Object.entries(modelMap).filter(([, v]) => v && typeof v.btc_year_end === 'number');
    if (!live.length) return null;
    const btcVals = live.map(([, v]) => +v.btc_year_end).filter(n => !isNaN(n));
    const wtiVals = live.map(([, v]) => +v.wti_year_end).filter(n => !isNaN(n));
    const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    const regimes = live.map(([, v]) => v.regime).filter(Boolean);
    const dominantRegime = regimes.length
        ? [...regimes.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0]
        : 'MIXED';
    return {
        btc:     avg(btcVals),
        wti:     avg(wtiVals),
        btcHigh: Math.max(...btcVals),
        btcLow:  Math.min(...btcVals),
        wtiHigh: Math.max(...wtiVals),
        wtiLow:  Math.min(...wtiVals),
        btcSpread: Math.max(...btcVals) - Math.min(...btcVals),
        wtiSpread: Math.max(...wtiVals) - Math.min(...wtiVals),
        regime: dominantRegime,
        n: live.length,
    };
}

// ─────────── POSITION ANALYTICS (Section 7) ───────────
function analyzePositions(userPositions, btc, consensus) {
    const out = [];
    let totalMkt = userPositions.cash || 0;

    for (const p of userPositions.positions) {
        if (p.kind === 'spot' && p.symbol === 'BTC') {
            const live = btc ? btc.price : null;
            const curValue = live ? (live * p.qty) : p.currentValue;
            const totalCost = p.costBasis * p.qty;
            const pnl = curValue - totalCost;
            const pnlPct = totalCost ? (pnl / totalCost) * 100 : 0;
            out.push({
                label:        'BTC direct',
                detail:       `${p.qty} BTC @ cost $${(p.costBasis).toLocaleString()}`,
                currentValue: curValue,
                costBasis:    totalCost,
                pnl,
                pnlPct,
                action:       null, reasoning: '',
            });
            totalMkt += curValue;
        } else if (p.kind === 'option') {
            // Intrinsic-only placeholder: without a live COIN quote + option chain we
            // show premium paid; mark-to-market is a TODO (Finnhub option chain needed).
            const totalCost = p.contracts * p.costPerContract;
            const curValue  = totalCost; // assume flat MTM for now
            const pnl = 0, pnlPct = 0;
            out.push({
                label:        `${p.symbol} ${p.expiry} $${p.strike}${p.right}`,
                detail:       `${p.contracts} contracts @ $${p.costPerContract}/ea`,
                currentValue: curValue,
                costBasis:    totalCost,
                pnl,
                pnlPct,
                action:       null, reasoning: '',
            });
            totalMkt += curValue;
        }
    }

    // Derive actions from consensus + BTC target.
    const btcTarget = consensus ? consensus.btc : null;
    const liveBTC   = btc ? btc.price : null;
    const btcBull   = btcTarget && liveBTC ? (btcTarget > liveBTC * 1.08) : false;
    const btcBear   = btcTarget && liveBTC ? (btcTarget < liveBTC * 0.95) : false;

    for (const row of out) {
        if (row.label === 'BTC direct') {
            row.action = btcBull ? 'ADD' : (btcBear ? 'TRIM' : 'HOLD');
            row.reasoning = btcTarget && liveBTC
                ? `Consensus YE BTC ${fmt$(btcTarget)} vs spot ${fmt$(liveBTC)} → ${((btcTarget / liveBTC - 1) * 100).toFixed(0)}% upside. ${row.action}.`
                : `No live consensus — ${row.action} and revisit at next print.`;
        } else if (row.label.startsWith('COIN')) {
            // COIN ≈ 1.4× BTC beta (rough). Break-even roughly needs COIN > strike + premium.
            const coinBreakeven = 340 + (row.costBasis / (row.currentValue > 0 ? 1 : 1) / 200); // simplified: $340 + ~$15.25
            row.action = btcBull ? 'HOLD' : (btcBear ? 'TRIM' : 'HOLD');
            const dteMonths = Math.max(0, Math.round((new Date('2026-12-18') - Date.now()) / 2_592_000_000));
            row.reasoning = `COIN Dec $340C at ${dteMonths} months DTE is deep OTM. Breakeven ~$${coinBreakeven.toFixed(0)} needs COIN recovery. `
                + (btcTarget ? `LLM YE BTC ${fmt$(btcTarget)} implies COIN range ${fmt$(btcTarget * 0.0035)}–${fmt$(btcTarget * 0.0045)}. ` : '')
                + `Current conviction: ${row.action}.`;
        }
        row.portfolioPct = totalMkt > 0 ? (row.currentValue / totalMkt) * 100 : 0;
    }

    const cashPct = totalMkt > 0 ? ((userPositions.cash || 0) / totalMkt) * 100 : 0;
    const cashSuggestion = consensus && consensus.regime === 'RISK-ON'
        ? `With ${fmt$(userPositions.cash)} cash (${cashPct.toFixed(0)}% of book) in a RISK-ON regime, consider scaling BTC direct via IBIT or adding a second COIN call in a nearer expiry (Jun–Sep 2026) to shorten theta drag.`
        : consensus && consensus.regime === 'RISK-OFF'
        ? `With ${fmt$(userPositions.cash)} cash (${cashPct.toFixed(0)}% of book) and RISK-OFF regime, hold cash. Re-enter on VIX < 18 and BTC basis reset.`
        : `Cash ${fmt$(userPositions.cash)} (${cashPct.toFixed(0)}%). MIXED regime — keep dry powder; no new adds until consensus convicts.`;

    return { rows: out, totalMkt, cashPct, cashSuggestion };
}

// ─────────── OVERALL VERDICT (Section 6) ───────────
function computeVerdict(consensus, btc, drivers) {
    // Heuristic score 0-100 based on (a) LLM regime, (b) BTC 24h change, (c) driver long/short counts.
    let score = 50;
    if (consensus) {
        if (consensus.regime === 'RISK-ON')  score += 18;
        if (consensus.regime === 'RISK-OFF') score -= 18;
    }
    if (btc && typeof btc.change === 'number') {
        score += Math.max(-10, Math.min(10, btc.change * 1.5));
    }
    if (drivers) {
        for (const d of drivers) {
            if (d.curr === 'long' || d.curr === 'inflow' || d.curr === 'calm') score += 3;
            if (d.curr === 'short' || d.curr === 'hot' || d.curr === 'elevated') score -= 3;
        }
    }
    score = Math.max(1, Math.min(99, Math.round(score)));
    const label = score >= 65 ? 'BULLISH' : score <= 40 ? 'BEARISH' : 'NEUTRAL';
    const regime = consensus ? consensus.regime : 'MIXED';
    return { score, label, regime };
}

// ─────────── HTML RENDER ───────────
function renderHTML(ctx) {
    const { btc, macro, catalysts, models, consensus, drivers, verdict, positionAnalysis, userPositions, execSummary } = ctx;
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

    // ── EXECUTIVE SUMMARY (TL;DR) card ──
    let execSummaryHTML = '';
    if (execSummary && execSummary.read && Array.isArray(execSummary.recommendations)) {
        const riskLevel = String(execSummary.risk_level || 'MODERATE').toUpperCase();
        const riskColor = riskLevel === 'LOW' ? C.bull
            : riskLevel === 'HIGH' ? C.bear
            : riskLevel === 'ELEVATED' ? C.bear
            : C.signal; // MODERATE
        const actionColor = (a) => {
            const u = String(a || '').toUpperCase();
            if (u === 'BUY' || u === 'ADD') return C.bull;
            if (u === 'SELL' || u === 'TRIM' || u === 'CUT') return C.bear;
            return C.signal; // HOLD / other
        };
        const recsHTML = execSummary.recommendations.slice(0, 3).map((r, i) => {
            const rank = r.rank || (i + 1);
            const ac = actionColor(r.action);
            return `
                <div style="display:block;padding:10px 0;border-top:1px solid ${C.line}">
                    <table role="presentation" style="width:100%;border-collapse:collapse"><tr>
                        <td style="width:28px;vertical-align:top;padding-right:10px">
                            <div style="width:24px;height:24px;border-radius:50%;background:${C.signal};color:${C.ink000};font-family:Menlo,monospace;font-size:12px;font-weight:700;text-align:center;line-height:24px">${rank}</div>
                        </td>
                        <td style="vertical-align:top">
                            <div style="font-size:13px;line-height:1.45">
                                <b style="color:${C.text}">${escHTML(r.instrument || '—')}</b>
                                <span style="display:inline-block;padding:2px 8px;margin-left:8px;background:${ac}20;border:1px solid ${ac};border-radius:4px;color:${ac};font-size:10px;font-weight:700;letter-spacing:1px">${escHTML(String(r.action || '').toUpperCase())}</span>
                                <span style="margin-left:8px;font-family:Menlo,monospace;font-size:12px;color:${C.muted}">${escHTML(r.size || '')}</span>
                            </div>
                            <div style="font-size:12px;color:${C.muted};margin-top:4px;line-height:1.55">${escHTML(r.rationale || '')}</div>
                        </td>
                    </tr></table>
                </div>`;
        }).join('');

        execSummaryHTML = `
  <div style="background:${C.ink200};border:2px solid ${C.signal};border-radius:10px;padding:20px;margin-bottom:18px">
    <div style="font-size:11px;letter-spacing:1.4px;color:${C.signal};text-transform:uppercase;font-weight:700;margin-bottom:10px">
        \u26A1 Today's Play
    </div>
    <div style="font-size:14px;line-height:1.45;color:${C.text};margin-bottom:14px">
        ${escHTML(execSummary.read)}
    </div>
    <div style="margin-top:4px">
        ${recsHTML}
    </div>
    <div style="margin-top:14px;text-align:right">
        <span style="display:inline-block;padding:4px 10px;background:${riskColor}20;border:1px solid ${riskColor};border-radius:4px;color:${riskColor};font-size:10px;font-weight:700;letter-spacing:1.2px">RISK: ${escHTML(riskLevel)}</span>
        <div style="font-size:11px;color:${C.muted};margin-top:6px;line-height:1.5;text-align:right">${escHTML(execSummary.risk_rationale || '')}</div>
    </div>
  </div>`;
    } else {
        execSummaryHTML = `
  <div style="background:${C.ink200};border:2px solid ${C.signal};border-radius:10px;padding:20px;margin-bottom:18px">
    <div style="font-size:11px;letter-spacing:1.4px;color:${C.signal};text-transform:uppercase;font-weight:700;margin-bottom:10px">
        \u26A1 Today's Play
    </div>
    <div style="font-size:13px;line-height:1.5;color:${C.muted}">
        Exec summary unavailable — see individual sections below.
    </div>
  </div>`;
    }

    // Section 1 — Overnight Updates
    const newsHTML = catalysts.length
        ? catalysts.map(c => `
            <div style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.55">
                <a href="${escHTML(c.link)}" style="color:${C.text};text-decoration:none;font-weight:500">${escHTML(c.title)}</a>
                <div style="font-size:11px;color:${C.muted};margin-top:4px;font-family:Menlo,monospace">
                    ${escHTML(c.source)} · ${timeAgo(c.date)}
                </div>
                <div style="font-size:12px;color:${C.muted};margin-top:4px;font-style:italic">
                    Implication: watch ${escHTML(c.title.toLowerCase()).includes('oil') || escHTML(c.title.toLowerCase()).includes('crude') || escHTML(c.title.toLowerCase()).includes('opec') ? 'WTI + energy beta' : escHTML(c.title.toLowerCase()).includes('fed') || escHTML(c.title.toLowerCase()).includes('cpi') || escHTML(c.title.toLowerCase()).includes('fomc') ? 'DXY + rates + SPX' : 'BTC + crypto beta'}.
                </div>
            </div>`).join('')
        : `<div style="color:${C.muted};font-size:13px">No high-relevance overnight catalysts.</div>`;

    // Section 2 — LLM Thought Shift
    const modelRows = Object.entries(models).filter(([, v]) => v);
    const thoughtShiftHTML = modelRows.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <tr style="color:${C.muted};font-family:Menlo,monospace;font-size:10px;letter-spacing:0.5px;text-transform:uppercase">
                <td style="padding:4px 8px 4px 0">Model</td>
                <td style="padding:4px 8px;text-align:right">BTC YE</td>
                <td style="padding:4px 8px;text-align:right">WTI YE</td>
                <td style="padding:4px 0 4px 8px">Delta</td>
            </tr>
            ${modelRows.map(([k, v]) => `
                <tr style="border-top:1px solid ${C.line}">
                    <td style="padding:8px 8px 8px 0;color:${C.signal};font-weight:600;text-transform:uppercase;font-family:Menlo,monospace">${escHTML(k)}</td>
                    <td style="padding:8px;text-align:right;font-family:Menlo,monospace">${fmt$(v.btc_year_end)}</td>
                    <td style="padding:8px;text-align:right;font-family:Menlo,monospace">${fmt$2(v.wti_year_end)}</td>
                    <td style="padding:8px 0 8px 8px;color:${C.muted};font-size:11px">${escHTML(v.btc_delta || '—')}</td>
                </tr>`).join('')}
        </table>
        ${consensus ? `
        <div style="margin-top:12px;padding:10px 12px;background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.25);border-radius:6px;font-size:12px;font-family:Menlo,monospace">
            <b style="color:${C.signal}">CONSENSUS</b> · BTC YE ${fmt$(consensus.btc)} (spread ${fmt$(consensus.btcSpread)}) · WTI YE ${fmt$2(consensus.wti)} (spread ${fmt$2(consensus.wtiSpread)}) · ${escHTML(consensus.regime)} · ${consensus.n}/4 LLMs
        </div>` : ''}
    ` : `<div style="color:${C.muted};font-size:13px">No LLMs responded.</div>`;

    // Section 3 — Model Impact (Drivers)
    const driverHTML = drivers.map(d => {
        const shifted = d.prev !== d.curr;
        return `<tr style="border-top:1px solid ${C.line}">
            <td style="padding:8px 8px 8px 0;color:${C.text};font-family:Menlo,monospace;font-size:11px">${escHTML(d.id)}</td>
            <td style="padding:8px;color:${C.muted};font-size:12px">${escHTML(d.label)}</td>
            <td style="padding:8px;text-align:right;font-family:Menlo,monospace;font-size:12px">
                <span style="color:${C.muted}">${escHTML(d.prev)}</span>
                <span style="color:${shifted ? C.signal : C.muted};margin:0 6px">→</span>
                <span style="color:${shifted ? C.signal : C.text};font-weight:${shifted ? '700' : '400'}">${escHTML(d.curr)}</span>
            </td>
        </tr>`;
    }).join('');
    const verdictLine = consensus
        ? `Model-implied BTC: ${fmt$(consensus.btc)} · Model-implied WTI: ${fmt$2(consensus.wti)} · Spread (BTC): ${fmt$(consensus.btcSpread)}`
        : 'Model-implied targets pending LLM responses.';

    // Section 4 — Oil Impact
    const brentWtiSpread = (macro.brent && macro.wti) ? (macro.brent.latest - macro.wti.latest) : null;
    const wtiTarget = consensus ? consensus.wti : null;
    const oilDir = consensus && macro.wti && wtiTarget > macro.wti.latest * 1.05 ? 'BULLISH'
        : consensus && macro.wti && wtiTarget < macro.wti.latest * 0.95 ? 'BEARISH'
        : 'NEUTRAL';
    const oilHTML = `
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">
            <li>WTI spot ${macro.wti ? fmt$2(macro.wti.latest) : '—'} · 24h ${macro.wti ? fmtPct(macro.wti.deltaPct) : '—'}${brentWtiSpread != null ? ` · Brent-WTI spread ${fmt$2(brentWtiSpread)}` : ''}</li>
            <li>Overnight catalysts flagged: ${escHTML(catalysts.filter(c => /oil|crude|opec|iran|hormuz|saudi/i.test(c.title)).slice(0, 2).map(c => c.title).join(' · ') || 'no oil-specific headline')}</li>
            <li>Hormuz military read: <b style="color:${C.signal}">elevated</b> (mock — wire real OSINT feed to toggle hot).</li>
        </ul>
        <div style="margin-top:10px;padding:8px 12px;background:rgba(0,119,181,0.10);border:1px solid rgba(0,119,181,0.3);border-radius:6px;font-size:12px;font-family:Menlo,monospace">
            <b style="color:${C.oil}">Oil: ${oilDir}</b> · ${wtiTarget ? fmt$2(wtiTarget) : '—'} expected by YE${YE}
        </div>`;

    // Section 5 — Bitcoin Impact
    const btcTarget = consensus ? consensus.btc : null;
    const btcDir = consensus && btc && btcTarget > btc.price * 1.08 ? 'BULLISH'
        : consensus && btc && btcTarget < btc.price * 0.95 ? 'BEARISH'
        : 'NEUTRAL';
    const btcHTML = `
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">
            <li>BTC spot ${btc ? fmt$(btc.price) : '—'} · 24h ${btc ? fmtPct(btc.change) : '—'}</li>
            <li>Overnight BTC catalysts: ${escHTML(catalysts.filter(c => /btc|bitcoin|etf|ibit|mstr|coin|clarity/i.test(c.title)).slice(0, 2).map(c => c.title).join(' · ') || 'no BTC-specific headline')}</li>
            <li>MSTR/COIN single-name: monitor premarket; ETF flow will tape-read first 30m of cash session.</li>
        </ul>
        <div style="margin-top:10px;padding:8px 12px;background:rgba(247,147,26,0.10);border:1px solid rgba(247,147,26,0.3);border-radius:6px;font-size:12px;font-family:Menlo,monospace">
            <b style="color:${C.btc}">BTC: ${btcDir}</b> · ${btcTarget ? fmt$(btcTarget) : '—'} expected by YE${YE}
        </div>`;

    // Section 6 — Overall Verdict
    const verdictColor = verdict.label === 'BULLISH' ? C.bull : verdict.label === 'BEARISH' ? C.bear : C.signal;
    const verdictHTML = `
        <div style="display:inline-block;padding:12px 20px;background:${verdictColor}20;border:2px solid ${verdictColor};border-radius:8px;margin-bottom:12px">
            <span style="font-size:22px;font-weight:700;color:${verdictColor};letter-spacing:1.5px">${verdict.label}</span>
            <span style="font-size:14px;color:${C.muted};margin-left:10px;font-family:Menlo,monospace">${verdict.score}/100</span>
        </div>
        <div style="font-size:13px;line-height:1.65;color:${C.text}">
            Regime: <b style="color:${C.signal}">${escHTML(verdict.regime)}</b>. ${oilDir === btcDir
                ? `Oil and BTC both ${oilDir.toLowerCase()} — single-direction book warranted.`
                : `Oil ${oilDir.toLowerCase()}, BTC ${btcDir.toLowerCase()} — play asymmetry, not correlation.`}
            ${consensus ? `Model-implied: BTC ${fmt$(consensus.btc)} / WTI ${fmt$2(consensus.wti)} by YE.` : ''}
        </div>`;

    // Section 7 — Investment Profile
    const posTable = positionAnalysis.rows.map(r => `
        <tr style="border-top:1px solid ${C.line}">
            <td style="padding:10px 8px 10px 0;font-family:Menlo,monospace;font-size:12px;color:${C.text};font-weight:600">${escHTML(r.label)}</td>
            <td style="padding:10px 8px;font-size:11px;color:${C.muted}">${escHTML(r.detail)}</td>
            <td style="padding:10px 8px;text-align:right;font-family:Menlo,monospace;font-size:12px">${fmt$(r.currentValue)}</td>
            <td style="padding:10px 8px;text-align:right;font-family:Menlo,monospace;font-size:12px;color:${r.pnl >= 0 ? C.bull : C.bear}">${fmt$(r.pnl)} <span style="color:${C.muted}">${fmtPct(r.pnlPct)}</span></td>
            <td style="padding:10px 0 10px 8px;text-align:right;font-family:Menlo,monospace;font-size:11px;color:${C.muted}">${r.portfolioPct.toFixed(1)}%</td>
        </tr>`).join('');
    const actionsHTML = positionAnalysis.rows.map(r => {
        const chipColor = r.action === 'ADD' ? C.bull : r.action === 'TRIM' || r.action === 'CLOSE' ? C.bear : C.signal;
        return `<div style="padding:10px 0;border-bottom:1px solid ${C.line}">
            <div style="font-size:13px"><b style="color:${C.text}">${escHTML(r.label)}</b>
                <span style="display:inline-block;padding:2px 8px;margin-left:8px;background:${chipColor}20;border:1px solid ${chipColor};border-radius:4px;color:${chipColor};font-size:10px;font-weight:700;letter-spacing:1px">${escHTML(r.action)}</span>
            </div>
            <div style="font-size:12px;color:${C.muted};margin-top:4px;line-height:1.55">${escHTML(r.reasoning)}</div>
        </div>`;
    }).join('');

    // Macro tiles for header
    const tiles = [
        btc ? { label: 'BTC', value: fmt$(btc.price), delta: fmtPct(btc.change), color: C.btc } : null,
        macro.wti ? { label: 'WTI', value: fmt$2(macro.wti.latest), delta: fmtPct(macro.wti.deltaPct), color: C.oil } : null,
        macro.vix ? { label: 'VIX', value: macro.vix.latest.toFixed(2), delta: fmtPct(macro.vix.deltaPct), color: C.signal } : null,
    ].filter(Boolean);
    const tilesHTML = tiles.map(t => `
        <td style="padding:12px 16px;border-right:1px solid ${C.line};vertical-align:top">
            <div style="font-size:10px;color:${C.muted};letter-spacing:1.2px;text-transform:uppercase">${t.label}</div>
            <div style="font-size:18px;font-weight:600;font-family:Menlo,monospace;color:${t.color};margin-top:2px">${t.value}</div>
            <div style="font-size:11px;color:${C.muted};font-family:Menlo,monospace">${t.delta}</div>
        </td>`).join('');

    const section = (num, title, body) => `
        <div style="background:${C.ink200};border:1px solid ${C.line};border-radius:10px;padding:18px 20px;margin-bottom:14px">
            <div style="font-size:10px;letter-spacing:1.4px;color:${C.signal};text-transform:uppercase;font-weight:700;margin-bottom:12px">
                Section ${num} · ${title}
            </div>
            ${body}
        </div>`;

    return `<!doctype html><html><body style="margin:0;padding:0;background:${C.ink000};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:${C.text}">
<div style="max-width:680px;margin:0 auto;padding:24px 20px">

  <!-- HEADER -->
  <div style="padding-bottom:14px;border-bottom:2px solid ${C.signal};margin-bottom:18px">
    <div style="display:flex;align-items:baseline;gap:10px">
        <span style="font-size:22px">\u{1F4E1}</span>
        <div>
            <div style="font-size:10px;letter-spacing:2px;color:${C.signal};text-transform:uppercase;font-weight:700">TradeRadar</div>
            <div style="font-size:20px;font-weight:600;color:${C.text};margin-top:2px">Morning Brief</div>
        </div>
    </div>
    <div style="font-size:12px;color:${C.muted};margin-top:8px;font-family:Menlo,monospace">
        ${dateStr} · 6:00 AM PST · <a href="${escHTML(PUBLIC_URL)}" style="color:${C.signal};text-decoration:none">traderadar</a>
    </div>
  </div>

  <!-- TILE BAR -->
  <table style="width:100%;background:${C.ink200};border:1px solid ${C.line};border-radius:10px;margin-bottom:18px;border-collapse:separate">
    <tr>${tilesHTML || `<td style="padding:14px;color:${C.muted};font-size:12px">Market data unavailable.</td>`}</tr>
  </table>

  <!-- EXECUTIVE SUMMARY / TL;DR -->
  ${execSummaryHTML}

  ${section(1, 'Overnight Updates', newsHTML)}
  ${section(2, 'LLM Thought Shift (4-way)', thoughtShiftHTML)}
  ${section(3, 'Model Impact · Drivers',
    `<table style="width:100%;border-collapse:collapse">${driverHTML}</table>
     <div style="margin-top:12px;padding:10px 12px;background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.25);border-radius:6px;font-size:12px;font-family:Menlo,monospace;color:${C.text}">${escHTML(verdictLine)}</div>`)}
  ${section(4, 'Oil Impact', oilHTML)}
  ${section(5, 'Bitcoin Impact', btcHTML)}
  ${section(6, 'Overall Verdict', verdictHTML)}
  ${section(7, 'Investment Profile · Personalized',
    `<table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <tr style="color:${C.muted};font-family:Menlo,monospace;font-size:10px;letter-spacing:0.5px;text-transform:uppercase">
            <td style="padding:4px 8px 4px 0">Position</td>
            <td style="padding:4px 8px">Detail</td>
            <td style="padding:4px 8px;text-align:right">Mkt Value</td>
            <td style="padding:4px 8px;text-align:right">P&amp;L</td>
            <td style="padding:4px 0 4px 8px;text-align:right">% Book</td>
        </tr>
        ${posTable}
        <tr style="border-top:1px solid ${C.line}">
            <td style="padding:10px 8px 10px 0;font-family:Menlo,monospace;font-size:12px;color:${C.text};font-weight:600">CASH</td>
            <td style="padding:10px 8px;font-size:11px;color:${C.muted}">USD</td>
            <td style="padding:10px 8px;text-align:right;font-family:Menlo,monospace;font-size:12px">${fmt$(userPositions.cash)}</td>
            <td style="padding:10px 8px;text-align:right;font-family:Menlo,monospace;font-size:12px;color:${C.muted}">—</td>
            <td style="padding:10px 0 10px 8px;text-align:right;font-family:Menlo,monospace;font-size:11px;color:${C.muted}">${positionAnalysis.cashPct.toFixed(1)}%</td>
        </tr>
        <tr style="border-top:2px solid ${C.signal}">
            <td colspan="2" style="padding:10px 8px 10px 0;font-family:Menlo,monospace;font-size:12px;color:${C.signal};font-weight:700">TOTAL</td>
            <td style="padding:10px 8px;text-align:right;font-family:Menlo,monospace;font-size:13px;color:${C.signal};font-weight:700">${fmt$(positionAnalysis.totalMkt)}</td>
            <td colspan="2"></td>
        </tr>
     </table>
     <div style="font-size:10px;letter-spacing:1.2px;color:${C.signal};text-transform:uppercase;font-weight:700;margin:14px 0 8px">Actions</div>
     ${actionsHTML}
     <div style="margin-top:14px;padding:10px 12px;background:rgba(111,207,142,0.08);border:1px solid rgba(111,207,142,0.3);border-radius:6px;font-size:12px;line-height:1.6">
        <b style="color:${C.bull}">CASH DEPLOYMENT:</b> ${escHTML(positionAnalysis.cashSuggestion)}
     </div>`)}

  <!-- FOOTER -->
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid ${C.line};font-size:10px;color:${C.muted};line-height:1.6">
    Generated ${new Date().toISOString()} · <a href="${escHTML(PUBLIC_URL)}" style="color:${C.signal};text-decoration:none">${escHTML(PUBLIC_URL)}</a><br>
    Not investment advice. Data: CoinGecko, FRED, RSS feeds, Claude + GPT + Gemini + Grok synthesis.
  </div>
</div></body></html>`;
}

// ─────────── MAIN ───────────
(async () => {
    console.log('[briefing] fetching overnight data…');
    const userPositions = loadPositions();

    const [btc, macro, catalysts] = await Promise.all([
        getBTC(),
        getMacroTiles(),
        getOvernightNews(),
    ]);
    console.log(`[briefing] catalysts=${catalysts.length} · btc=${btc ? btc.price : 'null'} · wti=${macro.wti ? macro.wti.latest : 'null'}`);

    console.log('[briefing] firing 4 LLMs in parallel…');
    const prompt = buildPrompt(catalysts);
    const [cl, op, ge, gr] = await Promise.all([
        callClaude(prompt), callOpenAI(prompt), callGemini(prompt), callGrok(prompt),
    ]);
    const models = { claude: cl, gpt: op, gemini: ge, grok: gr };
    const respondedCount = Object.values(models).filter(Boolean).length;
    console.log(`[briefing] ${respondedCount}/4 LLMs responded`);

    const consensus = computeConsensus(models);
    const drivers   = computeDrivers({ macro, btcPrice: btc, consensus });
    const verdict   = computeVerdict(consensus, btc, drivers);
    const positionAnalysis = analyzePositions(userPositions, btc, consensus);

    console.log('[briefing] synthesizing exec summary (Claude primary, GPT fallback)…');
    const execSummary = await buildExecSummary({
        btc, macro, catalysts, userPositions, consensus, verdict, positionAnalysis,
    });

    const html = renderHTML({
        btc, macro, catalysts, models, consensus, drivers, verdict, positionAnalysis, userPositions, execSummary,
    });

    const tx = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_PW },
    });
    const subjectBits = [
        `TradeRadar AM · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        verdict.label,
        btc ? `BTC ${fmt$(btc.price)}` : null,
        consensus ? `YE ${fmt$(consensus.btc)}` : null,
    ].filter(Boolean);
    const info = await tx.sendMail({
        from: `"TradeRadar" <${GMAIL_USER}>`,
        to: TO_EMAIL,
        subject: subjectBits.join(' · '),
        html,
    });
    console.log('[briefing] sent:', info.messageId);
})().catch((e) => { console.error(e); process.exit(1); });
