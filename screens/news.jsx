// NewsScreen — Tab 4: news organized into themed buckets,
// each with a synopsis of the narrative at that level and a running
// list of dated items underneath. Buckets scroll-selected via left rail.

const newsTokens = {
  ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24', ink400: '#1E2430',
  edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
  text: 'rgba(235,238,244,0.95)', textMid: 'rgba(180,188,200,0.75)', textDim: 'rgba(130,138,150,0.55)',
  signal: '#E8B84A',
  btc: '#F7931A', oil: '#6B8AFA', spx: '#9AA3B2',
  fed: '#6B8AFA', trump: '#B07BE6', inst: '#6FCF8E',
  sov: '#5FC9C2', whale: '#F7931A', elon: '#E8B84A',
  ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

function NewsScreen() {
  const T = newsTokens;
  const W = 1280, H = 820;

  const buckets = [
    {
      id: 'fed', label: 'Federal Reserve', c: T.fed,
      heat: 5,
      synopsis:
        'Powell has pivoted dovish. The market now prices an 82% hold at the June meeting and a 58% cut by September. Yield curve steepening. ' +
        'Dollar Index broke below 102. Risk assets (BTC, SPX) grinding up on every piece of cooling macro data.',
      metrics: [
        { label: 'FED FUNDS', v: '5.25%' },
        { label: 'HOLD · JUN', v: '82%' },
        { label: 'CUT · SEP', v: '58%' },
        { label: 'DXY',       v: '101.8' },
      ],
      items: [
        { date: 'Apr 19 · 06:15', sub: 'Powell', source: 'Bloomberg', imp: 5,
          title: 'Powell: inflation "running above trend but decelerating"',
          body: 'Economic Club of NY remarks walk back March hawkish guidance. Fed funds futures repriced 21bp dovish. 10Y -7bp, DXY -0.9%.',
          impact: { btc: +3.2, spx: +1.6, oil: +0.4 } },
        { date: 'Apr 18 · 08:30', sub: 'Data', source: 'Reuters', imp: 4,
          title: 'Retail sales +0.2% vs +0.5% expected — consumer cooling',
          body: 'March print softest since October. Yields broke lower on release. Kalshi "Sep cut" contract +4 to 58¢.',
          impact: { btc: +1.8, spx: +0.7, oil: +0.9 } },
        { date: 'Apr 16 · 14:00', sub: 'Speeches', source: 'Fed', imp: 3,
          title: 'Fed minutes: "several" members comfortable with 2 cuts in 2026',
          body: 'March meeting minutes reveal softer FOMC consensus than March SEP implied. Members cite labor-market normalization and housing deceleration.',
          impact: { btc: +1.1, spx: +0.3, oil: 0 } },
        { date: 'Apr 11 · 08:30', sub: 'Data', source: 'BLS', imp: 4,
          title: 'CPI +3.1% y/y · core +3.4% — both below consensus',
          body: 'Shelter disinflation continued; services ex-shelter moderated. Biggest single-day yield move of 2026 YTD.',
          impact: { btc: +2.9, spx: +1.1, oil: -0.2 } },
        { date: 'Apr 05 · 10:00', sub: 'Speeches', source: 'WSJ', imp: 3,
          title: 'Waller: "room to cut if inflation continues trajectory"',
          body: 'Governor Waller\'s speech at Hoover repositions from hawkish dissent to dovish centrist. Markets read this as the pivotal vote flip.',
          impact: { btc: +1.4, spx: +0.5, oil: 0 } },
      ],
    },
    {
      id: 'clarity', label: 'CLARITY Act · Gov BTC',
      c: T.trump, heat: 5, pulse: true,
      synopsis:
        'CLARITY Act passes Senate in early May (expected). Treasury confirms a framework for a Strategic Bitcoin Reserve funded from ' +
        'seized crypto + new authorized purchases. Trump family and political allies front-run the announcement; the administration has ' +
        'publicly floated "up to 1M BTC" as a 5-year target — structurally bullish.',
      metrics: [
        { label: 'SENATE VOTE',      v: 'APR 24' },
        { label: 'CLARITY ODDS',     v: '94%' },
        { label: 'SBR · TARGET',     v: '1.0M BTC' },
        { label: 'SBR · HELD',       v: '212K' },
      ],
      items: [
        { date: 'Apr 18 · 16:22', sub: 'Legislation', source: 'FT', imp: 5,
          title: 'CLARITY Act heads to Senate floor · vote by April 24',
          body: 'House passed 314-121 in March. Senate cloture filed. Majority leader "confident of bipartisan passage." Polymarket odds +8 to 94%.',
          impact: { btc: +4.2, spx: +0.4, oil: 0 } },
        { date: 'Apr 17 · 11:05', sub: 'Strategic Reserve', source: 'Treasury', imp: 5,
          title: 'Treasury outlines Strategic Bitcoin Reserve framework',
          body: 'Initial 212K BTC from DOJ-seized holdings transfers to dedicated custody. Framework authorizes up to $21B in FY27 purchases pending congressional funding.',
          impact: { btc: +5.8, spx: +0.2, oil: 0 } },
        { date: 'Apr 14 · 09:30', sub: 'Political', source: 'CNBC', imp: 4,
          title: 'Trump: "America will be the crypto capital" · Mar-a-Lago summit',
          body: 'Administration-hosted event with 30+ crypto industry leaders. Confirms pro-crypto EO framework will precede CLARITY passage.',
          impact: { btc: +2.6, spx: +0.3, oil: 0 } },
        { date: 'Apr 09 · 14:00', sub: 'Political', source: 'WLF', imp: 4,
          title: 'World Liberty Financial discloses 4,200 BTC position',
          body: 'Filing shows Trump-affiliated vehicle accumulated through Q1. Average cost $89,400. Signals continued political-institutional demand overlay.',
          impact: { btc: +1.9, spx: 0, oil: 0 } },
        { date: 'Apr 02 · 18:45', sub: 'Amendments', source: 'Axios', imp: 3,
          title: 'Vance proposes tax-free crypto swap provision in CLARITY',
          body: 'Senate amendment would extend §1031-like treatment to crypto-to-crypto swaps. Industry lobbyists call it "the unlock."',
          impact: { btc: +1.4, spx: 0, oil: 0 } },
        { date: 'Mar 28 · 12:00', sub: 'Legislation', source: 'Reuters', imp: 5,
          title: 'CLARITY Act clears House 314-121',
          body: 'Biggest bipartisan crypto vote in US history. 68 Democrats cross over. Bill now moves to Senate committee.',
          impact: { btc: +3.8, spx: +0.2, oil: 0 } },
      ],
    },
    {
      id: 'inst', label: 'Institutional Buy-In', c: T.inst,
      heat: 4,
      synopsis:
        'Spot Bitcoin ETFs have logged 14 consecutive days of net inflows. IBIT alone has added $8.2B AUM in April. ' +
        'MicroStrategy (Strategy Inc) purchases continue — 3,459 BTC added at ~$94k. Treasury allocations among public companies broadening beyond MSTR: ' +
        'Block, Semler Scientific, and Metaplanet all added in Q1. The flow is persistent and price-insensitive.',
      metrics: [
        { label: 'ETF · 7D NET', v: '+$4.8B' },
        { label: 'IBIT AUM',     v: '$82.1B' },
        { label: 'MSTR BTC',     v: '622K' },
        { label: 'CORP HOLD',    v: '742K' },
      ],
      items: [
        { date: 'Apr 18 · 23:08', sub: 'ETF Flows', source: 'CoinDesk', imp: 4,
          title: 'IBIT +$612M · FBTC +$188M — weekly crosses $2.1B',
          body: '14th consecutive day of net spot-ETF inflows. Aggregate AUM across 11 funds now $128.4B. Creation baskets running 2.3× trailing average.',
          impact: { btc: +2.1, spx: +0.2, oil: 0 } },
        { date: 'Apr 18 · 11:02', sub: 'Corporate Treasuries', source: 'Reuters', imp: 3,
          title: 'Strategy Inc adds 3,459 BTC at $94,112 · treasury 622K',
          body: 'Funded via $420M convertible note at 0%. Largest single purchase of 2026. MSTR +3.1% on announcement.',
          impact: { btc: +1.4, spx: +0.1, oil: 0 } },
        { date: 'Apr 15 · 16:40', sub: 'ETF Flows', source: 'BlackRock', imp: 3,
          title: 'IBIT ETF crosses 700K BTC under management',
          body: 'BlackRock\'s flagship Bitcoin ETF becomes the 3rd-largest holder of BTC behind Satoshi and Binance cold wallets.',
          impact: { btc: +1.8, spx: +0.1, oil: 0 } },
        { date: 'Apr 11 · 08:00', sub: 'Corporate Treasuries', source: 'Metaplanet', imp: 3,
          title: 'Metaplanet adds 1,241 BTC · Japanese treasury now 15,400',
          body: 'Tokyo-listed Metaplanet continues aggressive accumulation. Third-largest Asia-domiciled BTC treasury.',
          impact: { btc: +0.8, spx: 0, oil: 0 } },
        { date: 'Apr 08 · 09:00', sub: 'Corporate Treasuries', source: 'Semler Sci', imp: 2,
          title: 'Semler Scientific tops up treasury: +208 BTC',
          body: 'NASDAQ:SMLR now holds 3,818 BTC representing ~$360M. Company cites "inflation hedge" in SEC filing.',
          impact: { btc: +0.3, spx: 0, oil: 0 } },
      ],
    },
    {
      id: 'sov', label: 'Sovereign · Country Purchases', c: T.sov,
      heat: 4, pulse: true,
      synopsis:
        'El Salvador continues programmatic daily DCA (1 BTC/day, approaching 6,500 total). Bhutan disclosed a surprise 13K BTC mining treasury. ' +
        'UAE sovereign fund reportedly allocating 1% (~$12B) via Fidelity structured product. Russia and Iran exploring reserves via oil-for-BTC settlement. ' +
        'Sovereign demand is the least price-sensitive bid in the market.',
      metrics: [
        { label: 'SALVADOR',   v: '6,480 BTC' },
        { label: 'BHUTAN',     v: '13,029 BTC' },
        { label: 'UAE · EST',  v: '~$12B' },
        { label: 'SOVG · TOT', v: '~$58B' },
      ],
      items: [
        { date: 'Apr 17 · 09:00', sub: 'UAE / Gulf', source: 'Bloomberg', imp: 5,
          title: 'UAE sovereign fund finalizes 1% BTC allocation · ~$12B',
          body: 'Mubadala-linked vehicle using Fidelity structured product for custody. First G20-adjacent sovereign with explicit BTC reserve target.',
          impact: { btc: +4.8, spx: +0.2, oil: 0 } },
        { date: 'Apr 14 · 14:30', sub: 'Bhutan', source: 'Arkham', imp: 4,
          title: 'Bhutan treasury wallet surfaces · 13,029 BTC (~$1.2B)',
          body: 'On-chain forensics identifies hydroelectric-mined reserves accumulated since 2019. Royal government confirms holdings, says "strategic."',
          impact: { btc: +2.1, spx: 0, oil: 0 } },
        { date: 'Apr 12 · 10:00', sub: 'El Salvador', source: 'El Salvador', imp: 2,
          title: 'El Salvador · 1 BTC added · total 6,480',
          body: 'Bukele posts daily purchase receipt. Program unchanged since Nov 2022. Average cost basis now ~$42k.',
          impact: { btc: +0.1, spx: 0, oil: 0 } },
        { date: 'Apr 08 · 20:00', sub: 'Sanctioned States', source: 'Reuters', imp: 3,
          title: 'Russia-Iran oil settlement framework includes BTC leg',
          body: '15% of bilateral trade to settle via mutual crypto escrow. Workaround for USD sanctions regime. Volumes initially modest but structural.',
          impact: { btc: +1.6, spx: 0, oil: +1.1 } },
        { date: 'Mar 31 · 11:00', sub: 'Asia', source: 'Nikkei', imp: 3,
          title: 'Japan LDP study group recommends 2% BTC in GPIF',
          body: 'Non-binding study; would imply ~$30B if fully implemented. GPIF chief non-committal but acknowledges reviewing.',
          impact: { btc: +2.2, spx: +0.1, oil: 0 } },
      ],
    },
    {
      id: 'whales', label: 'Whales · On-Chain', c: T.whale,
      heat: 3,
      synopsis:
        'Whale accumulation (wallets 1K-10K BTC) at 2-year highs — +58K BTC absorbed since Jan. Dormant coins (5Y+) have not moved: supply is thinning. ' +
        'Exchange balances continue to decline — Coinbase -22K BTC MTD. Long-term holders continue to take coins off-market during this accumulation phase.',
      metrics: [
        { label: 'WHALES · 7D',  v: '+14,200' },
        { label: 'EXCH BAL',     v: '2.18M' },
        { label: 'CB · MTD',     v: '-22K' },
        { label: 'LTH SUPPLY',   v: '76.4%' },
      ],
      items: [
        { date: 'Apr 19 · 02:14', sub: 'Exchange Flows', source: 'Whale Alert', imp: 4,
          title: 'Unknown wallet moves 6,200 BTC off Coinbase Custody',
          body: 'Single transaction ~$590M to a newly-created cold storage address. No associated selling on-chain in past 24h.',
          impact: { btc: +1.2, spx: 0, oil: 0 } },
        { date: 'Apr 16 · 19:30', sub: 'Long-Term Holders', source: 'Glassnode', imp: 3,
          title: 'Long-term holder supply hits ATH · 76.4% of circulating',
          body: 'Coins dormant 155+ days continue to grow despite rising price. Historically a mid-cycle accumulation signature.',
          impact: { btc: +0.8, spx: 0, oil: 0 } },
        { date: 'Apr 13 · 10:40', sub: 'Exchange Flows', source: 'CryptoQuant', imp: 3,
          title: 'Exchange reserve drops below 2.2M BTC for first time since 2017',
          body: 'Aggregate balance across 20+ major venues at 7-year low. Supply available for immediate sale continues to decline.',
          impact: { btc: +1.4, spx: 0, oil: 0 } },
        { date: 'Apr 10 · 22:00', sub: 'Long-Term Holders', source: 'Arkham', imp: 3,
          title: 'Satoshi-era wallet (2010) moves 50 BTC for first time',
          body: 'Coins mined by solo miner in Block 80,421 transferred to Binance. Sparked 3-min sell-off before reversing. No further movement since.',
          impact: { btc: -0.4, spx: 0, oil: 0 } },
        { date: 'Apr 04 · 08:00', sub: 'Accumulation', source: 'Glassnode', imp: 2,
          title: 'Whale cohort (1K-10K BTC) adds 58K coins YTD',
          body: 'Accumulation rate at 2-year high. Cohort had been net distributing through most of 2025.',
          impact: { btc: +0.6, spx: 0, oil: 0 } },
      ],
    },
    {
      id: 'china', label: 'China', c: T.china,
      heat: 4,
      synopsis:
        'Beijing running parallel tracks: domestic stimulus to offset property drag, and escalating tech-sanction retaliation vs. the US. ' +
        'CNY weakening against the dollar pressures offshore BTC bids. Taiwan Strait incidents tick up quarterly. Rare-earth export controls on gallium and germanium ' +
        'continue to squeeze US semi supply chains. Net read-through: negative for SPX tech, positive for BTC (capital flight + debasement), neutral for oil.',
      metrics: [
        { label: 'USD/CNY',      v: '7.28' },
        { label: 'PMI · MAR',    v: '50.8' },
        { label: 'STIMULUS',     v: '¥4.2T' },
        { label: 'TW STRAIT',    v: '3 INC.' },
      ],
      items: [
        { date: 'Apr 18 · 19:34', sub: 'Tariffs', source: 'WSJ', imp: 4,
          title: 'Draft EO: 25% tariff on Chinese EV batteries · eff. May 1',
          body: 'Circulated to USTR and Commerce. Auto sector -2.8% AH. Beijing already signaling retaliation via rare-earth tightening.',
          impact: { btc: -0.6, spx: -1.8, oil: -0.3 } },
        { date: 'Apr 15 · 08:00', sub: 'PBoC', source: 'PBoC', imp: 4,
          title: 'PBoC cuts RRR 50bp · ¥1.2T liquidity injection',
          body: 'Fifth easing move in six months. Property-sector backstop continues. CNY weakened 0.4% on the print.',
          impact: { btc: +1.6, spx: +0.4, oil: +0.8 } },
        { date: 'Apr 09 · 14:20', sub: 'Tech Sanctions', source: 'Reuters', imp: 3,
          title: 'China expands gallium export controls to non-allied nations',
          body: 'Adds 14 countries. Targeted at US semi supply chain. Gallium prices +18% in a week.',
          impact: { btc: +0.8, spx: -1.1, oil: 0 } },
        { date: 'Apr 02 · 03:00', sub: 'Taiwan', source: 'TW MoD', imp: 3,
          title: '12 PLAN aircraft cross median line · largest incursion of 2026',
          body: 'Routine pattern continues. No live-fire. Taiwan scrambles F-16V. Regional risk premium ticks up.',
          impact: { btc: -0.3, spx: -0.5, oil: +0.2 } },
        { date: 'Mar 28 · 10:00', sub: 'Taiwan', source: 'Bloomberg', imp: 3,
          title: 'Xi-Biden call · "constructive" on fentanyl, strained on Taiwan',
          body: 'First leader-level call since November. Agreement to resume mil-mil hotline. Taiwan language unchanged.',
          impact: { btc: +0.5, spx: +0.6, oil: 0 } },
      ],
    },
    {
      id: 'israel', label: 'Israel', c: T.israel,
      heat: 3,
      synopsis:
        'Hezbollah ceasefire holds for 47th consecutive day. Netanyahu coalition under pressure domestically but foreign-policy posture has softened. ' +
        'Gaza reconstruction bill stalled in Knesset. The region\'s risk premium has compressed materially over Q1 — a tail-risk absent, but a resumption of ' +
        'hostilities remains the fastest path to a disorderly oil spike.',
      metrics: [
        { label: 'CEASEFIRE',    v: 'DAY 47' },
        { label: 'TEL AVIV 35',  v: '+2.1% MTD' },
        { label: 'HOUTHI · RED', v: '3 INC.' },
        { label: 'RISK · IDX',   v: 'LOW' },
      ],
      items: [
        { date: 'Apr 17 · 22:14', sub: 'Ceasefire', source: 'NYT', imp: 2,
          title: 'Israel-Hezbollah ceasefire holds for 47th day',
          body: 'No major incidents since March 2. Regional tension indices continue to ease. Brent premium fully unwound.',
          impact: { btc: 0, spx: +0.2, oil: -0.4 } },
        { date: 'Apr 14 · 09:10', sub: 'Coalition', source: 'Reuters', imp: 3,
          title: 'Netanyahu survives no-confidence vote 61-59',
          body: 'Far-right flank rebelled over Gaza reconstruction framework; opposition fell just short. Coalition intact but fragile.',
          impact: { btc: 0, spx: -0.1, oil: +0.3 } },
        { date: 'Apr 06 · 11:40', sub: 'Gaza', source: 'Haaretz', imp: 3,
          title: 'Gaza reconstruction bill: $18B UAE/Qatar pledge finalized',
          body: 'Tripartite framework with US guarantees advances. Marks the first tangible funding since war end.',
          impact: { btc: 0, spx: +0.3, oil: -0.2 } },
        { date: 'Mar 28 · 18:00', sub: 'Red Sea / Houthi', source: 'AP', imp: 3,
          title: 'Houthi drone strikes damage tanker in Red Sea · no casualties',
          body: 'Marshall Islands-flagged vessel hit near Bab el-Mandeb. Brent +1.6% on the session. Shipping rerouted around Cape.',
          impact: { btc: -0.3, spx: -0.4, oil: +1.8 } },
      ],
    },
    {
      id: 'iran', label: 'Iran', c: T.iran,
      heat: 5, pulse: true,
      synopsis:
        'Single biggest geopolitical swing factor on the board. JCPOA-2 deadline is April 27; failure could trigger a return to snap-back sanctions. ' +
        'IRGC has resumed harassment of Strait of Hormuz traffic (tanker seizure Apr 19). 20% of global seaborne crude transits the strait. ' +
        'A credible closure threat is an 8-15% oil spike catalyst; actual disruption is 25-40%. Read-through: oil strongly positive, SPX negative, ' +
        'BTC negative initially (risk-off), then positive on debasement horizon.',
      metrics: [
        { label: 'JCPOA · DDL',  v: 'APR 27' },
        { label: 'BRENT · SPOT', v: '$87.4' },
        { label: 'HORMUZ · 21%', v: '21 MBD' },
        { label: 'WAR RISK',     v: 'ELEV.' },
      ],
      items: [
        { date: 'Apr 19 · 07:42', sub: 'Strait of Hormuz', source: 'Reuters', imp: 5,
          title: 'Iran seizes tanker near Strait of Hormuz · Brent +4.2%',
          body: 'IRGC boarded Marshall Islands-flagged vessel overnight. Traffic halted 3 hours. White House "monitoring closely." First major incident since 2024.',
          impact: { btc: -0.8, spx: -1.1, oil: +5.4 } },
        { date: 'Apr 16 · 14:00', sub: 'JCPOA', source: 'FT', imp: 4,
          title: 'JCPOA-2 talks stall · Tehran demands snap-back removal',
          body: 'E3+US position unchanged. Iranian FM Araghchi signals walkout possible before April 27 deadline.',
          impact: { btc: -0.4, spx: -0.6, oil: +2.1 } },
        { date: 'Apr 12 · 21:30', sub: 'Nuclear / IAEA', source: 'IAEA', imp: 5,
          title: 'IAEA: Iran enriched stockpile at 60% hits 142kg · 3× threshold',
          body: 'Latest verification report. Bomb-breakout time now weeks, not months. Israel likely briefed on contingencies.',
          impact: { btc: -0.6, spx: -0.8, oil: +2.6 } },
        { date: 'Apr 04 · 10:00', sub: 'JCPOA', source: 'WSJ', imp: 4,
          title: 'Trump: "maximum pressure returns on day 1 if no deal"',
          body: 'Remarks at AIPAC conference. Sanctions snapback explicitly on the table. Iran central bank freezes all USD transfers defensively.',
          impact: { btc: -0.3, spx: -0.5, oil: +1.8 } },
        { date: 'Mar 22 · 13:00', sub: 'IRGC / Military', source: 'Al Jazeera', imp: 3,
          title: 'Iran announces joint naval exercise with Russia in Persian Gulf',
          body: '5-day drill "Maritime Security Belt 2026." Signaling only; no live ordnance against shipping lanes.',
          impact: { btc: -0.2, spx: -0.3, oil: +1.2 } },
      ],
    },
    {
      id: 'trumps', label: 'The Trumps', c: T.geoOther,
      heat: 4,
      synopsis:
        'Beyond BTC and China: broader tariff agenda (Mexico/USMCA under review), FTC leadership turnover, DOJ antitrust pullback, ' +
        'and continued public pressure on Powell. Policy variance remains elevated. Each new EO or truth-social post continues to move cross-asset ' +
        'risk meaningfully within the first hour — option-implied vol around administration hours is ~1.4× overnight.',
      metrics: [
        { label: 'EOs · YTD',    v: '68' },
        { label: 'POWELL ATKS',  v: '11 MTD' },
        { label: 'USMCA · DDL',  v: 'JUL 01' },
        { label: 'POLICY VOL',   v: '1.4×' },
      ],
      items: [
        { date: 'Apr 17 · 15:30', sub: 'Tariffs', source: 'CNBC', imp: 2,
          title: 'Commerce picks USMCA negotiator · no tariff escalation expected',
          body: 'Mexican peso +0.6%. USMCA Article 34.7 review begins July 1. Market reads as lowered tail risk.',
          impact: { btc: 0, spx: +0.3, oil: 0 } },
        { date: 'Apr 11 · 22:30', sub: 'Powell Attacks', source: 'Truth', imp: 3,
          title: 'Trump: "Powell is always late" · 4th attack this week',
          body: 'Post-retail-sales commentary. Market ignored; Powell independence priced in. But cumulative pressure raising 2027 appointment uncertainty.',
          impact: { btc: +0.4, spx: -0.2, oil: 0 } },
        { date: 'Apr 08 · 11:00', sub: 'DOJ / FTC', source: 'WSJ', imp: 4,
          title: 'DOJ drops antitrust case vs. Meta · signals broader pullback',
          body: 'Surprise settlement-at-zero. Big-tech rallied 3-5%. Signals lighter-touch antitrust posture through at least midterm.',
          impact: { btc: +0.2, spx: +1.4, oil: 0 } },
        { date: 'Apr 02 · 09:00', sub: 'Tariffs', source: 'WH', imp: 4,
          title: 'EO: 10% universal baseline tariff reaffirmed through 2028',
          body: 'Makes durable what had been temporary. Removes one source of uncertainty. Dollar -0.4% as tariff-as-sticky-inflation thesis cools.',
          impact: { btc: +0.8, spx: -0.3, oil: 0 } },
        { date: 'Mar 30 · 14:00', sub: 'DOJ / FTC', source: 'Reuters', imp: 3,
          title: 'FTC chair resigns · Trump names pro-merger successor',
          body: 'M&A bankers anticipate biggest activity wave since 2021. Deal flow chatter in health-care and media.',
          impact: { btc: 0, spx: +0.5, oil: 0 } },
      ],
    },
    {
      id: 'elon', label: 'Elon Musk · Tesla / X', c: T.elon,
      heat: 3,
      synopsis:
        'Elon has gone quiet on BTC since early 2024, but Tesla still holds ~9,720 BTC on balance sheet and has not sold since Q2 2022. ' +
        'X payments integration expected H2 2026; BTC is the default settlement rail in the roadmap. Historical posts have moved BTC ±5-12% in minutes; ' +
        'a return to active commentary would be a catalyst on its own.',
      metrics: [
        { label: 'TSLA · BTC',   v: '9,720' },
        { label: 'X PAYMENTS',   v: 'H2 26' },
        { label: '@ELON · 30D',  v: '0 BTC posts' },
        { label: 'MAX MOVE',     v: '+19% · 2021' },
      ],
      items: [
        { date: 'Apr 11 · 03:20', sub: 'Posts', source: 'X', imp: 3,
          title: '@elonmusk quote-posts "₿" emoji at 3am ET',
          body: 'No additional text. BTC +2.1% in the 10 minutes following. First on-platform BTC reference since Nov 2024.',
          impact: { btc: +2.1, spx: 0, oil: 0 } },
        { date: 'Apr 03 · 10:00', sub: 'Tesla BTC', source: 'Tesla 10-Q', imp: 2,
          title: 'Tesla Q1 · BTC holdings unchanged at 9,720',
          body: 'No sales, no purchases for the 8th consecutive quarter. Carrying value $782M vs market $921M.',
          impact: { btc: +0.2, spx: 0, oil: 0 } },
        { date: 'Mar 24 · 15:00', sub: 'X Payments', source: 'Bloomberg', imp: 3,
          title: 'X Payments rollout: BTC listed as "Tier 1" settlement asset',
          body: 'Internal roadmap document surfaces. Payments feature targets H2 2026 launch. BTC on equal footing with USDC.',
          impact: { btc: +1.8, spx: +0.3, oil: 0 } },
        { date: 'Feb 14 · 12:00', sub: 'Public Remarks', source: 'CNBC', imp: 2,
          title: 'Musk at Stanford: "holding BTC is still rational"',
          body: 'Fireside chat; brief comment during Q&A. First public BTC endorsement since 2024. Market impact muted as comment was expected.',
          impact: { btc: +0.6, spx: 0, oil: 0 } },
      ],
    },
  ];

  const activeBucket = buckets[1]; // CLARITY / Gov BTC selected by default

  const ImportanceDots = ({ n }) => (
    <div style={{ display: 'flex', gap: 2 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: 2,
          background: i < n ? T.signal : 'rgba(255,255,255,0.10)',
        }} />
      ))}
    </div>
  );

  const ImpactCell = ({ label, val, c }) => {
    const sign = val > 0 ? '+' : '';
    const strong = Math.abs(val) > 2;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '2px 7px', borderRadius: 4,
        background: strong ? `${c}18` : 'rgba(255,255,255,0.03)',
        border: `0.5px solid ${strong ? c + '55' : T.edge}`,
      }}>
        <div style={{ width: 4, height: 4, borderRadius: 2, background: c }} />
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 0.5, color: T.textMid }}>{label}</div>
        <div style={{
          fontFamily: T.mono, fontSize: 10.5, fontWeight: 500,
          color: val === 0 ? T.textDim : c, minWidth: 30, textAlign: 'right',
        }}>{val === 0 ? '—' : `${sign}${val.toFixed(1)}%`}</div>
      </div>
    );
  };

  return (
    <div style={{
      width: W, height: H, background: T.ink000, color: T.text,
      fontFamily: T.ui, position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${T.edge}`,
        background: T.ink100,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(180deg, #1A2030 0%, #0B0E13 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: T.signal, fontFamily: T.mono,
          boxShadow: `inset 0 0.5px 0 rgba(255,255,255,0.08)`,
        }}>TR</div>
        <div style={{ marginLeft: 12, fontSize: 13, fontWeight: 500 }}>TradeRadar</div>

        <div style={{
          marginLeft: 32, display: 'flex', padding: 3,
          background: T.ink200, borderRadius: 10, border: `1px solid ${T.edge}`,
          height: 34, alignItems: 'center',
        }}>
          {['Historical', 'Projected', 'Impact', 'News', 'Calendar', 'Signals'].map((t, idx) => {
            const active = idx === 3;
            return (
              <div key={t} style={{
                padding: '0 13px', height: 28, display: 'flex', alignItems: 'center',
                fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                background: active ? T.ink400 : 'transparent',
                color: active ? T.text : T.textMid,
                boxShadow: active ? `inset 0 0.5px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)` : 'none',
              }}>{t}</div>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, letterSpacing: 0.4 }}>
            <span style={{ color: T.signal }}>●</span>&nbsp; LIVE · 07:54 ET
          </div>
        </div>
      </div>

      {/* Body: bucket rail + stream */}
      <div style={{ display: 'flex', height: H - 52 }}>

        {/* LEFT — bucket rail */}
        <div style={{
          width: 240, background: T.ink100, borderRight: `1px solid ${T.edge}`,
          padding: '18px 14px 14px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1, color: T.textDim,
            textTransform: 'uppercase', fontWeight: 500, padding: '0 8px 10px',
          }}>Narratives</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {buckets.map(b => {
              const active = b === activeBucket;
              return (
                <div key={b.id} style={{
                  padding: '10px 12px',
                  background: active ? T.ink300 : 'transparent',
                  border: `1px solid ${active ? T.edgeHi : 'transparent'}`,
                  borderRadius: 8,
                  boxShadow: active ? 'inset 0 0.5px 0 rgba(255,255,255,0.08)' : 'none',
                  position: 'relative',
                }}>
                  {active && (
                    <div style={{
                      position: 'absolute', left: -14, top: 14, bottom: 14, width: 2,
                      background: T.signal, borderRadius: 1,
                    }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: b.c }} />
                    <div style={{
                      fontSize: 12, fontWeight: 500,
                      color: active ? T.text : T.textMid, letterSpacing: 0.05,
                    }}>{b.label}</div>
                    {b.pulse && (
                      <div style={{
                        width: 5, height: 5, borderRadius: 2.5, background: T.signal,
                        boxShadow: `0 0 4px ${T.signal}`, marginLeft: 'auto',
                      }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 14 }}>
                    <ImportanceDots n={b.heat} />
                    <div style={{
                      fontFamily: T.mono, fontSize: 9.5, color: T.textDim,
                      letterSpacing: 0.3,
                    }}>
                      {b.items.length} ITEMS
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* bottom — sort toggle */}
          <div style={{
            marginTop: 'auto', padding: '10px 8px 0',
            borderTop: `1px solid ${T.edge}`,
          }}>
            <div style={{
              fontSize: 9, letterSpacing: 1, color: T.textDim,
              textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
            }}>Sort within bucket</div>
            <div style={{
              display: 'flex', padding: 3, background: T.ink200,
              border: `1px solid ${T.edge}`, borderRadius: 8, height: 26,
            }}>
              {[
                { label: 'Newest', active: true },
                { label: 'Impact', active: false },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, height: 20, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 10.5, fontWeight: 500,
                  color: s.active ? T.ink000 : T.textMid,
                  background: s.active ? T.signal : 'transparent',
                  borderRadius: 5, letterSpacing: 0.2,
                }}>{s.label}</div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — stream: synopsis + running list */}
        <div style={{
          flex: 1, background: T.ink000, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Synopsis header */}
          <div style={{
            padding: '20px 28px 18px', borderBottom: `1px solid ${T.edge}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: activeBucket.c }} />
              <div style={{
                fontSize: 10, letterSpacing: 1, color: T.textDim,
                textTransform: 'uppercase', fontWeight: 500,
              }}>Narrative</div>
              <div style={{ marginLeft: 4 }}>
                <ImportanceDots n={activeBucket.heat} />
              </div>
              {activeBucket.pulse && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '2px 8px 2px 6px', marginLeft: 6,
                  background: 'rgba(232,184,74,0.12)',
                  border: `0.5px solid rgba(232,184,74,0.4)`,
                  borderRadius: 4,
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: 2.5, background: T.signal,
                    boxShadow: `0 0 5px ${T.signal}`,
                  }} />
                  <div style={{
                    fontSize: 9, fontWeight: 600, color: T.signal, letterSpacing: 0.6,
                  }}>HOT · CATALYST PENDING</div>
                </div>
              )}
            </div>

            <div style={{
              fontSize: 22, fontWeight: 500, color: T.text,
              letterSpacing: -0.3, marginBottom: 10,
            }}>{activeBucket.label}</div>

            <div style={{
              fontSize: 13.5, lineHeight: 1.55, color: T.textMid,
              letterSpacing: 0.01, maxWidth: 840, marginBottom: 14,
            }}>{activeBucket.synopsis}</div>

            {/* Metrics strip */}
            <div style={{
              display: 'flex', gap: 0,
              background: T.ink100, border: `1px solid ${T.edge}`,
              borderRadius: 10, padding: '10px 0',
            }}>
              {activeBucket.metrics.map((m, idx) => (
                <div key={idx} style={{
                  flex: 1, paddingLeft: idx === 0 ? 18 : 18,
                  borderLeft: idx === 0 ? 'none' : `1px solid ${T.edge}`,
                }}>
                  <div style={{
                    fontSize: 9, letterSpacing: 0.8, color: T.textDim,
                    textTransform: 'uppercase', fontWeight: 500, marginBottom: 4,
                  }}>{m.label}</div>
                  <div style={{
                    fontFamily: T.mono, fontSize: 16, fontWeight: 500,
                    color: T.text, letterSpacing: -0.2, lineHeight: 1,
                  }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Running list */}
          <div style={{
            flex: 1, overflow: 'hidden', padding: '4px 28px 12px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '14px 0 10px', gap: 10,
            }}>
              <div style={{
                fontSize: 10, letterSpacing: 1, color: T.textDim,
                textTransform: 'uppercase', fontWeight: 500,
              }}>Running List · {activeBucket.items.length} Dated Items</div>
              <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 0.4 }}>
                LATEST → OLDEST
              </div>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column',
            }}>
              {(() => {
                const groups = {};
                const order = [];
                activeBucket.items.forEach(it => {
                  const k = it.sub || 'Other';
                  if (!groups[k]) { groups[k] = []; order.push(k); }
                  groups[k].push(it);
                });
                const rows = [];
                order.forEach((sub, gi) => {
                  rows.push(
                    <div key={`h-${sub}`} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: gi === 0 ? '4px 0 8px' : '18px 0 8px',
                      borderBottom: `0.5px solid ${T.edge}`, marginBottom: 2,
                    }} title={`${groups[sub].length} items in ${sub}`}>
                      <div style={{ width: 10, height: 1, background: activeBucket.c, opacity: 0.6 }} />
                      <div style={{ fontSize: 9.5, letterSpacing: 1.2, color: activeBucket.c, textTransform: 'uppercase', fontWeight: 600 }}>{sub}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 0.4 }}>· {groups[sub].length}</div>
                    </div>
                  );
                  groups[sub].forEach((it, idx) => rows.push(
                    <div key={`i-${sub}-${idx}`} style={{
                      display: 'grid',
                      gridTemplateColumns: '18px 110px 1fr 280px',
                      gap: 14, padding: '12px 0',
                      borderBottom: `1px solid ${T.edge}`,
                      position: 'relative',
                    }} title={`${it.sub} · ${it.source} · importance ${it.imp}/5`}>
                  {/* Timeline dot + line */}
                  <div style={{
                    position: 'relative', display: 'flex', justifyContent: 'center',
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0, width: 1,
                      background: T.edge, left: '50%', transform: 'translateX(-50%)',
                    }} />
                    <div style={{
                      width: 9, height: 9, borderRadius: 5, marginTop: 4,
                      background: T.ink000, border: `1.5px solid ${activeBucket.c}`,
                      zIndex: 1,
                    }} />
                  </div>

                  {/* Date + source */}
                  <div style={{ paddingTop: 2 }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: 11, color: T.text,
                      fontWeight: 500, letterSpacing: 0.2, marginBottom: 3,
                    }}>{it.date.split(' · ')[0]}</div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3,
                    }}>{it.date.split(' · ')[1]} ET</div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.3,
                      marginTop: 4,
                    }}>{it.source.toUpperCase()}</div>
                  </div>

                  {/* Body */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                    }}>
                      <ImportanceDots n={it.imp} />
                    </div>
                    <div style={{
                      fontSize: 13.5, fontWeight: 500, color: T.text,
                      letterSpacing: -0.05, lineHeight: 1.3, marginBottom: 4,
                    }}>{it.title}</div>
                    <div style={{
                      fontSize: 11.5, color: T.textMid, lineHeight: 1.5, letterSpacing: 0.01,
                    }}>{it.body}</div>
                  </div>

                  {/* Impact column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                    <div style={{
                      fontSize: 8.5, letterSpacing: 0.8, color: T.textDim,
                      textTransform: 'uppercase', fontWeight: 500, marginBottom: 2,
                    }}>5D IMPACT</div>
                    <ImpactCell label="BTC" val={it.impact.btc} c={T.btc} />
                    <ImpactCell label="SPX" val={it.impact.spx} c={T.spx} />
                    <ImpactCell label="OIL" val={it.impact.oil} c={T.oil} />
                  </div>
                </div>
                  ));
                });
                return rows;
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.NewsScreen = NewsScreen;
