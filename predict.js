/* ============================================================
   Predict — Prediction Markets + Futures Expectations Engine
   Polymarket (Gamma API), Kalshi, Oil Term Structure,
   BTC Perpetual Premium, Historical Calibration Analysis
   ============================================================ */

const Predict = {

  _cache: {},
  _ttl: 5 * 60 * 1000,

  async _fetch(url, key, opts = {}) {
    const c = this._cache[key];
    if (c && Date.now() - c.t < this._ttl) return c.d;
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      this._cache[key] = { d, t: Date.now() };
      return d;
    } catch (e) {
      console.warn('Predict fetch:', key, e.message);
      return null;
    }
  },

  // ── POLYMARKET — Active Markets (Gamma API, no auth) ──
  POLY_TAGS: [
    { slug: 'economics',   label: 'Economics' },
    { slug: 'crypto',      label: 'Crypto' },
    { slug: 'geopolitics', label: 'Geopolitics' },
    { slug: 'us-politics', label: 'Politics' },
    { slug: 'middle-east', label: 'Middle East' },
    { slug: 'iran',        label: 'Iran' }
  ],

  async fetchPolymarkets(tag = 'economics', limit = 20) {
    const d = await this._fetch(
      `https://gamma-api.polymarket.com/events?closed=false&tag_slug=${tag}&limit=${limit}&order=volume&ascending=false`,
      `poly_active_${tag}`
    );
    if (!Array.isArray(d)) return [];
    return d.map(e => {
      const markets = (e.markets || []).map(m => {
        let prices = [], outcomes = [];
        try { prices = JSON.parse(m.outcomePrices || '[]'); } catch {}
        try { outcomes = JSON.parse(m.outcomes || '[]'); } catch {}
        return {
          id: m.id,
          question: m.question,
          outcomes,
          prices: prices.map(p => parseFloat(p)),
          volume: parseFloat(m.volume || 0)
        };
      });
      return {
        id: e.id,
        title: e.title,
        slug: e.slug,
        endDate: e.endDate,
        volume: parseFloat(e.volume || 0),
        liquidity: parseFloat(e.liquidity || 0),
        markets
      };
    });
  },

  // ── POLYMARKET — Resolved Markets (for historical accuracy) ──
  async fetchResolvedPolymarkets(tag = 'economics', limit = 100) {
    const d = await this._fetch(
      `https://gamma-api.polymarket.com/events?closed=true&tag_slug=${tag}&limit=${limit}&order=volume&ascending=false`,
      `poly_closed_${tag}`
    );
    if (!Array.isArray(d)) return [];
    const results = [];
    for (const e of d) {
      for (const m of (e.markets || [])) {
        if (!m.resolved) continue;
        let prices = [], outcomes = [];
        try { prices = JSON.parse(m.outcomePrices || '[]'); } catch {}
        try { outcomes = JSON.parse(m.outcomes || '[]'); } catch {}
        if (prices.length < 2 || outcomes.length < 2) continue;
        const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
        const yesPrice = yesIdx >= 0 ? parseFloat(prices[yesIdx]) : parseFloat(prices[0]);
        const resolvedYes = m.winnerOutcome?.toLowerCase() === 'yes' ||
          (yesIdx === 0 && m.winnerOutcome === outcomes[0]);
        results.push({
          eventTitle: e.title,
          question: m.question,
          resolvedDate: m.resolutionTime || e.endDate,
          volume: parseFloat(m.volume || 0),
          finalProbYes: Math.max(0.01, Math.min(0.99, yesPrice)),
          outcome: resolvedYes ? 1 : 0
        });
      }
    }
    return results;
  },

  // ── CALIBRATION ANALYSIS ──
  // Compares implied probability at market close vs actual outcomes
  computeCalibration(resolvedMarkets) {
    const edges = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    return edges.slice(0, -1).map((low, i) => {
      const high = edges[i + 1];
      const bucket = resolvedMarkets.filter(m => {
        const p = m.finalProbYes * 100;
        return p >= low && p < high;
      });
      const yesCount = bucket.filter(m => m.outcome === 1).length;
      return {
        bucket: `${low}–${high}%`,
        midpoint: (low + high) / 2,
        implied: (low + high) / 2,
        actualRate: bucket.length > 0 ? (yesCount / bucket.length) * 100 : null,
        count: bucket.length,
        totalVolume: bucket.reduce((s, m) => s + m.volume, 0)
      };
    });
  },

  // Brier score (lower = better calibrated; 0=perfect, 0.25=uninformative)
  brierScore(resolvedMarkets) {
    if (!resolvedMarkets.length) return null;
    const sum = resolvedMarkets.reduce((s, m) => s + Math.pow(m.finalProbYes - m.outcome, 2), 0);
    return +(sum / resolvedMarkets.length).toFixed(4);
  },

  // ── KALSHI — Public market data ──
  async fetchKalshiMarkets(limit = 25) {
    const d = await this._fetch(
      `https://trading-api.kalshi.com/trade-api/v2/markets?limit=${limit}&status=open`,
      `kalshi_open_${limit}`
    );
    if (!d?.markets) return [];
    return d.markets.map(m => ({
      ticker: m.ticker,
      title: m.title,
      category: m.category,
      closeTime: m.close_time,
      yesPrice: m.yes_ask != null ? +(m.yes_ask / 100).toFixed(2) : null,
      noPrice:  m.no_ask  != null ? +(m.no_ask  / 100).toFixed(2) : null,
      lastPrice: m.last_price != null ? +(m.last_price / 100).toFixed(2) : null,
      volume: m.volume || 0,
      openInterest: m.open_interest || 0
    }));
  },

  // Search Kalshi markets by keyword
  async searchKalshi(keyword) {
    const all = await this.fetchKalshiMarkets(100);
    const kw = keyword.toLowerCase();
    return all.filter(m =>
      m.title?.toLowerCase().includes(kw) ||
      m.category?.toLowerCase().includes(kw)
    );
  },

  // ── OIL FUTURES TERM STRUCTURE (Tradier) ──
  // WTI crude: CL + month code + 2-digit year
  MONTH_CODES: ['F','G','H','J','K','M','N','Q','U','V','X','Z'],
  MONTH_NAMES: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],

  buildCLSymbol(offset) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return {
      symbol: `CL${this.MONTH_CODES[d.getMonth()]}${String(d.getFullYear()).slice(2)}`,
      label: `${this.MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
    };
  },

  async fetchOilCurve(months = 8) {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const token = keys.tradier || 'UbRTiiIwAl52hIYm02TPrJAlP6AF';
    const contracts = Array.from({ length: months }, (_, i) => this.buildCLSymbol(i + 1));
    const symbols = contracts.map(c => c.symbol).join(',');
    const d = await this._fetch(
      `https://api.tradier.com/v1/markets/quotes?symbols=${symbols}&greeks=false`,
      `oil_curve_${symbols}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );
    const quotes = d?.quotes?.quote;
    if (!quotes) return [];
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    return contracts.map(c => {
      const q = arr.find(x => x.symbol === c.symbol);
      return { label: c.label, symbol: c.symbol, price: q?.last ?? q?.close ?? null };
    }).filter(x => x.price !== null);
  },

  // ── BTC Perpetual Futures (Binance) ──
  async fetchBTCPremium() {
    const d = await this._fetch(
      'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
      'btc_premium'
    );
    if (!d) return null;
    const mark  = parseFloat(d.markPrice);
    const index = parseFloat(d.indexPrice);
    return {
      markPrice:    mark,
      indexPrice:   index,
      fundingRate:  +(parseFloat(d.lastFundingRate) * 100).toFixed(4),
      premium:      +((mark - index) / index * 100).toFixed(4),
      nextFunding:  d.nextFundingTime,
      annualRate:   +(parseFloat(d.lastFundingRate) * 100 * 3 * 365).toFixed(1)
    };
  },

  // Binance funding rate history for chart
  async fetchBTCFundingHistory(limit = 90) {
    const d = await this._fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=${limit}`,
      `btc_funding_hist_${limit}`
    );
    if (!Array.isArray(d)) return [];
    return d.map(x => ({
      time: new Date(x.fundingTime).toISOString().slice(0, 10),
      rate: +(parseFloat(x.fundingRate) * 100).toFixed(5)
    })).reverse();
  },

  // ── Implied Fed Path from Kalshi ──
  // Fed rate markets typically have titles like "Fed rate above X% at Dec meeting"
  async fetchFedExpectations() {
    const markets = await this.fetchKalshiMarkets(100);
    const fedMarkets = markets.filter(m =>
      m.title?.toLowerCase().includes('fed') ||
      m.title?.toLowerCase().includes('federal funds') ||
      m.title?.toLowerCase().includes('interest rate') ||
      m.title?.toLowerCase().includes('fomc')
    ).slice(0, 10);
    return fedMarkets;
  },

  // ── Unusual Options Flow Scanner ──
  // Scans IBIT, COIN, USO, VXX for contracts with anomalous volume vs OI
  FLOW_TICKERS: ['IBIT', 'COIN', 'USO', 'VXX'],

  async scanOptionsFlow(tickers = null) {
    const syms = tickers || this.FLOW_TICKERS;
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const token = keys.tradier || 'UbRTiiIwAl52hIYm02TPrJAlP6AF';
    const results = [];

    for (const ticker of syms) {
      try {
        // Get nearest expiration 14-60 days out
        const expData = await this._fetch(
          `https://api.tradier.com/v1/markets/options/expirations?symbol=${ticker}&includeAllRoots=true`,
          `exp_flow_${ticker}`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
        );
        const dates = expData?.expirations?.date;
        if (!dates) continue;
        const arr = Array.isArray(dates) ? dates : [dates];
        const now = Date.now();
        const exp = arr.find(d => {
          const dte = (new Date(d) - now) / 86400000;
          return dte >= 7 && dte <= 60;
        }) || arr[0];

        const chainData = await this._fetch(
          `https://api.tradier.com/v1/markets/options/chains?symbol=${ticker}&expiration=${exp}&greeks=true`,
          `flow_chain_${ticker}_${exp}`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
        );
        const options = chainData?.options?.option;
        if (!options) continue;
        const chain = Array.isArray(options) ? options : [options];

        // Score each contract for unusual activity
        for (const o of chain) {
          const vol = o.volume || 0;
          const oi = o.open_interest || 1;
          const ratio = vol / oi;
          // Flag if: vol/OI > 1.5 AND volume > 50
          if (ratio >= 1.5 && vol >= 50) {
            const mid = ((o.bid || 0) + (o.ask || 0)) / 2;
            const dte = Math.round((new Date(o.expiration_date) - now) / 86400000);
            results.push({
              ticker,
              type: o.option_type?.toUpperCase(),
              strike: o.strike,
              expiration: o.expiration_date,
              dte,
              volume: vol,
              openInterest: oi,
              ratio: +ratio.toFixed(2),
              bid: o.bid,
              ask: o.ask,
              mid: +mid.toFixed(2),
              iv: o.greeks?.mid_iv ? +(o.greeks.mid_iv * 100).toFixed(1) : null,
              delta: o.greeks?.delta?.toFixed(3) ?? null,
              anomalyScore: +(ratio * Math.log10(vol + 1)).toFixed(2)
            });
          }
        }
      } catch (e) {
        console.warn('Flow scan error:', ticker, e.message);
      }
    }

    // Sort by anomaly score descending
    return results.sort((a, b) => b.anomalyScore - a.anomalyScore).slice(0, 25);
  },

  // ── Format helpers ──
  formatVolume(v) {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v}`;
  },

  daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr) - Date.now()) / 86400000);
  }
};
