// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_DERIVATION_PATH,
    SESSION_WALLET_STORAGE_KEY,
    WALLET_VAULT_STORAGE_KEY,
    buildPftPaymentTransaction,
    clearSavedWallet,
    clearSessionWallet,
    createMnemonic,
    createSessionWallet,
    decryptMnemonicVault,
    decryptTaskNodePayload,
    decodeTaskNodePointerMemo,
    deriveWalletFromMnemonic,
    deriveTaskNodeX25519KeypairFromMnemonic,
    dropsToPft,
    encodeTaskNodePublicKey,
    encryptMnemonicVault,
    encryptTaskNodePayloadForTests,
    extractTaskNodePointerEvents,
    extractTaskNodeReadableText,
    fetchPftBalance,
    getSavedWalletMeta,
    isValidMnemonic,
    loadIndexedTaskNodeHistory,
    messageToHex,
    normalizeIndexedTaskNodeSnapshot,
    normalizeMnemonic,
    normalizePftAmountValue,
    pftToDrops,
    saveWallet,
    restoreSessionWallet,
    requestSessionWallet,
    signMessage,
    startSessionWalletResponder,
    stopSessionWalletResponder,
    unlockSavedWallet,
    verifyMessage,
} from '../../src/postfiat/wallet-core.mjs';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const TEST_ADDRESS = 'rKxpJQ6hLWYbo7p1oo7WHjrcrRFv1TUQeC';
const TEST_PUBLIC_KEY = '03543B859FF40BF433302D20A322DB4EAD92D112F6C20F52864468262E083DC9EE';
const TEST_ACCESS_MESSAGE = `PostFiat Access: ${TEST_ADDRESS}`;
const TEST_ACCESS_SIGNATURE = '30450221008A2DE9A6BC4185AF7B2332654148FD12886B3032B8E22EA215726CE68596987F022055C2B7B41E96E4FC9D67342B96F274AC6CD51DBE82F9DF97975A3A9D5E380AF3';

const encodeVarint = (value) => {
    const bytes = [];
    let current = value;
    while (current > 0x7f) {
        bytes.push((current & 0x7f) | 0x80);
        current >>>= 7;
    }
    bytes.push(current);
    return Buffer.from(bytes);
};

const encodeStringField = (fieldNumber, value) => {
    const body = Buffer.from(String(value), 'utf8');
    return Buffer.concat([
        encodeVarint((fieldNumber << 3) | 2),
        encodeVarint(body.length),
        body,
    ]);
};

const encodeVarintField = (fieldNumber, value) => Buffer.concat([
    encodeVarint((fieldNumber << 3) | 0),
    encodeVarint(value),
]);

const buildPointerMemoHex = ({ cid, kind, schema, taskId, flags }) => Buffer.concat([
    encodeStringField(1, cid),
    encodeVarintField(3, kind),
    encodeVarintField(4, schema),
    taskId ? encodeStringField(5, taskId) : Buffer.alloc(0),
    encodeVarintField(8, flags),
]).toString('hex').toUpperCase();

const makeStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
    };
};

const makeKeyStore = () => {
    let value = null;
    return {
        put: async (key) => {
            value = key;
        },
        get: async () => value,
        delete: async () => {
            value = null;
        },
    };
};

const makeBroadcastChannel = () => {
    const channels = new Map();
    return class MockBroadcastChannel {
        constructor(name) {
            this.name = name;
            this.onmessage = null;
            this.closed = false;
            if (!channels.has(name)) { channels.set(name, new Set()); }
            channels.get(name).add(this);
        }

        postMessage(data) {
            const peers = channels.get(this.name) || new Set();
            peers.forEach((peer) => {
                if (peer === this || peer.closed || typeof(peer.onmessage) !== 'function') {
                    return;
                }
                setTimeout(() => {
                    if (!peer.closed && typeof(peer.onmessage) === 'function') {
                        peer.onmessage({ data });
                    }
                });
            });
        }

        close() {
            this.closed = true;
            const peers = channels.get(this.name);
            if (peers) { peers.delete(this); }
        }
    };
};

