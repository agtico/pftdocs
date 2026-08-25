#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const cdpPort = Number(process.env.CDP_PORT || 9223);
const taskNodeOrigin = process.env.TASKNODE_ORIGIN || "https://tasknode.postfiat.org";
const pfdocsOrigin = process.env.PFDOCS_MAIN_ORIGIN || "https://tasknode-pfdocs.fly.dev";
const sandboxOrigin = process.env.PFDOCS_SANDBOX_ORIGIN || "https://tasknode-pfdocs-sandbox.fly.dev";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page" && entry.url === "about:blank") || targets.find((entry) => entry.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "No Chrome page target is available");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let nextId = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});
function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { reject, resolve }));
}

await command("Page.enable");
await command("Runtime.enable");
// Always start from a fresh top-level document so repeated smoke runs cannot
// retain an older PFDocs iframe/listener and accidentally target its sandbox.
await command("Page.navigate", { url: "about:blank" });
await delay(500);
await command("Page.navigate", { url: `${taskNodeOrigin}/#docs` });
await delay(3_000);
const requestId = crypto.randomUUID();
const bridge = new URL("/tasknode/", pfdocsOrigin);
bridge.searchParams.set("action", "create");
bridge.searchParams.set("requestId", requestId);
bridge.searchParams.set("returnOrigin", taskNodeOrigin);
const createdResult = await command("Runtime.evaluate", {
  awaitPromise: true,
  returnByValue: true,
  expression: `new Promise((resolve) => {
    globalThis.__pfdocsEvents = [];
    const iframe = document.createElement("iframe");
    iframe.id = "pfdocs-embedded-smoke";
    iframe.src = ${JSON.stringify(bridge.toString())};
    iframe.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999";
    addEventListener("message", (event) => {
      if (event.origin !== ${JSON.stringify(pfdocsOrigin)} || event.source !== iframe.contentWindow) return;
      globalThis.__pfdocsEvents.push(event.data);
      if (["pfdocs.tasknode.assistant-request", "pfdocs.tasknode.odv-request"].includes(event.data?.type)) {
        const persona = event.data.persona || "odv";
        const prompt = String(event.data.prompt || "");
        const queuedTurn = prompt.includes("queue turn");
        setTimeout(() => iframe.contentWindow.postMessage({
          type: event.data.type === "pfdocs.tasknode.odv-request" ? "tasknode.pfdocs.odv-response" : "tasknode.pfdocs.assistant-response",
          requestId: event.data.requestId,
          assistantRequestId: event.data.assistantRequestId,
          odvRequestId: event.data.odvRequestId,
          channelHash: event.data.channelHash,
          ok: true,
          persona,
          label: persona === "coach" ? "Trading Coach" : "ODV",
          response: queuedTurn ? "Routed " + persona + ": " + prompt :
            persona === "coach" ? "Coach bridge response" : "First response paragraph.\\n\\nSecond response paragraph.",
          model: "z-ai/glm-5.2"
        }, ${JSON.stringify(pfdocsOrigin)}), prompt.includes("queue turn one") ? 20000 : queuedTurn ? 500 : 0);
      }
      if (event.data?.type === "pfdocs.tasknode.document-created") resolve(event.data);
    });
    document.body.append(iframe);
    setTimeout(() => resolve({ error: "create_timeout" }), 30000);
  })`,
});
const capability = createdResult?.result?.value;
assert.equal(capability?.type, "pfdocs.tasknode.document-created", JSON.stringify(capability));
assert.match(capability.channelHash, /^[0-9a-f]{32}$/i);
const afterCreate = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
assert.equal(afterCreate.filter((entry) => entry.type === "page").length, 1, "Embedded creation opened a popup window");
const inner = afterCreate.find((entry) => entry.type === "iframe" && entry.url.startsWith(`${sandboxOrigin}/pad/inner.html`));
assert.ok(inner?.webSocketDebuggerUrl, "The embedded PFDocs sandbox did not load");

