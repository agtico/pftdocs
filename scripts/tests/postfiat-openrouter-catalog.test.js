// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadOpenRouterCatalog = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/openrouter-catalog.js'),
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

test('OpenRouter catalog parses and deduplicates models', () => {
    const catalog = loadOpenRouterCatalog();
    const models = catalog.parseModels({
        data: [
            { id: 'z', name: 'Zulu', context_length: 10 },
            { model_id: 'a', model_name: 'Alpha' },
            { id: 'a', name: 'Duplicate Alpha' },
            { id: '' },
        ],
    });

    assert.deepEqual([...models.map((model) => model.id)], ['a', 'z']);
    assert.equal(models[0].name, 'Alpha');
    assert.equal(models[1].contextLength, 10);
});

test('OpenRouter catalog filters ZDR-only models and preserves selected model', () => {
    const catalog = loadOpenRouterCatalog();
    const endpoints = catalog.parseZdrEndpoints({
        data: [
            { model_id: 'model/a', provider_name: 'Provider A' },
            { model_id: 'model/a', provider_name: 'Provider B' },
        ],
    });
    const rows = catalog.getModelCatalog({
        fallbackModels: [{ id: 'model/a', name: 'A' }, { id: 'model/b', name: 'B' }],
        selectedModel: 'model/c',
        zdrEndpoints: endpoints,
        zdrOnly: true,
    });

    assert.deepEqual([...rows.map((row) => row.id)], ['model/a', 'model/c']);
    assert.match(rows[1].name, /not in current ZDR list/u);
    assert.deepEqual([...catalog.getZdrProvidersForModel(endpoints, 'model/a')], [
        'Provider A',
        'Provider B',
    ]);
    assert.equal(catalog.countZdrModels(endpoints), 1);
});

test('OpenRouter catalog reports loading ZDR and fallback states', () => {
    const catalog = loadOpenRouterCatalog();

    assert.match(catalog.getModelStatus({ loading: true }), /Loading/u);
    assert.match(catalog.getModelStatus({
        selectedModel: 'model/a',
        zdrEndpoints: [{ modelId: 'model/a', providerName: 'Provider A' }],
    }), /1 ZDR endpoint/u);
    assert.match(catalog.getModelStatus({
        selectedModel: 'model/b',
        zdrEndpoints: [{ modelId: 'model/a', providerName: 'Provider A' }],
    }), /not present/u);
});
