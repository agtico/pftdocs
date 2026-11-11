// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const {
    DataQueryError,
    TIINGO_FUNDAMENTAL_CODES,
    createDataQueryService,
    normalizeEquitySecurity,
    normalizeField,
    normalizeFundamentalPeriod,
    resolveTiingoFundamentalCode,
} = require('../../lib/postfiat-data-query');

const repoRoot = path.resolve(__dirname, '..', '..');

const tiingoResponse = (payload, options = {}) => ({
    ok: options.ok !== false,
    status: options.status || 200,
    text: () => Promise.resolve(JSON.stringify(payload)),
});

test('US equity identifiers, readable fields, and fiscal periods normalize generally', () => {
    assert.deepEqual(normalizeEquitySecurity('msft us equity'), {
        input: 'msft us equity',
        symbol: 'MSFT',
        market: 'US',
        securityType: 'EQUITY',
        canonical: 'MSFT US EQUITY',
    });
    assert.equal(normalizeEquitySecurity('V').canonical, 'V US EQUITY');
    assert.equal(normalizeEquitySecurity('msft us').canonical, 'MSFT US EQUITY');
    assert.equal(normalizeEquitySecurity('brk/b us equity').symbol, 'BRK-B');
    assert.equal(normalizeField('px last'), 'PX_LAST');
    assert.deepEqual(normalizeFundamentalPeriod('3Q 2024'), {
        input: '3Q 2024',
        type: 'quarter',
        year: 2024,
        quarter: 3,
        canonical: '3Q 2024',
    });
    assert.equal(normalizeFundamentalPeriod('Q3-24').canonical, '3Q 2024');
    assert.equal(normalizeFundamentalPeriod('2024 Q3').canonical, '3Q 2024');
    assert.equal(normalizeFundamentalPeriod('FY2024').canonical, 'FY 2024');
    assert.equal(normalizeFundamentalPeriod('2024').canonical, 'FY 2024');
    assert.equal(normalizeFundamentalPeriod('latest quarter').canonical, 'LATEST');
    assert.equal(resolveTiingoFundamentalCode('net income'), 'netinc');
    assert.equal(resolveTiingoFundamentalCode('operating cash flow'), 'ncfo');
    assert.equal(resolveTiingoFundamentalCode('shareswaDil'), 'shareswaDil');
    assert.equal(TIINGO_FUNDAMENTAL_CODES.length, 85);
    assert.throws(
        () => normalizeEquitySecurity('MSFT LN Equity'),
        (error) => error instanceof DataQueryError && error.code === 'security_market_unsupported'
    );
});

test('Tiingo provider maps PX_LAST to tngoLast and shares snapshots across fields', async () => {
    const calls = [];
    const service = createDataQueryService({
        env: { TIINGO_API_KEY: 'test-token' },
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return tiingoResponse([{
                ticker: 'MSFT',
                timestamp: '2026-08-27T20:00:00.000Z',
                tngoLast: 509.75,
                last: null,
                open: 505.1,
            }]);
        },
    });

    const last = await service.query({
        security: 'MSFT US',
        field: 'px last',
    });
    const open = await service.query({
        source: 'TIINGO',
        security: 'msft',
        field: 'PX_OPEN',
    });

    assert.equal(last.value, 509.75);
    assert.equal(last.sourceField, 'tngoLast');
    assert.equal(last.normalizedSecurity, 'MSFT US EQUITY');
    assert.equal(last.field, 'PX_LAST');
    assert.equal(last.cacheStatus, 'miss');
    assert.equal(open.value, 505.1);
    assert.equal(open.cacheStatus, 'hit');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.tiingo.com/iex/MSFT');
    assert.equal(calls[0].options.headers.Authorization, 'Token test-token');
});

test('Tiingo provider coalesces concurrent formulas for the same symbol', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let calls = 0;
    const service = createDataQueryService({
        env: { TIINGO_API_KEY: 'test-token' },
        fetchImpl: async () => {
            calls += 1;
            await gate;
            return tiingoResponse([{ ticker: 'V', tngoLast: 360, volume: 1000 }]);
        },
    });

    const lastPromise = service.query({ provider: 'tiingo', security: 'V', field: 'PX_LAST' });
    const volumePromise = service.query({ provider: 'tiingo', security: 'V US Equity', field: 'PX_VOLUME' });
    release();
    const [last, volume] = await Promise.all([lastPromise, volumePromise]);

    assert.equal(calls, 1);
    assert.equal(last.value, 360);
    assert.equal(volume.value, 1000);
    assert.deepEqual(new Set([last.cacheStatus, volume.cacheStatus]), new Set(['miss', 'coalesced']));
});

