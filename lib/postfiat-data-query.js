// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

'use strict';

const DEFAULT_TIINGO_BASE_URL = 'https://api.tiingo.com';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_CACHE_TTL_MS = 15000;
const DEFAULT_CACHE_STALE_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 2048;
const DEFAULT_FUNDAMENTAL_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_FUNDAMENTAL_CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FUNDAMENTAL_CACHE_MAX_ENTRIES = 256;
const MAX_UPSTREAM_BYTES = 512 * 1024;
const MAX_FUNDAMENTAL_UPSTREAM_BYTES = 2 * 1024 * 1024;

const TIINGO_IEX_FIELDS = Object.freeze({
    PX_LAST: { sourceFields: ['tngoLast', 'last'] },
    LAST_PRICE: { sourceFields: ['tngoLast', 'last'] },
    TNGO_LAST: { sourceFields: ['tngoLast'] },
    LAST: { sourceFields: ['last'] },
    PX_OPEN: { sourceFields: ['open'] },
    OPEN: { sourceFields: ['open'] },
    PX_HIGH: { sourceFields: ['high'] },
    HIGH: { sourceFields: ['high'] },
    PX_LOW: { sourceFields: ['low'] },
    LOW: { sourceFields: ['low'] },
    PX_VOLUME: { sourceFields: ['volume'] },
    VOLUME: { sourceFields: ['volume'] },
    PX_BID: { sourceFields: ['bidPrice'] },
    BID_PRICE: { sourceFields: ['bidPrice'] },
    BID_SIZE: { sourceFields: ['bidSize'] },
    PX_ASK: { sourceFields: ['askPrice'] },
    ASK_PRICE: { sourceFields: ['askPrice'] },
    ASK_SIZE: { sourceFields: ['askSize'] },
    PX_MID: { sourceFields: ['mid'] },
    MID: { sourceFields: ['mid'] },
    PREV_CLOSE: { sourceFields: ['prevClose'] },
    LAST_UPDATE_DT: { sourceFields: ['timestamp'] },
    QUOTE_TIMESTAMP: { sourceFields: ['quoteTimestamp'] },
    LAST_SALE_TIMESTAMP: { sourceFields: ['lastSaleTimestamp'] },
    TICKER: { sourceFields: ['ticker'] },
});

// Tiingo's definitions endpoint currently advertises these statement codes.
// Queries also normalize readable aliases below, while retaining direct access
// to every provider code so newly composed models are not limited to a shortlist.
const TIINGO_FUNDAMENTAL_CODES = Object.freeze([
    'accoci',
    'acctPay',
    'acctRec',
    'assetsCurrent',
    'assetsNonCurrent',
    'assetTurnover',
    'bookVal',
    'businessAcqDisposals',
    'bvps',
    'capex',
    'cashAndEq',
    'consolidatedIncome',
    'costRev',
    'currentRatio',
    'debt',
    'debtCurrent',
    'debtEquity',
    'debtNonCurrent',
    'deferredRev',
    'depamor',
    'deposits',
    'ebit',
    'ebitda',
    'ebt',
    'enterpriseVal',
    'eps',
    'epsDil',
    'epsQoQ',
    'equity',
    'freeCashFlow',
    'fxRate',
    'grossMargin',
    'grossProfit',
    'intangibles',
    'intexp',
    'inventory',
    'investments',
    'investmentsAcqDisposals',
    'investmentsCurrent',
    'investmentsNonCurrent',
    'issrepayDebt',
    'issrepayEquity',
    'liabilitiesCurrent',
    'liabilitiesNonCurrent',
    'longTermDebtEquity',
    'marketCap',
    'ncf',
    'ncff',
    'ncfi',
    'ncfo',
    'ncfx',
    'netinc',
    'netIncComStock',
    'netIncDiscOps',
    'netMargin',
    'nonControllingInterests',
    'opex',
    'opinc',
    'opMargin',
    'payDiv',
    'pbRatio',
    'peRatio',
    'piotroskiFScore',
    'ppeq',
    'prefDVDs',
    'profitMargin',
    'retainedEarnings',
    'revenue',
    'revenueQoQ',
    'rnd',
    'roa',
    'roe',
    'rps',
    'sbcomp',
    'sga',
    'shareFactor',
    'sharesBasic',
    'shareswa',
    'shareswaDil',
    'taxAssets',
    'taxExp',
    'taxLiabilities',
    'totalAssets',
    'totalLiabilities',
    'trailingPEG1Y',
]);

