// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const Constants = require(path.join(repoRoot, 'src/common/common-constants.js'));
const localStoreSource = fs.readFileSync(
    path.join(repoRoot, 'www/common/outer/local-store.js'),
    'utf8'
);

const makeStorage = () => ({
    setItem(key, value) {
        this[String(key)] = String(value);
    },
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this, String(key)) ?
            this[String(key)] : null;
    },
    removeItem(key) {
        delete this[String(key)];
    },
    clear() {
        Object.keys(this).forEach((key) => {
            if (typeof this[key] !== 'function') {
                delete this[key];
            }
        });
    },
});

const loadLocalStore = () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const events = {
        cacheClears: 0,
        localForageClears: 0,
    };
    let LocalStore;
    const context = {
        console,
        localStorage,
        sessionStorage,
        window: {},
        define(_deps, factory) {
            LocalStore = factory(
                Constants,
                { serializeHash: (hash) => hash, createRandomHash: () => '/anon/hash/' },
                { clear: (cb) => { events.cacheClears++; if (cb) { cb(); } } },
                {
                    setItem() {},
                    getItem() {},
                    clear(cb) {
                        events.localForageClears++;
                        if (cb) { cb(); }
                    },
                },
                {},
                { once: (fn) => {
                    let called = false;
                    return (...args) => {
                        if (called) { return; }
                        called = true;
                        return fn(...args);
                    };
                } }
            );
        },
    };
    vm.createContext(context);
    vm.runInContext(localStoreSource, context);
    return { LocalStore, localStorage, sessionStorage, window: context.window, events };
};

test('password logins keep CryptPad persistent local storage behavior', () => {
    const { LocalStore, localStorage, sessionStorage } = loadLocalStore();

    LocalStore.login(undefined, 'persistent-block', 'alice');

    assert.equal(LocalStore.isLoggedIn(), true);
    assert.equal(LocalStore.getBlockHash(), 'persistent-block');
    assert.equal(LocalStore.getAccountName(), 'alice');
    assert.equal(localStorage[Constants.blockHashKey], 'persistent-block');
    assert.equal(sessionStorage[Constants.blockHashKey], undefined);
});

test('stale persisted wallet-looking logins do not auto-unlock', () => {
    const { LocalStore, localStorage } = loadLocalStore();

    localStorage[Constants.userNameKey] = 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC';
    localStorage[Constants.blockHashKey] = 'old-wallet-block';

    assert.equal(LocalStore.isLoggedIn(), false);
    assert.equal(LocalStore.getBlockHash(), undefined);
    assert.equal(LocalStore.getAccountName(), undefined);
});

