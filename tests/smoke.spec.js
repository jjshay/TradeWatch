// @ts-check
// TradeRadar smoke test suite.
// For each of the 10 tabs: load the app, click the tab, wait for the header,
// screenshot, and assert no non-whitelisted console errors.
// After all tabs run, a combined tests/report.md is written.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Keep in sync with window.TR_TABS_META in tr-header-extras.jsx.
// Default landing tab is 'drivers' (the first entry); every other tab is
// exercised by clicking its nav entry.
const DEFAULT_TAB = 'drivers';
const TABS = [
  'drivers', 'summary', 'historical', 'projected', 'impact', 'recommend',
  'news', 'calendar', 'signals', 'prices', 'flights',
];

// Regexes for known network noise we DO NOT want to fail the test on:
// 401 / 403 / 429 from upstream market/news APIs are expected when keys
// are absent in the test environment. Leaflet tile CORS / AbortError
// and benign React dev warnings are also tolerated.
const ALLOWED_ERROR_PATTERNS = [
  /401/i,
  /403/i,
  /429/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /AbortError/i,
  /CORS/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /coingecko|cryptocompare|alternative\.me|tradier|polygon|newsapi|gdeltproject|aviationstack|openskynetwork|fixer|yahoo/i,
];

function isAllowedError(msg) {
  if (!msg) return true;
  return ALLOWED_ERROR_PATTERNS.some((re) => re.test(msg));
}

const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
const REPORT_PATH = path.join(__dirname, 'report.md');

// Aggregated results collected across all test cases, then flushed to report.md.
const results = [];

test.beforeAll(() => {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
});

test.afterAll(() => {
  const lines = [];
  lines.push('# TradeRadar Smoke Test Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| Tab | Result | Console Errors | Notes |');
  lines.push('|---|---|---|---|');
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    if (r.ok) pass += 1;
    else fail += 1;
    const status = r.ok ? 'PASS' : 'FAIL';
    const notes = (r.notes || '').replace(/\|/g, '\\|');
    lines.push(`| ${r.tab} | ${status} | ${r.errorCount} | ${notes} |`);
  }
  lines.push('');
  lines.push(`**Totals:** ${pass} passed, ${fail} failed, ${results.length} total.`);
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
});

for (const tab of TABS) {
  test(`tab: ${tab} renders without blocking errors`, async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!isAllowedError(text)) consoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      const text = err && err.message ? err.message : String(err);
      if (!isAllowedError(text)) pageErrors.push(text);
    });

    let ok = false;
    let notes = '';
    try {
      // Pre-dismiss the first-visit welcome modal and any other first-run
      // gates. Without this, their zIndex:120 overlay intercepts every
      // click in a fresh CI browser.
      await page.addInitScript(() => {
        try {
          localStorage.setItem('tr_welcomed', 'true');
          localStorage.setItem('tr_tour_done', 'true');
          localStorage.setItem('tr_onboarded', 'true');
        } catch (_) {}
      });
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // The app boots via Babel-standalone — give React a beat to mount the shell.
      await page.waitForSelector('.tr-shell', { timeout: 15_000 });

      // Navigate to the requested tab. The default tab renders on load;
      // for every other tab, click its nav entry via the stable data-tab
      // attribute (visible-text matching collides with the "N." numeric
      // prefix rendered inside each tab div).
      if (tab !== DEFAULT_TAB) {
        const navTarget = page.locator(`[data-tab="${tab}"]`).first();
        await navTarget.waitFor({ state: 'visible', timeout: 10_000 });
        await navTarget.click();
      }

      // Allow the screen to render its header + first paint.
      await page.waitForTimeout(1200);

      // Basic header sanity check — TradeRadar wordmark is present on every screen.
      await expect(page.getByText('TradeRadar').first()).toBeVisible({ timeout: 5_000 });

      // Capture screenshot.
      await page.screenshot({
        path: path.join(SNAPSHOT_DIR, `${tab}.png`),
        fullPage: false,
      });

      const totalErrors = consoleErrors.length + pageErrors.length;
      if (totalErrors > 0) {
        notes = `errors: ${[...consoleErrors, ...pageErrors].slice(0, 3).join(' | ')}`;
      }
      expect(totalErrors, `Unexpected console/page errors on tab "${tab}"`).toBe(0);
      ok = true;
    } catch (err) {
      notes = (err && err.message ? err.message : String(err)).split('\n')[0];
      throw err;
    } finally {
      results.push({
        tab,
        ok,
        errorCount: consoleErrors.length + pageErrors.length,
        notes,
      });
    }
  });
}
