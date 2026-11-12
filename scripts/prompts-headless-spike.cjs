#!/usr/bin/env node
// Only synthetic text is logged. The one production test capability is stored
// in ignored artifacts with mode 0600 for safe retries; it is never printed.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.PFDOCS_ROOT || process.cwd();
process.env.TMPDIR = path.join(root, 'artifacts/spike-tmp');
fs.mkdirSync(process.env.TMPDIR, { recursive: true });
const req = createRequire(path.join(root, 'package.json'));
const Hash = req('./lib/common-hash');
const Crypto = req('chainpad-crypto');
const ChainPad = req('chainpad');
const CPNF = req('chainpad-netflux');
const Netflux = req('netflux-websocket');
const WebSocket = req('ws');
const Sortify = req('json.sortify');
const { chromium } = req('./artifacts/spike-browser/node_modules/playwright');
const origin = process.env.PFDOCS_ORIGIN || 'http://localhost:3190';
const production = origin === 'https://tasknode-pfdocs.fly.dev';
assert.ok(production || origin === 'http://localhost:3190', 'Only the isolated local instance and specified production host are permitted');
const wsUrl = origin.replace(/^http/, 'ws') + '/cryptpad_websocket';
const emit = (stage, data = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), stage, ...data }));
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(test, label, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await test()) return; await delay(250); }
  throw new Error('TIMEOUT_' + label);
}
async function join(editUrl) {
  const parsed = Hash.parsePadUrl(editUrl);
  assert.equal(parsed.type, 'code');
  const secret = Hash.getSecrets(parsed.type, parsed.hash);
  const network = await Netflux.connect(wsUrl, url => new WebSocket(url));
  let session;
  const info = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT_NODE_JOIN')), 30000);
    session = CPNF.start({
      network, channel: secret.channel, validateKey: secret.keys.validateKey,
      crypto: Crypto.createEncryptor(secret.keys), ChainPad,
      initialState: '', avgSyncMilliseconds: 100, logLevel: 0,
      patchTransformer: ChainPad.SmartJSONTransformer,
      validateContent: value => { try { JSON.parse(value); return true; } catch { return false; } },
      onReady: data => { clearTimeout(timer); resolve(data); },
      onError: () => { clearTimeout(timer); reject(new Error('NODE_CHANNEL_ERROR')); },
    });
  });
  return { rt: info.realtime, close() { info.realtime.abort(); session.stop?.(); network.disconnect(); } };
}
(async () => {
  let node, browser, diagnostics;
  try {
    emit('start', { origin, dependencies: Object.fromEntries(['chainpad','chainpad-netflux','chainpad-crypto','netflux-websocket'].map(n => [n, req(n + '/package.json').version])) });
    const capabilityFile = path.join(root, 'artifacts/spike-production-capability.json');
    const reused = production && fs.existsSync(capabilityFile);
    const editUrl = reused ? JSON.parse(fs.readFileSync(capabilityFile, 'utf8')).editUrl
      : origin + '/code/#' + Hash.getEditHashFromKeys(Hash.getSecrets('code'));
    assert.equal(new URL(editUrl).origin, origin);
    if (production && !reused) fs.writeFileSync(capabilityFile, JSON.stringify({ editUrl }), { mode: 0o600, flag: 'wx' });
    emit('test_pad_selected', { reused, createdThisRun: !reused });
    node = await join(editUrl);
    if (reused && node.rt.getUserDoc()) assert.match(JSON.parse(node.rt.getUserDoc()).content, /^# Prompt spike\n/);
    node.rt.contentUpdate(Sortify({ content: '# Prompt spike\nSynthetic initial text.\n', highlightMode: 'gfm', metadata: { type: 'code', title: 'Prompt spike synthetic test', users: {} } }));
    await until(() => node.rt.getAuthDoc().includes('Synthetic initial text.'), 'INITIAL_PERSIST');
    emit('node_initialized_test_pad');
    node.close();
    node = await join(editUrl);
    assert.equal(JSON.parse(node.rt.getUserDoc()).content, '# Prompt spike\nSynthetic initial text.\n');
    emit('node_reopened_persisted_text', { text: JSON.parse(node.rt.getUserDoc()).content });
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ['--no-sandbox'] });
    const context = await browser.newContext();
    const page = await context.newPage();
    const appDisabled = async () => (await Promise.all(page.frames().map(f => f.evaluate(() => document.body?.innerText.includes('This application has been disabled.')).catch(() => false)))).some(Boolean);
    // Never attach browser console/request logging: URLs contain bearer capabilities.
    page.on('response', response => { if (response.status() >= 400) { const url = new URL(response.url()); emit('http_error', { path: url.pathname, status: response.status() }); } });
    page.on('pageerror', error => emit('browser_error', { name: error.name, message: error.message.replace(/https?:\/\/[^\s)]+/g, '[URL]').replace(/[A-Za-z0-9+/_=-]{32,}/g, '[REDACTED]').slice(0, 500) }));
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let frame;
    diagnostics = setTimeout(async () => { await page.screenshot({ path: path.join(root, production ? 'artifacts/spike-production-browser.png' : 'artifacts/spike-local-browser.png') }); emit('browser_state', { frames: page.frames().map(f => { try { const u = new URL(f.url()); return u.origin + u.pathname; } catch { return '[frame]'; } }) }); }, 10000);
    diagnostics.unref();
    await until(async () => {
      frame = page.frames().find(f => f.url().includes('/code/inner.html'));
      if (await appDisabled()) {
        await page.screenshot({ path: path.join(root, production ? 'artifacts/spike-production-browser.png' : 'artifacts/spike-local-browser.png') });
        emit('browser_application_disabled', { message: 'This application has been disabled. Contact the administrator of this PFT Docs for more information.' });
        throw new Error('BROWSER_APP_DISABLED');
      }
      return frame && frame.evaluate(() => Boolean(document.querySelector('.CodeMirror')?.CodeMirror));
    }, 'BROWSER_EDITOR', 90000);
    const readBrowser = () => frame.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
    emit('browser_editor_present', { text: await readBrowser() });
    await until(async () => {
      if (await appDisabled()) {
        await page.screenshot({ path: path.join(root, production ? 'artifacts/spike-production-browser.png' : 'artifacts/spike-local-browser.png') });
        emit('browser_application_disabled', { message: 'This application has been disabled. Contact the administrator of this PFT Docs for more information.' });
        throw new Error('BROWSER_APP_DISABLED');
      }
      return (await readBrowser()).includes('Synthetic initial text.');
    }, 'BROWSER_INITIAL_READ');
    emit('browser_read_initial', { text: await readBrowser() });
    await frame.evaluate(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror;
      cm.setValue('# Prompt spike\nBrowser authored text.\n');
    });
    await until(() => node.rt.getUserDoc().includes('Browser authored text.'), 'BROWSER_TO_NODE');
    emit('browser_edit_received_by_node', { text: JSON.parse(node.rt.getUserDoc()).content });
    node.close();
    node = await join(editUrl);
    assert.match(JSON.parse(node.rt.getUserDoc()).content, /Browser authored text/);
    emit('node_read_current_from_edit_capability', { text: JSON.parse(node.rt.getUserDoc()).content });
    const doc = JSON.parse(node.rt.getUserDoc());
    doc.content += 'Node live edit.\n';
    node.rt.contentUpdate(Sortify(doc));
    await until(async () => (await readBrowser()).includes('Node live edit.'), 'NODE_TO_BROWSER');
    emit('node_edit_visible_in_browser', { text: await readBrowser() });
    await until(() => node.rt.getAuthDoc().includes('Node live edit.'), 'FINAL_PERSIST');
    await page.screenshot({ path: path.join(root, production ? 'artifacts/spike-production-browser.png' : 'artifacts/spike-local-browser.png') });
    emit('PASS', { readFromEditCapability: true, browserToNode: true, nodeToBrowser: true, testPadsCreated: reused ? 0 : 1 });
  } finally {
    clearTimeout(diagnostics);
    node?.close();
    await browser?.close();
  }
})().then(() => process.exit(0)).catch(error => {
  // Errors may contain URLs or raw state; output only our allowlisted stage codes.
  emit('FAIL', { error: /^TIMEOUT_|^NODE_CHANNEL_ERROR$|^BROWSER_APP_DISABLED$/.test(error.message) ? error.message : error.name, code: error.code || null });
  process.exit(1);
});