test('wallet logins store the login capability in session storage only', () => {
    const { LocalStore, localStorage, sessionStorage } = loadLocalStore();

    LocalStore.walletLogin(undefined, 'wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');

    assert.equal(LocalStore.isWalletSession(), true);
    assert.equal(LocalStore.isLoggedIn(), true);
    assert.equal(LocalStore.getBlockHash(), 'wallet-block');
    assert.equal(LocalStore.getAccountName(), 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');
    assert.equal(localStorage[Constants.blockHashKey], undefined);
    assert.equal(localStorage[Constants.userNameKey], undefined);
    assert.equal(localStorage.PFT_last_wallet_address, 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');
    assert.equal(sessionStorage[Constants.blockHashKey], 'wallet-block');
});

test('wallet switching clears wallet-scoped caches but preserves browser provider settings', () => {
    const { LocalStore, localStorage, sessionStorage, events } = loadLocalStore();

    LocalStore.walletLogin(undefined, 'old-wallet-block', 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    localStorage.PFT_wallet_vault = '{"version":1}';
    localStorage.PFT_ai_provider_keys_v1 = '{"ambient":"amb"}';
    localStorage.PFT_ai_provider_settings_v1 = '{"provider":"ambient"}';
    localStorage.PFT_runpod_api_key_v1 = '{"key":"rp"}';
    localStorage.PFT_runpod_settings_v1 = '{"podName":"qwen"}';
    localStorage.PFT_ai_chat_sessions_v1 = '[{"id":"old-chat"}]';
    localStorage['PFT_tasknode_ipfs_json_v1:cid'] = '{"payload":"old"}';

    LocalStore.walletLogin(undefined, 'new-wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');

    assert.equal(localStorage.PFT_wallet_vault, '{"version":1}');
    assert.equal(localStorage.PFT_last_wallet_address, 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');
    assert.equal(localStorage.PFT_ai_provider_keys_v1, '{"ambient":"amb"}');
    assert.equal(localStorage.PFT_ai_provider_settings_v1, '{"provider":"ambient"}');
    assert.equal(localStorage.PFT_runpod_api_key_v1, '{"key":"rp"}');
    assert.equal(localStorage.PFT_runpod_settings_v1, '{"podName":"qwen"}');
    assert.equal(localStorage.PFT_ai_chat_sessions_v1, undefined);
    assert.equal(localStorage['PFT_tasknode_ipfs_json_v1:cid'], undefined);
    assert.equal(sessionStorage[Constants.blockHashKey], 'new-wallet-block');
    assert.equal(events.localForageClears, 1);
    assert.equal(events.cacheClears, 1);
});

test('same-wallet login does not clear wallet-scoped browser state', () => {
    const { LocalStore, localStorage, events } = loadLocalStore();

    LocalStore.walletLogin(undefined, 'wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');
    localStorage.PFT_ai_provider_keys_v1 = '{"ambient":"amb"}';
    LocalStore.walletLogin(undefined, 'wallet-block-2', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');

    assert.equal(localStorage.PFT_ai_provider_keys_v1, '{"ambient":"amb"}');
    assert.equal(events.localForageClears, 0);
    assert.equal(events.cacheClears, 0);
});

test('wallet login clears a stale unlocked signer for a different wallet', () => {
    const { LocalStore, sessionStorage } = loadLocalStore();

    sessionStorage.PFT_session_wallet =
        '{"version":1,"address":"rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"}';
    LocalStore.walletLogin(undefined, 'wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');

    assert.equal(sessionStorage.PFT_session_wallet, undefined);
    assert.equal(LocalStore.isWalletSession(), true);
});

test('wallet login preserves an unlocked signer for the same wallet', () => {
    const { LocalStore, sessionStorage } = loadLocalStore();

    sessionStorage.PFT_session_wallet =
        '{"version":1,"address":"rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC"}';
    LocalStore.walletLogin(undefined, 'wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');

    assert.equal(
        sessionStorage.PFT_session_wallet,
        '{"version":1,"address":"rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC"}'
    );
    assert.equal(LocalStore.isWalletSession(), true);
});

test('wallet login capabilities are not exported into another tab', () => {
    const address = 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC';
    const source = loadLocalStore();
    const target = loadLocalStore();

    source.LocalStore.walletLogin('/user/hash/', 'wallet-block', address);
    source.LocalStore.setSessionToken('session-jwt');
    source.LocalStore.setSSOSeed('sso-seed');
    source.sessionStorage[Constants.tokenKey] = 'login-token';

    const payload = source.LocalStore.exportWalletSession();

    assert.equal(payload, undefined);
    assert.equal(target.LocalStore.importWalletSession(payload), false);
    assert.equal(target.LocalStore.isWalletSession(), false);
    assert.equal(target.LocalStore.isLoggedIn(), false);
    assert.equal(target.LocalStore.getAccountName(), undefined);
    assert.equal(target.LocalStore.getBlockHash(), undefined);
    assert.equal(target.LocalStore.getSessionToken(), undefined);
    assert.equal(target.LocalStore.getSSOSeed(), undefined);
    assert.equal(target.localStorage[Constants.blockHashKey], undefined);
});

test('wallet session imports reject non-wallet identities', () => {
    const { LocalStore } = loadLocalStore();

    assert.equal(LocalStore.importWalletSession({
        userName: 'alice',
        blockHash: 'wallet-block',
    }), false);
    assert.equal(LocalStore.isLoggedIn(), false);
});

test('wallet session imports are disabled and do not mutate the current tab', () => {
    const { LocalStore, sessionStorage } = loadLocalStore();

    sessionStorage.PFT_session_wallet =
        '{"version":1,"address":"rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"}';
    assert.equal(LocalStore.importWalletSession({
        userName: 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC',
        blockHash: 'wallet-block',
    }), false);

    assert.equal(
        sessionStorage.PFT_session_wallet,
        '{"version":1,"address":"rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"}'
    );
    assert.equal(LocalStore.getAccountName(), undefined);
});

test('password login clears wallet-only session state', () => {
    const { LocalStore, sessionStorage, localStorage } = loadLocalStore();

    LocalStore.walletLogin(undefined, 'wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');
    sessionStorage.PFT_session_wallet =
        '{"version":1,"address":"rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC"}';
    LocalStore.login(undefined, 'persistent-block', 'alice');

    assert.equal(LocalStore.isWalletSession(), false);
    assert.equal(sessionStorage.PFT_wallet_session, undefined);
    assert.equal(sessionStorage.PFT_session_wallet, undefined);
    assert.equal(localStorage[Constants.blockHashKey], 'persistent-block');
    assert.equal(LocalStore.getAccountName(), 'alice');
});

test('wallet lock clears only the current wallet session', () => {
    const { LocalStore, sessionStorage } = loadLocalStore();

    LocalStore.walletLogin(undefined, 'wallet-block', 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC');
    sessionStorage.PFT_session_wallet = '{"version":1}';
    LocalStore.lockWallet();

    assert.equal(LocalStore.isWalletSession(), false);
    assert.equal(LocalStore.isLoggedIn(), false);
    assert.equal(sessionStorage[Constants.blockHashKey], undefined);
    assert.equal(sessionStorage.PFT_session_wallet, undefined);
});

test('logout preserves Post Fiat browser-local app secrets and cache', () => {
    const { LocalStore, localStorage, sessionStorage } = loadLocalStore();

    localStorage.PFT_wallet_vault = '{"version":1}';
    localStorage.PFT_ai_provider_keys_v1 = '{"ambient":"amb","openrouter":"or"}';
    localStorage.PFT_ai_provider_settings_v1 = '{"provider":"openrouter"}';
    localStorage.PFT_runpod_api_key_v1 = '{"key":"rp"}';
    localStorage.PFT_runpod_settings_v1 = '{"podName":"qwen"}';
    localStorage.PFT_ai_chat_sessions_v1 = '[{"id":"chat"}]';
    localStorage.PFT_ai_chat_options_v1 = '{"includeTasks":true}';
    localStorage['PFT_tasknode_ipfs_json_v1:index'] = '[{"cid":"bafy"}]';
    localStorage['PFT_tasknode_ipfs_json_v1:bafy'] = '{"payload":"encrypted"}';
    localStorage.unrelated = 'remove-me';
    sessionStorage.PFT_wallet_session = '1';

    LocalStore.logout();

    assert.equal(localStorage.PFT_wallet_vault, '{"version":1}');
    assert.equal(localStorage.PFT_ai_provider_keys_v1, '{"ambient":"amb","openrouter":"or"}');
    assert.equal(localStorage.PFT_ai_provider_settings_v1, '{"provider":"openrouter"}');
    assert.equal(localStorage.PFT_runpod_api_key_v1, '{"key":"rp"}');
    assert.equal(localStorage.PFT_runpod_settings_v1, '{"podName":"qwen"}');
    assert.equal(localStorage.PFT_ai_chat_sessions_v1, '[{"id":"chat"}]');
    assert.equal(localStorage.PFT_ai_chat_options_v1, '{"includeTasks":true}');
    assert.equal(localStorage['PFT_tasknode_ipfs_json_v1:index'], '[{"cid":"bafy"}]');
    assert.equal(localStorage['PFT_tasknode_ipfs_json_v1:bafy'], '{"payload":"encrypted"}');
    assert.equal(localStorage.unrelated, undefined);
    assert.equal(sessionStorage.PFT_wallet_session, undefined);
});
