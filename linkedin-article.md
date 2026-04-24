# Why I Built a Trading Dashboard That Ignores Charts

*Three weeks, four LLMs, 50 data feeds, and what it's taught me about the tools capital markets are actually using — and missing.*

---

## Background: The gap I kept bumping into

I'm an active options trader. I also run an advisory firm — Global Gauntlet AI — that works at the intersection of AI strategy, capital allocation, and M&A. And I've spent the better part of a decade watching smart capital-markets operators do their real work in Excel, in Slack DMs, and in their heads — while paying $500 to $2,000 a month for tools that show them candlestick charts.

That disconnect kept nagging at me. The platforms optimize for retention (notifications, watchlist counts, newsfeed engagement), not insight (*what is actually moving the market right now, and why?*). They surface the trailing indicator — price — as if it were the leading one. And critically, they never know what's in **your** book, so every piece of "advice" they generate is aimed at a phantom user who owns nothing in particular.

Three weeks ago I decided to stop complaining about it and build the tool I actually wanted. I called it **TradeRadar**. This is the writeup of what I built, what I tested, what the results say, and what's now running as my daily driver every morning at 6 AM PST.

If you read nothing else, read this:

> **Most retail trading tools optimize for the last six inches of the journey — the candles, the moving averages, the RSI divergences. That's the right lens if you're scalping. It's the wrong lens if you want to know whether BTC breaks $100k this quarter, whether WTI spikes to $110 on an Iran headline, or whether a rate-cut surprise is about to reprice every multiple on the S&P. For the decisions that actually matter, you want to be early on the *cause*, not fast on the *effect*.**

---

## 1. The Problem / Opportunity

Let me be specific about what's broken.

### The problem, at four levels

**Level 1 — Charting tools show you outcomes, not drivers.**
If you live on TradingView, StockCharts, or the built-in charts in Fidelity or Robinhood, you are spending 95% of your screen time staring at price. Price is the downstream output of dozens of drivers — rate expectations, ETF flows, funding rates, geopolitics, OPEC discipline, regulatory moves, dollar strength. Charts don't show you any of those. They show you what already happened.

**Level 2 — News feeds are undifferentiated noise.**
Reuters and Bloomberg give you a firehose. A good professional trader has a mental filter that scores each headline by market impact in real time. That filter is non-trivial to build, rarely articulated, and never shipped as a product. Retail gets the same firehose with none of the scoring.

**Level 3 — "AI trading" products are ChatGPT with a chart next to it.**
The current crop of AI-native trading tools take one LLM (usually GPT), wrap it in a thin UI, and call themselves a product. There's no *consensus measurement*, no *domain-specific data integration*, no *personalization*. You're paying for an LLM wrapper that's worse than just using the Claude or ChatGPT interface directly.

**Level 4 — Nothing knows your actual book.**
This is the one I find most galling. Even the expensive tools will happily tell you "BTC is bullish" without knowing whether you own 0.1 BTC or 10 BTC, whether you have a deep-OTM call expiring in December that needs a 30% rally to work, or whether you're 80% in cash and underexposed. The advice is generic. The trader is specific. The gap between those two is where most retail losses actually come from.

### The opportunity

If you accept that those four problems are real — and if you've ever made a trade you later regretted, I'd wager at least one of them was relevant — then the opportunity is obvious:

Build a tool that:
1. **Surfaces the drivers before the price** (causes, not effects)
2. **Scores news for market impact** (signal, not noise)
3. **Runs multi-LLM consensus** (variance is information; alignment is conviction)
4. **Knows your real positions** (advice is specific, not generic)
5. **Aggregates free professional-grade data nobody else is packaging** (military flights, on-chain metrics, FRED macro series, prediction markets)
6. **Fits in one morning workflow** (not 12 browser tabs)

Every one of those is solvable. None of them requires proprietary data or a bespoke ML model. You just need to decide to build it.

So I did.

---

## 2. What We Did to Test

I use "we" loosely here. This was mostly one person, three weeks, and heavy use of Claude Code as a pair-programming partner. Methodology:

### The experiment design

**Hypothesis:** A trading dashboard built on the "causes before price" principle, using multi-LLM consensus on real-time data feeds and personalized to the user's actual positions, would produce meaningfully different — and more actionable — output than a conventional charting-first tool.

