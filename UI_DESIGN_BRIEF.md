# TradeWatch — UI Design Brief

> Handoff document for UI component design. Summarizes product context, user directives, and aesthetic direction.

---

## 1. What TradeWatch Is

A single-page progressive web app for traders who believe **macro events cause price moves before charts show them**. It aggregates real-time data across crypto, oil, equities, geopolitics, and sentiment into one dashboard, then uses AI to surface actionable intelligence.

Three tabs. One asset framework. Zero clutter.

---

## 2. Investment Strategy (Why This App Exists)

**The thesis:** Price follows cause. The biggest moves in BTC, oil, and equities over the last five years weren't RSI divergences — they were Fed pivots, Strait of Hormuz tensions, ETF approvals, and tariff announcements.

**The three-asset framework:**

| Asset | What It Represents |
|---|---|
| **WTI Crude Oil** | Geopolitical risk (Strait of Hormuz, OPEC, SPR policy) |
| **Bitcoin** | Macro liquidity + risk appetite (Fed cuts, ETF flows, halving) |
| **S&P 500** | Policy/economic risk (rate expectations, earnings) |

**The five drivers** that explain most of the cross-asset variance: Iran/Strait of Hormuz, Trump policy volatility, Federal Reserve, BTC institutional flow, China.

Users want to see **when these three assets converge vs. diverge**, and understand **what event caused the divergence**.

---

## 3. Core Functionality (Three Tabs)

### Tab 1 — Historical (built)
- Interactive line chart: BTC vs. WTI Oil (S&P 500 optional)
- Series normalized to **% change from a reference date** (0% midline, ±5%, ±10% gridlines)
- Timeframe toggles: 1Y / 2Y / 5Y / All
- **Event dots** on the chart at dates of geopolitical / macro events (~80 curated events in DB)
- Hovering a dot shows a **tooltip** with event label, date, category, and summary
- Bottom bar: BTC/Oil full-period correlation + rolling 90d correlation
- Uses TradingView Lightweight Charts for the chart itself

### Tab 2 — Projected (not yet built)
- Scenario model with **driver sliders** (0–100% for each of 8 drivers: Trump, Iran, Fed, Israel, China, BTC Institutional, CLARITY Act, US Shale)
- Each driver has a lowLabel / highLabel (e.g., Iran: "Strait Open" ←→ "Strait Closed")
- "Run Projection" → Claude API → returns projected price ranges (base/bull/bear) for Oil, BTC, S&P through end of 2026
- Fan chart showing the projection ranges
- AI narrative paragraph under the chart

### Tab 3 — Impact (not yet built)
- User enters tickers (NVDA, XOM, IBIT, etc.)
- For each: **Direct Buy card** (current price, target from Tab 2, % return, downside) + **Options card** (live chain from Tradier, filtered for best risk/reward calls)
- AI picks the best contract for the scenario
- Payoff diagram: P&L curve for option vs. direct stock

---

## 4. Explicit UI Directives from User

Paraphrased and quoted from the session:

1. **"Three modular sections"** — the app is a 3-tab layout, nothing more. No bottom nav clutter.

2. **"Historical chart mapping bitcoin price vs. oil price from beginning of bitcoin time, you can zoom in and get deeper dive"** — the chart must be zoomable and pannable, with the ability to scrub back to Bitcoin's 2013 origin.

3. **"Middle line is 0% upper 5%, 10%, etc. and bottom line -5%, etc. to show the correlation between the two"** — the chart uses percentage-change normalization with an explicit zero midline and symmetric gridlines. No dual-axis price scale.

4. **"Mouse overs where there is a meaningful change in the correlation path or impact change"** — event annotations appear at dates where a real divergence or impact occurred. Not every event — only those that mattered.

5. **"Default to 2-year view"** — the initial timeframe is 2Y, not all-time.

6. **"Total rehaul… scrap the 9,200-line monolith"** — the previous version was cluttered and slow; the new version is 569 lines total. Minimalism is the mandate.

7. **"Make this truly a Steve Jobs looking app"** — the most recent and explicit aesthetic brief.

---

## 5. Aesthetic Direction — Steve Jobs / Apple

Already approved by user, synthesized with an Opus design agent. The canonical spec lives separately; the highlights:

