# TradeRadar scripts

## daily-briefing.js — Morning + Evening Briefs (7-section HTML, dual mode)

Emails a structured digest to `jjshay@gmail.com` every weekday in **two runs**:

| Run | Time (PT) | `BRIEF_MODE` | Flavor |
|-----|-----------|-------------|--------|
| Morning brief   | 06:00       | `morning` (default) | Prep for open — overnight catalysts, forward-looking "Today's Play" |
| Close brief     | 13:45       | `evening`           | Session recap — "Today's Verdict", morning-to-now deltas |

Morning is the default if `BRIEF_MODE` is unset (backward-compatible).

## Dual Schedule

- **06:00 PT · morning brief** — runs before US pre-market; overnight catalysts,
  4-way LLM year-end consensus, forward-looking TL;DR. Persists consensus +
  driver state to the shared cache so the afternoon run can compute deltas.
- **13:45 PT · close brief** — runs 45 minutes after the 16:00 ET equities
  close. Reads the morning cache and renders session deltas (YE shift,
  driver flips, regime score open → close), plus position-level day P&L and
  after-hours watch items.

### Install BOTH agents

```bash
# Morning (prep for open, 06:00 PT Mon-Fri)
cp scripts/com.traderadar.briefing.plist.example \
   ~/Library/LaunchAgents/com.traderadar.briefing.plist

# Evening (close recap, 13:45 PT Mon-Fri)
cp scripts/com.traderadar.closebrief.plist.example \
   ~/Library/LaunchAgents/com.traderadar.closebrief.plist

launchctl load ~/Library/LaunchAgents/com.traderadar.briefing.plist
launchctl load ~/Library/LaunchAgents/com.traderadar.closebrief.plist

# Verify both are loaded
launchctl list | grep traderadar
# Expect:
#   -   0   com.traderadar.briefing
#   -   0   com.traderadar.closebrief
```

Each plist passes `BRIEF_MODE` via its `EnvironmentVariables` dict, so a
single `daily-briefing.js` file drives both runs.

### Manually test each mode

```bash
cd /Users/johnshay/TradeWatch
BRIEF_MODE=morning node scripts/daily-briefing.js   # forces prep-for-open
BRIEF_MODE=evening node scripts/daily-briefing.js   # forces close recap
node scripts/daily-briefing.js                      # defaults to morning
```

### Shared cache (morning → evening delta)

| Field | Value |
|-------|-------|
| Path  | `~/Library/Application Support/TradeRadar/morning_consensus_v1.json` |
| Writer | morning run (after consensus + drivers + verdict are computed) |
| Reader | evening run (compared to current state for Sections 2, 3, 6) |
| Shape  | `{ date, written_at, consensus: { btc_ye, wti_ye, regime, n }, per_model: { claude/gpt/gemini/grok }, drivers: { id: state }, market: { btc/wti/vix/dxy/brent }, verdict: { score, label, regime } }` |

**Missing cache on the evening run** (e.g. laptop asleep at 06:00, or the
morning brief failed): the evening email still ships — Section 2 shows a
dashed warning **"No morning brief cache found today — showing current
state only."** and the morning-to-now delta lines are skipped. The
`written_at` field is advisory only; date equality to today is the gate.

Debug:

```bash
cat "$HOME/Library/Application Support/TradeRadar/morning_consensus_v1.json" | jq .
ls -la "$HOME/Library/Application Support/TradeRadar/"
```

---

### What's in the email (both modes)

Both briefs share the same 7-section shape; labels + tone flip based on
`BRIEF_MODE`.

