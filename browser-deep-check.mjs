// Disposable CDP browser only: this audit creates its own recording fixture.
// node browser-deep-check.mjs http://127.0.0.1:5174 9341
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:5174';
const port = process.argv[3] ?? '9341';
const output = 'node_modules/.deep-audit';
await mkdir(output, { recursive: true });
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const report = { layouts: [], controls: [], console: [], exceptions: [] };
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(m.params.exceptionDetails);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) report.console.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
function call(method, params = {}) { return new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(expression) { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await wait(100); } throw Error(`Timeout: ${expression}`); }
async function navigate(path) { await evaluate('window.__leavingAuditDocument=true'); await call('Page.navigate', { url: base + path }); await until(`!window.__leavingAuditDocument && document.readyState === 'complete' && !!document.querySelector('main h1') && !document.querySelector('.app-loading-screen')`); }
try {
  await Promise.all([call('Page.enable'), call('Runtime.enable')]);
  await navigate('/');
  await evaluate(`localStorage.setItem('archerlab-edge:onboarding-complete','true')`);
  for (const path of ['/', '/analysis', '/camera', '/readiness', '/sessions', '/replay-analysis', '/analytics', '/guide', '/guide/readiness', '/profile', '/multi-camera', '/manual-shot-entry', '/gesture-guide']) {
    await navigate(path);
    for (const width of [390, 430, 768, 1024, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await wait(70);
      report.layouts.push(await evaluate(`({path:location.pathname,width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`));
    }
    report.controls.push(await evaluate(`({path:location.pathname,heading:document.querySelector('main h1').textContent,buttons:[...document.querySelectorAll('main button,main select')].map(b=>({label:b.getAttribute('aria-label')||b.textContent.trim(),disabled:b.disabled})),text:document.querySelector('main').innerText})`));
    await evaluate(`document.querySelector('.app-brand').click()`);
    await until(`location.pathname === '/' && !!document.querySelector('.welcome-page')`);
  }
  await navigate('/sessions');
  // Record actual synthetic video; never touch the user's normal browser storage.
  await evaluate(`(async()=>{
    const storage=await import('/src/recording/recordingStorage.ts');
    const stream=await navigator.mediaDevices.getUserMedia({video:true});
    const chunks=[];const recorder=new MediaRecorder(stream);
    recorder.ondataavailable=e=>chunks.push(e.data);
    const done=new Promise(r=>recorder.onstop=r);recorder.start();await new Promise(r=>setTimeout(r,2800));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
    await storage.saveRecordingManifest({id:'deep-audit-fixture',sessionId:'Audit recording',startedAt:Date.now(),durationMs:2800});
    await storage.addChunk('deep-audit-fixture',0,new Blob(chunks,{type:recorder.mimeType}),0);
    for(const tMs of [1000,2000]) await storage.addTelemetry('deep-audit-fixture',{tMs,type:'shot',shoulderLineAngleDeg:null,poseConfidence:null});
  })()`);
  await navigate('/sessions');
  await until(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Open session')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Open session').click()`);
  await until(`!!document.querySelector('.session-player video')?.src`);
  await wait(600);
  report.replay = await evaluate(`({text:document.querySelector('.session-player').innerText,videoError:document.querySelector('.session-player video').error?.message})`);
  for(const width of [390,430,768,1024,1440]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await wait(50);
    report.layouts.push(await evaluate(`({path:'session-review',width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`));
  }
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`${output}/review.png`,Buffer.from(shot.data,'base64'));
  await navigate('/analysis');
  await until(`!!document.querySelector('video')?.srcObject`);
  report.readinessBlocked = await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Continue to Readiness')).disabled`);
  await navigate('/unknown-audit-route');
  assert.equal(await evaluate('location.pathname'), '/');
  report.unknownRoute = 'Home';
  assert.equal(report.exceptions.length,0);
} catch(error) { report.failure=error.stack; process.exitCode=1; }
finally { await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));socket.close(); }
