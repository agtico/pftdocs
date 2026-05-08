// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadPeerMessages = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/peer-messages.js'),
        'utf8'
    );
    const context = {
        moduleValue: null,
        define: (deps, factory) => {
            assert.equal(Array.isArray(deps), true);
            assert.equal(deps.length, 0);
            context.moduleValue = factory();
        },
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.moduleValue;
};

test('peer messages normalize conversations and active selection', () => {
    const peer = loadPeerMessages();
    const record = peer.normalizeStateRecord({
        activePeerConversationId: 'peer-rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx',
        conversations: [{
            recipient: { walletAddress: 'rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx' },
            updatedAt: 200,
            messages: [{ text: 'hello', createdAt: 100 }],
        }, {
            id: 'old',
            updatedAt: 100,
            messages: [],
        }],
    }, { now: 300 });

    assert.equal(record.conversations.length, 2);
    assert.equal(record.activePeerConversationId, 'peer-rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx');
    assert.equal(record.conversations[0].messages[0].text, 'hello');
});

test('peer messages upsert and append without duplicate event ids', () => {
    const peer = loadPeerMessages();
    const conversations = [];
    const conversation = peer.upsertConversation(conversations, {
        publicKeyHex: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        relays: ['wss://relay.example'],
    }, { now: 100 });

    assert.equal(conversations.length, 1);
    assert.equal(conversation.recipient.relays[0], 'wss://relay.example');
    assert.equal(peer.appendMessage(conversation, {
        eventId: 'event-1',
        direction: 'out',
        text: 'test',
        createdAt: 200,
    }), true);
    assert.equal(peer.appendMessage(conversation, {
        eventId: 'event-1',
        direction: 'out',
        text: 'duplicate',
        createdAt: 300,
    }), false);
    assert.equal(conversation.messages.length, 1);
    assert.equal(conversation.updatedAt, 200);
});

test('peer recipient parser distinguishes wallets from pubkeys and json records', () => {
    const peer = loadPeerMessages();
    const relays = ['wss://relay.example'];

    assert.equal(
        peer.parseRecipientInput('rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx', relays).walletAddress,
        'rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx'
    );
    assert.equal(
        peer.parseRecipientInput('abcdef', relays).publicKeyHex,
        'abcdef'
    );
    assert.equal(
        peer.parseRecipientInput('{"walletAddress":"rABC"}', relays).walletAddress,
        'rABC'
    );
    assert.throws(() => peer.parseRecipientInput('', relays), /MISSING_POSTFIAT_RECIPIENT/u);
});
