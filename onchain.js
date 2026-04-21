/* ============================================================
   OnChain — Bitcoin on-chain metrics via Blockchain.com (free)
   Hash rate, transactions, mempool, active addresses, volume
   ============================================================ */

const OnChain = {

  _cache: {},
  _ttl: 30 * 60 * 1000, // 30 min

  async _fetch(url, key) {
    const c = this._cache[key];
    if (c && Date.now() - c.t < this._ttl) return c.d;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      this._cache[key] = { d, t: Date.now() };
      return d;
    } catch (e) {
      console.warn('OnChain fetch:', key, e.message);
      return null;
    }
  },

  _chartUrl(metric, timespan = '90days') {
    return `https://api.blockchain.info/charts/${metric}?timespan=${timespan}&format=json&cors=true`;
  },

  _parse(d) {
    if (!d?.values) return [];
    return d.values.map(v => ({
      date: new Date(v.x * 1000).toISOString().slice(0, 10),
      value: v.y
    }));
  },

  async fetchHashRate(timespan = '90days') {
    const d = await this._fetch(this._chartUrl('hash-rate', timespan), `hashrate_${timespan}`);
    return this._parse(d);
  },

  async fetchTransactions(timespan = '90days') {
    const d = await this._fetch(this._chartUrl('n-transactions', timespan), `txcount_${timespan}`);
    return this._parse(d);
  },

  async fetchActiveAddresses(timespan = '90days') {
    const d = await this._fetch(this._chartUrl('n-unique-addresses', timespan), `addrs_${timespan}`);
    return this._parse(d);
  },

  async fetchMempoolSize(timespan = '30days') {
    const d = await this._fetch(this._chartUrl('mempool-size', timespan), `mempool_${timespan}`);
    return this._parse(d);
  },

  async fetchOnChainVolume(timespan = '90days') {
    const d = await this._fetch(this._chartUrl('estimated-transaction-volume-usd', timespan), `vol_${timespan}`);
    return this._parse(d);
  },

  async fetchMinerRevenue(timespan = '90days') {
    const d = await this._fetch(this._chartUrl('miners-revenue', timespan), `minerrev_${timespan}`);
    return this._parse(d);
  },

  async fetchFeeRevenue(timespan = '90days') {
    const d = await this._fetch(this._chartUrl('transaction-fees-usd', timespan), `fees_${timespan}`);
    return this._parse(d);
  },

  // Fetch all metrics in parallel
  async fetchAll() {
    const [hashRate, txCount, addrs, mempool, volume, minerRev] = await Promise.all([
      this.fetchHashRate(),
      this.fetchTransactions(),
      this.fetchActiveAddresses(),
      this.fetchMempoolSize(),
      this.fetchOnChainVolume(),
      this.fetchMinerRevenue()
    ]);
    return { hashRate, txCount, addrs, mempool, volume, minerRev };
  },

  // Latest value + 30d change for a series
  trend(series) {
    if (!series?.length) return { latest: null, change30d: null, pct30d: null };
    const latest = series[series.length - 1].value;
    const ago = series.length >= 30 ? series[series.length - 30].value : series[0].value;
    const change30d = latest - ago;
    const pct30d = ago !== 0 ? (change30d / ago) * 100 : 0;
    return { latest, change30d, pct30d: +pct30d.toFixed(1) };
  },

  fmt(v, unit = '') {
    if (v == null) return '--';
    if (v >= 1e18) return (v / 1e18).toFixed(1) + 'E' + unit;
    if (v >= 1e15) return (v / 1e15).toFixed(1) + 'P' + unit;
    if (v >= 1e12) return (v / 1e12).toFixed(1) + 'T' + unit;
    if (v >= 1e9)  return (v / 1e9).toFixed(1)  + 'B' + unit;
    if (v >= 1e6)  return (v / 1e6).toFixed(1)  + 'M' + unit;
    if (v >= 1e3)  return (v / 1e3).toFixed(1)  + 'K' + unit;
    return v.toFixed(0) + unit;
  }
};
