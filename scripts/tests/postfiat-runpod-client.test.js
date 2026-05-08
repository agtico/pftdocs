// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TextDecoder, TextEncoder } = require('node:util');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadRunPodClient = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/runpod-client.js'),
        'utf8'
    );
    const context = {
        TextDecoder,
        moduleValue: null,
        define: (deps, factory) => {
            assert.equal(Array.isArray(deps), true);
            assert.equal(deps.length, 0);
            context.moduleValue = factory();
        },
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.moduleValue;
};

const jsonResponse = (ok, status, payload) => ({
    ok,
    status,
    json: () => Promise.resolve(payload),
});

test('RunPod client retries unsafe origin after retryable proxy miss', async () => {
    const client = loadRunPodClient();
    const calls = [];
    const result = await client.fetchJson('/pods', {}, {
        currentOrigin: 'https://tasknode.postfiat.org',
        defaultKey: 'rp_key',
        unsafeOrigin: 'https://unsafe.postfiat.org',
        fetch: (url, options) => {
            calls.push({ url, options });
            if (calls.length === 1) {
                return Promise.resolve(jsonResponse(false, 404, { message: 'not here' }));
            }
            return Promise.resolve(jsonResponse(true, 200, { pods: 1 }));
        },
    });

    assert.deepEqual(result, { pods: 1 });
    assert.deepEqual(calls.map((call) => call.url), [
        '/api/postfiat/runpod/pods',
        'https://unsafe.postfiat.org/api/postfiat/runpod/pods',
    ]);
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[1].options.credentials, 'omit');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer rp_key');
});

test('RunPod client reads streaming content and thinking deltas', async () => {
    const client = loadRunPodClient();
    const encoder = new TextEncoder();
    const chunks = [
        encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"think","content":"hi"}}]}\n\n'),
        encoder.encode('data: {"choices":[{"delta":{"content":" there"}}]}\n\n'),
        encoder.encode('data: [DONE]\n\n'),
    ];
    let index = 0;
    const deltas = [];
    const reasoning = [];
    const output = await client.readRunPodSseResponse({
        body: {
            getReader: () => ({
                read: () => Promise.resolve(index < chunks.length ?
                    { done: false, value: chunks[index++] } :
                    { done: true }),
            }),
        },
    }, {
        onDelta: (delta) => deltas.push(delta),
        onReasoningDelta: (delta, chars) => reasoning.push([delta, chars]),
    });

    assert.equal(output, 'hi there');
    assert.deepEqual(deltas, ['hi', ' there']);
    assert.deepEqual(reasoning, [['think', 5]]);
});

test('RunPod client extracts model ids and pod defaults', () => {
    const client = loadRunPodClient();

    assert.deepEqual(client.parseModelIds({
        data: [{ id: 'qwen3.6:27b' }, { name: 'other' }],
    }), ['qwen3.6:27b', 'other']);
    assert.equal(client.getProxyUrl('abc123', 8000), 'https://abc123-8000.proxy.runpod.net');
    assert.equal(client.isPodRunning({ id: 'pod', status: 'RUNNING' }), true);
    assert.equal(client.isPodRunning({ id: 'pod', desiredStatus: 'EXITED' }), false);
    assert.equal(client.getPodModelId({
        name: 'pftdocs-qwen36-ollama-blackwell-fast',
        env: {},
    }, {
        defaultOllamaModel: 'qwen3.6:27b',
    }), 'qwen3.6:27b');
});