const innerSocket = new WebSocket(inner.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { innerSocket.once("open", resolve); innerSocket.once("error", reject); });
let innerNextId = 0;
const innerPending = new Map();
innerSocket.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (!message.id || !innerPending.has(message.id)) return;
  const handlers = innerPending.get(message.id);
  innerPending.delete(message.id);
  handlers.resolve(message);
});
function innerCommand(expression, { awaitPromise = false } = {}) {
  const id = ++innerNextId;
  innerSocket.send(JSON.stringify({
    id,
    method: "Runtime.evaluate",
    params: { awaitPromise, returnByValue: true, expression },
  }));
  return new Promise((resolve, reject) => innerPending.set(id, { reject, resolve }));
}

const canonicalTitle = `Task Node title ${requestId}`;
await command("Runtime.evaluate", {
  expression: `document.getElementById("pfdocs-embedded-smoke").contentWindow.postMessage(${JSON.stringify({
    type: "tasknode.pfdocs.context",
    requestId,
    channelHash: capability.channelHash,
    documentId: crypto.randomUUID(),
    documentOwned: true,
    title: canonicalTitle,
    identity: { accountId: "smoke-account", displayName: "@smoke", hiveHandle: "smoke", walletAddress: "rSmokeWallet" },
    odv: { enabled: true, mention: "@ODV", model: "z-ai/glm-5.2", provider: "ambient" },
    agents: [{ persona: "odv", mention: "@ODV" }, { persona: "coach", mention: "@coach" }],
  })}, ${JSON.stringify(pfdocsOrigin)})`,
});
let contextState;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await delay(250);
  const result = await innerCommand(`({
    context: globalThis.CryptPad_taskNodeContext,
    title: globalThis.APP?.framework?._?.title?.getTitle?.(),
    chatVisible: Boolean(document.querySelector('.cp-toolbar-chat-drawer') && getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display !== 'none'),
    chatExists: Boolean(document.querySelector('.cp-toolbar-chat-drawer')),
    chatDisplay: document.querySelector('.cp-toolbar-chat-drawer') ? getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display : null,
    chatInitializing: Boolean(document.querySelector('#cp-app-contacts-container.cp-app-contacts-initializing')),
    chatChannels: Object.keys(globalThis.state?.channels || {}),
    chatActive: globalThis.state?.active || '',
    chatInputVisible: Boolean(document.querySelector('.cp-app-contacts-input textarea') && getComputedStyle(document.querySelector('.cp-app-contacts-input textarea')).display !== 'none'),
    taskNodeTheme: document.body.classList.contains('cp-tasknode-document'),
    legacyToolbarHidden: Boolean(document.querySelector('#cp-app-pad-toolbar') && getComputedStyle(document.querySelector('#cp-app-pad-toolbar')).display === 'none'),
    formattingToolbarVisible: Boolean(document.querySelector('.cke_toolbox_main') && getComputedStyle(document.querySelector('.cke_toolbox_main')).display !== 'none'),
    formattingToolbarRows: [...new Set([...document.querySelectorAll('.cp-tasknode-formatbar-primary > .cke_toolbar')].map((toolbar) => Math.round(toolbar.getBoundingClientRect().top)))].length,
    formattingControlsClipped: (() => {
      const primary = document.querySelector('.cp-tasknode-formatbar-primary');
      if (!primary) return true;
      const bounds = primary.getBoundingClientRect();
      return [...primary.querySelectorAll('.cke_button, .cke_combo')].filter((control) => getComputedStyle(control).display !== 'none').some((control) => {
        const rect = control.getBoundingClientRect();
        return rect.top < bounds.top || rect.bottom > bounds.bottom || rect.right > bounds.right + 1;
      });
    })(),
    formattingOverflowGroups: document.querySelectorAll('.cp-tasknode-formatbar-overflow > .cke_toolbar').length,
    formattingMoreVisible: Boolean(document.querySelector('.cp-tasknode-formatbar-more') && getComputedStyle(document.querySelector('.cp-tasknode-formatbar-more')).display !== 'none'),
    statusVisible: Boolean(document.querySelector('.cp-tasknode-editor-status') && getComputedStyle(document.querySelector('.cp-tasknode-editor-status')).display !== 'none'),
    wordCountInStatus: Boolean(document.querySelector('.cp-tasknode-editor-status .cp-app-pad-wordCount')),
    commentsHidden: Boolean(document.querySelector('#cp-app-pad-comments') && getComputedStyle(document.querySelector('#cp-app-pad-comments')).display === 'none'),
    chatCollapseVisible: Boolean(document.querySelector('.cp-tasknode-chat-collapse') && getComputedStyle(document.querySelector('.cp-tasknode-chat-collapse')).display !== 'none'),
    contentClass: document.querySelector('#cp-app-padcontent')?.className || null,
    isEmbed: globalThis.APP?.framework?._?.toolbar ? Boolean(globalThis.APP.framework._.toolbar.isEmbed) : null
  })`);
  contextState = result?.result?.result?.value;
  if (contextState?.context?.displayName === "@smoke" && contextState.title === canonicalTitle && contextState.chatVisible && !contextState.chatInitializing && contextState.chatChannels.length === 1 && contextState.chatInputVisible && contextState.formattingMoreVisible) break;
}
assert.equal(contextState?.context?.displayName, "@smoke", JSON.stringify(contextState));
assert.equal(contextState?.title, canonicalTitle, JSON.stringify(contextState));
assert.equal(contextState?.chatVisible, true, JSON.stringify(contextState));
assert.equal(contextState?.chatInitializing, false, JSON.stringify(contextState));
assert.equal(contextState?.chatChannels?.length, 1, JSON.stringify(contextState));
assert.equal(contextState?.chatInputVisible, true, JSON.stringify(contextState));
assert.equal(contextState?.taskNodeTheme, true, JSON.stringify(contextState));
assert.equal(contextState?.legacyToolbarHidden, true, JSON.stringify(contextState));
assert.equal(contextState?.formattingToolbarVisible, true, JSON.stringify(contextState));
assert.equal(contextState?.formattingToolbarRows, 1, JSON.stringify(contextState));
assert.equal(contextState?.formattingControlsClipped, false, JSON.stringify(contextState));
assert.ok(contextState?.formattingOverflowGroups > 0, JSON.stringify(contextState));
assert.equal(contextState?.formattingMoreVisible, true, JSON.stringify(contextState));
assert.equal(contextState?.statusVisible, true, JSON.stringify(contextState));
assert.equal(contextState?.wordCountInStatus, true, JSON.stringify(contextState));
assert.equal(contextState?.commentsHidden, true, JSON.stringify(contextState));
assert.equal(contextState?.chatCollapseVisible, true, JSON.stringify(contextState));

