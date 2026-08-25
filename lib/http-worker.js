// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const process = require("node:process");
const Http = require("node:http");
const Default = require("./defaults");
const Path = require("node:path");
const Fs = require("node:fs");
const nThen = require("nthen");
const Util = require("./common-util");
const Logger = require("./log");
const AuthCommands = require("./http-commands");
const MFA = require("./storage/mfa");
const Sessions = require("./storage/sessions");
const cookieParser = require("cookie-parser");
const bodyParser = require('body-parser');
const BlobStore = require("./storage/blob");
const BlockStore = require("./storage/block");
const plugins = require("./plugin-manager");
const gzipStatic = require('connect-gzip-static');
const CPCrypto = require('./crypto');
const Xrpl = require('xrpl');

const DEFAULT_QUERY_TIMEOUT = 5000;
const PID = process.pid;
const POSTFIAT_ACCOUNT_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const POSTFIAT_CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,}|bafk[a-z2-7]{20,}|[a-zA-Z0-9]{32,})$/;
const POSTFIAT_DEFAULT_IPFS_GATEWAYS = [
    'https://dweb.link/ipfs/',
    'https://ipfs.io/ipfs/',
];
const POSTFIAT_PROXY_TIMEOUT_MS = 12000;
const POSTFIAT_PROXY_MAX_BYTES = 5 * 1024 * 1024;
const POSTFIAT_ACCOUNT_TX_CACHE_TTL_MS = 60 * 1000;
const POSTFIAT_ACCOUNT_TX_CACHE_STALE_MS = 10 * 60 * 1000;
const POSTFIAT_ACCOUNT_TX_CACHE_MAX_ENTRIES = 2048;
const RUNPOD_REST_BASE_URL = 'https://rest.runpod.io/v1';
const RUNPOD_PROXY_TIMEOUT_MS = 60000;
const RUNPOD_CHAT_TIMEOUT_MS = 5 * 60 * 1000;
const RUNPOD_POD_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,80}$/;
const RUNPOD_PROXY_HOST_RE = /(^|\.)proxy\.runpod\.net$/u;
const POSTFIAT_RPC_PROXY_METHODS = new Set([
    'account_info',
    'ledger_current',
    'submit',
]);
var postFiatAccountTxCache = new Map();
var postFiatAccountTxInflight = new Map();

let SSOUtils = plugins.SSO && plugins.SSO.utils;

var Env = JSON.parse(process.env.Env);
let blobStore;
let cpcrypto;
Env.plugins = plugins;
const response = Util.response(function (errLabel, info) {
    if (!Env.Log) { return; }
    Env.Log.error(errLabel, info);
});

const guid = () => {
    return Util.guid(response._pending);
};

const sendMessage = Env.sendMessage = (msg, cb, opt) => {
    var txid = guid();
    var timeout = (opt && opt.timeout) || DEFAULT_QUERY_TIMEOUT;
    var obj = {
        pid: PID,
        txid: txid,
        content: msg,
    };
    response.expect(txid, cb, timeout);
    process.send(obj);
};
const Log = {};
Logger.levels.forEach(level => {
    Log[level] = function (tag, info) {
        sendMessage({
            command: 'LOG',
            level: level,
            tag: tag,
            info: info,
        }, (err) => {
            if (err) {
                return void console.error(new Error(err));
            }
        });
    };
});
Env.Log = Log;
Env.incrementBytesWritten = function () {};

const EVENTS = {};

EVENTS.ENV_UPDATE = function (data /*, cb */) {
    try {
        Env = JSON.parse(data);
        Env.blobStore = blobStore;
        Env.Log = Log;
        Env.plugins = plugins;
        Env.sendMessage = sendMessage;
        Env.incrementBytesWritten = function () {};
        clearPostFiatAccountTxCache();
    } catch (err) {
        Log.error('HTTP_WORKER_ENV_UPDATE', Util.serializeError(err));
    }
};

EVENTS.FLUSH_CACHE = function (data) {
    if (typeof(data) !== 'number') {
        return Log.error('INVALID_FRESH_KEY', data);
    }

    Env.FRESH_KEY = data;
    [ 'configCache', 'broadcastCache', ].forEach(key => {
        Env[key] = {};
    });
    [ 'officeHeadersCache', 'standardHeadersCache', 'apiHeadersCache', ].forEach(key => {
        Env[key] = undefined;
    });
    clearPostFiatAccountTxCache();
};

Object.keys(plugins || {}).forEach(name => {
    let plugin = plugins[name];
    if (!plugin.addHttpEvents) { return; }
    try {
        let events = plugin.addHttpEvents(Env);
        Object.keys(events || {}).forEach(cmd => {
            // Uppercase event name?
            if (cmd !== cmd.toUpperCase()) { return; }
            // Event is a function?
            if (typeof(events[cmd]) !== "function") { return; }
            // Event doesn't already exists?
            if (EVENTS[cmd]) { return; }
            EVENTS[cmd] = events[cmd];
        });
    } catch (e) {}
});

process.on('message', msg => {
    if (!(msg && msg.txid)) { return; }
    if (msg.type === 'REPLY') {
        var txid = msg.txid;
        return void response.handle(txid, [msg.error, msg.value]);
    } else if (msg.type === 'EVENT') {
        // response to event...
        // ie. Update Env, flush cache, etc.
        var ev = EVENTS[msg.command];
        if (typeof(ev) === 'function') {
            return void ev(msg.data, () => {});
        }
    }
    //console.error("UNHANDLED_MESSAGE", msg);
});


var applyHeaderMap = function (res, map) {
    for (let header in map) {
        if (typeof(map[header]) === 'string') { res.setHeader(header, map[header]); }
    }
};

var EXEMPT = [
    /^\/common\/onlyoffice\/.*\.html.*/,
    /^\/common\/onlyoffice\/dist\/.*\/sdkjs\/common\/spell\/spell\/spell.js.*/,  // OnlyOffice loads spell.wasm in a way that needs unsave-eval
    /^\/(sheet|presentation|doc)\/inner\.html.*/,
    /^\/unsafeiframe\/inner\.html.*$/,
];

var cacheHeaders = function (Env, key, headers) {
    if (Env.DEV_MODE) { return; }
    Env[key] = headers;
};

var getHeaders = function (Env, type) {
    var key = type + 'HeadersCache';
    if (Env[key]) { return Util.clone(Env[key]); }

    var headers = Default.httpHeaders(Env);

    var csp;
    if (type === 'office') {
        csp = Default.padContentSecurity(Env);
    } else if (type === 'postfiat') {
        csp = Default.postFiatContentSecurity(Env);
    } else {
        csp = Default.contentSecurity(Env);
    }
    headers['Content-Security-Policy'] = csp;
    headers["Cross-Origin-Resource-Policy"] = 'cross-origin';
    headers["Cross-Origin-Embedder-Policy"] = 'require-corp';
    cacheHeaders(Env, key, headers);

    // Don't set CSP headers on /api/ endpoints
    // because they aren't necessary and they cause problems
    // when duplicated by NGINX in production environments
    if (type === 'api') { delete headers['Content-Security-Policy']; }

    return Util.clone(headers);
};

