// engine/prediction-markets.js — Kalshi + Polymarket live prediction-market feed.
//
// Exposes window.PredictionMarkets:
//   fetchKalshi({ category, limit = 20 })     → [normalized market]
//   fetchPolymarket({ search, limit = 20 })   → [normalized market]
//   fetchRelevant()                           → merged + deduped + vol-sorted
//
// Normalized shape:
//   { ticker, title, yesPrice, noPrice, volume, category, closeDate, source, url }
//
// yesPrice / noPrice are probabilities in [0, 1].
//
// Endpoints (no key required for public reads):
//   Kalshi:     https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=N
//               (old trading-api.kalshi.com/trade-api/v2/* 301-redirects to this host).
//   Polymarket: https://gamma-api.polymarket.com/markets?closed=false&limit=N
//
// 5-minute in-memory cache per-key. Quiet failure: returns [] on network error.

(function () {
  const KALSHI_BASE     = 'https://api.elections.kalshi.com/trade-api/v2';
  const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
  const TTL_MS = 5 * 60 * 1000;

  const cache = new Map(); // key -> { ts, data }

  const RELEVANT_KEYWORDS = [
    'fed', 'rate cut', 'rate hike', 'fomc', 'powell', 'interest rate',
    'bitcoin', 'btc', 'ethereum', 'eth',
    'clarity', 'sec ', 'crypto regulation',
    'iran', 'hormuz', 'israel', 'russia', 'ukraine',
    'recession', 'gdp', 'cpi', 'inflation',
    'election', 'trump', 'biden', 'harris', 'vance',
    'nuclear', 'tariff', 'china', 'taiwan',
  ];

  function cacheGet(key) {
    const c = cache.get(key);
    if (!c) return null;
    if (Date.now() - c.ts > TTL_MS) { cache.delete(key); return null; }
    return c.data;
  }
  function cacheSet(key, data) {
    cache.set(key, { ts: Date.now(), data });
  }

  function num(v, fallback = 0) {
    if (v == null) return fallback;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function classifyCategory(title, raw) {
    const t = (title || '').toLowerCase();
    if (/\bfed\b|fomc|rate cut|rate hike|interest rate|powell|\bbp\b/.test(t)) return 'Fed';
    if (/bitcoin|\bbtc\b|ethereum|\beth\b|crypto|solana|clarity/.test(t)) return 'Crypto';
    if (/trump|biden|harris|vance|election|president|senate|governor|congress/.test(t)) return 'Politics';
    if (/iran|hormuz|israel|russia|ukraine|china|taiwan|nuclear|tariff|war/.test(t)) return 'Geo';
    if (/recession|gdp|cpi|inflation|jobs|unemploy/.test(t)) return 'Macro';
    if (raw) {
      const rc = (raw.category || '').toLowerCase();
      if (rc.includes('econom')) return 'Macro';
      if (rc.includes('politic') || rc.includes('election')) return 'Politics';
      if (rc.includes('crypto')) return 'Crypto';
      if (rc.includes('world')) return 'Geo';
    }
    return 'Other';
  }

  // ----------------------------- KALSHI -----------------------------
  // Response shape (v2 /markets):
  //   { markets: [ { ticker, event_ticker, title, yes_bid_dollars, no_bid_dollars,
  //                  last_price_dollars, volume_fp, volume_24h_fp, close_time, status, ... } ], cursor }
  // Prices are in dollars 0..1 (yes_bid_dollars = "0.38" means 38% yes).
  function normalizeKalshi(m) {
    // Prefer last trade, fall back to mid of bid (kalshi bid only), fall back to 0.5.
    const last = num(m.last_price_dollars, null);
    const yesBid = num(m.yes_bid_dollars, null);
    const noBid  = num(m.no_bid_dollars, null);
    let yesPrice = null;
    if (last != null && last > 0 && last < 1) yesPrice = last;
    else if (yesBid != null && yesBid > 0)   yesPrice = yesBid;
    else if (noBid != null && noBid > 0)     yesPrice = 1 - noBid;
    if (yesPrice == null) yesPrice = 0.5;
    const noPrice = Math.max(0, Math.min(1, 1 - yesPrice));
    const volume = num(m.volume_fp, 0) || num(m.volume, 0);
    const title = m.title || m.subtitle || m.ticker || 'Untitled';
    const event = m.event_ticker || (m.ticker || '').split('-')[0];
    const url = event ? `https://kalshi.com/markets/${event.toLowerCase()}` : 'https://kalshi.com';
    return {
      ticker: m.ticker || event || '',
      title,
      yesPrice,
      noPrice,
      volume,
      category: classifyCategory(title, m),
      closeDate: m.close_time || m.expiration_time || null,
      source: 'Kalshi',
      url,
    };
  }

  // Kalshi's top-level /markets endpoint returns a sports-parlay firehose.
  // To get meaningful Fed / election / crypto / geo markets we first pull
  // /events (which are human-categorized and topic-scoped), match on keyword,
  // then fetch the child markets per relevant event_ticker.
  const KALSHI_EVENT_KEYWORDS = [
    'fed', 'rate', 'fomc', 'powell', 'interest',
    'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'clarity',
    'election', 'trump', 'biden', 'harris', 'vance', 'president',
    'iran', 'israel', 'russia', 'ukraine', 'china', 'taiwan', 'hormuz', 'nuclear',
    'recession', 'gdp', 'cpi', 'inflation', 'tariff', 'unemploy',
  ];
  function eventIsRelevant(e) {
    const t = ((e.title || '') + ' ' + (e.event_ticker || '') + ' ' + (e.sub_title || '')).toLowerCase();
    return KALSHI_EVENT_KEYWORDS.some(k => t.includes(k));
  }

  async function fetchKalshi({ category = null, limit = 20 } = {}) {
    const key = `kalshi:${category || 'all'}:${limit}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    try {
      // Step 1 — pull open events.
      const evUrl = `${KALSHI_BASE}/events?status=open&limit=200`;
      const evRes = await fetch(evUrl, { headers: { 'Accept': 'application/json' } });
      if (!evRes.ok) throw new Error('kalshi events ' + evRes.status);
      const evJson = await evRes.json();
      const allEvents = Array.isArray(evJson.events) ? evJson.events : [];
      const relevant = allEvents.filter(eventIsRelevant).slice(0, 12); // cap fanout
      if (!relevant.length) {
        cacheSet(key, []);
        return [];
      }
      // Step 2 — pull markets per event in parallel.
      const perEvent = await Promise.all(relevant.map(async (e) => {
        try {
          const mUrl = `${KALSHI_BASE}/markets?event_ticker=${encodeURIComponent(e.event_ticker)}&limit=50`;
          const r = await fetch(mUrl, { headers: { 'Accept': 'application/json' } });
          if (!r.ok) return [];
          const j = await r.json();
          const raws = Array.isArray(j.markets) ? j.markets : [];
          return raws.map(m => {
            const norm = normalizeKalshi(m);
            // Prefer event title (topic) for context; append market subtitle.
            if (e.title && m.subtitle && !norm.title.includes(m.subtitle)) {
              norm.title = `${e.title} — ${m.subtitle}`;
            } else if (e.title && m.yes_sub_title) {
              norm.title = `${e.title} — ${m.yes_sub_title}`;
            }
            norm.category = classifyCategory(norm.title, { ...m, category: e.category });
            return norm;
          });
        } catch (_) { return []; }
      }));
      let items = perEvent.flat().filter(m => {
        if (/^KXMVE/i.test(m.ticker)) return false;
        if (!m.volume) return false;
        return true;
      });
      if (category) items = items.filter(m => m.category.toLowerCase() === String(category).toLowerCase());
      items.sort((a, b) => b.volume - a.volume);
      items = items.slice(0, limit);
      cacheSet(key, items);
      return items;
    } catch (err) {
      try { console.warn('[PredictionMarkets] kalshi failed:', err && err.message); } catch (_) {}
      return [];
    }
  }

  // --------------------------- POLYMARKET ---------------------------
  // Response shape: array of market objects:
  //   { id, question, slug, outcomes: '["Yes","No"]', outcomePrices: '["0.12","0.88"]',
  //     volume, volumeNum, liquidity, endDate, closed, active, category, ... }
  function normalizePolymarket(m) {
    let outcomes, prices;
    try { outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || []); } catch (_) { outcomes = []; }
    try { prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []); } catch (_) { prices = []; }
    let yesPrice = null, noPrice = null;
    if (outcomes.length && prices.length === outcomes.length) {
      const yi = outcomes.findIndex(o => /^yes$/i.test(String(o).trim()));
      if (yi >= 0) {
        yesPrice = num(prices[yi], null);
        const ni = outcomes.findIndex(o => /^no$/i.test(String(o).trim()));
        noPrice  = ni >= 0 ? num(prices[ni], null) : (yesPrice != null ? 1 - yesPrice : null);
      } else {
        yesPrice = num(prices[0], null);
        noPrice  = num(prices[1], yesPrice != null ? 1 - yesPrice : null);
      }
    }
    if (yesPrice == null) yesPrice = 0.5;
    if (noPrice == null)  noPrice  = Math.max(0, Math.min(1, 1 - yesPrice));
    const volume = num(m.volumeNum, num(m.volume, 0));
    const title = m.question || m.title || m.slug || 'Untitled';
    const slug = m.slug ? `https://polymarket.com/event/${m.slug}` : 'https://polymarket.com';
    return {
      ticker: m.conditionId || m.slug || String(m.id || ''),
      title,
      yesPrice,
      noPrice,
      volume,
      category: classifyCategory(title, m),
      closeDate: m.endDate || m.end_date || null,
      source: 'Polymarket',
      url: slug,
    };
  }

  async function fetchPolymarket({ search = null, limit = 20 } = {}) {
    const key = `poly:${search || 'all'}:${limit}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    try {
      const params = new URLSearchParams({
        closed: 'false',
        active: 'true',
        limit: String(Math.min(500, Math.max(1, limit * 6))),
        order: 'volumeNum',
        ascending: 'false',
      });
      const url = `${POLYMARKET_BASE}/markets?${params.toString()}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('polymarket ' + res.status);
      const arr = await res.json();
      let items = Array.isArray(arr) ? arr.map(normalizePolymarket) : [];
      items = items.filter(m => m.volume > 0);
      if (search) {
        const s = String(search).toLowerCase();
        items = items.filter(m => m.title.toLowerCase().includes(s));
      }
      items.sort((a, b) => b.volume - a.volume);
      items = items.slice(0, limit);
      cacheSet(key, items);
      return items;
    } catch (err) {
      try { console.warn('[PredictionMarkets] polymarket failed:', err && err.message); } catch (_) {}
      return [];
    }
  }

  // --------------------------- COMBINED ---------------------------
  function matchesRelevant(title) {
    const t = (title || '').toLowerCase();
    return RELEVANT_KEYWORDS.some(kw => t.includes(kw));
  }

  async function fetchRelevant() {
    const key = 'relevant:all';
    const hit = cacheGet(key);
    if (hit) return hit;
    const [kalshi, poly] = await Promise.all([
      fetchKalshi({ limit: 80 }),
      fetchPolymarket({ limit: 80 }),
    ]);
    const all = [...kalshi, ...poly].filter(m => matchesRelevant(m.title));
    // Dedupe by normalized title prefix
    const seen = new Set();
    const deduped = [];
    for (const m of all) {
      const k = (m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      deduped.push(m);
    }
    deduped.sort((a, b) => b.volume - a.volume);
    cacheSet(key, deduped);
    return deduped;
  }

  // Find the single best market matching a title hint (used by tile).
  async function findByTitle(hint) {
    if (!hint) return null;
    const all = await fetchRelevant();
    const h = hint.toLowerCase();
    // exact substring
    let hit = all.find(m => m.title.toLowerCase().includes(h));
    if (hit) return hit;
    // token intersection
    const tokens = h.split(/\s+/).filter(Boolean);
    hit = all.find(m => tokens.every(tok => m.title.toLowerCase().includes(tok)));
    return hit || all[0] || null;
  }

  window.PredictionMarkets = {
    fetchKalshi,
    fetchPolymarket,
    fetchRelevant,
    findByTitle,
    _cache: cache,
    _ttlMs: TTL_MS,
  };
})();
