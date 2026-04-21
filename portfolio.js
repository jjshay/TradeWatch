/* ============================================================
   Portfolio — P&L Tracker + Alert Engine
   localStorage-backed holdings with live prices from CoinGecko
   and Tradier. Alerts fire browser notifications.
   ============================================================ */

const Portfolio = {

  STORE_KEY: 'portfolio_v1',
  ALERTS_KEY: 'alerts_v1',
  WATCHLIST_KEY: 'watchlist_v1',

  // Default watchlist — BTC/IBIT (spot vs ETF), USO (oil), VXX (volatility)
  DEFAULT_WATCHLIST: [
    { symbol: 'BTC',  type: 'crypto', label: 'Bitcoin',         coingeckoId: 'bitcoin' },
    { symbol: 'IBIT', type: 'stock',  label: 'iShares BTC ETF' },
    { symbol: 'COIN', type: 'stock',  label: 'Coinbase' },
    { symbol: 'GLD',  type: 'stock',  label: 'Gold ETF' },
    { symbol: 'USO',  type: 'stock',  label: 'US Oil Fund' },
    { symbol: 'VXX',  type: 'stock',  label: 'VIX Futures' },
    { symbol: 'UUP',  type: 'stock',  label: 'US Dollar Index' }
  ],

  loadWatchlist() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.WATCHLIST_KEY));
      return saved || this.DEFAULT_WATCHLIST;
    } catch { return this.DEFAULT_WATCHLIST; }
  },

  saveWatchlist(list) {
    localStorage.setItem(this.WATCHLIST_KEY, JSON.stringify(list));
  },

  addToWatchlist(symbol, type, label = '') {
    const list = this.loadWatchlist();
    if (list.find(w => w.symbol.toUpperCase() === symbol.toUpperCase())) return;
    list.push({ symbol: symbol.toUpperCase(), type, label });
    this.saveWatchlist(list);
  },

  removeFromWatchlist(symbol) {
    this.saveWatchlist(this.loadWatchlist().filter(w => w.symbol !== symbol.toUpperCase()));
  },

  async fetchWatchlistPrices() {
    const list = this.loadWatchlist();
    const cryptos = list.filter(w => w.type === 'crypto');
    const stocks  = list.filter(w => w.type === 'stock');
    const prices  = {};

    if (cryptos.length) {
      const ids = cryptos.map(w => w.coingeckoId || w.symbol.toLowerCase()).join(',');
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);
        const d = await r.json();
        for (const w of cryptos) {
          const id = w.coingeckoId || w.symbol.toLowerCase();
          if (d[id]) prices[w.symbol] = { price: d[id].usd, change24h: d[id].usd_24h_change, vol24h: d[id].usd_24h_vol };
        }
      } catch (e) { console.warn('Watchlist CoinGecko:', e.message); }
    }

    if (stocks.length) {
      const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
      const token = keys.tradier || 'UbRTiiIwAl52hIYm02TPrJAlP6AF';
      try {
        const syms = stocks.map(w => w.symbol).join(',');
        const r = await fetch(
          `https://api.tradier.com/v1/markets/quotes?symbols=${syms}&greeks=false`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
        );
        const d = await r.json();
        const quotes = d?.quotes?.quote;
        const arr = Array.isArray(quotes) ? quotes : (quotes ? [quotes] : []);
        for (const q of arr) {
          prices[q.symbol] = {
            price: q.last ?? q.close,
            change24h: q.change_percentage,
            change: q.change,
            high: q.high,
            low: q.low,
            volume: q.volume
          };
        }
      } catch (e) { console.warn('Watchlist Tradier:', e.message); }
    }

    return prices;
  },

  // ── Holdings CRUD ──

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORE_KEY) || '[]');
    } catch { return []; }
  },

  save(holdings) {
    localStorage.setItem(this.STORE_KEY, JSON.stringify(holdings));
  },

  addHolding({ asset, type, quantity, avgCost, notes = '' }) {
    const holdings = this.load();
    const id = Date.now().toString(36);
    holdings.push({ id, asset: asset.toUpperCase(), type, quantity: +quantity, avgCost: +avgCost, notes, addedAt: new Date().toISOString() });
    this.save(holdings);
    return id;
  },

  removeHolding(id) {
    this.save(this.load().filter(h => h.id !== id));
  },

  updateHolding(id, fields) {
    const holdings = this.load().map(h => h.id === id ? { ...h, ...fields } : h);
    this.save(holdings);
  },

  // ── Live Prices ──

  async fetchPrices(holdings) {
    const cryptos = holdings.filter(h => h.type === 'crypto').map(h => h.asset.toLowerCase());
    const stocks  = holdings.filter(h => h.type === 'stock').map(h => h.asset.toUpperCase());
    const prices  = {};

    if (cryptos.length) {
      // Map asset symbols to CoinGecko IDs
      const idMap = {
        btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin',
        xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', avax: 'avalanche-2',
        link: 'chainlink', dot: 'polkadot', matic: 'matic-network',
        pol: 'matic-network', uni: 'uniswap', atom: 'cosmos', ltc: 'litecoin',
        kas: 'kaspa', rndr: 'render-token', tao: 'bittensor'
      };
      const ids = [...new Set(cryptos.map(s => idMap[s] || s))].join(',');
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        const d = await r.json();
        for (const h of holdings.filter(h => h.type === 'crypto')) {
          const id = idMap[h.asset.toLowerCase()] || h.asset.toLowerCase();
          if (d[id]) {
            prices[h.asset.toUpperCase()] = {
              price: d[id].usd,
              change24h: d[id].usd_24h_change
            };
          }
        }
      } catch (e) { console.warn('Portfolio CoinGecko error:', e.message); }
    }

    if (stocks.length) {
      const keys = (typeof AIAnalysis !== 'undefined') ? AIAnalysis.getKeys() : {};
      const token = keys.tradier || 'UbRTiiIwAl52hIYm02TPrJAlP6AF';
      try {
        const r = await fetch(
          `https://api.tradier.com/v1/markets/quotes?symbols=${stocks.join(',')}&greeks=false`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
        );
        const d = await r.json();
        const quotes = d?.quotes?.quote;
        const arr = Array.isArray(quotes) ? quotes : (quotes ? [quotes] : []);
        for (const q of arr) {
          prices[q.symbol] = {
            price: q.last ?? q.close,
            change24h: q.change_percentage
          };
        }
      } catch (e) { console.warn('Portfolio Tradier error:', e.message); }
    }

    return prices;
  },

  // ── P&L Calculations ──

  calcPnL(holding, currentPrice) {
    const cost = holding.quantity * holding.avgCost;
    const value = holding.quantity * currentPrice;
    const unrealized = value - cost;
    const pct = cost > 0 ? (unrealized / cost) * 100 : 0;
    return { cost, value, unrealized, pct };
  },

  summary(holdings, prices) {
    let totalCost = 0, totalValue = 0;
    const rows = holdings.map(h => {
      const p = prices[h.asset.toUpperCase()];
      const price = p?.price ?? null;
      const pnl = price != null ? this.calcPnL(h, price) : null;
      if (pnl) { totalCost += pnl.cost; totalValue += pnl.value; }
      return { ...h, currentPrice: price, change24h: p?.change24h ?? null, pnl };
    });
    const totalPnl = totalValue - totalCost;
    const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { rows, totalCost, totalValue, totalPnl, totalPct };
  },

  // ── Alerts CRUD ──

  loadAlerts() {
    try { return JSON.parse(localStorage.getItem(this.ALERTS_KEY) || '[]'); }
    catch { return []; }
  },

  saveAlerts(alerts) {
    localStorage.setItem(this.ALERTS_KEY, JSON.stringify(alerts));
  },

  addAlert({ asset, type, condition, value, note = '' }) {
    // condition: 'above' | 'below' | 'change_pct_above' | 'change_pct_below'
    const alerts = this.loadAlerts();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    alerts.push({ id, asset: asset.toUpperCase(), type, condition, value: +value, note, active: true, createdAt: new Date().toISOString(), firedAt: null });
    this.saveAlerts(alerts);
    return id;
  },

  removeAlert(id) {
    this.saveAlerts(this.loadAlerts().filter(a => a.id !== id));
  },

  toggleAlert(id) {
    const alerts = this.loadAlerts().map(a => a.id === id ? { ...a, active: !a.active } : a);
    this.saveAlerts(alerts);
  },

  // Check all active alerts against current prices, fire notifications
  checkAlerts(prices) {
    const alerts = this.loadAlerts();
    const fired = [];
    const updated = alerts.map(alert => {
      if (!alert.active) return alert;
      const p = prices[alert.asset.toUpperCase()];
      if (!p) return alert;
      let triggered = false;
      if (alert.condition === 'above'              && p.price >= alert.value)        triggered = true;
      if (alert.condition === 'below'              && p.price <= alert.value)        triggered = true;
      if (alert.condition === 'change_pct_above'   && p.change24h >= alert.value)    triggered = true;
      if (alert.condition === 'change_pct_below'   && p.change24h <= -alert.value)   triggered = true;
      if (triggered) {
        fired.push(alert);
        return { ...alert, active: false, firedAt: new Date().toISOString() };
      }
      return alert;
    });
    if (fired.length) {
      this.saveAlerts(updated);
      this._notify(fired, prices);
    }
    return fired;
  },

  _notify(alerts, prices) {
    for (const a of alerts) {
      const p = prices[a.asset]?.price;
      const msg = `${a.asset} ${a.condition.replace(/_/g,' ')} ${a.value}${a.condition.includes('pct') ? '%' : ''} — now $${p?.toLocaleString()}`;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Crypto Radar Alert: ${a.asset}`, { body: msg, icon: '/favicon.ico' });
      }
      // Also emit to UI
      window._pulseAlertFired?.(a, p);
    }
  },

  requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  // ── Formatting ──
  fmt(v, dec = 2) {
    if (v == null) return '--';
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  },
  fmtPct(v) {
    if (v == null) return '--';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  },
  fmtUSD(v) {
    if (v == null) return '--';
    const abs = Math.abs(v);
    const s = abs >= 1e6 ? `$${(abs/1e6).toFixed(2)}M` : abs >= 1e3 ? `$${(abs/1e3).toFixed(1)}K` : `$${abs.toFixed(2)}`;
    return v < 0 ? `-${s}` : s;
  }
};