| # | Morning (`BRIEF_MODE=morning`) | Evening (`BRIEF_MODE=evening`) |
|---|-------------------------------|-------------------------------|
| — | Header: "Morning Brief" · 6:00 AM PST stamp · 3-tile bar (BTC, WTI, VIX) | Header: "Market Close Recap" · 1:45 PM PT · post-close stamp · same tile bar |
| TL;DR | ⚡ **Today's Play** — forward-looking, 3 ranked recs for the day ahead | 🌆 **Today's Verdict** — backward-looking, what happened + overnight/tomorrow actions |
| 1 | **Overnight Updates** — top 6 relevance-scored catalysts | **Today's Catalysts** — same sourcing, framed as session-driving headlines |
| 2 | **LLM Thought Shift (4-way)** — Claude/GPT/Gemini/Grok YE consensus vs yesterday | **LLM Thought Shift · vs This Morning** — same 4 LLMs, dashed delta row vs morning cache (BTC YE / WTI YE / regime, with FLIP badge) |
| 3 | **Model Impact · Drivers** — 6 drivers `prev → curr` (hardcoded prev baseline) | **Drivers · morning → now** — `morning → now` per driver, intraday flips highlighted gold |
| 4 | **Oil Impact** — WTI + Brent-WTI spread + directional chip | **Oil Impact · Session Recap** — same fields, session framing |
| 5 | **Bitcoin Impact** — BTC spot + ETF/MSTR notes + directional chip | **Bitcoin Impact · Session Recap** — same, session framing |
| 6 | **Overall Verdict** — bull/bear score 0–100 | **Session Verdict** — same chip + dashed line "opened X/100 → closed Y/100 · ▲+N" with REGIME FLIP callout when applicable |
| 7 | **Investment Profile · Personalized** — per-position HOLD/ADD/TRIM + cash deployment | **Investment Profile · Day P&L + After-Hours** — same layout; rationale shifts to today's mark + AH watch items |

Subject line:

- Morning: `⚡ TradeRadar · <Date> · Prep for Open · <VERDICT> · BTC $… · YE $…`
- Evening: `🌆 TradeRadar · <Date> · Market Close Recap · <VERDICT> · BTC $… · YE $…`

### LLMs

| Provider | Model |
|----------|-------|
| Anthropic | `claude-sonnet-4-6` |
| OpenAI    | `gpt-4o-mini` |
| Google    | `gemini-2.5-flash` |
| xAI       | `grok-3-mini-fast` |