var setHeaders = function (req, res) {
    var type;
    if (EXEMPT.some(regex => regex.test(req.url))) {
        type = 'office';
    } else if (/^\/(?:app|login|register)\/(?:[?#].*)?$/.test(req.url) ||
            /^\/app\/(?:index\.html|inner\.html)(?:[?#].*)?$/.test(req.url)) {
        type = 'postfiat';
    } else if (/^\/api\/(broadcast|config|postfiat\/)/.test(req.url)) {
        type = 'api';
    } else {
        type = 'standard';
    }

    var h = getHeaders(Env, type);

    // Allow main domain to load resources from the sandbox URL
    if (!Env.enableEmbedding && req.get('origin') === Env.httpUnsafeOrigin &&
        /^\/common\/onlyoffice\/dist\/.*\/fonts\/.*/.test(req.url)) {
        h['Access-Control-Allow-Origin'] = Env.httpUnsafeOrigin;
    }

    applyHeaderMap(res, h);
};

var getPostFiatApiCorsOrigin = function (req) {
    var origin = req.get('origin');
    if (Env.enableEmbedding) { return origin || '*'; }
    if (origin === Env.httpSafeOrigin || origin === Env.httpUnsafeOrigin ||
            origin === Env.permittedEmbedders) {
        return origin;
    }
    return Env.permittedEmbedders;
};

var setPostFiatApiCorsHeaders = function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', getPostFiatApiCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');
};

const Express = require("express");
Express.static.mime.define({'application/wasm': ['wasm']});
var app = Express();

var normalizePostFiatUrl = function (value) {
    if (!value || typeof(value) !== 'string') { return ''; }
    try {
        var parsed = new URL(value);
        if (!/^https?:$/.test(parsed.protocol)) { return ''; }
        return parsed.href;
    } catch (err) {
        return '';
    }
};

var normalizePostFiatWsUrl = function (value) {
    if (!value || typeof(value) !== 'string') { return ''; }
    try {
        var parsed = new URL(value);
        if (parsed.protocol === 'https:') {
            parsed.protocol = 'wss:';
        } else if (parsed.protocol === 'http:') {
            parsed.protocol = 'ws:';
        } else if (!/^wss?:$/.test(parsed.protocol)) {
            return '';
        }
        return parsed.href;
    } catch (err) {
        return '';
    }
};

var normalizePostFiatGateway = function (value) {
    var url = normalizePostFiatUrl(value);
    if (!url) { return ''; }
    return /\/$/.test(url) ? url : url + '/';
};

var getPostFiatRpcUrls = function () {
    var pftl = Env.postFiat && Env.postFiat.pftl || {};
    return [
        pftl.rpcUrl,
    ].map(normalizePostFiatUrl).filter(Boolean);
};

var getPostFiatArchiveWssUrls = function () {
    var pftl = Env.postFiat && Env.postFiat.pftl || {};
    return Array.from(new Set([
        pftl.archiveWssUrl,
        pftl.wssUrl,
    ].map(normalizePostFiatWsUrl).filter(Boolean)));
};

var getPostFiatIpfsGateways = function () {
    var pftl = Env.postFiat && Env.postFiat.pftl || {};
    var configured = normalizePostFiatGateway(pftl.ipfsGateway);
    return Array.from(new Set([
        configured,
    ].concat(POSTFIAT_DEFAULT_IPFS_GATEWAYS).map(normalizePostFiatGateway).filter(Boolean)));
};

var fetchPostFiatText = async function (url, options) {
    options = options || {};
    var controller = new AbortController();
    var timedOut = false;
    var timeout = Number(options.timeoutMs) > 0 ?
        Math.floor(Number(options.timeoutMs)) : POSTFIAT_PROXY_TIMEOUT_MS;
    var timer = setTimeout(function () {
        timedOut = true;
        controller.abort();
    }, timeout);
    try {
        var response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers,
            body: options.body,
            signal: controller.signal,
        });
        var reader = response.body && response.body.getReader && response.body.getReader();
        if (!reader) {
            var directText = await response.text();
            if (directText.length > POSTFIAT_PROXY_MAX_BYTES) {
                throw new Error('POSTFIAT_PROXY_RESPONSE_TOO_LARGE');
            }
            return { response: response, text: directText };
        }
        var decoder = new TextDecoder();
        var textParts = [];
        var total = 0;
        while (true) {
            var chunk = await reader.read();
            if (chunk.done) { break; }
            if (!chunk.value) { continue; }
            total += chunk.value.length;
            if (total > POSTFIAT_PROXY_MAX_BYTES) {
                try { reader.cancel(); } catch (err) {}
                throw new Error('POSTFIAT_PROXY_RESPONSE_TOO_LARGE');
            }
            textParts.push(decoder.decode(chunk.value, { stream: true }));
        }
        textParts.push(decoder.decode());
        return { response: response, text: textParts.join('') };
    } catch (err) {
        if (timedOut) {
            throw new Error((options.timeoutMessage || 'Upstream request timed out') +
                ' after ' + Math.round(timeout / 1000) + 's');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

var sendPostFiatJson = function (res, payload, status) {
    res.status(status || 200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.send(JSON.stringify(payload));
};

var normalizePostFiatCacheInteger = function (value, fallback, max) {
    var parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 0) { return fallback; }
    return Math.min(parsed, max);
};

var getPostFiatAccountTxCacheConfig = function () {
    var pftl = Env.postFiat && Env.postFiat.pftl || {};
    return {
        ttlMs: normalizePostFiatCacheInteger(
            pftl.accountTxCacheTtlMs,
            POSTFIAT_ACCOUNT_TX_CACHE_TTL_MS,
            5 * 60 * 1000
        ),
        staleMs: normalizePostFiatCacheInteger(
            pftl.accountTxCacheStaleMs,
            POSTFIAT_ACCOUNT_TX_CACHE_STALE_MS,
            60 * 60 * 1000
        ),
        maxEntries: normalizePostFiatCacheInteger(
            pftl.accountTxCacheMaxEntries,
            POSTFIAT_ACCOUNT_TX_CACHE_MAX_ENTRIES,
            10000
        ),
    };
};

var clearPostFiatAccountTxCache = function () {
    postFiatAccountTxCache.clear();
    postFiatAccountTxInflight.clear();
};

var getPostFiatAccountTxCacheKey = function (address, params) {
    return [
        address,
        params.ledger_index_min,
        params.ledger_index_max,
        params.binary ? '1' : '0',
        params.forward ? '1' : '0',
        params.limit,
        params.marker ? JSON.stringify(params.marker) : '',
    ].join('|');
};

var touchPostFiatAccountTxCacheEntry = function (key, entry) {
    postFiatAccountTxCache.delete(key);
    postFiatAccountTxCache.set(key, entry);
};

var prunePostFiatAccountTxCache = function (maxEntries) {
    while (postFiatAccountTxCache.size > maxEntries) {
        var key = postFiatAccountTxCache.keys().next().value;
        if (typeof(key) === 'undefined') { break; }
        postFiatAccountTxCache.delete(key);
    }
};

var writePostFiatAccountTxCache = function (key, address, payload, config) {
    if (!config.ttlMs || !config.maxEntries) { return; }
    var now = Date.now();
    postFiatAccountTxCache.set(key, {
        address: address,
        payload: payload,
        cachedAt: now,
        expiresAt: now + config.ttlMs,
        staleExpiresAt: now + Math.max(config.ttlMs, config.staleMs),
    });
    prunePostFiatAccountTxCache(config.maxEntries);
};

var readPostFiatAccountTxCache = function (key) {
    var entry = postFiatAccountTxCache.get(key);
    if (!entry) { return null; }
    touchPostFiatAccountTxCacheEntry(key, entry);
    return entry;
};

var makePostFiatHttpError = function (message, status, detail) {
    var err = new Error(message);
    err.status = status;
    err.detail = detail;
    return err;
};

var getPostFiatAccountTxCached = async function (address, params, fetcher) {
    var config = getPostFiatAccountTxCacheConfig();
    var key = getPostFiatAccountTxCacheKey(address, params);
    var now = Date.now();
    var entry = config.ttlMs && config.maxEntries ?
        readPostFiatAccountTxCache(key) : null;
    var promise;

    if (entry && entry.expiresAt > now) {
        return { payload: entry.payload, cacheStatus: 'hit' };
    }

    if (!config.ttlMs || !config.maxEntries) {
        return { payload: await fetcher(), cacheStatus: 'bypass' };
    }

    promise = postFiatAccountTxInflight.get(key);
    if (promise) {
        try {
            return { payload: await promise, cacheStatus: 'coalesced' };
        } catch (err) {
            if (entry && entry.staleExpiresAt > now) {
                return { payload: entry.payload, cacheStatus: 'stale' };
            }
            throw err;
        }
    }

    promise = fetcher().then(function (payload) {
        writePostFiatAccountTxCache(key, address, payload, config);
        return payload;
    }).finally(function () {
        postFiatAccountTxInflight.delete(key);
    });
    postFiatAccountTxInflight.set(key, promise);

    try {
        return {
            payload: await promise,
            cacheStatus: entry ? 'refresh' : 'miss',
        };
    } catch (err) {
        if (entry && entry.staleExpiresAt > now) {
            Env.Log.warn('POSTFIAT_PFTL_ACCOUNT_TX_STALE_CACHE_USED', {
                wallet: address,
                error: err.message || String(err),
            });
            return { payload: entry.payload, cacheStatus: 'stale' };
        }
        throw err;
    }
};

var requestPostFiatAccountTxWss = async function (wssUrl, accountTxParams) {
    var Client = Xrpl.Client;
    var client = new Client(wssUrl, {
        connectionTimeout: POSTFIAT_PROXY_TIMEOUT_MS,
    });
    var timer;
    try {
        await client.connect();
        var request = Object.assign({ command: 'account_tx' }, accountTxParams);
        var timeout = new Promise(function (resolve, reject) {
            timer = setTimeout(function () {
                reject(new Error('POSTFIAT_WSS_REQUEST_TIMEOUT'));
            }, POSTFIAT_PROXY_TIMEOUT_MS);
        });
        var response = await Promise.race([
            client.request(request),
            timeout,
        ]);
        return response && response.result ? response.result : response;
    } finally {
        clearTimeout(timer);
        if (client.isConnected()) {
            try {
                await client.disconnect();
            } catch (err) {
                Env.Log.warn('POSTFIAT_PFTL_WSS_DISCONNECT_FAILED', {
                    wss_url: wssUrl,
                    error: err.message || String(err),
                });
            }
        }
    }
};

var fetchPostFiatAccountTxPayload = async function (address, accountTxParams) {
    var rpcUrls = getPostFiatRpcUrls();
    var archiveWssUrls = getPostFiatArchiveWssUrls();
    if (!archiveWssUrls.length && !rpcUrls.length) {
        throw makePostFiatHttpError('PFTL RPC is not configured', 503);
    }

    var lastError;
    for (var j = 0; j < archiveWssUrls.length; j += 1) {
        var wssUrl = archiveWssUrls[j];
        try {
            var wssResult = await requestPostFiatAccountTxWss(wssUrl, accountTxParams);
            return {
                result: wssResult,
                wss_url: wssUrl,
            };
        } catch (err) {
            lastError = err.message || String(err);
            Env.Log.warn('POSTFIAT_PFTL_ACCOUNT_TX_WSS_FAILED', {
                wallet: address,
                wss_url: wssUrl,
                error: lastError,
            });
        }
    }

    var rpcPayload = {
        method: 'account_tx',
        params: [accountTxParams],
    };

    for (var i = 0; i < rpcUrls.length; i += 1) {
        var rpcUrl = rpcUrls[i];
        try {
            var result = await fetchPostFiatText(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rpcPayload),
                timeoutMs: POSTFIAT_PROXY_TIMEOUT_MS,
            });
            var body = result.text ? JSON.parse(result.text) : {};
            if (!result.response.ok || body.error || body.result && body.result.error) {
                lastError = body.error || body.result && body.result.error ||
                    ('HTTP_' + result.response.status);
                continue;
            }
            body.rpc_url = rpcUrl;
            return body;
        } catch (err) {
            lastError = err.message || String(err);
        }
    }
    Env.Log.warn('POSTFIAT_PFTL_ACCOUNT_TX_FAILED', {
        wallet: address,
        error: lastError,
    });
    throw makePostFiatHttpError('PFTL account_tx failed', 502, lastError);
};

var servePostFiatAccountTx = async function (req, res) {
    var address = String(req.params.address || '').trim();
    if (!POSTFIAT_ACCOUNT_RE.test(address)) {
        return void sendPostFiatJson(res, { error: 'Invalid wallet address' }, 400);
    }
    var parsedLimit = Number.parseInt(String(req.query.limit || '200'), 10);
    var limit = Number.isInteger(parsedLimit) ? Math.max(10, Math.min(parsedLimit, 400)) : 200;
    var marker = null;
    var cached;
    if (req.query.marker) {
        try {
            marker = JSON.parse(String(req.query.marker));
        } catch (err) {
            return void sendPostFiatJson(res, { error: 'Invalid marker' }, 400);
        }
    }
    var accountTxParams = {
        account: address,
        ledger_index_min: 0,
        ledger_index_max: -1,
        binary: false,
        forward: false,
        limit: limit,
    };
    if (marker) { accountTxParams.marker = marker; }

    try {
        cached = await getPostFiatAccountTxCached(address, accountTxParams, function () {
            return fetchPostFiatAccountTxPayload(address, accountTxParams);
        });
        res.setHeader('X-PostFiat-Cache', cached.cacheStatus);
        return void sendPostFiatJson(res, cached.payload, 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'PFTL account_tx failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var normalizePostFiatRpcProxyPayload = function (req) {
    var body = req.body || {};
    var method = String(body.method || '').trim();
    var params = Array.isArray(body.params) ? body.params : [body.params || {}];
    if (!POSTFIAT_RPC_PROXY_METHODS.has(method)) {
        throw new Error('Unsupported PFTL RPC method');
    }
    if (params.length > 1) {
        throw new Error('Too many PFTL RPC params');
    }
    return {
        method: method,
        params: params,
    };
};

var servePostFiatRpc = async function (req, res) {
    var payload;
    try {
        payload = normalizePostFiatRpcProxyPayload(req);
    } catch (err) {
        return void sendPostFiatJson(res, { error: err.message || 'Invalid PFTL RPC request' }, 400);
    }
    var rpcUrls = getPostFiatRpcUrls();
    if (!rpcUrls.length) {
        return void sendPostFiatJson(res, { error: 'PFTL RPC is not configured' }, 503);
    }
    var lastError;
    for (var i = 0; i < rpcUrls.length; i += 1) {
        var rpcUrl = rpcUrls[i];
        try {
            var result = await fetchPostFiatText(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeoutMs: POSTFIAT_PROXY_TIMEOUT_MS,
            });
            var parsed = result.text ? JSON.parse(result.text) : {};
            if (!result.response.ok || parsed.error || parsed.result && parsed.result.error) {
                lastError = parsed.error || parsed.result && parsed.result.error ||
                    ('HTTP_' + result.response.status);
                continue;
            }
            parsed.rpc_url = rpcUrl;
            return void sendPostFiatJson(res, parsed, 200);
        } catch (err) {
            lastError = err.message || String(err);
        }
    }
    Env.Log.warn('POSTFIAT_PFTL_RPC_FAILED', {
        method: payload.method,
        error: lastError,
    });
    sendPostFiatJson(res, { error: 'PFTL RPC failed', detail: lastError }, 502);
};

var servePostFiatIpfs = async function (req, res) {
    var cid = String(req.params.cid || '').trim();
    if (!POSTFIAT_CID_RE.test(cid)) {
        return void sendPostFiatJson(res, { error: 'Invalid IPFS CID' }, 400);
    }
    var gateways = getPostFiatIpfsGateways();
    var lastError;
    for (var i = 0; i < gateways.length; i += 1) {
        var gateway = gateways[i];
        var url = gateway.replace(/\/$/, '') + '/' + encodeURIComponent(cid);
        try {
            var result = await fetchPostFiatText(url, {
                method: 'GET',
                timeoutMs: POSTFIAT_PROXY_TIMEOUT_MS,
            });
            if (!result.response.ok) {
                lastError = 'HTTP_' + result.response.status;
                continue;
            }
            var body = result.text ? JSON.parse(result.text) : {};
            return void sendPostFiatJson(res, {
                gateway: gateway,
                cid: cid,
                payload: body,
            }, 200);
        } catch (err) {
            lastError = err.message || String(err);
        }
    }
    Env.Log.warn('POSTFIAT_IPFS_FETCH_FAILED', {
        cid: cid,
        error: lastError,
    });
    sendPostFiatJson(res, { error: 'IPFS fetch failed', detail: lastError }, 502);
};

var getRunPodAuthorization = function (req, required) {
    var auth = String(req.headers.authorization || '').trim();
    if (!auth && required) {
        throw makePostFiatHttpError('RunPod API key is required', 401);
    }
    if (auth && !/^Bearer\s+\S+/i.test(auth)) {
        throw makePostFiatHttpError('Invalid RunPod authorization header', 400);
    }
    return auth;
};

var getRunPodPodId = function (req) {
    var podId = String(req.params.podId || '').trim();
    if (!RUNPOD_POD_ID_RE.test(podId)) {
        throw makePostFiatHttpError('Invalid RunPod pod id', 400);
    }
    return podId;
};

var fetchRunPodJson = async function (path, options) {
    options = options || {};
    if (!/^\/[a-zA-Z0-9_./-]*$/u.test(path)) {
        throw makePostFiatHttpError('Invalid RunPod API path', 400);
    }
    var headers = Object.assign({
        Accept: 'application/json',
    }, options.headers || {});
    if (options.body) { headers['Content-Type'] = 'application/json'; }
    var result = await fetchPostFiatText(RUNPOD_REST_BASE_URL + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body,
        timeoutMs: options.timeoutMs || RUNPOD_PROXY_TIMEOUT_MS,
    });
    var body;
    try {
        body = result.text ? JSON.parse(result.text) : {};
    } catch (err) {
        throw makePostFiatHttpError('RunPod returned invalid JSON', 502);
    }
    if (!result.response.ok) {
        throw makePostFiatHttpError(
            body && (body.error || body.message) || ('RunPod returned HTTP ' + result.response.status),
            result.response.status,
            body
        );
    }
    return body;
};

var normalizeRunPodOpenAiBaseUrl = function (value) {
    var parsed;
    try {
        parsed = new URL(String(value || '').trim());
    } catch (err) {
        throw makePostFiatHttpError('Invalid RunPod OpenAI base URL', 400);
    }
    if (parsed.protocol !== 'https:' || !RUNPOD_PROXY_HOST_RE.test(parsed.hostname)) {
        throw makePostFiatHttpError('RunPod OpenAI base URL must be an https://*.proxy.runpod.net URL', 400);
    }
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
    if (!/\/v1$/u.test(parsed.pathname)) {
        parsed.pathname += '/v1';
    }
    return parsed.origin + parsed.pathname;
};

var normalizeRunPodOllamaBaseUrl = function (value) {
    return normalizeRunPodOpenAiBaseUrl(value).replace(/\/v1$/u, '');
};

var toRunPodOllamaOptions = function (payload) {
    var options = {};
    if (Number.isFinite(payload.temperature)) { options.temperature = payload.temperature; }
    if (Number.isFinite(payload.top_p)) { options.top_p = payload.top_p; }
    if (Number.isFinite(payload.max_tokens)) { options.num_predict = payload.max_tokens; }
    if (Array.isArray(payload.stop)) { options.stop = payload.stop; }
    return options;
};

var toRunPodOllamaMessages = function (payload) {
    return (Array.isArray(payload.messages) ? payload.messages : []).map(function (message) {
        return {
            role: String(message && message.role || 'user'),
            content: String(message && message.content || ''),
        };
    });
};

var toRunPodOllamaChatPayload = function (payload, body) {
    return {
        model: String(payload.model || body.model || '').trim(),
        messages: toRunPodOllamaMessages(payload),
        stream: payload.stream === true,
        think: body.ollamaThink === true,
        options: toRunPodOllamaOptions(payload),
    };
};

var writeRunPodSseData = function (res, data) {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
};

var writeRunPodOllamaEventAsOpenAiSse = function (res, event) {
    var message = event && event.message || {};
    var delta = {};
    var usage;
    if (typeof(message.content) === 'string' && message.content) {
        delta.content = message.content;
    }
    if (typeof(message.thinking) === 'string' && message.thinking) {
        delta.reasoning = message.thinking;
    }
    if (typeof(message.reasoning) === 'string' && message.reasoning) {
        delta.reasoning = message.reasoning;
    }
    if (event && event.done) {
        usage = {
            prompt_tokens: Number.isFinite(event.prompt_eval_count) ? event.prompt_eval_count : 0,
            completion_tokens: Number.isFinite(event.eval_count) ? event.eval_count : 0,
            total_tokens: (Number.isFinite(event.prompt_eval_count) ? event.prompt_eval_count : 0) +
                (Number.isFinite(event.eval_count) ? event.eval_count : 0),
        };
    }
    if (delta.content || delta.reasoning || usage) {
        writeRunPodSseData(res, {
            id: 'runpod-ollama',
            object: 'chat.completion.chunk',
            model: event && event.model || '',
            choices: [{ index: 0, delta: delta, finish_reason: event && event.done ? 'stop' : null }],
            usage: usage,
        });
    }
};

var streamRunPodOllamaChatCompletions = async function (req, res, body, payload) {
    var controller = new AbortController();
    var timedOut = false;
    var closed = false;
    var timer = setTimeout(function () {
        timedOut = true;
        controller.abort();
    }, RUNPOD_CHAT_TIMEOUT_MS);
    var onClientGone = function () {
        closed = true;
        controller.abort();
    };
    req.on('aborted', onClientGone);
    res.on('close', function () {
        if (!res.writableEnded) { onClientGone(); }
    });
    try {
        var upstream = await fetch(normalizeRunPodOllamaBaseUrl(body.baseUrl) + '/api/chat', {
            method: 'POST',
            headers: {
                Accept: 'application/x-ndjson',
                'Content-Type': 'application/json',
                'User-Agent': 'curl/8.5.0',
            },
            body: JSON.stringify(toRunPodOllamaChatPayload(payload, body)),
            signal: controller.signal,
        });
        if (!upstream.ok) {
            var text = await upstream.text();
            throw makePostFiatHttpError(text || ('RunPod Ollama returned HTTP ' + upstream.status),
                upstream.status, { error: text });
        }
        res.status(upstream.status);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (res.flushHeaders) { res.flushHeaders(); }

        var reader = upstream.body && upstream.body.getReader && upstream.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        if (!reader) {
            throw makePostFiatHttpError('RunPod Ollama stream response is unreadable', 502);
        }
        while (!closed) {
            var chunk = await reader.read();
            if (chunk.done) { break; }
            if (!chunk.value) { continue; }
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split(/\r?\n/u);
            buffer = lines.pop() || '';
            for (var i = 0; i < lines.length; i += 1) {
                var line = lines[i].trim();
                if (!line) { continue; }
                try {
                    writeRunPodOllamaEventAsOpenAiSse(res, JSON.parse(line));
                } catch (err) {
                    // Ignore malformed partial lines from the upstream NDJSON stream.
                }
            }
        }
        if (buffer.trim()) {
            try {
                writeRunPodOllamaEventAsOpenAiSse(res, JSON.parse(buffer.trim()));
            } catch (err) {}
        }
        if (!closed) {
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (err) {
        if (closed && !timedOut) { return; }
        var message = timedOut ?
            'RunPod Ollama chat stream timed out after ' +
                Math.round(RUNPOD_CHAT_TIMEOUT_MS / 1000) + 's' :
            (err.message || 'RunPod Ollama chat stream failed');
        if (res.headersSent) {
            res.write('event: error\n');
            res.write('data: ' + JSON.stringify({ error: message, detail: err.detail }) + '\n\n');
            res.end();
            return;
        }
        return void sendPostFiatJson(res, {
            error: message,
            detail: err.detail,
        }, err.status || 502);
    } finally {
        clearTimeout(timer);
        req.off('aborted', onClientGone);
    }
};

var fetchRunPodOllamaChatJson = async function (body, payload) {
    var result = await fetchPostFiatText(normalizeRunPodOllamaBaseUrl(body.baseUrl) + '/api/chat', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'curl/8.5.0',
        },
        body: JSON.stringify(toRunPodOllamaChatPayload(Object.assign({}, payload, {
            stream: false,
        }), body)),
        timeoutMs: RUNPOD_CHAT_TIMEOUT_MS,
        timeoutMessage: 'RunPod Ollama chat request timed out',
    });
    var event;
    try {
        event = result.text ? JSON.parse(result.text) : {};
    } catch (err) {
        throw makePostFiatHttpError('RunPod Ollama endpoint returned invalid JSON', 502);
    }
    if (!result.response.ok) {
        throw makePostFiatHttpError(
            event && (event.error || event.message) || ('RunPod Ollama returned HTTP ' + result.response.status),
            result.response.status,
            event
        );
    }
    return {
        id: 'runpod-ollama',
        object: 'chat.completion',
        model: event.model || payload.model || '',
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: event.message && event.message.content || '',
                reasoning: event.message && (event.message.thinking || event.message.reasoning) || '',
            },
            finish_reason: event.done_reason || 'stop',
        }],
        usage: {
            prompt_tokens: Number.isFinite(event.prompt_eval_count) ? event.prompt_eval_count : 0,
            completion_tokens: Number.isFinite(event.eval_count) ? event.eval_count : 0,
            total_tokens: (Number.isFinite(event.prompt_eval_count) ? event.prompt_eval_count : 0) +
                (Number.isFinite(event.eval_count) ? event.eval_count : 0),
        },
    };
};