test('Tiingo historical fundamentals resolve readable fields and fiscal periods from one snapshot', async () => {
    let calls = 0;
    const service = createDataQueryService({
        env: { TIINGO_API_KEY: 'test-token' },
        fetchImpl: async (url) => {
            calls += 1;
            assert.equal(url, 'https://api.tiingo.com/tiingo/fundamentals/MSFT/statements');
            return tiingoResponse([
                {
                    date: '2025-09-30', year: 2026, quarter: 1,
                    statementData: { incomeStatement: [{ dataCode: 'revenue', value: 77670 }] },
                },
                {
                    date: '2024-06-30', year: 2024, quarter: 0,
                    statementData: { incomeStatement: [{ dataCode: 'revenue', value: 245122 }] },
                },
                {
                    date: '2024-03-31', year: 2024, quarter: 3,
                    statementData: {
                        incomeStatement: [
                            { dataCode: 'revenue', value: 61858 },
                            { dataCode: 'netinc', value: 21939 },
                            { dataCode: 'epsDil', value: 2.94 },
                        ],
                        cashFlow: [{ dataCode: 'ncfo', value: 31917 }],
                        balanceSheet: [{ dataCode: 'cashAndEq', value: 19634 }],
                    },
                },
            ]);
        },
    });

    const [revenue, netIncome, operatingCashFlow, dilutedEps, cash] = await Promise.all([
        service.query({ security: 'msft us', field: 'revenue', period: '3Q 2024' }),
        service.query({ security: 'MSFT', field: 'net income', period: 'Q3-24' }),
        service.query({ security: 'MSFT US', field: 'operating cash flow', period: '2024 Q3' }),
        service.query({ security: 'MSFT US', field: 'diluted eps', period: '3Q2024' }),
        service.query({ security: 'MSFT US', field: 'cash', period: '3Q 2024' }),
    ]);

    assert.equal(calls, 1);
    assert.equal(revenue.value, 61858);
    assert.equal(revenue.sourceField, 'revenue');
    assert.equal(revenue.period, '3Q 2024');
    assert.equal(revenue.fiscalYear, 2024);
    assert.equal(revenue.fiscalQuarter, 3);
    assert.equal(revenue.asOf, '2024-03-31');
    assert.equal(netIncome.value, 21939);
    assert.equal(operatingCashFlow.value, 31917);
    assert.equal(dilutedEps.value, 2.94);
    assert.equal(cash.value, 19634);

    const annual = await service.query({ security: 'MSFT', field: 'sales', period: 'FY 2024' });
    const latest = await service.query({ security: 'MSFT', field: 'revenue', period: 'latest' });
    assert.equal(annual.value, 245122);
    assert.equal(annual.period, 'FY 2024');
    assert.equal(latest.value, 77670);
    assert.equal(latest.period, '1Q 2026');
    assert.equal(calls, 1);
});

test('provider registry remains generic while Tiingo owns equity symbology', async () => {
    const service = createDataQueryService({
        env: {},
        fetchImpl: async () => tiingoResponse([]),
        providers: [{
            id: 'example',
            normalizeSecurity: (value) => ({
                input: value,
                canonical: `EXAMPLE:${value}`,
                symbol: value,
            }),
            query: async ({ security, field, period }) => ({
                value: `${security.symbol}:${field}:${period}`,
                sourceField: 'fixture',
                cacheStatus: 'bypass',
                period,
            }),
        }],
    });

    const result = await service.query({
        source: 'example',
        security: 'BTC-USD',
        field: 'last',
        period: 'custom-period',
    });
    assert.equal(result.value, 'BTC-USD:LAST:custom-period');
    assert.equal(result.normalizedSecurity, 'EXAMPLE:BTC-USD');
    assert.equal(result.period, 'custom-period');
    assert.deepEqual(service.listProviders(), ['tiingo', 'example']);
});

