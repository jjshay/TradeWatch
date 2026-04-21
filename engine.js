/* ============================================================
   CRYPTO RADAR - Data Engine
   Monte Carlo, Black-Scholes, Correlation, Historical Data,
   Live API Integration, Backtesting
   ============================================================ */

// ========== MATH UTILITIES ==========
const MathUtil = {
    // Cumulative normal distribution (Abramowitz & Stegun approximation)
    normCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    },
    // Standard normal PDF
    normPDF(x) {
        return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    },
    // Box-Muller transform for normal random variates
    randn() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    },
    // Percentile of sorted array
    percentile(arr, p) {
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = (p / 100) * (sorted.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    },
    // Mean
    mean(arr) {
        return arr.reduce((s, v) => s + v, 0) / arr.length;
    },
    // Standard deviation
    stdev(arr) {
        const m = MathUtil.mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
    },
    // Log returns from price series
    logReturns(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push(Math.log(prices[i] / prices[i - 1]));
        }
        return returns;
    }
};

// ========== BLACK-SCHOLES OPTIONS PRICING ==========
const BlackScholes = {
    // d1 and d2
    _d1(S, K, T, r, sigma) {
        return (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    },
    _d2(S, K, T, r, sigma) {
        return this._d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
    },

    // Call price
    call(S, K, T, r, sigma) {
        if (T <= 0) return Math.max(0, S - K);
        const d1 = this._d1(S, K, T, r, sigma);
        const d2 = this._d2(S, K, T, r, sigma);
        return S * MathUtil.normCDF(d1) - K * Math.exp(-r * T) * MathUtil.normCDF(d2);
    },

    // Put price
    put(S, K, T, r, sigma) {
        if (T <= 0) return Math.max(0, K - S);
        const d1 = this._d1(S, K, T, r, sigma);
        const d2 = this._d2(S, K, T, r, sigma);
        return K * Math.exp(-r * T) * MathUtil.normCDF(-d2) - S * MathUtil.normCDF(-d1);
    },

    // All Greeks
    greeks(S, K, T, r, sigma, type = 'call') {
        if (T <= 0) {
            const itm = type === 'call' ? S > K : K > S;
            return { delta: itm ? (type === 'call' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
        }
        const d1 = this._d1(S, K, T, r, sigma);
        const d2 = this._d2(S, K, T, r, sigma);
        const sqrtT = Math.sqrt(T);
        const nd1 = MathUtil.normPDF(d1);
        const Nd1 = MathUtil.normCDF(d1);
        const Nd2 = MathUtil.normCDF(d2);

        const gamma = nd1 / (S * sigma * sqrtT);
        const vega = S * nd1 * sqrtT / 100; // per 1% vol change

        if (type === 'call') {
            return {
                delta: Nd1,
                gamma,
                theta: (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * Nd2) / 365,
                vega,
                rho: K * T * Math.exp(-r * T) * Nd2 / 100
            };
        } else {
            return {
                delta: Nd1 - 1,
                gamma,
                theta: (-(S * nd1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * MathUtil.normCDF(-d2)) / 365,
                vega,
                rho: -K * T * Math.exp(-r * T) * MathUtil.normCDF(-d2) / 100
            };
        }
    },

    // Implied volatility (Newton-Raphson)
    impliedVol(marketPrice, S, K, T, r, type = 'call', maxIter = 100) {
        let sigma = 0.3; // initial guess
        for (let i = 0; i < maxIter; i++) {
            const price = type === 'call' ? this.call(S, K, T, r, sigma) : this.put(S, K, T, r, sigma);
            const diff = price - marketPrice;
            if (Math.abs(diff) < 0.001) return sigma;
            const d1 = this._d1(S, K, T, r, sigma);
            const vegaRaw = S * MathUtil.normPDF(d1) * Math.sqrt(T);
            if (vegaRaw < 1e-10) break;
            sigma -= diff / vegaRaw;
            if (sigma <= 0.001) sigma = 0.001;
        }
        return sigma;
    }
};

// ========== MONTE CARLO ENGINE ==========
const MonteCarlo = {
    /**
     * Run Monte Carlo simulation using Geometric Brownian Motion
     * @param {Object} params
     * @param {number} params.S0 - Starting price
     * @param {number} params.mu - Annual drift (expected return)
     * @param {number} params.sigma - Annual volatility
     * @param {number} params.T - Time horizon in years
     * @param {number} params.steps - Number of time steps
     * @param {number} params.paths - Number of simulation paths
     * @param {number} [params.jumpProb] - Probability of jump per step (for jump diffusion)
     * @param {number} [params.jumpMean] - Mean jump size (log)
     * @param {number} [params.jumpVol] - Jump size volatility
     * @returns {Object} Results
     */
    run(params) {
        const { S0, mu, sigma, T, steps, paths = 1000, jumpProb = 0, jumpMean = 0, jumpVol = 0 } = params;
        const dt = T / steps;
        const sqrtDt = Math.sqrt(dt);

        const allPaths = [];
        const finalPrices = [];

        for (let p = 0; p < paths; p++) {
            const path = [S0];
            let S = S0;
            for (let t = 0; t < steps; t++) {
                const z = MathUtil.randn();
                let dS = (mu - 0.5 * sigma * sigma) * dt + sigma * sqrtDt * z;

                // Jump diffusion (Merton model)
                if (jumpProb > 0 && Math.random() < jumpProb * dt) {
                    dS += jumpMean + jumpVol * MathUtil.randn();
                }

                S = S * Math.exp(dS);
                path.push(S);
            }
            allPaths.push(path);
            finalPrices.push(S);
        }

        // Calculate statistics at each time step
        const stepStats = [];
        for (let t = 0; t <= steps; t++) {
            const prices = allPaths.map(p => p[t]);
            stepStats.push({
                time: (t / steps) * T,
                mean: MathUtil.mean(prices),
                median: MathUtil.percentile(prices, 50),
                p5: MathUtil.percentile(prices, 5),
                p25: MathUtil.percentile(prices, 25),
                p75: MathUtil.percentile(prices, 75),
                p95: MathUtil.percentile(prices, 95),
                min: Math.min(...prices),
                max: Math.max(...prices)
            });
        }

        // Final distribution stats
        const returns = finalPrices.map(p => (p - S0) / S0);
        return {
            paths: allPaths,
            stepStats,
            finalPrices,
            stats: {
                mean: MathUtil.mean(finalPrices),
                median: MathUtil.percentile(finalPrices, 50),
                stdev: MathUtil.stdev(finalPrices),
                p5: MathUtil.percentile(finalPrices, 5),
                p10: MathUtil.percentile(finalPrices, 10),
                p25: MathUtil.percentile(finalPrices, 25),
                p75: MathUtil.percentile(finalPrices, 75),
                p90: MathUtil.percentile(finalPrices, 90),
                p95: MathUtil.percentile(finalPrices, 95),
                probProfit: finalPrices.filter(p => p > S0).length / paths,
                probDouble: finalPrices.filter(p => p > S0 * 2).length / paths,
                VaR95: S0 - MathUtil.percentile(finalPrices, 5),
                CVaR95: S0 - MathUtil.mean(finalPrices.filter(p => p <= MathUtil.percentile(finalPrices, 5))),
                maxReturn: Math.max(...returns),
                minReturn: Math.min(...returns),
                meanReturn: MathUtil.mean(returns),
                sharpe: MathUtil.mean(returns) / MathUtil.stdev(returns)
            }
        };
    },

    // Portfolio Monte Carlo (correlated assets)
    runPortfolio(assets, correlation, T, steps, paths = 1000) {
        const n = assets.length;
        const dt = T / steps;
        const sqrtDt = Math.sqrt(dt);

        // Cholesky decomposition for correlated random variables
        const L = this._cholesky(correlation);

        const portfolioPaths = [];
        const finalValues = [];

        for (let p = 0; p < paths; p++) {
            const assetPaths = assets.map(a => [a.value]);
            const portfolioPath = [assets.reduce((s, a) => s + a.value, 0)];

            for (let t = 0; t < steps; t++) {
                // Generate correlated random numbers
                const z = Array.from({ length: n }, () => MathUtil.randn());
                const correlated = L.map((row, i) => row.reduce((s, v, j) => s + v * z[j], 0));

                let portfolioValue = 0;
                for (let i = 0; i < n; i++) {
                    const a = assets[i];
                    const dS = (a.mu - 0.5 * a.sigma * a.sigma) * dt + a.sigma * sqrtDt * correlated[i];
                    const newPrice = assetPaths[i][assetPaths[i].length - 1] * Math.exp(dS);
                    assetPaths[i].push(newPrice);
                    portfolioValue += newPrice;
                }
                portfolioPath.push(portfolioValue);
            }
            portfolioPaths.push(portfolioPath);
            finalValues.push(portfolioPath[portfolioPath.length - 1]);
        }

        const initialValue = assets.reduce((s, a) => s + a.value, 0);
        const stepStats = [];
        for (let t = 0; t <= steps; t++) {
            const values = portfolioPaths.map(p => p[t]);
            stepStats.push({
                time: (t / steps) * T,
                mean: MathUtil.mean(values),
                median: MathUtil.percentile(values, 50),
                p5: MathUtil.percentile(values, 5),
                p25: MathUtil.percentile(values, 25),
                p75: MathUtil.percentile(values, 75),
                p95: MathUtil.percentile(values, 95)
            });
        }

        return {
            paths: portfolioPaths,
            stepStats,
            finalValues,
            stats: {
                mean: MathUtil.mean(finalValues),
                median: MathUtil.percentile(finalValues, 50),
                p5: MathUtil.percentile(finalValues, 5),
                p95: MathUtil.percentile(finalValues, 95),
                probProfit: finalValues.filter(v => v > initialValue).length / paths,
                VaR95: initialValue - MathUtil.percentile(finalValues, 5),
                meanReturn: MathUtil.mean(finalValues.map(v => (v - initialValue) / initialValue)),
                sharpe: (() => {
                    const r = finalValues.map(v => (v - initialValue) / initialValue);
                    return MathUtil.mean(r) / MathUtil.stdev(r);
                })()
            }
        };
    },

    // Cholesky decomposition
    _cholesky(matrix) {
        const n = matrix.length;
        const L = Array.from({ length: n }, () => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
                if (i === j) {
                    L[i][j] = Math.sqrt(Math.max(0, matrix[i][i] - sum));
                } else {
                    L[i][j] = L[j][j] === 0 ? 0 : (matrix[i][j] - sum) / L[j][j];
                }
            }
        }
        return L;
    }
};

// ========== CORRELATION ANALYSIS ==========
const Correlation = {
    // Pearson correlation between two series
    pearson(x, y) {
        const n = Math.min(x.length, y.length);
        if (n < 3) return 0;
        const mx = MathUtil.mean(x.slice(0, n));
        const my = MathUtil.mean(y.slice(0, n));
        let num = 0, dx2 = 0, dy2 = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mx;
            const dy = y[i] - my;
            num += dx * dy;
            dx2 += dx * dx;
            dy2 += dy * dy;
        }
        const denom = Math.sqrt(dx2 * dy2);
        return denom === 0 ? 0 : num / denom;
    },

    // Correlation matrix from object of series { name: [values] }
    matrix(seriesMap) {
        const names = Object.keys(seriesMap);
        const result = {};
        for (const a of names) {
            result[a] = {};
            for (const b of names) {
                result[a][b] = a === b ? 1.0 : this.pearson(
                    MathUtil.logReturns(seriesMap[a]),
                    MathUtil.logReturns(seriesMap[b])
                );
            }
        }
        return { names, matrix: result };
    },

    // Rolling correlation
    rolling(x, y, window = 30) {
        const results = [];
        for (let i = window; i <= Math.min(x.length, y.length); i++) {
            results.push({
                index: i,
                correlation: this.pearson(
                    MathUtil.logReturns(x.slice(i - window, i)),
                    MathUtil.logReturns(y.slice(i - window, i))
                )
            });
        }
        return results;
    }
};

// ========== LIVE DATA API ==========
const LiveData = {
    cache: {},
    cacheExpiry: 5 * 60 * 1000, // 5 min cache

    async _fetch(url, cacheKey) {
        if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].time < this.cacheExpiry) {
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

    // CoinGecko: current prices
    async getCryptoPrices() {
        const ids = 'bitcoin,matic-network,render-token,chainlink,kaspa';
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
        return this._fetch(url, 'crypto_prices');
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

    // Alternative.me: Fear & Greed Index
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

    // Coinbase ticker (backup price source)
    async getBTCPrice() {
        const url = 'https://api.coinbase.com/v2/prices/BTC-USD/spot';
        const data = await this._fetch(url, 'btc_spot');
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

// ========== HISTORICAL EVENTS DATABASE ==========
const HISTORICAL_EVENTS = {
    oil: [
        {
            id: 'kuwait_1990',
            name: 'Kuwait Invasion',
            date: '1990-08-02',
            category: 'Geopolitical',
            priceBefore: 21.54,
            pricePeak: 41.15,
            peakDays: 60,
            priceAfter90d: 33.50,
            priceRecovery: 21.00,
            recoveryDays: 210,
            pctToPeak: 91.0,
            supplyLost: 4.3,
            supplyPctGlobal: 6.4,
            duration: 210,
            description: 'Iraq invaded Kuwait, removing ~4.3M bbl/d from market. Oil doubled in 60 days. Coalition forces liberated Kuwait Feb 1991.',
            dailyPrices: [21.54,22.61,24.54,26.23,27.31,27.97,28.05,28.76,29.12,30.17,31.33,32.64,33.78,34.42,35.15,33.91,34.71,35.42,36.11,35.78,34.50,35.89,37.12,38.45,39.18,38.64,37.92,38.50,39.76,40.10,40.95,41.15,40.78,39.45,38.12,37.86,36.98,36.14,35.50,34.89,34.12,33.87,33.50,33.12,32.75,32.40,31.90,31.50,31.18,30.85,30.50,30.12,29.75,29.40,29.10,28.85,28.50,28.10,27.65,27.30]
        },
        {
            id: 'abqaiq_2019',
            name: 'Abqaiq/Khurais Attack',
            date: '2019-09-14',
            category: 'Supply Shock',
            priceBefore: 54.85,
            pricePeak: 62.90,
            peakDays: 1,
            priceAfter90d: 55.17,
            priceRecovery: 54.85,
            recoveryDays: 14,
            pctToPeak: 14.7,
            supplyLost: 5.7,
            supplyPctGlobal: 5.7,
            duration: 14,
            description: 'Drone/missile attack on Saudi Aramco Abqaiq. Removed 5.7M bbl/d (largest single disruption ever). Prices spiked 15% but recovered in 2 weeks as Saudi rapidly repaired.',
            dailyPrices: [54.85,62.90,62.40,59.34,58.64,58.11,57.50,56.87,56.30,55.90,55.60,55.40,55.20,55.17]
        },
        {
            id: 'covid_2020',
            name: 'COVID-19 Crash',
            date: '2020-03-06',
            category: 'Demand Shock',
            priceBefore: 46.78,
            pricePeak: -37.63,
            peakDays: 45,
            priceAfter90d: 40.46,
            priceRecovery: 46.78,
            recoveryDays: 240,
            pctToPeak: -180.4,
            supplyLost: -9.0,
            supplyPctGlobal: -9.0,
            duration: 240,
            description: 'OPEC+ price war + COVID lockdowns crashed demand by ~29M bbl/d. WTI went negative on Apr 20 (storage full). Historic demand destruction event.',
            dailyPrices: [46.78,45.90,41.28,34.36,31.73,30.10,28.70,27.34,24.01,22.43,20.48,19.84,20.31,23.16,24.74,23.63,20.09,19.46,18.27,20.48,25.09,25.78,26.42,24.56,23.99,22.76,21.04,20.29,20.11,19.87,18.84,18.27,16.50,14.10,11.57,-37.63,10.01,15.06,16.50,18.84,19.78,20.39,24.74,26.42,29.43,33.22,34.35,36.81,38.94,40.46,41.65,39.27,40.60,41.12,39.77,40.46]
        },
        {
            id: 'russia_2022',
            name: 'Russia-Ukraine Invasion',
            date: '2022-02-24',
            category: 'Geopolitical',
            priceBefore: 92.10,
            pricePeak: 130.50,
            peakDays: 12,
            priceAfter90d: 109.77,
            priceRecovery: 92.10,
            recoveryDays: 120,
            pctToPeak: 41.7,
            supplyLost: 3.0,
            supplyPctGlobal: 3.0,
            duration: 120,
            description: 'Russia invaded Ukraine. Sanctions on Russian oil threatened ~3M bbl/d. WTI spiked 42% in 12 days. Prices stayed elevated for months due to supply uncertainty.',
            dailyPrices: [92.10,93.54,95.72,99.10,103.41,107.67,110.60,115.68,119.40,123.70,126.51,130.50,128.26,124.30,119.50,116.80,112.34,109.33,108.26,106.95,104.27,103.41,105.96,108.70,109.50,107.25,106.40,104.76,103.28,101.56,99.76,98.52,99.10,100.40,101.20,102.78,104.89,106.10,108.36,109.77,108.43,107.50,105.90,104.12,102.60,101.33,100.10,99.25,98.50,97.40,96.80,95.70,94.50,93.80,93.10,92.50,92.10]
        },
        {
            id: 'libya_2011',
            name: 'Libya Civil War',
            date: '2011-02-15',
            category: 'Geopolitical',
            priceBefore: 84.32,
            pricePeak: 113.93,
            peakDays: 75,
            priceAfter90d: 100.30,
            priceRecovery: 84.32,
            recoveryDays: 365,
            pctToPeak: 35.1,
            supplyLost: 1.6,
            supplyPctGlobal: 1.8,
            duration: 365,
            description: 'Libyan civil war removed ~1.6M bbl/d of light sweet crude. Arab Spring contagion fears amplified the move. Oil stayed above $85 for most of 2011.',
            dailyPrices: [84.32,86.20,89.71,93.57,97.88,98.10,96.97,99.63,102.23,104.42,105.44,104.42,103.98,106.72,108.47,109.77,108.26,105.75,104.60,106.40,108.90,111.30,112.79,113.93,112.50,110.80,109.40,108.70,107.50,106.80,105.50,104.20,103.40,102.70,101.80,101.20,100.80,100.30]
        },
        {
            id: 'oil_crash_2008',
            name: '2008 Oil Spike & Crash',
            date: '2008-01-02',
            category: 'Bubble/Crash',
            priceBefore: 99.62,
            pricePeak: 145.31,
            peakDays: 180,
            priceAfter90d: 67.81,
            priceRecovery: 99.62,
            recoveryDays: 730,
            pctToPeak: 45.9,
            supplyLost: 0,
            supplyPctGlobal: 0,
            duration: 365,
            description: 'Oil spiked to $147 on speculation + China demand, then crashed to $32 during the financial crisis. The entire move (up AND down) took ~12 months.',
            dailyPrices: [99.62,100.10,104.52,109.71,105.48,110.21,117.48,119.93,125.96,132.32,134.56,138.54,139.64,140.21,143.67,145.31,141.37,127.35,115.46,109.71,104.08,96.37,86.59,78.68,73.85,67.81,62.73,60.77,55.36,49.28,44.60,40.81,36.22,33.87,32.40]
        },
        {
            id: 'oil_crash_2014',
            name: '2014-2016 Oil Crash',
            date: '2014-06-20',
            category: 'Supply Glut',
            priceBefore: 107.26,
            pricePeak: 26.21,
            peakDays: 570,
            priceAfter90d: 82.70,
            priceRecovery: 107.26,
            recoveryDays: -1,
            pctToPeak: -75.6,
            supplyLost: -3.0,
            supplyPctGlobal: -3.0,
            duration: 570,
            description: 'US shale revolution flooded the market with ~4M bbl/d of new supply. OPEC refused to cut. Oil fell 76% over 18 months. Never fully recovered pre-crash highs.',
            dailyPrices: [107.26,105.37,103.59,98.17,93.17,90.43,84.44,77.75,73.47,66.15,59.29,53.27,52.69,48.24,44.45,47.60,48.65,53.05,59.63,60.42,57.52,49.20,46.65,44.66,48.56,47.15,45.68,42.53,40.45,38.22,37.04,35.92,33.62,31.90,29.64,28.36,26.55,26.21,28.46,30.32,32.78,35.50,37.40,39.44,41.08,43.73,47.72]
        }
    ],

    crypto: [
        {
            id: 'btc_2017',
            name: '2017 BTC Bull Run',
            date: '2017-01-01',
            category: 'Bull Cycle',
            priceBefore: 998,
            pricePeak: 19783,
            peakDays: 350,
            pctToPeak: 1882,
            description: 'ICO mania drove BTC from $1K to $20K in 12 months. Retail FOMO, no institutional access. Ended with futures launch.',
            monthlyPrices: [998,1043,1215,1348,2300,2700,2875,4360,3674,4395,6457,8041,10975,13860,16500,19783,13412,8342,6914,6390]
        },
        {
            id: 'btc_2021',
            name: '2021 BTC Bull Run',
            date: '2021-01-01',
            category: 'Bull Cycle',
            priceBefore: 29374,
            pricePeak: 68789,
            peakDays: 315,
            pctToPeak: 134,
            description: 'Institutional adoption (MicroStrategy, Tesla), DeFi summer carryover, NFT boom. Double-top pattern with $64K April, $69K November.',
            monthlyPrices: [29374,33114,45137,58800,57684,35804,33572,38150,41512,47100,43790,61300,63500,57000,68789,46211,37708]
        },
        {
            id: 'ftx_2022',
            name: 'FTX Collapse',
            date: '2022-11-06',
            category: 'Black Swan',
            priceBefore: 21300,
            pricePeak: 15476,
            peakDays: 14,
            pctToPeak: -27.3,
            description: 'FTX exchange collapsed, wiping out ~$8B in customer funds. Contagion fears hit all crypto. BTC fell 27% in 2 weeks.',
            dailyPrices: [21300,20800,20200,20100,19400,18540,17167,16530,16800,16500,16200,16100,15700,15476,16100,16400,16550,16700,16800,16600,16800]
        },
        {
            id: 'etf_2024',
            name: 'BTC ETF Approval',
            date: '2024-01-10',
            category: 'Institutional',
            priceBefore: 46000,
            pricePeak: 73750,
            peakDays: 60,
            pctToPeak: 60.3,
            description: 'SEC approved 11 spot Bitcoin ETFs. $12B+ inflows in first 3 months. Institutional access opened. Historic moment for crypto legitimization.',
            dailyPrices: [46000,46500,47800,42500,43100,44200,43800,45300,48900,51800,52100,51200,52900,57000,61200,63100,62500,64800,67500,69200,71700,73750,69100,63400,65800,67900,69500,70100,68500,66800]
        },
        {
            id: 'terra_2022',
            name: 'Terra/LUNA Crash',
            date: '2022-05-07',
            category: 'Black Swan',
            priceBefore: 35500,
            pricePeak: 26700,
            peakDays: 14,
            pctToPeak: -24.8,
            description: 'UST algorithmic stablecoin depegged, LUNA went from $80 to $0. Contagion spread across DeFi. BTC fell 25% as leveraged positions unwound.',
            dailyPrices: [35500,34700,33800,33200,31000,29300,28200,27100,28900,29500,28700,27800,27200,26700,28100,29200,30100,29800,29400,28800,29100]
        },
        {
            id: 'covid_btc_2020',
            name: 'COVID BTC Crash',
            date: '2020-03-08',
            category: 'Macro Crash',
            priceBefore: 9100,
            pricePeak: 3858,
            peakDays: 5,
            pctToPeak: -57.6,
            description: 'Global pandemic panic caused BTC to crash 58% in 5 days. Massive leveraged liquidations. Fastest and deepest BTC crash ever. Full recovery took 6 months.',
            dailyPrices: [9100,8900,7950,7650,5700,5000,4800,3858,4900,5300,5600,5900,6200,6500,6700,6400,6600,6800,7100,7300]
        }
    ],

    // Macro reference data
    macro: {
        fedFundsRate: {
            label: 'Fed Funds Rate (%)',
            data: {'2020-01':1.75,'2020-03':0.25,'2020-12':0.25,'2021-12':0.25,'2022-03':0.50,'2022-06':1.75,'2022-09':3.25,'2022-12':4.50,'2023-03':5.00,'2023-07':5.50,'2023-12':5.50,'2024-09':5.00,'2024-12':4.50}
        },
        dxy: {
            label: 'US Dollar Index',
            data: {'2020-01':97.4,'2020-03':102.8,'2020-06':97.3,'2020-12':89.9,'2021-06':92.2,'2021-12':96.0,'2022-06':104.7,'2022-09':114.1,'2022-12':103.5,'2023-06':103.4,'2023-12':101.4,'2024-06':105.5,'2024-12':108.0}
        }
    }
};

// ========== VOLATILITY DATABASE ==========
// Annualized historical volatilities for key assets
const VOLATILITY_DB = {
    'WTI':  { vol30d: 0.35, vol90d: 0.38, vol1y: 0.40, longTermAvg: 0.35 },
    'BTC':  { vol30d: 0.55, vol90d: 0.60, vol1y: 0.65, longTermAvg: 0.70 },
    'POL':  { vol30d: 0.80, vol90d: 0.85, vol1y: 0.90, longTermAvg: 0.95 },
    'RNDR': { vol30d: 0.90, vol90d: 0.95, vol1y: 1.00, longTermAvg: 1.10 },
    'LINK': { vol30d: 0.70, vol90d: 0.75, vol1y: 0.80, longTermAvg: 0.85 },
    'KAS':  { vol30d: 1.00, vol90d: 1.10, vol1y: 1.20, longTermAvg: 1.30 },
    'UCO':  { vol30d: 0.65, vol90d: 0.70, vol1y: 0.75, longTermAvg: 0.70 },
    'GUSH': { vol30d: 0.70, vol90d: 0.75, vol1y: 0.80, longTermAvg: 0.75 },
    'XLE':  { vol30d: 0.25, vol90d: 0.28, vol1y: 0.30, longTermAvg: 0.28 },
    'OXY':  { vol30d: 0.40, vol90d: 0.45, vol1y: 0.50, longTermAvg: 0.48 },
    'XOM':  { vol30d: 0.22, vol90d: 0.25, vol1y: 0.28, longTermAvg: 0.25 },
    'SPY':  { vol30d: 0.15, vol90d: 0.17, vol1y: 0.18, longTermAvg: 0.16 },
    'GLD':  { vol30d: 0.14, vol90d: 0.15, vol1y: 0.16, longTermAvg: 0.15 }
};

// ========== CORRELATION REFERENCE DATA ==========
// Approximate historical correlations (long-term averages)
const CORRELATION_REF = {
    names: ['WTI', 'BTC', 'SPY', 'DXY', 'GLD', 'XLE', 'POL'],
    matrix: {
        WTI: { WTI: 1.00, BTC: 0.25, SPY: 0.35, DXY: -0.45, GLD: 0.20, XLE: 0.85, POL: 0.15 },
        BTC: { WTI: 0.25, BTC: 1.00, SPY: 0.45, DXY: -0.35, GLD: 0.10, XLE: 0.20, POL: 0.75 },
        SPY: { WTI: 0.35, BTC: 0.45, SPY: 1.00, DXY: -0.20, GLD: -0.05, XLE: 0.65, POL: 0.40 },
        DXY: { WTI: -0.45, BTC: -0.35, DXY: 1.00, SPY: -0.20, GLD: -0.40, XLE: -0.30, POL: -0.30 },
        GLD: { WTI: 0.20, BTC: 0.10, SPY: -0.05, DXY: -0.40, GLD: 1.00, XLE: 0.15, POL: 0.05 },
        XLE: { WTI: 0.85, BTC: 0.20, SPY: 0.65, DXY: -0.30, GLD: 0.15, XLE: 1.00, POL: 0.15 },
        POL: { WTI: 0.15, BTC: 0.75, SPY: 0.40, DXY: -0.30, GLD: 0.05, XLE: 0.15, POL: 1.00 }
    }
};

// ========== BACKTESTING ENGINE ==========
const Backtester = {
    /**
     * Run our Hormuz model against a historical oil event
     */
    testHormuzModel(event, modelParams) {
        const C = modelParams.constants;
        const actualPrices = event.dailyPrices;
        const modelPrices = [];
        const basePrice = event.priceBefore;

        let cumulativeLost = 0;
        for (let d = 0; d < actualPrices.length; d++) {
            const grossDisruption = (event.supplyLost > 0 ? event.supplyLost : C.hormuzFlow * 0.5);
            const altOffset = Math.min(C.altRouteCapacity * 0.5, grossDisruption);
            const sprOffset = Math.min(C.sprReleaseRate, grossDisruption - altOffset);
            const netDeficit = Math.max(0, grossDisruption - altOffset - sprOffset);
            cumulativeLost += netDeficit;
            const deficitPct = (netDeficit / C.globalDemand) * 100;
            let fear = d < 3 ? C.fearPremiumPeak : Math.max(1, C.fearPremiumPeak - C.fearDecayRate * (d - 3));
            let demandDest = d > 14 ? Math.min(C.demandDestructionCap, C.demandDestructionRate * (d - 14)) : 0;
            const impact = deficitPct * C.priceSensitivity * fear * (1 - demandDest);
            modelPrices.push(basePrice * (1 + impact / 100));
        }

        // Compare
        const errors = actualPrices.map((a, i) => {
            const m = modelPrices[i] || modelPrices[modelPrices.length - 1];
            return ((m - a) / a) * 100;
        });

        return {
            eventName: event.name,
            actualPrices,
            modelPrices: modelPrices.slice(0, actualPrices.length),
            meanError: MathUtil.mean(errors.map(Math.abs)),
            maxError: Math.max(...errors.map(Math.abs)),
            directionAccuracy: errors.filter((e, i) => {
                if (i === 0) return true;
                const actualDir = actualPrices[i] > actualPrices[i - 1];
                const modelDir = modelPrices[i] > modelPrices[i - 1];
                return actualDir === modelDir;
            }).length / errors.length * 100,
            peakActual: Math.max(...actualPrices),
            peakModel: Math.max(...modelPrices.slice(0, actualPrices.length)),
            peakError: ((Math.max(...modelPrices.slice(0, actualPrices.length)) - Math.max(...actualPrices)) / Math.max(...actualPrices)) * 100
        };
    }
};

// ========== NEWS FEED AGGREGATOR ==========
const NewsFeed = {
    feeds: [
        // Crypto-dedicated
        { name: 'CoinDesk',         url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml', color: '#0052ff' },
        { name: 'CoinTelegraph',    url: 'https://cointelegraph.com/rss',             color: '#f7931a' },
        { name: 'CryptoSlate',      url: 'https://cryptoslate.com/feed/',             color: '#3861fb' },
        { name: 'Decrypt',          url: 'https://decrypt.co/feed',                   color: '#2aeaff' },
        { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/',    color: '#f7931a' },
        { name: 'The Block',        url: 'https://www.theblock.co/rss.xml',           color: '#1652f0' },
        { name: 'CryptoPanic',      url: 'https://cryptopanic.com/feed/',             color: '#49eacb' },
        // Macro / markets
        { name: 'Reuters Markets',  url: 'https://feeds.reuters.com/reuters/businessNews', color: '#ff6600' },
        { name: 'Yahoo Finance',    url: 'https://finance.yahoo.com/news/rssindex',   color: '#720e9e' },
        { name: 'ZeroHedge',        url: 'https://feeds.feedburner.com/zerohedge/feed', color: '#c9a227' },
        { name: 'MarketWatch',      url: 'https://www.marketwatch.com/rss/topstories', color: '#00a038' },
        // Reddit communities (via native RSS)
        { name: 'r/Bitcoin',        url: 'https://www.reddit.com/r/Bitcoin/.rss',     color: '#ff4500' },
        { name: 'r/wallstreetbets', url: 'https://www.reddit.com/r/wallstreetbets/.rss', color: '#ff4500' },
        { name: 'r/CryptoCurrency', url: 'https://www.reddit.com/r/CryptoCurrency/.rss', color: '#ff4500' },
        { name: 'r/stocks',         url: 'https://www.reddit.com/r/stocks/.rss',      color: '#ff4500' }
    ],
    cache: { articles: [], time: 0 },
    cacheExpiry: 10 * 60 * 1000, // 10 min cache

    async fetchAll() {
        if (this.cache.articles.length && Date.now() - this.cache.time < this.cacheExpiry) {
            return this.cache.articles;
        }
        const allArticles = [];
        // RSS feeds + StockTwits trader streams for BTC + SPY + crypto beta tickers.
        const results = await Promise.allSettled([
            ...this.feeds.map(feed => this._fetchFeed(feed)),
            this.fetchStockTwits('BTC.X'),
            this.fetchStockTwits('SPY'),
            this.fetchStockTwits('MSTR'),
            this.fetchStockTwits('NVDA'),
        ]);
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
                allArticles.push(...r.value);
            }
        }
        // Deduplicate by title similarity and sort by date
        const seen = new Set();
        const deduped = allArticles.filter(a => {
            const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        deduped.sort((a, b) => b.date - a.date);
        this.cache = { articles: deduped, time: Date.now() };
        return deduped;
    },

    // StockTwits — free public stream API for trader chatter per symbol.
    // Use 'BTC.X' for Bitcoin, 'SPY' for S&P, 'AAPL' for a stock, etc.
    async fetchStockTwits(symbol = 'BTC.X') {
        try {
            const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`);
            if (!r.ok) return [];
            const j = await r.json();
            if (!j || !j.messages) return [];
            return j.messages.slice(0, 15).map(m => ({
                title:       m.body || '',
                link:        `https://stocktwits.com/${m.user?.username || ''}/message/${m.id}`,
                description: `@${m.user?.username || 'trader'} · ${m.entities?.sentiment?.basic || 'neutral'} · ${m.user?.followers || 0} followers`,
                date:        new Date(m.created_at),
                source:      `StockTwits · $${symbol}`,
                sourceColor: '#40c4ff',
                thumbnail:   m.user?.avatar_url || '',
            }));
        } catch (e) { return []; }
    },

    async _fetchFeed(feed) {
        try {
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.status !== 'ok' || !data.items) return [];
            return data.items.slice(0, 15).map(item => ({
                title: item.title || '',
                link: item.link || '',
                description: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
                date: new Date(item.pubDate || Date.now()),
                source: feed.name,
                sourceColor: feed.color,
                thumbnail: item.thumbnail || item.enclosure?.link || ''
            }));
        } catch (e) {
            console.warn('Feed fetch failed:', feed.name, e.message);
            return [];
        }
    }
};

// ========== AI ANALYSIS ENGINE ==========
// MilitaryFlights — pulls live ADS-B state vectors from OpenSky Network.
// Free public API, no key required. Bounded query over the CENTCOM/Middle East
// theater (Iran, Iraq, Saudi, Gulf, eastern Med). Filters for US-origin
// callsigns that match known military prefixes (RCH/CNV/PAT/HAVEN/SPAR/BAT).
const MilitaryFlights = {
    // lat 15–40, lon 30–65 covers Egypt → eastern Iran, including all Gulf
    BBOX: { lamin: 15, lamax: 40, lomin: 30, lomax: 65 },
    CALLSIGN_PREFIXES: [
        'RCH',  // US Air Mobility Command (transport/tanker)
        'CNV',  // US Navy
        'PAT',  // US Army
        'SPAR', // USAF executive
        'HAVEN',// USAF tanker
        'BAT',  // USAF strategic
        'BLUE', // Various USAF
        'RYDR', // USN VP
        'SLAM', // USAF strategic
        'GOLD', // Various
    ],
    async getMidEast() {
        try {
            const b = this.BBOX;
            const url = `https://opensky-network.org/api/states/all?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`;
            const r = await fetch(url);
            if (!r.ok) return null;
            const data = await r.json();
            if (!data || !data.states) return null;
            // OpenSky state vector shape (positional array):
            // [icao24, callsign, originCountry, timePosition, lastContact, long, lat, baroAlt, onGround, velocity, heading, vertRate, sensors, geoAlt, squawk, spi, posSource]
            const all = data.states.map(s => ({
                icao24: s[0], callsign: (s[1] || '').trim(), country: s[2],
                lon: s[5], lat: s[6], alt: s[7], onGround: s[8], velocity: s[9],
            })).filter(a => a.callsign);

            const mil = all.filter(a => {
                if (a.country !== 'United States') return false;
                return this.CALLSIGN_PREFIXES.some(p => a.callsign.toUpperCase().startsWith(p));
            });

            return {
                timestamp: data.time,
                total: all.length,
                usMil: mil,
                usMilCount: mil.length,
                bbox: b,
            };
        } catch (e) { return null; }
    },
};
window.MilitaryFlights = MilitaryFlights;

// Tradier wrapper — sandbox/live. Reads key + mode from TR_SETTINGS. Sandbox
// data is 15-min delayed; production needs paid plan. All endpoints return
// null on error so screens can fall back to designed defaults.
const TradierAPI = {
    _base() {
        const meta = (window.TR_SETTINGS && window.TR_SETTINGS.meta) || {};
        return meta.tradierMode === 'live'
            ? 'https://api.tradier.com/v1'
            : 'https://sandbox.tradier.com/v1';
    },
    _token() {
        return (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.tradier) || '';
    },
    async _fetch(path) {
        const token = this._token();
        if (!token) return null;
        try {
            const r = await fetch(`${this._base()}${path}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (!r.ok) return null;
            return await r.json();
        } catch (_) { return null; }
    },
    // Trading + account endpoints. Tradier requires form-urlencoded POST bodies
    // (NOT JSON). Returns parsed JSON or null on error. Caller must handle null.
    async _send(path, method, formObj) {
        const token = this._token();
        if (!token) return null;
        try {
            const init = {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            };
            if (formObj) {
                init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                const body = new URLSearchParams();
                Object.keys(formObj).forEach(k => {
                    if (formObj[k] !== undefined && formObj[k] !== null && formObj[k] !== '') {
                        body.append(k, String(formObj[k]));
                    }
                });
                init.body = body.toString();
            }
            const r = await fetch(`${this._base()}${path}`, init);
            if (!r.ok) {
                let err = null; try { err = await r.json(); } catch (_) {}
                return { _error: true, status: r.status, body: err };
            }
            return await r.json();
        } catch (e) { return { _error: true, message: e && e.message }; }
    },
    _accountId() {
        const meta = (window.TR_SETTINGS && window.TR_SETTINGS.meta) || {};
        return meta.tradierAccount || 'VA43420796';
    },
    async getQuote(symbol) {
        const d = await this._fetch(`/markets/quotes?symbols=${encodeURIComponent(symbol)}`);
        return d && d.quotes && d.quotes.quote ? d.quotes.quote : null;
    },
    async getExpirations(symbol) {
        const d = await this._fetch(`/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true`);
        return d && d.expirations && d.expirations.date
            ? (Array.isArray(d.expirations.date) ? d.expirations.date : [d.expirations.date])
            : null;
    },
    async getChain(symbol, expiration) {
        const d = await this._fetch(`/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${encodeURIComponent(expiration)}&greeks=true`);
        return d && d.options && d.options.option
            ? (Array.isArray(d.options.option) ? d.options.option : [d.options.option])
            : null;
    },
    // Account balance — normalized for sandbox (margin) and live (cash/pdt) shapes.
    async getAccount() {
        const id = this._accountId();
        const d = await this._fetch(`/accounts/${encodeURIComponent(id)}/balances`);
        if (!d || !d.balances) return null;
        const b = d.balances;
        const sub = b.margin || b.cash || b.pdt || {};
        return {
            total_equity: typeof b.total_equity === 'number' ? b.total_equity : null,
            cash: typeof b.total_cash === 'number' ? b.total_cash
                : (typeof sub.cash_available === 'number' ? sub.cash_available : null),
            day_change: typeof b.open_pl === 'number' ? b.open_pl
                : (typeof b.close_pl === 'number' ? b.close_pl : null),
            account_number: b.account_number || id,
            buying_power: typeof sub.stock_buying_power === 'number' ? sub.stock_buying_power
                : (typeof sub.option_buying_power === 'number' ? sub.option_buying_power : null),
            raw: b,
        };
    },
    async getPositions() {
        const id = this._accountId();
        const d = await this._fetch(`/accounts/${encodeURIComponent(id)}/positions`);
        if (!d || !d.positions || !d.positions.position) return [];
        const arr = Array.isArray(d.positions.position) ? d.positions.position : [d.positions.position];
        return arr.map(p => ({
            symbol: p.symbol,
            quantity: p.quantity,
            cost_basis: p.cost_basis,
            date_acquired: p.date_acquired,
            id: p.id,
        }));
    },
    async getOrders() {
        const id = this._accountId();
        const d = await this._fetch(`/accounts/${encodeURIComponent(id)}/orders?includeTags=true`);
        if (!d || !d.orders || !d.orders.order) return [];
        const arr = Array.isArray(d.orders.order) ? d.orders.order : [d.orders.order];
        return arr;
    },
    // Order construction — handles both equity and option tickets. For options
    // pass `option_symbol` (OCC format). `class` is auto-derived from presence
    // of option_symbol unless explicitly overridden.
    _buildOrderForm({ symbol, side, quantity, type, price, duration, option_symbol, klass, stop }) {
        const cls = klass || (option_symbol ? 'option' : 'equity');
        const form = {
            class: cls,
            symbol: (symbol || '').toUpperCase(),
            side: side,
            quantity: quantity,
            type: type || 'market',
            duration: duration || 'day',
        };
        if (option_symbol) form.option_symbol = String(option_symbol).toUpperCase();
        if (form.type === 'limit' || form.type === 'stop_limit') form.price = price;
        if (form.type === 'stop'  || form.type === 'stop_limit') form.stop  = stop;
        return form;
    },
    async previewOrder(opts) {
        const id = this._accountId();
        const form = this._buildOrderForm(opts);
        return await this._send(`/accounts/${encodeURIComponent(id)}/orders?preview=true`, 'POST', form);
    },
    async placeOrder(opts) {
        const id = this._accountId();
        const form = this._buildOrderForm(opts);
        return await this._send(`/accounts/${encodeURIComponent(id)}/orders`, 'POST', form);
    },
    async cancelOrder(orderId) {
        const id = this._accountId();
        return await this._send(`/accounts/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}`, 'DELETE', null);
    },
};
window.TradierAPI = TradierAPI;

const AIAnalysis = {
    // Keys come from TR_SETTINGS (new TradeRadar Settings sheet) OR the legacy
    // oilradar_ai_keys localStorage blob, whichever has a value. TR_SETTINGS wins.
    getKeys() {
        let legacy = {};
        try { legacy = JSON.parse(localStorage.getItem('oilradar_ai_keys') || '{}'); } catch {}
        const tr = (window.TR_SETTINGS && window.TR_SETTINGS.keys) || {};
        // Map TR_SETTINGS field names → legacy names where they differ
        const merged = {
            ...legacy,
            claude: tr.claude   || legacy.claude   || '',
            openai: tr.openai   || legacy.openai   || '',
            gemini: tr.gemini   || legacy.gemini   || '',
            grok:   tr.grok     || legacy.grok     || '',
        };
        return merged;
    },
    setKeys(keys) {
        localStorage.setItem('oilradar_ai_keys', JSON.stringify(keys));
    },
    get keys() {
        return this.getKeys();
    },

    // Run all configured LLMs in parallel on the same prompt → per-model results
    // plus a consensus block. Claude + ChatGPT + Gemini (+ optional Grok).
    async analyzeWithPerplexity(headlines) {
        try {
            const resp = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.keys.perplexity}`
                },
                body: JSON.stringify({
                    model: 'sonar',
                    messages: [{ role: 'user', content: this._buildPrompt(headlines) }],
                    temperature: 0.3,
                    max_tokens: 1500
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || '';
            return { model: 'Perplexity Sonar', result: this._parseJSON(text), raw: text, error: null };
        } catch (e) {
            return { model: 'Perplexity Sonar', result: null, raw: null, error: e.message };
        }
    },

    async runMulti(headlines, { excludeGrok = false, excludePerplexity = false } = {}) {
        const keys = this.getKeys();
        const skip = (model) => Promise.resolve({ model, result: null, raw: null, error: 'no key' });

        const tasks = {
            claude: keys.claude ? this.analyzeWithClaude(headlines) : skip('Claude Sonnet'),
            gpt:    keys.openai ? this.analyzeWithOpenAI(headlines) : skip('GPT-4o Mini'),
            gemini: keys.gemini ? this.analyzeWithGemini(headlines) : skip('Gemini 2.0 Flash'),
        };
        if (!excludeGrok) tasks.grok = keys.grok ? this.analyzeWithGrok(headlines) : skip('Grok 3');
        if (!excludePerplexity) tasks.perplexity = keys.perplexity ? this.analyzeWithPerplexity(headlines) : skip('Perplexity Sonar');

        const keysArr = Object.keys(tasks);
        const vals = await Promise.all(keysArr.map(k => tasks[k]));
        const out = {};
        keysArr.forEach((k, i) => out[k] = vals[i]);

        // Consensus across whichever models returned valid results
        const valid = keysArr.filter(k => out[k].result);
        let consensus = null;
        if (valid.length >= 2) {
            const sentiments = valid.map(k => out[k].result.sentiment);
            const confs = valid.map(k => Number(out[k].result.confidence) || 0);
            const unique = [...new Set(sentiments)];
            const agree = unique.length === 1;
            const avgConf = (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(1);
            const modelNames = { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini', grok: 'Grok' };
            consensus = {
                agree,
                sentiment: agree ? unique[0] : unique.join(' vs '),
                avgConfidence: avgConf,
                label: agree ? 'ALIGNED' : 'DIVERGENT',
                modelCount: valid.length,
                summary: agree
                    ? `All ${valid.length} models agree: ${unique[0].toUpperCase()}. Avg confidence ${avgConf}/10.`
                    : `${valid.length} models split — ${valid.map((k, i) => `${modelNames[k]} ${sentiments[i]} (${confs[i]}/10)`).join(' · ')}. Reduce size until alignment.`,
                opportunities: [].concat(...valid.map(k => out[k].result.opportunities || [])).slice(0, 6),
                risks:         [].concat(...valid.map(k => out[k].result.risks || [])).slice(0, 6),
            };
        }

        return { ...out, consensus };
    },

    // Backward-compat wrapper
    async runDual(headlines) { return this.runMulti(headlines); },

    _buildPrompt(headlines) {
        return `You are a crypto market analyst. Analyze these recent blockchain/crypto headlines and provide actionable trading insights.

HEADLINES:
${headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n')}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": 1-10,
  "summary": "2-3 sentence market summary",
  "actionable": [
    {"headline_index": 1, "action": "BUY/SELL/WATCH", "asset": "BTC/ETH/SOL/etc", "reasoning": "brief reason", "urgency": "high/medium/low"}
  ],
  "risks": ["risk 1", "risk 2"],
  "opportunities": ["opportunity 1", "opportunity 2"]
}`;
    },

    async analyzeWithGemini(headlines) {
        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.keys.gemini}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: this._buildPrompt(headlines) }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
                    })
                }
            );
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return { model: 'Gemini 2.0 Flash', result: this._parseJSON(text), raw: text, error: null };
        } catch (e) {
            return { model: 'Gemini 2.0 Flash', result: null, raw: null, error: e.message };
        }
    },

    async analyzeWithOpenAI(headlines) {
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.keys.openai}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: this._buildPrompt(headlines) }],
                    temperature: 0.3,
                    max_tokens: 1500
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || '';
            return { model: 'GPT-4o Mini', result: this._parseJSON(text), raw: text, error: null };
        } catch (e) {
            return { model: 'GPT-4o Mini', result: null, raw: null, error: e.message };
        }
    },

    async analyzeWithClaude(headlines) {
        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.keys.claude,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1500,
                    messages: [{ role: 'user', content: this._buildPrompt(headlines) }]
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.content?.[0]?.text || '';
            return { model: 'Claude Sonnet', result: this._parseJSON(text), raw: text, error: null };
        } catch (e) {
            return { model: 'Claude Sonnet', result: null, raw: null, error: e.message };
        }
    },

    async analyzeWithGrok(headlines) {
        try {
            const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.keys.grok}`
                },
                body: JSON.stringify({
                    model: 'grok-3-mini-fast',
                    messages: [{ role: 'user', content: this._buildPrompt(headlines) }],
                    temperature: 0.3,
                    max_tokens: 1500
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || '';
            return { model: 'Grok 3 Mini', result: this._parseJSON(text), raw: text, error: null };
        } catch (e) {
            return { model: 'Grok 3 Mini', result: null, raw: null, error: e.message };
        }
    },

    _buildBriefingPrompt(headlines) {
        return `You are a seasoned crypto market analyst delivering a 2-minute audio briefing. Cover: (1) overall crypto market sentiment from today's news, (2) key events that could move blockchain and crypto markets, (3) historical parallels (reference specific past events), (4) actionable trades with entry points and risk levels, (5) 1-week and 1-month outlook.

RECENT HEADLINES:
${headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n')}

Write the briefing as natural spoken text (no JSON, no bullet points, no markdown). Use conversational language suitable for text-to-speech. Start with "Here's your market briefing." and end with a clear recommendation. Keep it under 500 words.`;
    },

    async getBriefing(headlines) {
        // Try Gemini first (most reliable for browser CORS), then fallback to others
        const attempts = [
            () => this._briefingGemini(headlines),
            () => this._briefingOpenAI(headlines),
            () => this._briefingGrok(headlines),
            () => this._briefingClaude(headlines)
        ];
        for (const attempt of attempts) {
            const result = await attempt();
            if (result.text) return result;
        }
        return { model: 'None', text: null, error: 'All AI models failed to respond.' };
    },

    async _briefingGemini(headlines) {
        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.keys.gemini}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: this._buildBriefingPrompt(headlines) }] }],
                        generationConfig: { temperature: 0.5, maxOutputTokens: 2000 }
                    })
                }
            );
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return { model: 'Gemini 2.0 Flash', text: data.candidates?.[0]?.content?.parts?.[0]?.text || null, error: null };
        } catch (e) {
            return { model: 'Gemini 2.0 Flash', text: null, error: e.message };
        }
    },

    async _briefingOpenAI(headlines) {
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.keys.openai}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: this._buildBriefingPrompt(headlines) }],
                    temperature: 0.5, max_tokens: 2000
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return { model: 'GPT-4o Mini', text: data.choices?.[0]?.message?.content || null, error: null };
        } catch (e) {
            return { model: 'GPT-4o Mini', text: null, error: e.message };
        }
    },

    async _briefingGrok(headlines) {
        try {
            const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.keys.grok}` },
                body: JSON.stringify({
                    model: 'grok-3-mini-fast',
                    messages: [{ role: 'user', content: this._buildBriefingPrompt(headlines) }],
                    temperature: 0.5, max_tokens: 2000
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return { model: 'Grok 3 Mini', text: data.choices?.[0]?.message?.content || null, error: null };
        } catch (e) {
            return { model: 'Grok 3 Mini', text: null, error: e.message };
        }
    },

    async _briefingClaude(headlines) {
        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.keys.claude,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 2000,
                    messages: [{ role: 'user', content: this._buildBriefingPrompt(headlines) }]
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return { model: 'Claude Sonnet', text: data.content?.[0]?.text || null, error: null };
        } catch (e) {
            return { model: 'Claude Sonnet', text: null, error: e.message };
        }
    },

    async analyzeAll(headlines) {
        const results = await Promise.allSettled([
            this.analyzeWithGemini(headlines),
            this.analyzeWithOpenAI(headlines),
            this.analyzeWithClaude(headlines),
            this.analyzeWithGrok(headlines)
        ]);
        return results.map(r => r.status === 'fulfilled' ? r.value : { model: 'Unknown', result: null, error: r.reason?.message || 'Failed' });
    },

    _parseJSON(text) {
        try {
            // Try to extract JSON from the response (handle markdown code blocks)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            return null;
        } catch (e) {
            return null;
        }
    },

    // Chat conversation management
    chatHistory: {},

    getChatHistory(model) {
        if (!this.chatHistory[model]) {
            try {
                this.chatHistory[model] = JSON.parse(localStorage.getItem(`cryptoradar_chat_${model}`) || '[]');
            } catch { this.chatHistory[model] = []; }
        }
        return this.chatHistory[model];
    },

    saveChatHistory(model) {
        const history = this.chatHistory[model] || [];
        // Keep last 50 messages
        const trimmed = history.slice(-50);
        localStorage.setItem(`cryptoradar_chat_${model}`, JSON.stringify(trimmed));
    },

    addMessage(model, role, content) {
        if (!this.chatHistory[model]) this.chatHistory[model] = [];
        this.chatHistory[model].push({ role, content, timestamp: Date.now() });
        this.saveChatHistory(model);
    },

    clearChatHistory(model) {
        this.chatHistory[model] = [];
        localStorage.removeItem(`cryptoradar_chat_${model}`);
    },

    _buildChatPrompt(question, context) {
        return `You are a crypto market analyst. The user is asking about crypto markets.

CURRENT MARKET CONTEXT:
${context || 'No market data available.'}

Answer the user's question concisely and actionably. Focus on specific assets, entry/exit points, and risk levels. If relevant, reference historical events and technical levels.

User's question: ${question}`;
    },

    async chatWithGemini(question, context) {
        const keys = this.getKeys();
        if (!keys.gemini) return { model: 'Gemini', text: null, error: 'No API key set' };
        const history = this.getChatHistory('gemini').slice(-6);
        const messages = history.map(m => ({ parts: [{ text: m.content }], role: m.role === 'user' ? 'user' : 'model' }));
        messages.push({ parts: [{ text: this._buildChatPrompt(question, context) }], role: 'user' });
        try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: messages, generationConfig: { temperature: 0.5, maxOutputTokens: 2000 } })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
            if (text) { this.addMessage('gemini', 'user', question); this.addMessage('gemini', 'assistant', text); }
            return { model: 'Gemini', text, error: null };
        } catch (e) { return { model: 'Gemini', text: null, error: e.message }; }
    },

    async chatWithOpenAI(question, context) {
        const keys = this.getKeys();
        if (!keys.openai) return { model: 'GPT-4o', text: null, error: 'No API key set' };
        const history = this.getChatHistory('openai').slice(-6);
        const messages = [{ role: 'system', content: 'You are a crypto market analyst. Be concise and actionable.' }];
        history.forEach(m => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        messages.push({ role: 'user', content: this._buildChatPrompt(question, context) });
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.openai}` },
                body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.5, max_tokens: 2000 })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || null;
            if (text) { this.addMessage('openai', 'user', question); this.addMessage('openai', 'assistant', text); }
            return { model: 'GPT-4o', text, error: null };
        } catch (e) { return { model: 'GPT-4o', text: null, error: e.message }; }
    },

    async chatWithClaude(question, context) {
        const keys = this.getKeys();
        if (!keys.claude) return { model: 'Claude', text: null, error: 'No API key set' };
        const history = this.getChatHistory('claude').slice(-6);
        const messages = history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        messages.push({ role: 'user', content: this._buildChatPrompt(question, context) });
        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.content?.[0]?.text || null;
            if (text) { this.addMessage('claude', 'user', question); this.addMessage('claude', 'assistant', text); }
            return { model: 'Claude', text, error: null };
        } catch (e) { return { model: 'Claude', text: null, error: e.message }; }
    },

    async chatWithGrok(question, context) {
        const keys = this.getKeys();
        if (!keys.grok) return { model: 'Grok', text: null, error: 'No API key set' };
        const history = this.getChatHistory('grok').slice(-6);
        const messages = [{ role: 'system', content: 'You are a crypto market analyst. Be concise and actionable.' }];
        history.forEach(m => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        messages.push({ role: 'user', content: this._buildChatPrompt(question, context) });
        try {
            const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.grok}` },
                body: JSON.stringify({ model: 'grok-3-mini-fast', messages, temperature: 0.5, max_tokens: 2000 })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || null;
            if (text) { this.addMessage('grok', 'user', question); this.addMessage('grok', 'assistant', text); }
            return { model: 'Grok', text, error: null };
        } catch (e) { return { model: 'Grok', text: null, error: e.message }; }
    },

    async chatWithPerplexity(question, context) {
        const keys = this.getKeys();
        if (!keys.perplexity) return { model: 'Perplexity', text: null, error: 'No API key set' };
        const history = this.getChatHistory('perplexity').slice(-6);
        const messages = [{ role: 'system', content: 'You are a crypto market analyst with real-time web search capabilities. Be concise and actionable. Cite sources when possible.' }];
        history.forEach(m => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        messages.push({ role: 'user', content: this._buildChatPrompt(question, context) });
        try {
            const resp = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.perplexity}` },
                body: JSON.stringify({ model: 'sonar', messages, temperature: 0.5, max_tokens: 2000 })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || null;
            if (text) { this.addMessage('perplexity', 'user', question); this.addMessage('perplexity', 'assistant', text); }
            return { model: 'Perplexity', text, error: null };
        } catch (e) { return { model: 'Perplexity', text: null, error: e.message }; }
    },

    async chatAll(question, context) {
        return Promise.allSettled([
            this.chatWithGemini(question, context),
            this.chatWithOpenAI(question, context),
            this.chatWithClaude(question, context),
            this.chatWithGrok(question, context),
            this.chatWithPerplexity(question, context)
        ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : { model: 'Unknown', text: null, error: r.reason?.message }));
    }
};

// ========== TECHNICAL ANALYSIS ==========
const TechnicalAnalysis = {
    // Simple Moving Average
    sma(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                let sum = 0;
                for (let j = i - period + 1; j <= i; j++) sum += data[j];
                result.push(sum / period);
            }
        }
        return result;
    },

    // Exponential Moving Average
    ema(data, period) {
        const result = [];
        const k = 2 / (period + 1);
        let ema = null;
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else if (i === period - 1) {
                let sum = 0;
                for (let j = 0; j < period; j++) sum += data[j];
                ema = sum / period;
                result.push(ema);
            } else {
                ema = data[i] * k + ema * (1 - k);
                result.push(ema);
            }
        }
        return result;
    },

    // RSI (Wilder's smoothing, period=14 default)
    rsi(closes, period = 14) {
        const result = [];
        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < closes.length; i++) {
            if (i === 0) {
                result.push(null);
                continue;
            }
            const change = closes[i] - closes[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? -change : 0;
            if (i <= period) {
                avgGain += gain;
                avgLoss += loss;
                if (i < period) {
                    result.push(null);
                } else {
                    avgGain /= period;
                    avgLoss /= period;
                    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                    result.push(100 - 100 / (1 + rs));
                }
            } else {
                avgGain = (avgGain * (period - 1) + gain) / period;
                avgLoss = (avgLoss * (period - 1) + loss) / period;
                const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                result.push(100 - 100 / (1 + rs));
            }
        }
        return result;
    },

    // MACD (12, 26, 9 default)
    macd(closes, fast = 12, slow = 26, signal = 9) {
        const emaFast = this.ema(closes, fast);
        const emaSlow = this.ema(closes, slow);
        const macdLine = [];
        for (let i = 0; i < closes.length; i++) {
            if (emaFast[i] === null || emaSlow[i] === null) {
                macdLine.push(null);
            } else {
                macdLine.push(emaFast[i] - emaSlow[i]);
            }
        }
        // Filter out nulls for signal line calculation
        const macdValues = macdLine.filter(v => v !== null);
        const signalLine = this.ema(macdValues, signal);
        // Map signal line back to full length
        const fullSignal = [];
        let idx = 0;
        for (let i = 0; i < closes.length; i++) {
            if (macdLine[i] === null) {
                fullSignal.push(null);
            } else {
                fullSignal.push(signalLine[idx] || null);
                idx++;
            }
        }
        const histogram = [];
        for (let i = 0; i < closes.length; i++) {
            if (macdLine[i] === null || fullSignal[i] === null) {
                histogram.push(null);
            } else {
                histogram.push(macdLine[i] - fullSignal[i]);
            }
        }
        return { macdLine, signalLine: fullSignal, histogram };
    },

    // Bollinger Bands (period=20, stdDev=2)
    bollingerBands(closes, period = 20, mult = 2) {
        const middle = this.sma(closes, period);
        const upper = [], lower = [], bandwidth = [];
        for (let i = 0; i < closes.length; i++) {
            if (middle[i] === null) {
                upper.push(null);
                lower.push(null);
                bandwidth.push(null);
            } else {
                let sumSq = 0;
                for (let j = i - period + 1; j <= i; j++) {
                    sumSq += (closes[j] - middle[i]) ** 2;
                }
                const std = Math.sqrt(sumSq / period);
                upper.push(middle[i] + mult * std);
                lower.push(middle[i] - mult * std);
                bandwidth.push(middle[i] !== 0 ? (mult * std * 2) / middle[i] : 0);
            }
        }
        return { upper, middle, lower, bandwidth };
    },

    // All indicators at once for a given close array
    analyze(closes) {
        const rsi = this.rsi(closes);
        const macd = this.macd(closes);
        const bollinger = this.bollingerBands(closes);
        const sma20 = this.sma(closes, 20);
        const sma50 = this.sma(closes, 50);
        const sma200 = this.sma(closes, 200);
        const ema12 = this.ema(closes, 12);
        const ema26 = this.ema(closes, 26);

        // Generate signals based on latest values
        const signals = [];
        const last = closes.length - 1;
        const price = closes[last];

        // RSI signals
        const lastRsi = rsi[last];
        if (lastRsi !== null) {
            if (lastRsi < 30) signals.push({ type: 'buy', indicator: 'RSI', description: `RSI oversold at ${lastRsi.toFixed(1)}` });
            if (lastRsi > 70) signals.push({ type: 'sell', indicator: 'RSI', description: `RSI overbought at ${lastRsi.toFixed(1)}` });
        }

        // MACD signals
        if (macd.histogram[last] !== null && macd.histogram[last - 1] !== null) {
            if (macd.histogram[last] > 0 && macd.histogram[last - 1] <= 0) signals.push({ type: 'buy', indicator: 'MACD', description: 'MACD bullish crossover' });
            if (macd.histogram[last] < 0 && macd.histogram[last - 1] >= 0) signals.push({ type: 'sell', indicator: 'MACD', description: 'MACD bearish crossover' });
        }

        // Bollinger Band signals
        if (bollinger.lower[last] !== null) {
            if (price <= bollinger.lower[last]) signals.push({ type: 'buy', indicator: 'Bollinger', description: 'Price at lower Bollinger Band' });
            if (price >= bollinger.upper[last]) signals.push({ type: 'sell', indicator: 'Bollinger', description: 'Price at upper Bollinger Band' });
        }

        // SMA signals
        if (sma20[last] !== null && sma50[last] !== null) {
            if (sma20[last] > sma50[last] && sma20[last - 1] <= sma50[last - 1]) signals.push({ type: 'buy', indicator: 'SMA', description: 'SMA 20/50 golden cross' });
            if (sma20[last] < sma50[last] && sma20[last - 1] >= sma50[last - 1]) signals.push({ type: 'sell', indicator: 'SMA', description: 'SMA 20/50 death cross' });
        }
        if (sma50[last] !== null && sma200[last] !== null) {
            if (sma50[last] > sma200[last] && sma50[last - 1] <= sma200[last - 1]) signals.push({ type: 'buy', indicator: 'SMA', description: 'SMA 50/200 golden cross' });
            if (sma50[last] < sma200[last] && sma50[last - 1] >= sma200[last - 1]) signals.push({ type: 'sell', indicator: 'SMA', description: 'SMA 50/200 death cross' });
        }

        return { rsi, macd, bollinger, sma20, sma50, sma200, ema12, ema26, signals };
    }
};

// ========== ON-CHAIN DATA ==========
const OnChainData = {
    cache: {},
    cacheExpiry: 15 * 60 * 1000, // 15 min

    // BTC mempool fees (mempool.space - free, CORS-friendly)
    async getBTCFees() {
        return this._fetch('https://mempool.space/api/v1/fees/recommended', 'btc_fees');
    },

    // BTC mempool stats
    async getBTCMempool() {
        return this._fetch('https://mempool.space/api/mempool', 'btc_mempool');
    },

    // BTC blocks
    async getBTCBlocks() {
        return this._fetch('https://mempool.space/api/v1/blocks', 'btc_blocks');
    },

    // BTC difficulty adjustment
    async getBTCDifficulty() {
        return this._fetch('https://mempool.space/api/v1/difficulty-adjustment', 'btc_difficulty');
    },

    // Internal fetch with caching
    async _fetch(url, key) {
        if (this.cache[key] && Date.now() - this.cache[key].time < this.cacheExpiry) {
            return this.cache[key].data;
        }
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this.cache[key] = { data, time: Date.now() };
            return data;
        } catch (e) {
            console.warn('OnChain fetch failed:', key, e.message);
            return null;
        }
    }
};

// ========== DEFI DATA (DefiLlama) ==========
const DeFiData = {
    cache: {},
    cacheExpiry: 15 * 60 * 1000,

    // Get top yield pools
    async getPools() {
        const data = await this._fetch('https://yields.llama.fi/pools', 'defi_pools');
        if (!data?.data) return [];
        // Return top 100 pools sorted by TVL
        return data.data
            .filter(p => p.tvlUsd > 1000000 && p.apy > 0)
            .sort((a, b) => b.tvlUsd - a.tvlUsd)
            .slice(0, 100)
            .map(p => ({
                pool: p.pool,
                chain: p.chain,
                project: p.project,
                symbol: p.symbol,
                tvl: p.tvlUsd,
                apy: p.apy,
                apyBase: p.apyBase,
                apyReward: p.apyReward
            }));
    },

    // Get protocol TVL
    async getProtocolTVL(protocol) {
        return this._fetch(`https://api.llama.fi/protocol/${protocol}`, `defi_tvl_${protocol}`);
    },

    // Get total DeFi TVL
    async getTotalTVL() {
        return this._fetch('https://api.llama.fi/v2/historicalChainTvl', 'defi_total_tvl');
    },

    async _fetch(url, key) {
        if (this.cache[key] && Date.now() - this.cache[key].time < this.cacheExpiry) {
            return this.cache[key].data;
        }
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this.cache[key] = { data, time: Date.now() };
            return data;
        } catch (e) {
            console.warn('DeFi fetch failed:', key, e.message);
            return null;
        }
    }
};

