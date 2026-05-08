// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadStorage = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/storage.js'),
        'utf8'
    );
    const context = {
        console,
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

const memoryStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
    };
};

test('Post Fiat JSON store reads bridge store before local storage', () => {
    const storage = loadStorage();
    const local = memoryStorage();
    const bridge = {
        store: {
            key: JSON.stringify({ provider: 'ambient' }),
        },
        put: (key, value) => {
            bridge.store[key] = value;
        },
    };
    local.setItem('key', JSON.stringify({ provider: 'runpod' }));

    const store = storage.createJsonStore({
        getStorage: () => local,
        getBridgeStore: () => bridge,
    });

    assert.equal(store.readJson('key').provider, 'ambient');
});

test('Post Fiat JSON store migrates local storage into bridge store', () => {
    const storage = loadStorage();
    const local = memoryStorage();
    const bridge = {
        store: {},
        put: (key, value) => {
            bridge.store[key] = value;
        },
    };
    local.setItem('key', JSON.stringify({ provider: 'openrouter' }));

    const store = storage.createJsonStore({
        getStorage: () => local,
        getBridgeStore: () => bridge,
    });

    assert.equal(store.readJson('key').provider, 'openrouter');
    assert.equal(JSON.parse(bridge.store.key).provider, 'openrouter');
});
