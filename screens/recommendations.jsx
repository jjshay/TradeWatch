// RecommendationsScreen — Tab 4: LLM Recommendations (Consensus + Claude/GPT accordions)
// on the left, a My Positions tracker (user's real book, localStorage-backed)
// at the top-right, and a 5-investment BTC-tied SUGGESTED portfolio rendered on
// both desktop and mobile form factors below.

const rcTokens = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#c9a227',
  btc: '#F7931A',
  bull: '#4EA076', bear: '#D96B6B',
  claude:     '#D97757',
  gpt:        '#0077B5',
  gemini:     '#4285F4',
  grok:       '#9AA3B2',
  perplexity: '#20A4C7',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// PORTFOLIO_SUGGESTED — NOT the user's real book.
// This is a hardcoded AI-suggestion watchlist (BTC-tied ideas) kept as tickers
// the LLM can reason about in the "Illustrative" rails below. The user's real
// positions live in localStorage under `tr_positions_v1` and render in the
// MyPositions panel at the top of the right column.
const PORTFOLIO_SUGGESTED = [
  { ticker: 'IBIT',   name: 'iShares Bitcoin Trust ETF',      alloc: 35, price: 54.82,  chg: +2.14, thesis: 'Direct spot exposure. 14d inflow streak.' },
  { ticker: 'MSTR',   name: 'MicroStrategy (BTC treasury)',    alloc: 25, price: 1842.50, chg: +3.80, thesis: '2.4× leveraged beta to BTC via treasury.' },
  { ticker: 'COIN',   name: 'Coinbase — crypto platform',     alloc: 15, price: 268.40,  chg: +1.95, thesis: 'CLARITY passage = multiple expansion.' },
  { ticker: 'BITB',   name: 'Bitwise Bitcoin ETF',             alloc: 15, price: 61.22,   chg: +2.08, thesis: 'Lower-fee spot ETF diversifier.' },
  { ticker: 'MARA',   name: 'Marathon Digital (miner)',       alloc: 10, price: 21.75,   chg: +4.25, thesis: 'High beta post-halving operating leverage.' },
];

// Seed positions written on FIRST LOAD only (when tr_positions_v1 is absent).
const DEFAULT_POSITIONS = [
  { id: 'p_btc_seed',    type: 'crypto', sym: 'BTC',  qty: 0.011, basis: 98818, label: 'Direct BTC' },
  { id: 'p_coin_seed',   type: 'option', sym: 'COIN', right: 'call', strike: 240, expiry: '2026-12-18', contracts: 2, premium: 1525, label: 'COIN Dec 2026 $240C' },
  { id: 'p_cash_seed',   type: 'cash',   amount: 4350, label: 'Cash' },
];

// Ticker → CoinGecko id map for the crypto quote leg.
const COINGECKO_MAP = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin',
  XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink',
  MATIC: 'matic-network', LTC: 'litecoin', BCH: 'bitcoin-cash', DOT: 'polkadot',
  ATOM: 'cosmos', UNI: 'uniswap', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum',
  OP: 'optimism', SUI: 'sui',
};

const POSITIONS_LS_KEY = 'tr_positions_v1';