var fetchRunPodOpenAiJson = async function (baseUrl, path, options) {
    options = options || {};
    if (!/^\/(?:models|chat\/completions)$/u.test(path)) {
        throw makePostFiatHttpError('Unsupported RunPod OpenAI path', 400);
    }
    var headers = Object.assign({
        Accept: 'application/json',
    }, options.headers || {});
    if (options.body) { headers['Content-Type'] = 'application/json'; }
    var result = await fetchPostFiatText(normalizeRunPodOpenAiBaseUrl(baseUrl) + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body,
        timeoutMs: options.timeoutMs ||
            (path === '/chat/completions' ? RUNPOD_CHAT_TIMEOUT_MS : RUNPOD_PROXY_TIMEOUT_MS),
        timeoutMessage: path === '/chat/completions' ?
            'RunPod OpenAI chat request timed out' : 'RunPod OpenAI request timed out',
    });
    var body;
    try {
        body = result.text ? JSON.parse(result.text) : {};
    } catch (err) {
        throw makePostFiatHttpError('RunPod OpenAI endpoint returned invalid JSON', 502);
    }
    if (!result.response.ok) {
        throw makePostFiatHttpError(
            body && (body.error || body.message) || ('RunPod returned HTTP ' + result.response.status),
            result.response.status,
            body
        );
    }
    return body;
};