test('normalizes and validates 24-word BIP39 mnemonics', () => {
    assert.equal(normalizeMnemonic(`  ${TEST_MNEMONIC.toUpperCase()}  `), TEST_MNEMONIC);
    assert.equal(isValidMnemonic(TEST_MNEMONIC), true);
    assert.equal(isValidMnemonic(TEST_MNEMONIC.replace(/ art$/, ' abandon')), false);
    assert.equal(createMnemonic().split(' ').length, 24);
});

test('derives the Task Node XRPL wallet path', () => {
    const wallet = deriveWalletFromMnemonic(TEST_MNEMONIC);

    assert.equal(wallet.derivationPath, DEFAULT_DERIVATION_PATH);
    assert.equal(wallet.address, TEST_ADDRESS);
    assert.equal(wallet.publicKey, TEST_PUBLIC_KEY);
});

test('decrypts Task Node X25519 payloads with the wallet mnemonic', async () => {
    const keypair = await deriveTaskNodeX25519KeypairFromMnemonic(TEST_MNEMONIC);
    const publicKey = await encodeTaskNodePublicKey(keypair.publicKey);
    const blob = await encryptTaskNodePayloadForTests({
        plaintext: JSON.stringify({ task_id: 'task-1', phase: 'submission' }),
        recipientPublicKeys: [publicKey],
    });

    const plaintext = await decryptTaskNodePayload({
        blob,
        mnemonic: TEST_MNEMONIC,
    });

    assert.deepEqual(JSON.parse(plaintext), {
        task_id: 'task-1',
        phase: 'submission',
    });
});

test('extracts readable text from Task Node payload envelopes', () => {
    assert.equal(extractTaskNodeReadableText({
        schema: 'pf.reward.v1',
        reward_summary: 'Strong execution with clear evidence.',
        task_id: 'task-1',
    }), 'Strong execution with clear evidence.');

    assert.equal(extractTaskNodeReadableText({
        phase: 'submission',
        artifact: {
            codeSnippet: 'function ship() { return true; }',
        },
    }), 'function ship() { return true; }');

    assert.equal(extractTaskNodeReadableText({
        artifacts: [{
            evidence_type: 'screenshot',
            image_description: 'Screenshot shows the completed task flow.',
            artifact: {
                fileName: 'done.png',
                mimeType: 'image/png',
            },
        }, {
            evidence_type: 'text',
            artifact: {
                response: 'Published the public writeup.',
            },
        }],
    }), 'Screenshot shows the completed task flow.\n\nPublished the public writeup.');
});

test('rejects Task Node blobs with mismatched content hashes', async () => {
    const keypair = await deriveTaskNodeX25519KeypairFromMnemonic(TEST_MNEMONIC);
    const publicKey = await encodeTaskNodePublicKey(keypair.publicKey);
    const blob = await encryptTaskNodePayloadForTests({
        plaintext: 'context update',
        recipientPublicKeys: [publicKey],
    });

    blob.content_hash = '00'.repeat(32);

    await assert.rejects(() => decryptTaskNodePayload({
        blob,
        mnemonic: TEST_MNEMONIC,
    }), /TASKNODE_CONTENT_HASH_MISMATCH/);
});

test('decodes pf.ptr v4 Task Node pointers from XRPL memos', () => {
    const memoData = buildPointerMemoHex({
        cid: 'bafybeigdyrztestcidforcontextpointer12345',
        kind: 5,
        schema: 1,
        flags: 1,
    });

    const pointer = decodeTaskNodePointerMemo(memoData);

    assert.equal(pointer.cid, 'bafybeigdyrztestcidforcontextpointer12345');
    assert.equal(pointer.kind, 5);
    assert.equal(pointer.kindLabel, 'CONTEXT');
    assert.equal(pointer.schema, 1);
    assert.equal(pointer.flags, 1);
});

