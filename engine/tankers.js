// engine/tankers.js — Tanker / VLCC tracking for Strait of Hormuz.
// Pairs with the flights tab: physical oil shipments are the ground-truth
// for every Iran / Hormuz geopolitical signal. Exposes window.TankerData.
//
// Data sources (all free-tier or public):
//   - AISHub free API (optional, requires key in window.TR_SETTINGS.keys.aishub)
//   - NewsFeed RSS (Reuters / Bloomberg etc), filtered for tanker keywords
//
// The map itself is handled by an iframe in tr-tanker-panel.jsx — the
// engine only enriches with density + news + cached context.
(function () {
  const CACHE_MS = 10 * 60 * 1000; // 10 min
  const cache = {
    hormuzCount: { data: null, time: 0 },
    news:        { data: null, time: 0 },
  };

  // Strait of Hormuz bbox — centered on the chokepoint between Iran & Oman.
  // Covers Bandar Abbas to Fujairah with some slack for inbound queue.
  const HORMUZ_BBOX = {
    latMin: 24.5, latMax: 27.8,
    lonMin: 54.5, lonMax: 58.5,
  };

  const TANKER_KEYWORDS = [
    'tanker', 'hormuz', 'vlcc', 'suezmax', 'aframax',
    'sanctions', 'shipping', 'crude cargo', 'oil cargo',
    'straits', 'iran oil', 'saudi oil', 'tanker seized',
    'tanker attack', 'tanker strike', 'houthis', 'red sea',
    'strait of hormuz', 'fujairah', 'bandar abbas', 'kharg',
  ];

  // Best-effort count of tankers inside the Hormuz bbox.
  // AISHub free tier returns vessel positions filtered by bbox when a user
  // key is supplied. Without a key, returns null — iframe is the primary
  // visual, so a null just means "no numeric badge".
  async function getHormuzCount() {
    if (cache.hormuzCount.data && Date.now() - cache.hormuzCount.time < CACHE_MS) {
      return cache.hormuzCount.data;
    }

    let result = null;
    try {
      const key = (window.TR_SETTINGS && window.TR_SETTINGS.keys && window.TR_SETTINGS.keys.aishub) || '';
      if (key) {
        const url = `https://data.aishub.net/ws.php?` + [
          `username=${encodeURIComponent(key)}`,
          'format=1', 'output=json', 'compress=0',
          `latmin=${HORMUZ_BBOX.latMin}`,
          `latmax=${HORMUZ_BBOX.latMax}`,
          `lonmin=${HORMUZ_BBOX.lonMin}`,
          `lonmax=${HORMUZ_BBOX.lonMax}`,
          // AIS ship-type codes: 80-89 = tanker
          'mmsi=', 'imo=',
        ].join('&');

        const r = await fetch(url);
        if (r.ok) {
          const j = await r.json();
          // AISHub returns [{ERROR:false,USERNAME:...}, [...vessels]]
          const vessels = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
          const tankers = vessels.filter(v => {
            const t = Number(v.SHIPTYPE || v.TYPE || 0);
            return t >= 80 && t <= 89;
          });
          const bboxArea = (HORMUZ_BBOX.latMax - HORMUZ_BBOX.latMin)
                        * (HORMUZ_BBOX.lonMax - HORMUZ_BBOX.lonMin);
          result = {
            source: 'AISHub',
            tankerCount: tankers.length,
            totalVessels: vessels.length,
            density: bboxArea > 0 ? (tankers.length / bboxArea).toFixed(2) : null,
            fetchedAt: Date.now(),
          };
        }
      }
    } catch (e) {
      // Silently fall through — iframe remains the primary signal.
      console.warn('[TankerData] AISHub fetch failed:', e.message);
    }

    cache.hormuzCount = { data: result, time: Date.now() };
    return result;
  }

  // Pull shipping-specific news out of the shared NewsFeed aggregator.
  async function getRecentTankerNews(limit = 20) {
    if (cache.news.data && Date.now() - cache.news.time < CACHE_MS) {
      return cache.news.data;
    }
    let matches = [];
    try {
      if (typeof NewsFeed === 'undefined' || !NewsFeed.fetchAll) {
        cache.news = { data: [], time: Date.now() };
        return [];
      }
      const all = await NewsFeed.fetchAll();
      matches = (all || []).filter(a => {
        const hay = `${a.title || ''} ${a.description || ''}`.toLowerCase();
        return TANKER_KEYWORDS.some(k => hay.includes(k));
      });
      // Newest first, cap to limit.
      matches.sort((a, b) => (b.date || 0) - (a.date || 0));
      matches = matches.slice(0, limit);
    } catch (e) {
      console.warn('[TankerData] news filter failed:', e.message);
      matches = [];
    }
    cache.news = { data: matches, time: Date.now() };
    return matches;
  }

  // Clear all caches — useful when user hits refresh in the UI.
  function clearCache() {
    cache.hormuzCount = { data: null, time: 0 };
    cache.news        = { data: null, time: 0 };
  }

  window.TankerData = {
    HORMUZ_BBOX,
    TANKER_KEYWORDS,
    getHormuzCount,
    getRecentTankerNews,
    clearCache,
  };
})();