async function postEditorCommand(commandName, payload = {}) {
  await command("Runtime.evaluate", {
    expression: `document.getElementById("pfdocs-embedded-smoke").contentWindow.postMessage(${JSON.stringify({
      type: "tasknode.pfdocs.command",
      requestId,
      channelHash: capability.channelHash,
      command: commandName,
      ...payload,
    })}, ${JSON.stringify(pfdocsOrigin)})`,
  });
}
await postEditorCommand("chat-toggle");
await delay(250);
let chatToggleResult = await innerCommand("getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display");
assert.equal(chatToggleResult?.result?.result?.value, "none", JSON.stringify(chatToggleResult));
await postEditorCommand("chat-toggle");
await delay(250);
chatToggleResult = await innerCommand("getComputedStyle(document.querySelector('.cp-toolbar-chat-drawer')).display");
assert.notEqual(chatToggleResult?.result?.result?.value, "none", JSON.stringify(chatToggleResult));

// Task Node owns the native picker because browser user activation cannot
// cross the parent -> PFDocs postMessage boundary. Verify that the selected
// text document crosses the exact-origin bridge and reaches the real importer.
const importToken = `PFDocs bridged import ${requestId}`;
await postEditorCommand("import-content", {
  file: {
    name: `bridge-${requestId}.md`,
    mimeType: "text/markdown",
    content: `# Imported from Task Node\n\n${importToken}`,
  },
});
let importedDocument = "";
let importResult;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await delay(250);
  const contentResult = await innerCommand("globalThis.CKEDITOR?.instances?.editor1?.getData?.() || ''");
  importedDocument = contentResult?.result?.result?.value || "";
  const events = await command("Runtime.evaluate", { returnByValue: true, expression: "globalThis.__pfdocsEvents" });
  importResult = events?.result?.value?.find((event) => event.type === "pfdocs.tasknode.import-result");
  if (importedDocument.includes(importToken) && importResult?.ok === true) break;
}
assert.match(importedDocument, new RegExp(requestId), importedDocument);
assert.equal(importResult?.ok, true, JSON.stringify(importResult));
assert.match(importResult?.fileName || "", /\.md$/u);

