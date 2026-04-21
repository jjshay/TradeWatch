# Tradewatch — Investment Strategy

> The thesis: macro events move markets before technicals do. Track the events, front-run the chart.

---

## Core Thesis

Most retail traders watch price. Tradewatch watches **cause**.

The biggest moves in Bitcoin, oil, and equities over the last five years didn't come from RSI divergences — they came from Fed pivots, geopolitical shocks, regulatory shifts, and institutional positioning changes. This app is built on the belief that if you understand the macro and geopolitical environment in real time, you have a structural edge over pure technicians.

---

## The Three-Asset Framework

Tradewatch centers on the relationship between three assets:

| Asset | Why It Matters |
|-------|---------------|
| **WTI Crude Oil** | The world's most geopolitically sensitive commodity. Strait of Hormuz flows, OPEC discipline, SPR policy, and Iran nuclear status all move oil — and oil shocks have historically preceded recessions and equity bear markets |
| **Bitcoin** | The purest expression of macro liquidity and risk appetite. BTC has a 0.7+ correlation with the Nasdaq in risk-off environments, yet behaves as digital gold in dollar debasement scenarios. The ETF era has added institutional flow as a new driver |
| **S&P 500** | The benchmark for global risk. Fed policy, earnings, and credit spreads drive the SPX — but it's also the best leading indicator of whether BTC is in "risk-on" or "risk-off" mode |

Understanding when these three assets converge and diverge is the foundation of every trade.

---

## Key Drivers (The Scenario Model)

### 1. Iran / Strait of Hormuz
The Strait of Hormuz handles ~21 million barrels/day — roughly 20% of global oil supply. A closure or significant threat of closure has historically spiked WTI by 20–40% within days. Oil spikes of that magnitude:
- Compress consumer spending (stagflationary)
- Force the Fed's hand (hike despite weakness, or hold and let inflation run)
- Create risk-off conditions that initially hit BTC hard, then reverse as dollar debasement becomes the dominant narrative

**Trade signal:** Escalation → long oil hedges (USO calls), short SPX, watch BTC for the secondary debasement bid.

### 2. Trump Policy Volatility
The current administration has the highest policy variance of any in modern history. Tariff announcements, crypto executive orders, Fed pressure, and sanctions policy all move markets within hours. The CLARITY Act (crypto regulatory framework) passing would be a structural catalyst for BTC, COIN, and IBIT.

**Trade signal:** Pro-crypto EO or CLARITY progress → long BTC/IBIT. Tariff escalation → short SPX, long gold, watch oil.

### 3. Federal Reserve
The Fed is the most important macro driver for all three assets. Rate cuts expand liquidity — historically the strongest tailwind for BTC. Rate hikes compress multiples on risk assets and push capital to money markets.

**Key indicator:** The 2s10s yield curve inversion/uninversion cycle. Uninversion after inversion has preceded every recession in modern history. Watch for the steepening trade.

**Trade signal:** Fed pivot signal → long BTC, long SPX. Hike surprise → short duration, long DXY, risk-off.

### 4. BTC Institutional Flow
Post-ETF approval (January 2024), institutional flows into IBIT and other spot ETFs have become a daily price driver. MicroStrategy (now Strategy) buys create reflexive demand. When institutions are accumulating, on-chain exchange outflows confirm the trend.

**Trade signal:** Sustained IBIT inflows + exchange outflows + low funding rate → structural long.

### 5. China
China's economic stimulus cycles, CNY devaluation, and capital controls have historically correlated with BTC demand spikes as Chinese capital seeks offshore stores of value. Deteriorating US-China relations also have second-order effects on global supply chains and oil demand.

---

## Sentiment Framework

Price follows positioning. Positioning follows sentiment.

| Indicator | Extreme Fear Signal | Extreme Greed Signal |
|-----------|--------------------|--------------------|
| Crypto Fear & Greed | < 20 → contrarian buy | > 80 → reduce exposure |
| AAII Bull/Bear | Bulls < 25% → buy signal | Bulls > 55% → caution |
| VIX | > 30 → hedging opportunity | < 13 → buy protection |
| Put/Call ratio | > 1.2 → contrarian bullish | < 0.7 → contrarian bearish |
| BTC Funding rate | Negative → squeeze potential | > 0.1%/8h → overleveraged longs |

The Pulse composite score aggregates these signals. When composite sentiment is below 30 and macro is constructive, that's historically been the highest-conviction buy window.

---

## Prediction Market Integration