test('extracts task and context pointer events from account_tx rows', () => {
    const contextMemo = buildPointerMemoHex({
        cid: 'bafybeigdyrzcontextcid000000000000000000',
        kind: 5,
        schema: 1,
        flags: 1,
    });
    const taskMemo = buildPointerMemoHex({
        cid: 'bafybeigdyrztaskcid000000000000000000000',
        kind: 3,
        schema: 1,
        taskId: 'task-123',
        flags: 1,
    });
    const events = extractTaskNodePointerEvents([{
        tx: {
            hash: 'ABC',
            Account: TEST_ADDRESS,
            Destination: 'rDestinationWallet1111111111111111',
            date: 820454400,
            ledger_index: 123,
            Memos: [{
                Memo: {
                    MemoType: Buffer.from('pf.ptr').toString('hex').toUpperCase(),
                    MemoFormat: Buffer.from('v4').toString('hex').toUpperCase(),
                    MemoData: contextMemo,
                },
            }, {
                Memo: {
                    MemoType: Buffer.from('pf.ptr').toString('hex').toUpperCase(),
                    MemoFormat: Buffer.from('v4').toString('hex').toUpperCase(),
                    MemoData: taskMemo,
                },
            }],
        },
    }], TEST_ADDRESS);

    assert.equal(events.length, 2);
    assert.equal(events[0].direction, 'outbound');
    assert.equal(events[0].ledgerIndex, 123);
    assert.deepEqual(events.map((event) => event.kindLabel).sort(), ['CONTEXT', 'TASK_SUBMISSION']);
    assert.equal(events.find((event) => event.kindLabel === 'TASK_SUBMISSION').taskId, 'task-123');
});

test('normalizes indexed pftasks rows into Task Node history events', () => {
    const normalized = normalizeIndexedTaskNodeSnapshot({
        walletAddress: TEST_ADDRESS,
        contextRevisions: [{
            id: 'context-1',
            cid: 'bafk-context-1',
            tx_hash: 'CTXHASH',
            word_count: 42,
            created_at: '2026-04-25T16:40:12.053Z',
        }],
        tasks: [{
            id: 'task-1',
            title: 'Ship indexed bridge',
            status: 'rewarded',
            verification_type: 'code',
        }],
        taskEvents: [{
            id: 'event-1',
            task_id: 'task-1',
            event_type: 'submission_recorded',
            event_payload: {
                artifact_cid: 'bafk-submission-1',
                artifact_type: 'text',
            },
            pftl_tx_hash: 'SUBMITTX',
            created_at: '2026-04-26T00:00:00.000Z',
        }],
    });

    assert.equal(normalized.contextEvents.length, 1);
    assert.equal(normalized.contextEvents[0].kindLabel, 'CONTEXT');
    assert.equal(normalized.contextEvents[0].wordCount, 42);
    assert.equal(normalized.taskEvents.length, 1);
    assert.equal(normalized.taskEvents[0].cid, 'bafk-submission-1');
    assert.equal(normalized.taskEvents[0].kindLabel, 'TASK_SUBMISSION');
    assert.equal(normalized.taskEvents[0].title, 'Ship indexed bridge');
});

test('loads indexed pftasks rows and decrypts IPFS payloads with the wallet mnemonic', async () => {
    const keypair = await deriveTaskNodeX25519KeypairFromMnemonic(TEST_MNEMONIC);
    const publicKey = await encodeTaskNodePublicKey(keypair.publicKey);
    const contextBlob = await encryptTaskNodePayloadForTests({
        plaintext: 'Post Fiat Operating Brief\n\nCurrent sprint: indexed bridge.',
        recipientPublicKeys: [publicKey],
    });
    const submissionBlob = await encryptTaskNodePayloadForTests({
        plaintext: JSON.stringify({
            task_id: 'task-1',
            phase: 'submission',
            artifact_type: 'text',
            response: 'Implemented indexed Task Node importer.',
        }),
        recipientPublicKeys: [publicKey],
    });
    const payloads = new Map([
        ['bafk-context-1', contextBlob],
        ['bafk-submission-1', submissionBlob],
    ]);

    const history = await loadIndexedTaskNodeHistory({
        mnemonic: TEST_MNEMONIC,
        walletAddress: TEST_ADDRESS,
        indexedData: {
            context_revisions: [{
                cid: 'bafk-context-1',
                tx_hash: 'CTXHASH',
                created_at: '2026-04-25T16:40:12.053Z',
            }],
            tasks: [{
                id: 'task-1',
                title: 'Ship indexed bridge',
                verification_type: 'code',
                status: 'rewarded',
            }],
            task_events: [{
                id: 'event-1',
                task_id: 'task-1',
                event_type: 'submission_recorded',
                event_payload: JSON.stringify({
                    artifact_cid: 'bafk-submission-1',
                    artifact_type: 'text',
                }),
                pftl_tx_hash: 'SUBMITTX',
                created_at: '2026-04-26T00:00:00.000Z',
            }],
        },
        fetchIpfsJson: async ({ cid }) => {
            if (!payloads.has(cid)) {
                throw new Error(`missing cid ${cid}`);
            }
            return payloads.get(cid);
        },
    });

    assert.equal(history.walletAddress, TEST_ADDRESS);
    assert.equal(history.source.indexed, 'pftasks');
    assert.equal(history.taskEventCount, 1);
    assert.equal(history.contextUpdateCount, 1);
    assert.equal(history.latestContext.decrypted, true);
    assert.match(history.latestContext.text, /Operating Brief/);
    assert.equal(history.tasks.length, 1);
    assert.equal(history.tasks[0].taskId, 'task-1');
    assert.equal(history.tasks[0].latest.summary.preview,
        'Implemented indexed Task Node importer.');
    assert.equal(history.taskHydrationFailures.length, 0);
    assert.equal(history.contextHydrationFailures.length, 0);
});

