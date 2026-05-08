#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import WebSocket from 'ws';

import {
    createMnemonic,
    deriveWalletFromMnemonic,
    isValidMnemonic,
    normalizeMnemonic,
} from '../src/postfiat/wallet-core.mjs';
import {
    deriveNostrIdentityFromMnemonic,
} from '../src/postfiat/nostr-identity.mjs';
import {
    fetchAndOpenPeerChatMessages,
    fetchNostrInboxDirectories,
    publishOwnNostrInboxDirectory,
    publishPeerChatMessage,
} from '../src/postfiat/private-share-workflow.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const usage = `Usage:
  node scripts/postfiat-nostr-peer-chat.mjs create-wallet [--write-mnemonic FILE] [--origin ORIGIN]
  node scripts/postfiat-nostr-peer-chat.mjs identity --mnemonic-file FILE [--origin ORIGIN]
  node scripts/postfiat-nostr-peer-chat.mjs directory --wallet ADDRESS [--timeout-ms 10000]
  node scripts/postfiat-nostr-peer-chat.mjs publish-directory --mnemonic-file FILE [--origin ORIGIN]
  node scripts/postfiat-nostr-peer-chat.mjs send --to-wallet ADDRESS --text TEXT (--sender-mnemonic-file FILE | --generate-sender [--write-sender-mnemonic FILE]) [--publish-sender-directory]
  node scripts/postfiat-nostr-peer-chat.mjs inbox --recipient-mnemonic-file FILE [--since UNIX] [--limit 100]
`;

const parseArgs = (argv) => {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            args._.push(token);
            continue;
        }
        const key = token.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }
        args[key] = next;
        i += 1;
    }
    return args;
};

const readMnemonicFile = async (filePath) => {
    const text = await fs.readFile(path.resolve(filePath), 'utf8');
    const candidates = text.split(/\n+/u)
        .map((line) => line.replace(/^.*=/u, '').trim())
        .filter(Boolean);
    for (const candidate of candidates) {
        const mnemonic = normalizeMnemonic(candidate);
        if (isValidMnemonic(mnemonic)) {
            return mnemonic;
        }
    }
    throw new Error('NO_VALID_MNEMONIC_IN_FILE');
};

const writeSecretFile = async (filePath, value) => {
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${value}\n`, { mode: 0o600, flag: 'wx' });
    await fs.chmod(resolved, 0o600);
    return resolved;
};

const loadConfig = async () => {
    for (const relative of ['config/config.js', 'config/config.example.js']) {
        try {
            const mod = await import(pathToFileURL(path.join(repoRoot, relative)).href);
            return mod.default || mod;
        } catch (err) {
            if (relative === 'config/config.example.js') {
                throw err;
            }
        }
    }
    throw new Error('POSTFIAT_CONFIG_UNAVAILABLE');
};

const getOrigin = (args, config) =>
    String(args.origin || config.httpUnsafeOrigin || config.httpSafeOrigin ||
        'postfiat://cryptpad');

const getTimeoutMs = (args) => {
    const parsed = Number.parseInt(String(args['timeout-ms'] || '10000'), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('INVALID_TIMEOUT_MS');
    }
    return parsed;
};

const printJson = (value) => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const summarizePublishResults = (results) => (results || []).map((result) => ({
    relayUrl: result.relayUrl,
    eventId: result.eventId,
    accepted: Boolean(result.accepted),
    message: result.message || '',
}));

const buildCommonOptions = (args, config) => ({
    postFiatConfig: config.postFiat || {},
    origin: getOrigin(args, config),
    WebSocketImpl: WebSocket,
    timeoutMs: getTimeoutMs(args),
});

const requireArg = (args, key) => {
    if (!args[key]) {
        throw new Error(`MISSING_${key.replace(/-/gu, '_').toUpperCase()}`);
    }
    return args[key];
};

const commandCreateWallet = async (args, config) => {
    const mnemonic = createMnemonic();
    const wallet = deriveWalletFromMnemonic(mnemonic);
    const identity = await deriveNostrIdentityFromMnemonic(mnemonic, {
        origin: getOrigin(args, config),
    });
    let mnemonicFile;
    if (args['write-mnemonic']) {
        mnemonicFile = await writeSecretFile(args['write-mnemonic'], mnemonic);
    }
    printJson({
        ok: true,
        walletAddress: wallet.address,
        nostrPublicKeyHex: identity.publicKeyHex,
        mnemonicFile,
        mnemonicPrinted: false,
    });
};

const commandIdentity = async (args, config) => {
    const mnemonic = await readMnemonicFile(requireArg(args, 'mnemonic-file'));
    const wallet = deriveWalletFromMnemonic(mnemonic);
    const identity = await deriveNostrIdentityFromMnemonic(mnemonic, {
        origin: getOrigin(args, config),
    });
    printJson({
        ok: true,
        walletAddress: wallet.address,
        nostrPublicKeyHex: identity.publicKeyHex,
        origin: identity.origin,
    });
};

