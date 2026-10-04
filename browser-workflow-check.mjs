// Disposable CDP browser only: this audit creates its own recording fixture.
// node browser-deep-check.mjs http://127.0.0.1:5174 9341
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:5174';
const port = process.argv[3] ?? '9341';
const output = 'node_modules/.workflow-audit';
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

// Test-only pose input. Camera, recording, routing and analysis implementation remain real.
const original = await fetch(base + '/src/hooks/usePoseLandmarker.ts').then(r=>r.text());
const reactImport = original.match(/from ["']([^"']*react\.js[^"']*)["']/)?.[1];
assert(reactImport, 'Vite React import');
const poseFixture = 'import React from '+JSON.stringify(reactImport)+';const {useState,useEffect,useMemo,useRef}=React;'+
  'const points=Array.from({length:33},(_,i)=>({x:i%2?.4:.6,y:.2+i*.018,z:0,visibility:1,presence:1}));'+
  'export function usePoseLandmarker({active}){const [tick,setTick]=useState(0);useEffect(()=>{if(!active)return;const id=setInterval(()=>setTick(performance.now()),50);return()=>clearInterval(id)},[active]);'+
  'const result=useMemo(()=>active?{timestamp:tick,landmarks:points,worldLandmarks:[],athleteDetected:true,averageVisibility:1}:null,[active,tick]);const latestResultRef=useRef(result);latestResultRef.current=result;return {status:active?"running":"idle",error:null,result,latestResultRef,debugStats:{fps:20,landmarkCount:33,averageVisibility:1,videoWidth:640,videoHeight:480}}}';
socket.addEventListener('message', ({data})=>{const m=JSON.parse(data);if(m.method==='Fetch.requestPaused') void call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(poseFixture).toString('base64')});});
async function click(label, selector='button') {
  await until('!![...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>(b.getAttribute("aria-label")||b.textContent.trim())==='+JSON.stringify(label)+'&&!b.disabled)');
  await evaluate('[...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>(b.getAttribute("aria-label")||b.textContent.trim())==='+JSON.stringify(label)+'&&!b.disabled).click()');
}
async function layout(label){await until('!document.documentElement.dataset.viewTransition');await wait(250);for(const width of [390,430,768,1024,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await wait(60);report.layouts.push(await evaluate('({path:'+JSON.stringify(label)+',width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})'));}}
try {
  await Promise.all([call('Page.enable'),call('Runtime.enable')]);
  socket.addEventListener('message',({data})=>{if(JSON.parse(data).method==='Page.javascriptDialogOpening') void call('Page.handleJavaScriptDialog',{accept:true});});
  await call('Fetch.enable',{patterns:[{urlPattern:'*usePoseLandmarker.ts*',requestStage:'Request'}]});
  await navigate('/');
  await evaluate('localStorage.setItem("archerlab-edge:onboarding-complete","true")');
  await navigate('/');
  report.console=[];report.exceptions=[];
  await click('Start Analysis');await until('document.querySelector("main h1")?.textContent==="Camera Setup"');
  await click('Continue to Readiness');await layout('Readiness');
  await click('Back to Camera Setup');await click('Continue to Readiness');
  await click('Continue');await click('Start Session');
  await until('!!document.querySelector(".training-live-page")');await layout('Live Analysis');
  await click('Pause');await click('Resume');
  await wait(2500);await click('Mark release');await until('!!document.querySelector(".shot-review-panel")');
  if(await evaluate('!!document.querySelector(".gesture-overlay")')) await click('Enter Manually','.gesture-overlay button');
  await click('8','.quick-score-entry button');await click('Confirm Score');
  await click('Review Details');await click('Hide Details');await layout('Shot review');
  await click('Continue Session');
  await click('End Session');await until('!!document.querySelector("[role=alertdialog]")');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
  await until('!document.querySelector("[role=alertdialog]")');
  await click('End Session');await click('End Session','[role=alertdialog] button');
  await until('document.querySelector("main h1")?.textContent==="Session Complete"');await layout('Summary');
  await click('Go to Home','button[aria-label="Go to Home"]');
  await until('!!document.querySelector(".welcome-page")');
  await click('Sessions','.sidebar-nav button');await until('!!document.querySelector(".session-list")');
  await click('Open session');await until('!!document.querySelector(".session-player video")');
  await click('Close replay','button[aria-label="Close replay"]');
  await click('Analytics','.sidebar-nav button');await until('!!document.querySelector(".analytics-shot-rows")');await layout('Analytics with shots');
  await evaluate('document.querySelector(".analytics-shot-rows button").click()');
  await until('!!document.querySelector(".replay-page")');await layout('Biomechanics replay');
  await click('Add Actual Result');await click('9','.score-keypad button');await click('Confirm Shot Result');await until('!!document.querySelector(".replay-page")');
  await navigate('/analytics');assert.equal(await evaluate('document.querySelectorAll(".analytics-shot-rows button").length'),1);
  await click('Guide','.sidebar-nav button');await until('!!document.querySelector(".guide-step-link")');await evaluate('document.querySelector(".guide-step-link").click()');await until('!!document.querySelector(".guide-detail-page")');
  await click('Go to Home','button[aria-label="Go to Home"]');await until('location.pathname==="/"');
  await evaluate('history.back()');await until('!!document.querySelector(".guide-detail-page")');await evaluate('history.forward()');await until('!!document.querySelector(".welcome-page")');
  report.completed = true;report.poseInput='Synthetic landmarks injected only in the audit browser; not a real-athlete validation.';
  assert.equal(report.exceptions.length,0);assert(report.layouts.every(l=>l.overflow===0));
} catch(error){report.failure=error.stack;process.exitCode=1;}
finally {await call('Fetch.disable');await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));socket.close();}