function loadPositions() {
  try {
    const raw = localStorage.getItem(POSITIONS_LS_KEY);
    if (!raw) {
      localStorage.setItem(POSITIONS_LS_KEY, JSON.stringify(DEFAULT_POSITIONS));
      return DEFAULT_POSITIONS.slice();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return DEFAULT_POSITIONS.slice();
  } catch (_) {
    return DEFAULT_POSITIONS.slice();
  }
}

function savePositions(list) {
  try { localStorage.setItem(POSITIONS_LS_KEY, JSON.stringify(list)); } catch (_) {}
}

function newPositionId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

function makeBlankPosition(type) {
  if (type === 'crypto') return { id: newPositionId(), type: 'crypto', sym: 'BTC', qty: 0, basis: 0, label: '' };
  if (type === 'option') return { id: newPositionId(), type: 'option', sym: 'COIN', right: 'call', strike: 0, expiry: '', contracts: 1, premium: 0, label: '' };
  return { id: newPositionId(), type: 'cash', amount: 0, label: 'Cash' };
}

const CONSENSUS = {
  stance: 'CONSTRUCTIVE',
  confidence: 78,
  tldr: 'Both models converge on a constructive BTC setup into Q3 2026.',
  bullets: [
    'ETF inflows + CLARITY Act pathway = structural bid through year-end',
    'Oil price remains primary macro risk — watch Strait of Hormuz closely',
    'Allocation tilt: spot exposure > miners; cap leverage at 1/4 book',
    'Key unlock: Fed cut in Q3 compounds the equity-BTC correlation rally',
  ],
};

const CLAUDE_REC = {
  stance: 'BULLISH',
  confidence: 82,
  tldr: 'Risk-on-with-tail. Load IBIT + MSTR; hedge with puts into FOMC.',
  allocTilt: 'Overweight IBIT vs consensus — cleaner expression.',
  whyDifferent: 'Reads CLARITY Act as higher-probability than GPT (70% vs 55%). Prices in 3-year reserve accumulation tail.',
  risks: [
    'If Hormuz closes, oil spike → inflationary reprint → Fed hold → BTC caps at $110k',
    'Political backlash on reserve acquisition — 20% probability of meaningful pause',
  ],
};

const PERPLEXITY_REC = {
  stance: 'CONSTRUCTIVE',
  confidence: 76,
  tldr: 'Web-search synthesis: ETF + CLARITY macro convergence favors BTC longs.',
  allocTilt: 'Spot-dominant; web consensus points to institutional bid continuation.',
  whyDifferent: 'Grounded in real-time web search — cites primary sources for every claim.',
  risks: [
    'Unfavorable headline risk from China EV tariff counter-moves',
    'Cross-reference shows minor divergence on Strait of Hormuz severity',
  ],
};

const GROK_REC = {
  stance: 'NEUTRAL',
  confidence: 68,
  tldr: 'X-signal leans skeptical — political backlash risk rising.',
  allocTilt: 'Keep powder dry; wait for CLARITY Senate outcome.',
  whyDifferent: 'Reads Twitter/X discourse as a contrarian signal — sees crowded long BTC trade.',
  risks: [
    'Social sentiment over-extended on CLARITY outcome',
    'MAGA vs. crypto-right rift if reserve framework underwhelms',
  ],
};

const GEMINI_REC = {
  stance: 'BULLISH',
  confidence: 71,
  tldr: 'Add at dips; macro tailwind persists while liquidity loosens.',
  allocTilt: 'Balanced across IBIT / MSTR / COIN — favors diversified spot.',
  whyDifferent: 'Weights the ETF flow signal most heavily; leans on structural demand thesis vs. tactical positioning.',
  risks: [
    'ETF flow reversal if rates spike unexpectedly',
    'Regulatory uncertainty if CLARITY Act stalls in Senate',
  ],
};

const GPT_REC = {
  stance: 'CONSTRUCTIVE',
  confidence: 74,
  tldr: 'Stay long spot; trim miners on strength; add BITB as diversifier.',
  allocTilt: 'Underweight MARA vs Claude — prefers spot cleanliness.',
  whyDifferent: 'Models CLARITY Act timeline more cautiously — sees Senate markup as the binary. More sensitive to oil headwind through Q4.',
  risks: [
    'Extended consolidation $90-100k if Fed stays hawkish past July',
    'Miner hash-rate fragility if power prices spike with oil',
  ],
};

function RecommendationsScreen({ onNav }) {
  const T = rcTokens;
  const W = 1280, H = 820;

  const [openAccordion, setOpenAccordion] = React.useState('claude'); // 'claude' | 'gpt' | null

  // ── MY POSITIONS (user's real book, localStorage-backed) ──────────────────
  const [positions, setPositions] = React.useState(() => loadPositions());
  const [editMode, setEditMode] = React.useState(false);

  // Persist on every change.
  React.useEffect(() => { savePositions(positions); }, [positions]);

  const updatePosition = (id, patch) => {
    setPositions(list => list.map(p => p.id === id ? { ...p, ...patch } : p));
  };
  const deletePosition = (id) => {
    setPositions(list => list.filter(p => p.id !== id));
  };
  const addPosition = (type) => {
    setPositions(list => [...list, makeBlankPosition(type)]);
  };

  // ── LIVE QUOTES ──────────────────────────────────────────────────────────
  // Crypto leg — prefer LiveData.getCryptoPrices() if present, else direct CG.
  const cryptoSymsNeeded = React.useMemo(() => {
    const set = new Set();
    positions.forEach(p => {
      if (p.type === 'crypto' && p.sym) set.add(p.sym.toUpperCase());
    });
    return Array.from(set);
  }, [positions]);

  const { data: cryptoQuotes } = (window.useAutoUpdate || (() => ({})))(
    `recommend-positions-crypto-${cryptoSymsNeeded.join(',')}`,
    async () => {
      if (!cryptoSymsNeeded.length) return {};
      // Preferred path: shared LiveData helper.
      try {
        if (window.LiveData && typeof window.LiveData.getCryptoPrices === 'function') {
          const all = await window.LiveData.getCryptoPrices();
          if (all && typeof all === 'object') {
            const out = {};
            cryptoSymsNeeded.forEach(sym => {
              const cgId = COINGECKO_MAP[sym];
              if (cgId && all[cgId] && typeof all[cgId].usd === 'number') {
                out[sym] = all[cgId].usd;
              }
            });
            if (Object.keys(out).length) return out;
          }
        }
      } catch (_) { /* fall through */ }
      // Fallback: direct CoinGecko simple/price.
      try {
        const ids = cryptoSymsNeeded.map(s => COINGECKO_MAP[s]).filter(Boolean).join(',');
        if (!ids) return {};
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        if (!r.ok) return {};
        const j = await r.json();
        const out = {};
        cryptoSymsNeeded.forEach(sym => {
          const cgId = COINGECKO_MAP[sym];
          if (cgId && j[cgId] && typeof j[cgId].usd === 'number') out[sym] = j[cgId].usd;
        });
        return out;
      } catch (_) { return {}; }
    },
    { refreshKey: 'recommend' }
  );

  // Finnhub leg — for option underlyings AND the suggested-portfolio tickers.
  const finnhubKey = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';

  const stockSymsNeeded = React.useMemo(() => {
    const set = new Set();
    positions.forEach(p => {
      if (p.type === 'option' && p.sym) set.add(p.sym.toUpperCase());
    });
    // Also include the hardcoded suggestion list so the existing panels still live-quote.
    PORTFOLIO_SUGGESTED.forEach(p => set.add(p.ticker));
    return Array.from(set);
  }, [positions]);

  const { data: stockQuotes } = (window.useAutoUpdate || (() => ({})))(
    `recommend-positions-stocks-${finnhubKey ? 'on' : 'off'}-${stockSymsNeeded.join(',')}`,
    async () => {
      if (!finnhubKey || !stockSymsNeeded.length) return null;
      const out = {};
      for (const sym of stockSymsNeeded) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
          if (r.ok) {
            const q = await r.json();
            if (q && typeof q.c === 'number' && q.c > 0) {
              out[sym] = { price: q.c, changePct: q.dp };
            }
          }
        } catch (_) { /* skip */ }
      }
      return Object.keys(out).length ? out : null;
    },
    { refreshKey: 'recommend' }
  );

  // Derive mark + P&L for each position.
  const enrichedPositions = positions.map(p => {
    if (p.type === 'crypto') {
      const sym = (p.sym || '').toUpperCase();
      const qty = Number(p.qty) || 0;
      const basisPer = Number(p.basis) || 0;
      const mark = cryptoQuotes && cryptoQuotes[sym];
      const basisTotal = qty * basisPer;
      if (typeof mark === 'number' && mark > 0) {
        const currentValue = qty * mark;
        const pnl = currentValue - basisTotal;
        const pnlPct = basisTotal > 0 ? (pnl / basisTotal) * 100 : 0;
        return { ...p, _mark: mark, _currentValue: currentValue, _basisTotal: basisTotal, _pnl: pnl, _pnlPct: pnlPct, _live: true, _detail: `${qty} ${sym} @ $${basisPer.toLocaleString()}` };
      }
      return { ...p, _mark: null, _currentValue: basisTotal, _basisTotal: basisTotal, _pnl: 0, _pnlPct: 0, _live: false, _detail: `${qty} ${sym} @ $${basisPer.toLocaleString()}`, _estimate: true };
    }
    if (p.type === 'option') {
      const sym = (p.sym || '').toUpperCase();
      const contracts = Number(p.contracts) || 0;
      const premium = Number(p.premium) || 0; // premium per contract (total paid per contract)
      const strike = Number(p.strike) || 0;
      const basisTotal = contracts * premium;
      const under = stockQuotes && stockQuotes[sym];
      if (under && typeof under.price === 'number' && under.price > 0) {
        // MVP mark = intrinsic value (rough). For puts: max(0, strike - spot) * 100.
        const intrinsic = p.right === 'put'
          ? Math.max(0, strike - under.price)
          : Math.max(0, under.price - strike);
        const currentValue = intrinsic * 100 * contracts;
        const pnl = currentValue - basisTotal;
        const pnlPct = basisTotal > 0 ? (pnl / basisTotal) * 100 : 0;
        return { ...p, _mark: under.price, _currentValue: currentValue, _basisTotal: basisTotal, _pnl: pnl, _pnlPct: pnlPct, _live: true, _estimate: true, _detail: `${contracts}× ${sym} ${(p.right || 'call').toUpperCase()} $${strike} ${p.expiry || ''}` };
      }
      return { ...p, _mark: null, _currentValue: basisTotal, _basisTotal: basisTotal, _pnl: 0, _pnlPct: 0, _live: false, _estimate: true, _detail: `${contracts}× ${sym} ${(p.right || 'call').toUpperCase()} $${strike} ${p.expiry || ''}` };
    }
    // cash
    const amount = Number(p.amount) || 0;
    return { ...p, _mark: null, _currentValue: amount, _basisTotal: amount, _pnl: 0, _pnlPct: 0, _live: true, _detail: 'USD' };
  });

  const summary = (() => {
    let total = 0, basis = 0, cash = 0, crypto = 0, option = 0;
    enrichedPositions.forEach(p => {
      total += p._currentValue;
      basis += p._basisTotal;
      if (p.type === 'cash') cash += p._currentValue;
      else if (p.type === 'crypto') crypto += p._currentValue;
      else if (p.type === 'option') option += p._currentValue;
    });
    const pnl = total - basis;
    const pnlPct = basis > 0 ? (pnl / basis) * 100 : 0;
    const pct = (x) => total > 0 ? (x / total) * 100 : 0;
    return { total, basis, pnl, pnlPct, cashPct: pct(cash), cryptoPct: pct(crypto), optionPct: pct(option) };
  })();

  // ── SUGGESTED PORTFOLIO (LLM watchlist) ──────────────────────────────────
  const livePortfolio = PORTFOLIO_SUGGESTED.map(p => {
    const live = stockQuotes && stockQuotes[p.ticker];
    return live ? { ...p, price: live.price, chg: live.changePct, _live: true } : p;
  });

  // ── LIVE DUAL-LLM RECS ───────────────────────────────────────────────────
  const { data: dual, loading: aiLoading, lastFetch: aiLastFetch, error: aiError } =
    (window.useAutoUpdate || (() => ({})))(
      'recommend-dual-llm',
      async () => {
        if (typeof NewsFeed === 'undefined' || typeof AIAnalysis === 'undefined') return null;
        const keys = AIAnalysis.getKeys();
        if (!keys.claude && !keys.openai && !keys.gemini) return null;
        const articles = await NewsFeed.fetchAll();
        if (!articles || !articles.length) return null;
        return await AIAnalysis.runMulti(articles.slice(0, 15), { full: true });
      },
      { refreshKey: 'recommend' }
    );

  const claudeRec = (dual && dual.claude && dual.claude.result) ? {
    stance: (dual.claude.result.sentiment || 'neutral').toUpperCase(),
    confidence: Math.round((dual.claude.result.confidence || 0) * 10),
    tldr: dual.claude.result.summary || CLAUDE_REC.tldr,
    allocTilt: (dual.claude.result.actionable && dual.claude.result.actionable[0])
      ? `${dual.claude.result.actionable[0].action} ${dual.claude.result.actionable[0].asset} · ${dual.claude.result.actionable[0].reasoning}`
      : CLAUDE_REC.allocTilt,
    whyDifferent: (dual.claude.result.opportunities || []).join(' · ') || CLAUDE_REC.whyDifferent,
    risks: dual.claude.result.risks || CLAUDE_REC.risks,
    _live: true,
  } : CLAUDE_REC;

  const perplexityRec = (dual && dual.perplexity && dual.perplexity.result) ? {
    stance: (dual.perplexity.result.sentiment || 'neutral').toUpperCase(),
    confidence: Math.round((dual.perplexity.result.confidence || 0) * 10),
    tldr: dual.perplexity.result.summary || PERPLEXITY_REC.tldr,
    allocTilt: (dual.perplexity.result.actionable && dual.perplexity.result.actionable[0])
      ? `${dual.perplexity.result.actionable[0].action} ${dual.perplexity.result.actionable[0].asset} · ${dual.perplexity.result.actionable[0].reasoning}`
      : PERPLEXITY_REC.allocTilt,
    whyDifferent: (dual.perplexity.result.opportunities || []).join(' · ') || PERPLEXITY_REC.whyDifferent,
    risks: dual.perplexity.result.risks || PERPLEXITY_REC.risks,
    _live: true,
  } : PERPLEXITY_REC;

  const grokRec = (dual && dual.grok && dual.grok.result) ? {
    stance: (dual.grok.result.sentiment || 'neutral').toUpperCase(),
    confidence: Math.round((dual.grok.result.confidence || 0) * 10),
    tldr: dual.grok.result.summary || GROK_REC.tldr,
    allocTilt: (dual.grok.result.actionable && dual.grok.result.actionable[0])
      ? `${dual.grok.result.actionable[0].action} ${dual.grok.result.actionable[0].asset} · ${dual.grok.result.actionable[0].reasoning}`
      : GROK_REC.allocTilt,
    whyDifferent: (dual.grok.result.opportunities || []).join(' · ') || GROK_REC.whyDifferent,
    risks: dual.grok.result.risks || GROK_REC.risks,
    _live: true,
  } : GROK_REC;

  const geminiRec = (dual && dual.gemini && dual.gemini.result) ? {
    stance: (dual.gemini.result.sentiment || 'neutral').toUpperCase(),
    confidence: Math.round((dual.gemini.result.confidence || 0) * 10),
    tldr: dual.gemini.result.summary || GEMINI_REC.tldr,
    allocTilt: (dual.gemini.result.actionable && dual.gemini.result.actionable[0])
      ? `${dual.gemini.result.actionable[0].action} ${dual.gemini.result.actionable[0].asset} · ${dual.gemini.result.actionable[0].reasoning}`
      : GEMINI_REC.allocTilt,
    whyDifferent: (dual.gemini.result.opportunities || []).join(' · ') || GEMINI_REC.whyDifferent,
    risks: dual.gemini.result.risks || GEMINI_REC.risks,
    _live: true,
  } : GEMINI_REC;

  const gptRec = (dual && dual.gpt && dual.gpt.result) ? {
    stance: (dual.gpt.result.sentiment || 'neutral').toUpperCase(),
    confidence: Math.round((dual.gpt.result.confidence || 0) * 10),
    tldr: dual.gpt.result.summary || GPT_REC.tldr,
    allocTilt: (dual.gpt.result.actionable && dual.gpt.result.actionable[0])
      ? `${dual.gpt.result.actionable[0].action} ${dual.gpt.result.actionable[0].asset} · ${dual.gpt.result.actionable[0].reasoning}`
      : GPT_REC.allocTilt,
    whyDifferent: (dual.gpt.result.opportunities || []).join(' · ') || GPT_REC.whyDifferent,
    risks: dual.gpt.result.risks || GPT_REC.risks,
    _live: true,
  } : GPT_REC;

  const consensus = (dual && dual.consensus) ? {
    stance: dual.consensus.agree ? dual.consensus.sentiment.toUpperCase() : 'MIXED',
    confidence: Math.round((parseFloat(dual.consensus.avgConfidence) || 0) * 10),
    tldr: dual.consensus.summary,
    bullets: [
      ...((dual.claude.result && dual.claude.result.opportunities) || []).slice(0, 2),
      ...((dual.gpt.result && dual.gpt.result.opportunities) || []).slice(0, 2),
    ].filter(Boolean).length ? [
      ...((dual.claude.result && dual.claude.result.opportunities) || []).slice(0, 2),
      ...((dual.gpt.result && dual.gpt.result.opportunities) || []).slice(0, 2),
    ] : CONSENSUS.bullets,
    _live: true,
    _agree: dual.consensus.agree,
  } : CONSENSUS;

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
        <img src="assets/gg-logo.png" alt="Global Gauntlet"
        style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(201,162,39,0.28))' }} />
      <div style={{ marginLeft: 12, fontSize: 15, fontWeight: 500, color: T.text, letterSpacing: 0.2 }}>TradeRadar</div>

        <TRTabBar current="recommend" onNav={onNav} />

        <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
          <span style={{ color: T.signal }}>●</span>&nbsp; MY POSITIONS · LLM RECOMMENDATIONS
        </div>
      </div>

      <div style={{ display: 'flex', height: H - 52 }}>

        {/* LEFT — Recommendations (Consensus top, Claude/GPT accordion below) */}
        <div style={{
          width: 640, background: T.ink100, borderRight: `1px solid ${T.edge}`,
          padding: '20px 22px 0', display: 'flex', flexDirection: 'column',
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1, color: T.textDim,
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 4,
          }}>Recommendations</div>
          <div style={{
            fontSize: 15, fontWeight: 500, color: T.text,
            letterSpacing: -0.2, marginBottom: 14,
          }}>What the models think you should do</div>

          {/* CONSENSUS CARD */}
          <div style={{
            background: 'linear-gradient(180deg, rgba(232,184,74,0.08) 0%, rgba(232,184,74,0.02) 100%)',
            border: `1px solid rgba(232,184,74,0.3)`,
            borderRadius: 10, padding: '14px 18px 16px', marginBottom: 14,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${T.signal} 50%, transparent 100%)`,
              opacity: 0.5,
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'linear-gradient(135deg, rgba(217,119,87,0.4), rgba(107,138,250,0.4))',
                border: `0.5px solid ${T.edgeHi}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: T.claude }} />
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: T.gpt }} />
                </div>
              </div>
              <div style={{
                fontSize: 9.5, letterSpacing: 1.2, color: T.signal,
                textTransform: 'uppercase', fontWeight: 600,
              }}>Consensus</div>
              <div style={{
                marginLeft: 'auto', padding: '3px 10px',
                background: 'rgba(78,160,118,0.15)',
                border: `0.5px solid rgba(78,160,118,0.4)`,
                borderRadius: 5,
                fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, color: T.bull, letterSpacing: 0.6,
              }}>{consensus.stance}</div>
              <div style={{
                fontFamily: T.mono, fontSize: 10, color: T.textMid, letterSpacing: 0.3,
              }}>CONF {consensus.confidence}</div>
              {consensus._live && (
                <div style={{
                  fontFamily: T.mono, fontSize: 9, color: consensus._agree ? T.bull : T.bear,
                  letterSpacing: 0.6, padding: '2px 6px', borderRadius: 4,
                  background: consensus._agree ? 'rgba(78,160,118,0.12)' : 'rgba(217,107,107,0.12)',
                  border: `0.5px solid ${consensus._agree ? 'rgba(78,160,118,0.4)' : 'rgba(217,107,107,0.4)'}`,
                }}>{consensus._agree ? 'LIVE · ALIGNED' : 'LIVE · DIVERGENT'}</div>
              )}
              {aiLoading && !consensus._live && (
                <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.6 }}>
                  ANALYZING…
                </div>
              )}
            </div>

            <div style={{
              fontSize: 15, lineHeight: 1.45, color: T.text, fontWeight: 500,
              letterSpacing: -0.1, marginBottom: 12,
            }}>{consensus.tldr}</div>

            <ul style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {consensus.bullets.map((b, i) => (
                <li key={i} style={{
                  display: 'flex', gap: 8, fontSize: 12, color: T.textMid, lineHeight: 1.5,
                }}>
                  <span style={{ color: T.signal, fontFamily: T.mono, flexShrink: 0 }}>→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CLAUDE ACCORDION */}
          <AccordionCard
            T={T} brand={T.claude} brandName="Claude"
            live={claudeRec._live}
            open={openAccordion === 'claude'}
            onToggle={() => setOpenAccordion(openAccordion === 'claude' ? null : 'claude')}
            rec={claudeRec}
          />

          {/* GPT ACCORDION */}
          <AccordionCard
            T={T} brand={T.gpt} brandName="ChatGPT"
            live={gptRec._live}
            open={openAccordion === 'gpt'}
            onToggle={() => setOpenAccordion(openAccordion === 'gpt' ? null : 'gpt')}
            rec={gptRec}
          />

          {/* GEMINI ACCORDION */}
          <AccordionCard
            T={T} brand={T.gemini} brandName="Gemini"
            live={geminiRec._live}
            open={openAccordion === 'gemini'}
            onToggle={() => setOpenAccordion(openAccordion === 'gemini' ? null : 'gemini')}
            rec={geminiRec}
          />

          {/* GROK ACCORDION */}
          <AccordionCard
            T={T} brand={T.grok} brandName="Grok"
            live={grokRec._live}
            open={openAccordion === 'grok'}
            onToggle={() => setOpenAccordion(openAccordion === 'grok' ? null : 'grok')}
            rec={grokRec}
          />

          {/* PERPLEXITY ACCORDION */}
          <AccordionCard
            T={T} brand={T.perplexity} brandName="Perplexity"
            live={perplexityRec._live}
            open={openAccordion === 'perplexity'}
            onToggle={() => setOpenAccordion(openAccordion === 'perplexity' ? null : 'perplexity')}
            rec={perplexityRec}
          />

          <div style={{ height: 20 }} />
        </div>

        {/* RIGHT — My Positions (top) + Suggested portfolio below */}
        <div style={{
          flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14,
          background: T.ink000, overflowY: 'auto', overflowX: 'hidden', minWidth: 0,
        }}>

          {/* MY POSITIONS PANEL */}
          <MyPositionsPanel
            T={T}
            positions={enrichedPositions}
            summary={summary}
            editMode={editMode}
            onToggleEdit={() => setEditMode(m => !m)}
            onUpdate={updatePosition}
            onDelete={deletePosition}
            onAdd={addPosition}
            finnhubKey={finnhubKey}
          />

          <div style={{
            fontSize: 10, letterSpacing: 1, color: T.textDim,
            textTransform: 'uppercase', fontWeight: 500, marginBottom: -4, marginTop: 6,
          }}>Suggested Ideas · BTC-Tied · Across Devices</div>

          {/* Desktop frame */}
          <div>
            <DeviceLabel T={T} text="Desktop · web app" />
            <DesktopFrame T={T}>
              <PortfolioDesktop T={T} portfolio={livePortfolio} />
            </DesktopFrame>
          </div>

          {/* Mobile frame */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <DeviceLabel T={T} text="Mobile · iPhone" center />
              <MobileFrame T={T}>
                <PortfolioMobile T={T} portfolio={livePortfolio} />
              </MobileFrame>
            </div>
          </div>

          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MY POSITIONS — user's real book, localStorage-backed
// ═══════════════════════════════════════════════════════════════════════════

function MyPositionsPanel({ T, positions, summary, editMode, onToggleEdit, onUpdate, onDelete, onAdd, finnhubKey }) {
  const pnlColor = summary.pnl >= 0 ? T.bull : T.bear;
  const fmtMoney = (x) => {
    const n = Number(x) || 0;
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  const fmtPct = (x) => `${(x >= 0 ? '+' : '')}${(Number(x) || 0).toFixed(2)}%`;

  return (
    <div style={{
      background: T.ink100,
      border: `1px solid ${T.edge}`,
      borderRadius: 10,
      padding: '14px 16px 14px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          fontSize: 10, letterSpacing: 1.2, color: T.signal,
          textTransform: 'uppercase', fontWeight: 600,
        }}>My Positions</div>
        <div style={{
          fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.5,
        }}>{positions.length} {positions.length === 1 ? 'POS' : 'POS'} · LIVE</div>
        {!finnhubKey && (
          <div style={{
            fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.5,
            padding: '2px 6px', borderRadius: 4, border: `0.5px solid ${T.edge}`,
          }}>NO FINNHUB KEY · EST</div>
        )}
        <button
          onClick={onToggleEdit}
          style={{
            marginLeft: 'auto',
            background: editMode ? `${T.signal}1a` : 'transparent',
            border: `0.5px solid ${editMode ? T.signal : T.edge}`,
            color: editMode ? T.signal : T.textMid,
            padding: '4px 10px', borderRadius: 6,
            fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
            letterSpacing: 0.5, cursor: 'pointer',
          }}>
          {editMode ? '✓ DONE' : '✎ EDIT'}
        </button>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
        marginBottom: 14,
      }}>
        <SummaryTile T={T} label="TOTAL VALUE" value={fmtMoney(summary.total)} accent={T.text} />
        <SummaryTile T={T} label="UNREALIZED P&L" value={`${fmtMoney(summary.pnl)} · ${fmtPct(summary.pnlPct)}`} accent={pnlColor} />
        <SummaryTile T={T} label="MIX · CRYPTO / OPT / CASH"
          value={`${summary.cryptoPct.toFixed(0)}% · ${summary.optionPct.toFixed(0)}% · ${summary.cashPct.toFixed(0)}%`}
          accent={T.signal} />
        <SummaryTile T={T} label="BASIS" value={fmtMoney(summary.basis)} accent={T.textMid} />
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: editMode
          ? '60px 70px 1fr 90px 90px 90px 70px 24px'
          : '60px 70px 1fr 90px 90px 90px 70px',
        gap: 8, padding: '0 10px 6px',
        fontFamily: T.mono, fontSize: 8.5, color: T.textDim, letterSpacing: 0.7, fontWeight: 600,
      }}>
        <div>TYPE</div>
        <div>SYMBOL</div>
        <div>DETAIL</div>
        <div style={{ textAlign: 'right' }}>BASIS</div>
        <div style={{ textAlign: 'right' }}>CURRENT</div>
        <div style={{ textAlign: 'right' }}>P&L $</div>
        <div style={{ textAlign: 'right' }}>P&L %</div>
        {editMode && <div />}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {positions.length === 0 && (
          <div style={{
            padding: '18px 10px', textAlign: 'center', fontSize: 11, color: T.textDim,
            border: `0.5px dashed ${T.edge}`, borderRadius: 7,
          }}>
            No positions yet. Use the +Position buttons below to add one.
          </div>
        )}
        {positions.map(p => (
          <PositionRow
            key={p.id}
            T={T}
            p={p}
            editMode={editMode}
            onUpdate={onUpdate}
            onDelete={onDelete}
            fmtMoney={fmtMoney}
            fmtPct={fmtPct}
          />
        ))}
      </div>

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <AddButton T={T} onClick={() => onAdd('crypto')} label="+ Crypto" />
        <AddButton T={T} onClick={() => onAdd('option')} label="+ Option" />
        <AddButton T={T} onClick={() => onAdd('cash')} label="+ Cash" />
      </div>
    </div>
  );
}

