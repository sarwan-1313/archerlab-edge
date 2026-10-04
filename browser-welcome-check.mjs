// Run against an isolated Chrome profile with CDP and a local dev/preview server.
// Example: node browser-welcome-check.mjs http://127.0.0.1:5179 9335
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5179';
const port = process.argv[3] ?? '9335';
const output = 'node_modules/.welcome-audit';
await mkdir(output, { recursive: true });
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const target = targets.find(t => t.type === 'page');
assert(target, 'An isolated browser page must be available');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
const report = { base, actions: [], responsive: [], console: [], exceptions: [] };
let phase = 'startup';
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    report.exceptions.push({ phase, detail: message.params.exceptionDetails });
  } else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    report.console.push({ phase, type: message.params.type, text: message.params.args.map(a => a.value ?? a.description).join(' ') });
  } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    report.console.push({ phase, type: 'error', text: message.params.entry.text, url: message.params.entry.url });
  } else if (message.method === 'Fetch.requestPaused') {
    // Simulate a slow first lazy chunk; the delay exists only in this audit.
    void wait(400).then(() => call('Fetch.continueRequest', { requestId: message.params.requestId }));
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await evaluate(expression)) return;
    await wait(40);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function settled() { await until(`!document.documentElement.dataset.viewTransition`); }
