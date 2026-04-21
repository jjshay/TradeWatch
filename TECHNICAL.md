# TradeRadar — Technical Architecture

This document covers how TradeRadar is built, where the data flows, and how to extend it.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Rendering | React 18 (UMD CDN) | Component model without a build step |
| Compilation | Babel Standalone (CDN) | JSX → JS in browser, no bundler |
| State | React hooks + window globals | No Redux/Zustand — small enough |
| Persistence | localStorage | API keys, watchlist, refresh prefs, flight history, prediction snapshots |
| Maps | Leaflet 1.9 (CDN) + iframe of ADSBExchange | Vector overlays + best-in-class flight replay |
| Build | None | Files served directly. `python3 -m http.server` is the dev loop |
| Deploy | Vercel static | One command (`vercel --prod`); zero infra to manage |
| Email job | Node + nodemailer + dotenv, scheduled by launchd | Local-only, no external cron service |

---

## File map

```
TradeWatch/
├── index.html                — shell + React mount + 10-tab router
├── engine.js                 — data + AI layer (~2k lines, no React)
├── tr-hooks.jsx              — useAutoUpdate, useTRSettings, useTRWatchlist, Settings sheet
├── tr-header-extras.jsx      — TRLiveStripInline, TRGearInline, TRStar, TROptionsChain modal,
│                                TRTradeModal, TRWelcome, TRFlightTracker
├── keys.local.js             — local-only key bootstrap (gitignored)
├── vercel.json               — static deploy config
├── package.json              — Node deps for daily-briefing.js
├── README.md / STRATEGY.md / TECHNICAL.md / UI_DESIGN_BRIEF.md
├── assets/                   — gg-logo.png, gg-logo-ink.png
├── screens/                  — 10 tab components
│   ├── summary.jsx           — landing tab; 3-LLM BTC year-end predictions
│   ├── historical.jsx        — multi-asset normalized chart + event dots
│   ├── projected.jsx         — driver sliders → multi-LLM projection
│   ├── impact.jsx            — oil → BTC two-stage model
│   ├── recommendations.jsx   — 5-LLM accordion + portfolio
│   ├── news.jsx              — narrative buckets + horizontal cards + AI scoring
│   ├── calendar.jsx          — Finnhub econ + earnings calendar
│   ├── signals.jsx           — 43-tile macro dashboard + LLM rationale
│   ├── prices.jsx            — stocks/futures/crypto board + watchlist + 1Y modal
│   └── flights.jsx           — ADSBExchange iframe + OpenSky + AI POV
├── scripts/                  — daily email briefing
│   ├── daily-briefing.js
│   ├── .env.example
│   ├── README.md
│   └── com.traderadar.briefing.plist.example
├── crypto-assets.json        — legacy, retained for reference
├── instruments.json          — legacy
├── ml-pipeline/              — legacy ML scaffolding
├── legacy/                   — archived 274KB monolith
└── design/                   — original Claude Design handoff
```

---

## engine.js — data + AI layer

Single ~2,100-line file. No React. Exposes globals directly to `window`. Loaded as a regular `<script>` so it's available before any Babel-compiled JSX.

### Globals exposed

| Global | Surface | Purpose |
|---|---|---|
| `LiveData` | `getCryptoPrices`, `getCryptoHistory`, `getFearGreed`, `getBTCOnChain`, `getCryptoOHLCV`, `getTrending` | CoinGecko + alt.me + Coinbase |
| `NewsFeed` | `feeds[]`, `fetchAll()`, `fetchStockTwits(sym)`, `_fetchFeed(feed)` | 14 RSS via rss2json + StockTwits + Telegram channels |
| `AIAnalysis` | `getKeys`, `setKeys`, `analyzeWithClaude/OpenAI/Gemini/Grok/Perplexity`, `runMulti({excludeGrok, excludePerplexity})`, `runDual` (alias) | All 5 LLM analyzers + parallel runMulti with consensus |
| `TradierAPI` | `_base`, `_token`, `_accountId`, `getQuote`, `getExpirations`, `getChain`, `getAccount`, `getPositions`, `getOrders`, `previewOrder`, `placeOrder`, `cancelOrder` | Sandbox/live switch via `TR_SETTINGS.meta.tradierMode` |
| `MilitaryFlights` | `BBOX`, `CALLSIGN_PREFIXES`, `getMidEast()` | OpenSky state-vector pull, US-mil callsign filter |
| `TelegramAlert` | `token`, `chatId`, `send`, `getUpdates` | Outbound bot alerts via Bot API |
| `BlackScholes` | `d1`, `d2`, `callPrice`, `putPrice`, `delta`, `gamma`, `theta`, `vega`, `rho` | Options pricing math |
| `MonteCarlo` | `runSimulation`, `simulatePath` | Path simulation for projections |
| `Correlation` | `pearson`, `rolling` | Rolling correlation calc |
| `HISTORICAL_EVENTS` | Curated Oil + BTC + macro event database | ~80 annotated events |
| `CRYPTO_SCENARIOS` | Curated scenario presets | Used by Projected fallback |