function SummaryTile({ T, label, value, accent }) {
  return (
    <div style={{
      background: T.ink200, border: `0.5px solid ${T.edge}`,
      borderRadius: 7, padding: '8px 10px',
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 8.5, color: T.textDim,
        letterSpacing: 0.6, fontWeight: 600, marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontFamily: T.mono, fontSize: 13, color: accent, fontWeight: 600, letterSpacing: -0.2,
      }}>{value}</div>
    </div>
  );
}

function AddButton({ T, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: `0.5px dashed ${T.edge}`,
        color: T.textMid, padding: '6px 12px', borderRadius: 6,
        fontFamily: T.mono, fontSize: 10, fontWeight: 600,
        letterSpacing: 0.5, cursor: 'pointer',
      }}>
      {label}
    </button>
  );
}

function PositionRow({ T, p, editMode, onUpdate, onDelete, fmtMoney, fmtPct }) {
  const pnlColor = p._pnl > 0 ? T.bull : (p._pnl < 0 ? T.bear : T.textMid);
  const typeLabel = p.type === 'crypto' ? 'CRYPTO' : p.type === 'option' ? 'OPTION' : 'CASH';
  const typeColor = p.type === 'crypto' ? T.btc : p.type === 'option' ? T.signal : T.textMid;

  const inputStyle = {
    background: T.ink300, border: `0.5px solid ${T.edge}`, color: T.text,
    borderRadius: 4, padding: '3px 6px', fontFamily: T.mono, fontSize: 10.5,
    width: '100%', boxSizing: 'border-box',
  };

  const cols = editMode
    ? '60px 70px 1fr 90px 90px 90px 70px 24px'
    : '60px 70px 1fr 90px 90px 90px 70px';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, gap: 8,
      padding: '8px 10px', alignItems: 'center',
      background: T.ink200, border: `0.5px solid ${T.edge}`, borderRadius: 7,
    }}>
      {/* TYPE badge */}
      <div style={{
        fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: typeColor,
        letterSpacing: 0.6, textAlign: 'left',
      }}>{typeLabel}</div>

      {/* SYMBOL */}
      <div>
        {editMode && p.type !== 'cash' ? (
          <input
            value={p.sym || ''}
            onChange={e => onUpdate(p.id, { sym: e.target.value.toUpperCase() })}
            style={inputStyle}
          />
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 600, color: T.text, letterSpacing: 0.3 }}>
            {p.type === 'cash' ? 'USD' : (p.sym || '—')}
          </div>
        )}
      </div>

      {/* DETAIL — per-type editor or readonly description */}
      <div style={{ minWidth: 0 }}>
        {editMode ? (
          <PositionDetailEditor T={T} p={p} onUpdate={onUpdate} inputStyle={inputStyle} />
        ) : (
          <div style={{ fontSize: 11, color: T.textMid, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.label ? <span style={{ color: T.text, fontWeight: 500 }}>{p.label}</span> : null}
            {p.label && <span style={{ color: T.textDim }}> · </span>}
            <span>{p._detail}</span>
            {p._estimate && <span style={{ color: T.textDim }}> · (est)</span>}
          </div>
        )}
      </div>

      {/* BASIS */}
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, textAlign: 'right' }}>
        {fmtMoney(p._basisTotal)}
      </div>

      {/* CURRENT */}
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text, textAlign: 'right', fontWeight: 500 }}>
        {fmtMoney(p._currentValue)}
      </div>

      {/* P&L $ */}
      <div style={{ fontFamily: T.mono, fontSize: 11, color: pnlColor, textAlign: 'right', fontWeight: 600 }}>
        {p.type === 'cash' ? '—' : fmtMoney(p._pnl)}
      </div>

      {/* P&L % */}
      <div style={{ fontFamily: T.mono, fontSize: 11, color: pnlColor, textAlign: 'right', fontWeight: 600 }}>
        {p.type === 'cash' ? '—' : fmtPct(p._pnlPct)}
      </div>

      {/* DELETE */}
      {editMode && (
        <button
          onClick={() => onDelete(p.id)}
          title="Delete position"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.bear, fontFamily: T.mono, fontSize: 14, fontWeight: 600, padding: 0,
          }}>×</button>
      )}
    </div>
  );
}