const TIINGO_FUNDAMENTAL_ALIASES = Object.freeze({
    SALES: 'revenue',
    TOTAL_REVENUE: 'revenue',
    COGS: 'costRev',
    COST_OF_GOODS_SOLD: 'costRev',
    COST_OF_REVENUE: 'costRev',
    OPERATING_EXPENSES: 'opex',
    OPERATING_INCOME: 'opinc',
    RESEARCH_AND_DEVELOPMENT: 'rnd',
    R_AND_D: 'rnd',
    SG_AND_A: 'sga',
    INTEREST_EXPENSE: 'intexp',
    PRETAX_INCOME: 'ebt',
    PRE_TAX_INCOME: 'ebt',
    INCOME_TAX: 'taxExp',
    INCOME_TAX_EXPENSE: 'taxExp',
    NET_INCOME: 'netinc',
    NET_INCOME_COMMON: 'netIncComStock',
    DILUTED_EPS: 'epsDil',
    EPS_DILUTED: 'epsDil',
    BASIC_EPS: 'eps',
    BASIC_SHARES: 'shareswa',
    DILUTED_SHARES: 'shareswaDil',
    WEIGHTED_AVERAGE_SHARES: 'shareswa',
    WEIGHTED_AVERAGE_SHARES_DILUTED: 'shareswaDil',
    CASH: 'cashAndEq',
    CASH_AND_EQUIVALENTS: 'cashAndEq',
    ACCOUNTS_RECEIVABLE: 'acctRec',
    ACCOUNTS_PAYABLE: 'acctPay',
    CURRENT_ASSETS: 'assetsCurrent',
    NON_CURRENT_ASSETS: 'assetsNonCurrent',
    PROPERTY_PLANT_AND_EQUIPMENT: 'ppeq',
    PP_AND_E: 'ppeq',
    CURRENT_LIABILITIES: 'liabilitiesCurrent',
    NON_CURRENT_LIABILITIES: 'liabilitiesNonCurrent',
    CURRENT_DEBT: 'debtCurrent',
    LONG_TERM_DEBT: 'debtNonCurrent',
    TOTAL_DEBT: 'debt',
    SHAREHOLDERS_EQUITY: 'equity',
    STOCKHOLDERS_EQUITY: 'equity',
    CASH_FROM_OPERATIONS: 'ncfo',
    OPERATING_CASH_FLOW: 'ncfo',
    CASH_FROM_INVESTING: 'ncfi',
    CASH_FROM_FINANCING: 'ncff',
    CAPITAL_EXPENDITURES: 'capex',
    CAPITAL_EXPENDITURE: 'capex',
    FREE_CASH_FLOW: 'freeCashFlow',
    STOCK_BASED_COMPENSATION: 'sbcomp',
    SHARE_BASED_COMPENSATION: 'sbcomp',
    DEPRECIATION_AND_AMORTIZATION: 'depamor',
    DIVIDENDS_PAID: 'payDiv',
    SHARE_REPURCHASES: 'issrepayEquity',
    EQUITY_ISSUANCE_REPAYMENT: 'issrepayEquity',
    DEBT_ISSUANCE_REPAYMENT: 'issrepayDebt',
    GROSS_MARGIN_PERCENT: 'grossMargin',
    OPERATING_MARGIN: 'opMargin',
    NET_INCOME_MARGIN: 'netMargin',
    RETURN_ON_EQUITY: 'roe',
    RETURN_ON_ASSETS: 'roa',
    DEBT_TO_EQUITY: 'debtEquity',
    LONG_TERM_DEBT_TO_EQUITY: 'longTermDebtEquity',
    PRICE_TO_EARNINGS: 'peRatio',
    PRICE_TO_BOOK: 'pbRatio',
    ENTERPRISE_VALUE: 'enterpriseVal',
    MARKET_CAPITALIZATION: 'marketCap',
});

