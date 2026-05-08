// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadExtractor = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/odv.js'),
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
    return context.moduleValue.extractFullResponseText;
};

test('ODV extractor uses exact FULL RESPONSE pipe delimiter when present', () => {
    const extract = loadExtractor();
    const result = extract('| COMPLETED STEPS 1-8 | analysis | FULL RESPONSE | answer text |', true);

    assert.equal(result.ready, true);
    assert.equal(result.text, 'answer text');
    assert.equal(result.fallback, undefined);
});

test('ODV extractor waits during streaming until the exact delimiter appears', () => {
    const extract = loadExtractor();
    const result = extract('| COMPLETED STEPS 1-8 | analysis only', false);

    assert.equal(result.ready, false);
    assert.equal(result.text, '');
});

test('ODV extractor accepts provider fallback with FULL RESPONSE colon label', () => {
    const extract = loadExtractor();
    const result = extract(
        'COMPLETED STEPS 1-8: analysis\nRESPONSE DIRECTIVE: directive\nFULL RESPONSE: final answer',
        true
    );

    assert.equal(result.ready, true);
    assert.equal(result.text, 'final answer');
    assert.equal(result.fallback, true);
});

test('ODV extractor falls back to visible answer text when labels are omitted', () => {
    const extract = loadExtractor();
    const result = extract('Relationships are leverage and risk; choose the ones that compound.', true);

    assert.equal(result.ready, true);
    assert.equal(result.text, 'Relationships are leverage and risk; choose the ones that compound.');
    assert.equal(result.fallback, true);
});

test('ODV extractor falls back to the final pipe segment when FULL RESPONSE is missing', () => {
    const extract = loadExtractor();
    const result = extract(
        '| COMPLETED STEPS 1-8 | analysis | RESPONSE DIRECTIVE | directive | final answer |',
        true
    );

    assert.equal(result.ready, true);
    assert.equal(result.text, 'final answer');
    assert.equal(result.fallback, true);
});