function PositionDetailEditor({ T, p, onUpdate, inputStyle }) {
  if (p.type === 'crypto') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: 4 }}>
        <input placeholder="Qty" value={p.qty ?? ''}
          onChange={e => onUpdate(p.id, { qty: parseFloat(e.target.value) || 0 })}
          style={inputStyle} />
        <input placeholder="Basis $/unit" value={p.basis ?? ''}
          onChange={e => onUpdate(p.id, { basis: parseFloat(e.target.value) || 0 })}
          style={inputStyle} />
        <input placeholder="Label" value={p.label || ''}
          onChange={e => onUpdate(p.id, { label: e.target.value })}
          style={inputStyle} />
      </div>
    );
  }
  if (p.type === 'option') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '56px 56px 100px 56px 72px 1fr', gap: 4 }}>
        <select value={p.right || 'call'}
          onChange={e => onUpdate(p.id, { right: e.target.value })}
          style={{ ...inputStyle, padding: '3px 4px' }}>
          <option value="call">call</option>
          <option value="put">put</option>
        </select>
        <input placeholder="Strike" value={p.strike ?? ''}
          onChange={e => onUpdate(p.id, { strike: parseFloat(e.target.value) || 0 })}
          style={inputStyle} />
        <input type="date" value={p.expiry || ''}
          onChange={e => onUpdate(p.id, { expiry: e.target.value })}
          style={inputStyle} />
        <input placeholder="#" value={p.contracts ?? ''}
          onChange={e => onUpdate(p.id, { contracts: parseInt(e.target.value) || 0 })}
          style={inputStyle} />
        <input placeholder="Prem/ct" value={p.premium ?? ''}
          onChange={e => onUpdate(p.id, { premium: parseFloat(e.target.value) || 0 })}
          style={inputStyle} />
        <input placeholder="Label" value={p.label || ''}
          onChange={e => onUpdate(p.id, { label: e.target.value })}
          style={inputStyle} />
      </div>
    );
  }
  // cash
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 4 }}>
      <input placeholder="Amount" value={p.amount ?? ''}
        onChange={e => onUpdate(p.id, { amount: parseFloat(e.target.value) || 0 })}
        style={inputStyle} />
      <input placeholder="Label" value={p.label || 'Cash'}
        onChange={e => onUpdate(p.id, { label: e.target.value })}
        style={inputStyle} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXISTING COMPONENTS (unchanged below)