var streamRunPodOpenAiChatCompletions = async function (req, res, body, payload) {
    var controller = new AbortController();
    var timedOut = false;
    var closed = false;
    var timer = setTimeout(function () {
        timedOut = true;
        controller.abort();
    }, RUNPOD_CHAT_TIMEOUT_MS);
    var onClientGone = function () {
        closed = true;
        controller.abort();
    };
    req.on('aborted', onClientGone);
    res.on('close', function () {
        if (!res.writableEnded) { onClientGone(); }
    });
    try {
        var headers = {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
        };
        if (req.headers.authorization) {
            headers.Authorization = req.headers.authorization;
        }
        var upstream = await fetch(normalizeRunPodOpenAiBaseUrl(body.baseUrl) + '/chat/completions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!upstream.ok) {
            var text = await upstream.text();
            var errorBody;
            try {
                errorBody = text ? JSON.parse(text) : {};
            } catch (err) {
                errorBody = { error: text || ('RunPod returned HTTP ' + upstream.status) };
            }
            throw makePostFiatHttpError(
                errorBody && (errorBody.error || errorBody.message) ||
                    ('RunPod returned HTTP ' + upstream.status),
                upstream.status,
                errorBody
            );
        }
        res.status(upstream.status);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (res.flushHeaders) { res.flushHeaders(); }

        var reader = upstream.body && upstream.body.getReader && upstream.body.getReader();
        if (!reader) {
            throw makePostFiatHttpError('RunPod stream response is unreadable', 502);
        }
        while (!closed) {
            var chunk = await reader.read();
            if (chunk.done) { break; }
            if (!chunk.value) { continue; }
            if (!res.write(Buffer.from(chunk.value))) {
                await new Promise(function (resolve) {
                    res.once('drain', resolve);
                });
            }
        }
        if (!closed) { res.end(); }
    } catch (err) {
        if (closed && !timedOut) { return; }
        var message = timedOut ?
            'RunPod OpenAI chat stream timed out after ' +
                Math.round(RUNPOD_CHAT_TIMEOUT_MS / 1000) + 's' :
            (err.message || 'RunPod chat stream failed');
        if (res.headersSent) {
            res.write('event: error\n');
            res.write('data: ' + JSON.stringify({ error: message, detail: err.detail }) + '\n\n');
            res.end();
            return;
        }
        return void sendPostFiatJson(res, {
            error: message,
            detail: err.detail,
        }, err.status || 502);
    } finally {
        clearTimeout(timer);
        req.off('aborted', onClientGone);
    }
};

