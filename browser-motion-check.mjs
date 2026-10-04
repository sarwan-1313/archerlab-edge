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
  if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params.exceptionDetails.text);
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    browserErrors.push(message.params.entry.text);
  }
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
  const response = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, label, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function clickNav(label) {
  const clicked = await evaluate(`(() => {
    const item = [...document.querySelectorAll('.sidebar-nav__item, .bottom-nav__item')]
      .find((element) => element.textContent?.trim() === ${JSON.stringify(label)} && getComputedStyle(element).display !== 'none');
    item?.click();
    return Boolean(item);
  })()`);
  if (!clicked) throw new Error(`Navigation item ${label} was not found.`);
}

await Promise.all([
  call('Runtime.enable'),
  call('Page.enable'),
  call('Log.enable'),
]);

await evaluate(`localStorage.setItem('archerlab-edge:onboarding-complete', 'true'); location.replace('/')`);
await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('.welcome-page'))`, 'Home');

const initial = await evaluate(`(() => {
  const page = document.querySelector('.page-transition');
  const style = getComputedStyle(page);
  return {
    path: location.pathname,
    pageAnimation: style.animationName,
    pageDuration: style.animationDuration,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`);

await evaluate(`(() => {
  window.__motionLog = [];
  const main = document.querySelector('.app-main');
  window.__motionObserver?.disconnect();
  window.__motionObserver = new MutationObserver(() => {
    const child = main.firstElementChild;
    window.__motionLog.push({
      at: Math.round(performance.now()),
      hasChild: Boolean(child),
      loader: Boolean(main.querySelector('.app-loading-screen--route')),
      page: Boolean(main.querySelector('.page-transition')),
      path: location.pathname,
    });
  });
  window.__motionObserver.observe(main, { childList: true, subtree: true });
})()`);

await clickNav('Guide');
await waitFor(`location.pathname === '/guide' && document.querySelector('h1')?.textContent === 'User Guide'`, 'Guide');
await wait(350);
const lazyRoute = await evaluate(`({
  path: location.pathname,
  title: document.querySelector('h1')?.textContent,
  mutations: window.__motionLog,
  active: document.querySelector('.sidebar-nav__item[aria-current="page"]')?.textContent?.trim(),
  nativeTransitionSupport: document.documentElement.dataset.viewTransitionSupported,
})`);

await clickNav('Sessions');
await waitFor(`location.pathname === '/sessions' && document.querySelector('h1')?.textContent === 'Training Sessions'`, 'Sessions');
await clickNav('Analytics');
await waitFor(`location.pathname === '/analytics' && document.querySelector('h1')?.textContent === 'Performance Analytics'`, 'Analytics');

await evaluate(`history.back()`);
await waitFor(`location.pathname === '/sessions'`, 'Back navigation');
const backState = await evaluate(`({ path: location.pathname, active: document.querySelector('.sidebar-nav__item[aria-current="page"]')?.textContent?.trim() })`);
await evaluate(`history.forward()`);
await waitFor(`location.pathname === '/analytics'`, 'Forward navigation');
const forwardState = await evaluate(`({ path: location.pathname, active: document.querySelector('.sidebar-nav__item[aria-current="page"]')?.textContent?.trim() })`);

await clickNav('Guide');
await waitFor(`location.pathname === '/guide' && [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Replay quick start'))`, 'Guide before modal');
await wait(300);
const openedModal = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Replay quick start'));
  button?.click();
  return Boolean(button);
})()`);
if (!openedModal) throw new Error('Replay quick start button was not found.');
await waitFor(`Boolean(document.querySelector('.onboarding-modal'))`, 'Onboarding modal');
await wait(30);
const modalOpen = await evaluate(`(() => ({
  dialog: document.querySelector('.onboarding-modal')?.getAttribute('role'),
  focused: document.activeElement?.getAttribute('aria-label'),
  motionKind: document.documentElement.dataset.motionKind,
  animations: document.getAnimations().map((animation) => ({
    name: animation.animationName,
    duration: animation.effect?.getTiming().duration,
    pseudo: animation.effect?.pseudoElement,
  })).filter((animation) => animation.pseudo || animation.name?.startsWith('motion-')),
}))()`);
await evaluate(`document.querySelector('.onboarding-modal button[aria-label="Close onboarding"]')?.click()`);
await waitFor(`!document.querySelector('.onboarding-modal')`, 'Modal close');
await wait(200);

await call('Emulation.setEmulatedMedia', {
  media: '',
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});
await clickNav('Home');
await waitFor(`location.pathname === '/'`, 'Reduced-motion Home');
const reducedMotion = await evaluate(`(() => {
  const style = getComputedStyle(document.querySelector('.page-transition'));
  return {
    matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animation: style.animationName,
    transform: style.transform,
    nativeTransitionActive: document.documentElement.dataset.viewTransition,
  };
})()`);
await call('Emulation.setEmulatedMedia', { media: '', features: [] });

const responsive = [];
for (const width of [430, 768, 1024, 1440]) {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait(100);
  responsive.push(await evaluate(`(() => ({
    width: innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sidebar: getComputedStyle(document.querySelector('.sidebar-nav')).display,
    bottomNav: getComputedStyle(document.querySelector('.bottom-nav')).display,
    pageWidth: Math.round(document.querySelector('.page-transition').getBoundingClientRect().width),
  }))()`));
}

await call('Emulation.setDeviceMetricsOverride', {
  width: 430,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('motion-check-430.png', Buffer.from(screenshot.data, 'base64'));

const finalState = await evaluate(`({
  path: location.pathname,
  title: document.querySelector('h1')?.textContent,
  pageTransitions: document.querySelectorAll('.page-transition').length,
  routeLoaders: document.querySelectorAll('.app-loading-screen--route').length,
})`);

console.log(JSON.stringify({
  initial,
  lazyRoute,
  backState,
  forwardState,
  modalOpen,
  reducedMotion,
  responsive,
  finalState,
  browserErrors,
}, null, 2));

socket.close();
