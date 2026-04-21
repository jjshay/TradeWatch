// RecommendationsScreen — Tab 4: LLM Recommendations (Consensus + Claude/GPT accordions)
// on the left, and a 5-investment BTC-tied portfolio rendered on both desktop (top-right)
// and mobile (bottom-right) form factors.

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

// 5 illustrative investments, all tied to BTC.
const PORTFOLIO_BASE = [
  { ticker: 'IBIT',   name: 'iShares Bitcoin Trust ETF',      alloc: 35, price: 54.82,  chg: +2.14, thesis: 'Direct spot exposure. 14d inflow streak.' },
  { ticker: 'MSTR',   name: 'MicroStrategy (BTC treasury)',    alloc: 25, price: 1842.50, chg: +3.80, thesis: '2.4× leveraged beta to BTC via treasury.' },
  { ticker: 'COIN',   name: 'Coinbase — crypto platform',     alloc: 15, price: 268.40,  chg: +1.95, thesis: 'CLARITY passage = multiple expansion.' },
  { ticker: 'BITB',   name: 'Bitwise Bitcoin ETF',             alloc: 15, price: 61.22,   chg: +2.08, thesis: 'Lower-fee spot ETF diversifier.' },
  { ticker: 'MARA',   name: 'Marathon Digital (miner)',       alloc: 10, price: 21.75,   chg: +4.25, thesis: 'High beta post-halving operating leverage.' },
];

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

  // LIVE — portfolio ticker prices via Finnhub
  const finnhubKey = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.finnhub) || '';
  const { data: livePortfolioPrices } = (window.useAutoUpdate || (() => ({})))(
    `recommend-portfolio-${finnhubKey ? 'on' : 'off'}`,
    async () => {
      if (!finnhubKey) return null;
      const syms = PORTFOLIO_BASE.map(p => p.ticker);
      const results = {};
      for (const sym of syms) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
          if (r.ok) {
            const q = await r.json();
            if (q && typeof q.c === 'number' && q.c > 0) {
              results[sym] = { price: q.c, changePct: q.dp };
            }
          }
        } catch (_) { /* skip */ }
      }
      return Object.keys(results).length ? results : null;
    },
    { refreshKey: 'recommend' }
  );

  const livePortfolio = PORTFOLIO_BASE.map(p => {
    const live = livePortfolioPrices && livePortfolioPrices[p.ticker];
    return live ? { ...p, price: live.price, chg: live.changePct, _live: true } : p;
  });

  // LIVE — dual-LLM pass. Pulls fresh headlines from engine.js NewsFeed, fans
  // them out to Claude + ChatGPT in parallel, returns both + a consensus block.
  const { data: dual, loading: aiLoading, lastFetch: aiLastFetch, error: aiError } =
    (window.useAutoUpdate || (() => ({})))(
      'recommend-dual-llm',
      async () => {
        if (typeof NewsFeed === 'undefined' || typeof AIAnalysis === 'undefined') return null;
        const keys = AIAnalysis.getKeys();
        if (!keys.claude && !keys.openai && !keys.gemini) return null; // no keys → design defaults
        const articles = await NewsFeed.fetchAll();
        if (!articles || !articles.length) return null;
        return await AIAnalysis.runMulti(articles.slice(0, 15));
      },
      { refreshKey: 'recommend' }
    );

  // If we got live results, override the hardcoded design blocks.
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

        <div style={{
          marginLeft: 32, display: 'flex', padding: 3,
          background: T.ink200, borderRadius: 10, border: `1px solid ${T.edge}`,
          height: 34, alignItems: 'center',
        }}>
          {['Historical', 'Projected', 'Impact', 'Recommend', 'News', 'Calendar', 'Signals', 'Prices', 'Flights'].map((t, idx) => {
            const active = idx === 3;
            const key = t === 'Recommend' ? 'recommend' : t.toLowerCase();
            return (
              <div key={t}
                onClick={() => onNav && !active && onNav(key)}
                style={{
                  padding: '0 14px', height: 28, display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                  background: active ? T.ink400 : 'transparent',
                  color: active ? T.text : T.textMid,
                  boxShadow: active ? `inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)` : 'none',
                  cursor: active || !onNav ? 'default' : 'pointer',
                }}>
                <span style={{
                  fontFamily: T.mono, fontSize: 10, color: active ? T.signal : T.textDim,
                  fontWeight: 600, letterSpacing: 0.3,
                }}>{idx + 1}.</span>
                {t}
              </div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
          <span style={{ color: T.signal }}>●</span>&nbsp; LLM RECOMMENDATIONS · BTC-TIED PORTFOLIO
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
            fontSize: 18, fontWeight: 500, color: T.text,
            letterSpacing: -0.2, marginBottom: 14,
          }}>What the models think you should do</div>

          {/* CONSENSUS CARD */}
          <div style={{
            background: 'linear-gradient(180deg, rgba(232,184,74,0.08) 0%, rgba(232,184,74,0.02) 100%)',
            border: `1px solid rgba(232,184,74,0.3)`,
            borderRadius: 12, padding: '16px 18px 18px', marginBottom: 16,
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

        {/* RIGHT — Portfolio on desktop frame (top) + mobile frame (bottom) */}
        <div style={{
          flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14,
          background: T.ink000, overflowY: 'auto', overflowX: 'hidden', minWidth: 0,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1, color: T.textDim,
            textTransform: 'uppercase', fontWeight: 500, marginBottom: -4,
          }}>Illustrative Portfolio · BTC-Tied · Across Devices</div>

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