const commandDirectory = async (args, config) => {
    const walletAddress = requireArg(args, 'wallet');
    const result = await fetchNostrInboxDirectories({
        walletAddress,
        postFiatConfig: config.postFiat || {},
        WebSocketImpl: WebSocket,
        timeoutMs: getTimeoutMs(args),
        limit: Number.parseInt(String(args.limit || '5'), 10),
    });
    printJson({
        ok: true,
        walletAddress,
        relays: result.relays,
        directories: result.directories.map((entry) => ({
            eventId: entry.event.id,
            eventCreatedAt: entry.event.created_at,
            directory: entry.directory,
        })),
        failures: result.failures,
        relayResults: result.fetched.results.map((relay) => ({
            relayUrl: relay.relayUrl,
            events: relay.events.length,
            error: relay.error || null,
        })),
    });
};

const commandPublishDirectory = async (args, config) => {
    const mnemonic = await readMnemonicFile(requireArg(args, 'mnemonic-file'));
    const result = await publishOwnNostrInboxDirectory({
        mnemonic,
        ...buildCommonOptions(args, config),
    });
    printJson({
        ok: true,
        identity: result.identity,
        directory: result.directory,
        publishResults: summarizePublishResults(result.publishResults),
    });
};

const commandSend = async (args, config) => {
    let senderMnemonic;
    let generatedSender = false;
    let senderMnemonicFile;
    if (args['sender-mnemonic-file']) {
        senderMnemonic = await readMnemonicFile(args['sender-mnemonic-file']);
        senderMnemonicFile = path.resolve(args['sender-mnemonic-file']);
    } else if (args['generate-sender']) {
        senderMnemonic = createMnemonic();
        generatedSender = true;
        if (args['write-sender-mnemonic']) {
            senderMnemonicFile = await writeSecretFile(args['write-sender-mnemonic'], senderMnemonic);
        }
    } else {
        throw new Error('MISSING_SENDER_MNEMONIC_FILE_OR_GENERATE_SENDER');
    }
    const text = requireArg(args, 'text');
    const toWallet = requireArg(args, 'to-wallet');
    const common = buildCommonOptions(args, config);
    let senderDirectoryPublishResults;
    if (args['publish-sender-directory']) {
        const directoryResult = await publishOwnNostrInboxDirectory({
            mnemonic: senderMnemonic,
            ...common,
        });
        senderDirectoryPublishResults = summarizePublishResults(directoryResult.publishResults);
    }
    const sent = await publishPeerChatMessage({
        senderMnemonic,
        recipientDirectory: toWallet,
        text,
        ...common,
    });
    printJson({
        ok: sent.publishResults.some((result) => result.accepted),
        generatedSender,
        senderMnemonicFile,
        sender: sent.sender,
        recipient: {
            walletAddress: sent.recipient.walletAddress || toWallet,
            publicKeyHex: sent.recipient.publicKeyHex,
            relays: sent.recipient.relays,
        },
        payload: sent.payload,
        giftWrap: {
            id: sent.giftWrap.id,
            kind: sent.giftWrap.kind,
            pubkey: sent.giftWrap.pubkey,
            created_at: sent.giftWrap.created_at,
            tags: sent.giftWrap.tags,
        },
        relays: sent.relays,
        senderDirectoryPublishResults,
        publishResults: summarizePublishResults(sent.publishResults),
    });
};

const commandInbox = async (args, config) => {
    const recipientMnemonic = await readMnemonicFile(requireArg(args, 'recipient-mnemonic-file'));
    const result = await fetchAndOpenPeerChatMessages({
        recipientMnemonic,
        ...buildCommonOptions(args, config),
        since: args.since,
        until: args.until,
        limit: Number.parseInt(String(args.limit || '100'), 10),
    });
    printJson({
        ok: true,
        recipient: result.recipient,
        relays: result.relays,
        relayResults: result.inbox.results.map((relay) => ({
            relayUrl: relay.relayUrl,
            events: relay.events.length,
            error: relay.error || null,
        })),
        messages: result.messages.map((message) => ({
            giftWrapId: message.giftWrap.id,
            senderPublicKeyHex: message.senderPublicKeyHex,
            payload: message.payload,
        })),
        failures: result.failures,
    });
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0] || args.command;
    if (!command || args.help || args.h) {
        process.stdout.write(usage);
        return;
    }
    const config = await loadConfig();
    if (command === 'create-wallet') { return commandCreateWallet(args, config); }
    if (command === 'identity') { return commandIdentity(args, config); }
    if (command === 'directory') { return commandDirectory(args, config); }
    if (command === 'publish-directory') { return commandPublishDirectory(args, config); }
    if (command === 'send') { return commandSend(args, config); }
    if (command === 'inbox') { return commandInbox(args, config); }
    throw new Error(`UNKNOWN_COMMAND: ${command}`);
};

main().catch((err) => {
    printJson({
        ok: false,
        error: err.message || String(err),
    });
    process.exitCode = 1;
});
