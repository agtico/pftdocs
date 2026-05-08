// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
    buildLivePadSharePayload,
} from './live-pad-share.mjs';
import {
    buildNostrInboxDirectoryRecord,
    buildNostrInboxDirectoryWalletProof,
    deriveNostrIdentityFromMnemonic,
    isWalletAddress,
    normalizeNostrPublicKeyHex,
    normalizeNostrRelayList,
    parseNostrInboxDirectoryRecord,
    serializeNostrInboxDirectoryRecord,
} from './nostr-identity.mjs';
import {
    buildPrivateShareGiftWrap,
    buildNostrPrivateDirectMessageGiftWrap,
    signNostrEvent,
    unwrapNostrPrivateDirectMessageGiftWrap,
    unwrapPrivateShareGiftWrap,
    verifyNostrEvent,
} from './nostr-private-share.mjs';
import {
    fetchNostrEventsFromRelays,
    fetchGiftWrapsFromRelays,
    publishNostrEventToRelays,
} from './nostr-relay-client.mjs';

export const NOSTR_KIND_POSTFIAT_DIRECTORY = 30078;
export const POSTFIAT_NOSTR_DIRECTORY_D_TAG_PREFIX = 'postfiat:cryptpad:nostr-inbox:v1';
export const POSTFIAT_NOSTR_DIRECTORY_TAG = 'cryptpad-nostr-inbox';
export const POSTFIAT_NOSTR_DIRECTORY_TAG_VERSION = '1';
export const POSTFIAT_NOSTR_CHAT_TAG = 'pft-chat';
export const POSTFIAT_NOSTR_CHAT_TAG_VERSION = '1';
export const POSTFIAT_NOSTR_CHAT_CONTENT_TYPE =
    'application/vnd.postfiat.nostr-chat+json;version=1';
export const POSTFIAT_NOSTR_CHAT_PAYLOAD_KIND = 'postfiat-peer-chat-message';

const nowSeconds = () => Math.floor(Date.now() / 1000);

const getTagValues = (event, name) =>
    (event?.tags || []).filter((tag) => tag[0] === name).map((tag) => tag[1]);

export const buildNostrInboxDirectoryDTag = (walletAddress) => {
    if (!isWalletAddress(walletAddress)) {
        throw new Error('INVALID_WALLET_ADDRESS');
    }
    return `${POSTFIAT_NOSTR_DIRECTORY_D_TAG_PREFIX}:${walletAddress}`;
};

const selectDirectoryRelays = ({ relayUrls, postFiatConfig, fallbackRelays } = {}) => {
    const nostrConfig = postFiatConfig?.nostr || postFiatConfig || {};
    const configured = relayUrls?.length ? relayUrls :
        nostrConfig.privateRelays?.length ? nostrConfig.privateRelays : nostrConfig.relays;
    return normalizeNostrRelayList(configured?.length ? configured : fallbackRelays);
};

export const normalizePrivateShareRecipient = (record) => {
    const parsed = typeof record === 'string' ? (() => {
        const text = record.trim();
        if (text.startsWith('{')) {
            return JSON.parse(text);
        }
        if (isWalletAddress(text)) {
            return { walletAddress: text };
        }
        return { publicKeyHex: text };
    })() : record;
    if (parsed?.kind) {
        return parseNostrInboxDirectoryRecord(parsed);
    }
    if (parsed?.walletAddress && (parsed.publicKeyHex || parsed.pubkey)) {
        if (!isWalletAddress(parsed.walletAddress)) {
            throw new Error('INVALID_WALLET_ADDRESS');
        }
        return {
            walletAddress: parsed.walletAddress,
            publicKeyHex: normalizeNostrPublicKeyHex(parsed.publicKeyHex || parsed.pubkey),
            relays: normalizeNostrRelayList(parsed.relays || []),
        };
    }
    if (parsed?.walletAddress && isWalletAddress(parsed.walletAddress)) {
        return { walletAddress: parsed.walletAddress };
    }
    return {
        publicKeyHex: normalizeNostrPublicKeyHex(parsed?.publicKeyHex || parsed?.pubkey),
        relays: normalizeNostrRelayList(parsed?.relays || []),
    };
};

export const buildNostrInboxDirectoryFilter = ({ walletAddress, limit } = {}) => ({
    kinds: [NOSTR_KIND_POSTFIAT_DIRECTORY],
    '#d': [buildNostrInboxDirectoryDTag(walletAddress)],
    limit: Number.isInteger(limit) && limit > 0 ? limit : 10,
});