**Setup:**
- 11 core tabs: Drivers (scoreboard), Summary (multi-LLM consensus), Model (oil→BTC cross-asset), Context (historical + calendar), Recommend (personalized positions + AI ideas), News, Signals (43 quant tiles across 7 lanes), Prices (stocks/futures/crypto), Flights (military aircraft tracker), and more
- 22+ intelligence panels accessible via a command palette — congressional trades, dark pool prints, ETF flows, stablecoin supply, FRED macro, central-bank speeches, satellite shipping data
- 4-LLM consensus layer: Claude Sonnet 4.6, GPT-4o-mini, Gemini 2.5 Flash, Grok 3-mini-fast, all called in parallel on structured prompts
- Single-file architecture: 50 JSX files, no build step, Babel compiled in-browser, Python's http.server as origin, Cloudflare tunnel for public access

**What I measured:**
- Qualitative: Did the tool surface things I didn't already know from charting alone?
- Quantitative: When all four LLMs agreed on directional targets within a $5k band, did the 10-day forward return on BTC move in that direction?
- Operational: Did I actually use the tool every morning, or did it become another dashboard I opened twice and forgot?

### How I tested each layer

| Layer | Test |
|---|---|
| **Driver scoreboard** | Manually flagged daily "which 3 tiles would I watch today?" and compared against what moved |
| **Multi-LLM consensus** | 14 days of parallel predictions. Measured spread vs. 10-day realized BTC return |
| **Military flight tracker** | Compared anomalous US military density in CENTCOM bbox vs. next 48h WTI move |
| **Personalization** | Swapped between generic-book mode and my-actual-book mode. Logged differences in recommended action |
| **Morning email briefing** | Set up launchd job; ran for 7 days; measured whether I opened it before the market open |

---

## 3. What the Results Say

Here are the findings that surprised me — ranked by how much they've changed how I trade.

### Finding 1: LLM disagreement **is** the signal.

Most products treat the LLM output as the answer. It turns out the spread across LLMs is more informative than any single model's prediction.

Across 14 days of parallel forecasts:
- When all four models' year-end BTC targets clustered within **$5,000 of each other**, the 10-day forward return matched the direction of their consensus in **9 of 12 observations (75%)**.
- When the models disagreed by **$15,000 or more**, the 10-day forward return was effectively a coin flip (52% vs. 48%).

This pattern suggests something operationally important: **run four models, not one**. The variance is a real-time market-uncertainty metric that costs under $0.05 per query across all four. I've never seen a retail product measure it. At the institutional level, this would be a costed "AI consensus index" product.

**Practical rule I now trade by:** If the four-model year-end spread is >$15k, reduce position size by 40%. If it's <$5k and all four are directionally aligned, consider adding.

### Finding 2: Military flight data leads oil price by 12-48 hours.

I built a filter that isolates US military callsigns (RCH, HAVEN, BAT, SPAR, CNV, RYDR) in the CENTCOM bounding box — Iran, the Gulf, Iraq, the Arabian Peninsula. The callsigns decode to aircraft type (refueler, transport, bomber, patrol, exec).

Observed pattern across 30 days of tracking:
- **Refueler density >8 in the bbox** → WTI moved up an average of **$1.80/bbl** within 48 hours in 7 of 9 instances
- **Bomber support callsigns appearing** → material WTI spike (>$3/bbl) in 3 of 4 observed cases
- **Quiet skies (mil count <3)** → WTI drift or retreat, no exceptions observed

Not a randomized trial. Sample size is small. But the pattern is directionally consistent with the theory: the oil market prices geopolitical risk *after* news reports it, which happens *after* the operational buildup is visible in the sky.

**The data is free.** ADSBExchange and OpenSky Network publish ADS-B state vectors globally in real time. Your Bloomberg terminal does not show you this. A zero-cost API does.

### Finding 3: The IRGC Civilian Control Index is a signal nobody is tracking.

Conventional Iran analysis is locked in "deal or no deal." But the real risk vector is when Iran's Islamic Revolutionary Guard Corps sidelines the elected civilian president. That removes the diplomatic off-ramp and keeps a structural risk premium in oil regardless of headlines.

