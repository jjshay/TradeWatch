// ========== CONGRESS TRADES ==========
// Pulls recent US-Congress member stock transactions from Capitol Trades
// (public, no key). Documented alpha: Pelosi / Vance / Crenshaw / Tuberville
// regularly trade ahead of committee actions. This is pure OSINT — every trade
// here was already disclosed publicly via STOCK Act filings.
//
// Primary: https://bff.capitoltrades.com/trades — JSON, CORS open.
// Fallback: https://www.capitoltrades.com/trades.rss via rss2json proxy.
//
// Exposes:
//   window.CongressTrades.fetchRecent({ limit, filter })  → Trade[]
//   window.CongressTrades.getSummaryByPolitician(limit)   → Summary[]
//
// Trade shape:
//   { politician, ticker, type ('Buy'|'Sell'|'Exchange'),
//     size, size_str, transactionDate, disclosureDate, link }

const CongressTrades = {
    JSON_BASE: 'https://bff.capitoltrades.com/trades',
    RSS_URL:   'https://www.capitoltrades.com/trades.rss',
    RSS2JSON:  'https://api.rss2json.com/v1/api.json?rss_url=',
    SITE_BASE: 'https://www.capitoltrades.com',

    // High-signal names — surfaced visually in the panel.
    NOTABLE: [
        'Pelosi', 'Crenshaw', 'Vance', 'Tuberville', 'Schumer',
        'McConnell', 'Gaetz', 'Green', 'Kelly', 'Khanna', 'Cruz', 'Warren',
    ],

    cache: { trades: [], time: 0 },
    cacheExpiryMs: 15 * 60 * 1000, // 15 min

    // -------------------------------------------------------------------
    // PUBLIC: fetchRecent
    // opts = { limit?: number, filter?: 'all'|'buys'|'sells', force?: bool }
    // -------------------------------------------------------------------
    async fetchRecent(opts) {
        opts = opts || {};
        const limit = Math.max(1, Math.min(200, opts.limit || 50));
        const filter = opts.filter || 'all';
        const force  = !!opts.force;

        if (!force
            && this.cache.trades.length
            && Date.now() - this.cache.time < this.cacheExpiryMs) {
            return this._applyFilter(this.cache.trades, filter).slice(0, limit);
        }

        // 1) Try JSON API.
        let rows = await this._fetchJson(limit);
        // 2) Fall back to RSS.
        if (!rows || !rows.length) {
            rows = await this._fetchRss(limit);
        }

        if (rows && rows.length) {
            this.cache = { trades: rows, time: Date.now() };
        } else if (this.cache.trades.length) {
            // Serve stale cache rather than nothing.
            rows = this.cache.trades;
        } else {
            rows = [];
        }

        return this._applyFilter(rows, filter).slice(0, limit);
    },

    _applyFilter(rows, filter) {
        if (filter === 'buys')  return rows.filter(r => /buy/i.test(r.type));
        if (filter === 'sells') return rows.filter(r => /sell/i.test(r.type));
        return rows.slice();
    },

    // -------------------------------------------------------------------
    // PUBLIC: getSummaryByPolitician
    // Groups cached trades by politician, returns { name, buys, sells,
    // total, totalSizeMid, lastDate } sorted by most-recent activity.
    // -------------------------------------------------------------------
    async getSummaryByPolitician(limit) {
        limit = Math.max(1, Math.min(100, limit || 20));
        const rows = await this.fetchRecent({ limit: 200 });
        const map = new Map();
        for (const t of rows) {
            const key = (t.politician || 'Unknown').trim();
            if (!key) continue;
            let e = map.get(key);
            if (!e) {
                e = { name: key, buys: 0, sells: 0, total: 0, totalSizeMid: 0, lastDate: null };
                map.set(key, e);
            }
            e.total++;
            if (/buy/i.test(t.type))       e.buys++;
            else if (/sell/i.test(t.type)) e.sells++;
            if (typeof t.size === 'number' && isFinite(t.size)) e.totalSizeMid += t.size;
            const d = t.disclosureDate || t.transactionDate;
            if (d && (!e.lastDate || new Date(d) > new Date(e.lastDate))) e.lastDate = d;
        }
        const summary = Array.from(map.values());
        summary.sort((a, b) => {
            const da = a.lastDate ? new Date(a.lastDate).getTime() : 0;
            const db = b.lastDate ? new Date(b.lastDate).getTime() : 0;
            return db - da || b.total - a.total;
        });
        return summary.slice(0, limit);
    },

    // -------------------------------------------------------------------
    // PUBLIC: isNotable — helper for the panel
    // -------------------------------------------------------------------
    isNotable(name) {
        if (!name) return false;
        const n = String(name).toLowerCase();
        return this.NOTABLE.some(k => n.indexOf(k.toLowerCase()) !== -1);
    },

    // ===================================================================
    // Primary: BFF JSON endpoint
    // ===================================================================
    async _fetchJson(limit) {
        try {
            const url = `${this.JSON_BASE}?pageSize=${limit}&sortBy=-disclosureDate`;
            const r = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                // Note: do not set mode; let browser default. CORS is open.
            });
            if (!r.ok) return null;
            const j = await r.json();
            const items = (j && (j.data || j.items || j.trades)) || [];
            if (!Array.isArray(items) || !items.length) return null;
            return items.map(raw => this._normalizeJson(raw)).filter(Boolean);
        } catch (_) {
            return null;
        }
    },

    _normalizeJson(raw) {
        if (!raw || typeof raw !== 'object') return null;

        // Capitol Trades BFF returns nested objects — tolerate several shapes.
        const pol = raw.politician || raw.politicianObj || {};
        const asset = raw.asset || raw.assetObj || {};
        const issuer = raw.issuer || raw.issuerObj || {};

        const polName =
               (typeof pol === 'string' ? pol : null)
            || pol.fullName
            || [pol.firstName, pol.lastName].filter(Boolean).join(' ')
            || raw.politicianName
            || raw.name
            || 'Unknown';

        const ticker =
               asset.assetTicker
            || asset.ticker
            || issuer.issuerTicker
            || raw.ticker
            || raw.symbol
            || '';

        const typeRaw =
               raw.txType
            || raw.type
            || raw.transactionType
            || raw.action
            || '';
        const type = this._normalizeType(typeRaw);

        const sizeRangeStr =
               raw.value
            || raw.valueRange
            || raw.sizeRange
            || raw.size
            || '';
        const sizeMid = this._parseSizeRange(sizeRangeStr);

        const transactionDate =
               raw.txDate
            || raw.transactionDate
            || raw.tradeDate
            || raw.date
            || '';
        const disclosureDate =
               raw.filedDate
            || raw.disclosureDate
            || raw.reportDate
            || raw.publishedDate
            || '';

        const slug = raw.slug || raw.tradeId || raw.id;
        const link = slug
            ? `${this.SITE_BASE}/trades/${slug}`
            : `${this.SITE_BASE}/trades`;

        return {
            politician: String(polName).trim(),
            ticker: String(ticker || '').trim().toUpperCase(),
            type,
            size: sizeMid,                              // numeric midpoint ($)
            size_str: String(sizeRangeStr || '').trim(),
            transactionDate: String(transactionDate || ''),
            disclosureDate:  String(disclosureDate || ''),
            link,
        };
    },

    // ===================================================================
    // Fallback: RSS → rss2json proxy
    // ===================================================================
    async _fetchRss(limit) {
        try {
            const proxy = this.RSS2JSON + encodeURIComponent(this.RSS_URL);
            const r = await fetch(proxy);
            if (!r.ok) return null;
            const j = await r.json();
            if (!j || j.status !== 'ok' || !Array.isArray(j.items)) return null;
            return j.items.slice(0, limit).map(item => this._normalizeRss(item)).filter(Boolean);
        } catch (_) {
            return null;
        }
    },

    _normalizeRss(item) {
        if (!item || !item.title) return null;
        // Capitol Trades RSS title format (observed historical):
        //   "Nancy Pelosi — Bought NVDA — $1M–$5M"
        // Defensive: handle em-dash / en-dash / hyphen variants.
        const title = String(item.title).replace(/\u2014|\u2013/g, '-');
        const parts = title.split('-').map(s => s.trim()).filter(Boolean);

        let politician = '', action = '', ticker = '', sizeStr = '';
        if (parts.length >= 3) {
            politician = parts[0];
            // action + ticker in the middle segment (e.g. "Bought NVDA")
            const mid = parts[1].split(/\s+/).filter(Boolean);
            action = mid[0] || '';
            ticker = (mid[1] || '').toUpperCase();
            sizeStr = parts.slice(2).join(' - ');
        } else {
            politician = parts[0] || '';
            sizeStr    = parts.slice(1).join(' - ');
        }

        const type = this._normalizeType(action);
        const sizeMid = this._parseSizeRange(sizeStr);

        // RSS typically exposes only one date (the pubDate == disclosure date).
        const disclosed = item.pubDate || item.published || '';
        // Best-effort: try to read a tx date out of the description.
        const desc = String(item.description || '').replace(/<[^>]*>/g, '');
        const dateMatch = desc.match(/\d{4}-\d{2}-\d{2}/);
        const transactionDate = dateMatch ? dateMatch[0] : '';

        return {
            politician,
            ticker,
            type,
            size: sizeMid,
            size_str: sizeStr,
            transactionDate,
            disclosureDate: disclosed,
            link: item.link || this.SITE_BASE + '/trades',
        };
    },

    // ===================================================================
    // Helpers
    // ===================================================================
    _normalizeType(raw) {
        const s = String(raw || '').toLowerCase();
        if (!s) return '';
        if (s.indexOf('buy')  !== -1 || s.indexOf('bought')    !== -1 || s === 'p') return 'Buy';
        if (s.indexOf('sell') !== -1 || s.indexOf('sold')      !== -1 || s === 's' || s === 's(partial)' || s === 's(full)') return 'Sell';
        if (s.indexOf('exchange') !== -1) return 'Exchange';
        return raw ? String(raw) : '';
    },

    // Capitol Trades publishes SIZE ranges (per STOCK Act) not exact dollars.
    // We return the midpoint for ranking; the original string is preserved in
    // size_str for display.
    _parseSizeRange(str) {
        if (!str) return 0;
        const s = String(str).replace(/,/g, '').toUpperCase();
        const nums = [];
        const re = /\$?\s*([\d.]+)\s*([KMB])?/g;
        let m;
        while ((m = re.exec(s)) !== null) {
            let n = parseFloat(m[1]);
            if (!isFinite(n)) continue;
            const unit = m[2];
            if (unit === 'K') n *= 1e3;
            else if (unit === 'M') n *= 1e6;
            else if (unit === 'B') n *= 1e9;
            nums.push(n);
        }
        if (!nums.length) return 0;
        if (nums.length === 1) return nums[0];
        return (nums[0] + nums[1]) / 2;
    },
};

window.CongressTrades = CongressTrades;