export const parseNostrInboxDirectoryEvent = (event) => {
    if (!event || event.kind !== NOSTR_KIND_POSTFIAT_DIRECTORY ||
            !verifyNostrEvent(event)) {
        throw new Error('INVALID_POSTFIAT_NOSTR_DIRECTORY_EVENT');
    }
    const directory = parseNostrInboxDirectoryRecord(event.content);
    if (event.pubkey !== directory.publicKeyHex) {
        throw new Error('POSTFIAT_NOSTR_DIRECTORY_PUBKEY_MISMATCH');
    }
    if (!getTagValues(event, 'd').includes(buildNostrInboxDirectoryDTag(directory.walletAddress))) {
        throw new Error('POSTFIAT_NOSTR_DIRECTORY_WALLET_MISMATCH');
    }
    return {
        event,
        directory,
    };
};

export const buildSignedNostrInboxDirectoryEvent = async ({
    mnemonic,
    postFiatConfig,
    fallbackRelays,
    relayUrls,
    origin,
    createdAt,
    eventCreatedAt,
} = {}) => {
    const identity = await deriveNostrIdentityFromMnemonic(mnemonic, { origin });
    const relays = selectDirectoryRelays({
        relayUrls,
        postFiatConfig,
        fallbackRelays,
    });
    const directoryBase = buildNostrInboxDirectoryRecord({
        walletAddress: identity.walletAddress,
        publicKeyHex: identity.publicKeyHex,
        relays,
        createdAt,
        origin,
    });
    const directory = buildNostrInboxDirectoryRecord({
        ...directoryBase,
        walletProof: buildNostrInboxDirectoryWalletProof({
            mnemonic,
            ...directoryBase,
        }),
    });
    const event = signNostrEvent({
        kind: NOSTR_KIND_POSTFIAT_DIRECTORY,
        created_at: eventCreatedAt || nowSeconds(),
        tags: [
            ['d', buildNostrInboxDirectoryDTag(directory.walletAddress)],
            ['wallet', directory.walletAddress],
            ['postfiat', POSTFIAT_NOSTR_DIRECTORY_TAG, POSTFIAT_NOSTR_DIRECTORY_TAG_VERSION],
        ],
        content: serializeNostrInboxDirectoryRecord(directory),
    }, identity.privateKeyHex);
    return {
        identity: {
            walletAddress: identity.walletAddress,
            publicKeyHex: identity.publicKeyHex,
        },
        directory,
        event,
        relays,
    };
};

export const publishOwnNostrInboxDirectory = async (options = {}) => {
    const built = await buildSignedNostrInboxDirectoryEvent(options);
    const publishResults = await publishNostrEventToRelays({
        relayUrls: built.relays,
        event: built.event,
        WebSocketImpl: options.WebSocketImpl,
        timeoutMs: options.timeoutMs,
    });
    return {
        ...built,
        publishResults,
    };
};

export const fetchNostrInboxDirectories = async ({
    walletAddress,
    relayUrls,
    postFiatConfig,
    fallbackRelays,
    WebSocketImpl,
    timeoutMs,
    limit,
} = {}) => {
    const relays = selectDirectoryRelays({
        relayUrls,
        postFiatConfig,
        fallbackRelays,
    });
    const fetched = await fetchNostrEventsFromRelays({
        relayUrls: relays,
        filters: [buildNostrInboxDirectoryFilter({ walletAddress, limit })],
        WebSocketImpl,
        timeoutMs,
    });
    const directories = [];
    const failures = [];
    fetched.events.forEach((event) => {
        try {
            const parsed = parseNostrInboxDirectoryEvent(event);
            directories.push(parsed);
        } catch (err) {
            failures.push({
                eventId: event?.id,
                error: err.message || String(err),
            });
        }
    });
    directories.sort((a, b) => b.event.created_at - a.event.created_at);
    return {
        walletAddress,
        relays,
        fetched,
        directories,
        failures,
    };
};

export const resolvePrivateShareRecipient = async (record, options = {}) => {
    const normalized = normalizePrivateShareRecipient(record);
    if (normalized.publicKeyHex) {
        return normalized;
    }
    if (!normalized.walletAddress) {
        throw new Error('INVALID_POSTFIAT_RECIPIENT');
    }
    const resolved = await fetchNostrInboxDirectories({
        walletAddress: normalized.walletAddress,
        relayUrls: options.directoryRelays || options.relayUrls,
        postFiatConfig: options.postFiatConfig,
        fallbackRelays: options.fallbackRelays,
        WebSocketImpl: options.WebSocketImpl,
        timeoutMs: options.timeoutMs,
        limit: options.directoryLimit,
    });
    if (!resolved.directories.length) {
        if (resolved.failures.some((failure) =>
                failure.error === 'INVALID_NOSTR_DIRECTORY_WALLET_PROOF')) {
            throw new Error('POSTFIAT_RECIPIENT_DIRECTORY_INVALID');
        }
        throw new Error('POSTFIAT_RECIPIENT_DIRECTORY_NOT_FOUND');
    }
    return resolved.directories[0].directory;
};