// ========== DERIVATIVES DATA (Binance via CORS proxy) ==========
const DerivativesData = {
    cache: {},
    cacheExpiry: 15 * 60 * 1000,
    proxyBase: 'https://api.allorigins.win/get?url=',

    // Get funding rates for top perpetuals
    async getFundingRates() {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'ADAUSDT', 'MATICUSDT'];
        const results = {};
        for (const sym of symbols) {
            const url = encodeURIComponent(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=1`);
            const data = await this._fetchProxy(url, `funding_${sym}`);
            if (data && data[0]) {
                results[sym] = {
                    rate: parseFloat(data[0].fundingRate),
                    time: data[0].fundingTime,
                    annualized: parseFloat(data[0].fundingRate) * 3 * 365 * 100 // 3x daily, annualized %
                };
            }
        }
        return results;
    },

    // Get open interest
    async getOpenInterest(symbol = 'BTCUSDT') {
        const url = encodeURIComponent(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`);
        return this._fetchProxy(url, `oi_${symbol}`);
    },

    async _fetchProxy(encodedUrl, key) {
        if (this.cache[key] && Date.now() - this.cache[key].time < this.cacheExpiry) {
            return this.cache[key].data;
        }
        try {
            const resp = await fetch(this.proxyBase + encodedUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const wrapper = await resp.json();
            const data = JSON.parse(wrapper.contents);
            this.cache[key] = { data, time: Date.now() };
            return data;
        } catch (e) {
            console.warn('Derivatives fetch failed:', key, e.message);
            return null;
        }
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

// ========== EXPORT FOR HTML ==========
window.DataEngine = {
    MathUtil,
    BlackScholes,
    MonteCarlo,
    Correlation,
    LiveData,
    HISTORICAL_EVENTS,
    VOLATILITY_DB,
    CORRELATION_REF,
    Backtester,
    NewsFeed,
    AIAnalysis,
    TechnicalAnalysis,
    OnChainData,
    DeFiData,
    DerivativesData,
    CRYPTO_SCENARIOS
};
