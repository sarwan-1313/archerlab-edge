// Disposable CDP browser only: this audit creates its own recording fixture.
// node browser-deep-check.mjs http://127.0.0.1:5174 9341
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:5174';
const port = process.argv[3] ?? '9341';
const output = 'node_modules/.error-audit';
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
 await Promise.all([call('Page.enable'),call('Runtime.enable')]);
 await navigate('/');report.console=[];report.exceptions=[];
 const denied = await call('Page.addScriptToEvaluateOnNewDocument',{source:'navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException("Denied for audit","NotAllowedError")};'});
 await navigate('/analysis');await until('!!document.querySelector(".camera-preview--error")');
 assert((await evaluate('document.querySelector("main").innerText')).includes('permission was denied'));
 assert(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Continue to Readiness")).disabled'));
 await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Try Camera Again")).click()');await until('!!document.querySelector(".camera-preview--error")');
 report.deniedPermission='Specific feedback, readiness blocked, retry returns to error without unhandled promises';
 await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:denied.identifier});
 await navigate('/analysis');await until('!!document.querySelector("video")?.srcObject');report.retryRecovery='Camera resumes after permission is restored';
 await navigate('/sessions');
 const blocked=await call('Page.addScriptToEvaluateOnNewDocument',{source:'indexedDB.open=()=>{throw new DOMException("Blocked for audit","SecurityError")};'});
 await navigate('/sessions');await until('!!document.querySelector(".empty-state--error")');
 await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent.trim()==="Retry").click()');await until('!!document.querySelector(".empty-state--error")');
 report.storageFailure='Local library shows a retryable storage error';await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:blocked.identifier});
 await navigate('/sessions');await until('!!document.querySelector(".session-list")');
 report.storageRecovery='Saved sessions remain available after storage access is restored';
 await navigate('/');assert.equal(report.exceptions.length,0);
} catch(error){report.failure=error.stack;process.exitCode=1;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));socket.close();}