const odvResult = await innerCommand(`new Promise((resolve) => {
  const api = globalThis.APP?.framework?._?.sfCommon;
  const chainpad = globalThis.APP?.framework?._?.cpNfInner?.chainpad;
  if (!api?.requestTaskNodeOdv || !chainpad) return resolve({ error: "odv_api_unavailable" });
  chainpad.contentUpdate(JSON.stringify(["BODY", {}, [["P", {}, ["ODV document context"]]]]));
  api.requestTaskNodeOdv({ prompt: "@ODV summarize this", recentMessages: [{ author: "@smoke", text: "Please summarize" }] },
    (error, result) => resolve({ error: error ? String(error) : "", result }));
})`, { awaitPromise: true });
assert.match(odvResult?.result?.result?.value?.result?.response || "", /First response paragraph/, JSON.stringify(odvResult));
const coachResult = await innerCommand(`new Promise((resolve) => {
  const api = globalThis.APP?.framework?._?.sfCommon;
  if (!api?.requestTaskNodeAssistant) return resolve({ error: "assistant_api_unavailable" });
  api.requestTaskNodeAssistant({ persona: "coach", prompt: "@coach review this risk process", recentMessages: [] },
    (error, result) => resolve({ error: error ? String(error) : "", result }));
})`, { awaitPromise: true });
assert.equal(coachResult?.result?.result?.value?.result?.response, "Coach bridge response", JSON.stringify(coachResult));
assert.equal(coachResult?.result?.result?.value?.result?.persona, "coach", JSON.stringify(coachResult));