export const selectPrivateShareRelays = ({
    recipientDirectory,
    postFiatConfig,
    fallbackRelays,
} = {}) => {
    const recipientRelays = recipientDirectory?.relays || [];
    if (recipientRelays.length) {
        return normalizeNostrRelayList(recipientRelays);
    }
    const nostrConfig = postFiatConfig?.nostr || postFiatConfig || {};
    const configured = nostrConfig.privateRelays?.length ?
        nostrConfig.privateRelays : nostrConfig.relays;
    return normalizeNostrRelayList(configured?.length ? configured : fallbackRelays);
};

const normalizeChatText = (text) => {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        throw new Error('MISSING_POSTFIAT_CHAT_TEXT');
    }
    if (normalized.length > 8000) {
        throw new Error('POSTFIAT_CHAT_TEXT_TOO_LONG');
    }
    return normalized;
};

export const buildPeerChatMessagePayload = ({
    text,
    fromWallet,
    toWallet,
    createdAt,
    payment,
} = {}) => {
    const payload = {
        version: 1,
        kind: POSTFIAT_NOSTR_CHAT_PAYLOAD_KIND,
        text: normalizeChatText(text),
        fromWallet: fromWallet || null,
        toWallet: toWallet || null,
        createdAt: createdAt || new Date().toISOString(),
    };
    if (payment && typeof payment === 'object') {
        payload.payment = {
            currency: String(payment.currency || 'PFT'),
            amount: String(payment.amount || ''),
            txHash: payment.txHash ? String(payment.txHash) : null,
            destination: payment.destination ? String(payment.destination) : null,
        };
    }
    return payload;
};

const hasPeerChatTag = (rumor) => (rumor?.tags || []).some((tag) =>
    tag[0] === 'postfiat' &&
    tag[1] === POSTFIAT_NOSTR_CHAT_TAG &&
    tag[2] === POSTFIAT_NOSTR_CHAT_TAG_VERSION
);

const parsePeerChatPayload = (rumor) => {
    if (!hasPeerChatTag(rumor)) {
        throw new Error('NOT_POSTFIAT_CHAT_MESSAGE');
    }
    const payload = JSON.parse(String(rumor.content || '{}'));
    if (!payload || payload.kind !== POSTFIAT_NOSTR_CHAT_PAYLOAD_KIND ||
            payload.version !== 1) {
        throw new Error('INVALID_POSTFIAT_CHAT_PAYLOAD');
    }
    return buildPeerChatMessagePayload(payload);
};

export const buildPeerChatMessage = async ({
    senderMnemonic,
    recipientDirectory,
    postFiatConfig,
    fallbackRelays,
    origin,
    text,
    payment,
    createdAt,
    currentTime,
    rumorCreatedAt,
    sealCreatedAt,
    wrapCreatedAt,
    sealNonce,
    wrapNonce,
    wrapperPrivateKeyHex,
    directoryRelays,
    directoryLimit,
    WebSocketImpl,
    timeoutMs,
} = {}) => {
    const senderIdentity = await deriveNostrIdentityFromMnemonic(senderMnemonic, { origin });
    const directory = await resolvePrivateShareRecipient(recipientDirectory, {
        relayUrls: directoryRelays,
        postFiatConfig,
        fallbackRelays,
        WebSocketImpl,
        timeoutMs,
        directoryLimit,
    });
    const relays = selectPrivateShareRelays({
        recipientDirectory: directory,
        postFiatConfig,
        fallbackRelays,
    });
    const payload = buildPeerChatMessagePayload({
        text,
        fromWallet: senderIdentity.walletAddress,
        toWallet: directory.walletAddress || null,
        payment,
        createdAt,
    });
    const wrapped = buildNostrPrivateDirectMessageGiftWrap({
        senderPrivateKeyHex: senderIdentity.privateKeyHex,
        recipientPublicKeyHex: directory.publicKeyHex,
        recipientRelay: relays[0],
        tags: [
            ['postfiat', POSTFIAT_NOSTR_CHAT_TAG, POSTFIAT_NOSTR_CHAT_TAG_VERSION],
            ['content-type', POSTFIAT_NOSTR_CHAT_CONTENT_TYPE],
            ['wallet', senderIdentity.walletAddress],
        ],
        content: JSON.stringify(payload),
        currentTime,
        rumorCreatedAt,
        sealCreatedAt,
        wrapCreatedAt,
        sealNonce,
        wrapNonce,
        wrapperPrivateKeyHex,
    });

    return {
        sender: {
            walletAddress: senderIdentity.walletAddress,
            publicKeyHex: senderIdentity.publicKeyHex,
        },
        recipient: directory,
        payload,
        ...wrapped,
        relays,
    };
};

