// End-to-End-Test der Chrome-Erweiterung mit einem simulierten peoplefone SOFTPHONE.
// Ausführen mit:  node tests/e2e_extension.cjs   (benötigt Playwright + Chromium)
//
// Die Seite https://softphone.peoplefone.com/ wird abgefangen und durch eine
// Testseite ersetzt, die empfangene CLICK_TO_CALL-Nachrichten protokolliert.
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert/strict');

const EXT = path.resolve(__dirname, '..', 'chrome-extension');
const TOKEN = 'testtoken123';
const FAKE_SOFTPHONE = `<!doctype html><html><body><h1>Fake Softphone</h1><script>
  window.__calls = [];
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'CLICK_TO_CALL') window.__calls.push(e.data.tel);
  });
  window.postMessage({ type: 'EXTENSION_CHECK' }, '*');
</script></body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dialUrl = (nr, token = TOKEN) =>
  `https://softphone.peoplefone.com/#vertec-dial=${encodeURIComponent(nr)}&k=${encodeURIComponent(token)}`;

async function callsOf(page) {
  try { return await page.evaluate(() => window.__calls || []); } catch (_) { return null; }
}

async function waitForCalls(page, n, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const c = await callsOf(page);
    if (c && c.length >= n) return c;
    await sleep(200);
  }
  return (await callsOf(page)) || [];
}

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-e2e-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route('https://softphone.peoplefone.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_SOFTPHONE }));

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate((token) => chrome.storage.sync.set({ token, delayMs: 300 }), TOKEN);
  for (const p of ctx.pages()) await p.close().catch(() => {}); // Einstellungsseite nach Installation schliessen

  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + ' – ' + e.message]); }
  };

  await check('Softphone nicht offen: Tab wird geöffnet, Token entfernt, Nummer gewählt', async () => {
    const page = await ctx.newPage();
    await page.goto(dialUrl('031 123 45 67'));
    const calls = await waitForCalls(page, 1);
    assert.deepEqual(calls, ['+41311234567']);
    assert.ok(!page.url().includes('vertec-dial'), 'Token/Nummer noch in der URL: ' + page.url());
  });

  await check('Softphone offen: neuer Tab wird geschlossen, bestehender Tab wählt', async () => {
    const softphone = ctx.pages().find((p) => p.url().startsWith('https://softphone.peoplefone.com'));
    const before = (await callsOf(softphone)).length;
    const extra = await ctx.newPage();
    await extra.goto(dialUrl('+41 79 123 45 67')).catch(() => {}); // Tab wird geschlossen
    const calls = await waitForCalls(softphone, before + 1);
    assert.equal(calls[calls.length - 1], '+41791234567');
    await sleep(500);
    assert.ok(extra.isClosed(), 'Zusätzlicher Tab wurde nicht geschlossen');
    assert.equal(ctx.pages().filter((p) => p.url().startsWith('https://softphone.peoplefone.com')).length, 1);
  });

  await check('Falscher Token: es wird nicht gewählt', async () => {
    const softphone = ctx.pages().find((p) => p.url().startsWith('https://softphone.peoplefone.com'));
    const before = (await callsOf(softphone)).length;
    const extra = await ctx.newPage();
    await extra.goto(dialUrl('031 999 99 99', 'falsch')).catch(() => {});
    await sleep(1500);
    assert.equal((await callsOf(softphone)).length, before);
    await extra.close().catch(() => {});
  });

  await check('Gesperrte Mehrwertnummer 0900: es wird nicht gewählt', async () => {
    const softphone = ctx.pages().find((p) => p.url().startsWith('https://softphone.peoplefone.com'));
    const before = (await callsOf(softphone)).length;
    const extra = await ctx.newPage();
    await extra.goto(dialUrl('0900 123 456')).catch(() => {});
    await sleep(1500);
    assert.equal((await callsOf(softphone)).length, before);
    await extra.close().catch(() => {});
  });

  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  for (const [s, n] of results) console.log(s, n);
  process.exit(results.some(([s]) => s === 'FAIL') ? 1 : 0);
})();