async function reload() {
  const id = await evaluate('window.__audit.documentId');
  await call('Page.reload', { ignoreCache: true });
  await until(`window.__audit?.documentId !== ${id} && document.readyState === 'complete' && !!document.querySelector('.welcome-page')`);
}
async function click(selector, label) {
  assert(await evaluate(`(() => {
    const buttons = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const button = buttons.find(b => b.getClientRects().length && (${JSON.stringify(label)} === null || b.textContent.trim() === ${JSON.stringify(label)}));
    if (!button || button.disabled) return false;
    button.focus(); button.click(); return true;
  })()`), `Visible enabled action: ${label ?? selector}`);
}
async function home() {
  await click('.app-brand', null);
  await until(`location.pathname === '/' && !!document.querySelector('.welcome-page')`);
  await settled();
}
async function route(path, heading) {
  await until(`location.pathname === ${JSON.stringify(path)} && document.querySelector('main h1')?.textContent === ${JSON.stringify(heading)}`);
  await settled();
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${output}/${name}.png`, Buffer.from(result.data, 'base64'));
}
async function key(key, modifiers = 0) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers, windowsVirtualKeyCode: key === 'Tab' ? 9 : 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers, windowsVirtualKeyCode: key === 'Tab' ? 9 : 27 });
}

try {
  await Promise.all([call('Runtime.enable'), call('Page.enable'), call('Log.enable')]);
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__audit = { documentId: Math.random(), cameras: 0, pushes: 0, transitions: 0, blankFrames: 0, fullscreenLoaders: 0, homeLoaders: 0, routeLoaders: 0, seen: false };
    const media = navigator.mediaDevices;
    if (media) { const get = media.getUserMedia.bind(media); media.getUserMedia = (...args) => { window.__audit.cameras++; return get(...args); }; }
    const push = history.pushState.bind(history);
    history.pushState = (...args) => { window.__audit.pushes++; return push(...args); };
    if (document.startViewTransition) { const start = document.startViewTransition.bind(document); document.startViewTransition = (...args) => { window.__audit.transitions++; return start(...args); }; }
    function sample() {
      const main = document.querySelector('main');
      const hasContent = !!main?.innerText.trim();
      if (window.__audit.seen && !hasContent) window.__audit.blankFrames++;
      if (hasContent) window.__audit.seen = true;
      if (document.querySelector('.app-loading-screen--fullscreen')) window.__audit.fullscreenLoaders++;
      if (location.pathname === '/' && document.querySelector('.app-loading-screen')) window.__audit.homeLoaders++;
      if (document.querySelector('.app-loading-screen--route')) window.__audit.routeLoaders++;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `${base}/` });
  await until(`!!document.querySelector('.welcome-page')`);
  report.console = [];
  report.exceptions = [];
  // Reset only onboarding in this disposable audit browser, then verify a first visit.
  await evaluate(`localStorage.removeItem('archerlab-edge:onboarding-complete')`);
  await reload();
  await until(`!!document.querySelector('.onboarding-modal')`);
  await click('[aria-label="Close onboarding"]', null);
  await until(`!document.querySelector('.onboarding-modal')`);
  await settled();
  report.actions.push('First-visit quick start closes to Home');
  await reload();
  await until(`!!document.querySelector('.welcome-page') && document.readyState === 'complete'`);
  assert.equal(await evaluate(`!!document.querySelector('.onboarding-modal')`), false);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.page-transition')).animationName`), 'none');
  assert.equal(await evaluate('window.__audit.cameras'), 0);
  report.initialSecondaryChunks = await evaluate(`performance.getEntriesByType('resource').filter(r=>/UserGuidePage|SavedRecordingsPage|SessionDashboardPage/.test(r.name)).map(r=>r.name)`);
  assert.deepEqual(report.initialSecondaryChunks, []);
  report.actions.push('Home refresh has no repeated onboarding, loader, or entry fade');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Fetch.enable', { patterns: [{ urlPattern: '*UserGuidePage*', requestStage: 'Request' }] });

  phase = 'navigation';
  for (const width of [390, 430, 768, 1024, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate('scrollTo(0, 0)');
    const layout = await evaluate(`(() => {
      const cta = document.querySelector('.welcome-actions__primary').getBoundingClientRect();
      const nav = [...document.querySelectorAll('nav')].find(n => n.getClientRects().length);
      const bottom = document.querySelector('.bottom-nav');
      const limit = bottom.getClientRects().length ? bottom.getBoundingClientRect().top : innerHeight;
      return { width: innerWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ctaVisible: cta.top >= 0 && cta.bottom <= limit,
        highlightTextFits: [...document.querySelectorAll('.welcome-highlights small')].every(e => e.scrollWidth <= e.clientWidth),
        usableNav: !!nav && [...nav.querySelectorAll('button')].every(b => {const r=b.getBoundingClientRect();return r.left >= 0 && r.right <= innerWidth && r.height >= 44;}),
        documentHeight: document.documentElement.scrollHeight };
    })()`);
    assert.equal(layout.overflow, 0);
    assert(layout.ctaVisible && layout.highlightTextFits && layout.usableNav);
    report.responsive.push(layout);
    await screenshot(`home-${width}`);
    const selector = width < 768 ? '.bottom-nav__item' : '.sidebar-nav__item';
    for (const [label, path, heading] of [['Guide', '/guide', 'User Guide'], ['Sessions', '/sessions', 'Training Sessions'], ['Analytics', '/analytics', 'Performance Analytics']]) {
      await click(selector, label);
      await route(path, heading);
      await click(selector, 'Home');
      await route('/', 'ArcherLab Edge');
      report.actions.push(`${width}px ${label} and Home`);
    }
    if (width === 430) {
      await click('[aria-label="Open athlete profile"]', null);
      await route('/profile', 'Athlete Profile');
      await home();
      report.actions.push('Mobile profile and brand return Home');
    }
  }

  await click('.welcome-actions__secondary button', 'User Guide');
  await route('/guide', 'User Guide');
  await evaluate('history.back()');
  await route('/', 'ArcherLab Edge');
  await evaluate('history.forward()');
  await route('/guide', 'User Guide');
  await click('[aria-label="Go back"]', null);
  await route('/', 'ArcherLab Edge');
  report.actions.push('User Guide, browser Back/Forward, and app Back');
  await evaluate(`const guide=[...document.querySelectorAll('.welcome-actions__secondary button')].find(b=>b.textContent==='User Guide'); guide.click(); document.querySelector('.app-brand').click()`);
  await route('/', 'ArcherLab Edge');
  await wait(250);
  assert.equal(await evaluate(`document.querySelector('main h1').textContent`), 'ArcherLab Edge');
  report.actions.push('Home wins over a pending guide transition');
  await click('.welcome-actions__secondary button', 'User Guide');
  await route('/guide', 'User Guide');
  await evaluate('scrollTo(0, document.documentElement.scrollHeight)');
  await home();
  assert.equal(await evaluate('scrollY'), 0);
  report.actions.push('Returning Home resets scroll to the CTA');

  phase = 'how-it-works';
  await click('.welcome-actions__secondary button', 'User Guide');
  await route('/guide', 'User Guide');
  await click('main button', 'Replay quick start');
  await until(`!!document.querySelector('.onboarding-modal')`);
  await settled();
  await key('Tab', 8);
  assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Next');
  await key('Tab');
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), 'Close onboarding');
  await click('.onboarding-modal button', 'Next');
  await click('.onboarding-modal button', 'Back');
  for (let step = 2; step <= 4; step++) await click(`[aria-label^="Go to step ${step}:"]`, null);
  await key('Escape');
  await until(`!document.querySelector('.onboarding-modal')`);
  await settled();
  assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Replay quick start');
  await click('main button', 'Replay quick start');
  await until(`!!document.querySelector('.onboarding-modal')`);
  await settled();
  await click('.onboarding-modal button', 'Skip for now');
  await until(`!document.querySelector('.onboarding-modal')`);
  await settled();
  report.actions.push('How It Works: Next, Back, all step controls, Escape, Skip, focus trap and focus restoration');

  await home();
  phase = 'start-analysis';
  const before = await evaluate(`({...window.__audit})`);
  await evaluate(`const start=document.querySelector('.welcome-actions__primary');start.click();start.click()`);
  await route('/analysis', 'Camera Setup');
  await until(`!!document.querySelector('video')?.srcObject`);
  await wait(1800);
  const after = await evaluate(`({...window.__audit})`);
  assert.equal(after.pushes - before.pushes, 1);
  assert.equal(after.transitions - before.transitions, 1);
  report.startAnalysis = { historyEntries: after.pushes - before.pushes, transitions: after.transitions - before.transitions,
    cameraRequests: after.cameras - before.cameras,
    readinessEnabled: await evaluate(`![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Continue to Readiness')).disabled`),
    setupText: await evaluate(`document.querySelector('main').innerText`),
    modelResources: await evaluate(`performance.getEntriesByType('resource').filter(r=>/pose_landmarker|vision_wasm/.test(r.name)).map(r=>r.name)`) };
  await evaluate('history.back()');
  await route('/', 'ArcherLab Edge');
  await evaluate('history.forward()');
  await route('/analysis', 'Camera Setup');
  await home();
  report.actions.push('Rapid Start Analysis: one /analysis entry and transition; Back/Forward; return Home');
  const singleStart = await evaluate(`({...window.__audit})`);
  await click('.welcome-actions__primary', null);
  await route('/analysis', 'Camera Setup');
  await until(`!!document.querySelector('video')?.srcObject`);
  await wait(1000);
  report.singleStart = await evaluate(`({ cameraRequests: window.__audit.cameras - ${singleStart.cameras}, historyEntries: window.__audit.pushes - ${singleStart.pushes}, transitions: window.__audit.transitions - ${singleStart.transitions} })`);
  assert.equal(report.singleStart.cameraRequests, 1);
  assert.equal(report.singleStart.historyEntries, 1);
  assert.equal(report.singleStart.transitions, 1);
  await home();
  for (const width of [430, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(width === 430 ? '.bottom-nav__item' : '.sidebar-nav__item', width === 430 ? 'Live' : 'Live Analysis');
    await route('/analysis', 'Camera Setup');
    await home();
    report.actions.push(`${width}px Live navigation and brand return Home`);
  }
  await click('.welcome-actions__secondary button', 'User Guide');
  await route('/guide', 'User Guide');
  await click('main button', 'Replay quick start');
  await until(`!!document.querySelector('.onboarding-modal')`);
  await settled();
  await click('[aria-label^="Go to step 4:"]', null);
  await click('.onboarding-modal button', 'Start Analysis');
  await route('/analysis', 'Camera Setup');
  assert.equal(await evaluate(`!!document.querySelector('.onboarding-modal')`), false);
  await home();
  report.actions.push('How It Works Start Analysis opens Camera Setup and closes the modal');
  report.frames = await evaluate(`({...window.__audit})`);
  report.limits = [
    'Synthetic camera has no athlete; readiness is correctly disabled. The full ready-to-live flow needs a real athlete and is covered separately by the workflow integration test with mocked runtime inputs.',
    `Camera requests per setup entry: ${report.singleStart.cameraRequests}.`,
  ];
  assert.equal(report.frames.blankFrames, 0);
  assert.equal(report.frames.fullscreenLoaders, 0);
  assert.equal(report.frames.homeLoaders, 0);
  assert(report.frames.routeLoaders > 0, 'Slow lazy route shows real loading feedback');
  assert.equal(report.exceptions.length, 0);
  report.welcomeChecksPassed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await call('Fetch.disable');
  await call('Network.setCacheDisabled', { cacheDisabled: false });
  socket.close();
}
