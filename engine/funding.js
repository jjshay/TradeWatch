// engine/funding.js — cross-exchange perpetual futures funding rates
//
// Exposes window.FundingRates with:
//   getAll()          -> { binance:{btc,eth}, bybit:{btc,eth}, okx:{btc,eth}, dydx:{btc,eth} }
//                        each entry: { rate, ratePct8h, markPrice, nextFundingTime,
//                                      intervalHours, sourceUrl, symbol } or null on failure
//   getAverage()      -> { btc:{avg, ratePct8h, exchanges, spread, verdict, samples},
//                          eth:{...} }
//   getHistory(ex, sym, n=20) -> [{ time, rate, ratePct8h }] for a given exchange/symbol
//
// All endpoints are public + CORS-friendly from a browser. Raw funding rates are
// returned as fractions (e.g. 0.00011 = 0.011%). Binance/Bybit/OKX fund every 8h;
// dYdX funds every 1h — we normalise everything to an "8h-equivalent" percent in
// `ratePct8h` so cross-exchange comparisons are apples-to-apples.
//
// Caching: in-memory 60s TTL per (exchange, symbol, kind).
// Resilience: every source is wrapped in try/catch — one broken endpoint never
// kills the batch.

(function () {
  const CACHE_TTL_MS = 60 * 1000;
  const HIST_TTL_MS  = 5 * 60 * 1000;  // history changes slowly
  const _cache = {};                   // key -> { data, time }

  // ---------- cache helpers ----------
  function cacheGet(key, ttl) {
    const e = _cache[key];
    if (!e) return null;
    if (Date.now() - e.time > ttl) return null;
    return e.data;
  }
  function cacheSet(key, data) {
    _cache[key] = { data, time: Date.now() };
  }

  // ---------- fetch helpers ----------
  async function jget(url, opts = {}) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), opts.timeout || 7000);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(to);
    }
  }

  // Normalise a per-interval funding rate (fraction) to an 8h-equivalent percent.
  function to8hPct(rate, intervalHours) {
    if (!isFinite(rate)) return null;
    const scale = 8 / (intervalHours || 8);
    return rate * scale * 100;
  }

  // ---------- Binance (8h funding) ----------
  // https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT
  // https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT  -> markPrice + nextFundingTime
  async function binance(symbol) {
    const pair = symbol === 'eth' ? 'ETHUSDT' : 'BTCUSDT';
    const [fr, pi] = await Promise.all([
      jget('https://fapi.binance.com/fapi/v1/fundingRate?symbol=' + pair + '&limit=1'),
      jget('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + pair),
    ]);
    const latest = Array.isArray(fr) && fr.length ? fr[fr.length - 1] : null;
    if (!latest) throw new Error('binance: empty funding response');
    const rate = parseFloat(latest.fundingRate);
    return {
      exchange: 'binance',
      symbol: pair,
      rate,
      ratePct8h: to8hPct(rate, 8),
      markPrice: pi && pi.markPrice ? parseFloat(pi.markPrice) : null,
      nextFundingTime: pi && pi.nextFundingTime ? Number(pi.nextFundingTime) : null,
      intervalHours: 8,
      sourceUrl: 'https://www.binance.com/en/futures/' + pair,
    };
  }

  async function binanceHistory(symbol, n) {
    const pair = symbol === 'eth' ? 'ETHUSDT' : 'BTCUSDT';
    const d = await jget('https://fapi.binance.com/fapi/v1/fundingRate?symbol=' + pair + '&limit=' + n);
    if (!Array.isArray(d)) return [];
    return d.map(x => ({
      time: Number(x.fundingTime),
      rate: parseFloat(x.fundingRate),
      ratePct8h: to8hPct(parseFloat(x.fundingRate), 8),
    }));
  }

  // ---------- Bybit (8h funding) ----------
  // https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=1
  // https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT  -> markPrice + nextFundingTime
  async function bybit(symbol) {
    const pair = symbol === 'eth' ? 'ETHUSDT' : 'BTCUSDT';
    const [fh, tk] = await Promise.all([
      jget('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=' + pair + '&limit=1'),
      jget('https://api.bybit.com/v5/market/tickers?category=linear&symbol=' + pair),
    ]);
    const fRow = fh && fh.result && fh.result.list && fh.result.list[0];
    if (!fRow) throw new Error('bybit: empty funding response');
    const rate = parseFloat(fRow.fundingRate);
    const tRow = tk && tk.result && tk.result.list && tk.result.list[0];
    return {
      exchange: 'bybit',
      symbol: pair,
      rate,
      ratePct8h: to8hPct(rate, 8),
      markPrice: tRow && tRow.markPrice ? parseFloat(tRow.markPrice) : null,
      nextFundingTime: tRow && tRow.nextFundingTime ? Number(tRow.nextFundingTime) : null,
      intervalHours: 8,
      sourceUrl: 'https://www.bybit.com/trade/usdt/' + pair,
    };
  }

  async function bybitHistory(symbol, n) {
    const pair = symbol === 'eth' ? 'ETHUSDT' : 'BTCUSDT';
    const d = await jget('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=' + pair + '&limit=' + n);
    const list = (d && d.result && d.result.list) || [];
    // Bybit returns newest-first; reverse for chronological sparkline.
    return list.slice().reverse().map(x => ({
      time: Number(x.fundingRateTimestamp),
      rate: parseFloat(x.fundingRate),
      ratePct8h: to8hPct(parseFloat(x.fundingRate), 8),
    }));
  }

  // ---------- OKX (8h funding) ----------
  // https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP
  // https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP     -> last/mark price
  async function okx(symbol) {
    const inst = (symbol === 'eth' ? 'ETH' : 'BTC') + '-USDT-SWAP';
    const [fr, tk] = await Promise.all([
      jget('https://www.okx.com/api/v5/public/funding-rate?instId=' + inst),
      jget('https://www.okx.com/api/v5/market/ticker?instId=' + inst),
    ]);
    const fRow = fr && fr.data && fr.data[0];
    if (!fRow) throw new Error('okx: empty funding response');
    const rate = parseFloat(fRow.fundingRate);
    const tRow = tk && tk.data && tk.data[0];
    return {
      exchange: 'okx',
      symbol: inst,
      rate,
      ratePct8h: to8hPct(rate, 8),
      markPrice: tRow && tRow.last ? parseFloat(tRow.last) : null,
      nextFundingTime: fRow.nextFundingTime ? Number(fRow.nextFundingTime) : null,
      intervalHours: 8,
      sourceUrl: 'https://www.okx.com/trade-swap/' + inst.toLowerCase(),
    };
  }

  async function okxHistory(symbol, n) {
    const inst = (symbol === 'eth' ? 'ETH' : 'BTC') + '-USDT-SWAP';
    const d = await jget('https://www.okx.com/api/v5/public/funding-rate-history?instId=' + inst + '&limit=' + n);
    const rows = (d && d.data) || [];
    return rows.slice().reverse().map(x => ({
      time: Number(x.fundingTime),
      rate: parseFloat(x.fundingRate),
      ratePct8h: to8hPct(parseFloat(x.fundingRate), 8),
    }));
  }

  // ---------- dYdX v4 (1h funding on the indexer) ----------
  // https://indexer.dydx.trade/v4/perpetualMarkets
  // https://indexer.dydx.trade/v4/historicalFunding/BTC-USD?limit=20
  async function dydx(symbol) {
    const ticker = (symbol === 'eth' ? 'ETH' : 'BTC') + '-USD';
    const d = await jget('https://indexer.dydx.trade/v4/perpetualMarkets');
    const m = d && d.markets && d.markets[ticker];
    if (!m) throw new Error('dydx: market missing ' + ticker);
    // dYdX `nextFundingRate` is the 1h rate (as a decimal fraction).
    const rate = parseFloat(m.nextFundingRate);
    // Funding on v4 settles hourly on the hour (UTC).
    const nowMs = Date.now();
    const nextHour = Math.ceil(nowMs / 3_600_000) * 3_600_000;
    return {
      exchange: 'dydx',
      symbol: ticker,
      rate,
      ratePct8h: to8hPct(rate, 1),
      markPrice: m.oraclePrice ? parseFloat(m.oraclePrice) : null,
      nextFundingTime: nextHour,
      intervalHours: 1,
      sourceUrl: 'https://dydx.trade/trade/' + ticker,
    };
  }

  async function dydxHistory(symbol, n) {
    const ticker = (symbol === 'eth' ? 'ETH' : 'BTC') + '-USD';
    const d = await jget('https://indexer.dydx.trade/v4/historicalFunding/' + ticker + '?limit=' + n);
    const rows = (d && d.historicalFunding) || [];
    // Chronological order: API returns newest-first, flip it.
    return rows.slice().reverse().map(x => ({
      time: Date.parse(x.effectiveAt),
      rate: parseFloat(x.rate),
      ratePct8h: to8hPct(parseFloat(x.rate), 1),
    }));
  }

  // ---------- safe wrapper ----------
  async function safe(fn, label) {
    try {
      return await fn();
    } catch (e) {
      try { console.warn('[funding]', label, 'failed:', e && e.message); } catch (_) {}
      return null;
    }
  }

  // ---------- public API ----------
  async function getAll() {
    const key = 'all';
    const cached = cacheGet(key, CACHE_TTL_MS);
    if (cached) return cached;

    const [bBtc, bEth, byBtc, byEth, oBtc, oEth, dBtc, dEth] = await Promise.all([
      safe(() => binance('btc'), 'binance btc'),
      safe(() => binance('eth'), 'binance eth'),
      safe(() => bybit('btc'),   'bybit btc'),
      safe(() => bybit('eth'),   'bybit eth'),
      safe(() => okx('btc'),     'okx btc'),
      safe(() => okx('eth'),     'okx eth'),
      safe(() => dydx('btc'),    'dydx btc'),
      safe(() => dydx('eth'),    'dydx eth'),
    ]);

    const out = {
      binance: { btc: bBtc,  eth: bEth  },
      bybit:   { btc: byBtc, eth: byEth },
      okx:     { btc: oBtc,  eth: oEth  },
      dydx:    { btc: dBtc,  eth: dEth  },
      fetchedAt: Date.now(),
    };
    cacheSet(key, out);
    return out;
  }

  function verdictFor(avgPct8h) {
    // Thresholds expressed in percent-per-8h (same unit as ratePct8h).
    if (!isFinite(avgPct8h)) return 'unknown';
    if (avgPct8h >  0.010) return 'CROWDED LONG';
    if (avgPct8h < -0.005) return 'CROWDED SHORT';
    return 'BALANCED';
  }

  function aggregate(perEx) {
    const samples = Object.entries(perEx)
      .filter(([_, v]) => v && isFinite(v.ratePct8h))
      .map(([ex, v]) => ({ exchange: ex, ratePct8h: v.ratePct8h, rate: v.rate }));
    if (!samples.length) {
      return { avg: null, ratePct8h: null, exchanges: 0, spread: null,
               verdict: 'unknown', samples: [] };
    }
    const vals = samples.map(s => s.ratePct8h);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
    return {
      avg,                // alias for ratePct8h (back-compat)
      ratePct8h: avg,     // explicit units
      exchanges: samples.length,
      spread,
      verdict: verdictFor(avg),
      samples,
    };
  }

  async function getAverage() {
    const all = await getAll();
    return {
      btc: aggregate({
        binance: all.binance.btc, bybit: all.bybit.btc,
        okx:     all.okx.btc,     dydx:  all.dydx.btc,
      }),
      eth: aggregate({
        binance: all.binance.eth, bybit: all.bybit.eth,
        okx:     all.okx.eth,     dydx:  all.dydx.eth,
      }),
      fetchedAt: all.fetchedAt,
    };
  }

  async function getHistory(exchange, symbol, count) {
    const n = Math.max(1, Math.min(200, Number(count) || 20));
    const sym = (symbol || 'btc').toLowerCase();
    const key = 'hist:' + exchange + ':' + sym + ':' + n;
    const cached = cacheGet(key, HIST_TTL_MS);
    if (cached) return cached;

    let rows = [];
    try {
      if (exchange === 'binance') rows = await binanceHistory(sym, n);
      else if (exchange === 'bybit') rows = await bybitHistory(sym, n);
      else if (exchange === 'okx')   rows = await okxHistory(sym, n);
      else if (exchange === 'dydx')  rows = await dydxHistory(sym, n);
      else throw new Error('unknown exchange ' + exchange);
    } catch (e) {
      try { console.warn('[funding] history', exchange, sym, 'failed:', e && e.message); } catch (_) {}
      rows = [];
    }
    cacheSet(key, rows);
    return rows;
  }

  window.FundingRates = {
    getAll,
    getAverage,
    getHistory,
    // expose for tests / debugging
    _verdictFor: verdictFor,
    _to8hPct:    to8hPct,
  };
})();
