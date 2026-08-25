#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const cdpPort = Number(process.env.CDP_PORT || 9223);
const taskNodeOrigin = process.env.TASKNODE_ORIGIN || "https://tasknode.postfiat.org";
const mainOrigin = process.env.PFDOCS_MAIN_ORIGIN || "https://tasknode-pfdocs.fly.dev";
const sandboxOrigin = process.env.PFDOCS_SANDBOX_ORIGIN || "https://tasknode-pfdocs-sandbox.fly.dev";
const documentType = process.env.PFDOCS_DOCUMENT_TYPE === "sheet" ? "sheet" : "pad";

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith(taskNodeOrigin)) ||
  targets.find((entry) => entry.type === "page" && entry.url === "about:blank") ||
  targets.find((entry) => entry.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "No Chrome page target is available");
await Promise.all(targets
  .filter((entry) => entry.type === "page" && entry.id !== target.id)
  .map((entry) => fetch(`http://127.0.0.1:${cdpPort}/json/close/${entry.id}`).catch(() => null)));

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let nextId = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await command("Page.enable");
await command("Runtime.enable");
await command("Page.navigate", { url: `${taskNodeOrigin}/#docs` });
await delay(4_000);

const requestId = crypto.randomUUID();
const bridgeUrl = new URL("/tasknode/", mainOrigin);
bridgeUrl.searchParams.set("action", "create");
bridgeUrl.searchParams.set("documentType", documentType);
bridgeUrl.searchParams.set("requestId", requestId);
bridgeUrl.searchParams.set("returnOrigin", taskNodeOrigin);

const bridgeResult = await command("Runtime.evaluate", {
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
  expression: `new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "bridge_timeout" }), 20000);
    const handler = (event) => {
      if (event.origin !== ${JSON.stringify(mainOrigin)}) return;
      if (event.data?.requestId !== ${JSON.stringify(requestId)}) return;
      if (event.data?.type !== "pfdocs.tasknode.document-created") return;
      clearTimeout(timer);
      removeEventListener("message", handler);
      resolve(event.data);
    };
    addEventListener("message", handler);
    const popup = open(${JSON.stringify(bridgeUrl.toString())}, "_blank", "width=1160,height=820");
    if (!popup) resolve({ error: "popup_blocked" });
  })`,
});

const capability = bridgeResult?.result?.value;
assert.equal(capability?.type, "pfdocs.tasknode.document-created", JSON.stringify(capability));
assert.equal(capability?.requestId, requestId);
assert.match(String(capability?.channelHash || ""), /^[0-9a-f]{32}$/i);
assert.match(String(capability?.editHref || ""), new RegExp(`^/${documentType}/#`));
assert.match(String(capability?.viewHref || ""), new RegExp(`^/${documentType}/#`));
assert.notEqual(capability.editHref, capability.viewHref);

// Let the bridge popup initialize the fresh CryptPad channel before reopening
// the clean bearer capability in this page.
await delay(12_000);
const postBridgeTargets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
await Promise.all(postBridgeTargets
  .filter((entry) => entry.type === "page" && entry.id !== target.id)
  .map((entry) => fetch(`http://127.0.0.1:${cdpPort}/json/close/${entry.id}`).catch(() => null)));
await command("Page.navigate", { url: new URL(capability.editHref, mainOrigin).toString() });
await delay(12_000);
const editorResult = await command("Runtime.evaluate", {
  returnByValue: true,
  expression: `({
    href: location.href,
    title: document.title,
    sandboxFrames: [...document.querySelectorAll("iframe")].map((frame) => frame.src).filter((src) => src.startsWith(${JSON.stringify(sandboxOrigin)})),
    bodyText: document.body?.innerText?.slice(0, 500) || ""
  })`,
});
const editor = editorResult?.result?.value;
assert.equal(new URL(editor.href).origin, mainOrigin);
assert.ok(editor.sandboxFrames.length > 0, "The editor did not load its isolated sandbox frame");
assert.ok(editor.sandboxFrames.every((src) => !/[?&](?:undefined|function\b)/.test(src)),
  "The editor loaded a malformed cache-busting URL");
