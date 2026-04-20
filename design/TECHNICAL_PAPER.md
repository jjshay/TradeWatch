# TradeWatch: A Real-Time Geopolitical-Financial Intelligence System for Cross-Asset Macro Trading

**A Technical Paper on the Architecture, Methodology, and Design Philosophy of an Event-Driven Correlation and Scenario Modeling Platform**

Version 1.0 · April 2026

---

## Abstract

TradeWatch is a single-page progressive web application that aggregates real-time and historical market data across three asset classes — crude oil (WTI), Bitcoin (BTC), and equities (S&P 500) — and overlays them with curated geopolitical event annotations to surface macro-driven trading signals. The system is built on a core thesis that structural price movements in these assets are caused by identifiable events (Federal Reserve pivots, OPEC decisions, armed conflict in key chokepoints, regulatory shifts) rather than by the technical patterns that dominate retail charting platforms. This paper presents the complete technical architecture, data pipeline, mathematical methodology, and design philosophy of the system across its three primary analytical pillars: Historical Correlation Analysis, Projected Scenario Modeling, and Financial Impact (options and direct-exposure) modeling.

We describe the data acquisition layer spanning seven primary sources, the normalization and correlation mathematics used to render three heterogeneous price series on a single comparable axis, an annotated event database covering eighty curated geopolitical and financial events from 2020 through 2026, a driver-based scenario model that produces Monte Carlo price projections through end of 2026, a Black-Scholes implementation for options analytics, a sentiment aggregation framework drawing on ten indicators, and a prediction market calibration tracker using Brier scores. We also present the complete user-interface design system, detailing the typography, color, motion, and interaction specifications that deliver a terminal-grade aesthetic at a fraction of the complexity of professional trading workstations. Throughout, we address the limitations inherent in each approach and the specific boundary conditions under which each analytical module is valid.

**Keywords:** macro trading, cross-asset correlation, geopolitical risk, options analytics, prediction markets, Black-Scholes, Pearson correlation, Monte Carlo simulation, sentiment analysis, progressive web applications.

---

## Table of Contents

1. Introduction
2. Related Work and Context
3. The Three-Asset Framework
4. System Architecture
5. Data Acquisition Layer
6. Price Normalization and Correlation Methodology
7. Event Annotation System
8. Scenario Modeling and Monte Carlo Projection
9. Options Analytics and the Black-Scholes Layer
10. Sentiment Aggregation Framework
11. Prediction Market Integration and Calibration
12. User Interface Design System
13. Signal Detection and Signature Interactions
14. Risk Management Framework
15. Case Studies
16. Limitations and Future Work
17. Conclusion
18. References and Data Sources

---

## 1. Introduction

### 1.1 Motivation

The retail trading landscape is dominated by two modes of analysis. The first is technical analysis — the study of price and volume patterns, moving averages, oscillators, and chart formations in isolation from the economic and political conditions that produce them. The second is fundamental analysis as practiced by equity research — modeling discounted cash flows, earnings, and balance-sheet metrics of individual companies. Both are well-established disciplines with decades of literature, and both have known edges in specific regimes. But both share a common blind spot: neither adequately captures the *causal layer* above price — the macroeconomic, geopolitical, and regulatory events that have produced the largest and most profitable moves of the last decade.

Consider a partial inventory of moves that defined the 2020–2026 period:

- Bitcoin falling from $64,000 to $18,000 in 2022, driven by the Federal Reserve's 525-basis-point tightening cycle, the collapse of Terra/Luna, and the implosion of FTX.
- WTI crude spiking from $76 to $130 within three weeks in February–March 2022, driven by Russia's invasion of Ukraine and the resulting sanctions regime.
- The S&P 500 declining 25% in the first nine months of 2022 and then rallying 58% over the next two years, both moves driven primarily by shifts in rate expectations and earnings resilience rather than any technical formation.
- Bitcoin appreciating from $16,500 to $108,000 between November 2022 and January 2025, fueled by the approval of U.S. spot Bitcoin ETFs, the post-halving supply shock, and institutional adoption accelerated by sovereign and corporate treasury allocation.

In each of these moves, price *followed* an identifiable causal event. A trader who saw the event in real time and correctly interpreted its implications for cross-asset flows had a structural edge over a trader looking only at the chart.

TradeWatch is built on this premise. It attempts to provide, in a single interface, the causal context — macroeconomic indicators, geopolitical event timelines, regulatory developments, institutional flows, sentiment indicators, prediction market probabilities, and options flow — that transforms a chart from a record of price into a record of cause-and-effect.

### 1.2 Scope and Non-Goals

