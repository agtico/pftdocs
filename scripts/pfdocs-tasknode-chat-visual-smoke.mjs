import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);const WebSocket=require('ws');
const rootPath=new URL('../',import.meta.url).pathname;
const screenshotDir=process.env.SCREENSHOT_DIR || new URL('../artifacts/tasknode-chat/',import.meta.url).pathname;
const docType=process.env.DOC_TYPE==='pad'?'pad':'sheet';
const persona=process.env.DOCS_TEST_PERSONA==='coach'?'coach':'odv';
const assistantReply=process.env.DOCS_TEST_LONG_REPLY==='true'?'Detailed document analysis and next steps. '.repeat(2500)+'COMPLETE_RESPONSE_TAIL':'Spreadsheet assistant fixture response.';
const deployed=process.env.PFDOCS_LIVE_DEPLOYED==='true';
await mkdir(screenshotDir,{recursive:true});
const targets=await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9349}/json/list`).then(r=>r.json());const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();const sessions=new Map();
function command(method,params={},sessionId){const id=++seq;ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
const paths=['/common/sframe-app-framework.js','/common/sframe-common-outer.js','/common/sframe-common.js','/common/toolbar.js','/common/onlyoffice/inner.js','/common/onlyoffice/app-oo.less','/pad/app-pad.less','/customize/src/less2/include/tasknode-chat.less','/common/messenger-ui.js','/common/tasknode-chat-protocol.js'];
const overrides=[];
ws.on('message',async raw=>{const m=JSON.parse(String(raw));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);return;}
try{
if(m.method==='Target.attachedToTarget'){const sid=m.params.sessionId;sessions.set(sid,m.params.targetInfo);if(m.params.targetInfo.type.endsWith('worker')){await command('Runtime.runIfWaitingForDebugger',{},sid);return;}await command('Fetch.enable',{patterns:[{urlPattern:'*'}]},sid);await command('Network.setCacheDisabled',{cacheDisabled:true},sid);await command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true},sid);await command('Runtime.runIfWaitingForDebugger',{},sid);}
if(m.method==='Fetch.requestPaused'){const {requestId,request}=m.params;const url=new URL(request.url);if(!deployed&&paths.includes(url.pathname)){const local=rootPath+(url.pathname.startsWith('/customize/')?'customize.dist/'+url.pathname.slice(11):'www'+url.pathname);try{const body=await readFile(local);await command('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:url.pathname.endsWith('.less')?'text/css':'application/javascript'}],body:body.toString('base64')},m.sessionId);overrides.push(url.pathname);return;}catch(e){console.log('Override missing',local,e.message);}}
await command('Fetch.continueRequest',{requestId},m.sessionId);}
}catch(e){console.log('event error',e.message)}});
await command('Page.enable');await command('Runtime.enable');await command('Fetch.enable',{patterns:[{urlPattern:'*'}]});await command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});await command('Network.setCacheDisabled',{cacheDisabled:true});await command('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
async function evalJs(expression,sessionId){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));await command('Page.navigate',{url:'https://tasknode.postfiat.org/#docs'});await delay(4000);
const requestId=crypto.randomUUID();const bridge=new URL('https://tasknode-pfdocs.fly.dev/tasknode/');bridge.searchParams.set('action','create');bridge.searchParams.set('documentType',docType);bridge.searchParams.set('requestId',requestId);bridge.searchParams.set('returnOrigin','https://tasknode.postfiat.org');
await evalJs(`(()=>{document.body.style.overflow='hidden';document.body.innerHTML='<header style="height:60px;display:flex;align-items:center;padding:0 24px;font:14px system-ui;background:#faf9f6;border-bottom:1px solid #ddd">Task Node · Spreadsheet <button id="chat" style="margin-left:auto">Chat</button></header>';const frame=document.createElement('iframe');frame.id='test-sheet';frame.style.cssText='display:block;width:100%;height:calc(100vh - 60px);border:0';globalThis.__events=[];globalThis.__assistantReply=${JSON.stringify(assistantReply)};addEventListener('message',e=>{if(e.origin!=='https://tasknode-pfdocs.fly.dev'||e.source!==frame.contentWindow)return;globalThis.__events.push(e.data);if(e.data.type==='pfdocs.tasknode.document-created'){globalThis.__cap=e.data;frame.contentWindow.postMessage({type:'tasknode.pfdocs.context',requestId:${JSON.stringify(requestId)},channelHash:e.data.channelHash,documentId:'fixture-sheet',documentOwned:true,title:'Spreadsheet chat verification',identity:{accountId:'fixture-sheet',displayName:'@alex',hiveHandle:'alex'},odv:{enabled:true},agents:[{persona:'odv',mention:'@ODV'},{persona:'coach',mention:'@coach'}]},e.origin);}if(e.data.type==='pfdocs.tasknode.assistant-request'){frame.contentWindow.postMessage({...e.data,type:'tasknode.pfdocs.assistant-response',ok:true,response:globalThis.__assistantReply,label:e.data.persona==='coach'?'Trading Coach':'ODV',model:'zai/glm-5.3'},e.origin);}});document.getElementById('chat').onclick=()=>frame.contentWindow.postMessage({type:'tasknode.pfdocs.command',command:'chat-toggle',requestId:${JSON.stringify(requestId)},channelHash:globalThis.__cap.channelHash},'https://tasknode-pfdocs.fly.dev');frame.src=${JSON.stringify(bridge.toString())};document.body.append(frame);})()`);

async function untilRoot(expression) {
  for(let i=0;i<180;i++){if(await evalJs(expression))return;await delay(250);}
  throw new Error('Bridge readiness timeout');
}
await untilRoot("globalThis.__events.some(e=>e.type==='pfdocs.tasknode.ready') && !!globalThis.__cap");
let innerSession;
for(let attempt=0;attempt<100&&!innerSession;attempt++){
  for(const [sid,info] of sessions){
    if(info.type!=='iframe')continue;
    try{if(await evalJs("Boolean(document.querySelector('.cp-toolbar-chat-drawer'))",sid))innerSession=sid;}catch{/* A transient frame may already have closed. */}
  }
  if(!innerSession)await delay(200);
}
assert.ok(innerSession,'Chat frame did not load');
const inner=expression=>evalJs(expression,innerSession);
const root=evalJs;
async function until(expression){for(let i=0;i<100;i++){if(await inner(expression))return;await delay(150);}throw new Error('Chat browser check timed out: '+expression);}
async function capture(name){const img=await command('Page.captureScreenshot',{format:'png'});await writeFile(screenshotDir+'/'+name+'.png',Buffer.from(img.data,'base64'));}
await until("Boolean(window.CryptPad_taskNodeContext) && !document.querySelector('.cp-app-contacts-initializing')");
assert.equal(await inner("getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display"),'none');
await root("document.getElementById('chat').click()");await until("getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display !== 'none' && !!document.querySelector('.cp-app-contacts-input textarea')");
if(docType==='sheet'){
await until("typeof((window.frames[0].editor||window.frames[0].editorCell)?.GetActiveSheet)==='function'");
await inner("(()=>{const api=window.frames[0].editor||window.frames[0].editorCell;api.GetActiveSheet().GetRange('A1:B3').SetValue([['Category','Amount'],['Office',120],['Supplies',45]]);})()");
}else{
  await root("(()=>{document.getElementById('test-sheet').contentWindow.postMessage({type:'tasknode.pfdocs.command',command:'import-content',requestId:globalThis.__cap.requestId,channelHash:globalThis.__cap.channelHash,file:{name:'budget.md',mimeType:'text/markdown',content:'Office budget: 120. Supplies: 45.'}},'https://tasknode-pfdocs.fly.dev');})()");
  await until("globalThis.CKEDITOR?.instances?.editor1?.getData().includes('Office budget')");
}
await inner("(()=>{const input=document.querySelector('.cp-app-contacts-input textarea');input.value='Budget is ready for review.';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.cp-tasknode-chat-send').click();})()");
await until("document.querySelector('.cp-app-contacts-messages').innerText.includes('Budget is ready for review.')");
await inner(`(()=>{const input=document.querySelector('.cp-app-contacts-input textarea');input.value=${JSON.stringify('@'+persona+' what is the total in this sheet?')};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.cp-tasknode-chat-send').click();})()`);
await until(`document.querySelector('.cp-app-contacts-messages').innerText.includes(${JSON.stringify(assistantReply.slice(-25))})`);
const request=await root("globalThis.__events.find(e=>e.type==='pfdocs.tasknode.assistant-request')");
assert.equal(request.persona,persona);
assert.ok((await inner("document.querySelector('.cp-app-contacts-messages').innerText")).includes(assistantReply.trim()));
if(docType==='sheet'){const context=JSON.parse(request.documentContent);assert.equal(context.type,'spreadsheet');assert.ok(context.sheets[0].rows.some(r=>r.cells.map(String).includes('120')));}assert.ok(request.recentMessages.some(m=>m.text.includes('Budget is ready')));
const rect=await inner("(()=>{const drawer=document.querySelector('.cp-toolbar-chat-drawer').getBoundingClientRect(), input=document.querySelector('.cp-app-contacts-input textarea').getBoundingClientRect(), button=document.querySelector('.cp-tasknode-chat-send').getBoundingClientRect();return {drawerWidth:drawer.width,inputWidth:input.width,inputBottom:input.bottom,drawerBottom:drawer.bottom,buttonRight:button.right,drawerRight:drawer.right,viewport:innerWidth,scroll:document.documentElement.scrollWidth}})()");assert.ok(rect.inputWidth>100);assert.ok(rect.inputBottom<=rect.drawerBottom);assert.ok(rect.buttonRight<=rect.drawerRight);assert.ok(rect.scroll<=rect.viewport);
await capture('after-'+docType+'-chat-desktop');
await inner("document.querySelector('.cp-tasknode-chat-collapse').click()");assert.equal(await inner("getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display"),'none');
await root("document.getElementById('chat').click()");await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(500);
const mobile=await inner("(()=>{const d=document.querySelector('.cp-toolbar-chat-drawer').getBoundingClientRect(),i=document.querySelector('.cp-app-contacts-input textarea').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:d.left,right:d.right,inputWidth:i.width,inputBottom:i.bottom,drawerBottom:d.bottom,viewportHeight:innerHeight}})()");assert.ok(mobile.scroll<=mobile.width);assert.ok(mobile.left>=0&&mobile.right<=mobile.width);assert.ok(mobile.inputWidth>100);assert.ok(mobile.inputBottom<=mobile.drawerBottom);assert.ok(mobile.drawerBottom<=mobile.viewportHeight);if(docType==='sheet')assert.equal(mobile.left>=0,true);
await capture('after-'+docType+'-chat-mobile');
await writeFile(screenshotDir+'/../'+docType+'-results.json',JSON.stringify({passed:true,persona,responseLength:assistantReply.length,mode:deployed?'Deployed PFDocs, no source overlays, fixture assistant response':'Real encrypted PFDocs with local source overlays and a fixture assistant response',checks:['ready handshake','closed initially','human message delivery','assistant request and response','cell context for sheets','same-channel history','collapse and reopen','desktop and mobile containment'],desktop:rect,mobile,overrides:[...new Set(overrides)]},null,2)+'\n');
console.log(docType+': chat browser checks passed.');
ws.close();