// Exercise the actual encrypted messenger renderer, not only the bridge API.
// The routing header remains in the stored chat message but must not appear as
// bold UI content; paragraphs and the neutral mock-derived response card do.
await innerCommand(`(() => {
  const input = document.querySelector('.cp-app-contacts-input textarea');
  const send = document.querySelector('.cp-tasknode-chat-send');
  if (!input || !send) return false;
  input.value = '@ODV review https://example.com/' + 'unbroken-document-chat-segment-'.repeat(24);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  send.click();
  return true;
})()`);
let chatRender;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await delay(250);
  const result = await innerCommand(`(() => {
    const assistant = [...document.querySelectorAll('.cp-tasknode-chat-assistant')].pop();
    const own = [...document.querySelectorAll('.cp-tasknode-chat-own:not(.cp-tasknode-chat-assistant)')].pop();
    const content = assistant?.querySelector('.cp-app-contacts-content');
    if (!assistant || !content || !own) return null;
    const style = getComputedStyle(content);
    const drawer = document.querySelector('.cp-toolbar-chat-drawer');
    const messages = document.querySelector('.cp-app-contacts-messages');
    const composerFoot = document.querySelector('.cp-app-contacts-input');
    const composer = document.querySelector('.cp-tasknode-chat-composer');
    const input = composer?.querySelector('textarea');
    const send = composer?.querySelector('.cp-tasknode-chat-send');
    const ownContent = own.querySelector('.cp-app-contacts-content');
    const within = (child, parent) => {
      if (!child || !parent) return false;
      const childRect = child.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return childRect.left >= parentRect.left - 1 &&
        childRect.right <= parentRect.right + 1 &&
        childRect.top >= parentRect.top - 1 &&
        childRect.bottom <= parentRect.bottom + 1;
    };
    const withinHorizontally = (child, parent) => {
      if (!child || !parent) return false;
      const childRect = child.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return childRect.left >= parentRect.left - 1 && childRect.right <= parentRect.right + 1;
    };
    return {
      assistantText: content.textContent,
      assistantLabel: assistant.querySelector('.cp-app-contacts-sender-name')?.textContent || '',
      assistantLabelVisible: getComputedStyle(assistant.querySelector('.cp-app-contacts-sender')).display !== 'none',
      background: style.backgroundColor,
      boldCount: content.querySelectorAll('strong, b').length,
      paragraphCount: content.querySelectorAll(':scope > p').length,
      padding: style.padding,
      protocolHeaderVisible: /GLM 5\\.2 via Ambient|^@ODV/.test(content.textContent.trim()),
      ownBackground: getComputedStyle(ownContent).backgroundColor,
      drawerWidth: Math.round(drawer?.getBoundingClientRect().width || 0),
      messagesContained: within(messages, drawer),
      ownMessageContained: withinHorizontally(ownContent, messages),
      assistantMessageContained: withinHorizontally(content, messages),
      composerFootContained: within(composerFoot, drawer),
      composerContained: within(composer, composerFoot),
      inputContained: within(input, composer),
      sendContained: within(send, composer),
      ownMessageWraps: ownContent ? ownContent.scrollWidth <= ownContent.clientWidth + 1 : false,
      assistantMessageWraps: content.scrollWidth <= content.clientWidth + 1,
    };
  })()`);
  chatRender = result?.result?.result?.value;
  if (chatRender?.paragraphCount === 2) break;
}
assert.equal(chatRender?.protocolHeaderVisible, false, JSON.stringify(chatRender));
assert.equal(chatRender?.assistantLabel, "ODV", JSON.stringify(chatRender));
assert.equal(chatRender?.assistantLabelVisible, true, JSON.stringify(chatRender));
assert.equal(chatRender?.boldCount, 0, JSON.stringify(chatRender));
assert.equal(chatRender?.paragraphCount, 2, JSON.stringify(chatRender));
assert.equal(chatRender?.background, "rgb(250, 250, 249)", JSON.stringify(chatRender));
assert.equal(chatRender?.padding, "12px 14px", JSON.stringify(chatRender));
assert.equal(chatRender?.ownBackground, "rgb(28, 25, 23)", JSON.stringify(chatRender));
assert.equal(chatRender?.drawerWidth, 340, JSON.stringify(chatRender));
assert.equal(chatRender?.messagesContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.ownMessageContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.assistantMessageContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.composerFootContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.composerContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.inputContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.sendContained, true, JSON.stringify(chatRender));
assert.equal(chatRender?.ownMessageWraps, true, JSON.stringify(chatRender));
assert.equal(chatRender?.assistantMessageWraps, true, JSON.stringify(chatRender));

// Consecutive mentions must route in send order. A slow active inference must
// queue later Coach/ODV turns instead of accepting their encrypted chat
// messages and silently dropping the assistant actions.
const assistantBaselineResult = await innerCommand("document.querySelectorAll('.cp-tasknode-chat-assistant').length");
const assistantBaseline = assistantBaselineResult?.result?.result?.value || 0;
for (const prompt of [
  "@coach queue turn one",
  "@coach queue turn two",
  "@ODV queue turn three",
]) {
  await innerCommand(`(() => {
    const input = document.querySelector('.cp-app-contacts-input textarea');
    const send = document.querySelector('.cp-tasknode-chat-send');
    if (!input || !send) return false;
    input.value = ${JSON.stringify(prompt)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    send.click();
    return true;
  })()`);
  let accepted = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(100);
    const result = await innerCommand("document.querySelector('.cp-app-contacts-input textarea')?.value || ''");
    if (!result?.result?.result?.value) {
      accepted = true;
      break;
    }
  }
  assert.equal(accepted, true, `Encrypted chat did not accept ${prompt}`);
}
const queuedStatusResult = await innerCommand(`(() => {
  const status = document.querySelector('.cp-tasknode-chat-status');
  return {
    state: status?.dataset.tasknodeAssistantState || '',
    queued: Number(status?.dataset.tasknodeAssistantQueued || 0),
    text: status?.textContent || ''
  };
})()`);
const queuedStatus = queuedStatusResult?.result?.result?.value;
assert.equal(queuedStatus?.state, "pending", JSON.stringify(queuedStatus));
assert.ok(queuedStatus?.queued >= 1, JSON.stringify(queuedStatus));
assert.match(queuedStatus?.text || "", /thinking/u);