- **Dark only.** Four levels of black (`#07090C`, `#0B0E13`, `#10141B`, `#171C24`). No gradients on surfaces.
- **One accent color:** muted gold `#E8B84A` ("signal"). Used exclusively for the active state of ONE thing at a time and the crosshair. No green/red P&L coloring — this is a correlation app, not a portfolio.
- **Two fonts:** `Inter Tight` for UI text, `JetBrains Mono` for all numerical values (prices, correlations, dates). Numbers belong in mono. Always.
- **Three font weights only:** 400, 500, 600. Never 700. Bold is loud; this app whispers.
- **Three easing curves total.** Every animation uses one of three cubic-beziers. No ad-hoc transitions.
- **Concentric geometry.** Active tab has a 7px radius inside a 10px radius container (the Touch Bar / Dynamic Island trick). Every rounded rectangle nests with its parent.
- **0.5px inset highlights** on active states — makes pills feel lit from above.
- **Backdrop-filter blur** on tooltips: 24px blur + 160% saturation. The event tooltip materializes with a blur-in animation (not a simple fade).
- **Signature moment:** when the user scrubs across the chart and the crosshair passes an event dot, a 1px gold vertical line persists at that event's x-position for 900ms then fades. Sweeping the chart leaves a constellation of gold threads marking where geopolitics disturbed the market.
- **Data-series colors** (used only inside the chart): BTC `#F7931A`, Oil `#6B8AFA`, S&P `#9AA3B2`. Muted, non-competing.
- **Instrument-cluster correlation bar** at bottom: big mono number (22px), tiny uppercase label above, short gold underline tick below each stat.

---

## 6. What's Already Built (Historical Tab)

Structure:
```
┌───────────────────────────────────────────────┐
│  TW  TradeWatch    [Historical|Projected|...] │
├───────────────────────────────────────────────┤
│  ● BTC  ● WTI Oil  ● S&P     [1Y][2Y][5Y][All]│
├───────────────────────────────────────────────┤
│                                               │
│           Chart (TradingView Lightweight)     │
│           — 0% midline —                      │
│           — event dots —                      │
│                                               │
├───────────────────────────────────────────────┤
│  BTC/OIL · CORRELATION   ROLLING 90D          │
│  0.312                   0.187                │
└───────────────────────────────────────────────┘
```

Event markers on the chart are dots colored by category (geopolitical=red, Fed=blue, BTC=orange, trump=purple, institutional=green, regulatory=teal). On crosshair hover over a dot, tooltip appears with label + summary.

---

## 7. Components That Still Need Design

The following components need visual design (HTML/CSS, ready to drop into a vanilla JS app):

**Projected tab (Tab 2):**
1. **Driver slider card** — expandable card with low/high label, slider handle, current value chip. 8 of these stack vertically.
2. **"Run Projection" CTA** — primary action button. Must feel like committing.
3. **Fan chart** — 3-band projection chart (bull/base/bear) through 2026, rendered on Canvas 2D. Horizontal = time, vertical = price. Three shaded bands.
4. **AI narrative block** — readable prose paragraph. Needs typography treatment so it doesn't feel like a terms-of-service dump.
5. **News context paste box** — text input for user to paste today's headlines → Claude extracts drivers.

**Impact tab (Tab 3):**
6. **Ticker-entry row** — input field with "Add" affordance, existing tickers appear as removable chips.
7. **Direct-Buy card** — current price, target, % return, % downside, horizontal bar showing risk/reward.
8. **Options-Best card** — small tabular list of 3–5 contracts (strike, expiration, IV, bid, ask, delta). One row highlighted as "AI Pick".
9. **Payoff diagram** — Canvas 2D chart plotting P&L curve of option vs. direct buy across a price range from 0.55× to 1.70× current price. Breakeven marker. Max gain/loss labels.
10. **AI recommendation paragraph** — similar treatment to #4, but shorter (3–4 sentences).

**Cross-cutting:**
11. **Loading skeleton** for chart areas during fetch.
12. **Empty state** for when a ticker returns no options.
13. **Error toast** — non-blocking, dismissible, bottom-right. Matches the gold-accent system.
14. **Settings sheet** — slide-up panel for API keys (FRED, Tradier, Claude). Needs to feel trustworthy, not intrusive.

---

## 8. Technical Constraints for Design Output

- **Vanilla JS only.** No React, no Vue, no Svelte. Components are HTML + CSS + imperative JS.
- **No build step.** CSS in `<style>` blocks or external `.css` file. No Sass, no PostCSS, no Tailwind compile.
- **Dark theme only.** Don't waste cycles designing a light mode.
- **Mobile: 375px minimum.** Desktop target: 1440px. No tablet-specific layout.
- **Chart library is TradingView Lightweight Charts v4.** Designs must work around the canvas — we can style the container, legend, crosshair readout, and event tooltip, but not the interior chart paint.
- **No icon libraries (Material, FontAwesome, etc.).** Icons are either inline SVG or pure CSS (e.g., hamburger via box-shadow on pseudo-element).
- **Claude API powers the AI parts.** Narrative generation and recommendation ranking arrive as plain-text strings to be rendered.

---

## 9. Files You May Want to Reference

- `index.html` — current implementation (569 lines, all 3 tabs, Historical is live)
- `geo-intel.js` — data layer for FRED/Tradier/scenario model + DRIVERS array with low/high labels
- `events-db.js` — 80 annotated events with category, color, summary (the content for event tooltips)
- `STRATEGY.md` — detailed investment thesis
- `README.md` — feature overview and data sources table

---

## 10. The One Line Summary

> **TradeWatch shows three assets, annotated by the causes that moved them, styled like an instrument a trader would want to look at.**

Any component that doesn't serve that one line shouldn't exist.