var serveRunPodGpuTypes = async function (req, res) {
    var auth = '';
    var schema;
    var enumValues;
    try {
        auth = getRunPodAuthorization(req, false);
        schema = await fetchRunPodJson('/openapi.json', {
            headers: auth ? { Authorization: auth } : {},
            timeoutMs: RUNPOD_PROXY_TIMEOUT_MS,
        });
        enumValues = schema && schema.components && schema.components.schemas &&
            schema.components.schemas.PodCreateInput &&
            schema.components.schemas.PodCreateInput.properties &&
            schema.components.schemas.PodCreateInput.properties.gpuTypeIds &&
            schema.components.schemas.PodCreateInput.properties.gpuTypeIds.items &&
            schema.components.schemas.PodCreateInput.properties.gpuTypeIds.items.enum;
        return void sendPostFiatJson(res, {
            gpuTypeIds: Array.isArray(enumValues) ? enumValues : [],
        }, 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod GPU type lookup failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodOpenAiModels = async function (req, res) {
    try {
        return void sendPostFiatJson(res, await fetchRunPodOpenAiJson(req.query.baseUrl, '/models', {
            headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {},
        }), 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod model lookup failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodOpenAiChatCompletions = async function (req, res) {
    var body = req.body || {};
    var payload = body.payload;
    if (!payload || typeof(payload) !== 'object' || Array.isArray(payload)) {
        return void sendPostFiatJson(res, { error: 'RunPod chat payload is required' }, 400);
    }
    if (body.nativeOllama === true) {
        if (payload.stream === true) {
            return streamRunPodOllamaChatCompletions(req, res, body, payload);
        }
        try {
            return void sendPostFiatJson(res, await fetchRunPodOllamaChatJson(body, payload), 200);
        } catch (err) {
            return void sendPostFiatJson(res, {
                error: err.message || 'RunPod Ollama chat completion failed',
                detail: err.detail,
            }, err.status || 502);
        }
    }
    if (payload.stream === true) {
        return streamRunPodOpenAiChatCompletions(req, res, body, payload);
    }
    try {
        return void sendPostFiatJson(res, await fetchRunPodOpenAiJson(body.baseUrl, '/chat/completions', {
            method: 'POST',
            headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {},
            body: JSON.stringify(payload),
        }), 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod chat completion failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodListPods = async function (req, res) {
    var auth;
    try {
        auth = getRunPodAuthorization(req, true);
        return void sendPostFiatJson(res, await fetchRunPodJson('/pods', {
            headers: { Authorization: auth },
        }), 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod pod list failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodPod = async function (req, res) {
    var auth;
    var podId;
    try {
        auth = getRunPodAuthorization(req, true);
        podId = getRunPodPodId(req);
        return void sendPostFiatJson(res, await fetchRunPodJson('/pods/' + podId, {
            headers: { Authorization: auth },
        }), 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod pod lookup failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodCreatePod = async function (req, res) {
    var auth;
    try {
        auth = getRunPodAuthorization(req, true);
        return void sendPostFiatJson(res, await fetchRunPodJson('/pods', {
            method: 'POST',
            headers: { Authorization: auth },
            body: JSON.stringify(req.body || {}),
        }), 201);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod pod creation failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodStopPod = async function (req, res) {
    var auth;
    var podId;
    try {
        auth = getRunPodAuthorization(req, true);
        podId = getRunPodPodId(req);
        return void sendPostFiatJson(res, await fetchRunPodJson('/pods/' + podId + '/stop', {
            method: 'POST',
            headers: { Authorization: auth },
        }), 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod pod stop failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

var serveRunPodDeletePod = async function (req, res) {
    var auth;
    var podId;
    try {
        auth = getRunPodAuthorization(req, true);
        podId = getRunPodPodId(req);
        return void sendPostFiatJson(res, await fetchRunPodJson('/pods/' + podId, {
            method: 'DELETE',
            headers: { Authorization: auth },
        }), 200);
    } catch (err) {
        return void sendPostFiatJson(res, {
            error: err.message || 'RunPod pod delete failed',
            detail: err.detail,
        }, err.status || 502);
    }
};

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json({
  limit: '2mb'
}));
app.use(cookieParser());

(function () {
if (!Env.logFeedback) { return; }

const logFeedback = function (url) {
    url.replace(/\?(.*?)=/, function (all, fb) {
        Log.feedback(fb, '');
    });
};

app.head(/^\/common\/feedback\.html/, function (req, res, next) {
    logFeedback(req.url);
    next();
});
}());

const { createProxyMiddleware } = require("http-proxy-middleware");

var httpAddress = Env.httpAddress === '::' ? 'localhost' : Env.httpAddress;
var proxyTarget = new URL('', `ws:${httpAddress}`);
proxyTarget.port = Env.websocketPort;

const wsProxy = createProxyMiddleware({
    target: proxyTarget.href,
    ws: true,
    logLevel: 'error',
    onProxyReqWs: function (proxyReq, req) {
        proxyReq.setHeader('X-Real-Ip', req.socket.remoteAddress);
    },
    logProvider: (p) => {
        p.error = (data) => {
            if (/ECONNRESET/.test(data)) { return; }
            Env.Log.error('HTTP_PROXY_MIDDLEWARE', data);
        };
        return p;
    }
});

app.use('/cryptpad_websocket', wsProxy);

app.use('/ssoauth', (req, res, next) => {
    if (SSOUtils && req && req.body && req.body.SAMLResponse) {
        req.method = 'GET';

        let token = Util.uid();
        let smres = req.body.SAMLResponse;
        return SSOUtils.writeRequest(Env, {
            id: token,
            type: 'saml',
            content: smres
        }, (err) => {
            if (err) {
                Log.error('E_SSO_WRITE_REQ', err);
                return res.sendStatus(500);
            }
            let value = `samltoken="${token}"; SameSite=Strict; HttpOnly`;
            res.setHeader('Set-Cookie', value);
            next();
        });

    }
    next();
});

app.use('/blob', function (req, res, next) {
/*  Head requests are used to check the size of a blob.
    Clients can configure a maximum size to download automatically,
    and can manually click to download blobs which exceed that limit.  */
    const url = req.url;
    if (typeof(url) === "string" && Env.blobStore) {
        const s = url.split('/');
        if (s[1] && s[1].length === 2 && s[2] && s[2].length === Env.blobStore.BLOB_LENGTH) {
            Env.blobStore.updateActivity(s[2], () => {});
        }
    }
    if (req.method === 'HEAD') {
        Express.static(Path.resolve(Env.paths.blob), {
            setHeaders: function (res /*, path, stat */) {
                res.set('Access-Control-Allow-Origin', Env.enableEmbedding? '*': Env.permittedEmbedders);
                res.set('Access-Control-Allow-Headers', 'Content-Length');
                res.set('Access-Control-Expose-Headers', 'Content-Length');
            }
        })(req, res, next);
        return;
    }

/*  Some GET requests concern the whole file,
    others only target ranges, either:

    1. a two octet prefix which encodes the length of the metadata in octets
    2. the metadata itself, excluding the two preceding octets
*/

/*
    // Example code to demonstrate the types of requests which are handled
    if (req.method === 'GET') {
        if (!req.headers.range) {
            // metadata
        } else {
            // full request
        }
    }
*/

    next();
});

app.use(function (req, res, next) {
/*  These are pre-flight requests, through which the client
    confirms with the server that it is permitted to make the
    actual requests which will follow */
    if (req.method === 'OPTIONS' && /^\/api\/postfiat\//.test(req.url)) {
        setHeaders(req, res);
        setPostFiatApiCorsHeaders(req, res);
        res.setHeader('Content-Length', 0);
        res.statusCode = 204;
        return void res.end();
    }

    if (req.method === 'OPTIONS' && /\/blob\//.test(req.url)) {
        res.setHeader('Access-Control-Allow-Origin', Env.enableEmbedding? '*': Env.permittedEmbedders);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range,Access-Control-Allow-Origin');
        res.setHeader('Access-Control-Max-Age', 1728000);
        res.setHeader('Content-Type', 'application/octet-stream; charset=utf-8');
        res.setHeader('Content-Length', 0);
        res.statusCode = 204;
        return void res.end();
    }

    setHeaders(req, res);
    if (/^\/api\/postfiat\//.test(req.url)) {
        setPostFiatApiCorsHeaders(req, res);
    }
    if (/[\?\&]ver=[^\/]+$/.test(req.url)) { res.setHeader("Cache-Control", "max-age=31536000"); }
    else { res.setHeader("Cache-Control", "no-cache"); }
    next();
});

Object.keys(plugins || {}).forEach(name => {
    let plugin = plugins[name];
    if (!plugin.addHttpEndpoints) { return; }
    plugin.addHttpEndpoints(Env, app);
});


// serve custom app content from the customize directory
// useful for testing pages customized with opengraph data
app.use(Express.static(Path.resolve('./customize/www')));
app.use(gzipStatic(Path.resolve('./www')));

app.use("/common", Express.static('./src/common'));

var mainPages = Env.mainPages || Default.mainPages();
var mainPagePattern = new RegExp('^\/(' + mainPages.join('|') + ').html$');
app.get(mainPagePattern, Express.static('./customize'));
app.get(mainPagePattern, Express.static('./customize.dist'));

app.use("/blob", Express.static(Path.resolve(Env.paths.blob), {
    maxAge: Env.DEV_MODE? "0d": "365d"
}));
app.use("/datastore",
    (req, res, next) => {
        if (req.method === 'HEAD') {
            next();
        } else {
            res.status(403).end();
        }
    },
    Express.static(Env.paths.data, {
        maxAge: "0d"
    }
));

app.use('/block/', function (req, res, next) {
    var parsed = Path.parse(req.url);
    var name = parsed.name;
    // block access control only applies to files
    // identified by base64-encoded public keys
    // skip everything else, ie. /block/placeholder.txt
    if (/placeholder\.txt(\?.+)?/.test(parsed.base)) {
        return void next();
    }
    if (typeof(name) !== 'string' || name.length !== 44) {
        return void res.status(404).json({
            error: "INVALID_ID",
        });
    }

    var authorization = req.headers.authorization;

    var mfa_params, sso_params;
    nThen(function (w) {
        // First, check whether the block id in question has any MFA settings stored
        MFA.read(Env, name, w(function (err, content) {
            // ENOENT means there are no settings configured
            // it could be a 404 or an existing block without MFA protection
            // in either case you can abort and fall through
            // allowing the static webserver to handle either case
            if (err && err.code === 'ENOENT') {
                return;
            }

            // we're not expecting other errors. the sensible thing is to fail
            // closed - meaning assume some protection is in place but that
            // the settings couldn't be loaded for some reason. block access
            // to the resource, logging for the admin and responding to the client
            // with a vague error code
            if (err) {
                Log.error('GET_BLOCK_METADATA', err);
                return void res.status(500).json({
                    code: 500,
                    error: "UNEXPECTED_ERROR",
                });
            }

            // Otherwise, some settings were loaded correctly.
            // We're expecting stringified JSON, so try to parse it.
            // Log and respond with an error again if this fails.
            // If it parses successfully then fall through to the next block.
            try {
                mfa_params = JSON.parse(content);
            } catch (err2) {
                w.abort();
                Log.error("INVALID_BLOCK_METADATA", err2);
                return res.status(500).json({
                    code: 500,
                    error: "UNEXPECTED_ERROR",
                });
            }
        }));

        // Same for SSO settings
        if (!SSOUtils) { return; }
        SSOUtils.readBlock(Env, name, w(function (err, content) {
            if (err && (err.code === 'ENOENT' || err === 'ENOENT')) {
                return;
            }
            if (err) {
                Log.error('GET_BLOCK_METADATA', err);
                return void res.status(500).json({
                    code: 500,
                    error: "UNEXPECTED_ERROR",
                });
            }
            sso_params = content;
        }));
    }).nThen(function (w) {
        if (!mfa_params && !sso_params) {
            w.abort();
            next();
        }
    }).nThen(function (w) {
        // Block is protected with 2FA or SSO, make sure it still exists
        const url = req.url;
        if (typeof(url) !== "string") { return; }
        const s = url.split('/');
        const id = s[2];
        if (!(s[1]?.length === 2 && BlockStore.isValidKey(id))) { return; }
        BlockStore.isAvailable(Env, id, w((err, val) => {
            if (err) { return; }
            if (val !== false) { return; }
            // Block doesn't exist, send the placeholder
            w.abort();
            return BlockStore.readPlaceholder(Env, id, reason => {
                res.status(404).json({
                    reason,
                    code: 404
                });
            });
        }));
    }).nThen(function (w) {
        // We should only be able to reach this logic
        // if we successfully loaded and parsed some JSON
        // representing the user's MFA and/or SSO settings.

        // Failures at this point relate to insufficient or incorrect authorization.
        // This function standardizes how we reject such requests.

        // So far the only additional factor which is supported is TOTP.
        // We specify what the method is to allow for future alternatives
        // and inform the client so they can determine how to respond
        // "401" means "Unauthorized"
        var no = function () {
            w.abort();
            res.status(401).json({
                sso: Boolean(sso_params),
                method: mfa_params && mfa_params.method,
                code: 401
            });
        };

        // if you are here it is because this block is protected by MFA or SSO.
        // they will need to provide a JSON Web Token, so we can reject them outright
        // if one is not present in their authorization header
        if (!authorization) { return void no(); }

        // The authorization header should be of the form
        // "Authorization: Bearer <SessionId>"
        // We can reject the request if it is malformed.
        let token = authorization.replace(/^Bearer\s+/, '').trim();
        if (!token) { return void no(); }

        Sessions.read(Env, name, token, function (err, contentStr) {
            if (err) {
                Log.error('SESSION_READ_ERROR', err);
                return res.status(401).json({
                    sso: Boolean(sso_params),
                    method: mfa_params && mfa_params.method,
                    code: 401,
                });
            }

            let content = Util.tryParse(contentStr);

            if (mfa_params && !content.mfa) { return void no(); }
            if (sso_params && !content.sso) { return void no(); }

            if (content.mfa && content.mfa.exp && (+new Date()) > content.mfa.exp) {
                Log.error("OTP_SESSION_EXPIRED", content.mfa);
                Sessions.delete(Env, name, token, function (err) {
                    if (err) {
                        Log.error('SESSION_DELETE_EXPIRED_ERROR', err);
                        return;
                    }
                    Log.info('SESSION_DELETE_EXPIRED', err);
                });
                return void no();
            }


            if (content.sso && content.sso.exp && (+new Date()) > content.sso.exp) {
                Log.error("SSO_SESSION_EXPIRED", content.sso);
                Sessions.delete(Env, name, token, function (err) {
                    if (err) {
                        Log.error('SSO_SESSION_DELETE_EXPIRED_ERROR', err);
                        return;
                    }
                    Log.info('SSO_SESSION_DELETE_EXPIRED', err);
                });
                return void no();
            }

            // Interpret the existence of a file in that location as the continued
            // validity of the session. Fall through and let the built-in webserver
            // handle the 404 or serving the file.
            next();
        });
    });
});

// TODO this would be a good place to update a block's atime
// in a manner independent of the filesystem. ie. for detecting and archiving
// inactive accounts in a way that will not be invalidated by other forms of access
// like filesystem backups.
app.use("/block", Express.static(Path.resolve(Env.paths.block), {
    maxAge: "0d",
}));
// In case of a 404 for the block, check if a placeholder exists
// and provide the result if that's the case
app.use("/block", (req, res, next) => {
    const url = req.url;
    if (typeof(url) === "string") {
        const s = url.split('/');
        if (s[1] && s[1].length === 2 && BlockStore.isValidKey(s[2])) {
            return BlockStore.readPlaceholder(Env, s[2], (content) => {
                res.status(404).json({
                    reason: content,
                    code: 404
                });
            });
        }
    }
    next();
});

app.use("/customize", Express.static('customize'));
app.use("/customize", Express.static('customize.dist'));
app.use("/customize.dist", Express.static('customize.dist'));
app.use(/^\/[^\/]*$/, Express.static('customize'));
app.use(/^\/[^\/]*$/, Express.static('customize.dist'));

// if dev mode: never cache
var cacheString = function () {
    return (Env.FRESH_KEY? '-' + Env.FRESH_KEY: '') + (Env.DEV_MODE? '-' + (+new Date()): '');
};

var makeRouteCache = function (template, cacheName) {
    var cleanUp = {};

    return function (req, res) {
        var cache = Env[cacheName] = Env[cacheName] || {};
        var host = req.headers.host.replace(/\:[0-9]+/, '');
        res.setHeader('Content-Type', 'text/javascript');
        // don't cache anything if you're in dev mode
        if (Env.DEV_MODE) {
            return void res.send(template(host));
        }
        // generate a lookup key for the cache
        var cacheKey = host + ':' + cacheString();

        // FIXME mutable
        // we must be able to clear the cache when updating any mutable key
        // if there's nothing cached for that key...
        if (!cache[cacheKey]) {
            // generate the response and cache it in memory
            cache[cacheKey] = template(host);
            // and create a function to conditionally evict cache entries
            // which have not been accessed in the last 20 seconds
            cleanUp[cacheKey] = Util.throttle(function () {
                delete cleanUp[cacheKey];
                delete cache[cacheKey];
            }, 20000);
        }

        // successive calls to this function
        if (typeof (cleanUp[cacheKey]) === "function") {
            cleanUp[cacheKey]();
        }
        return void res.send(cache[cacheKey]);
    };
};

var serveConfig = makeRouteCache(function () {
    // NOTE: we may extract JSON from this config using slice(27, -5)
    const ssoList = Env.sso && Env.sso.enabled && Array.isArray(Env.sso.list) &&
                    Env.sso.list.map(function (obj) { return obj.name; }) || [];
    const ssoCfg = (SSOUtils && ssoList.length) ? {
        force: (Env.sso && Env.sso.enforced && 1) || 0,
        password: (Env.sso && Env.sso.cpPassword && (Env.sso.forceCpPassword ? 2 : 1)) || 0,
        list: ssoList
    } : false;

    return [
        'define(function(){',
        'return ' + JSON.stringify({
            requireConf: {
                waitSeconds: 600,
                urlArgs: 'ver=' + Env.version + cacheString(),
            },
            removeDonateButton: (Env.removeDonateButton === true),
            accounts_api: Env.accounts_api,
            websocketPath: Env.websocketPath,
            httpUnsafeOrigin: Env.httpUnsafeOrigin,
            adminEmail: Env.adminEmail,
            adminKeys: Env.admins,
            moderatorKeys: Env.moderators,
            inactiveTime: Env.inactiveTime,
            supportMailbox: Env.supportMailbox,
            supportMailboxKey: Env.supportMailboxKey,
            defaultStorageLimit: Env.defaultStorageLimit,
            maxUploadSize: Env.maxUploadSize,
            premiumUploadSize: Env.premiumUploadSize,
            restrictRegistration: Env.restrictRegistration,
            appsToDisable: Env.appsToDisable,
            restrictSsoRegistration: Env.restrictSsoRegistration,
            httpSafeOrigin: Env.httpSafeOrigin,
            enableEmbedding: Env.enableEmbedding,
            fileHost: Env.fileHost,
            shouldUpdateNode: Env.shouldUpdateNode || undefined,
            listMyInstance: Env.listMyInstance,
            sso: ssoCfg,
            enforceMFA: Env.enforceMFA,
            postFiat: Env.postFiat,
            onlyOffice: Env.onlyOffice
        }, null, '\t'),
        '});'
    ].join(';\n');
}, 'configCache');

var serveBroadcast = makeRouteCache(function () {
    var maintenance = Env.maintenance;
    if (maintenance && maintenance.end && maintenance.end < (+new Date())) {
        maintenance = undefined;
    }
    return [
        'define(function(){',
        'return ' + JSON.stringify({
            curvePublic: Env.curvePublic,
            lastBroadcastHash: Env.lastBroadcastHash,
            surveyURL: Env.surveyURL,
            maintenance: maintenance
        }, null, '\t'),
        '});'
    ].join(';\n');
}, 'broadcastCache');

app.get('/api/config', serveConfig);
app.get('/api/broadcast', serveBroadcast);
app.get('/api/postfiat/pftl/account-tx/:address', function (req, res) {
    servePostFiatAccountTx(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_PFTL_ACCOUNT_TX_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'PFTL account_tx failed' }, 500);
    });
});
app.post('/api/postfiat/pftl/rpc', function (req, res) {
    servePostFiatRpc(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_PFTL_RPC_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'PFTL RPC failed' }, 500);
    });
});
app.get('/api/postfiat/ipfs/:cid', function (req, res) {
    servePostFiatIpfs(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_IPFS_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'IPFS fetch failed' }, 500);
    });
});
app.get('/api/postfiat/runpod/gpu-types', function (req, res) {
    serveRunPodGpuTypes(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_GPU_TYPES_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod GPU type lookup failed' }, 500);
    });
});
app.get('/api/postfiat/runpod/openai/models', function (req, res) {
    serveRunPodOpenAiModels(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_OPENAI_MODELS_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod model lookup failed' }, 500);
    });
});
app.post('/api/postfiat/runpod/openai/chat/completions', function (req, res) {
    serveRunPodOpenAiChatCompletions(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_OPENAI_CHAT_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod chat completion failed' }, 500);
    });
});
app.get('/api/postfiat/runpod/pods', function (req, res) {
    serveRunPodListPods(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_LIST_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod pod list failed' }, 500);
    });
});
app.get('/api/postfiat/runpod/pods/:podId', function (req, res) {
    serveRunPodPod(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_POD_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod pod lookup failed' }, 500);
    });
});
app.post('/api/postfiat/runpod/pods', function (req, res) {
    serveRunPodCreatePod(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_CREATE_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod pod creation failed' }, 500);
    });
});
app.post('/api/postfiat/runpod/pods/:podId/stop', function (req, res) {
    serveRunPodStopPod(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_STOP_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod pod stop failed' }, 500);
    });
});
app.delete('/api/postfiat/runpod/pods/:podId', function (req, res) {
    serveRunPodDeletePod(req, res).catch(function (err) {
        Env.Log.error('POSTFIAT_RUNPOD_DELETE_UNHANDLED', { error: err.message });
        sendPostFiatJson(res, { error: 'RunPod pod delete failed' }, 500);
    });
});

(function () {
let extensions = plugins._extensions;
let styles = plugins._styles;
let str = JSON.stringify(extensions);
let str2 = JSON.stringify(styles);
let js = `let extensions = ${str};
let styles = ${str2};
let lang = window.cryptpadLanguage;
let paths = [];
extensions.forEach(name => {
    paths.push(\`optional!/\${name}/extensions.js\`);
    paths.push(\`optional!json!/\${name}/translations/messages.json\`);
    const l = lang === "en" ? '' : \`\${lang}.\`;
    paths.push(\`optional!json!/\${name}/translations/messages.\${l}json\`);
});
styles.forEach(name => {
    paths.push(\`optional!less!/\${name}/style.less\`);
});
define(paths, function () {
    let args = Array.prototype.slice.apply(arguments);
    return args;
}, function () {
    // ignore missing files
});`;
app.get('/extensions.js', (req, res) => {
    res.setHeader('Content-Type', 'text/javascript');
    res.send(js);
});
})();

var Define = function (obj) {
    return `define(function (){
    return ${JSON.stringify(obj, null, '\t')};
});`;
};

app.get('/api/instance', function (req, res) {
    res.setHeader('Content-Type', 'text/javascript');
    res.send(Define({
        color: Env.accentColor,
        name: Env.instanceName,
        description: Env.instanceDescription,
        location: Env.instanceJurisdiction,
        notice: Env.instanceNotice,
    }));
});

var four04_path = Path.resolve('./customize.dist/404.html');
var fivehundred_path = Path.resolve('./customize.dist/500.html');
var custom_four04_path = Path.resolve('./customize/404.html');
var custom_fivehundred_path = Path.resolve('./customize/500.html');

var send404 = function (res, path) {
    if (!path && path !== four04_path) { path = four04_path; }
    Fs.exists(path, function (exists) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (exists) { return Fs.createReadStream(path).pipe(res); }
        send404(res);
    });
};
var send500 = function (res, path) {
    if (!path && path !== fivehundred_path) { path = fivehundred_path; }
    Fs.exists(path, function (exists) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (exists) { return Fs.createReadStream(path).pipe(res); }
        send500(res);
    });
};

app.get('/api/updatequota', function (req, res) {
    if (!Env.accounts_api) {
        res.status(404);
        return void send404(res);
    }
    sendMessage({
        command: 'UPDATE_QUOTA',
    }, (err) => {
        if (err) {
            res.status(500);
            return void send500(res);
        }
        res.send();
    });
});

app.get('/api/profiling', function (req, res) {
    if (!Env.enableProfiling) { return void send404(res); }
    sendMessage({
        command: 'GET_PROFILING_DATA',
    }, (err, value) => {
        if (err) {
            res.status(500);
            return void send500(res);
        }
        res.setHeader('Content-Type', 'text/javascript');
        res.send(JSON.stringify({
            bytesWritten: value,
        }));
    });
});

app.get('/api/logo', function (req, res) {
    let path = Path.resolve('./customize/CryptPad_logo_hero.svg');
    let base = Path.resolve('./customize.dist/CryptPad_logo_hero.svg');
    Fs.exists(path, function (exists) {
        res.setHeader('Content-Disposition', 'inline');
        if (exists) {
            let mime = Env.logoMimeType || 'image/svg+xml';
            res.setHeader('Content-Type', mime);
            return res.sendFile(path);
        }
        res.sendFile(base);
    });
});

app.use('/upload-blob', Express.json({limit:"500kb"}), (req, res) => {
    if (req.method !== "POST") {
        return res.status(403).send();
    }
    const { chunk, sig, edPublic } = req.body;
    if (!cpcrypto) {
        return void res.status(500).send({error: 'NOCRYPTO'});
    }

    const forbidden = reason => {
        return void res.status(403).send({error: reason});
    };

    try {
        // Check signature
        const sigu8 = Util.decodeBase64(sig);
        const vkey = Util.decodeBase64(edPublic);
        const ok = cpcrypto.open(sigu8, vkey);
        if (!ok) { return forbidden('INVALID_KEY'); }
        const cookie = Util.encodeUTF8(sigu8.subarray(64));
        // Check cookie
        const safeKey = Util.escapeKeyCharacters(edPublic);
        Env.blobStore.checkUploadCookie(safeKey, value => {
            if (value !== cookie) {
                return forbidden('INVALID_COOKIE');
            }
            // Upload chunk
            Env.blobStore.upload(safeKey, chunk, (err) => {
                if (err) {
                    return res.status(500).send({error: err});
                }
                // Get new cookie
                Env.blobStore.uploadCookie(safeKey, (err, _c) => {
                    if (err) {
                        return res.status(500).send({error: err});
                    }
                    res.status(200).send({
                        cookie: _c
                    });
                });
            });
        });

    } catch (e) {
        return void res.status(500).send({error: e.message});
    }
});

// This endpoint handles authenticated RPCs over HTTP
// via an interactive challenge-response protocol
app.use(Express.json());
app.post('/api/auth', function (req, res, next) {
    AuthCommands.handle(Env, req, res, next);
});


app.use(function (req, res /*, next */) {
    if (/^(\/favicon\.ico\/|.*\.js\.map|.*\/translations\/.*\.json)/.test(req.url)) {
        // ignore common 404s
    } else {
        Log.info('HTTP_404', req.url);
    }

    res.status(404);
    send404(res, custom_four04_path);
});

// default message for thrown errors in ExpressJS routes
app.use(function (err, req, res /*, next*/) {
    Log.error('EXPRESSJS_ROUTING', {
        error: err.stack || err,
    });
    res.status(500);
    send500(res, custom_fivehundred_path);
});

var server = Http.createServer(app);

nThen(function (w) {
    server.listen(Env.httpPort, Env.httpAddress, w());
    if (Env.httpSafePort) {
        let safeServer = Http.createServer(app);
        safeServer.listen(Env.httpSafePort, Env.httpAddress, w());
    }
    server.on('upgrade', function (req, socket, head) {
        // TODO warn admins that websockets should only be proxied in this way in a dev environment
        // in production it's more efficient to have your reverse proxy (NGINX) directly forward
        // websocket traffic to the correct port (Env.websocketPort)
        wsProxy.upgrade(req, socket, head);
    });

    var config = require("./load-config");
    BlobStore.create({
        blobPath: config.blobPath,
        blobStagingPath: config.blobStagingPath,
        archivePath: config.archivePath,
        getSession: function () {},
    }, w(function (err, blob) {
        if (err) { return; }
        Env.blobStore = blobStore = blob;
    }));
    CPCrypto.init(w(function (err, crypto) {
        cpcrypto = crypto;
    }));
}).nThen(function () {
    // TODO inform the parent process that this worker is ready
    Object.keys(Env.plugins || {}).forEach(name => {
        let plugin = plugins[name];
        if (!plugin.initialize) { return; }
        try { plugin.initialize(Env, "http-worker"); }
        catch (e) {}
    });
});

process.on('uncaughtException', function (err) {
    console.error('[%s] UNCAUGHT EXCEPTION IN HTTP WORKER', new Date());
    console.error(err);
    console.error("TERMINATING");
    process.exit(1);
});