This paper describes the technical implementation and analytical methodology of TradeWatch. It is not a prescriptive trading guide, it does not offer financial advice, and it makes no claim that the framework it describes is profitable in any particular regime. The goal is to document what the system does, how it does it, and where its methods are valid.

Specific goals:

1. Describe the data pipeline that acquires and normalizes time series from seven different sources with heterogeneous formats, sampling frequencies, and authentication requirements.
2. Document the mathematics of cross-asset correlation analysis, including the specific challenges of comparing a weekly Bitcoin series against a daily FRED crude oil series.
3. Specify the event annotation schema and the curation methodology used to select events with measurable impact on at least one of the three core assets.
4. Describe the driver-based scenario model, including the parameterization of each driver's impact on each asset and the Monte Carlo overlay used to produce price ranges.
5. Present the Black-Scholes implementation used for option pricing and Greek calculation, and the filtering and ranking logic used to surface the most attractive contracts on a user-specified expiration.
6. Detail the sentiment aggregation framework and the composite scoring methodology.
7. Explain the calibration tracking methodology for prediction markets, including the Brier score implementation.
8. Present the complete user-interface design system, including the rationale behind every major design decision.

Non-goals:

1. This paper is not a backtest. We do not claim statistical significance for any signal described herein. Future work will include a rigorous out-of-sample evaluation.
2. This paper is not a comparative market analysis. We do not compare TradeWatch to Bloomberg, Refinitiv, TradingView, or other commercial platforms — all of which have capabilities this system does not.
3. This paper does not describe a full machine-learning pipeline. The "AI" components of TradeWatch are limited to structured calls to a large language model (Claude) for narrative generation and recommendation ranking. No proprietary models are trained.

### 1.3 Structure of this Paper

The paper proceeds as follows. Section 2 situates TradeWatch in the existing literature on macro trading, prediction markets, and event-study methodology. Section 3 presents the core investment thesis — the Three-Asset Framework — that motivates the system's design. Section 4 describes the overall system architecture, file layout, and runtime model. Sections 5 through 11 describe the individual analytical modules in depth. Section 12 presents the user-interface design system. Sections 13 through 15 cover signal detection, risk management, and illustrative case studies. Sections 16 and 17 discuss limitations and conclusions.

---

## 2. Related Work and Context

### 2.1 Event-Study Methodology

The empirical finance literature on event studies dates to the foundational work of Fama, Fisher, Jensen, and Roll (1969), who introduced the now-standard methodology of measuring abnormal returns in a window around a corporate event. Subsequent work has expanded the methodology to macroeconomic announcements (Andersen et al., 2003), monetary policy surprises (Kuttner, 2001; Gürkaynak, Sack, and Swanson, 2005), and geopolitical shocks (Caldara and Iacoviello, 2022, who construct the widely-used Geopolitical Risk Index).

TradeWatch's event annotation system is a qualitative cousin of these approaches. Rather than attempting to cleanly identify abnormal returns in narrow windows, we annotate events on the historical chart and let the user observe the price response across multiple windows and asset classes. This sacrifices statistical rigor in exchange for interpretability, which we view as appropriate for a screening and scenario tool rather than an academic study.

### 2.2 Cross-Asset Correlation Studies

The correlation structure between oil, equities, and other risk assets has been studied extensively. Kilian (2009) distinguishes oil supply shocks, aggregate demand shocks, and precautionary oil demand shocks, showing that each has distinct implications for equity returns. Bouri et al. (2017) document that Bitcoin has intermittent hedging properties against oil and equity volatility, but that these properties break down in global risk-off episodes. Corbet, Larkin, and Lucey (2020) show that Bitcoin's correlation structure shifted meaningfully in the COVID-19 period, with correlations against traditional risk assets rising to levels previously observed only in acute crisis periods.

The consistent finding across this literature is that cross-asset correlations are time-varying and regime-dependent. TradeWatch's rolling correlation methodology — which computes a trailing 90-day Pearson correlation and compares it to the full-period correlation — is designed to make this regime-dependence visible at a glance.

### 2.3 Prediction Markets and Calibration

Prediction markets have been extensively studied as information-aggregation mechanisms. Wolfers and Zitzewitz (2004) provide the canonical theoretical framework, showing conditions under which prediction-market prices can be interpreted as Bayesian posterior probabilities. More recent empirical work (Page and Clemen, 2013; Tetlock et al., 2023) has compared prediction markets to expert forecasts and polls, generally finding that prediction markets are well-calibrated for high-volume contracts and outperform expert judgment for short-horizon binary events.

TradeWatch integrates Polymarket and Kalshi prediction-market data and tracks calibration using Brier scores. This allows users to identify which categories of contracts are best calibrated historically, and therefore most worth leaning on as signal inputs.