let queuedRender;
for (let attempt = 0; attempt < 100; attempt += 1) {
  await delay(250);
  const result = await innerCommand(`(() => {
    const replies = [...document.querySelectorAll('.cp-tasknode-chat-assistant')].slice(${assistantBaseline});
    const status = document.querySelector('.cp-tasknode-chat-status');
    return {
      replies: replies.map((message) => ({
        persona: message.dataset.tasknodePersona,
        label: message.querySelector('.cp-app-contacts-sender-name')?.textContent || '',
        text: message.querySelector('.cp-app-contacts-content')?.textContent || ''
      })),
      status: status?.dataset.tasknodeAssistantState || '',
      queued: Number(status?.dataset.tasknodeAssistantQueued || 0)
    };
  })()`);
  queuedRender = result?.result?.result?.value;
  if (queuedRender?.replies?.length === 3 && queuedRender?.status === "idle") break;
}
assert.deepEqual(queuedRender?.replies?.map((reply) => reply.persona), ["coach", "coach", "odv"], JSON.stringify(queuedRender));
assert.deepEqual(queuedRender?.replies?.map((reply) => reply.label), ["Trading Coach", "Trading Coach", "ODV"], JSON.stringify(queuedRender));
assert.match(queuedRender?.replies?.[0]?.text || "", /queue turn one/u);
assert.match(queuedRender?.replies?.[1]?.text || "", /queue turn two/u);
assert.match(queuedRender?.replies?.[2]?.text || "", /queue turn three/u);
assert.equal(queuedRender?.status, "idle", JSON.stringify(queuedRender));
assert.equal(queuedRender?.queued, 0, JSON.stringify(queuedRender));

const renamedTitle = `Embedded title ${requestId}`;
await postEditorCommand("set-title", { title: renamedTitle });

let titleEvent;
for (let attempt = 0; attempt < 30 && !titleEvent; attempt += 1) {
  await delay(500);
  const events = await command("Runtime.evaluate", { returnByValue: true, expression: "globalThis.__pfdocsEvents" });
  titleEvent = events?.result?.value?.find((event) => event.type === "pfdocs.tasknode.document-title" && event.title === renamedTitle);
}
assert.equal(titleEvent?.channelHash, capability.channelHash, JSON.stringify(titleEvent));

// A stale Task Node library snapshot must not overwrite an explicit PFDocs
// title. This is the production reconciliation path for documents renamed
// before title-event persistence was repaired.
await command("Runtime.evaluate", {
  expression: `document.getElementById("pfdocs-embedded-smoke").contentWindow.postMessage(${JSON.stringify({
    type: "tasknode.pfdocs.context",
    requestId,
    channelHash: capability.channelHash,
    documentId: crypto.randomUUID(),
    documentOwned: true,
    title: canonicalTitle,
    identity: { accountId: "smoke-account", displayName: "@smoke", hiveHandle: "smoke", walletAddress: "rSmokeWallet" },
    odv: { enabled: true, mention: "@ODV", model: "z-ai/glm-5.2", provider: "ambient" },
  })}, ${JSON.stringify(pfdocsOrigin)})`,
});
let reconciledTitle;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await delay(250);
  const result = await innerCommand("globalThis.APP?.framework?._?.title?.getTitle?.()");
  reconciledTitle = result?.result?.result?.value;
  if (reconciledTitle === renamedTitle) break;
}
assert.equal(reconciledTitle, renamedTitle);
console.log(JSON.stringify({ ok: true, capability, contextState, odv: odvResult?.result?.result?.value?.result, coach: coachResult?.result?.result?.value?.result, titleEvent, reconciledTitle, pageCount: 1 }, null, 2));
innerSocket.close();
socket.close();
