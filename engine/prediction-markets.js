// engine/prediction-markets.js — Kalshi + Polymarket live prediction-market feed.
//
// Exposes window.PredictionMarkets:
//   fetchKalshi({ category, limit = 20 })     → [normalized market]
//   fetchPolymarket({ search, limit = 20 })   → [normalized market]
//   fetchRelevant()                           → merged + deduped + vol-sorted
//   fetchPolymarketSlug(slug)                 → deterministic slug-based CLOB fetch
//   fetchConfiguredSlugs()                    → parallel fetch of POLY_SLUGS
//   getBySlugKey(friendlyKey)                 → cached slug-row by friendly key
//   fetchKalshiTicker(ticker)                 → deterministic Kalshi ticker fetch
//
// Normalized shape (search/relevant):
//   { ticker, title, yesPrice, noPrice, volume, category, closeDate, source, url }
//
// Slug shape (deterministic CLOB/Kalshi by-ticker):
//   { slug, question, source, yesPrice, noPrice, probability, volume, endDate }
//
// yesPrice / noPrice are probabilities in [0, 1].
//
// Endpoints (no key required for public reads):
//   Kalshi:     https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=N
//               (old trading-api.kalshi.com/trade-api/v2/* 301-redirects to this host).
//   Polymarket: https://gamma-api.polymarket.com/markets?closed=false&limit=N
//   Polymarket CLOB: https://clob.polymarket.com/markets?slug=<slug> (CORS-enabled)
//
// 5-minute in-memory cache per-key for search queries; 60s cache for slug fetches.
// Quiet failure: returns [] / null on network error.

