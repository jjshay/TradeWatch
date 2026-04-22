// engine/etf-flows.js — Live BTC + ETH spot-ETF daily net flow scraper.
//
// Data source: Farside Investors (https://farside.co.uk/).
//   - Primary:  CSV endpoint (path shifts over time; we try a short list).
//   - Fallback: HTML table on the "all-data" page.
//
// CORS: Farside is Cloudflare-gated (no Access-Control-Allow-Origin). We
// therefore route every request through a public proxy, trying the list
// in order until one returns usable data. The proxies fail-open: if all
// fail, the public getters return null and the caller (UI) must handle it.
//
// Exposes on window:
//   ETFFlows.getBTCFlows({ days })   → [{ date, total, byIssuer }, …] | null
//   ETFFlows.getETHFlows({ days })   → same shape | null
//   ETFFlows.getSummary()            → { btc:{today,wtd,mtd,streakDays}, eth:{…} } | null
//
// Units: USD millions. All rows sorted newest-first. Missing issuer cells → 0.
//
// Cache: in-memory, 10-minute TTL, keyed by coin (btc|eth).

(function () {
  if (typeof window === 'undefined') return;

  // ---------- config ----------
  var CACHE_TTL_MS = 10 * 60 * 1000;

  // CSV candidates — Farside has reshuffled this path a few times.
  var BTC_CSV_CANDIDATES = [
    'https://farside.co.uk/wp-content/uploads/2024/04/btc-etf-flows-v1.csv',
    'https://farside.co.uk/wp-content/uploads/2024/05/btc-etf-flows-v1.csv',
    'https://farside.co.uk/wp-content/uploads/btc-etf-flows.csv',
  ];
  var ETH_CSV_CANDIDATES = [
    'https://farside.co.uk/wp-content/uploads/2024/07/eth-etf-flows-v1.csv',
    'https://farside.co.uk/wp-content/uploads/2024/08/eth-etf-flows-v1.csv',
    'https://farside.co.uk/wp-content/uploads/eth-etf-flows.csv',
  ];
  var BTC_HTML_URL = 'https://farside.co.uk/bitcoin-etf-flow-all-data/';
  var ETH_HTML_URL = 'https://farside.co.uk/ethereum-etf-flow-all-data/';

  // Proxies are tried in order. Each function takes a fully-qualified URL
  // and returns a URL that can be fetched cross-origin from a browser.
  // Some wrap the body in JSON; each proxy entry knows how to unwrap.
  var PROXIES = [
    {
      name: 'allorigins-raw',
      wrap: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
      unwrap: function (text) { return text; },
      asJson: false,
    },
    {
      name: 'allorigins-get',
      wrap: function (u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
      unwrap: function (obj) { return obj && typeof obj.contents === 'string' ? obj.contents : null; },
      asJson: true,
    },
    {
      name: 'codetabs',
      wrap: function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); },
      unwrap: function (text) { return text; },
      asJson: false,
    },
    {
      name: 'corsproxy-io',
      wrap: function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); },
      unwrap: function (text) { return text; },
      asJson: false,
    },
    {
      name: 'direct',
      wrap: function (u) { return u; },
      unwrap: function (text) { return text; },
      asJson: false,
    },
  ];

  // Canonical issuer set we track. Farside's column set drifts as issuers
  // add or launch — we accept whatever the CSV header gives us but we
  // also expose this list so the UI can keep a stable column order.
  var BTC_ISSUERS = ['IBIT','FBTC','BITB','ARKB','BTCO','EZBC','BRRR','HODL','BTCW','DEFI','GBTC','BTC'];
  var ETH_ISSUERS = ['ETHA','FETH','ETHW','CETH','ETHV','QETH','EZET','ETH','ETHE'];

  // ---------- cache ----------
  var cache = { btc: null, eth: null }; // { data, fetchedAt }

  function cacheGet(key) {
    var e = cache[key];
    if (!e) return null;
    if (Date.now() - e.fetchedAt > CACHE_TTL_MS) return null;
    return e.data;
  }
  function cacheSet(key, data) {
    cache[key] = { data: data, fetchedAt: Date.now() };
  }

  // ---------- proxy fetch ----------
  // Returns the raw text body, or null if every proxy fails.
  async function fetchThroughProxies(url) {
    for (var i = 0; i < PROXIES.length; i++) {
      var p = PROXIES[i];
      try {
        var resp = await fetch(p.wrap(url), { method: 'GET', redirect: 'follow' });
        if (!resp.ok) continue;
        var body;
        if (p.asJson) {
          var obj = await resp.json();
          body = p.unwrap(obj);
        } else {
          body = p.unwrap(await resp.text());
        }
        if (!body || typeof body !== 'string') continue;
        // Reject obvious Cloudflare challenge pages (they often still return 200).
        if (/Just a moment|Attention Required|cf-chl|Enable JavaScript and cookies/i.test(body)) continue;
        if (body.length < 50) continue;
        return body;
      } catch (_) {
        // try next proxy
      }
    }
    return null;
  }

  // ---------- CSV parsing ----------
  // Farside CSV format (approx):
  //   Date,IBIT,FBTC,BITB,ARKB,...,Total
  //   02 Jan 2024,"","","","",...
  //   ...
  // Cells use "-" for "no data" (pre-launch) and "(1,234.5)" or "-1234.5"
  // for outflows. Numbers may contain commas and quotes. Units: USD millions.
  function parseCSV(text) {
    if (!text) return null;
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length < 2) return null;
    var header = splitCsvRow(lines[0]);
    if (!header || header.length < 2) return null;

    // Find the "Date" column + the "Total" column (if any)
    var dateIdx = 0;
    for (var i = 0; i < header.length; i++) {
      if (/^date$/i.test(header[i])) { dateIdx = i; break; }
    }
    var totalIdx = -1;
    for (var j = 0; j < header.length; j++) {
      if (/^total$/i.test(header[j])) { totalIdx = j; break; }
    }

    var issuerCols = [];
    for (var k = 0; k < header.length; k++) {
      if (k === dateIdx || k === totalIdx) continue;
      var name = (header[k] || '').trim();
      if (!name) continue;
      issuerCols.push({ idx: k, name: name.toUpperCase() });
    }

    var rows = [];
    for (var r = 1; r < lines.length; r++) {
      var cells = splitCsvRow(lines[r]);
      if (!cells || cells.length === 0) continue;
      var dateRaw = cells[dateIdx];
      var dateISO = parseFarsideDate(dateRaw);
      if (!dateISO) continue;
      var byIssuer = {};
      var sum = 0;
      var anyVal = false;
      for (var c = 0; c < issuerCols.length; c++) {
        var ic = issuerCols[c];
        var v = parseFarsideNumber(cells[ic.idx]);
        if (v == null) { byIssuer[ic.name] = 0; continue; }
        byIssuer[ic.name] = v;
        sum += v;
        anyVal = true;
      }
      var total;
      if (totalIdx >= 0) {
        var tv = parseFarsideNumber(cells[totalIdx]);
        total = (tv == null) ? sum : tv;
      } else {
        total = sum;
      }
      if (!anyVal && total === 0) continue;
      rows.push({ date: dateISO, total: total, byIssuer: byIssuer });
    }
    if (rows.length === 0) return null;
    // Sort newest-first
    rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return rows;
  }

  function splitCsvRow(line) {
    // Minimal CSV splitter that respects double-quoted cells.
    var out = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseFarsideNumber(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (s === '' || s === '-' || s === '—' || s === 'N/A' || s === 'n/a') return null;
    // Paren-wrapped negatives: (1,234.5) → -1234.5
    var neg = false;
    if (s[0] === '(' && s[s.length - 1] === ')') {
      neg = true;
      s = s.slice(1, -1);
    }
    s = s.replace(/,/g, '').replace(/"/g, '').replace(/\$/g, '').trim();
    if (s === '' || s === '-') return null;
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  function parseFarsideDate(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (!s) return null;
    // "02 Jan 2024"
    var m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (m) {
      var mon = monthFromShort(m[2]);
      if (mon == null) return null;
      return m[3] + '-' + pad2(mon) + '-' + pad2(parseInt(m[1], 10));
    }
    // "2024-01-02"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // "01/02/2024" (assume DD/MM/YYYY — Farside is UK)
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m2) return m2[3] + '-' + pad2(parseInt(m2[2], 10)) + '-' + pad2(parseInt(m2[1], 10));
    return null;
  }
  function monthFromShort(mo) {
    var map = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    return map[mo.toLowerCase()] || null;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------- HTML table fallback ----------
  // Parse the first usable <table> on the Farside all-data page into the
  // same rows-shape parseCSV produces.
  function parseHTMLTable(html) {
    if (!html) return null;
    // Cheap DOM: use DOMParser (available in all browsers).
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { return null; }
    if (!doc) return null;
    var tables = doc.querySelectorAll('table');
    if (!tables || tables.length === 0) return null;
    // Pick the widest table (most columns in its header row) — the Farside
    // page has decorative mini-tables at the top for summary stats.
    var best = null;
    var bestCols = 0;
    for (var t = 0; t < tables.length; t++) {
      var tbl = tables[t];
      var firstRow = tbl.querySelector('tr');
      if (!firstRow) continue;
      var cols = firstRow.querySelectorAll('th,td').length;
      if (cols > bestCols) { best = tbl; bestCols = cols; }
    }
    if (!best || bestCols < 3) return null;

    var trs = best.querySelectorAll('tr');
    if (!trs || trs.length < 2) return null;

    // Build header
    var headerCells = trs[0].querySelectorAll('th,td');
    var header = [];
    for (var h = 0; h < headerCells.length; h++) {
      header.push((headerCells[h].textContent || '').trim());
    }
    if (header.length < 2) return null;

    var dateIdx = 0;
    for (var di = 0; di < header.length; di++) {
      if (/date/i.test(header[di])) { dateIdx = di; break; }
    }
    var totalIdx = -1;
    for (var ti = 0; ti < header.length; ti++) {
      if (/^total$/i.test(header[ti])) { totalIdx = ti; break; }
    }
    var issuerCols = [];
    for (var hi = 0; hi < header.length; hi++) {
      if (hi === dateIdx || hi === totalIdx) continue;
      var nm = (header[hi] || '').trim();
      if (!nm) continue;
      issuerCols.push({ idx: hi, name: nm.toUpperCase() });
    }

    var rows = [];
    for (var rr = 1; rr < trs.length; rr++) {
      var cells = trs[rr].querySelectorAll('th,td');
      if (!cells || cells.length === 0) continue;
      var dateRaw = (cells[dateIdx] && cells[dateIdx].textContent) || '';
      var dateISO = parseFarsideDate(dateRaw.trim());
      if (!dateISO) continue;
      var byIssuer = {};
      var sum = 0;
      var any = false;
      for (var ci = 0; ci < issuerCols.length; ci++) {
        var icol = issuerCols[ci];
        var cell = cells[icol.idx];
        var txt = cell ? (cell.textContent || '').trim() : '';
        var vv = parseFarsideNumber(txt);
        if (vv == null) { byIssuer[icol.name] = 0; continue; }
        byIssuer[icol.name] = vv;
        sum += vv;
        any = true;
      }
      var total2;
      if (totalIdx >= 0) {
        var tt = (cells[totalIdx] && cells[totalIdx].textContent) || '';
        var parsedTotal = parseFarsideNumber(tt.trim());
        total2 = parsedTotal == null ? sum : parsedTotal;
      } else {
        total2 = sum;
      }
      if (!any && total2 === 0) continue;
      rows.push({ date: dateISO, total: total2, byIssuer: byIssuer });
    }
    if (rows.length === 0) return null;
    rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return rows;
  }

  // ---------- orchestrator ----------
  async function loadFlows(coin) {
    var cached = cacheGet(coin);
    if (cached) return cached;

    var csvCandidates = coin === 'btc' ? BTC_CSV_CANDIDATES : ETH_CSV_CANDIDATES;
    var htmlUrl       = coin === 'btc' ? BTC_HTML_URL       : ETH_HTML_URL;

    // Try CSVs first
    for (var i = 0; i < csvCandidates.length; i++) {
      var body = await fetchThroughProxies(csvCandidates[i]);
      if (!body) continue;
      var rows = parseCSV(body);
      if (rows && rows.length) {
        cacheSet(coin, rows);
        return rows;
      }
    }
    // HTML fallback
    var html = await fetchThroughProxies(htmlUrl);
    if (html) {
      var rows2 = parseHTMLTable(html);
      if (rows2 && rows2.length) {
        cacheSet(coin, rows2);
        return rows2;
      }
    }
    return null;
  }

  // ---------- public API ----------
  function sliceDays(rows, days) {
    if (!rows) return null;
    var n = Math.max(1, Math.min(365 * 3, days || 30));
    return rows.slice(0, n);
  }

  async function getBTCFlows(opts) {
    var days = (opts && opts.days) || 30;
    var rows = await loadFlows('btc');
    return sliceDays(rows, days);
  }
  async function getETHFlows(opts) {
    var days = (opts && opts.days) || 30;
    var rows = await loadFlows('eth');
    return sliceDays(rows, days);
  }

  function summarize(rows) {
    if (!rows || !rows.length) return null;
    var today = rows[0].total;

    // Week-to-date: Monday → today (today rolled into same week)
    // Farside dates are business days so this is inclusive of the newest row.
    var newestDate = new Date(rows[0].date + 'T00:00:00Z');
    // UTC day-of-week: 0=Sun, 1=Mon, …
    var dow = newestDate.getUTCDay();
    // Days back to Monday (1). If Sunday (0) → back 6.
    var daysSinceMonday = (dow === 0) ? 6 : (dow - 1);
    var mondayISO = isoDay(addDaysUTC(newestDate, -daysSinceMonday));
    var wtd = 0;
    for (var w = 0; w < rows.length; w++) {
      if (rows[w].date >= mondayISO && rows[w].date <= rows[0].date) wtd += rows[w].total;
      else if (rows[w].date < mondayISO) break;
    }

    // Month-to-date
    var mtdStart = rows[0].date.slice(0, 8) + '01';
    var mtd = 0;
    for (var m = 0; m < rows.length; m++) {
      if (rows[m].date >= mtdStart) mtd += rows[m].total;
      else break;
    }

    // Streak days: consecutive rows at the top with same sign as today's
    var sign = today > 0 ? 1 : today < 0 ? -1 : 0;
    var streak = 0;
    if (sign !== 0) {
      for (var s = 0; s < rows.length; s++) {
        var r = rows[s];
        if ((sign > 0 && r.total > 0) || (sign < 0 && r.total < 0)) streak++;
        else break;
      }
    }
    return { today: today, wtd: wtd, mtd: mtd, streakDays: sign * streak };
  }

  function addDaysUTC(d, n) {
    var x = new Date(d.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }
  function isoDay(d) {
    var y = d.getUTCFullYear();
    var m = d.getUTCMonth() + 1;
    var day = d.getUTCDate();
    return y + '-' + pad2(m) + '-' + pad2(day);
  }

  async function getSummary() {
    var btcRows = await loadFlows('btc');
    var ethRows = await loadFlows('eth');
    if (!btcRows && !ethRows) return null;
    return {
      btc: summarize(btcRows),
      eth: summarize(ethRows),
    };
  }

  // ---------- expose ----------
  window.ETFFlows = {
    getBTCFlows: getBTCFlows,
    getETHFlows: getETHFlows,
    getSummary:  getSummary,

    // Stable column order for the UI.
    BTC_ISSUERS: BTC_ISSUERS.slice(),
    ETH_ISSUERS: ETH_ISSUERS.slice(),

    // Manual cache bust (refresh button).
    clearCache: function () { cache = { btc: null, eth: null }; },

    // For debugging / parse tests.
    _parseCSV:       parseCSV,
    _parseHTMLTable: parseHTMLTable,
  };
})();
