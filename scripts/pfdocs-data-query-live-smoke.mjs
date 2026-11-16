#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { MODEL_CHECKS, MODEL_ROWS, MODEL_TSV } from "./lib/msft-corbanu-model.mjs";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const cdpPort = Number(process.env.CDP_PORT || 9223);
const mainOrigin = process.env.PFDOCS_MAIN_ORIGIN || "https://tasknode-pfdocs.fly.dev";
const sandboxOrigin = process.env.PFDOCS_SANDBOX_ORIGIN || "https://tasknode-pfdocs-sandbox.fly.dev";
const timeoutMs = Number(process.env.PFDOCS_LIVE_SMOKE_TIMEOUT_MS || 90_000);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const deadline = () => Date.now() + timeoutMs;

async function waitFor(check, description, until = deadline()) {
    let lastError;
    while (Date.now() < until) {
        try {
            const result = await check();
            if (result) return result;
        } catch (error) {
            lastError = error;
        }
        await delay(500);
    }
    throw new Error(`${description} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

async function listTargets() {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    assert.equal(response.ok, true, `Chrome DevTools returned HTTP ${response.status}`);
    return response.json();
}

async function connect(target) {
    assert.ok(target?.webSocketDebuggerUrl, "Chrome target has no debugger URL");
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
    socket.on("close", () => {
        for (const { reject } of pending.values()) reject(new Error("Chrome target closed"));
        pending.clear();
    });

    const command = (method, params = {}) => {
        const id = ++nextId;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };

    const evaluate = async (expression, options = {}) => {
        const result = await command("Runtime.evaluate", {
            awaitPromise: Boolean(options.awaitPromise),
            returnByValue: true,
            expression,
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result?.value;
    };

    return { socket, command, evaluate };
}

function findSheetInner(targets) {
    return targets.find((target) => target.type === "iframe" &&
        target.url.startsWith(`${sandboxOrigin}/sheet/inner.html`));
}

async function waitForSheetInner() {
    return waitFor(async () => findSheetInner(await listTargets()), "spreadsheet sandbox runtime");
}

async function waitForEditor(runtime) {
    return waitFor(async () => runtime.evaluate(`(() => {
        const editor = frames[0]?.editorCell;
        const functions = editor?.wb?.customFunctionEngine?.funcsMapInfo;
        if (!editor?.isDocumentLoadComplete || !functions?.CORBANU || !functions?.PFDATA) return null;
        return {
            functions: Object.keys(functions).sort(),
            legacyBDP: Boolean(functions.BDP),
            pfdata: Boolean(functions.PFDATA),
        };
    })()`), "CORBANU and PFDATA registration in the spreadsheet editor");
}

async function readCell(runtime, address) {
    return runtime.evaluate(`(() => {
        const editor = frames[0]?.editorCell;
        const range = editor?.wbModel?.getActiveWs?.()?.getRange2?.(${JSON.stringify(address)});
        if (!range) return null;
        return {
            formula: range.getFormula?.(),
            isFormula: range.isFormula?.(),
            value: range.getValue?.(),
        };
    })()`);
}

const columnName = (index) => {
    let value = index;
    let result = "";
    while (value > 0) {
        value -= 1;
        result = String.fromCharCode(65 + (value % 26)) + result;
        value = Math.floor(value / 26);
    }
    return result;
};

const modelFormulaCells = [];
MODEL_ROWS.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
        if (typeof value !== "string" || !value.startsWith("=")) return;
        modelFormulaCells.push({
            address: `${columnName(columnIndex + 1)}${rowIndex + 1}`,
            formula: value.slice(1),
        });
    });
});

async function waitForCalculatedModel(runtime) {
    return waitFor(async () => runtime.evaluate(`(() => {
        const editor = frames[0]?.editorCell;
        const worksheet = editor?.wbModel?.getActiveWs?.();
        if (!worksheet) return null;
        const expected = ${JSON.stringify(modelFormulaCells)};
        const pending = [];
        const values = {};
        for (const item of expected) {
            const range = worksheet.getRange2(item.address);
            const formula = range.getFormula?.();
            const value = range.getValue?.();
            if (!range.isFormula?.() || formula !== item.formula || !Number.isFinite(Number(value))) {
                pending.push({ address: item.address, formula, value });
            }
            values[item.address] = value;
        }
        return pending.length ? null : { formulaCount: expected.length, values };
    })()`), "calculated MSFT model");
}

const targets = await listTargets();
const pageTarget = targets.find((target) => target.type === "page" && target.url.startsWith(mainOrigin)) ||
    targets.find((target) => target.type === "page" && target.url === "about:blank") ||
    targets.find((target) => target.type === "page");
assert.ok(pageTarget, "No Chrome page target is available");

const page = await connect(pageTarget);
await page.command("Page.enable");
await page.command("Runtime.enable");
await page.command("Page.navigate", { url: `${mainOrigin}/sheet/` });

const editHref = await waitFor(async () => {
    const href = await page.evaluate("location.href");
    return href.startsWith(`${mainOrigin}/sheet/#/2/sheet/edit/`) ? href : null;
}, "fresh spreadsheet navigation");
await delay(1_500);