### 2.4 Options Flow as Leading Indicator

The informational content of options activity has been studied since at least the early 1990s. Easley, O'Hara, and Srinivas (1998) develop a microstructure model showing that informed traders prefer to trade options over stock when the price-impact advantage of options is sufficient to compensate for the liquidity disadvantage. Pan and Poteshman (2006) find that the put/call volume ratio on individual stocks predicts next-day returns. More recent work (Hu, 2014; Roll, Schwartz, and Subrahmanyam, 2010) has shown that unusual options activity — measured as volume-to-open-interest ratios or absolute volume outliers — is informative for short-horizon returns in both directions.

TradeWatch implements an anomaly score for options flow, defined as `(volume / open_interest) × log₁₀(volume)`, and surfaces contracts with anomaly scores above a configurable threshold. This is a simplification of the academic methodology, optimized for real-time screening rather than rigorous statistical inference.

### 2.5 Sentiment Aggregation in Finance

Sentiment indicators in finance span multiple categories: survey-based (AAII Bull/Bear, Investors Intelligence), derivative-implied (VIX, put/call ratio, skew), flow-based (mutual fund flows, ETF creations/redemptions), and text-based (news sentiment from AFINN or BERT-based classifiers, social media sentiment from LunarCrush or Santiment). The canonical finding is that no single indicator is consistently predictive, but composite indicators that blend multiple categories tend to identify useful extremes (Baker and Wurgler, 2006; Tetlock, 2007).

TradeWatch follows this composite approach. The Pulse dashboard aggregates ten sentiment indicators into a weighted composite score, with the weighting explicitly exposed to the user so that it can be recalibrated for different market regimes.

### 2.6 Design Heritage

The user-interface design heritage draws from three distinct traditions: the Bloomberg Terminal (information density, monospace numerical typography, restrained color use), Apple's hardware-software integration design (concentric geometry, purposeful minimalism, premium materials), and the modern fintech dashboard tradition exemplified by Stripe, Linear, and Plaid. We document the specific design decisions and their justifications in Section 12.

---

## 3. The Three-Asset Framework

### 3.1 Why These Three?

Markets contain thousands of tradable instruments. The selection of WTI crude oil, Bitcoin, and the S&P 500 as the three focal assets for TradeWatch is deliberate and not arbitrary. Each was chosen because it captures a distinct dimension of the macro environment that the other two do not.

**WTI Crude Oil** is the world's most geopolitically sensitive commodity. Approximately 20% of global daily oil supply transits the Strait of Hormuz, a chokepoint flanked by Iran on the north and Oman on the south. Roughly 6% transits the Bab el-Mandeb strait between Yemen and Djibouti. Major production is concentrated in a handful of OPEC+ members (Saudi Arabia, Iraq, UAE, Russia) whose policy decisions are themselves outcomes of political calculations. The United States has used its Strategic Petroleum Reserve as an explicit policy tool since 2022. Oil shocks have preceded every U.S. recession since 1973 except two. For all these reasons, WTI is the cleanest proxy for geopolitical risk available in a liquid, exchange-traded form.

**Bitcoin** is the purest expression of macro liquidity conditions and global risk appetite. With a fixed supply schedule determined by code rather than by a central bank, Bitcoin's price is almost entirely a function of demand. That demand, in turn, is a function of three things: risk-on/risk-off regime (in which Bitcoin behaves like high-beta technology equity), dollar debasement expectations (in which Bitcoin behaves like digital gold), and cycle positioning relative to the four-year halving schedule. Since the approval of U.S. spot Bitcoin ETFs in January 2024, institutional flows have become a fourth, and increasingly dominant, driver. Bitcoin's correlation with the Nasdaq has been positive and above 0.5 in most of the post-2020 period, but inverts meaningfully in dollar-weakness regimes.

**The S&P 500** is the benchmark for global risk and the primary transmission channel for Federal Reserve policy into asset prices. Its earnings yield, relative to the 10-year Treasury, is the most-watched discount-rate metric in finance. Its correlation with Bitcoin has risen structurally since 2020. Its sector composition reflects the real economy's exposure to both cyclical and defensive forces. In any multi-asset macro framework, the S&P 500 is the indispensable benchmark.

Together, these three assets span three dimensions: geopolitical risk (oil), liquidity and innovation (BTC), and economic/policy risk (S&P). The relationships among them — when they move together, when they diverge, and what causes each pattern — are the substrate on which every other TradeWatch feature is built.

### 3.2 The Five Drivers

