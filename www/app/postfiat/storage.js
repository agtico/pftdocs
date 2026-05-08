// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var parseStoredJson = function (raw) {
        if (!raw) { return null; }
        if (typeof(raw) === 'object') { return raw; }
        if (typeof(raw) !== 'string') { return null; }
        try {
            return JSON.parse(raw);
        } catch (err) {
            console.error(err);
            return null;
        }
    };

    var createJsonStore = function (options) {
        options = options || {};
        var getStorage = options.getStorage || function () {
            try {
                return window.localStorage || null;
            } catch (err) {
                return null;
            }
        };
        var getBridgeStore = options.getBridgeStore || function () {
            return window.cryptpadStore || null;
        };

        var writeJson = function (key, value) {
            var bridge = getBridgeStore();
            var storage = getStorage();
            var raw = JSON.stringify(value || {});
            var ok = false;
            if (bridge && typeof(bridge.put) === 'function') {
                try {
                    bridge.put(key, raw);
                    ok = true;
                } catch (err) {
                    console.error(err);
                }
            }
            if (storage) {
                try {
                    storage.setItem(key, raw);
                    ok = true;
                } catch (err) {
                    console.error(err);
                }
            }
            return ok;
        };

        var readJson = function (key) {
            var bridge = getBridgeStore();
            var storage = getStorage();
            var parsed = null;
            var raw;
            if (bridge && bridge.store && typeof(bridge.store[key]) !== 'undefined') {
                parsed = parseStoredJson(bridge.store[key]);
                if (parsed && Object.keys(parsed).length) { return parsed; }
            }
            if (storage) {
                try {
                    raw = storage.getItem(key);
                    parsed = parseStoredJson(raw);
                    if (parsed) {
                        writeJson(key, parsed);
                        return parsed;
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            return {};
        };

        return {
            readJson: readJson,
            writeJson: writeJson
        };
    };

    return {
        createJsonStore: createJsonStore,
        parseStoredJson: parseStoredJson
    };
});
