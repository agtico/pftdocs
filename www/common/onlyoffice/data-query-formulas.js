// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    'use strict';

    var DEFAULT_ENDPOINT = '/api/postfiat/data/query';
    var DEFAULT_CACHE_TTL_MS = 10000;
    var DEFAULT_TIMEOUT_MS = 15000;
    var MAX_ERROR_LENGTH = 180;
    var registeredEditors = typeof(WeakSet) === 'function' ? new WeakSet() : null;

    var cleanText = function (value, maxLength) {
        if (value === null || typeof(value) === 'undefined') { return ''; }
        return String(value).trim().slice(0, maxLength);
    };

    var normalizeRequest = function (security, field, period, source) {
        var request = {
            security: cleanText(security, 120),
            field: cleanText(field, 80).toUpperCase().replace(/[ -]+/g, '_'),
        };
        var normalizedPeriod = cleanText(period, 40);
        var normalizedSource = cleanText(source, 40).toLowerCase();
        if (normalizedPeriod) { request.period = normalizedPeriod; }
        if (normalizedSource) { request.source = normalizedSource; }
        if (!request.security) { throw new Error('security is required'); }
        if (!request.field) { throw new Error('field is required'); }
        return request;
    };

    var errorMessage = function (error, functionName) {
        var message = error && error.message ? error.message : String(error || 'data query failed');
        return '#' + (functionName === 'PFDATA' ? 'PFDATA' : 'CORBANU') + '! ' +
            cleanText(message, MAX_ERROR_LENGTH);
    };

    var makeQueryClient = function (options) {
        options = options || {};
        var fetchImpl = options.fetch || window.fetch.bind(window);
        var endpoint = cleanText(options.endpoint, 500) || DEFAULT_ENDPOINT;
        var cacheTtlMs = Number.isFinite(Number(options.cacheTtlMs)) ?
            Math.max(0, Number(options.cacheTtlMs)) : DEFAULT_CACHE_TTL_MS;
        var timeoutMs = Number.isFinite(Number(options.timeoutMs)) ?
            Math.max(1000, Number(options.timeoutMs)) : DEFAULT_TIMEOUT_MS;
        var cache = new Map();
        var inflight = new Map();

        var fetchRequest = function (request) {
            var controller = typeof(AbortController) === 'function' ? new AbortController() : null;
            var timer = controller ? setTimeout(function () {
                controller.abort();
            }, timeoutMs) : null;

            return fetchImpl(endpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
                signal: controller ? controller.signal : undefined,
            }).then(function (response) {
                return response.json().catch(function () {
                    throw new Error('the data service returned invalid JSON');
                }).then(function (payload) {
                    if (!response.ok || !payload || payload.ok !== true) {
                        var detail = payload && (payload.message || payload.error);
                        throw new Error(cleanText(detail, MAX_ERROR_LENGTH) ||
                            'the data service returned HTTP ' + response.status);
                    }
                    if (!Object.prototype.hasOwnProperty.call(payload, 'value')) {
                        throw new Error('the data service returned no value');
                    }
                    return payload.value;
                });
            }).catch(function (error) {
                if (error && error.name === 'AbortError') {
                    throw new Error('data query timed out');
                }
                throw error;
            }).finally(function () {
                if (timer) { clearTimeout(timer); }
            });
        };

        var query = function (security, field, period, source, functionName) {
            var request;
            try {
                request = normalizeRequest(security, field, period, source);
            } catch (error) {
                return Promise.resolve(errorMessage(error, functionName));
            }

            var key = JSON.stringify([
                request.source || '',
                request.security.toUpperCase(),
                request.field,
                (request.period || '').toUpperCase(),
            ]);
            var now = Date.now();
            var cached = cache.get(key);
            if (cached && cached.expiresAt > now) {
                return Promise.resolve(cached.value);
            }
            if (inflight.has(key)) { return inflight.get(key); }

            var pending = fetchRequest(request).then(function (value) {
                cache.set(key, { value: value, expiresAt: Date.now() + cacheTtlMs });
                return value;
            }).catch(function (error) {
                return errorMessage(error, functionName);
            }).finally(function () {
                inflight.delete(key);
            });
            inflight.set(key, pending);
            return pending;
        };

        return {
            query: query,
            clear: function () {
                cache.clear();
                inflight.clear();
            },
        };
    };

    var CORBANU_OPTIONS = {
        description: 'Returns current or historical financial data for a security.',
        params: [
            {
                name: 'security',
                type: 'string',
                isOptional: false,
                description: 'Ticker and market identifier, for example MSFT US.',
            },
            {
                name: 'field',
                type: 'string',
                isOptional: false,
                description: 'Quote or fundamental field, for example PX LAST or REVENUE.',
            },
            {
                name: 'period',
                type: 'string',
                isOptional: true,
                description: 'Fiscal period for fundamentals, for example 3Q 2024 or FY 2024.',
            },
            {
                name: 'source',
                type: 'string',
                isOptional: true,
                description: 'Optional data source; the server default is used when omitted.',
            },
        ],
        returnInfo: { type: 'any' },
    };

    var PFDATA_OPTIONS = {
        description: 'Returns financial data from a named provider.',
        params: [
            {
                name: 'source',
                type: 'string',
                isOptional: false,
                description: 'Data source, for example tiingo.',
            },
            {
                name: 'security',
                type: 'string',
                isOptional: false,
                description: 'Ticker and market identifier, for example MSFT US Equity.',
            },
            {
                name: 'field',
                type: 'string',
                isOptional: false,
                description: 'Quote or fundamental field, for example PX LAST or REVENUE.',
            },
            {
                name: 'period',
                type: 'string',
                isOptional: true,
                description: 'Fiscal period for fundamentals, for example 3Q 2024 or FY 2024.',
            },
        ],
        returnInfo: { type: 'any' },
    };

    var register = function (editor, options) {
        if (!editor || typeof(editor.addCustomFunction) !== 'function') {
            return { ok: false, error: 'spreadsheet_custom_functions_unavailable' };
        }
        if (registeredEditors && registeredEditors.has(editor)) {
            return { ok: true, alreadyRegistered: true, functions: ['CORBANU', 'PFDATA'] };
        }

        var client = makeQueryClient(options);

        function CORBANU(security, field, period, source) {
            return client.query(security, field, period, source, 'CORBANU');
        }

        function PFDATA(source, security, field, period) {
            return client.query(security, field, period, source, 'PFDATA');
        }

        editor.addCustomFunction(CORBANU, CORBANU_OPTIONS);
        editor.addCustomFunction(PFDATA, PFDATA_OPTIONS);
        if (typeof(editor.recalculateCustomFunctions) === 'function') {
            editor.recalculateCustomFunctions();
        }
        if (registeredEditors) { registeredEditors.add(editor); }

        return {
            ok: true,
            functions: ['CORBANU', 'PFDATA'],
            client: client,
        };
    };

    return {
        CORBANU_OPTIONS: CORBANU_OPTIONS,
        PFDATA_OPTIONS: PFDATA_OPTIONS,
        makeQueryClient: makeQueryClient,
        normalizeRequest: normalizeRequest,
        register: register,
    };
});