The framework posits five primary drivers that explain the majority of cross-asset variance over the 2020–2026 period. Each driver has a predictable (directional, if not magnitudinal) impact on each of the three assets.

**Driver 1: Iran / Strait of Hormuz.** The Strait of Hormuz is the most important oil chokepoint in the world. Its closure, whether by military action or by credible threat, would remove approximately 21 million barrels per day from the seaborne market. Historical precedents — the 1980s tanker war, the 2019 Abqaiq attack — suggest that even partial disruptions can move spot WTI by 15–40% within days. The causal chain extends further: an oil spike of that magnitude compresses consumer spending, forces the Federal Reserve into a policy dilemma (tighten to combat stagflation or hold and allow inflation to run), and initially creates risk-off conditions for Bitcoin before the dollar-debasement narrative takes over on longer horizons. The expected sign of each asset's response: oil strongly positive, S&P 500 negative, Bitcoin negative in the first week but potentially positive on a one-to-three-month horizon.

**Driver 2: Trump Policy Volatility.** The current U.S. administration exhibits the highest policy variance of any in the modern era. Tariff announcements, sanctions actions, executive orders touching crypto and energy, and public pressure on the Federal Reserve all have been made with minimal advance signaling and have moved markets within hours. Specific policy outcomes with the largest expected impacts include: passage of the CLARITY Act (a structural positive for Bitcoin, Coinbase, and IBIT), escalation of tariffs against China or Mexico (negative for S&P 500, mixed for oil, positive for gold), and a durable political settlement with Iran (positive for oil on the negative side, negative on the positive side — outcome-dependent).

**Driver 3: Federal Reserve.** The Fed is the single most important macro driver for all three assets. The transmission mechanism runs through three channels: the cost of capital (which affects equity valuations directly), dollar strength (which affects commodity prices inversely and Bitcoin inversely), and risk-asset liquidity (which affects Bitcoin directly). The inversion and re-steepening of the 2s10s yield curve has preceded every U.S. recession since 1970; TradeWatch tracks this indicator explicitly in the Pulse dashboard.

**Driver 4: Bitcoin Institutional Flow.** Post-ETF-approval in January 2024, institutional flow has become a daily price driver for Bitcoin. IBIT and FBTC aggregate inflows and outflows are reported daily. MicroStrategy (now Strategy, Inc.) treasury purchases act as reflexive demand. Beginning in 2025, sovereign allocation — led by El Salvador, and now including interest from several G20 nations — has added a new flow category. The Trump family's World Liberty Financial and other vehicles represent a further political-institutional demand overlay. The Bitcoin Institutional Flow driver aggregates all these into a single directional variable.

**Driver 5: China.** China is the world's largest crude importer and the second-largest economy. Its stimulus cycles correlate with global commodity demand. Its capital controls and CNY devaluation cycles drive episodic offshore Bitcoin demand. Tensions over Taiwan, chip sanctions, and rare-earth export controls all have second-order effects on supply chains, equity sentiment, and commodity prices. In the framework, China is captured as a single driver on a cooperative-to-hostile axis.

### 3.3 The Fabric of Correlations

With three assets and five drivers, the framework implies fifteen unique asset-driver impact coefficients. These coefficients are estimated qualitatively from historical episodes and exposed as editable parameters in the scenario model (Section 8). The full coefficient table is presented in Table 8.1.

The inter-asset correlation structure is itself a function of which drivers are active. In a Fed-dominated regime (as in 2022), Bitcoin and S&P 500 correlation approaches 0.8 and oil correlates weakly with both. In an oil-shock regime (March 2022, October 2023), oil correlates negatively with equities and Bitcoin trades as a risk asset. In a dollar-debasement regime (H2 2024), Bitcoin and gold correlate positively while equities are mixed.

The central analytical value of the framework is that it makes the active regime visible. When the user observes that the 90-day rolling BTC/Oil correlation has shifted from -0.1 to +0.4 over a month, and simultaneously observes that the Iran/Strait driver has spiked in the Projected pillar, the user has identified a regime transition in real time.

---

## 4. System Architecture

### 4.1 Runtime Model

TradeWatch is a client-side-only progressive web application. There is no application server. All data is fetched directly from third-party APIs by the user's browser, using the user's own API keys where required. There is no build toolchain; the application ships as raw HTML, CSS, and JavaScript and is served by any static file server. The total repository size including all curated event data is under 2 megabytes uncompressed.

This architectural choice has important implications. On the positive side, there is no backend operational burden, no user-data-in-transit concerns beyond the user's own keys, no scaling considerations, and no latency beyond the round-trip to the underlying data source. The user owns their keys and their data. The application can be self-hosted trivially.

