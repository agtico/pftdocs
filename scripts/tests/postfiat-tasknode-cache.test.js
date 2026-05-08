// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadTaskNodeCache = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/tasknode-cache.js'),
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

const makeStorage = () => {
    const map = new Map();
    return {
        get length() { return map.size; },
        getItem: (key) => map.has(key) ? map.get(key) : null,
        key: (index) => [...map.keys()][index] || null,
        removeItem: (key) => map.delete(key),
        setItem: (key, value) => map.set(key, String(value)),
        keys: () => [...map.keys()],
    };
};

const readableData = {
    taskEventCount: 1,
    contextUpdateCount: 0,
    taskEvents: [{
        decrypted: true,
        text: 'Submit the verification cache patch.',
    }],
};

test('Task Node cache writes and reads reusable wallet-scoped records', () => {
    const cache = loadTaskNodeCache();
    const storage = makeStorage();
    const displayText = (event) => event.text || '';

    assert.equal(cache.writeCache('rWallet', readableData, {
        displayText,
        now: 1000,
        prefix: 'PFT_tasknode_',
        storage,
        ttlMs: 5000,
        version: 1,
    }), true);

    const record = cache.readCache('rWallet', {
        displayText,
        now: 2000,
        prefixes: ['PFT_tasknode_'],
        storages: [storage],
        version: 1,
    });

    assert.equal(record.walletAddress, 'rWallet');
    assert.equal(record.cachedAt, 1000);
    assert.equal(record.data.taskEventCount, 1);
});

test('Task Node cache rejects expired empty or wrong-wallet records', () => {
    const cache = loadTaskNodeCache();
    const storage = makeStorage();
    const displayText = (event) => event.text || '';

    storage.setItem('PFT_tasknode_rWallet', JSON.stringify({
        version: 1,
        walletAddress: 'other',
        expiresAt: 9999,
        data: readableData,
    }));
    assert.equal(cache.readCache('rWallet', {
        displayText,
        now: 1000,
        prefixes: ['PFT_tasknode_'],
        storages: [storage],
        version: 1,
    }), null);
    assert.deepEqual(storage.keys(), []);

    assert.equal(cache.writeCache('rWallet', {
        taskEventCount: 0,
        contextUpdateCount: 0,
        taskEvents: [],
    }, {
        displayText,
        prefix: 'PFT_tasknode_',
        storage,
        ttlMs: 5000,
        version: 1,
    }), false);
});

test('Task Node cache clears current and legacy prefixes', () => {
    const cache = loadTaskNodeCache();
    const storage = makeStorage();

    storage.setItem('PFT_tasknode_r1', '{}');
    storage.setItem('PFT_legacy_r1', '{}');
    storage.setItem('other', '{}');

    cache.clearCache('r1', {
        prefixes: ['PFT_tasknode_', 'PFT_legacy_'],
        storages: [storage],
    });
    assert.deepEqual(storage.keys(), ['other']);

    storage.setItem('PFT_tasknode_r2', '{}');
    cache.clearCache('', {
        prefixes: ['PFT_tasknode_', 'PFT_legacy_'],
        storages: [storage],
    });
    assert.deepEqual(storage.keys(), ['other']);
});