test('missing credentials and unsupported fields return stable typed errors', async () => {
    const service = createDataQueryService({
        env: {},
        fetchImpl: async () => tiingoResponse([]),
    });
    await assert.rejects(
        service.query({ provider: 'tiingo', security: 'MSFT', field: 'PX_LAST' }),
        (error) => error.code === 'provider_not_configured' && error.status === 503
    );
    await assert.rejects(
        service.query({ provider: 'tiingo', security: 'MSFT', field: 'NOT_A_FIELD' }),
        (error) => error.code === 'field_unsupported' && error.status === 400
    );
    await assert.rejects(
        service.query({ security: 'MSFT', field: 'revenue' }),
        (error) => error.code === 'period_required' && error.status === 400
    );
    await assert.rejects(
        service.query({ security: 'MSFT', field: 'px last', period: '3Q 2024' }),
        (error) => error.code === 'period_not_supported' && error.status === 400
    );
});

test('historical fundamental errors distinguish invalid, missing, and unavailable periods', async () => {
    const service = createDataQueryService({
        env: { TIINGO_API_KEY: 'test-token' },
        fetchImpl: async () => tiingoResponse([{
            date: '2024-03-31', year: 2024, quarter: 3,
            statementData: { incomeStatement: [{ dataCode: 'revenue', value: 61858 }] },
        }]),
    });
    await assert.rejects(
        service.query({ security: 'MSFT', field: 'revenue', period: 'banana' }),
        (error) => error.code === 'period_invalid' && error.status === 400
    );
    await assert.rejects(
        service.query({ security: 'MSFT', field: 'revenue', period: '2Q 2024' }),
        (error) => error.code === 'period_not_found' && error.details.availablePeriods.includes('3Q 2024')
    );
    await assert.rejects(
        service.query({ security: 'MSFT', field: 'not a metric', period: '3Q 2024' }),
        (error) => error.code === 'field_unsupported' && error.status === 400
    );
});

const loadFormulaModule = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/common/onlyoffice/data-query-formulas.js'),
        'utf8'
    );
    const context = {
        AbortController,
        clearTimeout,
        console,
        moduleValue: null,
        setTimeout,
        window: { fetch: () => Promise.reject(new Error('unexpected default fetch')) },
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

test('OnlyOffice registers provider-neutral CORBANU and provider-first PFDATA', async () => {
    const moduleValue = loadFormulaModule();
    const functions = new Map();
    const calls = [];
    let recalculations = 0;
    const editor = {
        addCustomFunction: (func, options) => functions.set(func.name, { func, options }),
        recalculateCustomFunctions: () => { recalculations += 1; },
    };
    const registration = moduleValue.register(editor, {
        fetch: async (url, options) => {
            calls.push({ url, options });
            const request = JSON.parse(options.body);
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    value: request.period ? 61858 : request.source ? 'source-value' : 509.75,
                }),
            };
        },
    });

    assert.equal(registration.ok, true);
    assert.deepEqual([...functions.keys()], ['CORBANU', 'PFDATA']);
    assert.equal(functions.get('CORBANU').options.returnInfo.type, 'any');
    assert.deepEqual(
        Array.from(functions.get('CORBANU').options.params, (parameter) => parameter.name),
        ['security', 'field', 'period', 'source']
    );
    assert.deepEqual(
        Array.from(functions.get('PFDATA').options.params, (parameter) => parameter.name),
        ['source', 'security', 'field', 'period']
    );
    assert.equal(recalculations, 1);
    assert.equal(await functions.get('CORBANU').func('msft us', 'px last'), 509.75);
    assert.equal(await functions.get('CORBANU').func('MSFT US', 'PX_LAST'), 509.75);
    assert.equal(await functions.get('CORBANU').func('msft us', 'revenue', '3Q 2024'), 61858);
    assert.equal(
        await functions.get('CORBANU').func('asset', 'field', '', 'example'),
        'source-value'
    );
    assert.equal(
        await functions.get('PFDATA').func('tiingo', 'V US Equity', 'PX_LAST'),
        'source-value'
    );
    assert.equal(
        await functions.get('PFDATA').func('TIINGO', 'v us equity', 'px last'),
        'source-value'
    );
    assert.equal(calls.length, 4, 'equivalent formulas should share the browser cache');
    assert.equal(calls[0].url, '/api/postfiat/data/query');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        security: 'msft us',
        field: 'PX_LAST',
    });
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        security: 'msft us',
        field: 'REVENUE',
        period: '3Q 2024',
    });
    assert.deepEqual(JSON.parse(calls[2].options.body), {
        security: 'asset',
        field: 'FIELD',
        source: 'example',
    });
    assert.deepEqual(JSON.parse(calls[3].options.body), {
        security: 'V US Equity',
        field: 'PX_LAST',
        source: 'tiingo',
    });
    assert.equal(calls[0].options.credentials, 'same-origin');
});