class DataQueryError extends Error {
    constructor(code, message, status, details) {
        super(message);
        this.name = 'DataQueryError';
        this.code = code;
        this.status = status || 400;
        this.details = details;
    }
}

const boundedInteger = (value, fallback, min, max) => {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed)) { return fallback; }
    return Math.min(max, Math.max(min, parsed));
};

const nonEmptyText = (value, maxLength) => {
    if (typeof(value) !== 'string') { return ''; }
    return value.trim().slice(0, maxLength);
};

const normalizeProvider = (value) => {
    const provider = nonEmptyText(value, 40).toLowerCase();
    if (!provider) {
        throw new DataQueryError('provider_required', 'A data provider is required.', 400);
    }
    if (!/^[a-z][a-z0-9_-]*$/u.test(provider)) {
        throw new DataQueryError('provider_invalid', 'The data provider name is invalid.', 400);
    }
    return provider;
};

const normalizeField = (value) => {
    const field = nonEmptyText(value, 80).toUpperCase().replace(/[ -]+/gu, '_');
    if (!field) {
        throw new DataQueryError('field_required', 'A data field is required.', 400);
    }
    if (!/^[A-Z][A-Z0-9_]*$/u.test(field)) {
        throw new DataQueryError('field_invalid', 'The data field name is invalid.', 400);
    }
    return field;
};

const fundamentalFieldKey = (value) => normalizeField(value).replace(/_/gu, '');

const TIINGO_FUNDAMENTAL_CODE_BY_KEY = new Map(
    TIINGO_FUNDAMENTAL_CODES.map((code) => [fundamentalFieldKey(code), code])
);
Object.entries(TIINGO_FUNDAMENTAL_ALIASES).forEach(([alias, code]) => {
    TIINGO_FUNDAMENTAL_CODE_BY_KEY.set(fundamentalFieldKey(alias), code);
});

const resolveTiingoFundamentalCode = (field) => {
    return TIINGO_FUNDAMENTAL_CODE_BY_KEY.get(fundamentalFieldKey(field)) || '';
};

const normalizeFundamentalYear = (value) => {
    let year = Number.parseInt(String(value), 10);
    if (year >= 0 && year <= 99) { year += 2000; }
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        throw new DataQueryError('period_invalid', 'The fiscal period year is invalid.', 400);
    }
    return year;
};

const normalizeFundamentalPeriod = (value) => {
    const input = nonEmptyText(value, 40);
    if (!input) {
        throw new DataQueryError(
            'period_required',
            'Historical fundamentals require a fiscal period such as 3Q 2024 or FY 2024.',
            400
        );
    }
    const compact = input.toUpperCase().replace(/[\s._/-]+/gu, '');
    if (compact === 'LATEST' || compact === 'LATESTQUARTER' || compact === 'LQ') {
        return { input, type: 'latest', year: null, quarter: null, canonical: 'LATEST' };
    }

    let match = compact.match(/^Q([1-4])(\d{2}|\d{4})$/u) ||
        compact.match(/^([1-4])Q(\d{2}|\d{4})$/u);
    if (match) {
        const quarter = Number.parseInt(match[1], 10);
        const year = normalizeFundamentalYear(match[2]);
        return { input, type: 'quarter', year, quarter, canonical: `${quarter}Q ${year}` };
    }

    match = compact.match(/^(\d{2}|\d{4})Q([1-4])$/u) ||
        compact.match(/^(\d{2}|\d{4})([1-4])Q$/u);
    if (match) {
        const year = normalizeFundamentalYear(match[1]);
        const quarter = Number.parseInt(match[2], 10);
        return { input, type: 'quarter', year, quarter, canonical: `${quarter}Q ${year}` };
    }

    match = compact.match(/^FY(\d{2}|\d{4})$/u) ||
        compact.match(/^(\d{2}|\d{4})(?:FY|A)?$/u);
    if (match) {
        const year = normalizeFundamentalYear(match[1]);
        return { input, type: 'annual', year, quarter: 0, canonical: `FY ${year}` };
    }

    throw new DataQueryError(
        'period_invalid',
        'Use a fiscal period such as 3Q 2024, Q3 2024, FY 2024, or LATEST.',
        400
    );
};