test('rejects indexed Task Node history for a different wallet', async () => {
    await assert.rejects(() => loadIndexedTaskNodeHistory({
        mnemonic: TEST_MNEMONIC,
        walletAddress: 'rDifferentWallet111111111111111111111',
        indexedData: {},
        fetchIpfsJson: async () => ({}),
    }), /POSTFIAT_WALLET_ACCOUNT_MISMATCH/);
});

test('signs and verifies canonical Post Fiat access messages', () => {
    const signed = signMessage(TEST_MNEMONIC, TEST_ACCESS_MESSAGE);

    assert.equal(messageToHex(TEST_ACCESS_MESSAGE), signed.messageHex);
    assert.equal(signed.address, TEST_ADDRESS);
    assert.equal(signed.publicKey, TEST_PUBLIC_KEY);
    assert.equal(signed.signature, TEST_ACCESS_SIGNATURE);
    assert.equal(verifyMessage({
        message: TEST_ACCESS_MESSAGE,
        signature: signed.signature,
        publicKey: signed.publicKey,
        address: signed.address,
    }), true);
    assert.equal(verifyMessage({
        message: `${TEST_ACCESS_MESSAGE}x`,
        signature: signed.signature,
        publicKey: signed.publicKey,
        address: signed.address,
    }), false);
});

test('normalizes native PFT balances and payment transactions', async () => {
    assert.equal(normalizePftAmountValue('10.0000'), '10');
    assert.equal(normalizePftAmountValue('0.5000'), '0.5');
    assert.equal(pftToDrops('10.25'), '10250000');
    assert.equal(dropsToPft('10250000'), '10.25');

    const balance = await fetchPftBalance({
        walletAddress: TEST_ADDRESS,
        fetchRpc: async ({ method, params }) => {
            assert.equal(method, 'account_info');
            assert.equal(params[0].account, TEST_ADDRESS);
            return {
                result: {
                    account_data: {
                        Account: TEST_ADDRESS,
                        Balance: '9750000',
                        Sequence: 7,
                    },
                },
            };
        },
    });

    assert.equal(balance.balance, '9.75');
    assert.equal(balance.balanceDrops, '9750000');
    assert.equal(balance.found, true);

    const tx = buildPftPaymentTransaction({
        account: TEST_ADDRESS,
        destination: 'rf1Xs7YGJpz1YzU9prwXhSrhz21v2LhtXV',
        amount: '10.000',
        currency: 'PFT',
        sequence: 7,
        networkId: 2025,
        lastLedgerSequence: 100,
        memoText: 'peer transfer',
    });

    assert.equal(tx.TransactionType, 'Payment');
    assert.equal(tx.Amount, '10000000');
    assert.equal(tx.NetworkID, 2025);
    assert.equal(tx.Memos[0].Memo.MemoType, messageToHex('pftdocs.peer-payment'));
});

