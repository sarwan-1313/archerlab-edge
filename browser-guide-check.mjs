import { writeFile } from 'node:fs/promises';

const targets = await fetch('http://127.0.0.1:9335/json/list').then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5178'));
if (!target) throw new Error('ArcherLab browser target was not found.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const browserErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    browserErrors.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '));
  }
});

function call(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, label, timeout = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await wait(60);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function navigate(path, heading) {
  await call('Page.navigate', { url: `http://127.0.0.1:5178${path}` });
  await waitFor(`location.pathname === ${JSON.stringify(path)} && document.querySelector('h1')?.textContent === ${JSON.stringify(heading)}`, path);
}

await Promise.all([call('Runtime.enable'), call('Page.enable'), call('Log.enable')]);
await evaluate(`localStorage.setItem('archerlab-edge:onboarding-complete', 'true')`);
await navigate('/guide', 'User Guide');

const expectedSteps = [
  ['/guide/start-analysis', 'Start Analysis'],
  ['/guide/camera-setup', 'Set Up Camera'],
  ['/guide/readiness', 'Confirm Readiness'],
  ['/guide/start-session', 'Start Session'],
  ['/guide/perform-shots', 'Perform Shots'],
  ['/guide/record-scores', 'Record Scores'],
  ['/guide/review-shots', 'Review Shots'],
  ['/guide/end-session', 'End Session'],
  ['/guide/session-summary', 'Review Session Summary'],
  ['/guide/analytics', 'View Analytics'],
];

const overview = await evaluate(`(() => ({
  linkCount: document.querySelectorAll('.guide-step-link').length,
  hrefs: [...document.querySelectorAll('.guide-step-link')].map((link) => link.getAttribute('href')),
  allSemanticLinks: [...document.querySelectorAll('.guide-step-link')].every((link) => link.tagName === 'A'),
  activeNavigation: document.querySelector('.sidebar-nav__item[aria-current="page"]')?.textContent?.trim(),
}))()`);

const openedSteps = [];
for (const [path, title] of expectedSteps) {
  const clicked = await evaluate(`(() => {
    const link = document.querySelector('.guide-step-link[href=${JSON.stringify(path)}]');
    link?.click();
    return Boolean(link);
  })()`);
  if (!clicked) throw new Error(`Guide card ${path} was not found.`);
  await waitFor(`location.pathname === ${JSON.stringify(path)} && document.querySelector('h1')?.textContent === ${JSON.stringify(title)}`, title);
  openedSteps.push(await evaluate(`(() => ({
    path: location.pathname,
    title: document.querySelector('h1')?.textContent,
    step: document.querySelector('.guide-manual__meta')?.textContent,
    sections: ['Step-by-step', 'Expected result', 'Tips', 'Troubleshooting'].every((label) => [...document.querySelectorAll('h2')].some((heading) => heading.textContent === label)),
    guideHighlighted: document.querySelector('.sidebar-nav__item[aria-current="page"]')?.textContent?.trim() === 'Guide',
  }))()`));
  await evaluate(`document.querySelector('.guide-manual-nav__back')?.click()`);
  await waitFor(`location.pathname === '/guide' && document.querySelectorAll('.guide-step-link').length === 10`, 'Back to Guide');
}

const focusState = await evaluate(`(() => {
  const link = document.querySelector('.guide-step-link[href="/guide/camera-setup"]');
  link.focus({ focusVisible: true });
  const style = getComputedStyle(link);
  return {
    focused: document.activeElement === link,
    focusVisible: link.matches(':focus-visible'),
    outlineWidth: style.outlineWidth,
    outlineStyle: style.outlineStyle,
  };
})()`);
await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await waitFor(`location.pathname === '/guide/camera-setup'`, 'keyboard activation');
const keyboardPath = await evaluate('location.pathname');

await navigate('/guide/start-analysis', 'Start Analysis');
await evaluate(`document.querySelector('.guide-manual-nav__step--next')?.click()`);
await waitFor(`location.pathname === '/guide/camera-setup'`, 'Next navigation');
await evaluate('history.back()');
await waitFor(`location.pathname === '/guide/start-analysis'`, 'browser Back');
const backPath = await evaluate('location.pathname');
await evaluate('history.forward()');
await waitFor(`location.pathname === '/guide/camera-setup'`, 'browser Forward');
const forwardPath = await evaluate('location.pathname');

await navigate('/guide/review-shots', 'Review Shots');
await call('Page.reload', { ignoreCache: true });
await waitFor(`location.pathname === '/guide/review-shots' && document.querySelector('h1')?.textContent === 'Review Shots'`, 'detail refresh');
const refreshPath = await evaluate('location.pathname');

const responsive = [];
for (const width of [430, 768, 1024, 1440]) {
  await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(100);
  await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await wait(50);
  responsive.push(await evaluate(`(() => {
    const detail = document.querySelector('.guide-detail-page').getBoundingClientRect();
    const manualNavigation = document.querySelector('.guide-manual-nav').getBoundingClientRect();
    const bottomNavigation = document.querySelector('.bottom-nav');
    const bottomNavigationStyle = bottomNavigation ? getComputedStyle(bottomNavigation) : null;
    return {
      width: innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      detailWithinViewport: detail.left >= 0 && detail.right <= innerWidth,
      contentsSidebar: getComputedStyle(document.querySelector('.guide-contents')).display,
      contentsSelect: getComputedStyle(document.querySelector('.guide-contents-select')).display,
      manualNavigationWithinViewport: manualNavigation.width <= innerWidth,
      fixedNavigationClear: !bottomNavigation || bottomNavigationStyle.display === 'none' || manualNavigation.bottom <= bottomNavigation.getBoundingClientRect().top,
    };
  })()`));
}

await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await navigate('/guide', 'User Guide');
const overviewResponsive = [];
for (const width of [430, 768, 1024, 1440]) {
  await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(100);
  overviewResponsive.push(await evaluate(`({
    width: innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cardsWithinViewport: [...document.querySelectorAll('.guide-step-link')].every((card) => {
      const bounds = card.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    }),
    arrowsVisible: [...document.querySelectorAll('.guide-step-link__arrow')].every((arrow) => getComputedStyle(arrow).display !== 'none'),
  })`));
}

await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await wait(100);
const desktopShot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('guide-check-desktop.png', Buffer.from(desktopShot.data, 'base64'));

await navigate('/guide/camera-setup', 'Set Up Camera');
const detailDesktopShot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('guide-check-detail-desktop.png', Buffer.from(detailDesktopShot.data, 'base64'));

await call('Emulation.setDeviceMetricsOverride', { width: 430, height: 1000, deviceScaleFactor: 1, mobile: false });
await wait(100);
const mobileShot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('guide-check-mobile.png', Buffer.from(mobileShot.data, 'base64'));

console.log(JSON.stringify({
  overview,
  openedSteps,
  focusState,
  keyboardPath,
  backPath,
  forwardPath,
  refreshPath,
  responsive,
  overviewResponsive,
  browserErrors,
}, null, 2));

socket.close();
