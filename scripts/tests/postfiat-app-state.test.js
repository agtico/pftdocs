// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadAppState = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/app-state.js'),
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

test('PFT Docs app state normalizes unknown routes to docs', () => {
    const state = loadAppState();

    assert.equal(state.normalizeRoute('chat'), 'chat');
    assert.equal(state.normalizeRoute('unknown'), 'docs');
});

test('PFT Docs app state can boot from encoded postFiatRoute hash', () => {
    const state = loadAppState();
    const hash = '#' + encodeURIComponent(JSON.stringify({ postFiatRoute: 'tasknode' }));

    assert.equal(state.getInitialRoute(hash), 'tasknode');
});