test('OnlyOffice formula returns a bounded cell-visible error instead of rejecting', async () => {
    const moduleValue = loadFormulaModule();
    let corbanu;
    let pfdata;
    moduleValue.register({
        addCustomFunction: (func) => {
            if (func.name === 'CORBANU') { corbanu = func; }
            if (func.name === 'PFDATA') { pfdata = func; }
        },
        recalculateCustomFunctions: () => {},
    }, {
        fetch: async () => ({
            ok: false,
            status: 404,
            json: async () => ({ ok: false, message: 'Tiingo has no quote for UNKNOWN.' }),
        }),
    });

    assert.equal(
        await corbanu('UNKNOWN US', 'PX LAST'),
        '#CORBANU! Tiingo has no quote for UNKNOWN.'
    );
    assert.equal(
        await pfdata('tiingo', 'UNKNOWN US', 'PX LAST'),
        '#PFDATA! Tiingo has no quote for UNKNOWN.'
    );
});

test('OnlyOffice formula module omits BDP and preserves PFDATA compatibility', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/common/onlyoffice/data-query-formulas.js'),
        'utf8'
    );
    assert.doesNotMatch(source, /function BDP/u);
    assert.match(source, /function PFDATA/u);
    assert.match(source, /function CORBANU/u);
});

test('OnlyOffice sheet bootstrap loads and registers the data-query formula module', () => {
    const inner = fs.readFileSync(
        path.join(repoRoot, 'www/common/onlyoffice/inner.js'),
        'utf8'
    );
    assert.match(inner, /\/common\/onlyoffice\/data-query-formulas\.js/u);
    assert.match(inner, /DataQueryFormulas\.register\(getEditor\(\)/u);
    assert.match(inner, /ooType === "sheet"/u);
});

test('MSFT model exercises quote, quarterly, annual, and calculated CORBANU rows', async () => {
    const model = await import(pathToFileURL(
        path.join(repoRoot, 'scripts/lib/msft-corbanu-model.mjs')
    ));
    assert.equal(model.MODEL_ROWS.length, 40);
    assert.equal(model.MODEL_ROWS[5].length, 12);
    assert.equal(model.MODEL_ROWS[2][1], '=CORBANU($B$2,"px last")');
    assert.equal(model.MODEL_ROWS[6][1], '=CORBANU($B$2,"revenue",B$6)/1000000');
    assert.equal(model.MODEL_ROWS[6][10], '=CORBANU($B$2,"revenue",K$6)/1000000');
    assert.equal(model.MODEL_ROWS[7][5], '=(F7/B7-1)*100');
    assert.equal(model.MODEL_ROWS[7][11], '=(L7/K7-1)*100');
    assert.equal(model.MODEL_ROWS[32][1], '=B32-B31');
    assert.equal(model.MODEL_ROWS[34][1], '=CORBANU($B$2,"current assets",B$6)/1000000');
    assert.equal(model.MODEL_ROWS[36][1], '=CORBANU($B$2,"current liabilities",B$6)/1000000');
    assert.equal(model.MODEL_ROWS[38][1], '=B35/B37');
    assert.equal(model.MODEL_ROWS[39][1], '=B32/B38');
    assert.doesNotMatch(model.MODEL_TSV, /\b(?:BDP|PFDATA)\s*\(/u);
    assert.match(model.MODEL_TSV, /CORBANU\(\$B\$2,"net income",B\$6\)/u);
});