### runMulti pattern

```js
const result = await AIAnalysis.runMulti(headlines);
// result = { claude: {...}, gpt: {...}, gemini: {...}, grok: {...}, perplexity: {...}, consensus: {...} }
// Each model entry: { model, result: {sentiment, confidence, summary, actionable, risks, opportunities}, raw, error }
// consensus only emitted if 2+ models returned valid results.
```

Promise.all parallel calls. Per-model error capture. JSON parse with fenced/prose fallback. Consensus reports `agree` boolean + averaged confidence + opportunities/risks merged.

---

## tr-hooks.jsx — Settings + auto-update + watchlist

### `useAutoUpdate(key, fetcher, { refreshKey })`
The single hook driving every live data pull. Polls `fetcher` on the interval resolved from `TR_SETTINGS.refresh[refreshKey]`. Returns `{ data, loading, error, lastFetch, refresh, intervalMs }`. Re-runs when `key` or interval changes.

```js
const { data, loading } = (window.useAutoUpdate || (() => ({})))(
  `prices-stocks-${finnhubKey ? 'on' : 'off'}`,
  async () => { /* fetcher */ },
  { refreshKey: 'prices' }
);
```

The defensive `(window.useAutoUpdate || (() => ({})))` pattern lets a screen render before the hook script loads.

### `useTRSettings()`
Reactive singleton over `localStorage.tr_settings`. Returns `[settings, save]`. Fires `tr:settings-changed` events on save so every listening screen re-renders together.

Settings shape:
```js
{
  keys: { coingecko, tradier, polygon, claude, openai, gemini, grok, perplexity,
          alpaca, finnhub, newsapi, newsdata, bitly, telegramBot, telegramChatId },
  refresh: { header, historical, news, calendar, signals, impact, projected,
             recommend, prices }, // seconds
  sources: { stocks: 'finnhub', options: 'tradier' },
  meta: { tradierMode: 'sandbox', tradierAccount: 'VA43420796' }
}
```

### `useTRWatchlist()`
Same pattern as Settings, key `tr_watchlist`. Shape:
```js
{
  tickers: [{ sym, name, kind, id?, stooq? }],
  options: [{ symbol, underlying, strike, expiration, optionType, bid, ask, volume, oi, added }]
}
```

### `trTestProvider(k, key)`
Per-provider test handler used by Settings sheet **Test** buttons. Each provider has a custom test request hitting a low-cost endpoint (`/getMe` for Telegram, `/v1/models` for OpenAI, etc.). Returns `{ ok, ms, detail }`.

### `TRSettingsSheet({ open, onClose })`
Slide-up right panel with three sections:
1. **Auto-refresh frequency** — per-screen pills (15s, 30s, 1m, 2m, 5m, 10m, Off)
2. **Data sources** — stocks provider toggle (yahoo / polygon / alpaca / finnhub) + Tradier mode (sandbox/live)
3. **API keys** — 15 input fields, password-typed, with Test buttons

---

## tr-header-extras.jsx — shared header components

| Component | Purpose | Used by |
|---|---|---|
| `TRLiveStripInline` | BTC + 24h + Fear&Greed every 60s | Every screen header |
| `TRGearInline` | ⚙ → opens Settings | Every screen header |
| `TRLastFetchedBadge` | Relative-time age display | Available, not yet placed |
| `TRStar` | ☆/★ toggle for watchlist | PriceTile, options chain row |
| `TROptionsChain` | Tradier chain modal — symbol picker + expirations + calls/strike/puts matrix | Global (window.openTROptions) |
| `TRTradeModal` | Tradier trade ticket — account + ticket + positions/orders tabs | Global (window.openTRTrade) |
| `TRWelcome` | First-visit modal explaining demo vs full | Mounted in shell |
| `TRFlightTracker` | Standalone flight modal (legacy, before tab) | Available |

All exported via `window.X = X` so any screen can reference without imports.

---

## Per-screen data flow

### Summary (1)
```
NewsFeed.fetchAll() → filter Mideast/macro keywords → top 8
                  ↓
   Promise.all → [callClaude, callOpenAI, callGemini]
                  ↓ (each returns JSON: bitcoin_year_end_usd, three_bullets, etc)
   PredictionCard × 3 + ConsensusBand
                  ↓
   localStorage.tr_last_predictions (saved for next-session delta)
```

### Historical (2)
```
useAutoUpdate('btc-series-${days}') → CoinGecko getCryptoHistory
useAutoUpdate('hist-equities')      → Finnhub /stock/candle for SPY, USO, DIA
                  ↓
   resample to N points + normalize to % from window start
                  ↓
   SVG paths for BTC / Oil / SPX / DOW + event dots from HISTORICAL_EVENTS
```