Prediction markets are better calibrated than polls, analyst forecasts, and most news sentiment. Polymarket and Kalshi aggregate real money from informed traders on specific binary outcomes.

Tradewatch monitors:
- **Probability of Fed cut in next meeting** — feeds directly into rate expectations
- **Iran nuclear deal probability** — oil geopolitical risk proxy
- **Trump tariff escalation** — trade war risk
- **BTC price targets** — crowd wisdom on cycle positioning

The calibration tracker measures whether prediction markets are actually accurate over time using Brier scores. Well-calibrated markets (diagonal on the calibration chart) are worth leaning on.

---

## Options Flow as a Leading Indicator

Smart money moves options before it moves stock. Unusual options activity — measured by volume/open interest ratio — often precedes large directional moves by 1–5 days.

Tradewatch focuses on:
- **IBIT** — institutional BTC ETF. Call sweeps signal accumulation
- **COIN** — Coinbase is a high-beta crypto proxy. Flow here often leads BTC
- **USO** — oil ETF. Put buying signals hedging by energy producers
- **VXX** — VIX futures ETF. Call buying is a direct hedge against equity volatility

Anomaly score = `(volume / open interest) × log₁₀(volume)`. Scores above 3 are worth investigating.

---

## Risk Management

No strategy without stops.

| Scenario | Max Position | Stop Loss |
|----------|-------------|-----------|
| BTC long (bullish macro) | 30% of portfolio | -15% from entry |
| Oil hedge (USO calls) | 5% of portfolio | Full premium at risk |
| Equity short (SPX puts) | 5% of portfolio | Full premium at risk |
| Gold long (GLD) | 15% of portfolio | -10% from entry |

**Position sizing rule:** No single geopolitical bet should exceed 5% of portfolio. Macro calls (Fed, BTC cycle) can be sized at 15–30% given longer time horizons and more data.

**Correlation caveat:** In genuine risk-off panics (2020 COVID, 2022 rate shock), BTC, oil, and equities all sell off together. Correlation goes to 1. The only true hedge in those moments is cash, gold, and short volatility positions.

---

## 2025–2026 Macro Outlook

The current environment as of early 2026:

- **Oil:** Iran posture, OPEC+ discipline, and US SPR rebuild create a floor around $70–75. A Strait escalation would spike to $110–130
- **BTC:** Post-halving supply shock (April 2024) with institutional ETF demand creates a structurally bullish backdrop. Primary risk is macro risk-off or regulatory reversal
- **S&P 500:** Earnings resilience vs. tariff drag. Fed optionality is the swing factor
- **Dollar (DXY):** Tariff-driven safe haven demand vs. deficit expansion. Mixed outlook
- **Gold:** Structural bid from central bank diversification away from USD reserves. Tactically overbought but strategically supported

The GeoIntel scenario model lets you stress-test these views against specific outcomes and see the implied price ranges for each asset class.

---

*This is not financial advice. TradeRadar is a research and analysis tool. All trading involves risk of loss.*

---

# How TradeRadar Operationalizes the Strategy

The 10-tab UI maps directly to the thesis above. Each tab answers a specific question a macro/event-driven trader needs to answer in a workflow.

## Workflow: from morning open to trade idea

### 1. Open TradeRadar — start at **Summary** (tab 1)
- Live BTC + Fear & Greed in the snapshot strip
- Top 8 catalysts pulled from RSS, filtered for Mideast / OPEC / Fed / CLARITY / BTC keywords
- Three LLMs (Claude / GPT / Gemini) each independently predict BTC + WTI year-end with 3 bullets
- Consensus band shows: averaged target, ALIGNED vs DIVERGENT, range/spread, **delta since the last refresh**
- If consensus moved more than ±3% overnight, that's the day's question — what news caused it?

### 2. Drill into the catalyst — **News** (tab 6)
- Narratives organized into thematic buckets (Fed, CLARITY, Iran, Whales, Trump, etc.)
- Horizontal article cards with **RISK badges** (LOW / MED / HIGH from importance × impact)
- Live RSS feed bucket includes 14 sources + StockTwits BTC/SPY streams + 5 Telegram OSINT channels (@whale_alert, @intelslava, @RocketChip, etc.)
- Double-click an article → **Score with AI** — fans the headline to all 4 main LLMs in parallel; matrix shows per-model sentiment, confidence, 3-line reads, and a consensus footer