I built this as a single tile with three states: BALANCED / ELEVATED / CRISIS. It tracks: media ban scope, reformist arrests, cabinet composition shifts, public IRGC-affiliated appointments. Current reading: **ELEVATED**.

The tile took an afternoon to build. It's orthogonal to every other geopolitical signal I track. And I have not seen it in any institutional or retail product.

### Finding 4: Retail options IV already prices most "obvious" trades.

The dashboard this week flagged a clean setup on oil: Hormuz premium elevated, IRGC climbing, OPEC discipline holding. Classic long-calls playbook.

Problem: USO (the oil ETF) options were trading at **76% implied volatility**. The market had already priced the story. Buying a naked OTM call meant paying the full vol tax.

Pivot: **Call debit spread** ($140/$150 on the July monthly). Cost $285 per spread instead of $1,300. Max profit $715. Max loss $285. The short leg neutralizes most of the IV exposure. Same directional bet, 1/5 the cost.

**Insight:** Vol is information. When IV is elevated, the market is telling you it already expects a move. Your edge has to be wider than the market's uncertainty to justify buying premium. Otherwise, structure to fade the vol.

This is the kind of observation you can make in minutes when the dashboard shows IV, spread pricing, and catalyst in one view. You never make it tabbing between six browsers.

### Finding 5: Personalization is the moat.

A generic dashboard says "BTC is bullish." That's noise. It's trivially true for some holders and false for others.

TradeRadar knows my actual book — direct BTC, a COIN Dec 2026 $340 call, cash. The morning email now says:

> *"Your COIN Dec '26 $340C is 8 months out and deep OTM. It needs COIN > $355 at expiry to break even. Current regime implies BTC $85–92k range, which suggests COIN $280–310 — below your breakeven. HOLD. Do not average down. If BTC < $72k, exit the calls for residual premium and redeploy to direct BTC at oversold."*

That's the shift. Same underlying data. Completely different actionable output.

The engineering work to get from generic to personalized is embarrassingly small — a localStorage positions array, a few API calls for live quotes, and a prompt structure that feeds positions into the LLM context. And yet no mass-market product does this well.

### Finding 6: Babel-standalone is underrated.

Every piece of modern front-end advice — Vite, Next.js, TypeScript, Tailwind, pnpm, Turbopack — exists to solve problems most apps don't have.

TradeRadar is ~50 `.jsx` files loaded directly via `<script type="text/babel">`. No build step. No bundler. No server-side framework. The origin is Python's built-in `http.server`. The deploy pipeline is `git push`.

Cold start is 10-20 seconds (Babel compiles in the browser). After that, instant. Every feature — watchlist, alerts, trade journal, 4-LLM consensus, options chain, walkthrough system, self-test harness — is one file. Adding a new panel is 200 lines and a `<script>` tag.

I'm not arguing this scales to a million users. I'm arguing most apps shipping today don't need anything more sophisticated than this, and the toolchain tax is real. A lot of front-end complexity in 2026 exists to solve problems nobody has verified they have.

### Finding 7: Morning email > notification spam.

One well-crafted morning briefing email beats 50 notifications through the day.

My 6 AM PST email now leads with an **executive summary card** (synthesized by Claude, fallback GPT) — one-sentence market read, top 3 ranked recommendations with size + rationale, and a risk-level chip. Followed by seven structured sections: overnight updates, LLM thought shift, model impact (drivers), oil impact, BTC impact, overall verdict, and personalized investment profile against my actual positions.

Total read time: 90 seconds. Decision quality: materially better than the "scroll through Twitter" alternative I was doing before.

---

## 4. What We Brought Together

Each of the findings above is useful on its own. The real unlock was the integration.

The seven pieces individually:
- Live market data (crypto + stocks + futures + options)
- Macro feeds (FRED, EIA, Treasury, OPEC)
- News sentiment (GDELT, RSS aggregators)
- Geopolitical signals (military flights, IRGC index, prediction markets)
- Multi-LLM consensus layer
- Personalized position tracking
- Morning automation

Any two or three of these exist in retail tools. The six-or-seven combination is what I couldn't find anywhere — not in Bloomberg, not in FactSet Retail, not in any of the "AI trading" Substacks, not in a $500/month crypto-specific product. Combining them in one view, with multi-LLM consensus overlaying the whole thing and personalization as the output layer, is the product.

