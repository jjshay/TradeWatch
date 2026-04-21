# TradeRadar

A local-first trading dashboard that fuses live crypto + macro data with multi-LLM consensus analysis. Built for traders who want to see **cause before price** — macro events, geopolitical signals, and policy shifts that move BTC / WTI / SPX before the chart shows it.

Live demo: [traderadar-black.vercel.app](https://traderadar-black.vercel.app)
Repo: [github.com/jjshay/TradeWatch](https://github.com/jjshay/TradeWatch)

---

## Quick Start

```bash
git clone https://github.com/jjshay/TradeWatch
cd TradeWatch
python3 -m http.server 8000
# open http://localhost:8000
```

Click the **⚙ gear** in the header and paste API keys to unlock live features. Without keys the app still runs — crypto prices (CoinGecko), futures (Stooq), Fear & Greed, RSS news, Telegram channels, and the ADSBExchange flight map all work without auth.

For AI features (LLM predictions, rationale, article scoring) add at least one of: Anthropic (Claude), OpenAI, Google Gemini. Two+ unlocks consensus views.

---

## The 10 Tabs

| # | Tab | What it does |
|---|---|---|
| 1 | **Summary** | Today's catalyst digest. Three LLMs (Claude + GPT + Gemini) each predict BTC and WTI year-end prices with 3 bullets, plus a consensus band. Delta tracked across refreshes in localStorage. |
| 2 | **Historical** | BTC / WTI / SPX / DOW normalized-% chart with event dots pinned to real geopolitical / Fed / regulatory moments. Click any series label to focus it; event dots re-anchor to the focused line. 1D→All ranges, with ≤1Y ranges pulled live from CoinGecko + Finnhub. |
| 3 | **Projected** | 7 driver sliders (BTC Institutional, CLARITY Act, Iran, Fed, Trump Policy, Strategic Reserve, Elon Musk). Each slider's position + live news headlines feed into runMulti → Claude/GPT/Gemini/Grok/Perplexity return projected BTC/Oil/SPX ranges. |
| 4 | **Impact** | Two-stage oil → BTC model. Oil drivers → WTI projection → cross-asset BTC read. Keyboard-navigable ticker rows, dual-LLM per-article $ impact estimates, Tradier chain + trade buttons inline. |
| 5 | **Recommend** | Consensus card + 5 LLM accordions (Claude / ChatGPT / Gemini / Grok / Perplexity). Each with its own stance / confidence / trade thesis / risks. BTC-tied portfolio (IBIT / MSTR / COIN / BITB / MARA) with live Finnhub prices. |
| 6 | **News** | Narrative rail on the left + horizontal scrolling article cards with RISK badges. Live Feed bucket auto-aggregates 14 RSS sources + StockTwits BTC/SPY/MSTR/NVDA streams + 5 Telegram channels. Double-click any article → modal with full body, cross-asset impact, and "Score with AI" button that runs all 4 main LLMs in parallel on that single headline. |
| 7 | **Calendar** | Month / Week / Agenda views. Events pulled live from Finnhub (FOMC, CPI, NFP, OPEC, earnings), de-duped against a curated baseline. Click a day → right panel updates with highest-importance event + expected direction on BTC/OIL/SPX. |
| 8 | **Signals** | 43 macro signal tiles in 7 lanes (Fed & Rates, Equities, Crypto Flows, Regulation, Geopolitics, China, Oil). Click a tile → detail modal with sparkline + "View Source →" link (FRED, CBOE, Glassnode, Polymarket). Per-asset weighted score strip at top — click a chip for LLM rationale explaining the score. |
| 9 | **Prices** | Unified ticker board: stocks (Finnhub), futures (Stooq), crypto (CoinGecko). Watchlist star on every tile persists across reloads. Click a ticker → 1Y chart + 52W HI/LO + stats + ⚡ Options Chain button that hands off to Tradier. |
| 10 | **Flights** | Live CENTCOM flight tracker. Embedded ADSBExchange globe with 1Y replay + military-only toggle. Right panel: OpenSky-polled US military aircraft list + LLM analyst POV (Operational Read / Trend Delta / Market Implications / Watch For). 7-day history accumulates in localStorage. |

---

## Data & AI providers

| Provider | Role | Key required? |
|---|---|---|
| CoinGecko | Crypto prices, 1Y history, Fear & Greed | No (public free tier) |
| Finnhub | Stock quotes, candles, economic & earnings calendar | Yes (free) |
| Tradier | Options chains + paper/live trading layer | Yes (sandbox free) |
| Stooq | Futures / commodities quotes (CL, GC, SI, etc.) | No |
| OpenSky Network | Live ADS-B state vectors for military aviation | No (free tier) |
| ADSBExchange | Flight map iframe + 1Y replay | No (ads-supported) |
| rss2json | RSS proxy for 14 news feeds | No |
| StockTwits | Trader chatter streams per symbol | No |
| Telegram (RSSHub + Bot API) | 5 OSINT/crypto channels inbound + bot alerts outbound | No (channels) / Yes (bot) |
| Anthropic Claude | Primary LLM arm | Yes |
| OpenAI GPT | Secondary LLM arm | Yes |
| Google Gemini | Third LLM arm for consensus | Yes |
| xAI Grok | Optional fourth arm (X-signal angle) | Yes |
| Perplexity | Web-search-grounded LLM (optional) | Yes |
| alternative.me | Fear & Greed Index | No |

All API keys live in browser localStorage only. Never committed, never sent to any third party other than the listed providers.

---

## Architecture

```
index.html  (React 18 + Babel standalone, no build)
├── engine.js              — data + AI layer
├── tr-hooks.jsx           — useAutoUpdate + Settings + watchlist
├── tr-header-extras.jsx   — shared header + modals (options, trade, welcome)
├── keys.local.js          — local-only key bootstrap (gitignored)
└── screens/               — 10 tab components
     ├── summary.jsx          ├── recommendations.jsx
     ├── historical.jsx       ├── news.jsx
     ├── projected.jsx        ├── calendar.jsx
     ├── impact.jsx           ├── signals.jsx
     ├── prices.jsx           └── flights.jsx
```

- **No build step** — React + Babel standalone via CDN. JSX compiles in the browser.
- **engine.js** exposes globals: `LiveData`, `NewsFeed`, `AIAnalysis`, `TradierAPI`, `MilitaryFlights`, `TelegramAlert`, `BlackScholes`, `MonteCarlo`, `Correlation`, `HISTORICAL_EVENTS`, `CRYPTO_SCENARIOS`.
- **Settings sheet** at ⚙ stores all API keys + per-screen refresh intervals in `localStorage.tr_settings`. Per-provider **Test** button confirms keys before saving.
- **useAutoUpdate hook** drives every live data pull. Interval resolved from Settings; fails silent on errors so screens keep designed fallbacks.

See [TECHNICAL.md](TECHNICAL.md) for the full architecture, data flows, and component internals.
See [STRATEGY.md](STRATEGY.md) for the trading thesis and how each tab operationalizes it.

---

## Daily email briefing

Node script at `scripts/daily-briefing.js` sends a formatted HTML digest to Gmail at 7am ET via launchd.

```bash
npm install
cp scripts/.env.example .env   # paste Gmail app password + LLM keys
node scripts/daily-briefing.js # test send
cp scripts/com.traderadar.briefing.plist.example ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.traderadar.briefing.plist
```

Digest content: BTC spot + 24h, Fear & Greed, live portfolio, top 8 headlines, and a Claude + GPT + Gemini + Grok consensus block with sentiment + actionable ideas.

---

## Roadmap

| Status | Area |
|---|---|
| Done | 10 tabs interactive, live data where free providers cover it |
| Done | 5 LLMs wired (Claude / GPT / Gemini / Grok / Perplexity), 4-way consensus |
| Done | Tradier options chain + full trading layer (sandbox default) |
| Done | Watchlist (tickers + options), localStorage-backed |
| Done | ADSBExchange iframe + OpenSky military flight tracker with AI POV |
| Done | Telegram inbound (5 channels) + outbound bot alerts scaffolded |
| Done | Vercel deploy at custom domain `traderadar.ggauntlet.com` (DNS pending) |
| Partial | Historical chart ≥2Y data still mock (free-tier cap on Finnhub/CoinGecko) |
| Partial | Tradier live trading requires paid plan upgrade (sandbox works today) |
| Not yet | Mobile layout (≤768px) — desktop-only per design brief |
| Not yet | Self-hosted flight history backfill (OpenSky paid tier) |
| Not yet | Signal-triggered Telegram alert rules (bot plumbing exists) |

---

## Security

- No API keys committed to git. `keys.local.js`, `.env`, and `logs/` are gitignored.
- No server. No telemetry. No analytics. No user accounts.
- Every API call is client-side and CORS-compatible. Keys never leave your browser.
- The daily email script runs locally via launchd; Gmail app password stays in `.env` (gitignored).
- When sharing via Vercel deploy, reviewers paste their **own** keys in ⚙ Settings — yours never leave your machine.

---

## License

Private. Not licensed for redistribution. See repo access controls on GitHub.
