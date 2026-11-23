// End-to-End-Test: echte Chrome-Erweiterung + echte Vertec-Skripte (auf simuliertem Vertec)
// + simuliertes peoplefone SOFTPHONE.
// Ausführen mit:  node tests/e2e_extension.cjs   (benötigt Playwright, Chromium, python3)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert/strict');

const EXT = path.resolve(__dirname, '..', 'chrome-extension');
const FAKE_SOFTPHONE = `<!doctype html><html><body><h1>Fake Softphone</h1><script>
  window.__calls = [];
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'CLICK_TO_CALL') window.__calls.push(e.data.tel);
  });
  window.postMessage({ type: 'EXTENSION_CHECK' }, '*');
</script></body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isSoftphone = (p) => !p.isClosed() && p.url().startsWith('https://softphone.peoplefone.com');

async function startServer() {
  const proc = spawn('python3', [path.join(__dirname, 'e2e_vertec_server.py')], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => {
      const m = String(d).match(/PORT (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    proc.on('exit', () => reject(new Error('Server beendet')));
  });
  return { proc, port };
}

// Lokaler HTTPS-Server, auf den softphone.peoplefone.com per DNS-Regel umgeleitet wird.
async function startFakeSoftphone(dir) {
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', '/CN=softphone.peoplefone.com'], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FAKE_SOFTPHONE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function callsOf(page) {
  try { return await page.evaluate(() => window.__calls || []); } catch (_) { return null; }
}

async function waitFor(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

(async () => {
  const { proc, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const klick = (nummer) => fetch(`${base}/test/anrufen?nummer=${encodeURIComponent(nummer)}`, { method: 'POST' });

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-e2e-'));
  const fake = await startFakeSoftphone(userDir);
  const ctx = await chromium.launchPersistentContext(userDir + '/profile', {
    headless: true,
    channel: 'chromium',
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      `--host-resolver-rules=MAP softphone.peoplefone.com 127.0.0.1:${fake.port}`,
      '--ignore-certificate-errors',
      '--no-proxy-server',
    ],
  });

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate((vertecUrl) => chrome.storage.local.set({
    vertecUrl, apiToken: 'TECHTOKEN', pairingCode: '4711-geheim', pollMs: 1000, delayMs: 300,
  }), base);
  await sleep(500);
  for (const p of ctx.pages()) await p.close().catch(() => {}); // Einstellungsseite schliessen

  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + ' – ' + e.message]); }
  };
  const badge = () => sw.evaluate(() => chrome.action.getBadgeText({}));

  await check('Verbindung zu Vertec: kein Fehler am Symbol', async () => {
    await sleep(2500);
    assert.equal(await badge(), '');
  });

  await check('Softphone nicht offen: Klick in Vertec öffnet Softphone und wählt', async () => {
    await klick('031 123 45 67');
    const page = await waitFor(async () => ctx.pages().find(isSoftphone));
    if (!page) {
      const info = await sw.evaluate(async () => ({ tabs: (await chrome.tabs.query({})).map((t) => t.url),
        session: await chrome.storage.session.get(null) }));
      console.log('DEBUG pages:', ctx.pages().map((p) => p.url()), JSON.stringify(info));
    }
    assert.ok(page, 'Softphone-Tab wurde nicht geöffnet');
    const calls = await waitFor(async () => { const c = await callsOf(page); return c && c.length ? c : null; });
    assert.deepEqual(calls, ['+41311234567']);
  });

  await check('Softphone offen: gleicher Tab wählt, kein zweiter Tab, keine Doppelwahl', async () => {
    const page = ctx.pages().find(isSoftphone);
    await klick('+41 79 123 45 67');
    const calls = await waitFor(async () => { const c = await callsOf(page); return c && c.length >= 2 ? c : null; });
    assert.deepEqual(calls, ['+41311234567', '+41791234567']);
    await sleep(3000); // weitere Abfragen dürfen denselben Auftrag nicht erneut wählen
    assert.equal((await callsOf(page)).length, 2);
    assert.equal(ctx.pages().filter(isSoftphone).length, 1);
  });

  await check('Gesperrte Mehrwertnummer 0900: es wird nicht gewählt', async () => {
    const page = ctx.pages().find(isSoftphone);
    await klick('0900 123 456');
    await sleep(3000);
    assert.equal((await callsOf(page)).length, 2);
  });

  await check('Falscher Kopplungscode: Fehler am Symbol, es wird nicht gewählt', async () => {
    const page = ctx.pages().find(isSoftphone);
    await sw.evaluate(() => chrome.storage.local.set({ pairingCode: '4711-falsch' }));
    await klick('031 555 55 55');
    assert.equal(await waitFor(async () => (await badge()) === '!'), true);
    await sleep(1500);
    assert.equal((await callsOf(page)).length, 2);
  });

  await ctx.close();
  proc.kill();
  fake.server.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  for (const [s, n] of results) console.log(s, n);
  process.exit(results.some(([s]) => s === 'FAIL') ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