const firstInnerTarget = await waitForSheetInner();
const inner = await connect(firstInnerTarget);
const editorState = await waitForEditor(inner);
assert.deepEqual(editorState.functions, ["CORBANU", "PFDATA"]);
assert.equal(editorState.legacyBDP, false);
assert.equal(editorState.pfdata, true);

const pasteResult = await inner.evaluate(`new Promise((resolve, reject) => {
    const frame = frames[0];
    const editor = frame?.editorCell;
    const format = frame?.AscCommon?.c_oAscClipboardDataFormat?.Text;
    if (!editor?.asc_PasteData || typeof format === "undefined") {
        reject(new Error("spreadsheet text paste API is unavailable"));
        return;
    }
    editor.wb.getWorksheet().setSelection(new frame.Asc.Range(0, 0, 0, 0));
    editor.wb._onWSSelectionChanged();
    const timer = setTimeout(() => reject(new Error("model paste timed out")), 15_000);
    editor.asc_PasteData(
        format,
        ${JSON.stringify(MODEL_TSV)},
        null,
        null,
        true,
        () => {
            clearTimeout(timer);
            resolve({ activeRange: editor.asc_getActiveRangeStr() });
        }
    );
})`, { awaitPromise: true });
assert.equal(typeof pasteResult.activeRange, "string");

const calculated = await waitForCalculatedModel(inner);
const title = await readCell(inner, "A1");
assert.equal(title.value, MODEL_ROWS[0][0]);
const calculatedChecks = Object.fromEntries(
    Object.entries(MODEL_CHECKS).map(([name, address]) => [name, Number(calculated.values[address])])
);
assert.ok(calculatedChecks.livePrice > 0);
assert.equal(calculatedChecks.revenue3Q2024, 61_858);
assert.equal(calculatedChecks.netIncome3Q2024, 21_939);
assert.equal(calculatedChecks.dilutedEps3Q2024, 2.94);
assert.equal(calculatedChecks.operatingCashFlow3Q2024, 31_917);
assert.equal(calculatedChecks.freeCashFlow3Q2024, 20_965);

// Give the encrypted collaborative document enough time to publish the edit,
// then prove the formula and its value are reconstructed after a full reload.
await delay(10_000);
inner.socket.close();
await page.command("Page.reload", { ignoreCache: true });
await waitFor(async () => {
    const state = await page.evaluate("({ href: location.href, readyState: document.readyState })");
    return state.href === editHref && state.readyState === "complete";
}, "spreadsheet page reload");
await delay(1_500);

const reopenedTarget = await waitForSheetInner();
const reopened = await connect(reopenedTarget);
const reopenedEditorState = await waitForEditor(reopened);
assert.deepEqual(reopenedEditorState.functions, ["CORBANU", "PFDATA"]);
assert.equal(reopenedEditorState.legacyBDP, false);
assert.equal(reopenedEditorState.pfdata, true);
const recalculated = await waitForCalculatedModel(reopened);
const reopenedTitle = await readCell(reopened, "A1");
assert.equal(reopenedTitle.value, MODEL_ROWS[0][0]);
const recalculatedChecks = Object.fromEntries(
    Object.entries(MODEL_CHECKS).map(([name, address]) => [name, Number(recalculated.values[address])])
);
assert.equal(recalculatedChecks.revenue3Q2024, 61_858);
assert.equal(recalculatedChecks.netIncome3Q2024, 21_939);

console.log(JSON.stringify({
    ok: true,
    editHref,
    functions: editorState.functions,
    pasteResult,
    model: {
        title: title.value,
        formulaCount: calculated.formulaCount,
        checks: calculatedChecks,
    },
    reopened: {
        title: reopenedTitle.value,
        formulaCount: recalculated.formulaCount,
        checks: recalculatedChecks,
    },
}, null, 2));

reopened.socket.close();
page.socket.close();