On the negative side, the absence of a server means there is no place to cache data across users, no place to run aggregation or pre-computation jobs, no place to execute backtesting on historical data beyond what fits in a browser session, and no place to store user state except the browser's `localStorage`. The absence of a build toolchain means there is no tree-shaking, no code-splitting in the traditional sense, no TypeScript, and no framework. The codebase is vanilla ES2017+ JavaScript with careful module boundaries enforced by convention.

We view these trade-offs as appropriate for the current stage of the project. The constraints enforce an architectural discipline that keeps the code readable and the runtime behavior observable.

### 4.2 File Layout

The canonical file layout is as follows:

```
/
├── index.html           Single-page application shell, all views, JS orchestration
├── engine.js            Core data engine: crypto prices, Claude API, Black-Scholes, TA
├── geo-intel.js         FRED fetcher, Tradier options API, scenario model
├── pulse.js             Sentiment engine: Fear & Greed, VIX, AAII, yield curve, funding
├── predict.js           Prediction markets, futures curves, options flow, calibration
├── portfolio.js         Holdings, watchlist, price alerts, browser notifications
├── onchain.js           Blockchain.com on-chain metrics
├── events-db.js         ~80 annotated geopolitical and financial events (2020-2026)
├── manifest.json        PWA manifest: icon set, theme colors, display mode
├── service-worker.js    App shell cache for offline operation
├── README.md            Public-facing feature and setup documentation
├── STRATEGY.md          Investment thesis and trade-signal documentation
└── TECHNICAL_PAPER.md   This document
```

Every JavaScript module attaches a single global namespace object to `window`. `engine.js` exposes `LiveData`, `AIAnalysis`, `BlackScholes`, and `TechnicalAnalysis`. `geo-intel.js` exposes `GeoIntel`. `pulse.js` exposes `Pulse`. `predict.js` exposes `Predict`. `portfolio.js` exposes `Portfolio`. `onchain.js` exposes `OnChain`. `events-db.js` exposes `GEO_EVENTS` and `GEO_CATEGORIES`.

Cross-module dependencies are minimal and strictly acyclic. `engine.js` has no dependencies on other TradeWatch modules. `geo-intel.js`, `pulse.js`, `predict.js`, and `portfolio.js` depend on `engine.js` for the Claude API integration and the key store. No module other than `engine.js` makes HTTP calls directly; all fetches are routed through `engine.js`'s fetch wrapper or through `GeoIntel`'s cached fetch wrapper, both of which apply a ten-minute cache to identical URLs.

### 4.3 State Management

State is managed through four distinct mechanisms, each appropriate for its scope:

**Ephemeral view state** — the active tab, the currently-visible timeframe, the active asset toggles on the Historical chart — is held in module-level JavaScript variables within `index.html`'s inline script. This state does not persist across page reloads. The rationale: most view state has no long-term value, and resetting to defaults on reload is a sane behavior.

**User preferences** — API keys, watchlist contents, price alert thresholds, onboarding-completion flags — are persisted in `localStorage` under namespaced keys (`tw_keys`, `tw_watchlist`, `tw_alerts`, `tw_onboarding_done`). Every persistence boundary is explicit. There is no generic "save state" mechanism.

**Fetched data** — FRED series, CoinGecko history, Tradier quotes — is held in module-level caches keyed by URL. Each cache entry has a timestamp; cache hits within ten minutes return the cached value. This cache is cleared on page reload.

**Derived data** — normalized series, correlations, scenario outputs — is recomputed on demand and not cached across computations. The cost of recomputation is low relative to the cost of cache invalidation bugs.

### 4.4 Rendering Model

The application uses a hand-rolled view-switching model. The `showView(viewId)` function in `index.html` toggles the `display` property on a set of top-level `<div>` elements, each representing a view (Historical, Projected, Impact, Pulse, Predict, Portfolio, etc.). Each view is responsible for its own rendering; there is no virtual DOM, no reconciliation, no component tree.

Within a view, charts are rendered either via TradingView's Lightweight Charts library (Historical) or via direct Canvas 2D drawing functions (payoff diagrams, fan charts, Monte Carlo bands, sparklines). The Canvas drawing functions share a common utility library (`drawAxes`, `drawGrid`, `formatPriceLabel`) that ensures visual consistency across chart types.

The absence of a framework means the code is verbose in places where a framework would be concise. We accept this verbosity as the cost of a zero-dependency runtime and full inspectability of the rendering logic.

### 4.5 Progressive Web App Layer

The application is installable as a PWA on iOS and Android via the manifest and service-worker layers. The service worker implements a cache-first strategy for the app shell (HTML, CSS, JS, icon set) and a network-first strategy for API data. The manifest declares the application as a standalone display, with theme colors matching the dark palette of the main UI. On supported platforms, the installed application launches without browser chrome and feels native.

