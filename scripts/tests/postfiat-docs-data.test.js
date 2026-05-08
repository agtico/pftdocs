// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadDocsData = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/docs-data.js'),
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

test('docs data normalizes drive docs with root trash and template flags', () => {
    const docs = loadDocsData();
    const rows = docs.normalizeDriveDocs({
        drive: {
            root: { A: 1 },
            trash: { old: [{ element: 2 }] },
            template: [3],
            filesData: {
                1: { filename: 'Live', href: '/pad/#/1/edit/abc', atime: 20 },
                2: { filename: 'Trash', href: '/pad/#/1/edit/trash', atime: 30 },
                3: { title: 'Template', roHref: '/pad/#/1/view/template', ctime: 10 },
                4: { filename: 'No href' },
            },
        },
    }, {
        parsePadUrl: (href) => ({ type: href.includes('/view/') ? 'readonly' : 'pad' }),
    });

    assert.deepEqual([...rows.map((row) => row.id)], ['2', '1', '3']);
    assert.equal(rows[0].trash, true);
    assert.equal(rows[1].root, true);
    assert.equal(rows[2].template, true);
    assert.equal(rows[2].type, 'readonly');
});

test('docs data extracts text from strings json objects arrays and hyperjson', () => {
    const docs = loadDocsData();
    const hyperjson = ['div', {}, [['p', {}, ['hello from hyperjson']]]];

    assert.equal(docs.compactText('a  \n\n\n\nb'), 'a\n\n\nb');
    assert.equal(docs.extractText('{"content":"inside"}'), 'inside');
    assert.equal(docs.extractText([{ text: 'one' }, { markdown: 'two' }]), 'one\n\ntwo');
    assert.equal(docs.extractText(hyperjson, {
        hyperjsonToText: () => 'hello from hyperjson',
    }), 'hello from hyperjson');
});

test('docs data truncates long extracted fallback objects', () => {
    const docs = loadDocsData();
    const text = docs.extractText({ unknown: 'x'.repeat(6000) });

    assert.match(text, /characters truncated/u);
    assert.ok(text.length < 5100);
});