### Projected (3)
```
drivers state (7 sliders) + NewsFeed.fetchAll() top 10
                  ↓
   AIAnalysis.runMulti([driverState + headlines])
                  ↓
   consensus chip (ALIGNED/DIVERGENT) + base/bull/bear targets
```

### Impact (4)
```
OIL_DRIVER_NEWS hardcoded (each article has Claude $ + GPT $ impact estimates)
                  ↓
   recency-weighted sum → driver score → projected WTI delta → BTC impact
                  ↓
   Header buttons: ⚡ TRADE (window.openTRTrade) + ⚡ CHAIN (window.openTROptions)
```

### Recommend (5)
```
useAutoUpdate('recommend-portfolio') → Finnhub /quote × 5 tickers
useAutoUpdate('recommend-dual-llm')  → AIAnalysis.runMulti(top 15 RSS articles)
                  ↓
   ConsensusCard + 5 AccordionCards (Claude/GPT/Gemini/Grok/Perplexity)
   live portfolio prices in Desktop + Mobile mockup frames
```

### News (6)
```
hardcoded narrative buckets + useAutoUpdate('news-live-rss') → NewsFeed.fetchAll()
                  ↓
   prepend "Live Feed · RSS" bucket if articles available
                  ↓
   horizontal scroll cards with RISK badge (LOW/MED/HIGH from imp 1-5)
                  ↓
   double-click → modal with full body + Score with AI button
                  ↓ (on click)
   AIAnalysis.runMulti([single headline]) → 4-column matrix
```

### Calendar (7)
```
hardcoded baseline events
useAutoUpdate('calendar-live') → Finnhub /calendar/economic + /calendar/earnings
                  ↓
   merge with two-pass de-dupe (exact key + semantic tag)
                  ↓
   day click → selectedDate state → right panel updates
```

### Signals (8)
```
hardcoded 43-tile lanes
useAutoUpdate('signals-prices')  → CoinGecko BTC
useAutoUpdate('signals-stocks')  → Finnhub × 10 (SPY, NVDA, MSTR, COIN, IBIT, ^VIX, ^TNX, DX-Y.NYB...)
                  ↓
   liveLabelMap overlay → tile values become live with statusColor=signal, hot=true
                  ↓
   per-lane laneScore() + per-asset assetScore() weighted aggregation
                  ↓
   composite chip click → AIAnalysis.runMulti([scoreContext + tiles]) → rationale modal
   tile click → detail modal with sourceFor() resolver → external link
```

### Prices (9)
```
useAutoUpdate('prices-stocks')   → Finnhub × 12 (SPY, QQQ, NVDA, etc.)
useAutoUpdate('prices-futures')  → Stooq batch CSV (CL, GC, SI, ES, etc.)
useAutoUpdate('prices-crypto')   → CoinGecko × 10 (BTC, ETH, SOL, etc.)
                  ↓
   demoMode fallback when no Finnhub key (sample prices)
                  ↓
   ★ star toggle → useTRWatchlist().toggleTicker()
   tile click → PriceDetailModal (1Y chart + ⚡ OPTIONS button)
```

### Flights (10)
```
<iframe src="https://globe.adsbexchange.com/?replay&lat=27&lon=50&zoom=5"> → main map
useAutoUpdate (poll) → MilitaryFlights.getMidEast() → OpenSky state vectors
                  ↓
   localStorage.tr_flight_history append + cap at 20k snapshots
                  ↓
   AI commentary effect → AIAnalysis.runMulti([prompt with type mix + 24h trend + Mideast headlines])
                  ↓
   Right panel: structured POV (Operational Read / Trend Delta / Market Implications / Watch For)
```

---

## Key persistence

| localStorage key | Owner | Lifetime | Cleared by |
|---|---|---|---|
| `tr_settings` | useTRSettings | indefinite | manual cache clear |
| `tr_watchlist` | useTRWatchlist | indefinite | clear-all button or cache |
| `tr_flight_history` | screens/flights.jsx | indefinite (capped 20k) | clear button or cache |
| `tr_last_predictions` | screens/summary.jsx | indefinite | cache clear |
| `tr_welcomed` | TRWelcome | indefinite | cache clear |
| `oilradar_ai_keys` | engine.js (legacy fallback) | indefinite | cache clear |

`keys.local.js` runs as a regular `<script>` BEFORE the Babel-compiled tr-hooks.jsx, so its localStorage write lands first. tr-hooks.jsx then loads from localStorage and the keys are present. Order in `index.html`:
1. `engine.js` (regular)
2. `tr-hooks.jsx` (Babel — deferred)
3. `tr-header-extras.jsx` (Babel — deferred)
4. `keys.local.js` (regular — runs before any Babel scripts execute)
5. `screens/*.jsx` (Babel — deferred, all run after Babel scripts compile)

