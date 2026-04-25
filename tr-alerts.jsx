// tr-alerts.jsx — TradeRadar background alert engine + rules UI.
//
// Exposes:
//   window.TRAlertsManager  — start/stop the 60s poll loop, evaluate rules
//   window.TRAlertsPanel    — React modal component ({open, onClose})
//   window.openTRAlerts()   — global trigger (fires 'tr:open-alerts' CustomEvent
//                             so the coordinator can mount + show the panel)
//
// Storage:
//   localStorage.tr_alert_rules  — JSON array of rule objects
//   localStorage.tr_alert_state  — JSON map { [ruleId]: lastTriggeredAtMs }
//   localStorage.tr_alert_seeded — '1' once defaults have been seeded
//
// Depends on (all attached to window by engine/*.js):
//   LiveData.getCryptoPrices, LiveData.getFearGreed
//   LiveData.getEquityMacro (optional — VIX/DXY)
//   LiveData.getFunding (optional — crypto perp funding)
//   MilitaryFlights.getMidEast
//   InsiderData.getRecent (optional)
//   CongressTrades.getRecent (optional)
//   TelegramAlert.send, TelegramAlert.isConfigured
//
// Consensus divergence check reads summary screen's LLM predictions if cached
// on window.TR_LAST_PREDS (best-effort — skipped silently if unavailable).

