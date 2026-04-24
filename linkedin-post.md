⚡ I built a trading dashboard that ignores charts.

Over 3 weeks of nights and weekends, shipped something I've wanted for a long time: a tool that starts with cause, not price.

It's called TradeRadar.

It fuses 50+ signals that actually move BTC, oil, and the S&P — before price catches up:

• Multi-LLM consensus · Claude + GPT + Gemini + Grok run in parallel. When they agree, conviction is high. When they disagree by $15k+ on year-end BTC, you stand down. The spread itself is the signal.

• Military flight tracking · Free ADS-B data from ADSBExchange & OpenSky. When US refuelers start stacking over Bahrain and Qatar, the oil market prices it in 12-48 hours later. Your Bloomberg terminal doesn't show you this.

• IRGC Civilian Control Index · A geopolitical tile nobody is tracking. When the IRGC sidelines Iran's elected president, the diplomatic off-ramp closes and a structural risk premium stays in oil regardless of headlines. Current reading · ELEVATED.

• Personalized positions · Knows my actual book — direct BTC, a COIN Dec '26 $340 call, cash. The morning email says "HOLD, do not average down" with specific math, not "BTC looks bullish."

• 22 intelligence panels · Congress trades, dark pool prints, ETF flows, stablecoin mints, FRED yield curves, OPEC discipline, satellite shipping data. Everything one keystroke away.

Three things surprised me most:

1. Retail options IV already prices most "obvious" trades. When you see a catalyst, so does everyone else. Structure the trade to fade the vol, not buy it.

2. LLM consensus beats single-LLM conviction. Four models at under $0.01 per query is a completely different product than one model you pay $20/mo for.

3. Free data is criminally under-exploited. ADSBExchange, OpenSky, GDELT, FRED — these are professional-grade feeds nobody packages for traders.

No build step. No backend. ~50 JSX files loaded directly via Babel-standalone. The entire "modern front-end toolchain" was never needed for this.

Demo is live — public and functional with real API keys preserved so you can actually use it:
👉 [paste demo link here before posting]

First thing to click · the Drivers tab. Hit ? for the keyboard shortcuts. The "Trade of the Day" card at the top runs the four-LLM consensus against your positions and returns one actionable options trade with strike, expiry, breakeven, and stop rule.

If you trade BTC, oil, or macro — and you're tired of charts telling you what already happened — I'd love your feedback.

Full write-up · [paste LinkedIn article link here]
Repo · github.com/jjshay/TradeWatch

Built with Claude Code. Ship fast, measure, iterate.

What signal is your dashboard missing?

#AItrading #quantfinance #bitcoin #oilmarkets #buildinpublic #opensource