### 3. Geopolitical context — **Flights** (tab 10)
- Embedded ADSBExchange globe with 1-year replay; military-only filter on by default
- Right-side panel: OpenSky-polled US military aircraft (RCH/CNV/PAT/HAVEN/SPAR/BAT callsigns) + LLM analyst POV structured as: **Operational Read** (refueler-heavy = strike prep, transport-heavy = supply, etc.) → **Trend Delta** vs 24h baseline → **Market Implications** quantified ($/bbl, % BTC) → **Watch For** specific next-step indicators
- 7-day flight history accumulates in localStorage so trend analysis improves over time

### 4. Find the asset reaction — **Historical** (tab 2)
- BTC / WTI / SPX / DOW normalized to % from window start
- ~80 curated event dots pinned to real moments (Fed cuts, Hormuz attacks, ETF approvals, CLARITY votes)
- Click a series label to focus it — event dots re-anchor to that line, so you can see exactly how oil moved during a Strait escalation vs how BTC moved during the same hours

### 5. Run the scenario — **Projected** (tab 3)
- 7 driver sliders: BTC Institutional, CLARITY Act, Iran/Strait, Federal Reserve, Trump Policy, Strategic Reserve, Elon Musk
- Slider state + live news headlines combine into a prompt → all 5 LLMs return projected BTC ranges (base/bull/bear)
- Consensus narrative under the chart shows **ALIGNED** (high confidence) or **DIVERGENT** (reduce size)

### 6. Cross-asset check — **Impact** (tab 4)
- Two-stage model: oil drivers → projected WTI → estimated BTC impact per $1 of oil move
- Both Claude and GPT score every news article's $ impact on each driver; consensus = average
- Tradier ⚡ TRADE button lets you put on the position from the same screen

### 7. Synthesize — **Recommend** (tab 5)
- Consensus card on top: aggregated stance, top 4 bullets across all models
- Five LLM accordions: Claude / GPT / Gemini / Grok / Perplexity each with their own stance, confidence, alloc tilt, why-different, risks
- Live BTC-tied portfolio (IBIT / MSTR / COIN / BITB / MARA) with Finnhub prices

### 8. Watch real-time confirmation — **Signals** (tab 8)
- 43 macro tiles in 7 lanes
- Per-asset weighted score chips (BTC / SPX / OIL / Macro Tilt) — click for LLM rationale on the score
- Click any individual signal → modal with bigger sparkline + **View Source** link (FRED, CBOE, Glassnode, Polymarket, etc.)
- Asset-filter pills (BTC / OIL / SPX / All) — instantly slice the dashboard

### 9. Track upcoming catalysts — **Calendar** (tab 7)
- Live FOMC / CPI / earnings / OPEC events from Finnhub, de-duped against curated baseline
- Click a day → expected direction on BTC/OIL/SPX in the right panel
- Add custom events for personal anchors

### 10. Execute — **Prices** (tab 9) + Tradier modal
- Click any ticker → 1Y chart + 52W HI/LO + ⚡ Options Chain button
- Star tickers and option contracts → persistent watchlist at top of Prices

---

## Why dual/multi-LLM matters

A single LLM is a smart take. **Two agreeing** is a signal. **Two diverging** is also a signal — it tells you the situation is genuinely ambiguous and you should reduce size.

TradeRadar's `runMulti()` engine calls Claude + GPT + Gemini + (optional) Grok + (optional) Perplexity in parallel, then computes:

- **Aligned** (all sentiments match) → high-conviction setup
- **Divergent** (split sentiment) → uncertainty premium; size down
- **Avg confidence** + **range** of price targets → risk band

Used in: Summary, Recommend, Projected narrative, News article scoring, Flights AI POV, Signals chip-click rationale.

---

## Daily ritual

1. **7:00 ET** — daily-briefing.js fires (launchd cron) and emails the digest. Glance on phone before market open.
2. **9:00 ET** — open Summary. Note any consensus delta since yesterday.
3. **9:15 ET** — News tab → triage today's catalysts. Score the top 3 with AI.
4. **9:25 ET** — Flights tab → check OSINT for any geopolitical escalation overnight.
5. **9:30 ET** — Recommend → one final consensus check, decide trade.
6. **Throughout day** — Signals + Prices for entries/exits. Watchlist tracks open positions.
7. **5:00 PM ET** — Calendar → tomorrow's catalysts. Set Telegram alerts for high-importance items.

---

*See [README.md](README.md) for setup instructions and [TECHNICAL.md](TECHNICAL.md) for architecture.*
