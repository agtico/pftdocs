// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var CHAT_OPTIONS_VERSION = 3;
    var CHAT_PROMPT_STANDARD = 'standard';
    var CHAT_PROMPT_ODV = 'odv';

    var makeId = function (prefix, now) {
        return prefix + '-' + now.toString(36) + '-' +
            Math.random().toString(36).slice(2, 8);
    };

    var getDefaultChatOptions = function () {
        return {
            version: CHAT_OPTIONS_VERSION,
            includeContextDoc: false,
            includeTasks: true,
            thinking: false,
            promptMode: CHAT_PROMPT_STANDARD,
            selectedDocIds: []
        };
    };

    var normalizeChatPromptMode = function (value) {
        return value === CHAT_PROMPT_ODV ? CHAT_PROMPT_ODV : CHAT_PROMPT_STANDARD;
    };

    var normalizeChatOptions = function (options) {
        var defaults = getDefaultChatOptions();
        options = options || {};
        return {
            version: CHAT_OPTIONS_VERSION,
            includeContextDoc: options.includeContextDoc === true,
            includeTasks: options.includeTasks !== false,
            thinking: options.thinking === true,
            promptMode: normalizeChatPromptMode(options.promptMode || defaults.promptMode),
            selectedDocIds: Array.isArray(options.selectedDocIds) ?
                options.selectedDocIds.map(String).slice(0, 12) : defaults.selectedDocIds
        };
    };

    var isChatThinkingEnabled = function (options) {
        options = normalizeChatOptions(options);
        return options.promptMode !== CHAT_PROMPT_ODV && options.thinking === true;
    };

    var shortChatTitle = function (value) {
        var text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text) { return 'New chat'; }
        return text.length > 46 ? text.slice(0, 43).trim() + '...' : text;
    };

    var createChatSession = function (seedText, options) {
        var now = Number(options && options.now) || Date.now();
        return {
            id: options && options.id || makeId('chat', now),
            title: shortChatTitle(seedText),
            createdAt: now,
            updatedAt: now,
            messages: []
        };
    };

    var normalizeChatMessage = function (message, options) {
        var now = Number(options && options.now) || Date.now();
        var role = String(message && message.role || 'assistant');
        if (['assistant', 'user', 'system'].indexOf(role) === -1) {
            role = 'assistant';
        }
        return {
            id: String(message && message.id || makeId('chat-msg', now)),
            role: role,
            text: String(message && message.text || '').slice(0, 60000),
            createdAt: Number(message && message.createdAt) || now
        };
    };

    var normalizeChatSession = function (session, options) {
        var now = Number(options && options.now) || Date.now();
        var messages = Array.isArray(session && session.messages) ?
            session.messages.map(function (message) {
                return normalizeChatMessage(message, options);
            }).filter(function (message) {
                return !!message.text;
            }).slice(-40) : [];
        var firstUser = messages.filter(function (message) {
            return message.role === 'user';
        })[0];
        return {
            id: String(session && session.id || ('chat-' + now.toString(36))),
            title: shortChatTitle(session && session.title ||
                (firstUser && firstUser.text) || 'New chat'),
            createdAt: Number(session && session.createdAt) || now,
            updatedAt: Number(session && session.updatedAt) || now,
            messages: messages
        };
    };

    var normalizeChatSessionsRecord = function (record, options) {
        var sessions = Array.isArray(record && record.sessions) ?
            record.sessions.map(function (session) {
                return normalizeChatSession(session, options);
            }) : [];
        if (!sessions.length) {
            sessions = [createChatSession('', options)];
        }
        sessions = sessions.sort(function (a, b) {
            return b.updatedAt - a.updatedAt;
        }).slice(0, 24);
        return {
            activeChatId: record && record.activeChatId &&
                sessions.some(function (session) {
                    return session.id === record.activeChatId;
                }) ? record.activeChatId : sessions[0].id,
            sessions: sessions
        };
    };

    return {
        CHAT_OPTIONS_VERSION: CHAT_OPTIONS_VERSION,
        CHAT_PROMPT_ODV: CHAT_PROMPT_ODV,
        CHAT_PROMPT_STANDARD: CHAT_PROMPT_STANDARD,
        createChatSession: createChatSession,
        getDefaultChatOptions: getDefaultChatOptions,
        isChatThinkingEnabled: isChatThinkingEnabled,
        normalizeChatMessage: normalizeChatMessage,
        normalizeChatOptions: normalizeChatOptions,
        normalizeChatPromptMode: normalizeChatPromptMode,
        normalizeChatSession: normalizeChatSession,
        normalizeChatSessionsRecord: normalizeChatSessionsRecord,
        shortChatTitle: shortChatTitle
    };
});
