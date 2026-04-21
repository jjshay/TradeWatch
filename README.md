# TradeRadar

A local-only, single-page trading dashboard that fuses real-time crypto/macro data with multi-LLM consensus analysis, built for traders who want to see cause before price.

---

## Quick Start

```bash
cd /Users/johnshay/TradeWatch
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in Chrome. The app shell loads `index.html`, which pulls React 18 + Babel Standalone from CDN and the seven screen JSX files under `screens/`.

First-run key setup:

1. Click the gear icon (top-right of the header) to open the Settings sheet.
2. Paste your provider keys into the appropriate fields (CoinGecko, Finnhub, Tradier, NewsAPI, NewsData, Bitly, and the five LLM keys).
3. Hit **Test** next to any provider to confirm the key round-trips.
4. Keys persist in `localStorage` under `tr_settings`. To pre-fill them on every page load, edit `/Users/johnshay/TradeWatch/keys.local.js` (gitignored).

No build step. No server. No database.

---

## Screens

| # | Screen | Purpose |
|---|---|---|
| 1 | Historical | Long-range BTC / WTI / SPX % change with event-dot annotations and rolling correlation. |
| 2 | Projected | Driver-slider scenario model (Iran, Fed, Trump, BTC flow, China, CLARITY, Shale) -> Claude fan-chart projection. |
| 3 | Impact | Enter tickers, see Direct-Buy card + Tradier options chain with AI-picked contract and payoff diagram. |
| 4 | Recommend | Multi-LLM consensus trade recommendations ranked by agreement and conviction. |
| 5 | News | Aggregated headlines from NewsAPI, NewsData, and RSS (via rss2json) with LLM summarization. |
| 6 | Calendar | Macro event calendar (FOMC, CPI, OPEC, earnings) with impact tags. |
| 7 | Signals | Technical + on-chain + sentiment signal panel (Fear&Greed, derivatives, DeFi, volatility). |

---

## Data & AI Providers

| Provider | Powers |
|---|---|
| CoinGecko | BTC/ETH spot, 24h change, historical crypto prices |
| Finnhub | Equity quotes (SPX / DOW / OIL / portfolio tickers) |
| Tradier | Options chain (sandbox default; live mode requires paid plan) |
| NewsAPI | Primary news feed |
| NewsData | Secondary news feed |
| rss2json | RSS fallback for publisher feeds |
| alternative.me | Fear & Greed index |
| Bitly | Short-link creation for share-outs |
| Claude (Anthropic) | Narrative, scenario projection, consensus input |
| ChatGPT (OpenAI) | Consensus input |
| Gemini (Google) | Consensus input |
| Grok (xAI) | Consensus input |
| Perplexity | Consensus input + news synthesis |

Missing keys degrade gracefully — the relevant widget falls back to a mock or skips rendering rather than throwing.

---

## Architecture

- `/Users/johnshay/TradeWatch/index.html` — shell, nav, `TradeRadarApp` component, live BTC/F&G strip.
- `/Users/johnshay/TradeWatch/engine.js` — data layer. Exposes `LiveData`, `NewsFeed`, `HISTORICAL_EVENTS`, `Correlation`, `AIAnalysis`, `Backtester`, `TechnicalAnalysis`, `OnChainData`, `DeFiData`, `DerivativesData`, `BlackScholes`, `MonteCarlo`, `VOLATILITY_DB`, `CRYPTO_SCENARIOS` as globals. All five LLMs are routed through `AIAnalysis`.
- `/Users/johnshay/TradeWatch/tr-hooks.jsx` — `useAutoUpdate` polling hook + `TRSettingsSheet` (API keys, refresh intervals, provider test buttons) + `TROptionsChain`.
- `/Users/johnshay/TradeWatch/tr-header-extras.jsx` — gear button and live strip accessory components.
- `/Users/johnshay/TradeWatch/screens/*.jsx` — one file per screen, compiled in-browser by `@babel/standalone`.
- `/Users/johnshay/TradeWatch/keys.local.js` — gitignored bootstrap that writes into `localStorage.tr_settings` on load so the Settings sheet opens pre-filled.

Everything runs in the browser. No bundler, no transpile step, no Node server in the request path.

---

## Daily Email

`/Users/johnshay/TradeWatch/scripts/daily-briefing.js` sends a formatted HTML digest to `jjshay@gmail.com` (BTC spot, Fear & Greed, portfolio, headlines, Claude+ChatGPT+Gemini+Grok consensus). SMTP via Gmail app password. Scheduled through a launchd plist — template at `/Users/johnshay/TradeWatch/scripts/com.traderadar.briefing.plist.example`.

Full setup and schedule instructions: `/Users/johnshay/TradeWatch/scripts/README.md`.

---

## Roadmap

Honest status of what's live vs. mock:

| Area | Status |
|---|---|
| BTC / ETH spot + Fear & Greed | Live (CoinGecko + alternative.me) |
| OIL / SPX / DOW, historical lookback <= 1Y | Live (Finnhub) |
| Historical series >= 2Y | Mock — Finnhub free tier capped at ~1Y; needs paid quote feed or a stored daily CSV |
| Tradier options chain | Live in sandbox; live-mode market data requires Tradier paid plan |
| News feeds | Live (NewsAPI + NewsData + rss2json) |
| Multi-LLM consensus | Live for any key present |
| Mobile layout | Deprioritized — shell enforces `min-width: 1280px`, desktop only |
| Projected fan chart | Live call into Claude; driver sliders feed the prompt |
| On-chain / DeFi / Derivatives panels | Partial — some endpoints mocked where free tiers don't exist |

Branch workflow: feature branches off `main`, named `design/tradewatch-7-screens` for the current UI pass. Open PR against `main` (PR #2 at time of writing).

---

## Security

- **No server. No telemetry. No outbound requests other than the provider APIs you paste keys for.**
- API keys live in browser `localStorage` under `tr_settings`, plus an optional local bootstrap at `/Users/johnshay/TradeWatch/keys.local.js`.
- `keys.local.js` is listed in `.gitignore` and must never be committed. Double-check `git status` before every push.
- `.env` used by `scripts/daily-briefing.js` (Gmail app password + LLM keys) is also gitignored.
- If you fork or share the repo, the next contributor starts with an empty Settings sheet — nothing in the repo leaks credentials.
- Rotate any key you suspect has been exposed; all providers let you revoke and reissue without touching code.