export const buildLivePadPrivateShare = async ({
    senderMnemonic,
    recipientDirectory,
    postFiatConfig,
    fallbackRelays,
    origin,
    href,
    title,
    mode,
    ownerWallet,
    createdAt,
    metadata,
    currentTime,
    rumorCreatedAt,
    sealCreatedAt,
    wrapCreatedAt,
    sealNonce,
    wrapNonce,
    wrapperPrivateKeyHex,
    directoryRelays,
    directoryLimit,
    WebSocketImpl,
    timeoutMs,
} = {}) => {
    const senderIdentity = await deriveNostrIdentityFromMnemonic(senderMnemonic, { origin });
    const directory = await resolvePrivateShareRecipient(recipientDirectory, {
        relayUrls: directoryRelays,
        postFiatConfig,
        fallbackRelays,
        WebSocketImpl,
        timeoutMs,
        directoryLimit,
    });
    const relays = selectPrivateShareRelays({
        recipientDirectory: directory,
        postFiatConfig,
        fallbackRelays,
    });
    const payload = buildLivePadSharePayload({
        href,
        title,
        mode,
        ownerWallet,
        sharedByWallet: senderIdentity.walletAddress,
        createdAt,
        metadata,
    });
    const wrapped = buildPrivateShareGiftWrap({
        senderPrivateKeyHex: senderIdentity.privateKeyHex,
        recipientPublicKeyHex: directory.publicKeyHex,
        recipientRelay: relays[0],
        payload,
        subject: title || payload.title,
        currentTime,
        rumorCreatedAt,
        sealCreatedAt,
        wrapCreatedAt,
        sealNonce,
        wrapNonce,
        wrapperPrivateKeyHex,
    });

    return {
        sender: {
            walletAddress: senderIdentity.walletAddress,
            publicKeyHex: senderIdentity.publicKeyHex,
        },
        recipient: directory,
        payload,
        ...wrapped,
        relays,
    };
};

export const buildOwnNostrInboxDirectory = async ({
    mnemonic,
    postFiatConfig,
    fallbackRelays,
    origin,
    createdAt,
} = {}) => {
    const identity = await deriveNostrIdentityFromMnemonic(mnemonic, { origin });
    const relays = selectPrivateShareRelays({
        recipientDirectory: { relays: [] },
        postFiatConfig,
        fallbackRelays,
    });
    const directoryBase = buildNostrInboxDirectoryRecord({
        walletAddress: identity.walletAddress,
        publicKeyHex: identity.publicKeyHex,
        relays,
        createdAt,
        origin,
    });
    return buildNostrInboxDirectoryRecord({
        ...directoryBase,
        walletProof: buildNostrInboxDirectoryWalletProof({
            mnemonic,
            ...directoryBase,
        }),
    });
};

export const publishLivePadPrivateShare = async (options = {}) => {
    const built = await buildLivePadPrivateShare(options);
    const publishResults = await publishNostrEventToRelays({
        relayUrls: built.relays,
        event: built.giftWrap,
        WebSocketImpl: options.WebSocketImpl,
        timeoutMs: options.timeoutMs,
    });
    return {
        ...built,
        publishResults,
    };
};

export const publishPeerChatMessage = async (options = {}) => {
    const built = await buildPeerChatMessage(options);
    const publishResults = await publishNostrEventToRelays({
        relayUrls: built.relays,
        event: built.giftWrap,
        WebSocketImpl: options.WebSocketImpl,
        timeoutMs: options.timeoutMs,
    });
    return {
        ...built,
        publishResults,
    };
};

export const openLivePadPrivateShare = async ({
    recipientMnemonic,
    giftWrap,
    origin,
} = {}) => {
    const recipientIdentity = await deriveNostrIdentityFromMnemonic(recipientMnemonic, { origin });
    const opened = unwrapPrivateShareGiftWrap({
        giftWrap,
        recipientPrivateKeyHex: recipientIdentity.privateKeyHex,
    });
    return {
        recipient: {
            walletAddress: recipientIdentity.walletAddress,
            publicKeyHex: recipientIdentity.publicKeyHex,
        },
        ...opened,
        payload: opened.envelope.payload,
    };
};

