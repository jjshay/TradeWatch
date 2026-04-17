/* ============================================================
   Pulse — Market Sentiment & Macro Data Engine
   Fear/Greed, VIX, AAII, Yield Curve, HY Spread, BTC Funding,
   CryptoPanic news sentiment, CNN Fear & Greed
   ============================================================ */

const Pulse = {

  _cache: {},
  _ttl: 15 * 60 * 1000,

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
      console.warn('Pulse fetch failed:', key, e.message);
      return null;
    }
  },

  // ── Crypto Fear & Greed (alternative.me) ──
  async fetchCryptoFNG(limit = 30) {
    const d = await this._fetch(
      `https://api.alternative.me/fng/?limit=${limit}&format=json`,
      `cfng_${limit}`
    );
    if (!d?.data) return [];
    return d.data.map(x => ({
      date: new Date(x.timestamp * 1000).toISOString().slice(0, 10),
      value: parseInt(x.value),
      label: x.value_classification
    })).reverse();
  },

  // ── CNN Fear & Greed (equity market, unofficial public endpoint) ──
  async fetchCNNFNG() {
    const d = await this._fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      'cnn_fng'
    );
    if (!d?.fear_and_greed) return null;
    const fg = d.fear_and_greed;
    return {
      value: Math.round(fg.score),
      label: fg.rating,
      prevClose: Math.round(d.fear_and_greed_historical?.data?.[1]?.x ?? fg.score),
      oneWeekAgo: Math.round(d.fear_and_greed_historical?.data?.[7]?.x ?? fg.score),
      oneMonthAgo: Math.round(d.fear_and_greed_historical?.data?.[30]?.x ?? fg.score),
      history: (d.fear_and_greed_historical?.data || []).slice(0, 90).map(p => ({
        date: new Date(p.x * 1000).toISOString().slice(0, 10),
        value: Math.round(p.y)
      })).reverse()
    };
  },

  // ── FRED series helper ──
  async fetchFRED(seriesId, limit = 90) {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const apiKey = keys.fred || 'ca0c99f98f1221bf443bc1a3c6994441';
    const d = await this._fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`,
      `fred_pulse_${seriesId}_${limit}`
    );
    if (!d?.observations) return [];
    return d.observations
      .filter(o => o.value !== '.' && o.value !== 'NA')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }))
      .reverse();
  },

  // ── VIX ──
  async fetchVIX() {
    return this.fetchFRED('VIXCLS', 90);
  },

  // ── AAII Investor Sentiment ──
  async fetchAAII() {
    const [bull, bear, neutral] = await Promise.all([
      this.fetchFRED('AAIIBULL', 20),
      this.fetchFRED('AAIIBEAR', 20),
      this.fetchFRED('AAIINEUTRAL', 20)
    ]);
    return {
      bull: bull?.[bull.length - 1]?.value ?? null,
      bear: bear?.[bear.length - 1]?.value ?? null,
      neutral: neutral?.[neutral.length - 1]?.value ?? null,
      date: bull?.[bull.length - 1]?.date ?? null
    };
  },

  // ── Yield Curve (snapshot) ──
  async fetchYieldCurve() {
    const series = ['DGS3MO', 'DGS1', 'DGS2', 'DGS5', 'DGS10', 'DGS30'];
    const labels = ['3M', '1Y', '2Y', '5Y', '10Y', '30Y'];
    const results = await Promise.all(series.map(s => this.fetchFRED(s, 5)));
    return labels.map((label, i) => ({
      label,
      value: results[i]?.[results[i].length - 1]?.value ?? null
    })).filter(p => p.value !== null);
  },

  // ── 2Y-10Y Spread history (recession signal) ──
  async fetchSpreadHistory(days = 365) {
    const [y2, y10] = await Promise.all([
      this.fetchFRED('DGS2', days),
      this.fetchFRED('DGS10', days)
    ]);
    const map2 = new Map(y2.map(p => [p.date, p.value]));
    return y10
      .filter(p => map2.has(p.date))
      .map(p => ({ date: p.date, value: +(p.value - map2.get(p.date)).toFixed(3) }));
  },

  // ── HY Credit Spread (BAMLH0A0HYM2 = ICE BofA HY OAS) ──
  async fetchHYSpread() {
    return this.fetchFRED('BAMLH0A0HYM2', 90);
  },

  // ── 10Y Breakeven Inflation ──
  async fetchBreakeven() {
    return this.fetchFRED('T10YIE', 90);
  },

  // ── BTC Perpetual Funding Rate (Binance) ──
  async fetchBTCFunding(limit = 90) {
    const d = await this._fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=${limit}`,
      `btc_funding_${limit}`
    );
    if (!Array.isArray(d)) return [];
    // aggregate to daily average (3 fundings per day at 0/8/16 UTC)
    const daily = {};
    for (const x of d) {
      const date = new Date(x.fundingTime).toISOString().slice(0, 10);
      if (!daily[date]) daily[date] = { sum: 0, count: 0 };
      daily[date].sum += parseFloat(x.fundingRate) * 100;
      daily[date].count++;
    }
    return Object.entries(daily)
      .map(([date, v]) => ({ date, value: +(v.sum / v.count).toFixed(5) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  // ── Messari News (free, no auth, CORS-friendly) ──
  async fetchMessariNews(limit = 20) {
    const d = await this._fetch(
      `https://data.messari.io/api/v1/news?limit=${limit}`,
      `messari_news_${limit}`
    );
    if (!d?.data) return [];
    return d.data.map(p => ({
      title: p.title,
      url: p.url,
      source: p.references?.[0]?.name ?? 'Messari',
      publishedAt: p.published_at,
      author: p.author?.name
    }));
  },

  // ── Augmento Social Sentiment ──
  // Returns time-series Reddit/Twitter/BitcoinTalk sentiment for a coin
  async fetchAugmento(coin = 'bitcoin') {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const apiKey = keys.augmento || 'pk_F8cBrSt02N7VMeae6jRyEUEIpnu2BpedK1_kqnO8';
    const d = await this._fetch(
      `https://augmento.ai/api/v0/sentiments?coin=${coin}&interval=1_day&num_points=30`,
      `augmento_${coin}`,
      { headers: { 'Authorization': apiKey } }
    );
    if (!d?.data) return null;
    const latest = d.data[d.data.length - 1];
    return {
      coin,
      positive: latest?.positive ?? null,
      negative: latest?.negative ?? null,
      neutral: latest?.neutral ?? null,
      sentiment: latest ? ((latest.positive - latest.negative) / (latest.positive + latest.negative + latest.neutral || 1)) : null,
      history: d.data.map(p => ({
        date: p.timestamp?.slice(0, 10),
        positive: p.positive,
        negative: p.negative,
        sentiment: (p.positive - p.negative) / (p.positive + p.negative + p.neutral || 1)
      }))
    };
  },

  // ── LunarCrush Social Metrics ──
  async fetchLunarCrush(coin = 'BTC') {
    const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
    const apiKey = keys.lunarcrush || 'bixxq24zj9pyjy4y5jru2e5wiqmo2wl1x48p9tan9';
    const d = await this._fetch(
      `https://lunarcrush.com/api4/public/coins/${coin}/v1`,
      `lunar_${coin}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    if (!d?.data) return null;
    const c = d.data;
    return {
      galaxyScore: c.galaxy_score,
      altRank: c.alt_rank,
      socialVolume: c.social_volume,
      socialScore: c.social_score,
      socialDominance: c.social_dominance,
      sentiment: c.sentiment, // 1-5 scale
      contributors: c.social_contributors,
      price: c.price,
      priceChange24h: c.percent_change_24h
    };
  },

  // ── News Headlines — tries Messari, falls back to existing app RSS ──
  async fetchNewsHeadlines(limit = 20) {
    // Try Messari first
    const messari = await this.fetchMessariNews(limit);
    if (messari.length) return messari.map(p => p.title);
    // Fall back to existing NewsFeed if available
    if (typeof NewsFeed !== 'undefined' && NewsFeed._cache) {
      const cached = Object.values(NewsFeed._cache).flat().slice(0, limit);
      return cached.map(item => item.title || item.headline || '').filter(Boolean);
    }
    return [];
  },

  // ── Put/Call Ratio (CBOE via FRED) ──
  async fetchPutCallRatio() {
    return this.fetchFRED('PCALL', 90);
  },

  // ── AFINN-based sentiment scorer (finance/crypto extended) ──
  AFINN: {
    'crash': -4, 'crashes': -4, 'collapse': -4, 'collapses': -4,
    'default': -3, 'ban': -3, 'banned': -3, 'hack': -4, 'hacked': -4,
    'theft': -4, 'stolen': -4, 'exploit': -3, 'exploited': -3,
    'liquidation': -3, 'liquidations': -3, 'delisting': -3,
    'fraud': -4, 'scam': -4, 'ponzi': -4, 'insolvent': -4,
    'bearish': -2, 'bear': -1, 'downtrend': -2, 'selloff': -3,
    'sell-off': -3, 'dump': -3, 'dumped': -3, 'dumping': -3,
    'correction': -2, 'plunge': -3, 'tumble': -2, 'slump': -2,
    'drop': -1, 'drops': -1, 'dropped': -1, 'decline': -1,
    'declines': -1, 'fall': -1, 'falls': -1, 'loss': -2, 'losses': -2,
    'fear': -2, 'panic': -3, 'recession': -3, 'crisis': -3,
    'inflation': -1, 'stagflation': -3, 'war': -3, 'conflict': -2,
    'sanctions': -2, 'tariff': -2, 'tariffs': -2, 'escalation': -3,
    'attack': -3, 'struck': -2, 'tension': -2, 'risk': -1, 'risks': -1,
    'concern': -1, 'warning': -2, 'warns': -2, 'investigation': -2,
    'lawsuit': -2, 'probe': -2, 'seized': -3, 'seized': -3,
    'bullish': 3, 'bull': 1, 'rally': 2, 'rallies': 2, 'rallying': 2,
    'surge': 3, 'surges': 3, 'surging': 3, 'soar': 3, 'soars': 3,
    'spike': 2, 'spikes': 2, 'breakout': 2, 'ath': 3, 'record': 2,
    'approval': 3, 'approved': 3, 'etf': 2, 'adoption': 3,
    'institutional': 2, 'halving': 3, 'upgrade': 2, 'launch': 1,
    'partnership': 2, 'integration': 1, 'bullrun': 4, 'gains': 2,
    'gain': 2, 'profit': 2, 'profits': 2, 'growth': 2, 'recovery': 2,
    'rebound': 2, 'rise': 1, 'rises': 1, 'rising': 1, 'increase': 1,
    'increases': 1, 'positive': 2, 'optimistic': 2, 'confidence': 2,
    'strong': 2, 'strength': 2, 'milestone': 2, 'breakthrough': 3,
    'ceasefire': 2, 'deal': 2, 'agreement': 2, 'peace': 3,
    'deregulation': 2, 'clarity': 2, 'regulation': 0, 'framework': 1
  },

  scoreSentiment(text) {
    if (!text) return { score: 0, comparative: 0, matches: 0 };
    const words = text.toLowerCase().replace(/[^a-z\s\-]/g, '').split(/\s+/);
    let score = 0, count = 0;
    for (const w of words) {
      if (this.AFINN[w] !== undefined) {
        score += this.AFINN[w];
        count++;
      }
    }
    return { score, comparative: count > 0 ? +(score / words.length).toFixed(4) : 0, matches: count };
  },

  scoreHeadlines(headlines) {
    const scored = headlines.map(h => ({ text: h, ...this.scoreSentiment(h) }));
    const total = scored.reduce((s, h) => s + h.comparative, 0);
    const aggregate = scored.length > 0 ? total / scored.length : 0;
    return {
      aggregate: +aggregate.toFixed(4),
      normalized: Math.max(-1, Math.min(1, aggregate * 10)),
      scored,
      positive: scored.filter(h => h.score > 0).length,
      negative: scored.filter(h => h.score < 0).length,
      neutral: scored.filter(h => h.score === 0).length
    };
  },

  // ── Composite Pulse Score (0-100) ──
  // Combines Fear/Greed + VIX + Funding + HY Spread + Sentiment
  computePulseScore({ fng, vix, funding, hySpread, sentimentNorm }) {
    let score = 50;
    // FNG: 0-100 → direct weight
    if (fng != null) score += (fng - 50) * 0.3;
    // VIX: 12 = calm (bullish), 30+ = fear, 40+ = panic
    if (vix != null) score -= Math.max(0, (vix - 18)) * 1.2;
    // Funding: positive = bullish greed, negative = fear
    if (funding != null) score += funding * 15;
    // HY Spread: >500bp = stress, <300bp = calm
    if (hySpread != null) score -= Math.max(0, (hySpread - 350)) * 0.04;
    // News sentiment: -1 to +1
    if (sentimentNorm != null) score += sentimentNorm * 10;
    return Math.max(0, Math.min(100, Math.round(score)));
  },

  fngLabel(value) {
    if (value <= 24) return 'Extreme Fear';
    if (value <= 44) return 'Fear';
    if (value <= 54) return 'Neutral';
    if (value <= 74) return 'Greed';
    return 'Extreme Greed';
  },

  fngColor(value) {
    if (value <= 24) return '#ef4444';
    if (value <= 44) return '#f97316';
    if (value <= 54) return '#eab308';
    if (value <= 74) return '#84cc16';
    return '#10b981';
  }
};