const normalizeEquitySecurity = (value) => {
    const input = nonEmptyText(value, 120);
    if (!input) {
        throw new DataQueryError('security_required', 'A security is required.', 400);
    }

    const parts = input.toUpperCase().split(/\s+/u).filter(Boolean);
    const symbolInput = parts.shift() || '';
    let market = 'US';
    let securityType = 'EQUITY';

    if (parts.length && parts[parts.length - 1] === 'EQUITY') {
        parts.pop();
    }
    if (parts.length) {
        market = parts.shift();
    }
    if (parts.length) {
        throw new DataQueryError(
            'security_invalid',
            'Use a ticker or Bloomberg-style security such as MSFT US Equity.',
            400
        );
    }
    if (market !== 'US') {
        throw new DataQueryError(
            'security_market_unsupported',
            'The Tiingo equity provider currently supports US equity identifiers.',
            400,
            { market }
        );
    }

    const symbol = symbolInput.replace('/', '-');
    if (!/^[A-Z0-9][A-Z0-9.-]{0,24}$/u.test(symbol)) {
        throw new DataQueryError('security_invalid', 'The equity ticker is invalid.', 400);
    }

    return {
        input,
        symbol,
        market,
        securityType,
        canonical: `${symbol} ${market} ${securityType}`,
    };
};

const normalizeBaseUrl = (value) => {
    const candidate = nonEmptyText(value, 500) || DEFAULT_TIINGO_BASE_URL;
    let url;
    try {
        url = new URL(candidate);
    } catch (error) {
        throw new DataQueryError('provider_config_invalid', 'The Tiingo API URL is invalid.', 500);
    }
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new DataQueryError('provider_config_invalid', 'The Tiingo API URL must use HTTPS.', 500);
    }
    return url.href.replace(/\/+$/u, '');
};

const responseText = async (response, maxBytes = MAX_UPSTREAM_BYTES) => {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new DataQueryError('provider_response_too_large', 'The data provider response was too large.', 502);
    }
    return text;
};

const parseProviderJson = (text) => {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new DataQueryError('provider_response_invalid', 'The data provider returned invalid JSON.', 502);
    }
};

const firstPresentValue = (row, fields) => {
    for (const field of fields) {
        const value = row[field];
        if (value !== null && typeof(value) !== 'undefined' && value !== '') {
            return { field, value };
        }
    }
    return null;
};

const normalizeCellValue = (value) => {
    if (typeof(value) === 'number') {
        if (!Number.isFinite(value)) {
            throw new DataQueryError('provider_value_invalid', 'The data provider returned a non-finite number.', 502);
        }
        return value;
    }
    if (typeof(value) === 'string' || typeof(value) === 'boolean') { return value; }
    throw new DataQueryError('provider_value_invalid', 'The data provider returned an unsupported value.', 502);
};

const makeSnapshotCache = ({ ttlMs, staleMs, maxEntries, now }) => {
    const entries = new Map();
    const inflight = new Map();

    const touch = (key, entry) => {
        entries.delete(key);
        entries.set(key, entry);
    };

    const prune = () => {
        while (entries.size > maxEntries) {
            const key = entries.keys().next().value;
            if (typeof(key) === 'undefined') { break; }
            entries.delete(key);
        }
    };

    const get = async (key, loader) => {
        const current = now();
        const existing = entries.get(key);
        if (existing) { touch(key, existing); }
        if (existing && existing.expiresAt > current) {
            return { value: existing.value, cacheStatus: 'hit', fetchedAt: existing.fetchedAt };
        }

        if (inflight.has(key)) {
            try {
                const loaded = await inflight.get(key);
                return { value: loaded.value, cacheStatus: 'coalesced', fetchedAt: loaded.fetchedAt };
            } catch (error) {
                if (existing && existing.staleExpiresAt > current) {
                    return { value: existing.value, cacheStatus: 'stale', fetchedAt: existing.fetchedAt };
                }
                throw error;
            }
        }

        const pending = Promise.resolve().then(loader).then((value) => {
            const fetchedAt = new Date(now()).toISOString();
            const entry = {
                value,
                fetchedAt,
                expiresAt: now() + ttlMs,
                staleExpiresAt: now() + Math.max(ttlMs, staleMs),
            };
            if (maxEntries > 0 && ttlMs > 0) {
                entries.set(key, entry);
                prune();
            }
            return entry;
        }).finally(() => {
            inflight.delete(key);
        });
        inflight.set(key, pending);

        try {
            const loaded = await pending;
            return {
                value: loaded.value,
                cacheStatus: existing ? 'refresh' : 'miss',
                fetchedAt: loaded.fetchedAt,
            };
        } catch (error) {
            if (existing && existing.staleExpiresAt > current) {
                return { value: existing.value, cacheStatus: 'stale', fetchedAt: existing.fetchedAt };
            }
            throw error;
        }
    };

    return {
        get,
        clear: () => {
            entries.clear();
            inflight.clear();
        },
    };
};