(function () {
  const RULES_KEY = 'tr_alert_rules';
  const STATE_KEY = 'tr_alert_state';
  const SEEDED_KEY = 'tr_alert_seeded';
  const LAST_SENT_KEY = 'tr_alert_last_sent_v1';   // { [ruleId]: ts } — 6h de-dup
  const SEND_LOG_KEY  = 'tr_alert_send_log_v1';    // last 50 send events
  const DEFAULT_COOLDOWN_MIN = 60;
  const DEDUP_MS = 6 * 60 * 60 * 1000;             // 6 hours
  const ARMED_WATCH_INTERVAL_MS = 5 * 60 * 1000;   // 5 min
  const ARMED_NEWS_WINDOW_MS = 30 * 60 * 1000;     // 30 min
  const TAB_BASE_URL = 'https://traderadar.ggauntlet.com/';
  const TAB_FOR_GROUP = {
    Crypto: 'signals', Equities: 'prices', Sentiment: 'signals',
    Geopolitics: 'flights', Flow: 'signals', Other: 'signals',
  };

  // ---------- storage helpers ----------
  function loadRules() {
    try {
      const raw = localStorage.getItem(RULES_KEY);
      const seeded = localStorage.getItem(SEEDED_KEY) === '1';
      if (!raw) {
        if (!seeded) return seedDefaults();
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        if (!seeded) return seedDefaults();
        return [];
      }
      if (parsed.length === 0 && !seeded) return seedDefaults();
      return parsed;
    } catch (_) {
      const seeded = localStorage.getItem(SEEDED_KEY) === '1';
      if (!seeded) return seedDefaults();
      return [];
    }
  }
  function saveRules(rules) {
    try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch (_) {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) { return {}; }
  }
  function saveState(state) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  // ---------- de-dup + send-log storage ----------
  function loadLastSent() {
    try {
      const raw = localStorage.getItem(LAST_SENT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) { return {}; }
  }
  function saveLastSent(map) {
    try { localStorage.setItem(LAST_SENT_KEY, JSON.stringify(map)); } catch (_) {}
  }
  function markSent(ruleId) {
    const m = loadLastSent();
    m[ruleId] = Date.now();
    saveLastSent(m);
  }
  function isDupedWithin6h(ruleId) {
    const m = loadLastSent();
    const ts = m[ruleId];
    if (!ts) return false;
    return (Date.now() - ts) < DEDUP_MS;
  }

  function loadSendLog() {
    try {
      const raw = localStorage.getItem(SEND_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function appendSendLog(entry) {
    try {
      const log = loadSendLog();
      log.unshift(Object.assign({ ts: Date.now() }, entry));
      const trimmed = log.slice(0, 50);
      localStorage.setItem(SEND_LOG_KEY, JSON.stringify(trimmed));
    } catch (_) {}
  }

  // ---------- per-session error throttle ----------
  // If Telegram API returns non-200, log once; don't retry until next fire.
  let _lastApiErrorAt = 0;
  function logApiErrorOnce(err, context) {
    const now = Date.now();
    if (now - _lastApiErrorAt < 60_000) return; // rate-limit console spam
    _lastApiErrorAt = now;
    try { console.warn('[TRAlerts] Telegram send failed', context || '', err); } catch (_) {}
  }

  // ---------- Telegram send (direct to Bot API via window.TR_SETTINGS) ----------
  async function sendTelegram(message) {
    let botToken = '';
    let chatId = '';
    try {
      const keys = (window.TR_SETTINGS && window.TR_SETTINGS.keys) || {};
      botToken = keys.telegramBot || '';
      chatId   = keys.telegramChatId || '';
    } catch (_) { /* silent */ }
    if (!botToken || !chatId) {
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!r.ok) {
        logApiErrorOnce({ status: r.status }, 'non-200');
        appendSendLog({ ok: false, status: r.status, len: message.length });
        return false;
      }
      const j = await r.json().catch(() => null);
      const ok = !!(j && j.ok === true);
      if (!ok) {
        logApiErrorOnce(j, 'api.ok=false');
        appendSendLog({ ok: false, len: message.length, api: j && j.description });
      } else {
        appendSendLog({ ok: true, len: message.length });
      }
      return ok;
    } catch (e) {
      logApiErrorOnce(e, 'exception');
      appendSendLog({ ok: false, len: message.length, err: String(e && e.message || e) });
      return false;
    }
  }

  // Count of successful sends today (local day)
  function sentTodayCount() {
    const log = loadSendLog();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const t0 = startOfDay.getTime();
    return log.filter(e => e && e.ok && e.ts >= t0).length;
  }

  function seedDefaults() {
    // Seeded on first open only. Three rules, ON by default, pre-configured
    // with notes so the user sees actionable triggers immediately.
    const seeds = [
      {
        id: 'default-btc-110k',
        type: 'BTC_ABOVE',
        threshold: 110000,
        cooldownMin: 60,
        enabled: true,
        note: 'BTC breaks 110k — signal top-third of range',
      },
      {
        id: 'default-mil-10',
        type: 'MIL_FLIGHTS_ABOVE',
        threshold: 10,
        cooldownMin: 45,
        enabled: true,
        note: 'USAF CENTCOM activity spike — oil geo premium',
      },
      {
        id: 'default-fg-extreme',
        type: 'FG_BELOW',
        threshold: 25,
        cooldownMin: 120,
        enabled: true,
        note: 'Fear & Greed extreme fear — contrarian long setup',
      },
    ];
    saveRules(seeds);
    try { localStorage.setItem(SEEDED_KEY, '1'); } catch (_) {}
    return seeds;
  }

  function mkId() {
    return 'r_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  // ---------- rule type metadata ----------
  // `group` clusters rule cards in the panel UI.
  const RULE_TYPES = [
    { key: 'BTC_ABOVE',           label: 'BTC above',              unit: 'USD',    hint: 'e.g. 110000', group: 'Crypto',     icon: '₿' },
    { key: 'BTC_BELOW',           label: 'BTC below',              unit: 'USD',    hint: 'e.g. 80000',  group: 'Crypto',     icon: '₿' },
    { key: 'ETH_ABOVE',           label: 'ETH above',              unit: 'USD',    hint: 'e.g. 4200',   group: 'Crypto',     icon: 'Ξ' },
    { key: 'ETH_BELOW',           label: 'ETH below',              unit: 'USD',    hint: 'e.g. 2800',   group: 'Crypto',     icon: 'Ξ' },
    { key: 'FUNDING_ABOVE',       label: 'Perp funding above',     unit: 'bps/8h', hint: 'e.g. 10',     group: 'Crypto',     icon: '⚡' },
    { key: 'FG_ABOVE',            label: 'Fear & Greed above',     unit: 'index',  hint: '0-100',       group: 'Sentiment',  icon: '◉' },
    { key: 'FG_BELOW',            label: 'Fear & Greed below',     unit: 'index',  hint: '0-100',       group: 'Sentiment',  icon: '◉' },
    { key: 'CONSENSUS_DIVERGENT', label: 'LLM consensus divergent', unit: '',      hint: 'no threshold', group: 'Sentiment', icon: '◈' },
    { key: 'VIX_ABOVE',           label: 'VIX above',              unit: 'index',  hint: 'e.g. 22',     group: 'Equities',   icon: '△' },
    { key: 'DXY_ABOVE',           label: 'DXY above',              unit: 'index',  hint: 'e.g. 108',    group: 'Equities',   icon: '$' },
    { key: 'MIL_FLIGHTS_ABOVE',   label: 'US mil flights above',   unit: 'count',  hint: 'CENTCOM ADS-B count', group: 'Geopolitics', icon: '✈' },
    { key: 'INSIDER_BUY',         label: 'Insider buy >$500k',     unit: 'USD',    hint: 'min $ size',  group: 'Flow',       icon: '◆' },
    { key: 'CONGRESS_BUY',        label: 'Congress buy',           unit: 'USD',    hint: 'min $ size',  group: 'Flow',       icon: '◆' },
  ];

  function typeMeta(key) {
    return RULE_TYPES.find(r => r.key === key) || { key, label: key, group: 'Other', icon: '•', hint: '' };
  }
  function labelForType(key) { return typeMeta(key).label; }
  function iconForType(key) { return typeMeta(key).icon; }
  function groupForType(key) { return typeMeta(key).group; }

  // ---------- evaluation ----------
  // state := {
  //   btc:{price}, eth:{price}, fng:{value}, mil:{count},
  //   vix:{value}, dxy:{value}, funding:{bps},
  //   insider:{largestUsd, ticker, role}, congress:{largestUsd, name, ticker},
  //   consensus:{aligned, sentiment, sentiments:[]}
  // }
  function evaluateRule(rule, state) {
    if (!rule || !rule.enabled) return null;
    switch (rule.type) {
      case 'BTC_ABOVE':
        if (state.btc && isFinite(state.btc.price) && state.btc.price > rule.threshold) {
          return `BTC above ${fmtUsd(rule.threshold)}: now ${fmtUsd(state.btc.price)}`;
        }
        return null;
      case 'BTC_BELOW':
        if (state.btc && isFinite(state.btc.price) && state.btc.price < rule.threshold) {
          return `BTC below ${fmtUsd(rule.threshold)}: now ${fmtUsd(state.btc.price)}`;
        }
        return null;
      case 'ETH_ABOVE':
        if (state.eth && isFinite(state.eth.price) && state.eth.price > rule.threshold) {
          return `ETH above ${fmtUsd(rule.threshold)}: now ${fmtUsd(state.eth.price)}`;
        }
        return null;
      case 'ETH_BELOW':
        if (state.eth && isFinite(state.eth.price) && state.eth.price < rule.threshold) {
          return `ETH below ${fmtUsd(rule.threshold)}: now ${fmtUsd(state.eth.price)}`;
        }
        return null;
      case 'FG_ABOVE':
        if (state.fng && isFinite(state.fng.value) && state.fng.value > rule.threshold) {
          return `Fear & Greed above ${rule.threshold}: now ${state.fng.value} (${state.fng.classification || '—'})`;
        }
        return null;
      case 'FG_BELOW':
        if (state.fng && isFinite(state.fng.value) && state.fng.value < rule.threshold) {
          return `Fear & Greed below ${rule.threshold}: now ${state.fng.value} (${state.fng.classification || '—'})`;
        }
        return null;
      case 'VIX_ABOVE':
        if (state.vix && isFinite(state.vix.value) && state.vix.value > rule.threshold) {
          return `VIX above ${rule.threshold}: now ${state.vix.value.toFixed(2)}`;
        }
        return null;
      case 'DXY_ABOVE':
        if (state.dxy && isFinite(state.dxy.value) && state.dxy.value > rule.threshold) {
          return `DXY above ${rule.threshold}: now ${state.dxy.value.toFixed(2)}`;
        }
        return null;
      case 'FUNDING_ABOVE':
        if (state.funding && isFinite(state.funding.bps) && state.funding.bps > rule.threshold) {
          return `Perp funding above ${rule.threshold} bps/8h: now ${state.funding.bps.toFixed(2)}`;
        }
        return null;
      case 'MIL_FLIGHTS_ABOVE':
        if (state.mil && isFinite(state.mil.count) && state.mil.count > rule.threshold) {
          return `US military flights above ${rule.threshold}: ${state.mil.count} tracked over CENTCOM`;
        }
        return null;
      case 'INSIDER_BUY': {
        const floor = isFinite(rule.threshold) && rule.threshold > 0 ? rule.threshold : 500000;
        if (state.insider && isFinite(state.insider.largestUsd) && state.insider.largestUsd >= floor) {
          const who = [state.insider.role, state.insider.ticker].filter(Boolean).join(' @ ');
          return `Insider buy ${fmtUsd(state.insider.largestUsd)}${who ? ' — ' + who : ''}`;
        }
        return null;
      }
      case 'CONGRESS_BUY': {
        const floor = isFinite(rule.threshold) && rule.threshold > 0 ? rule.threshold : 0;
        if (state.congress && isFinite(state.congress.largestUsd) && state.congress.largestUsd >= floor) {
          const who = [state.congress.name, state.congress.ticker].filter(Boolean).join(' · ');
          return `Congress trade ${fmtUsd(state.congress.largestUsd)}${who ? ' — ' + who : ''}`;
        }
        return null;
      }
      case 'CONSENSUS_DIVERGENT':
        if (state.consensus && state.consensus.sentiments && state.consensus.sentiments.length >= 2
            && state.consensus.aligned === false) {
          return `LLM consensus divergent: ${state.consensus.sentiments.join(' / ')}`;
        }
        return null;
      default:
        return null;
    }
  }

  function fmtUsd(n) {
    if (!isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  // Used by per-rule TEST button so we can show "current X vs threshold Y"
  // even when the rule isn't actually firing.
  function currentValueForRule(rule, state) {
    if (!rule || !state) return null;
    switch (rule.type) {
      case 'BTC_ABOVE': case 'BTC_BELOW':
        return state.btc && isFinite(state.btc.price) ? fmtUsd(state.btc.price) : null;
      case 'ETH_ABOVE': case 'ETH_BELOW':
        return state.eth && isFinite(state.eth.price) ? fmtUsd(state.eth.price) : null;
      case 'FG_ABOVE': case 'FG_BELOW':
        return state.fng && isFinite(state.fng.value) ? state.fng.value : null;
      case 'VIX_ABOVE':
        return state.vix && isFinite(state.vix.value) ? state.vix.value.toFixed(2) : null;
      case 'DXY_ABOVE':
        return state.dxy && isFinite(state.dxy.value) ? state.dxy.value.toFixed(2) : null;
      case 'FUNDING_ABOVE':
        return state.funding && isFinite(state.funding.bps) ? state.funding.bps.toFixed(2) + ' bps' : null;
      case 'MIL_FLIGHTS_ABOVE':
        return state.mil && isFinite(state.mil.count) ? state.mil.count : null;
      case 'INSIDER_BUY':
        return state.insider && isFinite(state.insider.largestUsd) ? fmtUsd(state.insider.largestUsd) : null;
      case 'CONGRESS_BUY':
        return state.congress && isFinite(state.congress.largestUsd) ? fmtUsd(state.congress.largestUsd) : null;
      case 'CONSENSUS_DIVERGENT':
        return state.consensus ? (state.consensus.aligned ? 'aligned' : 'divergent') : null;
      default:
        return null;
    }
  }

  // ---------- state collection ----------
  async function collectState() {
    const out = {
      btc: null, eth: null, fng: null, mil: null, consensus: null,
      vix: null, dxy: null, funding: null, insider: null, congress: null,
    };
    try {
      if (typeof LiveData !== 'undefined') {
        const prices = await LiveData.getCryptoPrices();
        if (prices && prices.bitcoin && isFinite(prices.bitcoin.usd)) {
          out.btc = { price: prices.bitcoin.usd, change24h: prices.bitcoin.usd_24h_change };
        }
        if (prices && prices.ethereum && isFinite(prices.ethereum.usd)) {
          out.eth = { price: prices.ethereum.usd, change24h: prices.ethereum.usd_24h_change };
        }
        const fg = await LiveData.getFearGreed();
        if (fg && fg.data && fg.data[0]) {
          out.fng = {
            value: parseInt(fg.data[0].value, 10),
            classification: fg.data[0].value_classification,
          };
        }
        if (typeof LiveData.getEquityMacro === 'function') {
          try {
            const eq = await LiveData.getEquityMacro();
            if (eq && isFinite(eq.vix)) out.vix = { value: eq.vix };
            if (eq && isFinite(eq.dxy)) out.dxy = { value: eq.dxy };
          } catch (_) { /* silent */ }
        }
        if (typeof LiveData.getFunding === 'function') {
          try {
            const fd = await LiveData.getFunding();
            if (fd && isFinite(fd.bps)) out.funding = { bps: fd.bps, symbol: fd.symbol };
          } catch (_) { /* silent */ }
        }
      }
    } catch (_) { /* silent */ }
    try {
      if (typeof MilitaryFlights !== 'undefined') {
        const m = await MilitaryFlights.getMidEast();
        if (m && isFinite(m.usMilCount)) {
          out.mil = { count: m.usMilCount, total: m.total };
        }
      }
    } catch (_) { /* silent */ }
    try {
      if (typeof InsiderData !== 'undefined' && typeof InsiderData.getRecent === 'function') {
        const recs = await InsiderData.getRecent();
        if (Array.isArray(recs) && recs.length) {
          const buys = recs.filter(r => r && (r.type === 'buy' || r.transactionCode === 'P') && isFinite(r.usdValue));
          if (buys.length) {
            const top = buys.reduce((a, b) => (b.usdValue > a.usdValue ? b : a), buys[0]);
            out.insider = { largestUsd: top.usdValue, ticker: top.ticker, role: top.role || top.title };
          }
        }
      }
    } catch (_) { /* silent */ }
    try {
      if (typeof CongressTrades !== 'undefined' && typeof CongressTrades.getRecent === 'function') {
        const trs = await CongressTrades.getRecent();
        if (Array.isArray(trs) && trs.length) {
          const buys = trs.filter(r => r && (r.type === 'buy' || r.transaction === 'purchase') && isFinite(r.usdValue));
          if (buys.length) {
            const top = buys.reduce((a, b) => (b.usdValue > a.usdValue ? b : a), buys[0]);
            out.congress = { largestUsd: top.usdValue, ticker: top.ticker, name: top.name || top.representative };
          }
        }
      }
    } catch (_) { /* silent */ }
    // Consensus — best-effort from summary screen's cached preds
    try {
      const cached = window.TR_LAST_PREDS;
      if (cached && typeof cached === 'object') {
        const valid = ['claude', 'gpt', 'gemini']
          .map(k => cached[k])
          .filter(p => p && p.sentiment);
        if (valid.length >= 2) {
          const sentiments = valid.map(p => p.sentiment);
          const aligned = new Set(sentiments).size === 1;
          out.consensus = { aligned, sentiments, sentiment: aligned ? sentiments[0] : 'mixed' };
        }
      }
    } catch (_) { /* silent */ }
    return out;
  }

  // ---------- Telegram formatter ----------
  function tabUrlForRule(rule) {
    const tab = TAB_FOR_GROUP[groupForType(rule.type)] || 'signals';
    return `${TAB_BASE_URL}?tab=${tab}`;
  }

  function formatMessage(rule, reason, state, opts) {
    const isTest = !!(opts && opts.test);
    const lines = [];
    const alertName = (rule && rule.note) ? rule.note : labelForType(rule.type);
    const headerEmoji = isTest ? '\u{1F9EA}' : '\u{1F6A8}'; // test tube vs siren
    const prefix = isTest ? 'TEST' : 'TR alert';
    lines.push(`${headerEmoji} <b>${prefix} \u00b7 ${escapeHtml(alertName)}</b>`);
    lines.push(escapeHtml(reason));
    if (rule.note && rule.note !== alertName) {
      lines.push('<i>' + escapeHtml(rule.note) + '</i>');
    }
    // Threshold reference line (skip for CONSENSUS_DIVERGENT — no threshold)
    if (rule.type !== 'CONSENSUS_DIVERGENT' && isFinite(rule.threshold)) {
      lines.push(`<i>threshold: ${escapeHtml(String(rule.threshold))}</i>`);
    }
    // Context strip from live snapshot
    const ctx = [];
    if (state) {
      if (state.btc) ctx.push(`BTC ${fmtUsd(state.btc.price)}`);
      if (state.eth) ctx.push(`ETH ${fmtUsd(state.eth.price)}`);
      if (state.fng) ctx.push(`F&amp;G ${state.fng.value}`);
      if (state.vix) ctx.push(`VIX ${state.vix.value.toFixed(1)}`);
      if (state.dxy) ctx.push(`DXY ${state.dxy.value.toFixed(1)}`);
      if (state.mil) ctx.push(`MIL ${state.mil.count}`);
    }
    if (ctx.length) lines.push('<i>' + ctx.join(' \u00b7 ') + '</i>');
    // Timestamp
    lines.push('<code>' + new Date().toISOString() + '</code>');
    // Direct tab link
    const url = tabUrlForRule(rule);
    lines.push(`<a href="${escapeAttr(url)}">Open ${escapeHtml(groupForType(rule.type))} tab</a>`);
    return lines.join('\n');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- Telegram config detection ----------
  function telegramConfigured() {
    try {
      const keys = (window.TR_SETTINGS && window.TR_SETTINGS.keys) || {};
      if (keys.telegramBot && keys.telegramChatId) return true;
      // Back-compat: also accept TelegramAlert.isConfigured if present.
      if (typeof TelegramAlert !== 'undefined'
          && typeof TelegramAlert.isConfigured === 'function') {
        return !!TelegramAlert.isConfigured();
      }
      return false;
    } catch (_) { return false; }
  }

  // ---------- core manager ----------
  const Manager = {
    _timer: null,
    _running: false,
    _intervalMs: 60_000,
    _lastTickAt: null,
    _lastState: null,
    _listeners: new Set(),

    getRules() { return loadRules(); },
    setRules(rules) { saveRules(rules); this._emit(); },
    getState() { return loadState(); },
    getLastSnapshot() { return this._lastState; },
    getLastTickAt() { return this._lastTickAt; },
    telegramConfigured() { return telegramConfigured(); },
    sendTelegram(message) { return sendTelegram(message); },
    sentTodayCount() { return sentTodayCount(); },
    getSendLog() { return loadSendLog(); },
    getLastSent() { return loadLastSent(); },

    onChange(cb) {
      this._listeners.add(cb);
      return () => this._listeners.delete(cb);
    },
    _emit() {
      this._listeners.forEach(cb => { try { cb(); } catch (_) {} });
    },

    addRule(partial) {
      const rules = loadRules();
      const rule = Object.assign({
        id: mkId(),
        type: 'BTC_ABOVE',
        threshold: 0,
        cooldownMin: DEFAULT_COOLDOWN_MIN,
        enabled: true,
        note: '',
      }, partial || {});
      rules.push(rule);
      saveRules(rules);
      this._emit();
      return rule;
    },
    updateRule(id, patch) {
      const rules = loadRules().map(r => r.id === id ? Object.assign({}, r, patch) : r);
      saveRules(rules);
      this._emit();
    },
    deleteRule(id) {
      const rules = loadRules().filter(r => r.id !== id);
      saveRules(rules);
      const st = loadState();
      delete st[id];
      saveState(st);
      this._emit();
    },
    toggleRule(id) {
      const rules = loadRules().map(r => r.id === id ? Object.assign({}, r, { enabled: !r.enabled }) : r);
      saveRules(rules);
      this._emit();
    },

    async testSend() {
      if (!telegramConfigured()) return { ok: false, error: 'telegram not configured' };
      const ts = new Date().toISOString();
      const msg = `\u{1F9EA} <b>TR test alert</b>\nTelegram connection OK.\n<code>${ts}</code>\n<a href="${escapeAttr(TAB_BASE_URL)}">Open TradeRadar</a>`;
      const ok = await sendTelegram(msg);
      return { ok, result: { test: true } };
    },

    async testSendRule(id) {
      const rule = loadRules().find(r => r.id === id);
      if (!rule) return { ok: false, error: 'rule not found' };
      if (!telegramConfigured()) return { ok: false, error: 'telegram not configured' };
      const state = this._lastState || await collectState();
      // Use current evaluator output if rule actually matches; otherwise show
      // a synthetic "current value vs threshold" line so the user can verify.
      const evalReason = evaluateRule(Object.assign({}, rule, { enabled: true }), state);
      let reason;
      if (evalReason) {
        reason = evalReason;
      } else {
        const cur = currentValueForRule(rule, state);
        reason = `current ${cur === null ? 'n/a' : cur} vs threshold ${rule.threshold}`;
      }
      const msg = formatMessage(rule, reason, state, { test: true });
      const ok = await sendTelegram(msg);
      // testSendRule already writes via sendTelegram → appendSendLog, but
      // tag the entry as a test for visibility in the debug log.
      try {
        const log = loadSendLog();
        if (log[0]) {
          log[0].test = true;
          log[0].ruleId = rule.id;
          localStorage.setItem(SEND_LOG_KEY, JSON.stringify(log));
        }
      } catch (_) {}
      return { ok };
    },

    async tick() {
      const state = await collectState();
      this._lastState = state;
      this._lastTickAt = Date.now();
      const rules = loadRules();
      const runState = loadState();
      const now = Date.now();
      let fired = 0;
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const reason = evaluateRule(rule, state);
        if (!reason) continue;
        const cooldownMs = Math.max(0, Number(rule.cooldownMin) || DEFAULT_COOLDOWN_MIN) * 60_000;
        const last = runState[rule.id] || 0;
        if (now - last < cooldownMs) continue;
        // 6h global de-dup per rule (in addition to user-set cooldown)
        if (isDupedWithin6h(rule.id)) {
          // Still mark cooldown so we don't keep re-evaluating on every tick.
          runState[rule.id] = now;
          continue;
        }
        // Fire via direct Bot API (sendTelegram) — silently no-ops if not
        // configured. Returns true on success.
        try {
          const msg = formatMessage(rule, reason, state);
          const ok = await sendTelegram(msg);
          if (ok) {
            markSent(rule.id);
            // Tag latest log entry with the rule that fired
            try {
              const log = loadSendLog();
              if (log[0]) {
                log[0].ruleId = rule.id;
                log[0].kind = 'rule';
                localStorage.setItem(SEND_LOG_KEY, JSON.stringify(log));
              }
            } catch (_) {}
          }
        } catch (_) { /* silent — sendTelegram already logged */ }
        runState[rule.id] = now;
        fired++;
      }
      saveState(runState);
      this._emit();
      return { fired, state };
    },

    start(intervalMs) {
      if (this._running) return;
      if (intervalMs && intervalMs > 5_000) this._intervalMs = intervalMs;
      this._running = true;
      // First tick after a small delay so the engine has time to boot.
      setTimeout(() => { this.tick(); }, 2_000);
      this._timer = setInterval(() => { this.tick(); }, this._intervalMs);
      // Kick off the ARMED-scenarios watcher (independent cadence, 5min).
      try { this.setupARMEDWatch(); } catch (_) {}
    },
    stop() {
      this._running = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._armedTimer) { clearInterval(this._armedTimer); this._armedTimer = null; }
    },
    isRunning() { return this._running; },

    // ---------- ARMED-scenarios watcher ----------
    // Reads window.tr_scenarios_v1 (via localStorage), filters status==='ARMED',
    // pulls last 30 min of news via window.NewsFeed.fetchAll(), and fires a
    // Telegram with a TRIGGERED upgrade chip + impact table on first match.
    // Uses the same 6h de-dup keyed on `scenario:<title>`.
    _armedTimer: null,
    _armedRunning: false,

    setupARMEDWatch() {
      if (this._armedTimer) return;
      // First run after short delay so news engine can boot
      setTimeout(() => { this._armedTick(); }, 8_000);
      this._armedTimer = setInterval(() => { this._armedTick(); }, ARMED_WATCH_INTERVAL_MS);
    },

    async _armedTick() {
      if (this._armedRunning) return;
      this._armedRunning = true;
      try {
        const armed = loadARMEDScenarios();
        if (!armed.length) return;
        const news = await fetchRecentNews(ARMED_NEWS_WINDOW_MS);
        if (!news || !news.length) return;
        for (const sc of armed) {
          const ruleId = 'scenario:' + (sc.title || 'untitled');
          if (isDupedWithin6h(ruleId)) continue;
          const matched = matchScenarioToNews(sc, news);
          if (!matched) continue;
          const msg = formatScenarioMessage(sc, matched);
          if (!telegramConfigured()) {
            // Mark dedup anyway so we don't busy-loop matching.
            markSent(ruleId);
            continue;
          }
          const ok = await sendTelegram(msg);
          if (ok) {
            markSent(ruleId);
            try {
              const log = loadSendLog();
              if (log[0]) {
                log[0].ruleId = ruleId;
                log[0].kind = 'armed-scenario';
                log[0].scenario = sc.title;
                localStorage.setItem(SEND_LOG_KEY, JSON.stringify(log));
              }
            } catch (_) {}
          }
        }
      } catch (_) { /* silent */ }
      finally { this._armedRunning = false; }
    },
  };

  // ---------- ARMED helpers ----------
  function loadARMEDScenarios() {
    try {
      const raw = localStorage.getItem('tr_scenarios_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed
                 : (parsed && Array.isArray(parsed.scenarios) ? parsed.scenarios : []);
      return list.filter(s => s && s.status === 'ARMED' && s.title);
    } catch (_) { return []; }
  }

  async function fetchRecentNews(windowMs) {
    try {
      if (!window.NewsFeed || typeof window.NewsFeed.fetchAll !== 'function') return [];
      const all = await window.NewsFeed.fetchAll();
      if (!Array.isArray(all)) return [];
      const cutoff = Date.now() - windowMs;
      return all.filter(item => {
        if (!item) return false;
        const t = item.publishedAt || item.published || item.timestamp || item.ts || item.date;
        const ms = typeof t === 'number' ? t : (t ? Date.parse(t) : NaN);
        if (!isFinite(ms)) return true; // keep if no timestamp — let keyword filter decide
        return ms >= cutoff;
      });
    } catch (_) { return []; }
  }

  // Lightweight keyword extraction from a scenario title — strip stop words,
  // keep tokens >= 4 chars or known proper nouns. e.g.
  // "Iran closes Strait of Hormuz" → ['iran', 'closes', 'strait', 'hormuz']
  const STOPWORDS = new Set([
    'the','a','an','of','in','on','at','to','for','and','or','vs','with','by',
    'from','is','are','be','been','that','this','it','its','as','if','then',
    'next','meeting','expected','than','plus','adds','fails','closes',
  ]);
  function scenarioKeywords(scenario) {
    const t = String(scenario.title || '').toLowerCase();
    const tokens = t.split(/[^a-z0-9+]+/).filter(Boolean);
    return tokens.filter(tok => !STOPWORDS.has(tok) && tok.length >= 4);
  }
  function matchScenarioToNews(scenario, news) {
    const kws = scenarioKeywords(scenario);
    if (!kws.length) return null;
    for (const item of news) {
      const hay = ((item.title || '') + ' ' + (item.summary || item.description || '')).toLowerCase();
      // Require at least 1 strong keyword hit. Hormuz/Taiwan/CLARITY etc. are
      // already specific enough that one match is meaningful.
      const hit = kws.find(k => hay.includes(k));
      if (hit) return { item, keyword: hit };
    }
    return null;
  }
  function formatScenarioMessage(scenario, matched) {
    const lines = [];
    lines.push(`\u{1F6A8} <b>SCENARIO TRIGGERED</b> \u00b7 <i>upgrade chip</i>`);
    lines.push('<b>' + escapeHtml(scenario.title) + '</b>');
    if (scenario.probability) {
      lines.push(`<i>probability: ${escapeHtml(scenario.probability)} \u2192 TRIGGERED</i>`);
    }
    if (matched && matched.item) {
      const it = matched.item;
      const headline = it.title || it.headline || '';
      const url = it.url || it.link || '';
      if (headline && url) {
        lines.push(`Match: <a href="${escapeAttr(url)}">${escapeHtml(headline)}</a>`);
      } else if (headline) {
        lines.push(`Match: ${escapeHtml(headline)}`);
      }
      if (matched.keyword) lines.push(`<i>keyword: ${escapeHtml(matched.keyword)}</i>`);
    }
    // Impact table
    if (Array.isArray(scenario.impacts) && scenario.impacts.length) {
      lines.push('');
      lines.push('<b>Expected impact</b>');
      for (const imp of scenario.impacts) {
        const arrow = imp.bias === 'bull' ? '\u25B2'
                    : imp.bias === 'bear' ? '\u25BC'
                    : '\u25C6';
        const asset = escapeHtml(imp.asset || '');
        const move  = escapeHtml(imp.move || '');
        const conf  = escapeHtml(imp.confidence || '');
        lines.push(`${arrow} <code>${asset}</code> ${move}${conf ? ' \u00b7 ' + conf : ''}`);
      }
    }
    lines.push('');
    lines.push('<code>' + new Date().toISOString() + '</code>');
    lines.push(`<a href="${escapeAttr(TAB_BASE_URL + '?tab=scenarios')}">Open Scenarios tab</a>`);
    return lines.join('\n');
  }

  window.TRAlertsManager = Manager;

  // ---------- global open trigger ----------
  window.openTRAlerts = function openTRAlerts() {
    try { window.dispatchEvent(new CustomEvent('tr:open-alerts')); } catch (_) {}
  };

  // ---------- React panel ----------
  function TRAlertsPanel({ open, onClose }) {
    const T = {
      ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
      edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
      text: '#ffffff', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
      signal: '#c9a227', signalSoft: 'rgba(201,162,39,0.12)',
      bull: '#6FCF8E', bear: '#D96B6B', amber: '#E8A94B',
      mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    };

    const [rules, setRules] = React.useState(Manager.getRules());
    const [runState, setRunState] = React.useState(Manager.getState());
    const [snapshot, setSnapshot] = React.useState(Manager.getLastSnapshot());
    const [testStatus, setTestStatus] = React.useState(null);
    const [perRuleTest, setPerRuleTest] = React.useState({}); // { [ruleId]: 'sending'|'ok'|'err' }
    const [newType, setNewType] = React.useState('BTC_ABOVE');
    const [newThreshold, setNewThreshold] = React.useState('');
    const [newCooldown, setNewCooldown] = React.useState(60);
    const [newNote, setNewNote] = React.useState('');
    const [tgConfigured, setTgConfigured] = React.useState(Manager.telegramConfigured());
    const [sentToday, setSentToday] = React.useState(Manager.sentTodayCount ? Manager.sentTodayCount() : 0);

    React.useEffect(() => {
      const off = Manager.onChange(() => {
        setRules(Manager.getRules());
        setRunState(Manager.getState());
        setSnapshot(Manager.getLastSnapshot());
        setTgConfigured(Manager.telegramConfigured());
        if (Manager.sentTodayCount) setSentToday(Manager.sentTodayCount());
      });
      const int = setInterval(() => {
        setTgConfigured(Manager.telegramConfigured());
        if (Manager.sentTodayCount) setSentToday(Manager.sentTodayCount());
      }, 4000);
      return () => { off(); clearInterval(int); };
    }, []);

    if (!open) return null;

    const inputStyle = {
      padding: '6px 10px', fontFamily: T.mono, fontSize: 11,
      background: T.ink000, border: `1px solid ${T.edge}`, color: T.text,
      borderRadius: 6, outline: 'none', width: '100%',
    };
    const labelStyle = {
      fontSize: 9, letterSpacing: 0.8, color: T.textDim,
      textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
    };

    function handleAdd() {
      const threshold = parseFloat(newThreshold);
      if (newType !== 'CONSENSUS_DIVERGENT' && !isFinite(threshold)) return;
      Manager.addRule({
        type: newType,
        threshold: isFinite(threshold) ? threshold : 0,
        cooldownMin: Math.max(1, Number(newCooldown) || 60),
        enabled: true,
        note: newNote || '',
      });
      setNewThreshold('');
      setNewNote('');
    }

    async function handleTest() {
      setTestStatus('sending');
      const res = await Manager.testSend();
      setTestStatus(res && res.ok ? 'ok' : 'err');
      setTimeout(() => setTestStatus(null), 3500);
    }

    async function handleTestRule(id) {
      setPerRuleTest(s => Object.assign({}, s, { [id]: 'sending' }));
      const res = await Manager.testSendRule(id);
      setPerRuleTest(s => Object.assign({}, s, { [id]: res && res.ok ? 'ok' : 'err' }));
      setTimeout(() => {
        setPerRuleTest(s => {
          const cp = Object.assign({}, s); delete cp[id]; return cp;
        });
      }, 3500);
    }

    function fmtLast(ts) {
      if (!ts) return '—';
      const d = Date.now() - ts;
      if (d < 60_000) return Math.round(d / 1000) + 's ago';
      if (d < 3_600_000) return Math.round(d / 60_000) + 'm ago';
      if (d < 86_400_000) return Math.round(d / 3_600_000) + 'h ago';
      return Math.round(d / 86_400_000) + 'd ago';
    }

    // Group rules by type.group
    const groupOrder = ['Crypto', 'Equities', 'Sentiment', 'Geopolitics', 'Flow', 'Other'];
    const grouped = {};
    for (const r of rules) {
      const g = groupForType(r.type);
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(r);
    }
    const groupKeys = groupOrder.filter(g => grouped[g] && grouped[g].length);

    // Hero banner — telegram status
    const tgBadge = tgConfigured
      ? { color: T.bull, bg: 'rgba(111,207,142,0.10)', border: 'rgba(111,207,142,0.4)',
          label: `TELEGRAM: ON \u00b7 ${sentToday} sent today` }
      : { color: T.amber, bg: 'rgba(232,169,75,0.10)', border: 'rgba(232,169,75,0.4)',
          label: 'TELEGRAM: NOT CONFIGURED \u00b7 add bot token in \u2699 Settings' };

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,12,0.8)',
        backdropFilter: 'blur(12px) saturate(150%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 120, padding: 40,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 880, maxHeight: '94%', overflow: 'auto',
          background: T.ink100, border: `1px solid ${T.edgeHi}`, borderRadius: 14,
          padding: '22px 26px', color: T.text,
          fontFamily: '"Inter Tight", system-ui, sans-serif',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textDim, textTransform: 'uppercase', fontWeight: 600 }}>
              Alert Rules
            </div>
            <div style={{
              padding: '2px 8px', fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6,
              color: Manager.isRunning() ? T.bull : T.bear,
              background: Manager.isRunning() ? 'rgba(111,207,142,0.10)' : 'rgba(217,107,107,0.10)',
              borderRadius: 4,
              border: `0.5px solid ${Manager.isRunning() ? 'rgba(111,207,142,0.4)' : 'rgba(217,107,107,0.4)'}`,
            }}>
              {Manager.isRunning() ? 'RUNNING' : 'STOPPED'}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.4 }}>
              LAST TICK · {fmtLast(Manager.getLastTickAt())}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <div onClick={handleTest} style={{
                padding: '5px 12px', fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
                background: testStatus === 'ok' ? T.bull : testStatus === 'err' ? T.bear : T.ink200,
                color: testStatus ? T.ink000 : T.textMid,
                border: `1px solid ${T.edge}`, borderRadius: 5,
                cursor: 'pointer', letterSpacing: 0.4,
              }}>
                {testStatus === 'sending' ? 'SENDING…' : testStatus === 'ok' ? 'SENT' : testStatus === 'err' ? 'FAILED' : 'TEST ALERT NOW'}
              </div>
              <div onClick={onClose} style={{
                width: 28, height: 28, borderRadius: 7,
                background: T.ink200, border: `1px solid ${T.edge}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: T.textMid, fontSize: 16,
              }}>×</div>
            </div>
          </div>

          {/* Hero card — what this does + telegram status */}
          <div style={{
            padding: '14px 18px', background: `linear-gradient(135deg, ${T.ink200}, ${T.ink300})`,
            border: `1px solid ${T.edgeHi}`, borderRadius: 10, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>
                Telegram push alerts — always watching
              </div>
              <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
                Rules fire in the background every 60s and send a Telegram message when your thresholds cross.
                Three defaults are pre-configured and ON. Add crypto, equity, macro, insider, and congress triggers below.
              </div>
            </div>
            <div
              onClick={() => {
                if (!tgConfigured) {
                  try { window.dispatchEvent(new CustomEvent('tr:open-settings')); } catch (_) {}
                }
              }}
              title={tgConfigured ? 'Telegram alerts active' : 'Click to open Settings'}
              style={{
                padding: '6px 12px', fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                color: tgBadge.color, background: tgBadge.bg, border: `1px solid ${tgBadge.border}`,
                borderRadius: 5, whiteSpace: 'nowrap',
                cursor: tgConfigured ? 'default' : 'pointer',
              }}
            >
              ● {tgBadge.label}
            </div>
          </div>

          {/* Empty state: Telegram not configured */}
          {!tgConfigured && (
            <div style={{
              padding: '16px 20px', background: T.ink200,
              border: `1px solid rgba(232,169,75,0.35)`, borderRadius: 10, marginBottom: 14,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.amber, marginBottom: 8 }}>
                Connect Telegram in 2 min
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.textMid, lineHeight: 1.7 }}>
                <li>Open Telegram, chat <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: T.signal, textDecoration: 'none' }}>@BotFather</a>, send <code style={{ color: T.text }}>/newbot</code>, copy the token.</li>
                <li>Chat <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: T.signal, textDecoration: 'none' }}>@userinfobot</a> to get your numeric chat ID.</li>
                <li>Paste both into TradeRadar Settings → Telegram and hit save.</li>
                <li>Come back here and click <b style={{ color: T.text }}>TEST ALERT NOW</b> to verify.</li>
              </ol>
            </div>
          )}

          {/* Live snapshot */}
          <div style={{
            padding: '10px 14px', background: T.ink200,
            border: `1px solid ${T.edge}`, borderRadius: 8, marginBottom: 16,
            fontFamily: T.mono, fontSize: 11, color: T.textMid, display: 'flex', gap: 18, flexWrap: 'wrap',
          }}>
            <div>BTC · <span style={{ color: T.text }}>{snapshot && snapshot.btc ? fmtUsd(snapshot.btc.price) : '—'}</span></div>
            <div>ETH · <span style={{ color: T.text }}>{snapshot && snapshot.eth ? fmtUsd(snapshot.eth.price) : '—'}</span></div>
            <div>F&amp;G · <span style={{ color: T.text }}>{snapshot && snapshot.fng ? snapshot.fng.value : '—'}</span></div>
            <div>VIX · <span style={{ color: T.text }}>{snapshot && snapshot.vix ? snapshot.vix.value.toFixed(1) : '—'}</span></div>
            <div>DXY · <span style={{ color: T.text }}>{snapshot && snapshot.dxy ? snapshot.dxy.value.toFixed(1) : '—'}</span></div>
            <div>MIL · <span style={{ color: T.text }}>{snapshot && snapshot.mil ? snapshot.mil.count : '—'}</span></div>
            <div>CONSENSUS · <span style={{ color: T.text }}>
              {snapshot && snapshot.consensus ? (snapshot.consensus.aligned ? 'aligned' : 'divergent') : '—'}
            </span></div>
          </div>

          {/* Grouped rule list */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Rules · {rules.length}</div>
            {rules.length === 0 && (
              <div style={{ color: T.textDim, fontSize: 12, padding: '12px 0' }}>No rules. Add one below.</div>
            )}
            {groupKeys.map(group => (
              <div key={group} style={{ marginBottom: 14 }}>
                <div style={{
                  fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1, color: T.signal,
                  textTransform: 'uppercase', fontWeight: 700, marginBottom: 6, paddingLeft: 2,
                }}>
                  {group} · {grouped[group].length}
                </div>
                {grouped[group].map(rule => {
                  const last = runState[rule.id];
                  const recentlyTriggered = last && (Date.now() - last) < 6 * 3_600_000;
                  const prt = perRuleTest[rule.id];
                  const meta = typeMeta(rule.type);
                  const leftBorder = rule.enabled && recentlyTriggered ? T.signal : 'transparent';
                  return (
                    <div key={rule.id} style={{
                      padding: '10px 12px', marginBottom: 6,
                      background: T.ink200,
                      border: `1px solid ${rule.enabled ? T.edgeHi : T.edge}`,
                      borderLeft: `3px solid ${leftBorder}`,
                      borderRadius: 7,
                      fontFamily: T.mono, fontSize: 11,
                      display: 'grid',
                      gridTemplateColumns: '32px 28px 1fr 110px 110px 120px 80px 60px',
                      alignItems: 'center', gap: 10,
                    }}>
                      {/* Big ON/OFF toggle */}
                      <div onClick={() => Manager.toggleRule(rule.id)} style={{
                        width: 28, height: 16, borderRadius: 8,
                        background: rule.enabled ? T.signal : T.ink000,
                        border: `1px solid ${rule.enabled ? T.signal : T.edgeHi}`,
                        cursor: 'pointer', position: 'relative',
                        transition: 'all 0.15s ease',
                      }}>
                        <div style={{
                          position: 'absolute', top: 1, left: rule.enabled ? 13 : 1,
                          width: 12, height: 12, borderRadius: '50%',
                          background: rule.enabled ? T.ink000 : T.textMid,
                          transition: 'left 0.15s ease',
                        }} />
                      </div>
                      {/* Type icon */}
                      <div style={{
                        width: 24, height: 24, borderRadius: 5,
                        background: rule.enabled ? T.signalSoft : T.ink000,
                        border: `1px solid ${T.edge}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: rule.enabled ? T.signal : T.textDim,
                        fontSize: 13, fontWeight: 700,
                      }}>{meta.icon}</div>
                      {/* Label + note */}
                      <div>
                        <div style={{ color: rule.enabled ? T.text : T.textMid, fontWeight: 600 }}>
                          {labelForType(rule.type)}
                        </div>
                        {rule.note && (
                          <div style={{ color: T.textDim, fontSize: 10, marginTop: 2, fontFamily: '"Inter Tight", sans-serif' }}>
                            {rule.note}
                          </div>
                        )}
                      </div>
                      {/* Inline threshold */}
                      <div>
                        {rule.type !== 'CONSENSUS_DIVERGENT' ? (
                          <input
                            type="number"
                            value={rule.threshold}
                            onChange={e => Manager.updateRule(rule.id, { threshold: parseFloat(e.target.value) || 0 })}
                            style={{
                              ...inputStyle, padding: '4px 8px', fontSize: 10.5,
                              color: T.signal, fontWeight: 600, textAlign: 'right',
                            }}
                          />
                        ) : (
                          <div style={{ color: T.textDim, textAlign: 'right', fontSize: 10 }}>—</div>
                        )}
                      </div>
                      {/* Cooldown */}
                      <div>
                        <input
                          type="number"
                          value={rule.cooldownMin}
                          onChange={e => Manager.updateRule(rule.id, { cooldownMin: Math.max(1, parseInt(e.target.value, 10) || 60) })}
                          style={{
                            ...inputStyle, padding: '4px 8px', fontSize: 10.5,
                            color: T.textMid, textAlign: 'right',
                          }}
                        />
                      </div>
                      {/* Last triggered */}
                      <div style={{ color: recentlyTriggered ? T.signal : T.textDim, fontSize: 10 }}>
                        last · {fmtLast(last)}
                      </div>
                      {/* Test send per rule */}
                      <div onClick={() => handleTestRule(rule.id)} style={{
                        padding: '4px 6px', fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4,
                        textAlign: 'center', cursor: 'pointer', borderRadius: 4,
                        background: prt === 'ok' ? T.bull : prt === 'err' ? T.bear : T.ink000,
                        color: prt ? T.ink000 : T.textMid,
                        border: `1px solid ${T.edge}`,
                      }}>
                        {prt === 'sending' ? '…' : prt === 'ok' ? 'SENT' : prt === 'err' ? 'ERR' : 'TEST'}
                      </div>
                      {/* Delete */}
                      <div onClick={() => Manager.deleteRule(rule.id)} style={{
                        color: T.bear, cursor: 'pointer', textAlign: 'right', fontSize: 10, fontWeight: 600,
                      }}>DELETE</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Add rule */}
          <div style={{
            padding: '14px 16px', background: T.ink200,
            border: `1px solid ${T.edge}`, borderRadius: 8,
          }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Add rule</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
              <div>
                <div style={labelStyle}>type</div>
                <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...inputStyle, height: 30 }}>
                  {groupOrder.map(g => {
                    const opts = RULE_TYPES.filter(t => t.group === g);
                    if (!opts.length) return null;
                    return (
                      <optgroup key={g} label={g}>
                        {opts.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div>
                <div style={labelStyle}>threshold</div>
                <input
                  type="number"
                  value={newThreshold}
                  onChange={e => setNewThreshold(e.target.value)}
                  placeholder={(RULE_TYPES.find(r => r.key === newType) || {}).hint || ''}
                  disabled={newType === 'CONSENSUS_DIVERGENT'}
                  style={{ ...inputStyle, opacity: newType === 'CONSENSUS_DIVERGENT' ? 0.4 : 1 }}
                />
              </div>
              <div>
                <div style={labelStyle}>cooldown (min)</div>
                <input
                  type="number"
                  value={newCooldown}
                  onChange={e => setNewCooldown(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div onClick={handleAdd} style={{
                padding: '7px 16px', fontFamily: T.mono, fontSize: 11, fontWeight: 600,
                background: T.signal, color: T.ink000, borderRadius: 6,
                cursor: 'pointer', letterSpacing: 0.5, height: 30, display: 'flex', alignItems: 'center',
              }}>ADD</div>
            </div>
            <div>
              <div style={labelStyle}>note (optional)</div>
              <input
                type="text"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="why this matters — shows in Telegram + card"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 14, fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3 }}>
            Tick every {Math.round(Manager._intervalMs / 1000)}s · Telegram requires bot token + chat ID in Settings.
          </div>
        </div>
      </div>
    );
  }
  window.TRAlertsPanel = TRAlertsPanel;
})();
