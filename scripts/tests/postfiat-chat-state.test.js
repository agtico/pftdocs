// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadChatState = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/chat-state.js'),
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

test('chat options default to tasks on, context off, standard prompt', () => {
    const state = loadChatState();
    const options = state.normalizeChatOptions({});

    assert.equal(options.version, 3);
    assert.equal(options.includeContextDoc, false);
    assert.equal(options.includeTasks, true);
    assert.equal(options.thinking, false);
    assert.equal(options.promptMode, 'standard');
});

test('ODV prompt mode disables thinking even when thinking is checked', () => {
    const state = loadChatState();

    assert.equal(state.isChatThinkingEnabled({
        thinking: true,
        promptMode: 'standard',
    }), true);
    assert.equal(state.isChatThinkingEnabled({
        thinking: true,
        promptMode: 'odv',
    }), false);
});

test('chat titles are compact and whitespace-normalized', () => {
    const state = loadChatState();

    assert.equal(state.shortChatTitle(''), 'New chat');
    assert.equal(state.shortChatTitle('  what   matters   now  '), 'what matters now');
    assert.equal(
        state.shortChatTitle('a'.repeat(80)),
        'a'.repeat(43) + '...'
    );
});

test('chat session normalization keeps newest 40 non-empty messages', () => {
    const state = loadChatState();
    const session = state.normalizeChatSession({
        id: 'chat-old',
        title: '',
        createdAt: 100,
        updatedAt: 200,
        messages: Array.from({ length: 45 }, (_, index) => ({
            id: 'm' + index,
            role: index === 0 ? 'bad-role' : 'user',
            text: index === 2 ? '' : 'message ' + index,
            createdAt: index,
        })),
    }, { now: 1000 });

    assert.equal(session.id, 'chat-old');
    assert.equal(session.messages.length, 40);
    assert.equal(session.messages[0].id, 'm5');
    assert.equal(session.messages[0].role, 'user');
    assert.equal(session.title, 'message 5');
});

test('chat sessions record sorts by update time and picks valid active session', () => {
    const state = loadChatState();
    const record = state.normalizeChatSessionsRecord({
        activeChatId: 'b',
        sessions: [
            { id: 'a', updatedAt: 100, messages: [{ role: 'user', text: 'older' }] },
            { id: 'b', updatedAt: 300, messages: [{ role: 'user', text: 'newer' }] },
        ],
    }, { now: 1000 });

    assert.equal(record.activeChatId, 'b');
    assert.deepEqual(record.sessions.map((session) => session.id), ['b', 'a']);
});