const createTiingoProvider = ({ fetchImpl, env, config, now }) => {
    const apiKey = nonEmptyText(env.TIINGO_API_KEY || env.TIINGO_TOKEN, 500);
    const baseUrl = normalizeBaseUrl(config.baseUrl || env.TIINGO_API_BASE_URL);
    const timeoutMs = boundedInteger(
        config.timeoutMs || env.TIINGO_API_TIMEOUT_MS,
        DEFAULT_TIMEOUT_MS,
        1000,
        30000
    );
    const quoteCache = makeSnapshotCache({
        ttlMs: boundedInteger(config.quoteCacheTtlMs, DEFAULT_CACHE_TTL_MS, 0, 5 * 60 * 1000),
        staleMs: boundedInteger(config.quoteCacheStaleMs, DEFAULT_CACHE_STALE_MS, 0, 60 * 60 * 1000),
        maxEntries: boundedInteger(config.quoteCacheMaxEntries, DEFAULT_CACHE_MAX_ENTRIES, 0, 10000),
        now,
    });
    const fundamentalCache = makeSnapshotCache({
        ttlMs: boundedInteger(
            config.fundamentalCacheTtlMs,
            DEFAULT_FUNDAMENTAL_CACHE_TTL_MS,
            0,
            24 * 60 * 60 * 1000
        ),
        staleMs: boundedInteger(
            config.fundamentalCacheStaleMs,
            DEFAULT_FUNDAMENTAL_CACHE_STALE_MS,
            0,
            7 * 24 * 60 * 60 * 1000
        ),
        maxEntries: boundedInteger(
            config.fundamentalCacheMaxEntries,
            DEFAULT_FUNDAMENTAL_CACHE_MAX_ENTRIES,
            0,
            2000
        ),
        now,
    });

    const requestJson = async (path, maxBytes) => {
        if (!apiKey) {
            throw new DataQueryError(
                'provider_not_configured',
                'The Tiingo data provider is not configured.',
                503
            );
        }

        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
        try {
            const response = await fetchImpl(`${baseUrl}${path}`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Token ${apiKey}`,
                },
                signal: controller.signal,
            });
            const text = await responseText(response, maxBytes);
            if (!response.ok) {
                throw new DataQueryError(
                    response.status === 404 ? 'security_not_found' : 'provider_request_failed',
                    `Tiingo returned HTTP ${response.status}.`,
                    response.status === 404 ? 404 : 502
                );
            }
            return parseProviderJson(text);
        } catch (error) {
            if (timedOut) {
                throw new DataQueryError('provider_timeout', 'The Tiingo request timed out.', 504);
            }
            if (error instanceof DataQueryError) { throw error; }
            throw new DataQueryError('provider_unavailable', 'The Tiingo data provider is unavailable.', 502);
        } finally {
            clearTimeout(timer);
        }
    };

    const loadQuote = async (symbol) => {
        const payload = await requestJson(`/iex/${encodeURIComponent(symbol)}`, MAX_UPSTREAM_BYTES);
        const row = Array.isArray(payload) ? payload[0] : payload;
        if (!row || typeof(row) !== 'object' || Array.isArray(row)) {
            throw new DataQueryError('security_not_found', `Tiingo has no quote for ${symbol}.`, 404);
        }
        return row;
    };

    const loadStatements = async (symbol) => {
        const payload = await requestJson(
            `/tiingo/fundamentals/${encodeURIComponent(symbol)}/statements`,
            MAX_FUNDAMENTAL_UPSTREAM_BYTES
        );
        if (!Array.isArray(payload) || !payload.length) {
            throw new DataQueryError(
                'fundamentals_not_found',
                `Tiingo has no statement history for ${symbol}.`,
                404
            );
        }
        return payload.filter((row) => row && typeof(row) === 'object' && !Array.isArray(row));
    };

    const selectStatement = (rows, period) => {
        const candidates = rows.filter((row) => {
            if (!Number.isInteger(row.year) || !Number.isInteger(row.quarter)) { return false; }
            if (period.type === 'latest') { return row.quarter >= 1 && row.quarter <= 4; }
            return row.year === period.year && row.quarter === period.quarter;
        }).sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
        return candidates[0] || null;
    };

    const availablePeriods = (rows) => rows.filter((row) => {
        return Number.isInteger(row.year) && Number.isInteger(row.quarter);
    }).map((row) => row.quarter === 0 ? `FY ${row.year}` : `${row.quarter}Q ${row.year}`);

    const queryFundamental = async ({ security, field, period: periodInput }) => {
        const period = normalizeFundamentalPeriod(periodInput);
        const dataCode = resolveTiingoFundamentalCode(field);
        if (!dataCode) {
            throw new DataQueryError(
                'field_unsupported',
                `Field ${field} is not supported by Tiingo historical fundamentals.`,
                400,
                { supportedDataCodes: TIINGO_FUNDAMENTAL_CODES }
            );
        }

        const snapshot = await fundamentalCache.get(
            security.symbol,
            () => loadStatements(security.symbol)
        );
        const statement = selectStatement(snapshot.value, period);
        if (!statement) {
            throw new DataQueryError(
                'period_not_found',
                `Tiingo has no ${period.canonical} statement for ${security.symbol}.`,
                404,
                { availablePeriods: availablePeriods(snapshot.value) }
            );
        }

        const values = Object.values(statement.statementData || {}).flatMap((section) => {
            return Array.isArray(section) ? section : [];
        });
        const selected = values.find((entry) => entry && entry.dataCode === dataCode);
        if (!selected || selected.value === null || typeof(selected.value) === 'undefined') {
            throw new DataQueryError(
                'field_unavailable',
                `Tiingo returned no ${field} value for ${security.symbol} in ${period.canonical}.`,
                404
            );
        }

        const canonicalPeriod = statement.quarter === 0 ?
            `FY ${statement.year}` : `${statement.quarter}Q ${statement.year}`;
        return {
            value: normalizeCellValue(selected.value),
            sourceField: dataCode,
            asOf: nonEmptyText(statement.date, 80) || snapshot.fetchedAt,
            cacheStatus: snapshot.cacheStatus,
            period: canonicalPeriod,
            fiscalYear: statement.year,
            fiscalQuarter: statement.quarter,
        };
    };

    const queryQuote = async ({ security, field }) => {
        const fieldDefinition = TIINGO_IEX_FIELDS[field];
        if (!fieldDefinition) {
            const fundamentalCode = resolveTiingoFundamentalCode(field);
            if (fundamentalCode) {
                throw new DataQueryError(
                    'period_required',
                    `Field ${field} requires a fiscal period such as 3Q 2024 or FY 2024.`,
                    400
                );
            }
            throw new DataQueryError(
                'field_unsupported',
                `Field ${field} is not supported by the Tiingo quote provider.`,
                400,
                { supportedFields: Object.keys(TIINGO_IEX_FIELDS) }
            );
        }

        const snapshot = await quoteCache.get(security.symbol, () => loadQuote(security.symbol));
        const selected = firstPresentValue(snapshot.value, fieldDefinition.sourceFields);
        if (!selected) {
            throw new DataQueryError(
                'field_unavailable',
                `Tiingo returned no value for ${field} on ${security.symbol}.`,
                404
            );
        }

        return {
            value: normalizeCellValue(selected.value),
            sourceField: selected.field,
            asOf: nonEmptyText(snapshot.value.timestamp, 80) || snapshot.fetchedAt,
            cacheStatus: snapshot.cacheStatus,
        };
    };

    return {
        id: 'tiingo',
        normalizeSecurity: normalizeEquitySecurity,
        query: async ({ security, field, period }) => {
            if (nonEmptyText(period, 40)) {
                if (TIINGO_IEX_FIELDS[field]) {
                    throw new DataQueryError(
                        'period_not_supported',
                        `Quote field ${field} does not accept a fiscal period.`,
                        400
                    );
                }
                return queryFundamental({ security, field, period });
            }
            return queryQuote({ security, field });
        },
        clear: () => {
            quoteCache.clear();
            fundamentalCache.clear();
        },
    };
};

const createDataQueryService = (options = {}) => {
    const fetchImpl = options.fetchImpl || global.fetch;
    if (typeof(fetchImpl) !== 'function') {
        throw new TypeError('fetch implementation required');
    }
    const env = options.env || process.env;
    const config = options.config || {};
    const now = typeof(options.now) === 'function' ? options.now : Date.now;
    const defaultProvider = normalizeProvider(options.defaultProvider || config.defaultProvider || 'tiingo');
    const providers = new Map();

    const registerProvider = (provider) => {
        if (!provider || typeof(provider.id) !== 'string' || typeof(provider.query) !== 'function') {
            throw new TypeError('invalid data query provider');
        }
        providers.set(normalizeProvider(provider.id), provider);
    };

    registerProvider(createTiingoProvider({
        fetchImpl,
        env,
        config: config.tiingo || config,
        now,
    }));
    (options.providers || []).forEach(registerProvider);

    return {
        query: async (input) => {
            if (!input || typeof(input) !== 'object' || Array.isArray(input)) {
                throw new DataQueryError('query_invalid', 'The data query must be a JSON object.', 400);
            }
            const providerName = normalizeProvider(input.source || input.provider || defaultProvider);
            const provider = providers.get(providerName);
            if (!provider) {
                throw new DataQueryError(
                    'provider_unsupported',
                    `Data provider ${providerName} is not supported.`,
                    400,
                    { supportedProviders: Array.from(providers.keys()) }
                );
            }
            const security = typeof(provider.normalizeSecurity) === 'function' ?
                provider.normalizeSecurity(input.security) : {
                    input: nonEmptyText(input.security, 120),
                    canonical: nonEmptyText(input.security, 120),
                    symbol: nonEmptyText(input.security, 120),
                };
            if (!security.input) {
                throw new DataQueryError('security_required', 'A security is required.', 400);
            }
            const field = normalizeField(input.field);
            const result = await provider.query({
                security,
                field,
                period: nonEmptyText(input.period, 40),
                options: input.options && typeof(input.options) === 'object' && !Array.isArray(input.options) ?
                    input.options : {},
            });
            return {
                ok: true,
                provider: providerName,
                security: security.input,
                normalizedSecurity: security.canonical,
                symbol: security.symbol,
                field,
                value: result.value,
                sourceField: result.sourceField || '',
                asOf: result.asOf || null,
                cacheStatus: result.cacheStatus || 'unknown',
                period: result.period || null,
                fiscalYear: Number.isInteger(result.fiscalYear) ? result.fiscalYear : null,
                fiscalQuarter: Number.isInteger(result.fiscalQuarter) ? result.fiscalQuarter : null,
            };
        },
        listProviders: () => Array.from(providers.keys()),
        clear: () => providers.forEach((provider) => {
            if (typeof(provider.clear) === 'function') { provider.clear(); }
        }),
    };
};

module.exports = {
    DataQueryError,
    TIINGO_FUNDAMENTAL_ALIASES,
    TIINGO_FUNDAMENTAL_CODES,
    TIINGO_IEX_FIELDS,
    createDataQueryService,
    normalizeEquitySecurity,
    normalizeField,
    normalizeFundamentalPeriod,
    normalizeProvider,
    resolveTiingoFundamentalCode,
};
