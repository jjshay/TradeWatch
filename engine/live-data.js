// ========== LIVE DATA API ==========
const LiveData = {
    cache: {},
    cacheExpiry: 5 * 60 * 1000, // 5 min default; live tickers override

    async _fetch(url, cacheKey, ttlMs) {
        const ttl = ttlMs != null ? ttlMs : this.cacheExpiry;
        if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].time < ttl) {
            return this.cache[cacheKey].data;
        }
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this.cache[cacheKey] = { data, time: Date.now() };
            return data;
        } catch (e) {
            console.warn('API fetch failed:', cacheKey, e.message);
            return null;
        }
    },

    // CoinGecko: current prices — 45s TTL so header ticker stays fresh
    async getCryptoPrices() {
        const ids = 'bitcoin,matic-network,render-token,chainlink,kaspa';
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
        return this._fetch(url, 'crypto_prices', 45_000);
    },

    // CoinGecko: historical prices (up to 365 days)
    async getCryptoHistory(coinId, days = 365) {
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
        return this._fetch(url, `crypto_hist_${coinId}_${days}`);
    },

    // CoinGecko: global market data
    async getCryptoGlobal() {
        const url = 'https://api.coingecko.com/api/v3/global';
        return this._fetch(url, 'crypto_global');
    },

    // Alternative.me: Fear & Greed Index — refreshes daily, 5m cache is fine
    async getFearGreed() {
        const url = 'https://api.alternative.me/fng/?limit=30&format=json';
        return this._fetch(url, 'fear_greed');
    },

    // Blockchain.com: BTC on-chain (hash rate, difficulty)
    async getBTCOnChain() {
        const metrics = {};
        try {
            const hashRate = await this._fetch('https://api.blockchain.info/charts/hash-rate?timespan=1year&format=json&cors=true', 'btc_hashrate');
            if (hashRate && hashRate.values) metrics.hashRate = hashRate.values;
        } catch (e) { /* skip */ }
        return metrics;
    },

    // Coinbase ticker (backup price source) — 30s TTL for live tickers
    async getBTCPrice() {
        const url = 'https://api.coinbase.com/v2/prices/BTC-USD/spot';
        const data = await this._fetch(url, 'btc_spot', 30_000);
        return data?.data?.amount ? parseFloat(data.data.amount) : null;
    },

    // CoinGecko: OHLCV candles (for TA)
    async getCryptoOHLCV(coinId, days = 90) {
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
        return this._fetch(url, `crypto_ohlcv_${coinId}_${days}`);
    },

    // CoinGecko: trending coins
    async getTrending() {
        return this._fetch('https://api.coingecko.com/api/v3/search/trending', 'crypto_trending');
    }
};

// ========== CRYPTO SCENARIOS ==========
const CRYPTO_SCENARIOS = [
    { name: 'Conservative Bull', btcTarget: 150000, timeline: 18, altIntensity: 30, description: 'Gradual institutional adoption. BTC leads, alts follow modestly.' },
    { name: 'Full Bull Run', btcTarget: 250000, timeline: 12, altIntensity: 60, description: 'ETF inflows accelerate. Alt season kicks in mid-cycle.' },
    { name: 'Supercycle', btcTarget: 500000, timeline: 24, altIntensity: 80, description: 'Global liquidity surge + institutional FOMO. Historic cycle.' },
    { name: 'Alt Season Blowoff', btcTarget: 180000, timeline: 6, altIntensity: 95, description: 'BTC consolidates while alts explode 5-20x. Retail mania.' },
    { name: 'ETH Flippening', btcTarget: 200000, timeline: 18, altIntensity: 70, description: 'ETH gains ground. L2s and DeFi surge. ETH/BTC ratio climbs.' },
    { name: 'AI Crypto Boom', btcTarget: 175000, timeline: 12, altIntensity: 85, description: 'AI narrative dominates. RNDR, FET, TAO, AKT lead the market.' },
    { name: 'DeFi Renaissance', btcTarget: 160000, timeline: 12, altIntensity: 75, description: 'Real yield narratives. AAVE, MKR, UNI lead. TVL hits new ATH.' },
    { name: 'Bear Market', btcTarget: 45000, timeline: 12, altIntensity: 10, description: 'Macro tightening. BTC drops 50%+. Alts bleed 80-95%.' },
    { name: 'Black Swan', btcTarget: 20000, timeline: 3, altIntensity: 5, description: 'Exchange collapse / regulatory ban. Cascading liquidations.' },
    { name: 'Regulatory Clarity', btcTarget: 200000, timeline: 12, altIntensity: 65, description: 'Clear US crypto framework. Institutional floodgates open.' }
];

