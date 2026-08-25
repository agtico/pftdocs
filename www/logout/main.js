// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([
    '/components/localforage/dist/localforage.min.js',
    '/common/cache-store.js',
    '/components/nthen/index.js',
], function (localForage, Cache, nThen) {
    var cryptpadStorePrefix = 'CRYPTPAD_STORE|';
    var preservedLocalKeys = [
        'PFT_wallet_vault',
        'PFT_ai_provider_keys_v1',
        'PFT_ai_provider_settings_v1',
        'PFT_runpod_api_key_v1',
        'PFT_runpod_settings_v1',
        'PFT_ai_chat_sessions_v1',
        'PFT_ai_chat_options_v1',
        'PFT_nostr_peer_messages_v1',
        'PFT_tasknode_ipfs_json_v1:index',
    ];
    var preservedLocalPrefixes = [
        'PFT_tasknode_ipfs_json_v1:',
        'PFT_ai_chat_memory_v1:',
        'PFT_ai_chat_context_pack_v1:',
    ];
    var normalizeCryptpadStoreKey = function (key) {
        key = String(key || '');
        return key.indexOf(cryptpadStorePrefix) === 0 ?
            key.slice(cryptpadStorePrefix.length) : key;
    };
    var shouldPreserveLocalKey = function (key) {
        key = normalizeCryptpadStoreKey(key);
        if (preservedLocalKeys.indexOf(key) !== -1) { return true; }
        return preservedLocalPrefixes.some(function (prefix) {
            return key.indexOf(prefix) === 0;
        });
    };
    var snapshotPostFiatLocalState = function () {
        var snapshot = {};
        try {
            Object.keys(localStorage || {}).forEach(function (key) {
                if (!shouldPreserveLocalKey(key)) { return; }
                snapshot[key] = localStorage.getItem(key);
            });
        } catch (err) {
            console.error(err);
        }
        return snapshot;
    };
    var restorePostFiatLocalState = function (snapshot) {
        try {
            Object.keys(snapshot || {}).forEach(function (key) {
                if (snapshot[key] === null || typeof(snapshot[key]) === 'undefined') { return; }
                localStorage.setItem(key, snapshot[key]);
            });
        } catch (err) {
            console.error(err);
        }
    };

    nThen(function (w) {
        var postFiatLocalState = snapshotPostFiatLocalState();
        localStorage.clear();
        restorePostFiatLocalState(postFiatLocalState);
        localForage.clear(w());
        Cache.clear(w());
    }).nThen(function () {
        window.location.href = '/login/';
    });
});
