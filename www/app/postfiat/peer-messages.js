// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var isWalletAddress = function (value) {
        return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/u.test(String(value || '').trim());
    };

    var shortText = function (value) {
        var text = String(value || '');
        return text.length > 18 ? text.slice(0, 8) + '...' + text.slice(-6) : text;
    };

    var normalizeMessage = function (message, opts) {
        var now = Number(opts && opts.now) || Date.now();
        return {
            id: String(message && message.id || ('peer-msg-' + now.toString(36))),
            direction: message && message.direction === 'out' ? 'out' : 'in',
            text: String(message && message.text || '').slice(0, 16000),
            createdAt: Number(message && message.createdAt) || now,
            eventId: String(message && message.eventId || ''),
            payment: message && message.payment && typeof(message.payment) === 'object' ?
                message.payment : null
        };
    };

    var getConversationId = function (recipient) {
        var wallet = recipient && recipient.walletAddress;
        var pubkey = recipient && (recipient.publicKeyHex || recipient.pubkey);
        return 'peer-' + String(wallet || pubkey || 'new').replace(/[^a-zA-Z0-9_-]/g, '');
    };

    var normalizeConversation = function (conversation, opts) {
        var now = Number(opts && opts.now) || Date.now();
        var recipient = conversation && conversation.recipient || {};
        var normalized = {
            id: String(conversation && conversation.id || getConversationId(recipient)),
            name: String(conversation && conversation.name ||
                recipient.name || recipient.walletAddress || recipient.publicKeyHex || 'New peer'),
            recipient: {
                walletAddress: recipient.walletAddress || '',
                publicKeyHex: recipient.publicKeyHex || recipient.pubkey || '',
                relays: Array.isArray(recipient.relays) ? recipient.relays : []
            },
            createdAt: Number(conversation && conversation.createdAt) || now,
            updatedAt: Number(conversation && conversation.updatedAt) || now,
            messages: Array.isArray(conversation && conversation.messages) ?
                conversation.messages.map(function (message) {
                    return normalizeMessage(message, opts);
                }).filter(function (message) {
                    return message.text || message.payment;
                }).slice(-250) : []
        };
        if (!normalized.recipient.walletAddress && isWalletAddress(normalized.name)) {
            normalized.recipient.walletAddress = normalized.name;
        }
        return normalized;
    };

    var normalizeStateRecord = function (record, opts) {
        var conversations = Array.isArray(record && record.conversations) ?
            record.conversations.map(function (conversation) {
                return normalizeConversation(conversation, opts);
            }) : [];
        conversations = conversations.sort(function (a, b) {
            return b.updatedAt - a.updatedAt;
        }).slice(0, 80);
        return {
            conversations: conversations,
            activePeerConversationId: record && record.activePeerConversationId &&
                conversations.some(function (conversation) {
                    return conversation.id === record.activePeerConversationId;
                }) ? record.activePeerConversationId :
                (conversations[0] && conversations[0].id || '')
        };
    };

    var upsertConversation = function (conversations, recipient, opts) {
        var normalizedRecipient = {
            walletAddress: recipient && recipient.walletAddress || '',
            publicKeyHex: recipient && (recipient.publicKeyHex || recipient.pubkey) || '',
            relays: Array.isArray(recipient && recipient.relays) ? recipient.relays : []
        };
        var id = getConversationId(normalizedRecipient);
        var list = Array.isArray(conversations) ? conversations : [];
        var conversation = list.filter(function (entry) { return entry.id === id; })[0];
        if (!conversation) {
            conversation = normalizeConversation({
                id: id,
                name: normalizedRecipient.walletAddress || shortText(normalizedRecipient.publicKeyHex),
                recipient: normalizedRecipient,
                messages: []
            }, opts);
            list.unshift(conversation);
        } else {
            conversation.recipient = normalizedRecipient;
            conversation.name = conversation.name || normalizedRecipient.walletAddress ||
                shortText(normalizedRecipient.publicKeyHex);
        }
        return conversation;
    };

    var moveConversationToFront = function (conversations, conversation) {
        var index = conversations.indexOf(conversation);
        if (index > 0) {
            conversations.splice(index, 1);
            conversations.unshift(conversation);
        }
    };

    var appendMessage = function (conversation, message, opts) {
        var existing = {};
        var normalized;
        conversation.messages.forEach(function (entry) {
            existing[entry.eventId || entry.id] = true;
        });
        normalized = normalizeMessage(message, opts);
        if (existing[normalized.eventId || normalized.id]) { return false; }
        conversation.messages.push(normalized);
        conversation.messages = conversation.messages.sort(function (a, b) {
            return a.createdAt - b.createdAt;
        }).slice(-250);
        conversation.updatedAt = Math.max(conversation.updatedAt || 0, normalized.createdAt);
        return true;
    };

    var parseRecipientInput = function (value, relays) {
        var text = String(value || '').trim();
        if (!text) { throw new Error('MISSING_POSTFIAT_RECIPIENT'); }
        if (text[0] === '{') { return JSON.parse(text); }
        return isWalletAddress(text) ?
            { walletAddress: text, relays: relays } :
            { publicKeyHex: text, relays: relays };
    };

    return {
        appendMessage: appendMessage,
        getConversationId: getConversationId,
        isWalletAddress: isWalletAddress,
        moveConversationToFront: moveConversationToFront,
        normalizeConversation: normalizeConversation,
        normalizeMessage: normalizeMessage,
        normalizeStateRecord: normalizeStateRecord,
        parseRecipientInput: parseRecipientInput,
        shortText: shortText,
        upsertConversation: upsertConversation
    };
});