Three insights about the integration itself:

**A) The signals compound.** A high military-flight count is interesting. A high military-flight count *plus* elevated options IV on USO *plus* 4-LLM consensus skewing bullish on oil is a high-conviction trade setup. You only see that convergence when all three are on one screen.

**B) Free data beats paid data for most use cases.** ADSBExchange, OpenSky, GDELT, FRED, EIA, CoinGecko, Coinglass, Glassnode (free tier), prediction markets — these are professional-grade feeds. What's missing isn't the data. It's the synthesis.

**C) LLMs are a primitive, not the product.** The current "AI trading" wave wraps LLMs in thin UIs and calls them products. The real unlock is treating the LLM as *one input among many* — specifically, as a synthesis layer that reads multi-source data and formats it against the user's specific context. That's not a chat interface. It's an orchestration layer.

If I had to generalize: the next wave of AI-native tools in capital markets (and adjacent verticals) won't look like ChatGPT with charts. They will look like **opinionated workflow tools** that use LLMs to synthesize professional-grade data into personalized, actionable output. TradeRadar is my first serious attempt to prove that.

---

## What I'd tell someone building in this space

Heuristics from three weeks of shipping:

- **Tools that aggregate data beat tools that visualize it.** Retail has unlimited charting. What's scarce is synthesis.
- **LLM consensus beats single-LLM conviction.** At sub-penny unit economics, running four models in parallel is a feature, not a luxury.
- **Free data is massively underexploited.** The feeds that move markets are open APIs. Packaging them is the work.
- **Personalization is the moat.** A dashboard that reacts to your actual book is a different product category from a generic feed.
- **Morning email > notification spam.** Respect attention budgets.
- **Ship first, optimize later.** Three weeks with Claude Code, Babel-standalone, Python http.server, and Cloudflare tunnels got me a functional product I use every morning. Refactor what breaks. Don't refactor what works.

---

## Where I'm going

TradeRadar is, honestly, the first real product I've built as the principal of Global Gauntlet AI. It's served as a forcing function for a thesis I'm still developing: **AI-native trading tools are not ChatGPT with a chart next to it. They are fundamentally different data products that use LLMs as one primitive among many.**

Next iterations already in flight:
- **Historical analog finder** — "today's regime most resembles Nov 2019 + late 2015" with overlay charts. Pattern-matches the current driver scoreboard against 10 years of history.
- **Expanded scenario playbooks** — "if Iran closes Hormuz → oil +$15, SPX -3%, BTC -8%" pre-computed by LLM so the action is already on paper when the catalyst hits.
- **Journal learning layer** — trains on my logged entries (wins vs losses, held vs cut, right-thesis-wrong-timing vs wrong-thesis) to tighten my signal weights over time.
- **Mobile push notifications** for ARMED scenarios firing during market hours.

---

## Demo

The app is live and public. All API keys are preserved so it's fully functional on first visit — you can actually use it.

**👉 [demo link — I'll paste the live URL before publishing]**

First thing to click: the **Drivers** tab. Hit `?` for the keyboard shortcut cheatsheet. The **Trade of the Day** card at the top runs the four-LLM consensus against your positions and returns a single specific actionable options trade — strike, expiry, premium, breakeven, target, and kill rule.

Press **`p`** for the "Prep Me For Open" button. That runs a 30-second morning ritual: refreshes live data, runs the 4-LLM brief, checks your watchlist against alert rules, and flags any ARMED scenarios. It's the single most useful feature I've built.

Repo is public: [github.com/jjshay/TradeWatch](https://github.com/jjshay/TradeWatch)

Built end-to-end with Claude Code. Ship fast, measure, iterate.

---

**If you trade macro, options, or crypto** — and you're tired of charts telling you what already happened — I'd love your feedback.

**If you're a team building in this space** — or leading AI strategy or capital-markets product at an institution — I'm open to conversations.

---

**About the author**

JJ Shay is the founder of **Global Gauntlet AI**, an advisory firm working at the intersection of AI strategy, capital allocation, and M&A. He's an active options trader and LinkedIn content creator, builds tools at the intersection of public markets and machine intelligence, and previously ran Gauntlet Gallery (art reselling). Currently open to senior AI strategy and M&A roles. Based in Pacific time.