---

## Deployment

### Vercel (current production)

```bash
vercel --prod --yes --name traderadar
```

Configured by `vercel.json`:
- `outputDirectory: "."` — serves the repo root
- JSX files get `Content-Type: text/babel; charset=utf-8` so Babel standalone consumes them
- Security headers: nosniff, strict-origin-when-cross-origin

`.vercelignore` excludes secrets and heavy dirs:
- `keys.local.js`, `.env`, `.env.*`, `logs/`, `node_modules/`
- `legacy/`, `design/`, `ml-pipeline/`, `.letta/`

Custom domain `traderadar.ggauntlet.com` registered in Vercel; needs A-record at Namecheap → `76.76.21.21`.

### Local

```bash
python3 -m http.server 8000
```

`keys.local.js` is gitignored but lives on local disk so localStorage gets pre-filled on every reload.

### Daily email

`scripts/daily-briefing.js` — Node script invoked by `~/Library/LaunchAgents/com.traderadar.briefing.plist` at 7am ET. Uses nodemailer with Gmail SMTP. Runs the same data fetchers + LLM consensus as the in-app Summary tab, formats as branded HTML, and emails to `jjshay@gmail.com`.

---

## Extending TradeRadar

### Add a new tab
1. Create `screens/myscreen.jsx` exporting `MyScreen({ onNav })` and assigning `window.MyScreen = MyScreen`
2. Add to `<script type="text/babel" src="screens/myscreen.jsx">` in index.html
3. Add `{ key: 'mytab', label: 'MyTab' }` to `TR_TABS` in index.html
4. Add route: `else if (tab === 'mytab') screen = <MyScreen onNav={setTab} />`
5. Update every other screen's internal nav array to include `'MyTab'`

### Add a new API provider
1. Add field to `TR_DEFAULT_SETTINGS.keys` in tr-hooks.jsx
2. Add to `keyFields` array in TRSettingsSheet
3. Add a branch to `trTestProvider()`
4. Add a fetcher to engine.js or directly in your screen via useAutoUpdate

### Add a new LLM
1. Write `analyzeWithFoo(headlines)` in engine.js's AIAnalysis (mirror analyzeWithClaude)
2. Add to `runMulti()` task map
3. Add `foo` key to TR_DEFAULT_SETTINGS.keys + Settings sheet field
4. Add to `consensus` model-list in runMulti

### Add a new signal source
1. Add helper to engine.js (e.g. `MyDataSource.getX()`)
2. In screens/signals.jsx, add a useAutoUpdate hook + extend liveLabelMap to map your data into a tile

---

## Testing

No automated suite. Manual smoke flow:

```bash
# 1. Parse all JSX
for f in screens/*.jsx tr-hooks.jsx tr-header-extras.jsx; do
  node -e "require('@babel/parser').parse(require('fs').readFileSync('$f','utf8'), {sourceType:'script', plugins:['jsx']})"
done

# 2. Engine.js syntax
node --check engine.js

# 3. Email script syntax
node --check scripts/daily-briefing.js

# 4. Local server smoke
python3 -m http.server 8000 &
curl -sI http://localhost:8000/ | head -3
curl -s http://localhost:8000/screens/summary.jsx | head -5
kill %1
```

A pre-commit hook could run these but isn't installed (would need a husky/lefthook setup that violates the no-build constraint).

---

## Performance notes

- All data fetchers are async and non-blocking. UI renders immediately with mock/cached values, swaps when fetch returns.
- localStorage writes are debounced implicitly (only on user actions: settings save, watchlist toggle).
- Flight history grows by ~10-30 records per 2-min poll. Cap at 20k = ~28-day retention even if left running constantly.
- LLM calls: parallelized via Promise.all. Worst case is the slowest model (Claude Sonnet ~3-6s). UI shows ANALYZING… spinner.
- ADSBExchange iframe: rendered separately, cross-origin, no JS bridge. Independent perf characteristics.

---

## Known limits

- **Mobile**: not supported. Min-width 1280px enforced via `.tr-shell`. Per original design brief.
- **Cross-origin iframe**: ADSBExchange map data inaccessible from JS — AI POV uses our independent OpenSky poll instead.
- **Free tier caps**: Finnhub 60 req/min, CoinGecko ~30 req/min unauthenticated, OpenSky 100 req/day unauthenticated. Built-in cache TTLs and per-screen refresh intervals fit under these.
- **Tradier sandbox**: 15-min delayed quotes. Live tier requires paid plan + funded account.
- **No server**: features needing scheduled background tasks (alert triggers, deep history backfill) require external cron or paid API tiers.

---

*See [README.md](README.md) for setup and [STRATEGY.md](STRATEGY.md) for the trading thesis.*
