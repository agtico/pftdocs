// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var getPrimaryStorage = function (root) {
        try {
            return root.localStorage || root.sessionStorage || null;
        } catch (err) {
            return null;
        }
    };

    var getStorages = function (root) {
        var stores = [];
        var add = function (storage) {
            if (!storage || stores.indexOf(storage) !== -1) { return; }
            stores.push(storage);
        };
        try { add(root.localStorage); } catch (err) {}
        try { add(root.sessionStorage); } catch (err) {}
        return stores;
    };

    var getCacheKey = function (prefix, walletAddress) {
        return String(prefix || '') + String(walletAddress || '');
    };

    var historyHasReadableContent = function (data, displayText) {
        var events = data && Array.isArray(data.taskEvents) ? data.taskEvents : [];
        if ((data && data.latestContext && data.latestContext.text) || !events.length) {
            return true;
        }
        return events.some(function (event) {
            return Boolean(event && event.decrypted && displayText(event));
        });
    };

    var cacheIsReusable = function (data, displayText) {
        var taskCount = Number(data && data.taskEventCount) || 0;
        var contextCount = Number(data && data.contextUpdateCount) || 0;
        if (!data) { return false; }
        if (!taskCount && !contextCount) { return false; }
        return historyHasReadableContent(data, displayText);
    };

    var readCache = function (walletAddress, opts) {
        var storages = opts && opts.storages || [];
        var prefixes = opts && opts.prefixes || [];
        var now = Number(opts && opts.now) || Date.now();
        var version = opts && opts.version;
        var displayText = opts && opts.displayText || function () { return ''; };
        var raw;
        var record;
        var key;
        var storage;
        if (!walletAddress) { return null; }
        for (var s = 0; s < storages.length; s++) {
            storage = storages[s];
            for (var p = 0; p < prefixes.length; p++) {
                key = prefixes[p] + walletAddress;
                try {
                    raw = storage.getItem(key);
                    if (!raw) { continue; }
                    record = JSON.parse(raw);
                    if (!record || record.version !== version ||
                            record.walletAddress !== walletAddress || !record.data ||
                            record.expiresAt < now ||
                            !cacheIsReusable(record.data, displayText)) {
                        storage.removeItem(key);
                        continue;
                    }
                    return record;
                } catch (err) {
                    try {
                        storage.removeItem(key);
                    } catch (removeErr) {}
                }
            }
        }
        return null;
    };

    var writeCache = function (walletAddress, data, opts) {
        var storage = opts && opts.storage;
        var now = Number(opts && opts.now) || Date.now();
        var ttlMs = Number(opts && opts.ttlMs) || 0;
        var displayText = opts && opts.displayText || function () { return ''; };
        if (!storage || !walletAddress || !data) { return false; }
        if (!cacheIsReusable(data, displayText)) { return false; }
        storage.setItem(getCacheKey(opts && opts.prefix, walletAddress), JSON.stringify({
            version: opts && opts.version,
            walletAddress: walletAddress,
            cachedAt: now,
            expiresAt: now + ttlMs,
            data: data
        }));
        return true;
    };

    var clearCache = function (walletAddress, opts) {
        var storages = opts && opts.storages || [];
        var prefixes = opts && opts.prefixes || [];
        var i;
        var key;
        storages.forEach(function (storage) {
            if (walletAddress) {
                prefixes.forEach(function (prefix) {
                    storage.removeItem(prefix + walletAddress);
                });
                return;
            }
            for (i = storage.length - 1; i >= 0; i--) {
                key = storage.key(i);
                if (key && prefixes.some(function (prefix) {
                    return key.indexOf(prefix) === 0;
                })) {
                    storage.removeItem(key);
                }
            }
        });
    };

    return {
        cacheIsReusable: cacheIsReusable,
        clearCache: clearCache,
        getCacheKey: getCacheKey,
        getPrimaryStorage: getPrimaryStorage,
        getStorages: getStorages,
        historyHasReadableContent: historyHasReadableContent,
        readCache: readCache,
        writeCache: writeCache
    };
});