assert.doesNotMatch(editor.bodyText, /incorrect access|application error|bad gateway/i);

const liveTargets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const innerTarget = liveTargets.find((entry) => entry.type === "iframe" && entry.url.startsWith(sandboxOrigin));
assert.ok(innerTarget?.webSocketDebuggerUrl, "The sandbox editor target is unavailable");
const innerSocket = new WebSocket(innerTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  innerSocket.once("open", resolve);
  innerSocket.once("error", reject);
});
innerSocket.send(JSON.stringify({
  id: 1,
  method: "Runtime.evaluate",
  params: {
    returnByValue: true,
    expression: `({
      title: document.title,
      bodyText: document.body?.innerText?.slice(0, 1000) || "",
      editableCount: document.querySelectorAll('[contenteditable="true"], textarea').length,
      spreadsheetSurface: Boolean(document.querySelector('#cp-app-oo-editor, canvas, [id*="worksheet"]'))
    })`,
  },
}));
const innerMessage = await new Promise((resolve, reject) => {
  innerSocket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id === 1) resolve(message);
  });
  innerSocket.once("error", reject);
});
const inner = innerMessage?.result?.result?.value;
assert.doesNotMatch(inner.bodyText, /incorrect access|application error|bad gateway|no longer exists|correct password/i);
assert.ok(inner.bodyText.length > 0, "The sandbox editor rendered no user interface");

if (documentType === "sheet") {
  assert.equal(inner.spreadsheetSurface, true, "The spreadsheet editor exposed no spreadsheet surface");
  console.log(JSON.stringify({ ok: true, documentType, capability, editor, inner }, null, 2));
  innerSocket.close();
  socket.close();
  process.exit(0);
}

const persistenceToken = `PFDocs live persistence ${requestId}`;
innerSocket.send(JSON.stringify({
  id: 2,
  method: "Runtime.evaluate",
  params: {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve, reject) => {
      const editor = globalThis.CKEDITOR?.instances?.editor1;
      if (!editor || editor.status !== "ready") return reject(new Error("editor_not_ready"));
      const editable = editor.editable()?.$;
      if (!editable) return reject(new Error("editor_body_unavailable"));
      editable.innerHTML = ${JSON.stringify(`<p>${persistenceToken}</p>`)};
      editable.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: "PFDocs live persistence"
      }));
      editor.fire("change");
      resolve(editor.getData());
    })`,
  },
}));
const writeMessage = await new Promise((resolve, reject) => {
  innerSocket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id === 2) resolve(message);
  });
  innerSocket.once("error", reject);
});
assert.match(String(writeMessage?.result?.result?.value || ""), new RegExp(requestId));
innerSocket.close();

await delay(8_000);
await command("Page.navigate", { url: new URL(capability.viewHref, mainOrigin).toString() });
await delay(12_000);
const reopenedTargets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const reopenedInnerTarget = reopenedTargets.find((entry) => entry.type === "iframe" && entry.url.startsWith(sandboxOrigin));
assert.ok(reopenedInnerTarget?.webSocketDebuggerUrl, "The reopened sandbox editor target is unavailable");
const reopenedSocket = new WebSocket(reopenedInnerTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  reopenedSocket.once("open", resolve);
  reopenedSocket.once("error", reject);
});
reopenedSocket.send(JSON.stringify({
  id: 1,
  method: "Runtime.evaluate",
  params: {
    returnByValue: true,
    expression: `({
      bodyText: document.body?.innerText?.slice(0, 1500) || "",
      data: globalThis.CKEDITOR?.instances?.editor1?.getData?.() || ""
    })`,
  },
}));
const reopenedMessage = await new Promise((resolve, reject) => {
  reopenedSocket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id === 1) resolve(message);
  });
  reopenedSocket.once("error", reject);
});
const reopened = reopenedMessage?.result?.result?.value;
assert.doesNotMatch(reopened.bodyText, /incorrect access|application error|bad gateway|no longer exists|correct password/i);
assert.match(reopened.data, new RegExp(requestId));

console.log(JSON.stringify({ ok: true, capability, editor, inner, reopened }, null, 2));
reopenedSocket.close();
socket.close();