(function () {
  const KALSHI_BASE     = 'https://api.elections.kalshi.com/trade-api/v2';
  const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
  const POLY_CLOB_BASE  = 'https://clob.polymarket.com';
  const TTL_MS = 5 * 60 * 1000;
  const SLUG_TTL_MS = 60 * 1000;

  const cache = new Map(); // key -> { ts, data }

  // Deterministic slug → friendly-key map for Polymarket CLOB lookups.
  const POLY_SLUGS = {
    'iran-nuclear-deal-2026': 'iran-deal',
    'bitcoin-100k-2026':      'btc-100k',
    'fed-rate-cut-june-2026': 'fed-cut-jun',
    'clarity-act-2026':       'clarity',
  };

  // Friendly-key → slug inverse lookup (populated from POLY_SLUGS below).
  const POLY_SLUGS_BY_KEY = {};
  for (const [slug, key] of Object.entries(POLY_SLUGS)) {
    POLY_SLUGS_BY_KEY[key] = slug;
  }

  // Deterministic Kalshi ticker → friendly-key map (proof-of-concept single market).
  const KALSHI_TICKERS = {
    'KXFEDDECISION-26JUN-CUT25': 'fed-cut-jun-kalshi',
  };
  const KALSHI_TICKERS_BY_KEY = {};
  for (const [ticker, key] of Object.entries(KALSHI_TICKERS)) {
    KALSHI_TICKERS_BY_KEY[key] = ticker;
  }

  const RELEVANT_KEYWORDS = [
    'fed', 'rate cut', 'rate hike', 'fomc', 'powell', 'interest rate',
    'bitcoin', 'btc', 'ethereum', 'eth',
    'clarity', 'sec ', 'crypto regulation',
    'iran', 'hormuz', 'israel', 'russia', 'ukraine',
    'recession', 'gdp', 'cpi', 'inflation',
    'election', 'trump', 'biden', 'harris', 'vance',
    'nuclear', 'tariff', 'china', 'taiwan',
  ];

  function cacheGet(key, ttl = TTL_MS) {
    const c = cache.get(key);
    if (!c) return null;
    if (Date.now() - c.ts > ttl) { cache.delete(key); return null; }
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

  // ---------------- POLYMARKET CLOB (slug-based, deterministic) ----------------
  // Primary: GET https://clob.polymarket.com/markets?slug=<slug>
  //   Response: { data: [ { question, slug, end_date_iso, tokens: [ {outcome,price} ], volume } ] }
  //   Note: CLOB pagination sometimes ignores the slug filter — we verify m.slug === slug.
  // Fallback: GET https://gamma-api.polymarket.com/markets?slug=<slug>
  //   Returns an array of gamma markets with outcomes/outcomePrices JSON strings.
  //
  // The YES token price IS the probability. Token order varies — match on outcome.
  // 60s TTL; per-slug cache key 'clobslug:<slug>'. Null on failure / 404 / slug mismatch.
  async function fetchPolymarketSlug(slug) {
    if (!slug) return null;
    const key = `clobslug:${slug}`;
    const hit = cacheGet(key, SLUG_TTL_MS);
    if (hit !== null) return hit;

    // Attempt 1: CLOB endpoint (per spec).
    try {
      const url = `${POLY_CLOB_BASE}/markets?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw
                   : (raw && Array.isArray(raw.data) ? raw.data : (raw ? [raw] : []));
        // Verify slug match — CLOB sometimes returns unrelated markets if filter is ignored.
        const m = list.find(x => x && x.slug === slug) || null;
        if (m) {
          const tokens = Array.isArray(m.tokens) ? m.tokens : [];
          const yesTok = tokens.find(t => String(t && t.outcome).toUpperCase() === 'YES');
          const noTok  = tokens.find(t => String(t && t.outcome).toUpperCase() === 'NO');
          let yesPrice = yesTok ? num(yesTok.price, null) : null;
          let noPrice  = noTok  ? num(noTok.price,  null) : null;
          if (yesPrice == null && noPrice != null) yesPrice = 1 - noPrice;
          if (noPrice  == null && yesPrice != null) noPrice  = 1 - yesPrice;
          if (yesPrice == null) yesPrice = 0.5;
          if (noPrice  == null) noPrice  = Math.max(0, Math.min(1, 1 - yesPrice));
          const row = {
            slug: m.slug || slug,
            question: m.question || m.title || slug,
            source: 'Polymarket',
            yesPrice,
            noPrice,
            probability: yesPrice,
            volume: num(m.volume, 0),
            endDate: m.end_date_iso || m.endDate || m.end_date || null,
          };
          cacheSet(key, row);
          return row;
        }
      } else if (res.status !== 404) {
        // non-404 error from CLOB — try fallback, don't throw yet
      }
    } catch (err) {
      try { console.warn('[PredictionMarkets] clob slug failed:', slug, err && err.message); } catch (_) {}
    }

    // Attempt 2: Gamma fallback (handles real live Polymarket slugs).
    try {
      const url = `${POLYMARKET_BASE}/markets?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) { cacheSet(key, null); return null; }
      const arr = await res.json();
      const m = Array.isArray(arr) ? arr.find(x => x && x.slug === slug) : null;
      if (!m) { cacheSet(key, null); return null; }
      const norm = normalizePolymarket(m);
      const row = {
        slug: m.slug || slug,
        question: m.question || m.title || slug,
        source: 'Polymarket',
        yesPrice: norm.yesPrice,
        noPrice: norm.noPrice,
        probability: norm.yesPrice,
        volume: norm.volume,
        endDate: m.endDate || m.end_date_iso || m.end_date || null,
      };
      cacheSet(key, row);
      return row;
    } catch (err) {
      try { console.warn('[PredictionMarkets] gamma slug fallback failed:', slug, err && err.message); } catch (_) {}
      cacheSet(key, null);
      return null;
    }
  }

  // Parallel fanout across configured slugs; drops failures silently.
  async function fetchConfiguredSlugs() {
    const slugs = Object.keys(POLY_SLUGS);
    const settled = await Promise.allSettled(slugs.map(s => fetchPolymarketSlug(s)));
    const out = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) out.push(r.value);
    }
    return out;
  }

  // Friendly-key → cached slug row lookup. Returns null if not yet fetched/cached.
  function getBySlugKey(friendlyKey) {
    if (!friendlyKey) return null;
    const slug = POLY_SLUGS_BY_KEY[friendlyKey];
    if (!slug) return null;
    return cacheGet(`clobslug:${slug}`, SLUG_TTL_MS);
  }

  // ---------------- KALSHI (ticker-based, deterministic) ----------------
  // GET https://api.elections.kalshi.com/trade-api/v2/markets?ticker=<ticker>
  // (single-ticker lookup works via ?ticker=; event_ticker is for event fanout.)
  // last_price is cents 0..100 — divide by 100 for probability.
  async function fetchKalshiTicker(ticker) {
    if (!ticker) return null;
    const key = `kalshiticker:${ticker}`;
    const hit = cacheGet(key, SLUG_TTL_MS);
    if (hit !== null) return hit;
    try {
      const url = `${KALSHI_BASE}/markets?ticker=${encodeURIComponent(ticker)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        if (res.status === 404) { cacheSet(key, null); return null; }
        throw new Error('kalshi ticker ' + res.status);
      }
      const j = await res.json();
      const arr = Array.isArray(j.markets) ? j.markets : [];
      // Verify ticker match — Kalshi's ?ticker= filter is sometimes ignored.
      const m = arr.find(x => x && x.ticker === ticker) || null;
      if (!m) { cacheSet(key, null); return null; }
      // Kalshi last_price is in cents (0..100). If only dollar fields exist, fall back.
      let yesPrice = null;
      if (m.last_price != null) yesPrice = num(m.last_price, null);
      if (yesPrice != null && yesPrice > 1) yesPrice = yesPrice / 100;
      if (yesPrice == null) yesPrice = num(m.last_price_dollars, null);
      if (yesPrice == null) yesPrice = num(m.yes_bid_dollars, null);
      if (yesPrice == null) yesPrice = 0.5;
      const noPrice = Math.max(0, Math.min(1, 1 - yesPrice));
      const row = {
        slug: m.ticker || ticker,
        question: m.title || m.subtitle || m.yes_sub_title || ticker,
        source: 'Kalshi',
        yesPrice,
        noPrice,
        probability: yesPrice,
        volume: num(m.volume, 0) || num(m.volume_fp, 0),
        endDate: m.close_time || m.expiration_time || null,
      };
      cacheSet(key, row);
      return row;
    } catch (err) {
      try { console.warn('[PredictionMarkets] kalshi ticker failed:', ticker, err && err.message); } catch (_) {}
      return null;
    }
  }

  // --------------------------- COMBINED ---------------------------
  function matchesRelevant(title) {
    const t = (title || '').toLowerCase();
    return RELEVANT_KEYWORDS.some(kw => t.includes(kw));
  }

  // Promote a slug-row (deterministic shape) into the normalized relevant-feed shape.
  function slugRowToNormalized(row) {
    if (!row) return null;
    const url = row.source === 'Kalshi'
      ? `https://kalshi.com/markets/${String(row.slug).split('-')[0].toLowerCase()}`
      : `https://polymarket.com/event/${row.slug}`;
    return {
      ticker: row.slug,
      title: row.question,
      yesPrice: row.yesPrice,
      noPrice: row.noPrice,
      volume: row.volume || 0,
      category: classifyCategory(row.question, null),
      closeDate: row.endDate || null,
      source: row.source,
      url,
    };
  }

  async function fetchRelevant() {
    const key = 'relevant:all';
    const hit = cacheGet(key);
    if (hit) return hit;
    const [kalshi, poly, configured] = await Promise.all([
      fetchKalshi({ limit: 80 }),
      fetchPolymarket({ limit: 80 }),
      fetchConfiguredSlugs(), // shares the 60s slug cache — no double-fetch
    ]);
    const configuredNorm = configured.map(slugRowToNormalized).filter(Boolean);
    const all = [...kalshi, ...poly].filter(m => matchesRelevant(m.title));
    // Configured slugs are always included (curated, deterministic) — bypass keyword filter.
    const merged = [...configuredNorm, ...all];
    // Dedupe by normalized title prefix (configured slugs added first → they win collisions).
    const seen = new Set();
    const deduped = [];
    for (const m of merged) {
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
    // New deterministic slug/ticker-based fetchers:
    fetchPolymarketSlug,
    fetchConfiguredSlugs,
    getBySlugKey,
    fetchKalshiTicker,
    // Config introspection:
    POLY_SLUGS,
    KALSHI_TICKERS,
    _cache: cache,
    _ttlMs: TTL_MS,
    _slugTtlMs: SLUG_TTL_MS,
  };
})();