// ═══════════════════════════════════════════════════════════════════════════

function AccordionCard({ T, brand, brandName, open, onToggle, rec, live }) {
  return (
    <div style={{
      background: T.ink200,
      border: `1px solid ${open ? T.edgeHi : T.edge}`,
      borderRadius: 10, marginBottom: 10,
      overflow: 'hidden',
      transition: 'border-color 140ms ease',
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
          borderBottom: open ? `0.5px solid ${T.edge}` : 'none',
          transition: 'background 140ms ease',
        }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `${brand}22`, border: `0.5px solid ${brand}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: brand }} />
        </div>
        <div style={{
          fontSize: 13, fontWeight: 500, color: T.text,
        }}>{brandName}</div>
        <div style={{
          marginLeft: 8, padding: '2px 8px',
          background: `${brand}1a`, border: `0.5px solid ${brand}55`,
          borderRadius: 5, fontFamily: T.mono, fontSize: 9, fontWeight: 600,
          color: brand, letterSpacing: 0.6,
        }}>{rec.stance}</div>
        <div style={{
          fontFamily: T.mono, fontSize: 10, color: T.textMid, letterSpacing: 0.3,
        }}>CONF {rec.confidence}</div>
        {live && (
          <div style={{
            padding: '2px 7px', fontFamily: T.mono, fontSize: 9, fontWeight: 600,
            color: T.bull, letterSpacing: 0.6, borderRadius: 4,
            background: 'rgba(78,160,118,0.12)',
            border: '0.5px solid rgba(78,160,118,0.4)',
          }}>LIVE</div>
        )}
        <div style={{
          marginLeft: 'auto', fontFamily: T.mono, fontSize: 14, color: T.textMid,
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 180ms ease',
        }}>›</div>
      </div>

      {open && (
        <div style={{ padding: '12px 16px 16px' }}>
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: T.text, marginBottom: 12,
            fontWeight: 500, letterSpacing: -0.05,
          }}>{rec.tldr}</div>

          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, alignItems: 'baseline',
            marginBottom: 10,
          }}>
            <div style={{
              fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.6, fontWeight: 600,
            }}>TILT</div>
            <div style={{ fontSize: 11.5, color: T.textMid, lineHeight: 1.5 }}>
              {rec.allocTilt}
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, alignItems: 'baseline',
            marginBottom: 10,
          }}>
            <div style={{
              fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.6, fontWeight: 600,
            }}>DIVERGENCE</div>
            <div style={{ fontSize: 11.5, color: T.textMid, lineHeight: 1.5 }}>
              {rec.whyDifferent}
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, alignItems: 'baseline',
          }}>
            <div style={{
              fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.6, fontWeight: 600,
            }}>RISKS</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rec.risks.map((r, i) => (
                <li key={i} style={{
                  display: 'flex', gap: 7, fontSize: 11, color: T.textMid, lineHeight: 1.5,
                }}>
                  <span style={{ color: T.bear, fontFamily: T.mono, flexShrink: 0 }}>!</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceLabel({ T, text, center }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: 0.8, color: T.textDim, fontFamily: T.mono,
      textTransform: 'uppercase', fontWeight: 600, marginBottom: 6,
      textAlign: center ? 'center' : 'left',
    }}>{text}</div>
  );
}

function DesktopFrame({ T, children }) {
  return (
    <div style={{
      background: T.ink100, border: `1px solid ${T.edge}`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Traffic-light bar */}
      <div style={{
        height: 22, background: '#050709',
        display: 'flex', alignItems: 'center', padding: '0 10px',
        borderBottom: `0.5px solid rgba(255,255,255,0.04)`,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: 4, background: c, opacity: 0.55 }} />
          ))}
        </div>
        <div style={{
          marginLeft: 12, fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.4,
        }}>tradewatch.app / portfolio</div>
      </div>
      {children}
    </div>
  );
}

function MobileFrame({ T, children }) {
  return (
    <div style={{
      width: 280, height: 560,
      background: '#000', borderRadius: 36,
      padding: 7,
      boxShadow: '0 30px 60px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.08)',
      position: 'relative',
    }}>
      {/* Dynamic Island */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        width: 80, height: 22, background: '#000', borderRadius: 16, zIndex: 2,
      }} />
      <div style={{
        width: '100%', height: '100%',
        background: T.ink000, borderRadius: 30,
        overflow: 'hidden', position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Status bar */}
        <div style={{
          padding: '14px 22px 6px', display: 'flex', alignItems: 'center',
          fontFamily: T.mono, fontSize: 10, color: T.text, fontWeight: 600,
        }}>
          <div>9:41</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <TRLiveStripInline />
          <TRGearInline />
            <div style={{ fontSize: 9, color: T.textMid }}>●●●●</div>
            <div style={{ width: 16, height: 8, border: `1px solid ${T.textMid}`, borderRadius: 2, padding: 1 }}>
              <div style={{ width: '70%', height: '100%', background: T.textMid }} />
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PortfolioDesktop({ T, portfolio }) {
  const PORTFOLIO = portfolio || [];
  const totalValue = 248750;
  const dayChg = +5240;
  const dayPct = +2.15;
  return (
    <div style={{ padding: '14px 18px 18px', background: T.ink000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.mono, letterSpacing: 0.6, marginBottom: 2 }}>
            PORTFOLIO VALUE
          </div>
          <div style={{ fontSize: 26, fontWeight: 500, color: T.text, fontFamily: T.mono, letterSpacing: -0.4 }}>
            ${totalValue.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.mono, letterSpacing: 0.6, marginBottom: 2 }}>
            24H
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.bull, fontFamily: T.mono }}>
            +${dayChg.toLocaleString()} · +{dayPct}%
          </div>
        </div>
        <div style={{
          marginLeft: 'auto', padding: '4px 10px',
          background: 'rgba(247,147,26,0.1)', border: `0.5px solid rgba(247,147,26,0.3)`,
          borderRadius: 5, fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, color: T.btc, letterSpacing: 0.6,
        }}>100% BTC-TIED</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '70px 1fr 70px 90px 60px 1fr',
          gap: 12, padding: '0 10px',
          fontFamily: T.mono, fontSize: 8.5, color: T.textDim, letterSpacing: 0.7, fontWeight: 600,
        }}>
          <div>TICKER</div><div>NAME</div>
          <div style={{ textAlign: 'right' }}>PRICE</div>
          <div style={{ textAlign: 'right' }}>24H</div>
          <div style={{ textAlign: 'right' }}>ALLOC</div>
          <div>THESIS</div>
        </div>
        {PORTFOLIO.map(p => (
          <div key={p.ticker} style={{
            display: 'grid', gridTemplateColumns: '70px 1fr 70px 90px 60px 1fr',
            gap: 12, padding: '8px 10px', alignItems: 'center',
            background: T.ink200, border: `0.5px solid ${T.edge}`, borderRadius: 7,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.btc, letterSpacing: 0.3 }}>
              {p.ticker}
            </div>
            <div style={{ fontSize: 11, color: T.textMid }}>{p.name}</div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text, textAlign: 'right' }}>
              ${p.price.toFixed(2)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: p.chg >= 0 ? T.bull : T.bear, textAlign: 'right', fontWeight: 500 }}>
              {p.chg >= 0 ? '+' : ''}{p.chg}%
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: 11, color: T.signal, textAlign: 'right', fontWeight: 600,
            }}>{p.alloc}%</div>
            <div style={{ fontSize: 10.5, color: T.textDim, lineHeight: 1.4 }}>{p.thesis}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioMobile({ T, portfolio }) {
  const PORTFOLIO = portfolio || [];
  const totalValue = 248750;
  return (
    <div style={{
      flex: 1, padding: '6px 14px 14px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: 9, color: T.textDim, fontFamily: T.mono, letterSpacing: 0.5, marginBottom: 2,
      }}>PORTFOLIO</div>
      <div style={{
        fontSize: 22, fontWeight: 500, color: T.text, fontFamily: T.mono, letterSpacing: -0.4,
      }}>${totalValue.toLocaleString()}</div>
      <div style={{
        fontSize: 11, color: T.bull, fontFamily: T.mono, fontWeight: 500, marginBottom: 12,
      }}>+$5,240 · +2.15% today</div>

      <div style={{
        padding: '3px 8px', marginBottom: 10,
        background: 'rgba(247,147,26,0.1)', border: `0.5px solid rgba(247,147,26,0.3)`,
        borderRadius: 4, fontFamily: T.mono, fontSize: 8, fontWeight: 600, color: T.btc, letterSpacing: 0.5,
        alignSelf: 'flex-start',
      }}>100% BTC-TIED · 5 POS</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
        {PORTFOLIO.map(p => (
          <div key={p.ticker} style={{
            padding: '8px 10px',
            background: T.ink200, border: `0.5px solid ${T.edge}`, borderRadius: 7,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.btc, letterSpacing: 0.3 }}>
                {p.ticker}
              </div>
              <div style={{
                marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                color: T.signal,
              }}>{p.alloc}%</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text }}>
                ${p.price.toFixed(2)}
              </div>
              <div style={{
                marginLeft: 'auto', fontFamily: T.mono, fontSize: 10,
                color: p.chg >= 0 ? T.bull : T.bear, fontWeight: 500,
              }}>{p.chg >= 0 ? '+' : ''}{p.chg}%</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{
        marginTop: 'auto', display: 'flex', justifyContent: 'space-around',
        padding: '10px 0 4px', borderTop: `0.5px solid ${T.edge}`,
        fontFamily: T.mono, fontSize: 8.5, letterSpacing: 0.4,
      }}>
        {['HIST', 'PROJ', 'IMPCT', 'RECS'].map((t, i) => (
          <div key={t} style={{
            color: i === 3 ? T.signal : T.textDim, fontWeight: i === 3 ? 600 : 500,
          }}>{t}</div>
        ))}
      </div>
    </div>
  );
}

window.RecommendationsScreen = RecommendationsScreen;
