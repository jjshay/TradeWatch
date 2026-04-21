/* ============================================================
   GeoIntel Data Engine
   FRED API, Tradier Options, Scenario Model
   ============================================================ */

const GeoIntel = {

  // ── CACHE ──
  _cache: {},
  _cacheTTL: 10 * 60 * 1000,

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
      console.warn('GeoIntel fetch failed:', key, e.message);
      return null;
    }
  },

  // ── FRED API ──
  // Free key from fred.stlouisfed.org — stored in same AI key store
  async fetchFREDSeries(seriesId, startDate = '2013-01-01') {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const apiKey = keys.fred || 'ca0c99f98f1221bf443bc1a3c6994441';
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&observation_start=${startDate}&api_key=${apiKey}&file_type=json&frequency=d&aggregation_method=eop`;
    const data = await this._fetch(url, `fred_${seriesId}_${startDate}`);
    if (!data || !data.observations) return [];
    return data.observations
      .filter(o => o.value !== '.' && o.value !== 'NA')
      .map(o => ({ time: o.date, value: parseFloat(o.value) }));
  },

  // ── BITCOIN HISTORY (CoinGecko max) ──
  async fetchBTCHistory() {
    const data = await this._fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=weekly',
      'btc_max_history'
    );
    if (!data || !data.prices) return [];
    return data.prices.map(([ts, price]) => ({
      time: new Date(ts).toISOString().slice(0, 10),
      value: price
    }));
  },

  // ── NORMALIZE to % change from first value ──
  normalizeToPercent(series) {
    if (!series.length) return [];
    const base = series[0].value;
    if (!base) return series;
    return series.map(p => ({ time: p.time, value: ((p.value - base) / base) * 100 }));
  },

  // ── PEARSON CORRELATION ──
  correlation(a, b) {
    // Align by date
    const mapA = new Map(a.map(p => [p.time, p.value]));
    const pairs = b.filter(p => mapA.has(p.time)).map(p => [mapA.get(p.time), p.value]);
    if (pairs.length < 10) return null;
    const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const num = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0);
    const den = Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) * ys.reduce((s, v) => s + (v - my) ** 2, 0));
    return den === 0 ? 0 : num / den;
  },

  // ── TRADIER OPTIONS CHAIN ──
  async fetchOptionsChain(ticker, expiration = null) {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const token = keys.tradier || 'UbRTiiIwAl52hIYm02TPrJAlP6AF';
    if (!token) return { error: 'No Tradier API key. Get a free key at tradier.com/api.' };

    // First get available expirations if none specified
    if (!expiration) {
      const expData = await this._fetch(
        `https://api.tradier.com/v1/markets/options/expirations?symbol=${ticker}&includeAllRoots=true`,
        `tradier_exp_${ticker}`,
        { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
      );
      if (!expData?.expirations?.date) return { error: 'No expirations found.' };
      const dates = Array.isArray(expData.expirations.date)
        ? expData.expirations.date : [expData.expirations.date];
      // Pick first expiration that's 45-180 days out
      const now = Date.now();
      expiration = dates.find(d => {
        const dte = (new Date(d) - now) / 86400000;
        return dte >= 45 && dte <= 180;
      }) || dates[0];
    }

    const chainData = await this._fetch(
      `https://api.tradier.com/v1/markets/options/chains?symbol=${ticker}&expiration=${expiration}&greeks=true`,
      `tradier_chain_${ticker}_${expiration}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    if (!chainData?.options?.option) return { error: 'No options data returned.' };
    const options = Array.isArray(chainData.options.option)
      ? chainData.options.option : [chainData.options.option];

    // Filter: calls only, delta 0.20-0.55, spread < 8% of mid
    const filtered = options
      .filter(o => {
        if (o.option_type !== 'call') return false;
        const delta = o.greeks?.delta ?? 0;
        if (delta < 0.20 || delta > 0.55) return false;
        const mid = (o.bid + o.ask) / 2;
        if (mid <= 0) return false;
        const spread = (o.ask - o.bid) / mid;
        if (spread > 0.12) return false;
        return true;
      })
      .map(o => {
        const mid = (o.bid + o.ask) / 2;
        const dte = Math.round((new Date(o.expiration_date) - Date.now()) / 86400000);
        return {
          strike: o.strike,
          expiration: o.expiration_date,
          dte,
          type: 'CALL',
          bid: o.bid,
          ask: o.ask,
          mid,
          iv: o.greeks?.mid_iv ? (o.greeks.mid_iv * 100).toFixed(1) : '--',
          delta: o.greeks?.delta?.toFixed(3) ?? '--',
          gamma: o.greeks?.gamma?.toFixed(4) ?? '--',
          theta: o.greeks?.theta?.toFixed(3) ?? '--',
          openInterest: o.open_interest ?? 0,
          volume: o.volume ?? 0
        };
      })
      .sort((a, b) => b.openInterest - a.openInterest)
      .slice(0, 8);

    return { expiration, options: filtered, ticker };
  },

  // ── SCENARIO DRIVERS ──
  DRIVERS: [
    {
      id: 'trump',
      label: 'Trump Actions',
      icon: '🇺🇸',
      lowLabel: 'De-escalate / Deal-Making',
      highLabel: 'Escalate / Tariffs / War',
      value: 60,
      oilImpact:  +0.15,  // per 10pts above 50: +% to oil
      btcImpact:  -0.08,
      spxImpact:  -0.12,
      description: 'Tariff escalation, Iran/military posture, crypto/dollar policy'
    },
    {
      id: 'iran_strait',
      label: 'Iran / Strait of Hormuz',
      icon: '🛢',
      lowLabel: 'Strait Open / Diplomacy',
      highLabel: 'Strait Threatened / Closed',
      value: 35,
      oilImpact:  +0.25,
      btcImpact:  +0.05,
      spxImpact:  -0.08,
      description: '20M barrels/day transit risk. Full closure = +$30-50/barrel'
    },
    {
      id: 'fed',
      label: 'Fed Policy',
      icon: '🏦',
      lowLabel: 'Aggressive Cuts / QE',
      highLabel: 'Hold / Hike',
      value: 45,
      oilImpact:  +0.05,
      btcImpact:  +0.20,
      spxImpact:  +0.18,
      description: 'Rate cuts → risk-on, dollar weakens → BTC/oil up'
    },
    {
      id: 'israel_lebanon',
      label: 'Israel / Lebanon / Gaza',
      icon: '⚔️',
      lowLabel: 'Ceasefire Holds',
      highLabel: 'Full Regional War',
      value: 40,
      oilImpact:  +0.18,
      btcImpact:  -0.05,
      spxImpact:  -0.10,
      description: 'Regional escalation into Iran proxies threatens Strait and energy'
    },
    {
      id: 'china',
      label: 'China Actions',
      icon: '🐉',
      lowLabel: 'Trade Deal / Cooperative',
      highLabel: 'Taiwan / Full Trade War',
      value: 50,
      oilImpact:  -0.10,
      btcImpact:  -0.12,
      spxImpact:  -0.15,
      description: 'China is world\'s largest oil importer. Taiwan conflict = global shock'
    },
    {
      id: 'btc_institutional',
      label: 'BTC Institutional Flow',
      icon: '🏛',
      lowLabel: 'ETF Outflows / Selling',
      highLabel: 'ETF Inflows / Buying',
      value: 70,
      oilImpact:   0,
      btcImpact:  +0.30,
      spxImpact:  +0.05,
      description: 'BlackRock IBIT, MicroStrategy, sovereign funds, Trump family WLFI'
    },
    {
      id: 'clarity_act',
      label: 'CLARITY Act',
      icon: '⚖️',
      lowLabel: 'Stalled / Failed',
      highLabel: 'Passed / Signed',
      value: 55,
      oilImpact:   0,
      btcImpact:  +0.15,
      spxImpact:  +0.03,
      description: 'Crypto market structure bill — certainty for institutional adoption'
    },
    {
      id: 'us_shale',
      label: 'US Shale / Energy Policy',
      icon: '⛽',
      lowLabel: 'Max Production / Low Price',
      highLabel: 'Constrained / High Price',
      value: 35,
      oilImpact:  -0.12,
      btcImpact:  +0.02,
      spxImpact:  +0.03,
      description: '"Drill baby drill" vs. OPEC+ coordination. US now #1 producer'
    }
  ],

  // ── RUN SCENARIO PROJECTION ──
  // Returns { oil: {base, bull, bear}, btc: {base, bull, bear}, spx: {base, bull, bear}, narrative }
  async runProjection(driverValues, newsContext, currentPrices) {
    const { oilPrice = 72, btcPrice = 83000, spxPrice = 5200 } = currentPrices;

    // Compute weighted impact from each driver
    let oilMult = 1, btcMult = 1, spxMult = 1;
    for (const driver of this.DRIVERS) {
      const val = driverValues[driver.id] ?? driver.value;
      const deviation = (val - 50) / 50; // -1 to +1
      oilMult += deviation * driver.oilImpact;
      btcMult += deviation * driver.btcImpact;
      spxMult += deviation * driver.spxImpact;
    }

    // Base targets (end of 2026, ~20 months out)
    const oilBase  = Math.round(oilPrice  * oilMult * 100) / 100;
    const btcBase  = Math.round(btcPrice  * btcMult);
    const spxBase  = Math.round(spxPrice  * spxMult);

    // Bull/bear bands (±20% volatility overlay)
    const result = {
      oil: { base: oilBase, bull: Math.round(oilBase * 1.22), bear: Math.round(oilBase * 0.78) },
      btc: { base: btcBase, bull: Math.round(btcBase * 1.35), bear: Math.round(btcBase * 0.65) },
      spx: { base: spxBase, bull: Math.round(spxBase * 1.18), bear: Math.round(spxBase * 0.82) }
    };

    // Build Claude prompt for narrative
    const driverSummary = this.DRIVERS.map(d => {
      const val = driverValues[d.id] ?? d.value;
      const side = val > 65 ? d.highLabel : val < 35 ? d.lowLabel : 'neutral';
      return `${d.label}: ${val}% (${side})`;
    }).join('\n');

    const prompt = `You are a geopolitical financial analyst. Based on the following scenario inputs and current market context, provide a concise 3-paragraph projection narrative for oil, Bitcoin, and S&P 500 through end of 2026.

DRIVER INPUTS (0=bearish extreme, 50=neutral, 100=bullish extreme):
${driverSummary}

CURRENT PRICES:
- WTI Oil: $${oilPrice}
- Bitcoin: $${btcPrice.toLocaleString()}
- S&P 500: ${spxPrice.toLocaleString()}

QUANTITATIVE PROJECTIONS (base/bull/bear):
- Oil: $${result.oil.base} | Bull: $${result.oil.bull} | Bear: $${result.oil.bear}
- BTC: $${result.btc.base.toLocaleString()} | Bull: $${result.btc.bull.toLocaleString()} | Bear: $${result.btc.bear.toLocaleString()}
- S&P: ${result.spx.base.toLocaleString()} | Bull: ${result.spx.bull.toLocaleString()} | Bear: ${result.spx.bear.toLocaleString()}

${newsContext ? `TODAY'S CONTEXT:\n${newsContext}` : ''}

Write 3 short paragraphs: (1) oil outlook and key risks, (2) Bitcoin outlook and key catalysts, (3) S&P 500 outlook and the interplay between all three. Be specific, direct, and reference the driver inputs. End with one sentence on the highest-conviction trade.`;

    if (typeof AIAnalysis !== 'undefined') {
      const resp = await AIAnalysis.chatWithClaude(prompt, '');
      result.narrative = resp?.text || null;
    }

    return result;
  },

  // ── GET OPTIONS AI RECOMMENDATION ──
  async getOptionsReco(ticker, options, targetPrice, currentPrice, scenarioNarrative) {
    if (!options || !options.length) return null;
    const optionsList = options.map(o =>
      `Strike $${o.strike} exp ${o.expiration} (${o.dte}d) | mid $${o.mid.toFixed(2)} | IV ${o.iv}% | delta ${o.delta} | OI ${o.openInterest}`
    ).join('\n');

    const upside = ((targetPrice - currentPrice) / currentPrice * 100).toFixed(1);

    const prompt = `You are an options strategist. Analyze these call options for ${ticker} and recommend the best 1-2 based on risk/reward for the scenario described.

CURRENT PRICE: $${currentPrice}
SCENARIO TARGET (end 2026): $${targetPrice} (+${upside}%)
${scenarioNarrative ? `SCENARIO: ${scenarioNarrative.slice(0, 300)}` : ''}

AVAILABLE CALLS:
${optionsList}

For each recommended option, calculate:
- Max return if target is hit: (intrinsic value at target - premium paid) / premium paid
- Break-even price
- Risk: premium at risk if wrong

Respond in 3-4 sentences: name the best 1-2 contracts, why, the expected return vs. direct stock, and key risk. Be specific with numbers.`;

    if (typeof AIAnalysis !== 'undefined') {
      const resp = await AIAnalysis.chatWithClaude(prompt, '');
      return resp?.text || null;
    }
    return null;
  },

  // ── LIVE QUOTE (Tradier) ──
  async getQuote(ticker) {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const token = keys.tradier || 'UbRTiiIwAl52hIYm02TPrJAlP6AF';
    if (!token) return null;
    const data = await this._fetch(
      `https://api.tradier.com/v1/markets/quotes?symbols=${ticker}&greeks=false`,
      `quote_${ticker}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );
    return data?.quotes?.quote || null;
  },

  // ── FORMAT HELPERS ──
  fmtPrice(v) {
    if (!v && v !== 0) return '--';
    if (Math.abs(v) >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (Math.abs(v) >= 10) return '$' + v.toFixed(2);
    return '$' + v.toFixed(4);
  },

  fmtPct(v) {
    if (!v && v !== 0) return '--';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

};
