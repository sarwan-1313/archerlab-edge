import { writeFile } from 'node:fs/promises';

const targets = await fetch('http://127.0.0.1:9336/json/list').then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5178'));
if (!target) throw new Error('ArcherLab fake-camera target was not found.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const errors = [];

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
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '));
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
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
}
async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

await Promise.all([call('Runtime.enable'), call('Page.enable'), call('Log.enable')]);
await evaluate(`localStorage.setItem('archerlab-edge:onboarding-complete', 'true'); location.replace('/')`);
await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('.welcome-page'))`, 'Home');

await evaluate(`(() => {
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.__cameraRequests = 0;
  navigator.mediaDevices.getUserMedia = (...args) => {
    window.__cameraRequests += 1;
    return original(...args);
  };
})()`);

await evaluate(`[...document.querySelectorAll('.sidebar-nav__item')].find((item) => item.textContent?.trim() === 'Live Analysis')?.click()`);
await waitFor(`location.pathname === '/analysis' && document.querySelector('h1')?.textContent === 'Camera Setup'`, 'Camera Setup');
await waitFor(`Boolean(document.querySelector('video')?.srcObject) && !document.querySelector('.camera-preview--loading')`, 'fake camera stream', 8000).catch(() => undefined);
await wait(1200);

const before = await evaluate(`(() => {
  const video = document.querySelector('video');
  const canvas = document.querySelector('.pose-overlay');
  const track = video?.srcObject?.getVideoTracks?.()[0];
  return {
    path: location.pathname,
    heading: document.querySelector('h1')?.textContent,
    cameraRequests: window.__cameraRequests,
    streamActive: video?.srcObject?.active,
    trackId: track?.id,
    trackState: track?.readyState,
    pageClass: document.querySelector('.page-transition')?.className,
    pageTransform: document.querySelector('.page-transition') ? getComputedStyle(document.querySelector('.page-transition')).transform : null,
    videoTransform: video ? getComputedStyle(video).transform : null,
    canvasTransform: canvas ? getComputedStyle(canvas).transform : null,
    poseStatus: document.querySelector('.pose-status__badge')?.textContent?.trim(),
    cameraError: document.querySelector('.camera-preview__state--error p')?.textContent?.trim(),
  };
})()`);

await wait(1200);
const after = await evaluate(`(() => {
  const video = document.querySelector('video');
  const track = video?.srcObject?.getVideoTracks?.()[0];
  return {
    cameraRequests: window.__cameraRequests,
    streamActive: video?.srcObject?.active,
    trackId: track?.id,
    trackState: track?.readyState,
    activeAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').map((animation) => animation.animationName),
  };
})()`);

const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('motion-check-live.png', Buffer.from(screenshot.data, 'base64'));

console.log(JSON.stringify({ before, after, stableCamera: before.trackId === after.trackId && before.cameraRequests === after.cameraRequests, errors }, null, 2));
socket.close();