---

## 5. Data Acquisition Layer

### 5.1 Source Inventory

TradeWatch integrates twelve data sources, each with distinct authentication, rate limiting, payload structure, and refresh characteristics. Table 5.1 summarizes the inventory.

| Source | Category | Data | Auth | Rate Limit | Notes |
|---|---|---|---|---|---|
| FRED | Macro | WTI, S&P 500, VIX, 2s10s, HY spreads, DXY, Gold | Free API key | 120/min | St. Louis Fed, daily EOD |
| Tradier | Equities/Options | Live quotes, options chains, futures | Free API key | 500/day free | Real-time during market hours |
| CoinGecko | Crypto | BTC/ETH/alt prices, history, market data | None | ~50/min | Weekly granularity for long history |
| Binance | Crypto | BTC perpetual funding, CME premium | None | Generous | Used only for funding rate and basis |
| alternative.me | Sentiment | Crypto Fear & Greed index | None | None | Daily composite |
| Polymarket | Prediction | Contract prices for event categories | None | Rate-limited | Accessed via gamma API |
| Kalshi | Prediction | Contract prices for U.S.-regulated events | Optional key | 100/min | Accessed via public API |
| LunarCrush | Sentiment | Social sentiment, galaxy score | API key | Per-plan | Twitter/Reddit aggregation |
| Augmento | Sentiment | Bitcoin social sentiment | API key | Per-plan | Deep-learning based |
| Blockchain.com | On-chain | Hash rate, mempool, active addresses | None | Low | Aggregated UTXO metrics |
| RSS.app | News | Curated news feeds | Subscription | None | User-configurable feed URLs |
| Messari | News | Crypto news | None | Public | Fallback news source |

### 5.2 FRED Integration

The Federal Reserve Economic Data (FRED) API is the single most important source in the system. It provides daily end-of-day observations for every macro series TradeWatch tracks. The integration is implemented in `geo-intel.js` as `GeoIntel.fetchFREDSeries(seriesId, startDate)`:

