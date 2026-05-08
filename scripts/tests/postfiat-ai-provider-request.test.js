// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadAiProviders = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/ai-providers.js'),
        'utf8'
    );
    const context = {
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

const MESSAGES = [
    { role: 'system', content: 'Use the selected context.' },
    { role: 'user', content: 'What matters now?' },
];

test('Ambient responses payload disables storage and supports thinking toggle', () => {
    const providers = loadAiProviders();
    const payload = providers.buildAmbientResponsesPayload(MESSAGES, {
        thinking: true,
        stream: true,
    });

    assert.equal(payload.model, 'ambient/large');
    assert.equal(payload.store, false);
    assert.equal(payload.stream, true);
    assert.equal(payload.reasoning.enabled, true);
    assert.equal(payload.thinking_budget, 1200);
    assert.match(payload.input, /SYSTEM:\nUse the selected context/u);
});

test('OpenRouter payload keeps ZDR defaults explicit', () => {
    const providers = loadAiProviders();
    const payload = providers.buildOpenRouterChatPayload(MESSAGES, {
        model: 'deepseek/deepseek-v4-flash',
    }, {
        temperature: 0,
        maxTokens: 512,
    });

    assert.equal(payload.model, 'deepseek/deepseek-v4-flash');
    assert.equal(payload.provider.zdr, true);
    assert.equal(payload.provider.data_collection, 'deny');
    assert.equal(payload.temperature, 0);
    assert.equal(payload.max_tokens, 512);
});

test('RunPod payload truncates context and controls thinking', () => {
    const providers = loadAiProviders();
    const payload = providers.buildRunPodChatPayload([{
        role: 'system',
        content: 'a'.repeat(80),
    }, {
        role: 'user',
        content: 'b'.repeat(80),
    }], {
        model: 'qwen3.6:27b',
        stream: true,
        thinking: false,
        maxTokens: 900,
        systemLimit: 20,
        messageLimit: 12,
        truncateText: (value, limit) => String(value).slice(0, limit),
    });

    assert.equal(payload.model, 'qwen3.6:27b');
    assert.equal(payload.stream, true);
    assert.equal(payload.think, false);
    assert.equal(payload.chat_template_kwargs.enable_thinking, false);
    assert.equal(payload.messages[0].content.length, 20);
    assert.equal(payload.messages[1].content.length, 12);
});