test('encrypts and decrypts a saved wallet vault', async () => {
    const record = await encryptMnemonicVault({
        password: 'correct horse battery staple',
        mnemonic: TEST_MNEMONIC,
        iterations: 1000,
        createdAt: '2026-04-30T00:00:00.000Z',
    });

    assert.equal(record.version, 1);
    assert.equal(record.address, TEST_ADDRESS);
    assert.equal(record.derivationPath, DEFAULT_DERIVATION_PATH);
    assert.equal(record.createdAt, '2026-04-30T00:00:00.000Z');
    assert.equal(record.kdf.iterations, 1000);
    assert.equal(record.mnemonic, undefined);

    const mnemonic = await decryptMnemonicVault({
        password: 'correct horse battery staple',
        record,
    });
    assert.equal(mnemonic, TEST_MNEMONIC);

    await assert.rejects(
        decryptMnemonicVault({ password: 'wrong password', record }),
        /operation-specific reason|decrypt|valid/i
    );
});

test('saves, unlocks, and clears the browser wallet vault', async () => {
    const storage = makeStorage();

    const meta = await saveWallet('wallet password', TEST_MNEMONIC, {
        storage,
        iterations: 1000,
        createdAt: '2026-04-30T00:00:00.000Z',
    });
    assert.equal(meta.address, TEST_ADDRESS);
    assert.equal(meta.kdf.iterations, 1000);
    assert.ok(storage.getItem(WALLET_VAULT_STORAGE_KEY));

    assert.equal(getSavedWalletMeta(storage).address, TEST_ADDRESS);

    const unlocked = await unlockSavedWallet('wallet password', { storage });
    assert.equal(unlocked.mnemonic, TEST_MNEMONIC);
    assert.equal(unlocked.wallet.address, TEST_ADDRESS);

    clearSavedWallet(storage);
    assert.equal(storage.getItem(WALLET_VAULT_STORAGE_KEY), null);
});

test('stores an unlocked wallet in session-scoped encrypted storage', async () => {
    const storage = makeStorage();
    const keyStore = makeKeyStore();

    const meta = await createSessionWallet(TEST_MNEMONIC, {
        storage,
        keyStore,
        createdAt: '2026-04-30T00:00:00.000Z',
    });

    assert.equal(meta.address, TEST_ADDRESS);
    assert.ok(storage.getItem(SESSION_WALLET_STORAGE_KEY));

    const restored = await restoreSessionWallet({ storage, keyStore });
    assert.equal(restored.mnemonic, TEST_MNEMONIC);
    assert.equal(restored.wallet.address, TEST_ADDRESS);

    await clearSessionWallet({ storage, keyStore });
    assert.equal(storage.getItem(SESSION_WALLET_STORAGE_KEY), null);
    assert.equal(await restoreSessionWallet({ storage, keyStore }), null);
});

test('missing session records do not delete the shared session wallet key', async () => {
    const storage = makeStorage();
    const keyStore = makeKeyStore();

    await createSessionWallet(TEST_MNEMONIC, {
        storage,
        keyStore,
        createdAt: '2026-04-30T00:00:00.000Z',
    });
    const sessionRecord = storage.getItem(SESSION_WALLET_STORAGE_KEY);

    storage.removeItem(SESSION_WALLET_STORAGE_KEY);
    assert.equal(await restoreSessionWallet({ storage, keyStore }), null);

    storage.setItem(SESSION_WALLET_STORAGE_KEY, sessionRecord);
    const restored = await restoreSessionWallet({ storage, keyStore });
    assert.equal(restored.wallet.address, TEST_ADDRESS);
});

test('does not export unlocked wallet seeds across browser contexts', async () => {
    const sourceStorage = makeStorage();
    const sourceKeyStore = makeKeyStore();
    const targetStorage = makeStorage();
    const targetKeyStore = makeKeyStore();
    const BroadcastChannelImpl = makeBroadcastChannel();

    await createSessionWallet(TEST_MNEMONIC, {
        storage: sourceStorage,
        keyStore: sourceKeyStore,
        BroadcastChannelImpl,
        startResponder: false,
    });
    assert.equal(startSessionWalletResponder({
        storage: sourceStorage,
        keyStore: sourceKeyStore,
        BroadcastChannelImpl,
    }), false);

    try {
        const imported = await requestSessionWallet({
            storage: targetStorage,
            keyStore: targetKeyStore,
            BroadcastChannelImpl,
            timeoutMs: 100,
            startResponder: false,
        });

        assert.equal(imported, null);
        assert.equal(targetStorage.getItem(SESSION_WALLET_STORAGE_KEY), null);
    } finally {
        stopSessionWalletResponder();
    }
});
