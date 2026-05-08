// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([
    '/common/common-constants.js',
    '/common/common-hash.js',
    '/common/cache-store.js',
    '/components/localforage/dist/localforage.min.js',
    '/customize/application_config.js',
    '/common/common-util.js',
], function (Constants, Hash, Cache, localForage, AppConfig, Util) {
    var LocalStore = {};
    var pftWalletSessionKey = 'PFT_wallet_session';
    var pftSessionWalletStorageKey = 'PFT_session_wallet';
    var pftLastWalletAddressKey = 'PFT_last_wallet_address';
    var pftWalletAddressPattern = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
    var walletSessionResponder;
    var postFiatPreservedLocalKeys = [
        'PFT_wallet_vault',
        pftLastWalletAddressKey,
        'PFT_ai_provider_keys_v1',
        'PFT_ai_provider_settings_v1',
        'PFT_runpod_api_key_v1',
        'PFT_runpod_settings_v1',
        'PFT_ai_chat_sessions_v1',
        'PFT_ai_chat_options_v1',
        'PFT_tasknode_ipfs_json_v1:index',
    ];
    var postFiatWalletSwitchPreservedLocalKeys = [
        'PFT_wallet_vault',
        pftLastWalletAddressKey,
        'PFT_ai_provider_keys_v1',
        'PFT_ai_provider_settings_v1',
        'PFT_runpod_api_key_v1',
        'PFT_runpod_settings_v1',
    ];
    var postFiatPreservedLocalPrefixes = [
        'PFT_tasknode_ipfs_json_v1:',
    ];

    var safeSet = function (key, val) {
        try {
            localStorage.setItem(key, val);
        } catch (err) {
            console.error(err);
        }
    };
    var safeSessionSet = function (key, val) {
        try {
            sessionStorage.setItem(key, val);
        } catch (err) {
            console.error(err);
        }
    };
    var removeLocalLogin = function () {
        [
            Constants.userNameKey,
            Constants.userHashKey,
            Constants.blockHashKey,
            Constants.sessionJWT,
            Constants.ssoSeed,
            Constants.tokenKey,
        ].forEach(function (k) {
            localStorage.removeItem(k);
            delete localStorage[k];
        });
    };
    var walletLoginSessionKeys = [
        pftWalletSessionKey,
        Constants.userNameKey,
        Constants.userHashKey,
        Constants.blockHashKey,
        Constants.sessionJWT,
        Constants.ssoSeed,
        Constants.tokenKey,
    ];
    var removeWalletSessionKeys = function (keys) {
        keys.forEach(function (k) {
            sessionStorage.removeItem(k);
            delete sessionStorage[k];
        });
    };
    var removeWalletLoginSession = function () {
        removeWalletSessionKeys(walletLoginSessionKeys);
    };
    var removeWalletSession = function () {
        removeWalletSessionKeys([
            pftSessionWalletStorageKey,
        ].concat(walletLoginSessionKeys));
    };
    var shouldPreservePostFiatLocalKey = function (key) {
        if (postFiatPreservedLocalKeys.indexOf(key) !== -1) { return true; }
        return postFiatPreservedLocalPrefixes.some(function (prefix) {
            return key.indexOf(prefix) === 0;
        });
    };
    var shouldPreservePostFiatWalletSwitchLocalKey = function (key) {
        return postFiatWalletSwitchPreservedLocalKeys.indexOf(key) !== -1;
    };
    var removeMismatchedSessionWallet = function (name) {
        var raw = sessionStorage[pftSessionWalletStorageKey];
        var record;

        if (!raw) { return; }
        try {
            record = JSON.parse(raw);
        } catch (err) {
            console.error(err);
        }
        if (record && record.address === name) { return; }
        removeWalletSessionKeys([pftSessionWalletStorageKey]);
    };
    var isWalletAddress = function (name) {
        return typeof(name) === 'string' && pftWalletAddressPattern.test(name);
    };
    var isPostFiatWalletScopedLocalKey = function (key) {
        if (shouldPreservePostFiatWalletSwitchLocalKey(key)) {
            return false;
        }
        return /^PFT_/.test(String(key || ''));
    };
    var hasPostFiatWalletScopedLocalState = function () {
        try {
            return Object.keys(localStorage || {}).some(isPostFiatWalletScopedLocalKey);
        } catch (err) {
            console.error(err);
            return false;
        }
    };
    var removePostFiatWalletScopedLocalState = function () {
        try {
            Object.keys(localStorage || {}).forEach(function (key) {
                if (!isPostFiatWalletScopedLocalKey(key)) { return; }
                localStorage.removeItem(key);
                delete localStorage[key];
            });
        } catch (err) {
            console.error(err);
        }
    };
    var clearPostFiatWalletSwitchStores = function (cb) {
        cb = Util.once(cb || function () {});
        removePostFiatWalletScopedLocalState();
        try {
            localForage.clear(function () {
                try {
                    Cache.clear(cb);
                } catch (err) {
                    console.error(err);
                    cb();
                }
            });
        } catch (err) {
            console.error(err);
            try {
                Cache.clear(cb);
            } catch (cacheErr) {
                console.error(cacheErr);
                cb();
            }
        }
    };
    var shouldClearPostFiatWalletSwitchStores = function (nextName) {
        var currentName = LocalStore.getAccountName && LocalStore.getAccountName();
        var lastName = localStorage[pftLastWalletAddressKey];
        if (isWalletAddress(currentName) && currentName !== nextName) { return true; }
        if (isWalletAddress(lastName) && lastName !== nextName) { return true; }
        return !isWalletAddress(lastName) && hasPostFiatWalletScopedLocalState();
    };
    var hasWalletSession = function () {
        return sessionStorage[pftWalletSessionKey] === '1';
    };
    var hasPersistentWalletLogin = function () {
        return !hasWalletSession() &&
            isWalletAddress(localStorage[Constants.userNameKey]) &&
            typeof(localStorage[Constants.blockHashKey]) === 'string';
    };
    var stopWalletSessionResponder = function () {
        if (!walletSessionResponder) { return; }
        try {
            walletSessionResponder.close();
        } catch (err) {
            console.error(err);
        }
        walletSessionResponder = undefined;
    };
    var startWalletSessionResponder = function () {
        stopWalletSessionResponder();
        return false;
    };

    LocalStore.setThumbnail = function (key, value, cb) {
        localForage.setItem(key, value, cb);
    };
    LocalStore.getThumbnail = function (key, cb) {
        localForage.getItem(key, cb);
    };
    LocalStore.clearThumbnail = function (cb) {
        cb = cb || function () {};
        localForage.clear(cb);
    };

    LocalStore.setFSHash = function (hash) {
        var sHash = Hash.serializeHash(hash);
        safeSet(Constants.fileHashKey, sHash);
    };
    LocalStore.getFSHash = function () {
        var hash = localStorage[Constants.fileHashKey];

        if (['undefined', 'undefined/'].indexOf(hash) !== -1) {
            localStorage.removeItem(Constants.fileHashKey);
            return;
        }

        if (hash) {
            var sHash = Hash.serializeHash(hash);
            if (sHash !== hash) { safeSet(Constants.fileHashKey, sHash); }
        }

        return hash;
    };

    LocalStore.getUserHash = function () {
        var store = hasWalletSession() ? sessionStorage : localStorage;
        var hash = store[Constants.userHashKey];

        if (['undefined', 'undefined/'].indexOf(hash) !== -1) {
            store.removeItem(Constants.userHashKey);
            return;
        }

        if (hash) {
            var sHash = Hash.serializeHash(hash);
            if (sHash !== hash) {
                if (hasWalletSession()) {
                    safeSessionSet(Constants.userHashKey, sHash);
                } else {
                    safeSet(Constants.userHashKey, sHash);
                }
            }
        }

        return hash;
    };

    LocalStore.setUserHash = function (hash) {
        var sHash = Hash.serializeHash(hash);
        if (hasWalletSession()) { return void safeSessionSet(Constants.userHashKey, sHash); }
        safeSet(Constants.userHashKey, sHash);
    };

    LocalStore.getBlockHash = function () {
        if (hasWalletSession()) { return sessionStorage[Constants.blockHashKey]; }
        if (hasPersistentWalletLogin()) { return; }
        return localStorage[Constants.blockHashKey];
    };

    LocalStore.setBlockHash = function (hash) {
        if (hasWalletSession()) { return void safeSessionSet(Constants.blockHashKey, hash); }
        safeSet(Constants.blockHashKey, hash);
    };

    LocalStore.getSessionToken = function () {
        if (hasWalletSession()) { return sessionStorage[Constants.sessionJWT]; }
        return localStorage[Constants.sessionJWT];
    };

    LocalStore.setSessionToken = function (token) {
        if (hasWalletSession()) { return void safeSessionSet(Constants.sessionJWT, token); }
        safeSet(Constants.sessionJWT, token);
    };

    LocalStore.getSSOSeed = function () {
        if (hasWalletSession()) { return sessionStorage[Constants.ssoSeed]; }
        return localStorage[Constants.ssoSeed];
    };
    LocalStore.setSSOSeed = function (seed) {
        if (hasWalletSession()) { return void safeSessionSet(Constants.ssoSeed, seed); }
        safeSet(Constants.ssoSeed, seed);
    };

    LocalStore.getAccountName = function () {
        if (hasWalletSession()) { return sessionStorage[Constants.userNameKey]; }
        if (hasPersistentWalletLogin()) { return; }
        return localStorage[Constants.userNameKey];
    };

    LocalStore.isWalletSession = function () {
        return hasWalletSession();
    };
    LocalStore.exportWalletSession = function () {
        return;
    };
    LocalStore.importWalletSession = function () {
        return false;
    };
    LocalStore.requestWalletSession = function (cb) {
        cb = Util.once(cb || function () {});
        if (hasWalletSession()) { return void cb(true); }
        cb(false);
    };

    LocalStore.isLoggedIn = function () {
        return window.CP_logged_in || typeof LocalStore.getBlockHash() === "string";
    };

    LocalStore.getDriveRedirectPreference = function () {
        try {
            return JSON.parse(localStorage[Constants.redirectToDriveKey]);
        } catch (err) { return; }
    };

    LocalStore.clearLoginToken = function () {
        localStorage.removeItem(Constants.tokenKey);
        sessionStorage.removeItem(Constants.tokenKey);
    };

    LocalStore.setDriveRedirectPreference = function (bool) {
        safeSet(Constants.redirectToDriveKey, Boolean(bool));
    };

    LocalStore.getPremium = function () {
        try {
            return JSON.parse(localStorage[Constants.isPremiumKey]);
        } catch (err) { return; }
    };
    LocalStore.setPremium = function (bool) {
        safeSet(Constants.isPremiumKey, Boolean(bool));
    };

    LocalStore.login = function (userHash, blockHash, name, cb) {
        if (!userHash && !blockHash) { throw new Error('expected a user hash'); }
        if (!name) { throw new Error('expected a user name'); }
        removeWalletSession();
        stopWalletSessionResponder();
        if (userHash) { LocalStore.setUserHash(userHash); }
        if (blockHash) { LocalStore.setBlockHash(blockHash); }
        safeSet(Constants.userNameKey, name);
        if (cb) { cb(); }
    };
    LocalStore.walletLogin = function (userHash, blockHash, name, cb) {
        if (!userHash && !blockHash) { throw new Error('expected a user hash'); }
        if (!name) { throw new Error('expected a user name'); }
        var clearSwitchStores = shouldClearPostFiatWalletSwitchStores(name);
        var finishLogin = function () {
            safeSet(pftLastWalletAddressKey, name);
            safeSessionSet(pftWalletSessionKey, '1');
            if (userHash) { safeSessionSet(Constants.userHashKey, Hash.serializeHash(userHash)); }
            if (blockHash) { safeSessionSet(Constants.blockHashKey, blockHash); }
            safeSessionSet(Constants.userNameKey, name);
            startWalletSessionResponder();
            if (cb) { cb(); }
        };
        removeLocalLogin();
        removeWalletLoginSession();
        removeMismatchedSessionWallet(name);
        if (clearSwitchStores) {
            return void clearPostFiatWalletSwitchStores(finishLogin);
        }
        finishLogin();
    };
    LocalStore.lockWallet = function (cb) {
        removeWalletSession();
        stopWalletSessionResponder();
        if (cb) { cb(); }
    };
    var logoutHandlers = [];
    LocalStore.logout = function (cb, isDeletion) {
        [
            Constants.userNameKey,
            Constants.userHashKey,
            Constants.blockHashKey,
            Constants.sessionJWT,
            Constants.ssoSeed,
            Constants.tokenKey,
            'plan',
        ].forEach(function (k) {
            localStorage.removeItem(k);
            delete localStorage[k];
        });
        sessionStorage.clear();
        stopWalletSessionResponder();
        try {
            Object.keys(localStorage || {}).forEach(function (k) {
                // Remvoe everything in localStorage except CACHE and FS_hash
                if (typeof(localStorage[k]) === 'function') { return; }
                if (/^CRYPTPAD_CACHE/.test(k) || /^LESS_CACHE/.test(k) ||
                        k === Constants.fileHashKey ||
                        /^CRYPTPAD_STORE|colortheme/.test(k) ||
                        shouldPreservePostFiatLocalKey(k)) { return; }
                delete localStorage[k];
            });
        } catch (e) { console.error(e); }
        LocalStore.clearThumbnail();
        // Make sure we have an FS_hash in localStorage before reloading all the tabs
        // so that we don't end up with tabs using different anon hashes
        if (!LocalStore.getFSHash()) {
            LocalStore.setFSHash(Hash.createRandomHash('drive'));
        }

        if (!isDeletion) {
            logoutHandlers.forEach(function (h) {
                if (typeof (h) === "function") { h(); }
            });
        }

        if (typeof(AppConfig.customizeLogout) === 'function') {
            return void AppConfig.customizeLogout(cb);
        }

        cb = Util.once(cb || function () {});

        try {
            Cache.clear(cb);
        } catch (e) {
            console.error(e);
            cb();
        }
    };
    var loginHandlers = [];
    LocalStore.loginReload = function () {
        loginHandlers.forEach(function (h) {
            if (typeof (h) === "function") { h(); }
        });
        document.location.reload();
    };
    LocalStore.onLogin = function (h) {
        if (typeof (h) !== "function") { return; }
        if (loginHandlers.indexOf(h) !== -1) { return; }
        loginHandlers.push(h);
    };
    LocalStore.onLogout = function (h) {
        if (typeof (h) !== "function") { return; }
        if (logoutHandlers.indexOf(h) !== -1) { return; }
        logoutHandlers.push(h);
    };

    startWalletSessionResponder();


    return LocalStore;
});