```javascript
async fetchFREDSeries(seriesId, startDate = '2013-01-01') {
    const keys = AIAnalysis.getKeys();
    const apiKey = keys.fred || DEFAULT_FRED_KEY;
    const url = `https://api.stlouisfed.org/fred/series/observations`
        + `?series_id=${seriesId}`
        + `&observation_start=${startDate}`
        + `&api_key=${apiKey}`
        + `&file_type=json`
        + `&frequency=d`
        + `&aggregation_method=eop`;
    const data = await this._fetch(url, `fred_${seriesId}_${startDate}`);
    if (!data || !data.observations) return [];
    return data.observations
        .filter(o => o.value !== '.' && o.value !== 'NA')
        .map(o => ({ time: o.date, value: parseFloat(o.value) }));
}
```

The function normalizes the FRED JSON response into a uniform `{time, value}[]` shape that is shared across all time-series producers in the system. The `time` field is an ISO-8601 date string (YYYY-MM-DD); the `value` field is a parsed float. FRED returns a literal period (`.`) for missing observations; these are filtered out.

The series identifiers used in TradeWatch include `DCOILWTICO` (daily WTI crude oil spot), `SP500` (S&P 500 closing), `VIXCLS` (VIX closing), `T10Y2Y` (10-year minus 2-year spread), `BAMLH0A0HYM2` (ICE BofA high-yield option-adjusted spread), `DTWEXBGS` (broad trade-weighted dollar index), and `GOLDAMGBD228NLBM` (London gold AM fix).

### 5.3 CoinGecko Integration for Bitcoin History

Bitcoin price history is fetched from CoinGecko's `/coins/bitcoin/market_chart` endpoint. CoinGecko returns varying granularities depending on the requested window: for `days=max` with `interval=weekly`, the response is a weekly series going back to Bitcoin's origin in 2013. For shorter windows (≤90 days), the response is hourly. For `days=1`, the response is five-minute bars.

This heterogeneous granularity creates a significant methodological challenge when we want to align Bitcoin against the FRED-sourced oil and S&P 500 series, both of which are daily. We address this in Section 6 through a temporal-nearest-neighbor alignment algorithm.

### 5.4 Tradier Integration for Options and Live Quotes

The Tradier integration serves two functions in TradeWatch: live stock quotes (used on watchlist cards and for scenario-model "current price" inputs) and options chain retrieval (used on the Impact pillar and the Predict/Flow panel).

The options-chain endpoint requires two calls: first, a call to `/markets/options/expirations` to list available expiration dates for the ticker; second, a call to `/markets/options/chains` for a specific expiration. The system applies a filter at fetch time to focus on dates between 45 and 180 days out, which is the range most relevant to scenario-based trade construction.

The returned options are filtered further by the system's analytical criteria: calls only (for the current implementation; puts are a future addition), delta between 0.20 and 0.55 (to screen for contracts with meaningful upside beyond the cost of premium), bid-ask spread below 12% of mid (to exclude illiquid contracts), and positive mid price. Remaining contracts are sorted by open interest and the top eight are returned.

### 5.5 Cache Layer

All fetches route through a shared cache layer implemented in `GeoIntel._fetch` and `LiveData.fetchWithCache`. The cache is a plain JavaScript object keyed by URL (or by explicit cache key); each entry records the response and a timestamp. The default TTL is ten minutes.

```javascript
async _fetch(url, key, opts = {}) {
    const cached = this._cache[key];
    if (cached && Date.now() - cached.t < this._cacheTTL) return cached.d;
    try {
        const resp = await fetch(url, opts);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const d = await resp.json();
        this._cache[key] = { d, t: Date.now() };
        return d;
    } catch (e) {
        console.warn('fetch failed:', key, e.message);
        return null;
    }
}
```

The cache deliberately does not distinguish between success and failure within the TTL window — a failed fetch simply returns `null` and the next attempt will occur on the next page action rather than immediately. This prevents retry-storms against a temporarily-degraded upstream. The cache is cleared on page reload; persistence across reloads via `localStorage` was evaluated and rejected on the grounds that stale macroeconomic data is more dangerous than a few redundant fetches.

### 5.6 Failure Handling

Every fetch in the system is wrapped in a try/catch and returns `null` on failure. Calling sites are responsible for handling null returns gracefully. The convention across the codebase is that rendering functions always check for falsy data and substitute a neutral placeholder (`"--"` for numeric cells, an empty chart region for time-series views). No failure in one data source is allowed to cascade and break an unrelated view.

This approach has a known weakness: it silently hides partial failures. A user looking at the Historical pillar might not notice that the Oil series has failed to load if the Bitcoin series is visible. To partially mitigate this, every rendering function that expects multiple series checks for empty arrays and logs a console warning.

---

## 6. Price Normalization and Correlation Methodology

### 6.1 The Comparability Problem

Bitcoin trades from fractions of a cent to tens of thousands of dollars. WTI oil trades in a range of approximately $10 to $150 per barrel. The S&P 500 index trades in a range of approximately 600 to 7000 points. Any attempt to display all three on a single price axis fails trivially — BTC's dynamic range exceeds Oil's by three orders of magnitude and the two price paths would be visually incomparable.

The standard solution in quantitative finance is to transform each series to a common comparable scale. TradeWatch uses **percentage change from a common reference date** as the canonical normalization.

### 6.2 The Normalization Function

The normalization is implemented as:

```javascript
function normalize(series, startDate) {
    const idx = series.findIndex(p => p.time >= startDate);
    if (idx < 0) return [];
    const base = series[idx].value;
    if (!base) return [];
    return series.slice(idx).map(p => ({
        time: p.time,
        value: +(((p.value - base) / base) * 100).toFixed(2)
    }));
}
```

The function takes a raw series `[{time, value}]` and a reference date, finds the first observation at or after the reference date, and returns a new series in which each observation's value is its percentage change from the reference-date value. The two-decimal-place rounding is applied at the output layer to prevent display jitter from trailing precision.

The reference date is determined by the active timeframe. For 1Y, 2Y, 5Y, and All, the reference date is respectively one year, two years, five years, and "first common date" prior to the current date. For the All case, the reference date is Bitcoin's earliest available observation (2013) — the earliest date for which all three series have data.

After normalization, all three series begin at 0% on the reference date. Each series' value at a later date represents its cumulative return from the reference date. This makes the series directly comparable on a single vertical axis that carries a clear semantic meaning (percentage change).

### 6.3 The Zero Line and Grid

TradeWatch's Historical chart displays the normalized series with explicit horizontal gridlines at 0%, ±5%, ±10%, ±25%, ±50%, and ±100% (and further outward as needed). The 0% line is rendered at slightly higher opacity than the other gridlines, as a visual anchor.

The interpretation of the zero line is important: a series above zero has appreciated from the reference date, and a series below zero has depreciated. When two series cross the zero line at different times, the later-crossing series has underperformed. When two series maintain a constant vertical separation, they have the same return profile despite different price levels.

### 6.4 The Heterogeneous-Sampling Problem

Cross-asset correlation on financial time series is mathematically well-defined when the two series are sampled at identical times. In TradeWatch, this condition is violated in two ways.

First, CoinGecko's `days=max` Bitcoin series is sampled weekly, not daily. FRED's WTI oil series is sampled daily. An attempt to intersect the two series by exact date match yields roughly zero common observations — the weekly Bitcoin points will almost never land on the same ISO date as a FRED daily observation, because FRED uses business-day dates and CoinGecko uses the Monday-of-week date.

Second, even when both series are daily, they disagree on holidays. FRED's observations are U.S. business days; crypto markets trade every day. A naive intersection will drop weekends and holidays, which is appropriate for intra-day correlation but introduces bias for weekly or longer-window correlations.

### 6.5 Temporal-Nearest-Neighbor Alignment

TradeWatch solves the heterogeneous-sampling problem with a temporal-nearest-neighbor alignment. The correlation function builds a date-indexed map of the second series, then iterates the first series. For each point in the first series, it looks for an exact-date match in the second series; if no exact match exists, it walks backward day-by-day up to seven days and takes the first match found. This produces one pair per first-series observation (or no pair if no second-series observation exists within a week).

```javascript
function pearson(a, b) {
    if (!a.length || !b.length) return null;
    const bMap = new Map(b.map(p => [p.time, p.value]));
    const pairs = [];
    for (const pa of a) {
        if (bMap.has(pa.time)) { pairs.push([pa.value, bMap.get(pa.time)]); continue; }
        for (let d = 1; d <= 7; d++) {
            const prior = addDaysISO(pa.time, -d);
            if (bMap.has(prior)) { pairs.push([pa.value, bMap.get(prior)]); break; }
        }
    }
    if (pairs.length < 10) return null;
    const xs = pairs.map(p => p[0]);
    const ys = pairs.map(p => p[1]);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const num = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0);
    const den = Math.sqrt(
        xs.reduce((s, v) => s + (v - mx) ** 2, 0) *
        ys.reduce((s, v) => s + (v - my) ** 2, 0)
    );
    return den === 0 ? 0 : num / den;
}
```

The seven-day backward walk is a compromise. A shorter window would miss too many pairs when FRED has a multi-day gap. A longer window would introduce unacceptable temporal noise into the correlation. Seven days matches the typical spacing of the weekly Bitcoin series and covers the longest plausible FRED gap (a four-day holiday weekend plus a weekend).

### 6.6 Pearson Correlation

TradeWatch computes the standard Pearson product-moment correlation:

```
r = Σ(xᵢ - x̄)(yᵢ - ȳ) / sqrt( Σ(xᵢ - x̄)² · Σ(yᵢ - ȳ)² )
```

where x̄ and ȳ are sample means, and the sums are over the aligned pairs. The implementation above uses JavaScript's native array methods rather than a dedicated numerical library, trading a small amount of numerical stability for zero-dependency simplicity. For the scale of data in TradeWatch (up to ~500 pairs in a 2-year window of weekly Bitcoin observations), the stability loss is negligible.

The system reports two correlation values in the bottom stats bar: the full-period correlation (computed over all pairs in the active timeframe) and the rolling 90-day correlation (computed over the last ninety observations of each series). The divergence between these two values — when the rolling correlation deviates significantly from the full-period correlation — is itself a signal of regime change.

### 6.7 Alternative Correlation Measures (Not Currently Implemented)

The Pearson correlation is sensitive to outliers and assumes linear relationships. In the context of cross-asset returns, both of these assumptions are occasionally violated. Spearman rank correlation, Kendall's tau, and distance correlation are three alternative measures that would be robust against specific failure modes of the Pearson measure.

These alternatives are on the roadmap for TradeWatch. The current implementation uses Pearson exclusively because it is the most widely understood measure in trading contexts and because its limitations in this setting are well-characterized.

### 6.8 Event-Date Return Attribution

A related computation, used for the event tooltip, is the short-window return attribution. For a given event date, the system computes the percentage change in each asset from one trading day before the event to five trading days after. This measures the event's acute impact and is displayed in the tooltip alongside the event summary. The computation is a straightforward application of the same normalization function, with the reference date set to the day-before-event and the output truncated to the five-day window.

The interpretation of this number is deliberately narrow. It measures coincident price change, not causation. A negative BTC return on the date of a Fed rate-hike announcement does not demonstrate that the announcement caused the return — other events may have occurred, the market may have priced in a different outcome, and the return window may be too short to capture the full response. The attribution is displayed with this caveat.

---

*[Document as-of April 2026 — sections 7–18 pending. Current draft: ~6,150 words / 25–35% toward 30–50 page target.]*