All 4 fire in a single `Promise.all`, temperature `0.4`, max_tokens `1000`.
Any LLM that 4xx/5xx/times-out is skipped — email still ships with the
responders it has. JSON parsing is tolerant (strips ```json fences, falls
back to regex-extract the first `{…}`).

Missing LLM keys are optional. Missing `GMAIL_USER` / `GMAIL_APP_PW` are
fatal (the script exits 1).

---

## Schedule: 06:00 Pacific, Mon–Fri

**Old:** 06:00 ET (`Hour=6` on an ET Mac).
**New:** 06:00 PT — launchd uses LOCAL time, so set `<Hour>` to match
your Mac's TZ:

| Mac TZ | `<Hour>` in plist |
|--------|-------------------|
| America/Los_Angeles (PT) | **6** (default in the example file) |
| America/New_York (ET)    | 9 |
| America/Chicago (CT)     | 8 |
| America/Denver (MT)      | 7 |
| UTC                      | 13 (PST) / 14 (PDT) — drifts across DST |

Check your TZ: `sudo systemsetup -gettimezone`.

### Cloud cron alternative (laptop-independent)

launchd does NOT wake a sleeping Mac. For guaranteed delivery, run on
GitHub Actions:

```yaml
name: traderadar-morning-brief
on:
  schedule:
    - cron: '0 14 * * 1-5'   # 14:00 UTC = 7 AM EDT / 6 AM PDT (most of the year)
    - cron: '0 15 * * 1-5'   # 15:00 UTC = 7 AM EST / 6 AM PST (standard time)
  workflow_dispatch:
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node scripts/daily-briefing.js
        env:
          GMAIL_USER:        ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PW:      ${{ secrets.GMAIL_APP_PW }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY:    ${{ secrets.OPENAI_API_KEY }}
          GEMINI_API_KEY:    ${{ secrets.GEMINI_API_KEY }}
          XAI_API_KEY:       ${{ secrets.XAI_API_KEY }}
          PUBLIC_URL:        https://traderadar.ggauntlet.com/
```

Two schedules cover both DST windows. DST caveat: GitHub cron granularity
is ~5 min and occasionally skips under load — still more reliable than a
sleeping MacBook.

---

## Positions file (Section 7)

The personalized investment profile pulls positions from (in priority order):

1. `$POSITIONS_JSON_PATH` env var (if set)
2. `~/Library/Application Support/TradeRadar/positions.json` (default)
3. The hardcoded `USER_POSITIONS_DEFAULT` constant inside `daily-briefing.js`

### Format

```json
{
  "cash": 4621,
  "positions": [
    {
      "symbol": "BTC",
      "kind": "spot",
      "qty": 0.01089,
      "costBasis": 98848,
      "currentValue": 1076.48
    },
    {
      "symbol": "COIN",
      "kind": "option",
      "right": "C",
      "strike": 340,
      "expiry": "2026-12-18",
      "contracts": 2,
      "costPerContract": 1525
    }
  ]
}
```

### Default (seeded in the script)

- BTC direct: 0.01089 @ cost $98,848 → ~$1,076 current
- COIN Dec 18 2026 $340C × 2 @ $1,525/contract → $3,050 premium
- Cash: $4,621
- Total book: ~$8,747

Spot positions are marked-to-market live against CoinGecko BTC. Option
positions show premium paid (live mark is TODO — Finnhub option chain or
Tradier needed).

### Create the override file

```bash
mkdir -p "$HOME/Library/Application Support/TradeRadar"
cat > "$HOME/Library/Application Support/TradeRadar/positions.json" <<'JSON'
{ "cash": 4621, "positions": [ ... ] }
JSON
```

---

## Env vars (all optional except Gmail)

| Var | Purpose |
|-----|---------|
| `GMAIL_USER`, `GMAIL_APP_PW` | **Required.** 16-char Gmail App Password. |
| `TO_EMAIL` | Recipient (default `jjshay@gmail.com`). |
| `ANTHROPIC_API_KEY` | Claude. |
| `OPENAI_API_KEY` | GPT. |
| `GEMINI_API_KEY` | Gemini. |
| `XAI_API_KEY` | Grok. |
| `FINNHUB_API_KEY` | Reserved for future option-chain MTM (not currently required). |
| `FRED_API_KEY` | Reserved; the script uses FRED's public CSV endpoint (no key needed). |
| `PUBLIC_URL` | Link target in header/footer (default `https://traderadar.ggauntlet.com/`). |
| `POSITIONS_JSON_PATH` | Override path for the positions file. |
| `BRIEF_MODE` | `morning` (default) or `evening`. Controls subject line, TL;DR tone, section titles, and whether the shared consensus cache is written (morning) or read (evening). |

---

## Manual test

```bash
cd /Users/johnshay/TradeWatch
node scripts/daily-briefing.js
```

Expected output:

```
[briefing] fetching overnight data…
[briefing] catalysts=6 · btc=68421 · wti=78.42
[briefing] firing 4 LLMs in parallel…
[briefing] 4/4 LLMs responded
[briefing] sent: <message-id>
```

Syntax check:

```bash
node --check scripts/daily-briefing.js
plutil -lint scripts/com.traderadar.briefing.plist.example
```

You can also use the npm alias from the repo root:

```bash
npm run briefing
```

---

## launchd install (macOS, recommended)

```bash
# 1. Verify node path
which node

# 2. Drop template into LaunchAgents
cp /Users/johnshay/TradeWatch/scripts/com.traderadar.briefing.plist.example \
   ~/Library/LaunchAgents/com.traderadar.briefing.plist

# 3. Pick the right <Hour> for your Mac's TZ (see table above)

# 4. Load (auto-loads on every login)
launchctl load ~/Library/LaunchAgents/com.traderadar.briefing.plist

# 5. Smoke-test
launchctl start com.traderadar.briefing
tail -f /Users/johnshay/TradeWatch/logs/briefing.log
```

### Uninstall / reschedule

```bash
launchctl unload ~/Library/LaunchAgents/com.traderadar.briefing.plist
# edit plist, then:
launchctl load   ~/Library/LaunchAgents/com.traderadar.briefing.plist
# or remove:
rm ~/Library/LaunchAgents/com.traderadar.briefing.plist
```

### Status

```bash
launchctl list | grep traderadar         # presence = loaded, 3rd column = last exit code
tail -n 100 /Users/johnshay/TradeWatch/logs/briefing.log
tail -n 100 /Users/johnshay/TradeWatch/logs/briefing.err
```

---

## Alt: crontab (local)

```bash
crontab -e
# 06:00 PT Mon-Fri:
0 6 * * 1-5 cd /Users/johnshay/TradeWatch && /usr/local/bin/node scripts/daily-briefing.js >> logs/briefing.log 2>&1
```

Cron does not inherit your shell PATH — pin the node binary absolutely.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ERROR: set GMAIL_USER + GMAIL_APP_PW in .env` | `.env` missing or mis-located | `.env` must live at repo root (`/Users/johnshay/TradeWatch/.env`), NOT in `scripts/`. |
| `Invalid login: 535-5.7.8` | Using regular Gmail password | Generate a 16-char App Password at <https://myaccount.google.com/apppasswords>. |
| launchd loads but never fires | Mac asleep at 06:00 | launchd does NOT wake the Mac. Use lid-open + power, or move to GitHub Actions cron. |
| Fires at wrong time after travel | Mac TZ changed | Edit `<Hour>` in the plist to match the new local time for 6 AM PT (see TZ table). |
| `0/4 LLMs responded` | Keys absent / rate-limited / invalid | Email still ships; Section 2 is empty, consensus + verdict fall back to neutrals. |
| Section 7 shows default positions | No `positions.json` override | Create `~/Library/Application Support/TradeRadar/positions.json` or set `POSITIONS_JSON_PATH`. |
| Evening brief shows "No morning brief cache found" | Morning run didn't write the cache today (Mac asleep, brief failed, first install, or wrong `BRIEF_MODE`) | Check `~/Library/Application Support/TradeRadar/morning_consensus_v1.json` — date must match today's `YYYY-MM-DD`. Evening still ships gracefully without it. |
| WTI / VIX tiles blank | FRED CSV endpoint timed out | Transient — retry. The script degrades gracefully. |
| Email HTML looks broken in Outlook | Outlook doesn't render flexbox | Open in Gmail web; the email is tested there. |

### Most likely failure modes

1. **rss2json rate limit** (free tier ~10k/day) — news section empties, LLM thought-shift runs without catalysts.
2. **All LLM keys unset** — sections 2/6 degrade; drivers/oil/BTC still render from macro + news.
3. **Mac asleep at 06:00 PT** — brief skipped until next wake. Move to GitHub Actions for reliability.

---

## Files

| File | Purpose |
|------|---------|
| `daily-briefing.js` | The 7-section morning brief script. Node 20+. |
| `.env.example` | Env template (mirrored at repo root). |
| `package.json` | Local manifest (repo-root is source of truth for installs). |
| `com.traderadar.briefing.plist.example` | launchd agent — **morning** (06:00 local Mon–Fri, `BRIEF_MODE=morning`). |
| `com.traderadar.closebrief.plist.example` | launchd agent — **evening** (13:45 local Mon–Fri, `BRIEF_MODE=evening`). |
| `verify_fred.js` | Unrelated — FRED API smoke test. |
| `README.md` | This file. |
