# TradeRadar scripts

## daily-briefing.js — daily email digest

Sends a formatted HTML briefing to `jjshay@gmail.com` with BTC spot, Fear & Greed,
live portfolio, top headlines, and a Claude + ChatGPT + Gemini + Grok consensus block.

### First-time setup

```bash
cd /Users/johnshay/TradeWatch
cp scripts/.env.example .env    # .env is gitignored
```

Edit `.env`:

1. **Gmail app password** — go to [myaccount.google.com → Security → 2-Step → App passwords](https://myaccount.google.com/apppasswords), generate one labeled "TradeRadar". Paste as `GMAIL_APP_PW`.
2. **Paste API keys** for whichever LLMs you want to use (Claude, ChatGPT, Gemini, Grok) and Finnhub (for portfolio prices). Missing keys → that section is skipped, not an error.

Install dependencies:

```bash
npm install node-fetch@2 nodemailer dotenv
```

Test the send:

```bash
node scripts/daily-briefing.js
```

You should see `[briefing] sent: <message-id>` on success, and an email arrive at `jjshay@gmail.com` within 30 seconds.

### Daily schedule (macOS launchd — recommended)

Create `~/Library/LaunchAgents/com.traderadar.briefing.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.traderadar.briefing</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/johnshay/TradeWatch/scripts/daily-briefing.js</string>
    </array>
    <key>WorkingDirectory</key><string>/Users/johnshay/TradeWatch</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>7</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>StandardOutPath</key><string>/Users/johnshay/TradeWatch/logs/briefing.log</string>
    <key>StandardErrorPath</key><string>/Users/johnshay/TradeWatch/logs/briefing.err</string>
</dict>
</plist>
```

Load it:

```bash
mkdir -p /Users/johnshay/TradeWatch/logs
launchctl load ~/Library/LaunchAgents/com.traderadar.briefing.plist
launchctl start com.traderadar.briefing   # fires immediately for testing
```

Stop / reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.traderadar.briefing.plist
```

### Alt: crontab

```bash
crontab -e
# add:
0 7 * * * cd /Users/johnshay/TradeWatch && /usr/local/bin/node scripts/daily-briefing.js >> logs/briefing.log 2>&1
```

Laptop must be awake at the scheduled time for either approach. For cloud-schedule, port this script to a GitHub Action.