export const openPeerChatMessage = async ({
    recipientMnemonic,
    giftWrap,
    origin,
} = {}) => {
    const recipientIdentity = await deriveNostrIdentityFromMnemonic(recipientMnemonic, { origin });
    const opened = unwrapNostrPrivateDirectMessageGiftWrap({
        giftWrap,
        recipientPrivateKeyHex: recipientIdentity.privateKeyHex,
    });
    return {
        recipient: {
            walletAddress: recipientIdentity.walletAddress,
            publicKeyHex: recipientIdentity.publicKeyHex,
        },
        ...opened,
        payload: parsePeerChatPayload(opened.rumor),
    };
};

export const fetchAndOpenLivePadPrivateShares = async ({
    recipientMnemonic,
    relayUrls,
    postFiatConfig,
    fallbackRelays,
    origin,
    WebSocketImpl,
    since,
    until,
    limit,
    timeoutMs,
} = {}) => {
    const recipientIdentity = await deriveNostrIdentityFromMnemonic(recipientMnemonic, { origin });
    const relays = normalizeNostrRelayList(
        relayUrls?.length ? relayUrls :
            postFiatConfig?.nostr?.privateRelays?.length ? postFiatConfig.nostr.privateRelays :
                postFiatConfig?.nostr?.relays?.length ? postFiatConfig.nostr.relays :
                    fallbackRelays
    );
    const inbox = await fetchGiftWrapsFromRelays({
        relayUrls: relays,
        recipientPublicKeyHex: recipientIdentity.publicKeyHex,
        WebSocketImpl,
        since,
        until,
        limit,
        timeoutMs,
    });
    const shares = [];
    const failures = [];
    inbox.events.forEach((giftWrap) => {
        try {
            const opened = unwrapPrivateShareGiftWrap({
                giftWrap,
                recipientPrivateKeyHex: recipientIdentity.privateKeyHex,
            });
            shares.push({
                ...opened,
                payload: opened.envelope.payload,
            });
        } catch (err) {
            if (err?.message === 'NOT_PRIVATE_SHARE_MESSAGE') {
                return;
            }
            failures.push({
                eventId: giftWrap?.id,
                error: err.message || String(err),
            });
        }
    });
    return {
        recipient: {
            walletAddress: recipientIdentity.walletAddress,
            publicKeyHex: recipientIdentity.publicKeyHex,
        },
        relays,
        inbox,
        shares,
        failures,
    };
};

export const fetchAndOpenPeerChatMessages = async ({
    recipientMnemonic,
    relayUrls,
    postFiatConfig,
    fallbackRelays,
    origin,
    WebSocketImpl,
    since,
    until,
    limit,
    timeoutMs,
} = {}) => {
    const recipientIdentity = await deriveNostrIdentityFromMnemonic(recipientMnemonic, { origin });
    const relays = normalizeNostrRelayList(
        relayUrls?.length ? relayUrls :
            postFiatConfig?.nostr?.privateRelays?.length ? postFiatConfig.nostr.privateRelays :
                postFiatConfig?.nostr?.relays?.length ? postFiatConfig.nostr.relays :
                    fallbackRelays
    );
    const inbox = await fetchGiftWrapsFromRelays({
        relayUrls: relays,
        recipientPublicKeyHex: recipientIdentity.publicKeyHex,
        WebSocketImpl,
        since,
        until,
        limit,
        timeoutMs,
    });
    const messages = [];
    const failures = [];
    inbox.events.forEach((giftWrap) => {
        try {
            const opened = unwrapNostrPrivateDirectMessageGiftWrap({
                giftWrap,
                recipientPrivateKeyHex: recipientIdentity.privateKeyHex,
            });
            messages.push({
                ...opened,
                payload: parsePeerChatPayload(opened.rumor),
            });
        } catch (err) {
            if (err?.message === 'NOT_POSTFIAT_CHAT_MESSAGE' ||
                    err?.message === 'NOT_PRIVATE_SHARE_MESSAGE') {
                return;
            }
            failures.push({
                eventId: giftWrap?.id,
                error: err.message || String(err),
            });
        }
    });
    messages.sort((a, b) => {
        const aTime = Date.parse(a.payload?.createdAt || '') || a.rumor?.created_at || 0;
        const bTime = Date.parse(b.payload?.createdAt || '') || b.rumor?.created_at || 0;
        return aTime - bTime;
    });
    return {
        recipient: {
            walletAddress: recipientIdentity.walletAddress,
            publicKeyHex: recipientIdentity.publicKeyHex,
        },
        relays,
        inbox,
        messages,
        failures,
    };
};
