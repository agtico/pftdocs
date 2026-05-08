// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/* eslint-disable no-use-before-define */

define([
    'jquery',
    '/api/config',
    '/common/hyperscript.js',
    '/common/common-util.js',
    '/common/common-hash.js',
    '/common/common-interface.js',
    '/components/nthen/index.js',
    '/common/sframe-common.js',
    '/customize/messages.js',
    '/common/clipboard.js',
    '/common/postfiat-private-share-contacts.js',
    '/common/common-icons.js',
    '/common/postfiat-wallet-core.bundle.js',
    '/common/postfiat-private-share.bundle.js',
    '/components/marked/marked.min.js',
    '/components/hyper-json/hyperjson.js',
    '/app/postfiat/tasknode-format.js',
    '/app/postfiat/odv.js',
    '/app/postfiat/ai-providers.js',
    '/app/postfiat/runpod-config.js',
    '/app/postfiat/storage.js',
    '/app/postfiat/chat-state.js',
    '/app/postfiat/chat-context.js',
    '/app/postfiat/app-state.js',

    'css!/components/bootstrap/dist/css/bootstrap.min.css',
    'less!/app/app-postfiat.less',
], function ($, ApiConfig, h, Util, Hash, UI, nThen, SFCommon, Messages, Clipboard,
             PostFiatContacts, Icons, PostFiatWalletCoreBundle,
             PostFiatPrivateShareBundle, Marked, Hyperjson, TaskNodeFormat, Odv,
             AiProviders, RunPodConfig, PostFiatStorage, ChatState, ChatContext,
             AppState) {

    var APP = {
        route: AppState.getInitialRoute(window.location.hash),
        docs: [],
        contacts: [],
        inbox: [],
        sent: [],
        wallet: null,
        walletSession: null,
        walletStatus: 'Checking',
        inboxDirectory: null,
        inboxDirectoryState: 'idle',
        inboxPublishedRelays: [],
        inboxPublishFailures: [],
        shareDoc: null,
        shareStatus: '',
        inboxStatus: '',
        settingsStatus: '',
        walletUnlockStatus: '',
        walletUnlocking: false,
        search: '',
        driveLoaded: false,
        inboxLoaded: false,
        inboxLoading: false,
        taskNode: null,
        taskNodeLoaded: false,
        taskNodeLoading: false,
        taskNodePromise: null,
        taskNodeStatus: '',
        aiKeys: {},
        aiKeyStatus: {},
        aiKeyChecking: {},
        aiSettings: null,
        openRouterModels: [],
        openRouterZdrEndpoints: [],
        openRouterModelsLoaded: false,
        openRouterModelsLoading: false,
        openRouterModelsStatus: '',
        runPodKey: '',
        runPodKeyStatus: { state: 'missing', message: 'No RunPod key saved.' },
        runPodKeyChecking: false,
        runPodSettings: null,
        runPodGpuTypes: [],
        runPodGpuTypesLoading: false,
        runPodGpuTypesStatus: '',
        runPodPods: [],
        runPodPodsLoading: false,
        runPodPodReadiness: {},
        runPodAutoLoadAttempted: false,
        runPodStatus: '',
        runPodCreating: false,
        runPodLastResult: null,
        chatSessions: [],
        activeChatId: '',
        chatOptions: null,
        chatOptionsOpen: false,
        chatSending: false,
        chatSendingSessionId: '',
        chatStatus: '',
        chatDraft: '',
        chatDocSearch: '',
        chatDocLoading: {},
        chatDocCache: {},
        chatContextPackRefreshPending: false,
        superthink: null,
        superthinkRunning: false,
        superthinkStatus: '',
        peerConversations: [],
        activePeerConversationId: '',
        peerRecipientInput: '',
        peerRelaysInput: '',
        peerDraft: '',
        peerStatus: '',
        peerLoaded: false,
        peerLoading: false,
        peerSending: false,
        peerPaymentOpen: false,
        peerPaymentAmount: '',
        peerPaymentStatus: '',
        peerBalance: null,
        peerBalanceStatus: '',
    };

    var CHAT_BOTTOM_THRESHOLD = 96;
    var common;
    var sframeChan;
    var readySent;

    var routeLabels = AppState.routeLabels;
    APP.route = AppState.normalizeRoute(APP.route);

    var appTypes = AppState.appTypes;
    var TASKNODE_HISTORY_CACHE_PREFIX = 'PFT_tasknode_history_local_v3:';
    var TASKNODE_HISTORY_CACHE_LEGACY_PREFIXES = [
        'PFT_tasknode_history_session_v3:',
        'PFT_tasknode_history_session_v2:',
        'PFT_tasknode_history_session_v1:'
    ];
    var TASKNODE_HISTORY_CACHE_VERSION = 3;
    var TASKNODE_HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    var TASKNODE_CHAT_WAIT_MS = 9000;
    var AI_KEY_STORAGE_KEY = 'PFT_ai_provider_keys_v1';
    var AI_SETTINGS_STORAGE_KEY = 'PFT_ai_provider_settings_v1';
    var RUNPOD_KEY_STORAGE_KEY = 'PFT_runpod_api_key_v1';
    var RUNPOD_SETTINGS_STORAGE_KEY = 'PFT_runpod_settings_v1';
    var CHAT_STORAGE_KEY = 'PFT_ai_chat_sessions_v1';
    var CHAT_OPTIONS_STORAGE_KEY = 'PFT_ai_chat_options_v1';
    var CHAT_OPTIONS_VERSION = ChatState.CHAT_OPTIONS_VERSION;
    var CHAT_PROMPT_STANDARD = ChatState.CHAT_PROMPT_STANDARD;
    var CHAT_PROMPT_ODV = ChatState.CHAT_PROMPT_ODV;
    var CHAT_MEMORY_PREFIX = 'PFT_ai_chat_memory_v1:';
    var CHAT_MEMORY_VERSION = 1;
    var CHAT_MEMORY_RECENT_RAW_MESSAGE_LIMIT = 10;
    var CHAT_MEMORY_SUMMARY_LIMIT = 150;
    var CHAT_MEMORY_BATCH_SIZE = 12;
    var CHAT_MEMORY_MAX_OUTPUT_TOKENS = 900;
    var OPENROUTER_MEMORY_MODEL = AiProviders.OPENROUTER_MEMORY_MODEL;
    var AMBIENT_MEMORY_MODEL = AiProviders.AMBIENT_MEMORY_MODEL;
    var AMBIENT_MEMORY_FALLBACK_MODEL = AiProviders.AMBIENT_MEMORY_FALLBACK_MODEL;
    var CHAT_CONTEXT_PACK_PREFIX = 'PFT_ai_chat_context_pack_v1:';
    var CHAT_CONTEXT_PACK_VERSION = ChatContext.CHAT_CONTEXT_PACK_VERSION;
    var PEER_MESSAGES_STORAGE_KEY = 'PFT_nostr_peer_messages_v1';
    var OPENROUTER_DEFAULT_MODEL = 'openai/gpt-5-mini';
    var RUNPOD_OLLAMA_DEFAULT_MODEL = RunPodConfig.RUNPOD_OLLAMA_DEFAULT_MODEL;
    var RUNPOD_DEFAULT_MODEL = RunPodConfig.RUNPOD_DEFAULT_MODEL;
    var RUNPOD_CHAT_SYSTEM_CHAR_LIMIT = 24000;
    var RUNPOD_CHAT_MESSAGE_CHAR_LIMIT = 6000;
    var RUNPOD_CHAT_FAST_MAX_TOKENS = 3072;
    var RUNPOD_CHAT_THINKING_MAX_TOKENS = 2048;
    var RUNPOD_READINESS_RECHECK_MS = 30000;
    var SUPERTHINK_ROUNDS = 3;
    var SUPERTHINK_PERSONAS_PER_ROUND = 5;
    var SUPERTHINK_PARALLEL_CALLS = 5;
    var SUPERTHINK_CONTEXT_CHAR_LIMIT = 28000;
    var SUPERTHINK_RESPONSE_CONTEXT_LIMIT = 9000;
    var SUPERTHINK_TASKNODE_WAIT_MS = 30000;
    var SUPERTHINK_SELECTOR_MAX_TOKENS = 1800;
    var SUPERTHINK_DESCRIPTION_MAX_TOKENS = 850;
    var SUPERTHINK_FEEDBACK_MAX_TOKENS = 1200;
    var SUPERTHINK_MANAGER_MAX_TOKENS = 1200;
    var SUPERTHINK_FINAL_MAX_TOKENS = 4500;
    var SUPERTHINK_FALLBACK_PERSONAS = [
        { name: 'Niccolo Machiavelli', era: 'Renaissance Florence', relevance: 'Power, sequencing, patronage, and institutional realism.', angle: 'Political strategy and ruthless prioritization' },
        { name: 'John Boyd', era: '20th century', relevance: 'Decision loops, tempo, and avoiding paralysis under uncertainty.', angle: 'OODA loops and operational speed' },
        { name: 'Claude Shannon', era: '20th century', relevance: 'Signal, compression, uncertainty, and communication systems.', angle: 'Information discipline' },
        { name: 'Grace Hopper', era: '20th century', relevance: 'Shipping usable computing systems and making abstractions operational.', angle: 'Practical systems execution' },
        { name: 'Alan Turing', era: '20th century', relevance: 'Computation, intelligence, cryptography, and formal problem reduction.', angle: 'Reducing impossible problems to solvable mechanisms' },
        { name: 'Ada Lovelace', era: '19th century', relevance: 'Symbolic computation and seeing machine potential before it is obvious.', angle: 'Imaginative technical architecture' },
        { name: 'Andrew Carnegie', era: 'Gilded Age', relevance: 'Capital formation, scale, delegation, and infrastructure buildout.', angle: 'Industrial compounding' },
        { name: 'J. P. Morgan', era: 'Gilded Age', relevance: 'Financial control, consolidation, and crisis judgment.', angle: 'Capital discipline' },
        { name: 'Deng Xiaoping', era: '20th century', relevance: 'Pragmatic reform, sequencing, and results over ideological purity.', angle: 'Experimental statecraft' },
        { name: 'Satoshi Nakamoto', era: '21st century', relevance: 'Protocol design, anonymity, incentives, and trust-minimized systems.', angle: 'Cryptographic institution design' },
        { name: 'Elinor Ostrom', era: '20th century', relevance: 'Commons governance and durable incentive systems.', angle: 'Decentralized coordination' },
        { name: 'Frederick Winslow Taylor', era: 'Industrial era', relevance: 'Workflow measurement, productivity bottlenecks, and process decomposition.', angle: 'Operational throughput' },
        { name: 'Peter Drucker', era: '20th century', relevance: 'Executive focus, management by objective, and knowledge-worker leverage.', angle: 'Founder management discipline' },
        { name: 'Benjamin Franklin', era: '18th century', relevance: 'Public networks, invention, compounding reputation, and pragmatic self-improvement.', angle: 'Networked practical intelligence' },
        { name: 'Marcus Aurelius', era: 'Roman Empire', relevance: 'Self-command, duty, and clarity under pressure.', angle: 'Emotional governance' },
        { name: 'Miyamoto Musashi', era: 'Edo Japan', relevance: 'Single-combat focus, timing, and forcing decisive engagements.', angle: 'Execution under direct confrontation' },
        { name: 'Joseph Schumpeter', era: '20th century', relevance: 'Creative destruction, entrepreneurs, and capital reallocation.', angle: 'Innovation and market upheaval' },
        { name: 'Hyman Minsky', era: '20th century', relevance: 'Financial instability, leverage cycles, and risk hidden by calm periods.', angle: 'Market fragility' },
        { name: 'Richard Feynman', era: '20th century', relevance: 'First-principles explanation, debugging reality, and anti-bullshit rigor.', angle: 'Technical clarity' },
        { name: 'Mary Parker Follett', era: 'Progressive era', relevance: 'Coordination, conflict integration, and productive authority.', angle: 'Human systems management' }
    ];
    var RUNPOD_GPU_PRESETS = RunPodConfig.RUNPOD_GPU_PRESETS;
    var RUNPOD_MODEL_PRESETS = RunPodConfig.RUNPOD_MODEL_PRESETS;
    var OPENROUTER_FALLBACK_MODELS = AiProviders.OPENROUTER_FALLBACK_MODELS;
    var AI_PROVIDERS = AiProviders.AI_PROVIDERS;

    var isWalletAddress = function (value) {
        return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/u.test(String(value || '').trim());
    };

    var shortText = function (value) {
        var text = String(value || '');
        return text.length > 18 ? text.slice(0, 8) + '...' + text.slice(-6) : text;
    };

    var icon = function (name) {
        try {
            return Icons.get(name);
        } catch (err) {
            console.error(err);
            return h('span');
        }
    };

    var button = function (className, label, iconName, attrs) {
        attrs = attrs || {};
        attrs.type = attrs.type || 'button';
        attrs.class = className;
        var children = [];
        if (iconName) { children.push(icon(iconName)); }
        children.push(h('span', label));
        return h('button', attrs, children);
    };

    if (Icons && typeof(Icons.add) === 'function') {
        Icons.add({
            mic: 'mic',
            paperclip: 'paperclip',
            sliders: 'sliders-horizontal',
            sparkles: 'sparkles',
            bot: 'bot',
            user: 'user',
            brain: 'brain',
            send: 'send',
            wallet: 'wallet'
        });
    }

    var setRoute = function (route) {
        APP.route = AppState.normalizeRoute(route);
        window.location.hash = APP.route;
        render();
    };

    var getPostFiatRelays = function () {
        var nostr = (ApiConfig.postFiat && ApiConfig.postFiat.nostr) || {};
        var relays = Array.isArray(nostr.privateRelays) && nostr.privateRelays.length ?
            nostr.privateRelays : nostr.relays;
        return Array.isArray(relays) ? relays : [];
    };

    var getPostFiatNostrOrigin = function () {
        var nostr = (ApiConfig.postFiat && ApiConfig.postFiat.nostr) || {};
        var configured = nostr.origin || ApiConfig.httpUnsafeOrigin;
        var fallback = '';
        try {
            fallback = common && common.getMetadataMgr &&
                common.getMetadataMgr().getPrivateData().origin;
        } catch (err) {}
        return String(configured || fallback || window.location.origin ||
            'postfiat://cryptpad').replace(/\/+$/u, '');
    };

    var parseRelayInput = function (value) {
        return String(value || '').split(/[\s,]+/u)
            .map(function (relay) { return relay.trim(); })
            .filter(Boolean);
    };

    var getPostFiatAiConfig = function () {
        return ApiConfig.postFiat && ApiConfig.postFiat.ai || {};
    };

    var getPostFiatPftlConfig = function () {
        return ApiConfig.postFiat && ApiConfig.postFiat.pftl || {};
    };

    var normalizeBaseUrl = function (value, fallback) {
        var text = String(value || fallback || '').trim().replace(/\/+$/u, '');
        return text || String(fallback || '').replace(/\/+$/u, '');
    };

    var normalizeOpenAiCompatibleBaseUrl = function (value) {
        var text = normalizeBaseUrl(value, '');
        if (!text) { return ''; }
        return /\/v1$/u.test(text) ? text : text + '/v1';
    };

    var getRunPodAiBaseUrl = function (settings) {
        settings = settings || APP.aiSettings || getDefaultAiSettings();
        return normalizeOpenAiCompatibleBaseUrl(settings.runPodBaseUrl || '');
    };

    var getAiProviderBaseUrl = function (provider) {
        var ai = getPostFiatAiConfig();
        if (provider && provider.id === 'runpod') {
            return getRunPodAiBaseUrl();
        }
        return normalizeBaseUrl(ai[provider.baseConfigKey], provider.defaultBaseUrl);
    };

    var getAiProviderCheckUrl = function (provider) {
        var baseUrl = getAiProviderBaseUrl(provider);
        return baseUrl ? baseUrl + provider.checkPath : '';
    };

    var getAiProvider = function (providerId) {
        return AI_PROVIDERS.filter(function (provider) {
            return provider.id === providerId;
        })[0] || null;
    };

    var getDefaultAiSettings = function () {
        return {
            provider: 'ambient',
            openRouterModel: OPENROUTER_DEFAULT_MODEL,
            openRouterZdrOnly: true,
            runPodBaseUrl: '',
            runPodModel: RUNPOD_DEFAULT_MODEL
        };
    };

    var aiJsonStore = PostFiatStorage.createJsonStore();
    var readAiStoredJson = aiJsonStore.readJson;
    var writeAiStoredJson = aiJsonStore.writeJson;

    var redactSecret = function (value) {
        var text = String(value || '');
        if (text.length < 12) { return 'saved key'; }
        return text.slice(0, 4) + '...' + text.slice(-4);
    };

    var getStoredAiProviderKey = function (record, provider) {
        var aliases = [provider.id, provider.baseConfigKey, provider.id + 'ApiKey'];
        var containers = [record, record && record.keys, record && record.providers];
        var direct;
        containers.some(function (container) {
            return aliases.some(function (alias) {
                var value = container && container[alias];
                if (typeof(value) === 'string' && value.trim()) {
                    direct = value.trim();
                    return true;
                }
                if (value && typeof(value.key) === 'string' && value.key.trim()) {
                    direct = value.key.trim();
                    return true;
                }
                return false;
            });
        });
        return direct || '';
    };

    var loadAiSettings = function () {
        var defaults = getDefaultAiSettings();
        var parsed = readAiStoredJson(AI_SETTINGS_STORAGE_KEY);
        APP.aiSettings = defaults;
        if (parsed && getAiProvider(parsed.provider)) {
            APP.aiSettings.provider = parsed.provider;
        }
        if (parsed && typeof(parsed.openRouterModel) === 'string' &&
                parsed.openRouterModel.trim()) {
            APP.aiSettings.openRouterModel = parsed.openRouterModel.trim();
        }
        APP.aiSettings.openRouterZdrOnly = parsed.openRouterZdrOnly !== false;
        if (parsed && typeof(parsed.runPodBaseUrl) === 'string') {
            APP.aiSettings.runPodBaseUrl =
                normalizeOpenAiCompatibleBaseUrl(parsed.runPodBaseUrl);
        }
        if (parsed && typeof(parsed.runPodModel) === 'string' &&
                parsed.runPodModel.trim()) {
            APP.aiSettings.runPodModel = parsed.runPodModel.trim();
        }
    };

    var saveAiSettings = function () {
        if (!APP.aiSettings) { return false; }
        return writeAiStoredJson(AI_SETTINGS_STORAGE_KEY, APP.aiSettings);
    };

    var loadAiKeys = function () {
        var parsed = readAiStoredJson(AI_KEY_STORAGE_KEY);
        APP.aiKeys = {};
        AI_PROVIDERS.forEach(function (provider) {
            var key = getStoredAiProviderKey(parsed, provider);
            if (key) { APP.aiKeys[provider.id] = key; }
        });
        if (Object.keys(APP.aiKeys).length) {
            saveAiKeys();
        }
    };

    var saveAiKeys = function () {
        var record = {};
        AI_PROVIDERS.forEach(function (provider) {
            var key = APP.aiKeys[provider.id];
            if (key) { record[provider.id] = key; }
        });
        return writeAiStoredJson(AI_KEY_STORAGE_KEY, record);
    };

    var getDefaultRunPodSettings = RunPodConfig.getDefaultRunPodSettings;
    var normalizeRunPodSettings = RunPodConfig.normalizeRunPodSettings;

    var loadRunPodSettings = function () {
        APP.runPodSettings = normalizeRunPodSettings(readAiStoredJson(RUNPOD_SETTINGS_STORAGE_KEY));
    };

    var saveRunPodSettings = function () {
        if (!APP.runPodSettings) { return false; }
        return writeAiStoredJson(RUNPOD_SETTINGS_STORAGE_KEY, APP.runPodSettings);
    };

    var loadRunPodKey = function () {
        var parsed = readAiStoredJson(RUNPOD_KEY_STORAGE_KEY);
        APP.runPodKey = String(parsed && parsed.key || parsed && parsed.runpod || '').trim();
        APP.runPodKeyStatus = APP.runPodKey ? {
            state: 'saved',
            message: 'RunPod key saved locally.'
        } : {
            state: 'missing',
            message: 'No RunPod key saved.'
        };
    };

    var saveRunPodKeyValue = function (key) {
        APP.runPodKey = String(key || '').trim();
        return writeAiStoredJson(RUNPOD_KEY_STORAGE_KEY, APP.runPodKey ? { key: APP.runPodKey } : {});
    };

    var getDefaultChatOptions = ChatState.getDefaultChatOptions;
    var normalizeChatPromptMode = ChatState.normalizeChatPromptMode;

    var isChatThinkingEnabled = function (options) {
        options = options || APP.chatOptions || getDefaultChatOptions();
        return ChatState.isChatThinkingEnabled(options);
    };

    var shortChatTitle = ChatState.shortChatTitle;
    var createChatSession = ChatState.createChatSession;
    var normalizeChatSession = ChatState.normalizeChatSession;

    var loadChatState = function () {
        var options = readAiStoredJson(CHAT_OPTIONS_STORAGE_KEY);
        var sessionsRecord = readAiStoredJson(CHAT_STORAGE_KEY);
        var normalized = ChatState.normalizeChatSessionsRecord(sessionsRecord);
        APP.chatOptions = ChatState.normalizeChatOptions(options);
        APP.chatSessions = normalized.sessions;
        APP.activeChatId = normalized.activeChatId;
    };

    var saveChatOptions = function () {
        var options = Object.assign({}, getDefaultChatOptions(), APP.chatOptions || {});
        options.version = CHAT_OPTIONS_VERSION;
        return writeAiStoredJson(CHAT_OPTIONS_STORAGE_KEY, options);
    };

    var saveChatState = function () {
        return writeAiStoredJson(CHAT_STORAGE_KEY, {
            activeChatId: APP.activeChatId,
            sessions: (APP.chatSessions || []).map(normalizeChatSession).slice(0, 24)
        });
    };

    var getActiveChatSession = function () {
        var session = (APP.chatSessions || []).filter(function (entry) {
            return entry.id === APP.activeChatId;
        })[0];
        if (session) { return session; }
        session = createChatSession();
        APP.chatSessions.unshift(session);
        APP.activeChatId = session.id;
        saveChatState();
        return session;
    };

    var getChatSessionById = function (sessionId) {
        return (APP.chatSessions || []).filter(function (entry) {
            return entry.id === sessionId;
        })[0] || null;
    };

    var setActiveChatSession = function (sessionId) {
        if (!APP.chatSessions.some(function (session) {
            return session.id === sessionId;
        })) { return; }
        APP.activeChatId = sessionId;
        APP.chatOptionsOpen = false;
        saveChatState();
        render();
    };

    var startNewChatSession = function () {
        var session = createChatSession();
        APP.chatSessions.unshift(session);
        APP.activeChatId = session.id;
        APP.chatDraft = '';
        APP.chatStatus = '';
        APP.chatOptionsOpen = false;
        saveChatState();
        render();
    };

    var deleteChatSession = function (sessionId) {
        var session = (APP.chatSessions || []).filter(function (entry) {
            return entry.id === sessionId;
        })[0];
        if (!session) { return; }
        if (APP.chatSending && APP.chatSendingSessionId === sessionId) {
            UI.warn('Wait for the current response before deleting this chat.');
            return;
        }
        if ((session.messages || []).length && !window.confirm(
                'Delete "' + (session.title || 'New chat') + '"?')) {
            return;
        }
        APP.chatSessions = APP.chatSessions.filter(function (entry) {
            return entry.id !== sessionId;
        });
        if (!APP.chatSessions.length) {
            APP.chatSessions = [createChatSession()];
        }
        if (APP.activeChatId === sessionId) {
            APP.activeChatId = APP.chatSessions[0].id;
            APP.chatDraft = '';
            APP.chatStatus = '';
            APP.chatOptionsOpen = false;
        }
        saveChatState();
        render();
    };

    var updateChatSessionOrder = function (session) {
        var index = APP.chatSessions.indexOf(session);
        if (index > 0) {
            APP.chatSessions.splice(index, 1);
            APP.chatSessions.unshift(session);
        }
    };

    var appendChatMessageToSession = function (session, role, text) {
        var now = Date.now();
        var message = {
            id: 'chat-msg-' + now.toString(36) + '-' +
                Math.random().toString(36).slice(2, 8),
            role: role,
            text: String(text || ''),
            createdAt: now
        };
        session.messages.push(message);
        session.messages = session.messages.slice(-40);
        session.updatedAt = now;
        if (role === 'user') {
            session.title = shortChatTitle(text);
        }
        updateChatSessionOrder(session);
        saveChatState();
        return message;
    };

    var appendChatMessage = function (role, text) {
        return appendChatMessageToSession(getActiveChatSession(), role, text);
    };

    var getChatMemoryKey = function (sessionId) {
        return CHAT_MEMORY_PREFIX + String(sessionId || 'unknown');
    };

    var normalizeChatMemorySummary = function (item, validIds) {
        var messageId = String(item && (item.messageId || item.id) || '');
        var role = String(item && item.role || '').toLowerCase();
        var summary = compactChatText(item && item.summary || '');
        if (!messageId || !validIds[messageId] || !summary) { return null; }
        if (['user', 'assistant'].indexOf(role) === -1) { role = 'user'; }
        summary = summary
            .replace(/\b(Bearer|API key|api key|seed phrase|mnemonic|private key)\s*[:=]?\s+\S+/giu,
                '$1 [redacted]')
            .slice(0, 900);
        return {
            messageId: messageId,
            role: role,
            summary: summary,
            createdAt: Number(item && item.createdAt) || 0,
            summarizedAt: Number(item && item.summarizedAt) || Date.now()
        };
    };

    var readChatMemoryRecord = function (session) {
        var record = readAiStoredJson(getChatMemoryKey(session && session.id));
        var validIds = {};
        var summaries;
        (session && session.messages || []).forEach(function (message) {
            if (message && message.id) { validIds[message.id] = true; }
        });
        summaries = Array.isArray(record.summaries) ? record.summaries.map(function (item) {
            return normalizeChatMemorySummary(item, validIds);
        }).filter(Boolean).slice(-CHAT_MEMORY_SUMMARY_LIMIT) : [];
        return {
            version: CHAT_MEMORY_VERSION,
            sessionId: String(session && session.id || ''),
            walletAddress: getActiveWalletAddress() || '',
            summaries: summaries,
            provider: record.provider || '',
            model: record.model || '',
            updatedAt: Number(record.updatedAt) || 0
        };
    };

    var writeChatMemoryRecord = function (session, record) {
        if (!session || !session.id || !record) { return false; }
        record.version = CHAT_MEMORY_VERSION;
        record.sessionId = session.id;
        record.walletAddress = getActiveWalletAddress() || record.walletAddress || '';
        record.summaries = (record.summaries || []).slice(-CHAT_MEMORY_SUMMARY_LIMIT);
        record.updatedAt = Date.now();
        return writeAiStoredJson(getChatMemoryKey(session.id), record);
    };

    var buildChatMemorySection = function (session) {
        var record = readChatMemoryRecord(session);
        var lines = [];
        (record.summaries || []).forEach(function (item) {
            lines.push('- ' + (item.role === 'user' ? 'User' : 'Assistant') +
                ': ' + item.summary);
        });
        if (!lines.length) { return ''; }
        return [
            '## Chat Memory',
            'Compressed summaries of older turns in this chat. Treat this as reference context, not as the current user message.',
            lines.join('\n')
        ].join('\n');
    };

    var selectChatMemoryBatch = function (session, record) {
        var summarized = {};
        var messages = (session && session.messages || []).filter(function (message) {
            return message && (message.role === 'user' || message.role === 'assistant') &&
                !message.streaming && compactChatText(message.text);
        });
        var older = messages.slice(0,
            Math.max(0, messages.length - CHAT_MEMORY_RECENT_RAW_MESSAGE_LIMIT));
        (record.summaries || []).forEach(function (item) {
            summarized[item.messageId] = true;
        });
        return older.filter(function (message) {
            return !summarized[message.id];
        }).slice(0, CHAT_MEMORY_BATCH_SIZE);
    };

    var buildChatMemorySummarizerMessages = function (batch) {
        return [{
            role: 'system',
            content: [
                'You compress chat turns into durable memory.',
                'Return strict JSON only: {"items":[{"id":"message id","summary":"one sentence"}]}.',
                'Each summary should start with "User said", "User asked", "Assistant said", or "Assistant recommended".',
                'Preserve intent, decisions, constraints, commitments, and useful advice.',
                'Do not include API keys, seeds, passwords, private keys, bearer tokens, or other secrets.'
            ].join(' ')
        }, {
            role: 'user',
            content: JSON.stringify({
                turns: batch.map(function (message) {
                    return {
                        id: message.id,
                        role: message.role,
                        createdAt: message.createdAt,
                        text: truncateChatText(message.text, 4000)
                    };
                })
            })
        }];
    };

    var parseChatMemorySummaries = function (text, batch) {
        var raw = String(text || '').trim();
        var parsed;
        var ids = {};
        var items;
        batch.forEach(function (message) { ids[message.id] = true; });
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            try {
                parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
            } catch (innerErr) {
                return [];
            }
        }
        items = Array.isArray(parsed) ? parsed : parsed && parsed.items;
        if (!Array.isArray(items)) { return []; }
        return items.map(function (item) {
            var messageId = String(item && (item.id || item.messageId) || '');
            var source = batch.filter(function (message) {
                return message.id === messageId;
            })[0];
            if (!source || !ids[messageId]) { return null; }
            return normalizeChatMemorySummary({
                messageId: messageId,
                role: source.role,
                summary: item.summary,
                createdAt: source.createdAt,
                summarizedAt: Date.now()
            }, ids);
        }).filter(Boolean);
    };

    var normalizePeerMessage = function (message) {
        return {
            id: String(message && message.id || ('peer-msg-' + Date.now().toString(36))),
            direction: message && message.direction === 'out' ? 'out' : 'in',
            text: String(message && message.text || '').slice(0, 16000),
            createdAt: Number(message && message.createdAt) || Date.now(),
            eventId: String(message && message.eventId || ''),
            payment: message && message.payment && typeof(message.payment) === 'object' ?
                message.payment : null
        };
    };

    var getPeerConversationId = function (recipient) {
        var wallet = recipient && recipient.walletAddress;
        var pubkey = recipient && (recipient.publicKeyHex || recipient.pubkey);
        return 'peer-' + String(wallet || pubkey || 'new').replace(/[^a-zA-Z0-9_-]/g, '');
    };

    var normalizePeerConversation = function (conversation) {
        var now = Date.now();
        var recipient = conversation && conversation.recipient || {};
        var normalized = {
            id: String(conversation && conversation.id || getPeerConversationId(recipient)),
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
                conversation.messages.map(normalizePeerMessage).filter(function (message) {
                    return message.text || message.payment;
                }).slice(-250) : []
        };
        if (!normalized.recipient.walletAddress && isWalletAddress(normalized.name)) {
            normalized.recipient.walletAddress = normalized.name;
        }
        return normalized;
    };

    var loadPeerMessageState = function () {
        var record = readAiStoredJson(PEER_MESSAGES_STORAGE_KEY);
        var conversations = Array.isArray(record.conversations) ?
            record.conversations.map(normalizePeerConversation) : [];
        APP.peerConversations = conversations.sort(function (a, b) {
            return b.updatedAt - a.updatedAt;
        }).slice(0, 80);
        APP.activePeerConversationId = record.activePeerConversationId &&
            APP.peerConversations.some(function (conversation) {
                return conversation.id === record.activePeerConversationId;
            }) ? record.activePeerConversationId :
            (APP.peerConversations[0] && APP.peerConversations[0].id || '');
    };

    var savePeerMessageState = function () {
        return writeAiStoredJson(PEER_MESSAGES_STORAGE_KEY, {
            activePeerConversationId: APP.activePeerConversationId,
            conversations: (APP.peerConversations || [])
                .map(normalizePeerConversation).slice(0, 80)
        });
    };

    var getActivePeerConversation = function () {
        return (APP.peerConversations || []).filter(function (conversation) {
            return conversation.id === APP.activePeerConversationId;
        })[0] || null;
    };

    var upsertPeerConversation = function (recipient) {
        var normalizedRecipient = {
            walletAddress: recipient && recipient.walletAddress || '',
            publicKeyHex: recipient && (recipient.publicKeyHex || recipient.pubkey) || '',
            relays: Array.isArray(recipient && recipient.relays) ? recipient.relays : []
        };
        var id = getPeerConversationId(normalizedRecipient);
        var conversation = (APP.peerConversations || []).filter(function (entry) {
            return entry.id === id;
        })[0];
        if (!conversation) {
            conversation = normalizePeerConversation({
                id: id,
                name: normalizedRecipient.walletAddress || shortText(normalizedRecipient.publicKeyHex),
                recipient: normalizedRecipient,
                messages: []
            });
            APP.peerConversations.unshift(conversation);
        } else {
            conversation.recipient = normalizedRecipient;
            conversation.name = conversation.name || normalizedRecipient.walletAddress ||
                shortText(normalizedRecipient.publicKeyHex);
        }
        APP.activePeerConversationId = conversation.id;
        return conversation;
    };

    var updatePeerConversationOrder = function (conversation) {
        var index = APP.peerConversations.indexOf(conversation);
        if (index > 0) {
            APP.peerConversations.splice(index, 1);
            APP.peerConversations.unshift(conversation);
        }
    };

    var setActivePeerConversation = function (conversationId) {
        if (!APP.peerConversations.some(function (conversation) {
                return conversation.id === conversationId;
            })) { return; }
        APP.activePeerConversationId = conversationId;
        APP.peerRecipientInput = '';
        APP.peerPaymentOpen = false;
        savePeerMessageState();
        render();
    };

    var startPeerConversation = function () {
        APP.activePeerConversationId = '';
        APP.peerRecipientInput = '';
        APP.peerDraft = '';
        APP.peerPaymentOpen = false;
        APP.peerStatus = 'Enter a wallet address or Nostr public key.';
        render();
    };

    var deletePeerConversation = function (conversationId) {
        var conversation = APP.peerConversations.filter(function (entry) {
            return entry.id === conversationId;
        })[0];
        if (!conversation) { return; }
        if ((conversation.messages || []).length && !window.confirm(
                'Delete conversation with ' + (conversation.name || 'peer') + '?')) {
            return;
        }
        APP.peerConversations = APP.peerConversations.filter(function (entry) {
            return entry.id !== conversationId;
        });
        if (APP.activePeerConversationId === conversationId) {
            APP.activePeerConversationId = APP.peerConversations[0] &&
                APP.peerConversations[0].id || '';
        }
        savePeerMessageState();
        render();
    };

    var appendPeerMessage = function (conversation, message) {
        var existing = {};
        conversation.messages.forEach(function (entry) {
            existing[entry.eventId || entry.id] = true;
        });
        var normalized = normalizePeerMessage(message);
        if (existing[normalized.eventId || normalized.id]) { return false; }
        conversation.messages.push(normalized);
        conversation.messages = conversation.messages.sort(function (a, b) {
            return a.createdAt - b.createdAt;
        }).slice(-250);
        conversation.updatedAt = Math.max(conversation.updatedAt || 0, normalized.createdAt);
        updatePeerConversationOrder(conversation);
        return true;
    };

    var parsePeerRecipientInput = function (value, relays) {
        var text = String(value || '').trim();
        if (!text) { throw new Error('MISSING_POSTFIAT_RECIPIENT'); }
        if (text[0] === '{') {
            return JSON.parse(text);
        }
        return isWalletAddress(text) ?
            { walletAddress: text, relays: relays } :
            { publicKeyHex: text, relays: relays };
    };

    var getPeerInputWalletAddress = function () {
        var text = String(APP.peerRecipientInput || '').trim();
        return isWalletAddress(text) ? text : '';
    };

    var getPeerPaymentDestination = function (conversation) {
        return conversation && conversation.recipient && conversation.recipient.walletAddress ||
            getPeerInputWalletAddress();
    };

    var mergeFetchedPeerMessages = function (inbox) {
        var ownWallet = inbox && inbox.recipient && inbox.recipient.walletAddress || '';
        var count = 0;
        (inbox.messages || []).forEach(function (message) {
            var payload = message.payload || {};
            var peer = {
                walletAddress: payload.fromWallet && payload.fromWallet !== ownWallet ?
                    payload.fromWallet : payload.toWallet,
                publicKeyHex: message.senderPublicKeyHex || '',
                relays: getPostFiatRelays()
            };
            var conversation = upsertPeerConversation(peer);
            if (appendPeerMessage(conversation, {
                    id: message.rumor && message.rumor.id || message.giftWrap && message.giftWrap.id,
                    eventId: message.giftWrap && message.giftWrap.id || '',
                    direction: 'in',
                    text: payload.text || '',
                    payment: payload.payment || null,
                    createdAt: Date.parse(payload.createdAt || '') || Date.now()
                })) {
                count += 1;
            }
        });
        if (count) { savePeerMessageState(); }
        return count;
    };

    var setAiKeyStatus = function (providerId, state, message) {
        APP.aiKeyStatus[providerId] = {
            state: state,
            message: message,
            checkedAt: Date.now()
        };
    };

    var getAiKeyStatus = function (providerId) {
        var key = APP.aiKeys[providerId];
        if (providerId === 'runpod' && APP.aiSettings && APP.aiSettings.runPodBaseUrl) {
            return APP.aiKeyStatus[providerId] || {
                state: 'saved',
                message: 'RunPod endpoint saved. Run Check to verify.'
            };
        }
        return APP.aiKeyStatus[providerId] || {
            state: key ? 'saved' : 'missing',
            message: key ? 'Saved locally. Run Check to verify.' : 'No key saved.'
        };
    };

    var setAiProvider = function (providerId) {
        if (!getAiProvider(providerId)) { return; }
        APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
        APP.aiSettings.provider = providerId;
        saveAiSettings();
        if (providerId === 'openrouter') {
            loadOpenRouterModels();
        }
        if (providerId === 'runpod') {
            APP.runPodAutoLoadAttempted = false;
            tryAutoPopulateRunPodAiProvider(false);
        }
        render();
    };

    var setOpenRouterModel = function (modelId) {
        modelId = String(modelId || '').trim();
        if (!modelId) { return; }
        APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
        APP.aiSettings.openRouterModel = modelId;
        APP.aiSettings.openRouterZdrOnly = true;
        if (!saveAiSettings()) {
            setAiKeyStatus('openrouter', 'error', 'Browser storage is unavailable.');
        }
        render();
    };

    var getRunPodAiModel = function () {
        var settings = APP.aiSettings || getDefaultAiSettings();
        return String(settings.runPodModel || RUNPOD_DEFAULT_MODEL).trim() || RUNPOD_DEFAULT_MODEL;
    };

    var getRunPodPodModelId = function (pod) {
        var env = pod && pod.env || {};
        if (/ollama/ui.test(String(pod && (pod.name || pod.imageName || pod.image) || ''))) {
            return String(env.PFT_MODEL_ID || env.OLLAMA_MODEL ||
                RUNPOD_OLLAMA_DEFAULT_MODEL).trim() || RUNPOD_OLLAMA_DEFAULT_MODEL;
        }
        return String(env.PFT_MODEL_ID || env.AAO_MODEL_ID ||
            APP.runPodSettings && APP.runPodSettings.modelId ||
            RUNPOD_DEFAULT_MODEL).trim() || RUNPOD_DEFAULT_MODEL;
    };

    var isRunPodPodRunning = function (pod) {
        var state = String(pod && (pod.desiredStatus || pod.status || '')).toUpperCase();
        return Boolean(pod && pod.id) && state !== 'EXITED' && state !== 'TERMINATED';
    };

    var getRunPodPodSortTime = function (pod) {
        return Date.parse(pod && (pod.lastStartedAt || pod.createdAt) || '') || 0;
    };

    var getLatestRunningRunPodPod = function () {
        return (APP.runPodPods || []).filter(isRunPodPodRunning).sort(function (a, b) {
            return getRunPodPodSortTime(b) - getRunPodPodSortTime(a);
        })[0] || null;
    };

    var getLatestRunningRunPodOllamaPod = function () {
        return (APP.runPodPods || []).filter(function (pod) {
            return isRunPodPodRunning(pod) &&
                /ollama/ui.test(String(pod && (pod.name || pod.imageName || pod.image) || ''));
        }).sort(function (a, b) {
            return getRunPodPodSortTime(b) - getRunPodPodSortTime(a);
        })[0] || null;
    };

    var getRunPodPodAiBaseUrl = function (pod) {
        var podId = String(pod && pod.id || '').trim();
        return podId ? getRunPodProxyUrl(podId, 8000) + '/v1' : '';
    };

    var parseRunPodModelIds = function (data) {
        var records = Array.isArray(data && data.data) ? data.data :
            (Array.isArray(data && data.models) ? data.models :
                (Array.isArray(data) ? data : []));
        return records.map(function (record) {
            return String(record && (record.id || record.name || record.model) || '').trim();
        }).filter(Boolean);
    };

    var checkRunPodAiEndpointReady = function (baseUrl, modelId) {
        baseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
        modelId = String(modelId || RUNPOD_DEFAULT_MODEL).trim();
        if (!baseUrl) {
            return Promise.resolve({ ready: false, modelIds: [] });
        }
        return runPodFetchJson('/openai/models?baseUrl=' + encodeURIComponent(baseUrl), {
            key: '',
            skipDefaultKey: true
        }).then(function (data) {
            var modelIds = parseRunPodModelIds(data);
            return {
                ready: modelIds.indexOf(modelId) !== -1,
                modelIds: modelIds
            };
        });
    };

    var getRunPodPodReadiness = function (pod) {
        var podId = String(pod && pod.id || '').trim();
        if (!podId) {
            return { state: 'unknown', message: 'No pod id.' };
        }
        if (!isRunPodPodRunning(pod)) {
            return { state: 'stopped', message: 'Stopped. Start the pod before use.' };
        }
        return APP.runPodPodReadiness[podId] || {
            state: 'unknown',
            message: 'Not checked yet.'
        };
    };

    var isRunPodPodReady = function (pod) {
        return getRunPodPodReadiness(pod).state === 'ready';
    };

    var getLatestReadyRunPodPod = function () {
        return (APP.runPodPods || []).filter(function (pod) {
            return isRunPodPodRunning(pod) && isRunPodPodReady(pod);
        }).sort(function (a, b) {
            return getRunPodPodSortTime(b) - getRunPodPodSortTime(a);
        })[0] || null;
    };

    var getLatestReadyRunPodOllamaPod = function () {
        return (APP.runPodPods || []).filter(function (pod) {
            return isRunPodPodRunning(pod) && isRunPodPodReady(pod) &&
                /ollama/ui.test(String(pod && (pod.name || pod.imageName || pod.image) || ''));
        }).sort(function (a, b) {
            return getRunPodPodSortTime(b) - getRunPodPodSortTime(a);
        })[0] || null;
    };

    var setRunPodPodReadiness = function (podId, state, message, modelIds) {
        if (!podId) { return; }
        APP.runPodPodReadiness[podId] = {
            state: state,
            message: message,
            modelIds: modelIds || [],
            checkedAt: Date.now()
        };
    };

    var checkRunPodPodReadiness = function (pod, silent) {
        var podId = String(pod && pod.id || '').trim();
        var modelId = getRunPodPodModelId(pod);
        var baseUrl = getRunPodPodAiBaseUrl(pod);
        var current;
        if (!podId || !baseUrl) { return Promise.resolve(false); }
        if (!isRunPodPodRunning(pod)) {
            setRunPodPodReadiness(podId, 'stopped', 'Stopped. Start the pod before use.');
            if (!silent) { render(); }
            return Promise.resolve(false);
        }
        current = APP.runPodPodReadiness[podId];
        if (current && current.state === 'checking') {
            return Promise.resolve(false);
        }
        setRunPodPodReadiness(podId, 'checking', 'Checking model server...');
        if (!silent) { render(); }
        return runPodFetchJson('/openai/models?baseUrl=' + encodeURIComponent(baseUrl), {
            key: '',
            skipDefaultKey: true
        }).then(function (data) {
            var modelIds = parseRunPodModelIds(data);
            var ready = modelIds.indexOf(modelId) !== -1;
            if (ready) {
                setRunPodPodReadiness(podId, 'ready', 'Ready: ' + modelId, modelIds);
                if (!getRunPodAiBaseUrl() && APP.aiSettings &&
                        APP.aiSettings.provider === 'runpod') {
                    tryAutoPopulateRunPodAiProvider(false);
                }
            } else if (modelIds.length) {
                setRunPodPodReadiness(podId, 'booting',
                    'Server up, waiting for ' + modelId + '.', modelIds);
            } else {
                setRunPodPodReadiness(podId, 'booting',
                    'Ollama is up; model pull/load is still running.', modelIds);
            }
            render();
            return ready;
        }).catch(function (err) {
            console.error(err);
            setRunPodPodReadiness(podId, 'booting',
                err.message || 'Model server is not ready yet.');
            render();
            return false;
        });
    };

    var scheduleRunPodReadinessChecks = function () {
        setTimeout(function () {
            (APP.runPodPods || []).filter(isRunPodPodRunning).slice(0, 6).forEach(function (pod) {
                var readiness = getRunPodPodReadiness(pod);
                var stale = !readiness.checkedAt ||
                    (Date.now() - readiness.checkedAt > RUNPOD_READINESS_RECHECK_MS);
                if (readiness.state === 'ready' || readiness.state === 'checking' || !stale) {
                    return;
                }
                checkRunPodPodReadiness(pod, true);
            });
        }, 0);
    };

    var tryAutoPopulateRunPodAiProvider = function (rerender) {
        var pod;
        var currentModel = getRunPodAiModel();
        var replaceSglangSelection = APP.aiSettings && APP.aiSettings.provider === 'runpod' &&
            /^Qwen\//u.test(currentModel);
        var baseUrl = '';
        var modelId = '';
        if (!APP.aiSettings || APP.aiSettings.provider !== 'runpod' ||
                (APP.aiSettings.runPodBaseUrl && !replaceSglangSelection)) {
            return false;
        }
        if (APP.runPodLastResult && APP.runPodLastResult.baseUrl &&
                APP.runPodLastResult.pod && isRunPodPodReady(APP.runPodLastResult.pod)) {
            baseUrl = APP.runPodLastResult.baseUrl + '/v1';
            modelId = APP.runPodLastResult.request && APP.runPodLastResult.request.env &&
                APP.runPodLastResult.request.env.PFT_MODEL_ID || '';
        }
        if (!baseUrl) {
            pod = getLatestReadyRunPodOllamaPod() || getLatestReadyRunPodPod();
            baseUrl = getRunPodPodAiBaseUrl(pod);
            modelId = getRunPodPodModelId(pod);
        }
        if (!baseUrl) { return false; }
        APP.aiSettings.runPodBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
        APP.aiSettings.runPodModel = String(modelId || getRunPodAiModel()).trim() ||
            RUNPOD_DEFAULT_MODEL;
        saveAiSettings();
        setAiKeyStatus('runpod', 'saved', 'Auto-selected ready RunPod pod for AI chat.');
        if (rerender) { render(); }
        return true;
    };

    var selectReadyRunPodPodForAi = function (pod, statusMessage) {
        var baseUrl = getRunPodPodAiBaseUrl(pod);
        if (!baseUrl) { return false; }
        APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
        APP.aiSettings.provider = 'runpod';
        APP.aiSettings.runPodBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
        APP.aiSettings.runPodModel = getRunPodPodModelId(pod);
        saveAiSettings();
        setAiKeyStatus('runpod', 'ok',
            statusMessage || 'Auto-selected ready RunPod pod for AI chat.');
        return true;
    };

    var findAndSelectReadyRunPodPod = function (statusMessage) {
        if (!APP.runPodKey) { return Promise.resolve(false); }
        return runPodFetchJson('/pods', {
            key: APP.runPodKey
        }).then(function (pods) {
            var candidates;
            APP.runPodPods = Array.isArray(pods) ? pods : [];
            candidates = (APP.runPodPods || []).filter(isRunPodPodRunning)
                .sort(function (a, b) {
                    var aOllama = /ollama/ui.test(String(a && (a.name || a.imageName || a.image) || '')) ? 1 : 0;
                    var bOllama = /ollama/ui.test(String(b && (b.name || b.imageName || b.image) || '')) ? 1 : 0;
                    if (aOllama !== bOllama) { return bOllama - aOllama; }
                    return getRunPodPodSortTime(b) - getRunPodPodSortTime(a);
                }).slice(0, 6);
            return candidates.reduce(function (chain, pod) {
                return chain.then(function (selected) {
                    if (selected) { return selected; }
                    if (isRunPodPodReady(pod)) { return pod; }
                    return checkRunPodPodReadiness(pod, true).then(function (ready) {
                        return ready ? pod : null;
                    });
                });
            }, Promise.resolve(null)).then(function (pod) {
                if (!pod) { return false; }
                return selectReadyRunPodPodForAi(pod, statusMessage);
            });
        });
    };

    var ensureReadyRunPodAiEndpoint = function (statusMessage) {
        var baseUrl = getRunPodAiBaseUrl();
        var modelId = getRunPodAiModel();
        var checkCurrent = baseUrl ? checkRunPodAiEndpointReady(baseUrl, modelId)
            .then(function (result) {
                if (result.ready) {
                    setAiKeyStatus('runpod', 'ok', 'RunPod endpoint is ready: ' + modelId + '.');
                    return true;
                }
                setAiKeyStatus('runpod', 'warn',
                    result.modelIds.length ? 'Saved RunPod endpoint is up but missing ' + modelId + '.' :
                        'Saved RunPod endpoint is up but no models are visible yet.');
                return false;
            }).catch(function (err) {
                setAiKeyStatus('runpod', 'warn',
                    err.message || 'Saved RunPod endpoint is not ready.');
                return false;
            }) : Promise.resolve(false);
        return checkCurrent.then(function (ready) {
            if (ready) { return true; }
            return findAndSelectReadyRunPodPod(statusMessage);
        }).then(function (selected) {
            if (selected) { return true; }
            if (!baseUrl && !APP.runPodKey) { return false; }
            setAiKeyStatus('runpod', 'warn',
                'No ready RunPod model found. Start a pod, wait for qwen3.6:27b to appear, then run again.');
            return false;
        }).catch(function (err) {
            console.error(err);
            setAiKeyStatus('runpod', 'error', err.message || 'Unable to resolve RunPod endpoint.');
            return false;
        });
    };

    var setRunPodAiProvider = function (baseUrl, modelId) {
        var normalizedBase = normalizeOpenAiCompatibleBaseUrl(baseUrl);
        if (!normalizedBase) {
            setAiKeyStatus('runpod', 'warn', 'Paste a RunPod OpenAI API base URL first.');
            render();
            return;
        }
        APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
        APP.aiSettings.provider = 'runpod';
        APP.aiSettings.runPodBaseUrl = normalizedBase;
        APP.aiSettings.runPodModel = String(modelId || getRunPodAiModel()).trim() || RUNPOD_DEFAULT_MODEL;
        if (!saveAiSettings()) {
            setAiKeyStatus('runpod', 'error', 'Browser storage is unavailable.');
            render();
            return;
        }
        setAiKeyStatus('runpod', 'saved', 'RunPod endpoint selected for AI chat.');
        render();
    };

    var saveAiProviderKey = function (providerId) {
        var provider = getAiProvider(providerId);
        var key = $('#pft-ai-key-' + providerId).val();
        if (!provider) { return; }
        key = String(key || '').trim();
        if (!key) {
            setAiKeyStatus(providerId, 'warn', 'Paste a key before saving.');
            render();
            return;
        }
        APP.aiKeys[providerId] = key;
        if (!saveAiKeys()) {
            setAiKeyStatus(providerId, 'error', 'Browser storage is unavailable.');
            render();
            return;
        }
        setAiKeyStatus(providerId, 'saved', provider.label + ' key saved locally.');
        render();
    };

    var removeAiProviderKey = function (providerId) {
        var provider = getAiProvider(providerId);
        if (!provider) { return; }
        delete APP.aiKeys[providerId];
        delete APP.aiKeyChecking[providerId];
        saveAiKeys();
        setAiKeyStatus(providerId, 'missing', provider.label + ' key removed.');
        render();
    };

    var summarizeAiCheck = function (provider, data) {
        var models;
        var count;
        var keyData;
        if (provider.id === 'ambient') {
            models = Array.isArray(data && data.data) ? data.data :
                (Array.isArray(data && data.models) ? data.models :
                    (Array.isArray(data) ? data : []));
            count = models.length;
            return count ? 'Verified. ' + count + ' model(s) visible.' :
                'Verified. Models endpoint accepted the key.';
        }
        if (provider.id === 'runpod') {
            models = Array.isArray(data && data.data) ? data.data :
                (Array.isArray(data && data.models) ? data.models :
                    (Array.isArray(data) ? data : []));
            count = models.length;
            return count ? 'Verified. ' + count + ' RunPod model(s) visible.' :
                'Verified. RunPod endpoint accepted the request.';
        }
        keyData = data && data.data || {};
        if (keyData.disabled) { return 'Key is valid but disabled.'; }
        if (typeof(keyData.limit_remaining) === 'number') {
            return 'Verified. Remaining limit: ' + keyData.limit_remaining + '.';
        }
        return 'Verified. Key endpoint accepted the key.';
    };

    var checkAiProviderKey = function (providerId) {
        var provider = getAiProvider(providerId);
        var key = String($('#pft-ai-key-' + providerId).val() ||
            APP.aiKeys[providerId] || '').trim();
        if (!provider) { return; }
        if (!key && provider.requiresKey !== false) {
            setAiKeyStatus(providerId, 'warn', 'Paste or save a key before checking.');
            render();
            return;
        }
        if (typeof(window.fetch) !== 'function') {
            setAiKeyStatus(providerId, 'error', 'This browser cannot run fetch checks.');
            render();
            return;
        }
        APP.aiKeyChecking[providerId] = true;
        setAiKeyStatus(providerId, 'checking', 'Checking ' + provider.label + '...');
        render();
        var checkUrl = getAiProviderCheckUrl(provider);
        if (!checkUrl) {
            delete APP.aiKeyChecking[providerId];
            setAiKeyStatus(providerId, 'warn', 'Paste a ' + provider.label + ' endpoint URL before checking.');
            render();
            return;
        }
        if (provider.id === 'runpod') {
            runPodFetchJson('/openai/models?baseUrl=' + encodeURIComponent(getRunPodAiBaseUrl()), {
                key: key,
                skipDefaultKey: true
            }).then(function (data) {
                delete APP.aiKeyChecking[providerId];
                setAiKeyStatus(providerId, 'ok', summarizeAiCheck(provider, data));
                render();
            }).catch(function (err) {
                console.error(err);
                delete APP.aiKeyChecking[providerId];
                setAiKeyStatus(providerId, 'error', err.message || 'Check failed.');
                render();
            });
            return;
        }
        window.fetch(checkUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: Object.assign({
                Accept: 'application/json'
            }, key ? { Authorization: 'Bearer ' + key } : {})
        }).then(function (response) {
            if (!response.ok) {
                throw new Error(provider.label + ' returned HTTP ' + response.status + '.');
            }
            return response.json().catch(function () { return {}; });
        }).then(function (data) {
            if (!APP.aiKeys[providerId]) {
                APP.aiKeys[providerId] = key;
                saveAiKeys();
            }
            delete APP.aiKeyChecking[providerId];
            setAiKeyStatus(providerId, 'ok', summarizeAiCheck(provider, data));
            render();
        }).catch(function (err) {
            console.error(err);
            delete APP.aiKeyChecking[providerId];
            setAiKeyStatus(providerId, 'error', err.message || 'Check failed.');
            render();
        });
    };

    var getRunPodKeyStatusClass = function (state) {
        if (state === 'ok') { return '.pft-ok'; }
        if (state === 'error') { return '.pft-error'; }
        if (state === 'warn' || state === 'missing' || state === 'checking') {
            return '.pft-warn';
        }
        return '';
    };

    var getRunPodInputKey = function () {
        return String($('#pft-runpod-key').val() || APP.runPodKey || '').trim();
    };

    var setRunPodKeyStatus = function (state, message) {
        APP.runPodKeyStatus = {
            state: state,
            message: message,
            checkedAt: Date.now()
        };
    };

    var saveRunPodKey = function () {
        var key = getRunPodInputKey();
        if (!key) {
            setRunPodKeyStatus('warn', 'Paste a RunPod key before saving.');
            render();
            return;
        }
        if (!saveRunPodKeyValue(key)) {
            setRunPodKeyStatus('error', 'Browser storage is unavailable.');
            render();
            return;
        }
        setRunPodKeyStatus('saved', 'RunPod key saved locally.');
        render();
    };

    var removeRunPodKey = function () {
        APP.runPodKey = '';
        saveRunPodKeyValue('');
        APP.runPodKeyChecking = false;
        setRunPodKeyStatus('missing', 'RunPod key removed.');
        render();
    };

    var getRunPodApiUrls = function (path) {
        var suffix = '/api/postfiat/runpod' + path;
        var urls = [suffix];
        var unsafeOrigin = String(ApiConfig.httpUnsafeOrigin || '').replace(/\/+$/u, '');
        var currentOrigin = String(window.location.origin || '').replace(/\/+$/u, '');
        var unsafeUrl = unsafeOrigin ? unsafeOrigin + suffix : '';
        if (unsafeUrl && unsafeOrigin !== currentOrigin) { urls.push(unsafeUrl); }
        return urls;
    };

    var makeRunPodFetchOptions = function (options, crossOrigin) {
        var hasExplicitKey = options && Object.prototype.hasOwnProperty.call(options, 'key');
        var key = hasExplicitKey ? options.key :
            (options && options.skipDefaultKey ? '' : APP.runPodKey || '');
        var headers = { Accept: options && options.accept || 'application/json' };
        var body;
        if (key) { headers.Authorization = 'Bearer ' + key; }
        if (options && typeof(options.body) !== 'undefined') {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(options.body);
        }
        var fetchOptions = {
            method: options && options.method || 'GET',
            credentials: crossOrigin ? 'omit' : 'same-origin',
            headers: headers,
            body: body
        };
        if (crossOrigin) { fetchOptions.mode = 'cors'; }
        return fetchOptions;
    };

    var parseRunPodResponse = function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) {
                var err = new Error(data && (data.error || data.message) ||
                    ('RunPod returned HTTP ' + response.status + '.'));
                if (response.status === 404) { err.postFiatRetryableRunPod = true; }
                throw err;
            }
            return data;
        });
    };

    var normalizeRunPodFetchError = function (err) {
        var message = err && err.message || '';
        if (/Failed to fetch|NetworkError|Load failed/u.test(message)) {
            return new Error('Unable to reach the PFT Docs RunPod proxy from this browser origin. Reload and try again; if it persists, the safe/unsafe origin route is blocked.');
        }
        return err;
    };

    var shouldRetryRunPodFetch = function (err) {
        var message = err && err.message || '';
        return Boolean(err && err.postFiatRetryableRunPod) ||
            /Failed to fetch|NetworkError|Load failed/u.test(message);
    };

    var runPodFetchJson = function (path, options) {
        var urls = getRunPodApiUrls(path);
        var attempt = function (index) {
            var url = urls[index];
            var crossOrigin = /^https?:\/\//u.test(url) &&
                String(url).indexOf(String(window.location.origin || '').replace(/\/+$/u, '')) !== 0;
            return window.fetch(url, makeRunPodFetchOptions(options, crossOrigin)).then(parseRunPodResponse)
                .catch(function (err) {
                    if (index + 1 < urls.length && shouldRetryRunPodFetch(err)) {
                        return attempt(index + 1);
                    }
                    throw normalizeRunPodFetchError(err);
                });
        };
        return attempt(0);
    };

    var extractRunPodStreamDelta = function (event) {
        var choice = event && event.choices && event.choices[0] || {};
        var delta = choice.delta || {};
        return {
            content: typeof(delta.content) === 'string' ? delta.content :
                (typeof(event.delta) === 'string' ? event.delta : ''),
            reasoning: typeof(delta.reasoning_content) === 'string' ? delta.reasoning_content :
                (typeof(delta.reasoning) === 'string' ? delta.reasoning : '')
        };
    };

    var extractAmbientStreamDelta = function (event) {
        var type = String(event && event.type || '');
        var delta = event && event.delta;
        var text;
        if (typeof(delta) === 'string') {
            text = delta;
        } else if (event && typeof(event.text) === 'string') {
            text = event.text;
        } else if (event && typeof(event.output_text) === 'string') {
            text = event.output_text;
        } else {
            text = '';
        }
        return {
            content: text && (/output|text/iu.test(type) || !type) ? text : '',
            reasoning: text && /reasoning|thinking/iu.test(type) ? text : ''
        };
    };

    var readSseTextResponse = function (response, handlers, extractDelta, errorLabel) {
        var reader = response.body && response.body.getReader && response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var output = '';
        var reasoningChars = 0;
        var processLine = function (line) {
            var data;
            var event;
            var delta;
            if (!line || line.indexOf('data:') !== 0) { return false; }
            data = line.slice(5).trim();
            if (!data) { return false; }
            if (data === '[DONE]') { return true; }
            try {
                event = JSON.parse(data);
            } catch (err) {
                return false;
            }
            if (event && event.error) {
                throw new Error(event.error.message || event.error ||
                    ((errorLabel || 'AI') + ' stream failed.'));
            }
            delta = extractDelta(event);
            if (delta.reasoning) {
                reasoningChars += delta.reasoning.length;
                if (handlers && typeof(handlers.onReasoningDelta) === 'function') {
                    handlers.onReasoningDelta(delta.reasoning, reasoningChars);
                }
            }
            if (delta.content) {
                output += delta.content;
                if (handlers && typeof(handlers.onDelta) === 'function') {
                    handlers.onDelta(delta.content);
                }
            }
            return false;
        };
        var pump = function () {
            return reader.read().then(function (chunk) {
                var lines;
                var done;
                if (chunk.done) {
                    if (buffer) { processLine(buffer); }
                    return output;
                }
                buffer += decoder.decode(chunk.value, { stream: true });
                lines = buffer.split(/\r?\n/u);
                buffer = lines.pop() || '';
                done = lines.some(processLine);
                return done ? output : pump();
            });
        };
        if (!reader) {
            return Promise.reject(new Error((errorLabel || 'AI') +
                ' stream response is unreadable.'));
        }
        return pump();
    };

    var readRunPodSseResponse = function (response, handlers) {
        return readSseTextResponse(response, handlers, extractRunPodStreamDelta, 'RunPod');
    };

    var runPodFetchSse = function (path, options, handlers) {
        var urls = getRunPodApiUrls(path);
        var attempt = function (index) {
            var url = urls[index];
            var crossOrigin = /^https?:\/\//u.test(url) &&
                String(url).indexOf(String(window.location.origin || '').replace(/\/+$/u, '')) !== 0;
            var fetchOptions = makeRunPodFetchOptions(Object.assign({}, options || {}, {
                accept: 'text/event-stream'
            }), crossOrigin);
            return window.fetch(url, fetchOptions).then(function (response) {
                if (!response.ok) {
                    return response.json().catch(function () { return {}; }).then(function (data) {
                        var err = new Error(data && (data.error || data.message) ||
                            ('RunPod returned HTTP ' + response.status + '.'));
                        if (response.status === 404) { err.postFiatRetryableRunPod = true; }
                        throw err;
                    });
                }
                return readRunPodSseResponse(response, handlers);
            }).catch(function (err) {
                if (index + 1 < urls.length && shouldRetryRunPodFetch(err)) {
                    return attempt(index + 1);
                }
                throw normalizeRunPodFetchError(err);
            });
        };
        return attempt(0);
    };

    var loadRunPodGpuTypes = function (force) {
        if (APP.runPodGpuTypesLoading) { return; }
        if (APP.runPodGpuTypes.length && !force) { return; }
        if (typeof(window.fetch) !== 'function') {
            APP.runPodGpuTypesStatus = 'This browser cannot load GPU types.';
            render();
            return;
        }
        APP.runPodGpuTypesLoading = true;
        APP.runPodGpuTypesStatus = 'Loading RunPod GPU type list...';
        render();
        runPodFetchJson('/gpu-types', { key: APP.runPodKey || '' }).then(function (data) {
            APP.runPodGpuTypes = Array.isArray(data && data.gpuTypeIds) ? data.gpuTypeIds : [];
            APP.runPodGpuTypesLoading = false;
            APP.runPodGpuTypesStatus = APP.runPodGpuTypes.length ?
                'Loaded ' + APP.runPodGpuTypes.length + ' RunPod GPU type(s).' :
                'RunPod returned no GPU type data.';
            render();
        }).catch(function (err) {
            console.error(err);
            APP.runPodGpuTypesLoading = false;
            APP.runPodGpuTypesStatus = err.message || 'Unable to load RunPod GPU types.';
            render();
        });
    };

    var setRunPodSetting = function (key, value, rerender) {
        APP.runPodSettings = normalizeRunPodSettings(APP.runPodSettings);
        APP.runPodSettings[key] = value;
        APP.runPodSettings = normalizeRunPodSettings(APP.runPodSettings);
        saveRunPodSettings();
        if (rerender !== false) { render(); }
    };

    var setRunPodModelPreset = function (value) {
        APP.runPodSettings = normalizeRunPodSettings(APP.runPodSettings);
        APP.runPodSettings.modelPreset = value;
        if (value !== 'custom') { APP.runPodSettings.modelId = value; }
        saveRunPodSettings();
        render();
    };

    var getRunPodSelectedGpuTypeIds = function () {
        return RunPodConfig.getSelectedGpuTypeIds(
            APP.runPodSettings,
            APP.runPodGpuTypes
        );
    };

    var buildRunPodPodPayload = function () {
        return RunPodConfig.buildPodPayload(
            APP.runPodSettings,
            getRunPodSelectedGpuTypeIds()
        );
    };

    var getRunPodProxyUrl = function (podId, port) {
        return 'https://' + podId + '-' + (port || 8000) + '.proxy.runpod.net';
    };

    var refreshRunPodPods = function () {
        var key = getRunPodInputKey();
        if (!key) {
            APP.runPodStatus = 'Save or paste a RunPod key before listing pods.';
            render();
            return;
        }
        APP.runPodPodsLoading = true;
        APP.runPodStatus = 'Loading RunPod pods...';
        render();
        runPodFetchJson('/pods', { key: key }).then(function (pods) {
            APP.runPodPods = Array.isArray(pods) ? pods : [];
            APP.runPodPodsLoading = false;
            APP.runPodStatus = 'Loaded ' + APP.runPodPods.length + ' pod(s).';
            scheduleRunPodReadinessChecks();
            tryAutoPopulateRunPodAiProvider(false);
            if (!APP.runPodKey) {
                saveRunPodKeyValue(key);
            }
            render();
        }).catch(function (err) {
            console.error(err);
            APP.runPodPodsLoading = false;
            APP.runPodStatus = err.message || 'Unable to load RunPod pods.';
            render();
        });
    };

    var checkRunPodKey = function () {
        var key = getRunPodInputKey();
        if (!key) {
            setRunPodKeyStatus('warn', 'Paste or save a RunPod key before checking.');
            render();
            return;
        }
        APP.runPodKeyChecking = true;
        setRunPodKeyStatus('checking', 'Checking RunPod key...');
        render();
        runPodFetchJson('/pods', { key: key }).then(function (pods) {
            saveRunPodKeyValue(key);
            APP.runPodKeyChecking = false;
            setRunPodKeyStatus('ok', 'Verified. ' +
                (Array.isArray(pods) ? pods.length : 0) + ' pod(s) visible.');
            loadRunPodGpuTypes(true);
            render();
        }).catch(function (err) {
            console.error(err);
            APP.runPodKeyChecking = false;
            setRunPodKeyStatus('error', err.message || 'RunPod key check failed.');
            render();
        });
    };

    var createRunPodPod = function () {
        var key = getRunPodInputKey();
        var payload;
        if (!key) {
            APP.runPodStatus = 'Save or paste a RunPod key before creating a pod.';
            render();
            return;
        }
        try {
            payload = buildRunPodPodPayload();
        } catch (err) {
            APP.runPodStatus = err.message || 'Invalid RunPod payload.';
            render();
            return;
        }
        if (!window.confirm('Create a paid RunPod pod named "' + payload.name +
                '" on ' + payload.gpuTypeIds.join(', ') + '?')) {
            return;
        }
        APP.runPodCreating = true;
        APP.runPodStatus = 'Creating RunPod pod...';
        APP.runPodLastResult = { request: payload };
        render();
        runPodFetchJson('/pods', { method: 'POST', key: key, body: payload }).then(function (pod) {
            saveRunPodKeyValue(key);
            APP.runPodCreating = false;
            APP.runPodLastResult = {
                request: payload,
                pod: pod,
                baseUrl: pod && pod.id ? getRunPodProxyUrl(pod.id, 8000) : '',
                healthUrl: pod && pod.id ? getRunPodProxyUrl(pod.id, 8000) + '/api/tags' : '',
                logsUrl: ''
            };
            APP.runPodStatus = pod && pod.id ? 'Created RunPod pod ' + pod.id + '.' :
                'RunPod pod created.';
            if (pod && pod.id) {
                setRunPodPodReadiness(pod.id, 'booting',
                    'Created. Waiting for Ollama and model pull.');
            }
            tryAutoPopulateRunPodAiProvider(false);
            refreshRunPodPods();
            if (pod && pod.id) { checkRunPodPodReadiness(pod, true); }
            render();
        }).catch(function (err) {
            console.error(err);
            APP.runPodCreating = false;
            APP.runPodStatus = err.message || 'RunPod pod creation failed.';
            render();
        });
    };

    var stopRunPodPod = function (podId) {
        var key = getRunPodInputKey();
        if (!key || !podId) { return; }
        if (!window.confirm('Stop RunPod pod ' + podId + '?')) { return; }
        APP.runPodStatus = 'Stopping RunPod pod ' + podId + '...';
        render();
        runPodFetchJson('/pods/' + encodeURIComponent(podId) + '/stop', {
            method: 'POST',
            key: key
        }).then(function () {
            APP.runPodStatus = 'Stop requested for ' + podId + '.';
            refreshRunPodPods();
        }).catch(function (err) {
            console.error(err);
            APP.runPodStatus = err.message || 'RunPod stop failed.';
            render();
        });
    };

    var deleteRunPodPod = function (podId) {
        var key = getRunPodInputKey();
        if (!key || !podId) { return; }
        if (!window.confirm('Terminate RunPod pod ' + podId + '? This removes the pod.')) {
            return;
        }
        APP.runPodStatus = 'Terminating RunPod pod ' + podId + '...';
        render();
        runPodFetchJson('/pods/' + encodeURIComponent(podId), {
            method: 'DELETE',
            key: key
        }).then(function () {
            APP.runPodStatus = 'Terminate requested for ' + podId + '.';
            refreshRunPodPods();
        }).catch(function (err) {
            console.error(err);
            APP.runPodStatus = err.message || 'RunPod terminate failed.';
            render();
        });
    };

    var normalizeOpenRouterModelRecord = function (record) {
        var id = String(record && (record.id || record.model_id) || '').trim();
        if (!id) { return null; }
        return {
            id: id,
            name: String(record.name || record.model_name || id),
            contextLength: Number(record.context_length || 0) || 0
        };
    };

    var parseOpenRouterModels = function (data) {
        var seen = {};
        var records = Array.isArray(data && data.data) ? data.data : [];
        return records.map(normalizeOpenRouterModelRecord).filter(function (model) {
            if (!model || seen[model.id]) { return false; }
            seen[model.id] = true;
            return true;
        }).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    };

    var parseOpenRouterZdrEndpoints = function (data) {
        var records = Array.isArray(data && data.data) ? data.data : [];
        return records.map(function (record) {
            return {
                modelId: String(record.model_id || record.id || '').trim(),
                modelName: String(record.model_name || record.name || ''),
                providerName: String(record.provider_name || ''),
                tag: String(record.tag || ''),
                contextLength: Number(record.context_length || 0) || 0,
                supportsImplicitCaching: !!record.supports_implicit_caching
            };
        }).filter(function (endpoint) {
            return !!endpoint.modelId;
        });
    };

    var getOpenRouterZdrModelIdMap = function () {
        var map = {};
        APP.openRouterZdrEndpoints.forEach(function (endpoint) {
            map[endpoint.modelId] = true;
        });
        return map;
    };

    var countOpenRouterZdrModels = function () {
        return Object.keys(getOpenRouterZdrModelIdMap()).length;
    };

    var getOpenRouterModelCatalog = function () {
        var models = APP.openRouterModels.length ? APP.openRouterModels : OPENROUTER_FALLBACK_MODELS;
        var modelMap = {};
        var selected = APP.aiSettings && APP.aiSettings.openRouterModel || OPENROUTER_DEFAULT_MODEL;
        var zdrMap = getOpenRouterZdrModelIdMap();
        var hasZdrFilter = APP.openRouterZdrEndpoints.length > 0;
        models.forEach(function (model) {
            if (APP.aiSettings && APP.aiSettings.openRouterZdrOnly && hasZdrFilter && !zdrMap[model.id]) {
                return;
            }
            modelMap[model.id] = model;
        });
        if (selected && !modelMap[selected]) {
            modelMap[selected] = {
                id: selected,
                name: selected + (hasZdrFilter && !zdrMap[selected] ? ' (not in current ZDR list)' : '')
            };
        }
        return Object.keys(modelMap).map(function (id) {
            return modelMap[id];
        }).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    };

    var getOpenRouterZdrProvidersForModel = function (modelId) {
        var names = {};
        APP.openRouterZdrEndpoints.forEach(function (endpoint) {
            if (endpoint.modelId === modelId && endpoint.providerName) {
                names[endpoint.providerName] = true;
            }
        });
        return Object.keys(names).sort();
    };

    var getOpenRouterModelStatus = function () {
        var selected = APP.aiSettings && APP.aiSettings.openRouterModel || OPENROUTER_DEFAULT_MODEL;
        var providers = getOpenRouterZdrProvidersForModel(selected);
        if (APP.openRouterModelsLoading) {
            return 'Loading OpenRouter models and ZDR endpoint data...';
        }
        if (providers.length) {
            return 'Selected model has ' + providers.length +
                ' ZDR endpoint(s): ' + providers.slice(0, 6).join(', ') +
                (providers.length > 6 ? ', ...' : '') + '.';
        }
        if (APP.openRouterZdrEndpoints.length) {
            return 'Selected model is not present in the current OpenRouter ZDR endpoint list.';
        }
        return APP.openRouterModelsStatus ||
            'Using fallback model list until OpenRouter model data is loaded.';
    };

    var buildOpenRouterRequestDefaults = function () {
        var provider = getAiProvider('openrouter');
        var baseUrl = provider ? getAiProviderBaseUrl(provider) : 'https://openrouter.ai';
        return {
            baseUrl: baseUrl + '/api/v1',
            model: APP.aiSettings && APP.aiSettings.openRouterModel || OPENROUTER_DEFAULT_MODEL,
            provider: {
                zdr: true,
                data_collection: 'deny'
            }
        };
    };

    var loadOpenRouterModels = function (force) {
        var provider = getAiProvider('openrouter');
        var baseUrl;
        var fetchJson;
        if (!provider || typeof(window.fetch) !== 'function') { return; }
        if (APP.openRouterModelsLoading) { return; }
        if (APP.openRouterModelsLoaded && !force) { return; }
        baseUrl = getAiProviderBaseUrl(provider);
        fetchJson = function (url) {
            return window.fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                headers: { Accept: 'application/json' }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('OpenRouter returned HTTP ' + response.status + '.');
                }
                return response.json();
            });
        };
        APP.openRouterModelsLoading = true;
        APP.openRouterModelsStatus = 'Loading OpenRouter models and ZDR endpoint data...';
        render();
        Promise.all([
            fetchJson(baseUrl + '/api/v1/models?output_modalities=text'),
            fetchJson(baseUrl + '/api/v1/endpoints/zdr')
        ]).then(function (results) {
            APP.openRouterModels = parseOpenRouterModels(results[0]);
            APP.openRouterZdrEndpoints = parseOpenRouterZdrEndpoints(results[1]);
            APP.openRouterModelsLoaded = true;
            APP.openRouterModelsLoading = false;
            APP.openRouterModelsStatus = 'Loaded ' + APP.openRouterModels.length +
                ' text model(s); ' + countOpenRouterZdrModels() +
                ' model(s) currently have ZDR endpoints.';
            render();
        }).catch(function (err) {
            console.error(err);
            APP.openRouterModelsLoading = false;
            APP.openRouterModelsStatus = err.message ||
                'Unable to load OpenRouter model data.';
            render();
        });
    };

    var extractAiResponseText = function (data) {
        var choice;
        var output;
        var content;
        var parts;
        if (!data) { return ''; }
        if (typeof(data) === 'string') { return data; }
        if (typeof(data.output_text) === 'string') { return data.output_text; }
        if (typeof(data.text) === 'string') { return data.text; }
        if (typeof(data.answer) === 'string') { return data.answer; }
        if (typeof(data.response) === 'string') { return data.response; }
        choice = data.choices && data.choices[0];
        if (choice && choice.message && typeof(choice.message.content) === 'string') {
            return choice.message.content;
        }
        if (choice && typeof(choice.text) === 'string') { return choice.text; }
        output = Array.isArray(data.output) ? data.output : [];
        parts = [];
        output.forEach(function (entry) {
            content = Array.isArray(entry && entry.content) ? entry.content : [];
            content.forEach(function (part) {
                if (typeof(part) === 'string') { parts.push(part); }
                if (part && typeof(part.text) === 'string') { parts.push(part.text); }
                if (part && typeof(part.output_text) === 'string') {
                    parts.push(part.output_text);
                }
            });
            if (entry && typeof(entry.text) === 'string') { parts.push(entry.text); }
        });
        if (parts.length) { return parts.join('\n'); }
        try {
            return JSON.stringify(data, null, 2);
        } catch (err) {
            return '';
        }
    };

    var buildAmbientResponsesInput = AiProviders.buildAmbientResponsesInput;

    var parseAmbientError = function (response) {
        return response.text().then(function (text) {
            var data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                data = { message: text };
            }
            throw new Error(data && (data.error && data.error.message ||
                data.error || data.message) ||
                ('Ambient returned HTTP ' + response.status + '.'));
        });
    };

    var callAmbientResponsesStream = function (provider, key, messages, handlers) {
        var baseUrl = getAiProviderBaseUrl(provider);
        var options = APP.chatOptions || getDefaultChatOptions();
        var thinking = isChatThinkingEnabled(options);
        var payload = AiProviders.buildAmbientResponsesPayload(messages, {
            thinking: thinking,
            stream: true,
            emitUsage: true
        });
        return window.fetch(baseUrl + '/v1/responses', {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Accept: 'text/event-stream'
            },
            body: JSON.stringify(payload)
        }).then(function (response) {
            if (!response.ok) {
                return parseAmbientError(response);
            }
            return readSseTextResponse(response, handlers, extractAmbientStreamDelta, 'Ambient');
        });
    };

    var callAmbientChat = function (provider, key, messages, handlers) {
        if (handlers && typeof(handlers.onDelta) === 'function') {
            return callAmbientResponsesStream(provider, key, messages, handlers);
        }
        var baseUrl = getAiProviderBaseUrl(provider);
        var payload = AiProviders.buildAmbientResponsesPayload(messages, {
            thinking: false,
            stream: false,
            emitUsage: true
        });
        return window.fetch(baseUrl + '/v1/responses', {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(function (response) {
            if (!response.ok) {
                return parseAmbientError(response);
            }
            return response.json();
        }).then(function (data) {
            return extractAiResponseText(data);
        });
    };

    var callOpenRouterChat = function (provider, key, messages) {
        var defaults = buildOpenRouterRequestDefaults();
        return window.fetch(defaults.baseUrl + '/chat/completions', {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'PFT Docs'
            },
            body: JSON.stringify(AiProviders.buildOpenRouterChatPayload(messages, defaults, {
                temperature: 0.2
            }))
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('OpenRouter returned HTTP ' + response.status + '.');
            }
            return response.json();
        }).then(function (data) {
            return extractAiResponseText(data);
        });
    };

    var prepareRunPodChatMessages = function (messages) {
        return AiProviders.prepareRunPodChatMessages(messages, {
            systemLimit: RUNPOD_CHAT_SYSTEM_CHAR_LIMIT,
            messageLimit: RUNPOD_CHAT_MESSAGE_CHAR_LIMIT,
            truncateText: truncateChatText
        });
    };

    var ensureRunPodFastOllamaEndpoint = function () {
        return ensureReadyRunPodAiEndpoint('Switched RunPod chat to the newest ready Ollama pod.');
    };

    var callRunPodChatResolved = function (provider, key, messages, handlers) {
        var baseUrl = getRunPodAiBaseUrl();
        var options = APP.chatOptions || getDefaultChatOptions();
        var thinking = isChatThinkingEnabled(options);
        var stream = handlers && typeof(handlers.onDelta) === 'function';
        var model = getRunPodAiModel();
        var nativeOllama = /^qwen3\.6:/u.test(model);
        var payload;
        if (!baseUrl) {
            return Promise.reject(new Error('No RunPod endpoint is configured. Add one on the AI page or use a running pod from RunPod Compute.'));
        }
        payload = AiProviders.buildRunPodChatPayload(messages, {
            model: model,
            stream: stream,
            temperature: 0.2,
            maxTokens: thinking ? RUNPOD_CHAT_THINKING_MAX_TOKENS :
                RUNPOD_CHAT_FAST_MAX_TOKENS,
            thinking: thinking,
            systemLimit: RUNPOD_CHAT_SYSTEM_CHAR_LIMIT,
            messageLimit: RUNPOD_CHAT_MESSAGE_CHAR_LIMIT,
            truncateText: truncateChatText
        });
        if (stream) {
            return runPodFetchSse('/openai/chat/completions', {
                method: 'POST',
                key: key,
                skipDefaultKey: true,
                body: {
                    baseUrl: baseUrl,
                    payload: payload,
                    nativeOllama: nativeOllama,
                    ollamaThink: thinking
                }
            }, handlers);
        }
        return runPodFetchJson('/openai/chat/completions', {
            method: 'POST',
            key: key,
            skipDefaultKey: true,
            body: {
                baseUrl: baseUrl,
                payload: payload,
                nativeOllama: nativeOllama,
                ollamaThink: thinking
            }
        }).then(function (data) {
            return extractAiResponseText(data);
        });
    };

    var callRunPodChat = function (provider, key, messages, handlers) {
        return ensureRunPodFastOllamaEndpoint().then(function () {
            return callRunPodChatResolved(provider, key, messages, handlers);
        });
    };

    var callSelectedAiProvider = function (messages, handlers) {
        var settings = APP.aiSettings || getDefaultAiSettings();
        var provider = getAiProvider(settings.provider) || getAiProvider('ambient');
        var key = provider && APP.aiKeys[provider.id];
        if (!provider) {
            return Promise.reject(new Error('No AI provider is selected.'));
        }
        if (!key && provider.requiresKey !== false) {
            return Promise.reject(new Error('No ' + provider.label +
                ' key is saved. Add one on the AI page.'));
        }
        if (typeof(window.fetch) !== 'function') {
            return Promise.reject(new Error('This browser cannot run AI fetch requests.'));
        }
        if (provider.id === 'openrouter') {
            return callOpenRouterChat(provider, key, messages).catch(function (err) {
                err.postFiatProviderLabel = provider.label;
                throw err;
            });
        }
        if (provider.id === 'runpod') {
            return callRunPodChat(provider, key, messages, handlers).catch(function (err) {
                err.postFiatProviderLabel = provider.label;
                throw err;
            });
        }
        return callAmbientChat(provider, key, messages, handlers).catch(function (err) {
            err.postFiatProviderLabel = provider.label;
            throw err;
        });
    };

    var callRunPodMemoryChat = function (messages) {
        var baseUrl = getRunPodAiBaseUrl();
        var model = getRunPodAiModel();
        var nativeOllama = /^qwen3\.6:/u.test(model);
        var payload;
        if (!baseUrl) {
            return Promise.reject(new Error('RunPod memory endpoint is not configured.'));
        }
        payload = AiProviders.buildRunPodChatPayload(messages, {
            model: model,
            stream: false,
            temperature: 0,
            maxTokens: CHAT_MEMORY_MAX_OUTPUT_TOKENS,
            thinking: false,
            systemLimit: RUNPOD_CHAT_SYSTEM_CHAR_LIMIT,
            messageLimit: RUNPOD_CHAT_MESSAGE_CHAR_LIMIT,
            truncateText: truncateChatText
        });
        return runPodFetchJson('/openai/chat/completions', {
            method: 'POST',
            key: APP.aiKeys && APP.aiKeys.runpod || '',
            skipDefaultKey: true,
            body: {
                baseUrl: baseUrl,
                payload: payload,
                nativeOllama: nativeOllama,
                ollamaThink: false
            }
        }).then(function (data) {
            return {
                provider: 'runpod',
                model: model,
                text: extractAiResponseText(data)
            };
        });
    };

    var callOpenRouterMemoryChat = function (messages) {
        var provider = getAiProvider('openrouter');
        var key = APP.aiKeys && APP.aiKeys.openrouter;
        var baseUrl;
        if (!provider || !key) {
            return Promise.reject(new Error('OpenRouter memory key is not configured.'));
        }
        baseUrl = getAiProviderBaseUrl(provider) + '/api/v1';
        return window.fetch(baseUrl + '/chat/completions', {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'PFT Docs Memory'
            },
            body: JSON.stringify(AiProviders.buildOpenRouterChatPayload(messages, {
                model: OPENROUTER_MEMORY_MODEL,
                provider: {
                    zdr: true,
                    data_collection: 'deny'
                }
            }, {
                temperature: 0,
                maxTokens: CHAT_MEMORY_MAX_OUTPUT_TOKENS
            }))
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('OpenRouter memory returned HTTP ' + response.status + '.');
            }
            return response.json();
        }).then(function (data) {
            return {
                provider: 'openrouter',
                model: OPENROUTER_MEMORY_MODEL,
                text: extractAiResponseText(data)
            };
        });
    };

    var callAmbientMemoryModel = function (model, messages) {
        var provider = getAiProvider('ambient');
        var key = APP.aiKeys && APP.aiKeys.ambient;
        var baseUrl;
        if (!provider || !key) {
            return Promise.reject(new Error('Ambient memory key is not configured.'));
        }
        baseUrl = getAiProviderBaseUrl(provider);
        return window.fetch(baseUrl + '/v1/responses', {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(AiProviders.buildAmbientResponsesPayload(messages, {
                model: model,
                thinking: false,
                stream: false,
                emitUsage: false,
                temperature: 0
            }))
        }).then(function (response) {
            if (!response.ok) {
                return parseAmbientError(response);
            }
            return response.json();
        }).then(function (data) {
            return {
                provider: 'ambient',
                model: model,
                text: extractAiResponseText(data)
            };
        });
    };

    var callAmbientMemoryChat = function (messages) {
        return callAmbientMemoryModel(AMBIENT_MEMORY_MODEL, messages).catch(function () {
            return callAmbientMemoryModel(AMBIENT_MEMORY_FALLBACK_MODEL, messages);
        });
    };

    var callChatMemoryProvider = function (messages) {
        var attempts = [];
        if (getRunPodAiBaseUrl()) {
            attempts.push(function () { return callRunPodMemoryChat(messages); });
        }
        if (APP.aiKeys && APP.aiKeys.openrouter) {
            attempts.push(function () { return callOpenRouterMemoryChat(messages); });
        }
        if (APP.aiKeys && APP.aiKeys.ambient) {
            attempts.push(function () { return callAmbientMemoryChat(messages); });
        }
        var run = function (index, lastErr) {
            if (index >= attempts.length) {
                return Promise.reject(lastErr ||
                    new Error('No AI provider is configured for chat memory.'));
            }
            return attempts[index]().catch(function (err) {
                return run(index + 1, err);
            });
        };
        return run(0);
    };

    var scheduleChatMemoryRefresh = function (session) {
        var sessionId = session && session.id;
        if (!sessionId) { return; }
        APP.chatMemoryJobs = APP.chatMemoryJobs || {};
        if (APP.chatMemoryJobs[sessionId]) { return; }
        APP.chatMemoryJobs[sessionId] = true;
        setTimeout(function () {
            var currentSession = getChatSessionById(sessionId);
            var record;
            var batch;
            var wroteMemory = false;
            if (!currentSession) {
                delete APP.chatMemoryJobs[sessionId];
                return;
            }
            record = readChatMemoryRecord(currentSession);
            batch = selectChatMemoryBatch(currentSession, record);
            if (!batch.length) {
                delete APP.chatMemoryJobs[sessionId];
                return;
            }
            callChatMemoryProvider(buildChatMemorySummarizerMessages(batch)).then(function (result) {
                var summaries = parseChatMemorySummaries(result.text, batch);
                if (summaries.length) {
                    record.summaries = record.summaries.concat(summaries)
                        .slice(-CHAT_MEMORY_SUMMARY_LIMIT);
                    record.provider = result.provider;
                    record.model = result.model;
                    wroteMemory = writeChatMemoryRecord(currentSession, record);
                    if (APP.activeChatId === sessionId) { render(); }
                }
            }).catch(function (err) {
                console.error(err);
            }).then(function () {
                var more;
                delete APP.chatMemoryJobs[sessionId];
                try {
                    more = selectChatMemoryBatch(currentSession,
                        readChatMemoryRecord(currentSession)).length > 0;
                } catch (err) {
                    more = false;
                }
                if (wroteMemory && more) { scheduleChatMemoryRefresh(currentSession); }
            });
        }, 750);
    };

    var loadCachedTaskNodeForChat = function () {
        if (APP.taskNodeLoaded && APP.taskNode) { return true; }
        return loadCachedTaskNodeForWallet(getActiveWalletAddress(),
            'Using cached Task Node history from {time}.');
    };

    var ensureTaskNodeForChat = function () {
        var options = APP.chatOptions || getDefaultChatOptions();
        var loadPromise;
        var timeoutPromise;
        if (!options.includeContextDoc && !options.includeTasks) {
            return Promise.resolve(null);
        }
        if (loadCachedTaskNodeForChat()) {
            scheduleChatTaskContextPackRefresh(false);
            return Promise.resolve(APP.taskNode);
        }
        loadPromise = APP.taskNodeLoading && APP.taskNodePromise ?
            APP.taskNodePromise : refreshTaskNode();
        timeoutPromise = new Promise(function (resolve) {
            setTimeout(function () {
                resolve(APP.taskNode || null);
            }, TASKNODE_CHAT_WAIT_MS);
        });
        return Promise.race([
            loadPromise.catch(function (err) {
                console.error(err);
                return APP.taskNode || null;
            }),
            timeoutPromise
        ]).then(function () {
            loadCachedTaskNodeForChat();
            scheduleChatTaskContextPackRefresh(false);
            return APP.taskNode || null;
        });
    };

    var getChatContextOptions = function () {
        return {
            walletAddress: getActiveWalletAddress() || '',
            truncateText: truncateChatText
        };
    };

    var buildTaskGroupChatBlock = function (group, opts) {
        return ChatContext.buildTaskGroupChatBlock(
            group,
            Object.assign(getChatContextOptions(), opts || {})
        );
    };

    var buildContextDocChatSection = function () {
        return ChatContext.buildContextDocChatSection(APP.taskNode || {},
            getChatContextOptions());
    };

    var getChatContextPackKey = function (walletAddress) {
        return CHAT_CONTEXT_PACK_PREFIX + String(walletAddress || 'unknown');
    };

    var buildTaskContextSignature = function (data) {
        return ChatContext.buildTaskContextSignature(data, getChatContextOptions());
    };

    var buildChatTaskContextPack = function (data) {
        return ChatContext.buildChatTaskContextPack(data, getChatContextOptions());
    };

    var readChatTaskContextPack = function (data) {
        var wallet = data && data.walletAddress || getActiveWalletAddress() || '';
        var record = readAiStoredJson(getChatContextPackKey(wallet));
        var signature = buildTaskContextSignature(data);
        if (!record || record.version !== CHAT_CONTEXT_PACK_VERSION ||
                record.signature !== signature) {
            return null;
        }
        return record;
    };

    var writeChatTaskContextPack = function (pack) {
        if (!pack || !pack.walletAddress) { return false; }
        return writeAiStoredJson(getChatContextPackKey(pack.walletAddress), pack);
    };

    var getChatTaskContextPack = function (data, force) {
        var cached;
        var pack;
        if (!data || (!Array.isArray(data.tasks) && !Array.isArray(data.taskEvents))) {
            return null;
        }
        if (!force) {
            cached = readChatTaskContextPack(data);
            if (cached) { return cached; }
        }
        pack = buildChatTaskContextPack(data);
        if (!pack) { return null; }
        writeChatTaskContextPack(pack);
        return pack;
    };

    var scheduleChatTaskContextPackRefresh = function (force) {
        if (APP.chatContextPackRefreshPending || !APP.taskNode) { return; }
        APP.chatContextPackRefreshPending = true;
        setTimeout(function () {
            APP.chatContextPackRefreshPending = false;
            try {
                getChatTaskContextPack(APP.taskNode, force);
            } catch (err) {
                console.error(err);
            }
        }, 0);
    };

    var buildRelevantHistoricalTaskDetails = function (data, userText) {
        return ChatContext.buildRelevantHistoricalTaskDetails(data, userText,
            getChatContextOptions());
    };

    var buildFallbackTasksChatSection = function () {
        return ChatContext.buildFallbackTasksChatSection(APP.taskNode || {},
            getChatContextOptions());
    };

    var buildTasksChatSection = function (userText) {
        var data = APP.taskNode || {};
        var pack = getChatTaskContextPack(data);
        return ChatContext.buildTasksChatSection(data, userText, pack,
            getChatContextOptions());
    };

    var loadSelectedChatDocContexts = function () {
        var docs = getSelectedChatDocs();
        if (!docs.length) { return Promise.resolve([]); }
        return Promise.all(docs.map(function (doc) {
            return loadChatDocContent(doc).catch(function (err) {
                return {
                    id: doc.id,
                    title: doc.title,
                    type: doc.type,
                    text: '',
                    error: err.message || 'Unable to read document.'
                };
            });
        }));
    };

    var buildSelectedDocsChatSection = function (records) {
        var sections = (records || []).map(function (record) {
            if (record.error) {
                return '### ' + record.title + '\n[Unable to read: ' + record.error + ']';
            }
            return '### ' + record.title + ' (' + record.type + ')\n' +
                truncateChatText(record.text, 12000);
        }).filter(Boolean);
        if (!sections.length) { return ''; }
        return '## Referenced Docs\n' + sections.join('\n\n');
    };

    var buildStandardChatSystemText = function (contextText) {
        return [
            'You are the PFT Docs chat assistant.',
            'Answer using the selected Context Doc, Task Node history, and referenced documents when they are provided.',
            'When the supplied context is insufficient, say what is missing instead of inventing details.',
            contextText
        ].filter(Boolean).join('\n\n');
    };

    var ODV_SYSTEM_PROMPT = Odv.systemPrompt;
    var buildOdvUserPromptText = Odv.buildUserPromptText;
    var extractOdvFullResponseText = Odv.extractFullResponseText;

    var buildChatMessages = function (userText, docRecords, sessionOverride) {
        var session = sessionOverride || getActiveChatSession();
        var options = APP.chatOptions || getDefaultChatOptions();
        var contextSections = [];
        var contextText;
        var recentMessages;
        var promptMode;
        var systemText;
        var finalUserText;
        contextSections.push(buildChatMemorySection(session));
        if (options.includeContextDoc) {
            contextSections.push(buildContextDocChatSection() ||
                '## Context Doc\n[No decrypted context doc is currently loaded. Task Node hydration may still be running in the background.]');
        }
        if (options.includeTasks) {
            contextSections.push(buildTasksChatSection(userText) ||
                '## Task Node Tasks\n[No readable Task Node task text is currently loaded. Task Node hydration may still be running in the background.]');
        }
        contextSections.push(buildSelectedDocsChatSection(docRecords));
        contextText = contextSections.filter(Boolean).join('\n\n');
        promptMode = normalizeChatPromptMode(options.promptMode);
        systemText = promptMode === CHAT_PROMPT_ODV ?
            ODV_SYSTEM_PROMPT :
            buildStandardChatSystemText(contextText);
        finalUserText = promptMode === CHAT_PROMPT_ODV ?
            buildOdvUserPromptText(userText, contextText) : userText;
        recentMessages = session.messages.slice(-11, -1).filter(function (message) {
            return message.role === 'user' || message.role === 'assistant';
        }).map(function (message) {
            return {
                role: message.role,
                content: message.text
            };
        });
        return [{
            role: 'system',
            content: truncateChatText(systemText, 46000)
        }].concat(recentMessages, [{
            role: 'user',
            content: finalUserText
        }]);
    };

    var initSuperthinkState = function () {
        return {
            id: 'superthink-' + Date.now(),
            startedAt: Date.now(),
            completedAt: 0,
            baseUrl: getRunPodAiBaseUrl(),
            model: getRunPodAiModel(),
            contextText: '',
            status: 'Ready',
            rounds: [],
            calls: [],
            finalReport: '',
            error: ''
        };
    };

    var setSuperthinkStatus = function (message) {
        APP.superthinkStatus = message || '';
        if (APP.superthink) {
            APP.superthink.status = APP.superthinkStatus;
        }
        render();
    };

    var ensureTaskNodeForSuperthink = function () {
        var loadPromise;
        var timeoutPromise;
        if (loadCachedTaskNodeForChat()) {
            scheduleChatTaskContextPackRefresh(false);
            return Promise.resolve(APP.taskNode);
        }
        loadPromise = APP.taskNodeLoading && APP.taskNodePromise ?
            APP.taskNodePromise : refreshTaskNode();
        timeoutPromise = new Promise(function (resolve) {
            setTimeout(function () {
                resolve(APP.taskNode || null);
            }, SUPERTHINK_TASKNODE_WAIT_MS);
        });
        return Promise.race([
            loadPromise.catch(function (err) {
                console.error(err);
                return APP.taskNode || null;
            }),
            timeoutPromise
        ]).then(function () {
            loadCachedTaskNodeForChat();
            scheduleChatTaskContextPackRefresh(false);
            return APP.taskNode || null;
        });
    };

    var ensureSuperthinkRunPodEndpoint = function () {
        return ensureReadyRunPodAiEndpoint('Auto-selected ready RunPod pod for Superthink.');
    };

    var buildSuperthinkContextText = function () {
        var session = getActiveChatSession();
        var parts = [
            '# Wallet\n' + (getActiveWalletAddress() || 'Wallet locked or unavailable'),
            buildChatMemorySection(session),
            buildContextDocChatSection() ||
                '## Context Doc\n[No decrypted context doc loaded.]',
            buildTasksChatSection('superthink historical personas task history context strategy execution') ||
                '## Task Node Tasks\n[No readable Task Node task text loaded.]'
        ].filter(Boolean);
        return truncateChatText(parts.join('\n\n'), SUPERTHINK_CONTEXT_CHAR_LIMIT);
    };

    var recordSuperthinkCall = function (label, startedAt, text, error) {
        if (!APP.superthink) { return; }
        APP.superthink.calls.push({
            label: label,
            startedAt: startedAt,
            elapsedMs: Date.now() - startedAt,
            chars: String(text || '').length,
            error: error && (error.message || String(error)) || ''
        });
    };

    var callRunPodSuperthink = function (messages, maxTokens, label) {
        var baseUrl = getRunPodAiBaseUrl();
        var model = getRunPodAiModel();
        var nativeOllama = /^qwen3\.6:/u.test(model);
        var startedAt = Date.now();
        var payload;
        if (!baseUrl) {
            return Promise.reject(new Error('Superthink requires a configured RunPod endpoint. Add one on the AI page or use a running pod from RunPod Compute.'));
        }
        payload = {
            model: model,
            messages: (messages || []).map(function (message) {
                var role = String(message && message.role || 'user');
                return {
                    role: role,
                    content: truncateChatText(message && message.content || '',
                        role === 'system' ? 9000 : 32000)
                };
            }),
            stream: false,
            temperature: 0.35,
            max_tokens: maxTokens,
            think: false,
            chat_template_kwargs: { enable_thinking: false }
        };
        return runPodFetchJson('/openai/chat/completions', {
            method: 'POST',
            key: APP.aiKeys && APP.aiKeys.runpod || '',
            skipDefaultKey: true,
            body: {
                baseUrl: baseUrl,
                payload: payload,
                nativeOllama: nativeOllama,
                ollamaThink: false
            }
        }).then(function (data) {
            var text = extractAiResponseText(data);
            recordSuperthinkCall(label, startedAt, text, null);
            return text;
        }).catch(function (err) {
            recordSuperthinkCall(label, startedAt, '', err);
            throw err;
        });
    };

    var stripJsonFences = function (value) {
        return String(value || '').replace(/```(?:json)?/giu, '').replace(/```/gu, '').trim();
    };

    var extractFirstJsonCandidate = function (value) {
        var text = stripJsonFences(value);
        var start = -1;
        var stack = [];
        var inString = false;
        var escaped = false;
        var i;
        var ch;
        var close;
        for (i = 0; i < text.length; i++) {
            ch = text[i];
            if (ch === '{' || ch === '[') {
                start = i;
                break;
            }
        }
        if (start === -1) { return ''; }
        for (i = start; i < text.length; i++) {
            ch = text[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === '{' || ch === '[') {
                stack.push(ch);
                continue;
            }
            if (ch === '}' || ch === ']') {
                close = stack.pop();
                if ((ch === '}' && close !== '{') || (ch === ']' && close !== '[')) {
                    return '';
                }
                if (!stack.length) {
                    return text.slice(start, i + 1);
                }
            }
        }
        return '';
    };

    var normalizeSuperthinkStringList = function (value) {
        if (Array.isArray(value)) {
            return value.map(function (item) {
                return String(item || '').trim();
            }).filter(Boolean);
        }
        return String(value || '').split(/\s*(?:;|\n|\|)\s*/u)
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
    };

    var getSuperthinkPersonaVoiceDefaults = function (name) {
        var key = String(name || '').toLowerCase();
        var map = {
            'niccolo machiavelli': {
                voiceStyle: 'Cold Florentine statecraft: counsel through power, appearances, enemies, fortune, necessity, and the preservation of authority.',
                rhetoricalPatterns: [
                    'Uses maxims and statecraft analogies.',
                    'Frames delay as loss of power.',
                    'Separates virtue from sentiment.'
                ],
                signatureMoves: [
                    'Names the ruler, the rival, the fortress, and the price of hesitation.',
                    'Turns technical ambiguity into a question of authority.'
                ]
            },
            'john boyd': {
                voiceStyle: 'Operational tempo: terse, kinetic, adversarial, built around OODA loops, orientation, and decision speed.',
                rhetoricalPatterns: [
                    'Short pressure sentences.',
                    'Contrasts tempo with paralysis.',
                    'Treats confusion as a maneuver problem.'
                ],
                signatureMoves: [
                    'Asks what shortens the decision loop.',
                    'Identifies friction that lets the environment act first.'
                ]
            },
            'claude shannon': {
                voiceStyle: 'Information-theory precision: signal, noise, entropy, compression, channel capacity, and error correction.',
                rhetoricalPatterns: [
                    'Defines terms like a mathematical communication problem.',
                    'Prefers compression over drama.',
                    'Turns advice into channel design.'
                ],
                signatureMoves: [
                    'Distinguishes signal from noise.',
                    'Asks what bit must be transmitted with minimum distortion.'
                ]
            },
            'grace hopper': {
                voiceStyle: 'Practical computing executor: plainspoken, implementation-focused, intolerant of ceremony that blocks a working system.',
                rhetoricalPatterns: [
                    'Speaks in operational fixes.',
                    'Favors small shippable mechanisms.',
                    'Uses debugging and compiler metaphors.'
                ],
                signatureMoves: [
                    'Converts vague strategy into a runnable procedure.',
                    'Calls out interface debt as a bug.'
                ]
            },
            'alan turing': {
                voiceStyle: 'Formal mechanistic reduction: converts vague problems into tests, machines, states, and decidable procedures.',
                rhetoricalPatterns: [
                    'Defines the problem before advising.',
                    'Avoids emotional flourish.',
                    'Uses tests and state transitions.'
                ],
                signatureMoves: [
                    'Asks what procedure would decide the question.',
                    'Separates the machine from the illusion of the machine.'
                ]
            },
            'ed thorp': {
                voiceStyle: 'Quiet quantitative edge: probability, expected value, bankroll protection, variance, transaction costs, and disciplined testing.',
                rhetoricalPatterns: [
                    'Speaks like a trader-mathematician.',
                    'Treats proof and sizing as separate gates.',
                    'Warns against betting before edge survives costs.'
                ],
                signatureMoves: [
                    'Turns confidence into expected value.',
                    'Frames failed tests as capital protection.'
                ]
            },
            'jim simons': {
                voiceStyle: 'Empirical research director: data over story, teams and infrastructure only as tools for finding persistent anomalies.',
                rhetoricalPatterns: [
                    'Distrusts narrative explanations.',
                    'Focuses on out-of-sample recurrence.',
                    'Uses research-pipeline language.'
                ],
                signatureMoves: [
                    'Asks whether the signal persists after costs.',
                    'Rejects hand-tuned stories.'
                ]
            },
            'ray dalio': {
                voiceStyle: 'Principles-driven allocator: systems, believability, radical transparency, feedback loops, and explicit decision criteria.',
                rhetoricalPatterns: [
                    'Organizes into principles.',
                    'Names process failure before output failure.',
                    'Asks for explicit criteria.'
                ],
                signatureMoves: [
                    'Turns conflict into a decision rule.',
                    'Requires written principles before action.'
                ]
            },
            'viktor frankl': {
                voiceStyle: 'Existential discipline: meaning, agency under constraint, suffering converted into responsibility, and inner freedom.',
                rhetoricalPatterns: [
                    'Speaks in moral-psychological terms.',
                    'Separates circumstance from response.',
                    'Avoids productivity jargon.'
                ],
                signatureMoves: [
                    'Reframes pain as a responsibility question.',
                    'Asks what meaning the action serves.'
                ]
            },
            'charles babbage': {
                voiceStyle: 'Mechanical computation architect: tables, engines, precision, error, repeatability, and the scandal of sloppy calculation.',
                rhetoricalPatterns: [
                    'Uses mechanical and tabular metaphors.',
                    'Condemns ambiguity as machine error.',
                    'Prefers fixed specifications.'
                ],
                signatureMoves: [
                    'Turns workflow into an engine.',
                    'Asks where the calculation can be inspected.'
                ]
            }
        };
        return map[key] || {
            voiceStyle: 'Distinct historical voice rooted in the persona era, domain, vocabulary, and mode of argument. Avoid generic executive-coach phrasing.',
            rhetoricalPatterns: [
                'Use the persona domain vocabulary and metaphors.',
                'Use a cadence that would identify the speaker even without the name.',
                'Challenge the user through the persona worldview.'
            ],
            signatureMoves: [
                'Translate the user context into the persona native problem frame.',
                'Give advice that another persona would not give in the same words.'
            ]
        };
    };

    var normalizeSuperthinkPersona = function (entry, index) {
        var name = String(entry && (entry.name || entry.persona || entry.figure) || '').trim();
        var defaults;
        var rhetoricalPatterns;
        var signatureMoves;
        if (!name) { name = 'Historical Persona ' + (index + 1); }
        defaults = getSuperthinkPersonaVoiceDefaults(name);
        rhetoricalPatterns = normalizeSuperthinkStringList(entry &&
            (entry.rhetorical_patterns || entry.rhetoricalPatterns ||
                entry.speech_patterns || entry.speechPatterns));
        signatureMoves = normalizeSuperthinkStringList(entry &&
            (entry.signature_moves || entry.signatureMoves || entry.moves));
        return {
            index: index,
            name: name,
            era: String(entry && entry.era || '').trim(),
            relevance: String(entry && entry.relevance || entry.why || '').trim(),
            angle: String(entry && entry.angle || entry.lens || '').trim(),
            voiceStyle: String(entry && (entry.voice_style || entry.voiceStyle ||
                entry.rhetorical_style || entry.rhetoricalStyle || entry.style) ||
                defaults.voiceStyle || '').trim(),
            rhetoricalPatterns: rhetoricalPatterns.length ?
                rhetoricalPatterns : defaults.rhetoricalPatterns,
            signatureMoves: signatureMoves.length ?
                signatureMoves : defaults.signatureMoves,
            antiStyle: String(entry && (entry.anti_style || entry.antiStyle ||
                entry.forbidden_tone || entry.forbiddenTone) ||
                'Do not sound like a generic consultant, product manager, executive coach, or the other personas.').trim(),
            description: '',
            feedback: '',
            status: 'queued',
            error: ''
        };
    };

    var parseSuperthinkPersonas = function (text) {
        var jsonText = extractFirstJsonCandidate(text);
        var data;
        var rows;
        var lines;
        if (jsonText) {
            try {
                data = JSON.parse(jsonText);
                rows = Array.isArray(data) ? data : data.personas;
            } catch (err) {
                rows = null;
            }
        }
        if (!Array.isArray(rows)) {
            lines = String(text || '').split(/\n/u).map(function (line) {
                return line.replace(/^\s*(?:[-*]|\d+[.)])\s*/u, '').trim();
            }).filter(Boolean).slice(0, SUPERTHINK_PERSONAS_PER_ROUND);
            rows = lines.map(function (line) {
                var parts = line.split(/\s+-\s+/u);
                return {
                    name: parts[0],
                    era: '',
                    relevance: parts.slice(1).join(' - '),
                    angle: ''
                };
            });
        }
        return (rows || []).map(normalizeSuperthinkPersona)
            .filter(function (persona) { return !!persona.name; })
            .slice(0, SUPERTHINK_PERSONAS_PER_ROUND);
    };

    var dedupeSuperthinkPersonas = function (personas, usedNames) {
        var used = {};
        var output = [];
        (usedNames || []).forEach(function (name) {
            used[String(name || '').toLowerCase()] = true;
        });
        (personas || []).forEach(function (persona) {
            var key = String(persona.name || '').toLowerCase();
            if (!key || used[key] || output.length >= SUPERTHINK_PERSONAS_PER_ROUND) {
                return;
            }
            used[key] = true;
            persona.index = output.length;
            output.push(persona);
        });
        return output;
    };

    var fillSuperthinkPersonas = function (personas, usedNames) {
        var output = dedupeSuperthinkPersonas(personas, usedNames);
        var used = {};
        (usedNames || []).forEach(function (name) {
            used[String(name || '').toLowerCase()] = true;
        });
        output.forEach(function (persona) {
            used[String(persona.name || '').toLowerCase()] = true;
        });
        SUPERTHINK_FALLBACK_PERSONAS.some(function (entry) {
            var key = String(entry.name || '').toLowerCase();
            if (output.length >= SUPERTHINK_PERSONAS_PER_ROUND) { return true; }
            if (used[key]) { return false; }
            used[key] = true;
            output.push(normalizeSuperthinkPersona(entry, output.length));
            return false;
        });
        output.forEach(function (persona, index) { persona.index = index; });
        return output;
    };

    var buildSuperthinkPriorRoundBrief = function (state) {
        var parts = [];
        (state && state.rounds || []).forEach(function (round) {
            if (round.status !== 'Complete' && !round.managerSummary) { return; }
            parts.push('## Prior Round ' + round.number);
            parts.push('Personas already used: ' + round.personas.map(function (persona) {
                return persona.name;
            }).join(', '));
            if (round.managerSummary) {
                parts.push('Manager synthesis:\n' +
                    truncateChatText(round.managerSummary, 1800));
            }
            round.personas.forEach(function (persona) {
                if (persona.feedback) {
                    parts.push(persona.name + ' feedback gist:\n' +
                        truncateChatText(persona.feedback, 700));
                }
            });
        });
        return truncateChatText(parts.join('\n\n'), SUPERTHINK_RESPONSE_CONTEXT_LIMIT);
    };

    var runSuperthinkPool = function (items, worker, limit) {
        var index = 0;
        var activeLimit = Math.max(1, Math.min(limit || 1, items.length || 1));
        var runNext = function () {
            var current = index;
            if (current >= items.length) { return Promise.resolve(); }
            index += 1;
            return Promise.resolve(worker(items[current], current)).catch(function (err) {
                console.error(err);
            }).then(runNext);
        };
        return Promise.all(Array.apply(null, { length: activeLimit }).map(runNext));
    };

    var buildSuperthinkPersonaSelectorMessages = function (contextText, priorRoundBrief, usedNames, roundNo) {
        var userParts = [
            'Select exactly five historical personas most relevant to the supplied Post Fiat user context.',
            'Round: ' + roundNo + ' of ' + SUPERTHINK_ROUNDS + '.',
            usedNames.length ? 'Do not repeat any of these already-used personas: ' +
                usedNames.join(', ') + '.' : '',
            'For each persona, precompute the rhetorical voice. Do not merely select famous names.',
            'voice_style must describe cadence, domain vocabulary, metaphors, and argumentative posture.',
            'rhetorical_patterns must contain 3-5 concrete writing patterns that make the speaker recognizable.',
            'signature_moves must contain 2-4 reasoning moves this persona would naturally make.',
            'anti_style must say what generic modern phrasing this persona must avoid.',
            priorRoundBrief ? 'Previous round transcript and synthesis. Choose new lenses that add information instead of repeating prior advice:\n' +
                truncateChatText(priorRoundBrief, SUPERTHINK_RESPONSE_CONTEXT_LIMIT) : '',
            'User context:\n' + contextText,
            'Return strict JSON only in this shape: {"personas":[{"name":"","era":"","relevance":"","angle":"","voice_style":"","rhetorical_patterns":["","",""],"signature_moves":["",""],"anti_style":""}]}'
        ].filter(Boolean);
        return [{
            role: 'system',
            content: 'You are a precise historical-persona and rhetorical-style selector for a private strategic reasoning tool. Return JSON only. Do not include markdown.'
        }, {
            role: 'user',
            content: userParts.join('\n\n')
        }];
    };

    var buildSuperthinkPersonaConsultMessages = function (persona, contextText, priorRoundBrief) {
        var rhetoricalPatterns = (persona.rhetoricalPatterns || []).map(function (pattern) {
            return '- ' + pattern;
        }).join('\n');
        var signatureMoves = (persona.signatureMoves || []).map(function (move) {
            return '- ' + move;
        }).join('\n');
        return [{
            role: 'system',
            content: [
                'You are not a neutral adviser. You are writing as the named historical persona inside Superthink.',
                'The response must be identifiable as that persona even if the name is removed.',
                'Use the persona domain vocabulary, metaphors, cadence, and reasoning habits.',
                'Do not use the shared Superthink house voice.',
                'Avoid repeated generic phrases such as "you are underweighting the risk", "validation theater", "kill or ship", "brutal arithmetic", "core directive", and "what matters now" unless the persona voice makes them unavoidable.',
                'Return exactly two labeled sections: DESCRIPTION: and FEEDBACK:.',
                'Do not use JSON. Do not use markdown fences. Do not mention that you are imitating a style.'
            ].join('\n')
        }, {
            role: 'user',
            content: [
                'Persona: ' + persona.name,
                persona.era ? 'Era: ' + persona.era : '',
                persona.relevance ? 'Why selected: ' + persona.relevance : '',
                persona.angle ? 'Angle: ' + persona.angle : '',
                'Voice style:\n' + persona.voiceStyle,
                rhetoricalPatterns ? 'Rhetorical patterns to use:\n' + rhetoricalPatterns : '',
                signatureMoves ? 'Signature reasoning moves to use:\n' + signatureMoves : '',
                persona.antiStyle ? 'Anti-style / forbidden generic mode:\n' + persona.antiStyle : '',
                'DESCRIPTION: two concise paragraphs describing this persona as a thinking lens for the user. Write it in the persona voice, not a neutral encyclopedia voice.',
                'FEEDBACK: two to four concise paragraphs of advice in the persona voice. The substance should be useful, but the rhetoric should come from the persona world: military tempo for Boyd, information compression for Shannon, statecraft for Machiavelli, mechanical calculation for Babbage, etc.',
                'Do not force every persona into the same categories. Do not make every answer about the same risk. Do not repeat prior wording.',
                'Be concrete. No generic encouragement. Do not dox or quote sensitive details.',
                priorRoundBrief ? 'Previous Superthink rounds. Do not repeat these points; extend, challenge, or sharpen them:\n' +
                    truncateChatText(priorRoundBrief, SUPERTHINK_RESPONSE_CONTEXT_LIMIT) : '',
                'User context:\n' + truncateChatText(contextText, 16000)
            ].filter(Boolean).join('\n\n')
        }];
    };

    var parseSuperthinkPersonaPacket = function (text) {
        var jsonText = extractFirstJsonCandidate(text);
        var data;
        var raw = String(text || '').trim();
        var feedbackMatch;
        if (jsonText) {
            try {
                data = JSON.parse(jsonText);
            } catch (err) {
                data = null;
            }
            if (data && (data.description || data.feedback)) {
                return {
                    description: String(data.description || '').trim(),
                    feedback: String(data.feedback || '').trim()
                };
            }
        }
        feedbackMatch = /(?:^|\n)\s*(?:#+\s*)?feedback\s*[:|-]\s*/iu.exec(raw);
        if (feedbackMatch) {
            return {
                description: raw.slice(0, feedbackMatch.index)
                    .replace(/(?:^|\n)\s*(?:#+\s*)?description\s*[:|-]\s*/iu, '')
                    .trim(),
                feedback: raw.slice(feedbackMatch.index + feedbackMatch[0].length).trim()
            };
        }
        return {
            description: '',
            feedback: raw
        };
    };

    var buildSuperthinkManagerMessages = function (round, contextText, priorRoundBrief) {
        var feedbackText = round.personas.map(function (persona) {
            return '## ' + persona.name + '\n' + (persona.feedback || persona.error || '');
        }).join('\n\n');
        return [{
            role: 'system',
            content: [
                'You are the Superthink manager.',
                'Compress five persona responses into a high-signal synthesis.',
                'Preserve meaningful differences in voice and worldview. Do not rewrite all personas into one house doctrine.'
            ].join('\n')
        }, {
            role: 'user',
            content: [
                'Round ' + round.number + ' persona feedback:',
                feedbackText,
                priorRoundBrief ? 'Prior Superthink rounds to avoid repeating:\n' +
                    truncateChatText(priorRoundBrief, SUPERTHINK_RESPONSE_CONTEXT_LIMIT) : '',
                'User context excerpt:\n' + truncateChatText(contextText, 10000),
                'Write a concise synthesis with: strongest agreement, strongest disagreement, immediate move, and unresolved question. Keep it under 700 words.'
            ].filter(Boolean).join('\n\n')
        }];
    };

    var buildSuperthinkTranscriptText = function (state) {
        var parts = [];
        (state && state.rounds || []).forEach(function (round) {
            parts.push('# Round ' + round.number);
            if (round.selectorText) {
                parts.push('## Selector output\n' + round.selectorText);
            }
            round.personas.forEach(function (persona) {
                parts.push('## ' + persona.name);
                if (persona.voiceStyle) { parts.push('Voice style:\n' + persona.voiceStyle); }
                if (persona.rhetoricalPatterns && persona.rhetoricalPatterns.length) {
                    parts.push('Rhetorical patterns:\n' + persona.rhetoricalPatterns.map(function (pattern) {
                        return '- ' + pattern;
                    }).join('\n'));
                }
                if (persona.signatureMoves && persona.signatureMoves.length) {
                    parts.push('Signature moves:\n' + persona.signatureMoves.map(function (move) {
                        return '- ' + move;
                    }).join('\n'));
                }
                if (persona.description) { parts.push('Description:\n' + persona.description); }
                if (persona.feedback) { parts.push('Feedback:\n' + persona.feedback); }
                if (persona.error) { parts.push('Error:\n' + persona.error); }
            });
            if (round.managerSummary) {
                parts.push('## Manager synthesis\n' + round.managerSummary);
            }
        });
        return parts.join('\n\n');
    };

    var splitSuperthinkQuoteSentences = function (text) {
        return String(text || '').replace(/\s+/gu, ' ')
            .match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [];
    };

    var scoreSuperthinkQuoteCandidate = function (quote) {
        var lower = String(quote || '').toLowerCase();
        var keywords = [
            'kill', 'ship', 'net-of-cost', 'slippage', 'turnover', 'fee',
            'task node', 'go/no-go', 'capital', 'sovereignty', 'ambiguity',
            'validation', 'overfitting', 'founder-use', 'decision', 'risk',
            'strategy', 'alpha', 'memo', 'edge'
        ];
        var score = 0;
        keywords.forEach(function (keyword) {
            if (lower.indexOf(keyword) !== -1) { score += 2; }
        });
        if (quote.length >= 70 && quote.length <= 220) { score += 2; }
        if (/must|only|stop|do not|if\b|until|before/iu.test(quote)) { score += 1; }
        return score;
    };

    var collectSuperthinkQuoteCandidates = function (label, text, limit) {
        var seen = {};
        return splitSuperthinkQuoteSentences(text).map(function (sentence) {
            var quote = sentence.replace(/^\s*(?:[-*]|\d+[.)]|#+)\s*/u, '').trim();
            var key = quote.toLowerCase();
            if (quote.length < 45 || quote.length > 260 || seen[key]) { return null; }
            seen[key] = true;
            return {
                label: label,
                quote: quote,
                score: scoreSuperthinkQuoteCandidate(quote)
            };
        }).filter(Boolean).sort(function (a, b) {
            return b.score - a.score;
        }).slice(0, limit || 6);
    };

    var buildSuperthinkQuoteCandidates = function (state) {
        var candidates = [];
        candidates = candidates.concat(collectSuperthinkQuoteCandidates(
            'User context', state && state.contextText || '', 8));
        (state && state.rounds || []).forEach(function (round) {
            if (round.selectorText) {
                candidates = candidates.concat(collectSuperthinkQuoteCandidates(
                    'Round ' + round.number + ' selector', round.selectorText, 3));
            }
            if (round.managerSummary) {
                candidates = candidates.concat(collectSuperthinkQuoteCandidates(
                    'Round ' + round.number + ' manager', round.managerSummary, 5));
            }
            round.personas.forEach(function (persona) {
                if (persona.feedback) {
                    candidates = candidates.concat(collectSuperthinkQuoteCandidates(
                        'Round ' + round.number + ' - ' + persona.name,
                        persona.feedback, 2));
                }
            });
        });
        return candidates.sort(function (a, b) {
            return b.score - a.score;
        }).slice(0, 24).map(function (entry) {
            return '- [' + entry.label + '] "' + entry.quote + '"';
        }).join('\n');
    };

    var buildSuperthinkFinalMessages = function (state) {
        var quoteCandidates = buildSuperthinkQuoteCandidates(state);
        return [{
            role: 'system',
            content: [
                'You are the final Superthink editor.',
                'Do not write a generic operating brief.',
                'Create an evidence-grounded report that preserves the sharpest language from the transcript.'
            ].join('\n')
        }, {
            role: 'user',
            content: [
                quoteCandidates ? 'Evidence pull-quote candidates. Use exact short quotes from this list or from the transcript; do not invent quotes:\n' +
                    quoteCandidates : '',
                'User context excerpt:\n' + truncateChatText(state.contextText, 12000),
                'Superthink transcript:\n' +
                    truncateChatText(buildSuperthinkTranscriptText(state), 36000),
                [
                    'Write the final Superthink report in markdown.',
                    'Required sections:',
                    '1. Thesis - 3 concise bullets.',
                    '2. Evidence Pull-Quotes - 6 to 10 short exact quotes with source labels and one sentence on why each matters.',
                    '3. What The Personas Actually Disagreed About.',
                    '4. Decision Directives.',
                    '5. Open Questions / Missing Thresholds.',
                    'Requirements:',
                    '- Quote exact language from the pull-quote list or transcript.',
                    '- Include at least three quotes from persona or manager outputs.',
                    '- Include at least one user-context quote when a useful one exists.',
                    '- Tie every strategic conclusion to at least one quoted input.',
                    '- Remove repetition, but do not erase the best harsh/strange phrasing.',
                    '- Do not summarize the entire Post Fiat brief unless it is directly relevant to the quoted evidence.'
                ].join('\n')
            ].filter(Boolean).join('\n\n')
        }];
    };

    var runSuperthinkRound = function (state, roundNo, usedNames, priorRoundBrief) {
        var round = {
            number: roundNo,
            status: 'Selecting personas',
            selectorText: '',
            personas: [],
            managerSummary: '',
            error: ''
        };
        state.rounds.push(round);
        setSuperthinkStatus('Round ' + roundNo + ': selecting historical personas...');
        return callRunPodSuperthink(
            buildSuperthinkPersonaSelectorMessages(state.contextText, priorRoundBrief,
                usedNames, roundNo),
            SUPERTHINK_SELECTOR_MAX_TOKENS,
            'round ' + roundNo + ' selector'
        ).then(function (selectorText) {
            var parsed;
            round.selectorText = selectorText;
            parsed = fillSuperthinkPersonas(parseSuperthinkPersonas(selectorText), usedNames);
            if (!parsed.length) {
                throw new Error('Round ' + roundNo + ' did not return usable personas.');
            }
            round.personas = parsed;
            parsed.forEach(function (persona) { usedNames.push(persona.name); });
            round.status = 'Consulting personas';
            setSuperthinkStatus('Round ' + roundNo + ': consulting ' +
                parsed.length + ' personas...');
            return runSuperthinkPool(parsed, function (persona) {
                persona.status = 'advising';
                render();
                return callRunPodSuperthink(
                    buildSuperthinkPersonaConsultMessages(persona, state.contextText,
                        priorRoundBrief),
                    SUPERTHINK_DESCRIPTION_MAX_TOKENS + SUPERTHINK_FEEDBACK_MAX_TOKENS,
                    'round ' + roundNo + ' persona: ' + persona.name
                ).then(function (text) {
                    var packet = parseSuperthinkPersonaPacket(text);
                    persona.description = packet.description;
                    persona.feedback = packet.feedback;
                    persona.status = 'feedback ready';
                    render();
                }).catch(function (err) {
                    persona.error = err.message || 'Persona consultation failed.';
                    persona.status = 'error';
                    render();
                });
            }, SUPERTHINK_PARALLEL_CALLS);
        }).then(function () {
            round.status = 'Manager synthesis';
            setSuperthinkStatus('Round ' + roundNo + ': compressing with manager model...');
            return callRunPodSuperthink(
                buildSuperthinkManagerMessages(round, state.contextText, priorRoundBrief),
                SUPERTHINK_MANAGER_MAX_TOKENS,
                'round ' + roundNo + ' manager'
            );
        }).then(function (summary) {
            round.managerSummary = summary;
            round.status = 'Complete';
            setSuperthinkStatus('Round ' + roundNo + ' complete.');
            return summary;
        }).catch(function (err) {
            round.error = err.message || 'Round failed.';
            round.status = 'Error';
            throw err;
        });
    };

    var runSuperthinkRounds = function (state) {
        var usedNames = [];
        var runRound = function (roundNo) {
            var priorRoundBrief = buildSuperthinkPriorRoundBrief(state);
            if (roundNo > SUPERTHINK_ROUNDS) {
                return Promise.resolve(priorRoundBrief);
            }
            return runSuperthinkRound(state, roundNo, usedNames, priorRoundBrief)
                .then(function () {
                    return runRound(roundNo + 1);
                });
        };
        return runRound(1);
    };

    var startSuperthink = function () {
        var state;
        if (APP.superthinkRunning) { return; }
        state = initSuperthinkState();
        APP.superthink = state;
        APP.superthinkRunning = true;
        APP.superthinkStatus = 'Preparing RunPod and Task Node context...';
        render();
        ensureSuperthinkRunPodEndpoint().then(function () {
            state.baseUrl = getRunPodAiBaseUrl();
            state.model = getRunPodAiModel();
            if (!state.baseUrl) {
                throw new Error('No RunPod endpoint is configured. Open AI or RunPod, select a running Ollama pod, then run Superthink.');
            }
            return ensureTaskNodeForSuperthink();
        }).then(function () {
            state.contextText = buildSuperthinkContextText();
            return runSuperthinkRounds(state);
        }).then(function () {
            setSuperthinkStatus('Writing final Superthink report...');
            return callRunPodSuperthink(
                buildSuperthinkFinalMessages(state),
                SUPERTHINK_FINAL_MAX_TOKENS,
                'final report'
            );
        }).then(function (finalReport) {
            state.finalReport = finalReport;
            state.completedAt = Date.now();
            APP.superthinkRunning = false;
            APP.superthinkStatus = 'Complete.';
            render();
        }).catch(function (err) {
            console.error(err);
            state.error = err.message || 'Superthink failed.';
            state.completedAt = Date.now();
            APP.superthinkRunning = false;
            APP.superthinkStatus = state.error;
            render();
        });
    };

    var resetSuperthink = function () {
        if (APP.superthinkRunning) { return; }
        APP.superthink = null;
        APP.superthinkStatus = '';
        render();
    };

    var chatMarkdownRenderer;

    var escapeChatHtml = function (value) {
        return String(value || '').replace(/[&<>"']/g, function (ch) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[ch];
        });
    };

    var sanitizeChatHref = function (href) {
        var raw = String(href || '').trim();
        var parsed;
        if (!raw) { return ''; }
        if (/^(javascript|data|vbscript):/iu.test(raw)) { return ''; }
        try {
            parsed = new window.URL(raw, window.location.origin);
        } catch (err) {
            return '';
        }
        if (['http:', 'https:', 'mailto:'].indexOf(parsed.protocol) === -1) {
            return '';
        }
        return parsed.href;
    };

    var getChatMarkdownRenderer = function () {
        var renderer;
        var defaultCode;
        if (chatMarkdownRenderer || !Marked || typeof(Marked.Renderer) !== 'function') {
            return chatMarkdownRenderer;
        }
        renderer = new Marked.Renderer();
        defaultCode = renderer.code;
        renderer.html = function (html) {
            return escapeChatHtml(html);
        };
        renderer.heading = function (text, level) {
            level = Math.max(1, Math.min(Number(level) || 2, 4));
            return '<h' + level + '>' + text + '</h' + level + '>\n';
        };
        renderer.link = function (href, title, text) {
            var safeHref = sanitizeChatHref(href);
            if (!safeHref) { return text || escapeChatHtml(href); }
            return '<a href="' + escapeChatHtml(safeHref) + '"' +
                (title ? ' title="' + escapeChatHtml(title) + '"' : '') +
                ' target="_blank" rel="noopener noreferrer">' + text + '</a>';
        };
        renderer.image = function (href, title, text) {
            var label = text || title || href || 'image';
            return '<span class="pft-chat-image-placeholder">[image: ' +
                escapeChatHtml(label) + ']</span>';
        };
        renderer.code = function (code, language) {
            var lang = String(language || '').split(/\s+/u)[0]
                .replace(/[^A-Za-z0-9_-]/g, '');
            if (!code && defaultCode) { return defaultCode.apply(renderer, arguments); }
            return '<pre><code' + (lang ? ' class="language-' + lang + '"' : '') +
                '>' + escapeChatHtml(code) + '</code></pre>\n';
        };
        renderer.codespan = function (code) {
            return '<code>' + escapeChatHtml(code) + '</code>';
        };
        chatMarkdownRenderer = renderer;
        return renderer;
    };

    var sanitizeChatMarkdownHtml = function (html) {
        var template = document.createElement('template');
        var allowedTags = {
            A: true,
            BLOCKQUOTE: true,
            BR: true,
            CODE: true,
            DEL: true,
            EM: true,
            H1: true,
            H2: true,
            H3: true,
            H4: true,
            HR: true,
            LI: true,
            OL: true,
            P: true,
            PRE: true,
            SPAN: true,
            STRONG: true,
            TABLE: true,
            TBODY: true,
            TD: true,
            TH: true,
            THEAD: true,
            TR: true,
            UL: true
        };
        var allowedAttrs = {
            A: { href: true, title: true, target: true, rel: true },
            CODE: { class: true },
            SPAN: { class: true },
            TD: { align: true },
            TH: { align: true }
        };
        var removeTags = {
            APPLET: true,
            AUDIO: true,
            EMBED: true,
            FORM: true,
            IFRAME: true,
            IMG: true,
            INPUT: true,
            OBJECT: true,
            SCRIPT: true,
            SOURCE: true,
            STYLE: true,
            SVG: true,
            VIDEO: true
        };
        var clean = function (node) {
            Array.prototype.slice.call(node.childNodes || []).forEach(function (child) {
                var tag;
                var attrs;
                var allowed;
                if (child.nodeType === 3) { return; }
                if (child.nodeType !== 1) {
                    child.parentNode.removeChild(child);
                    return;
                }
                tag = child.nodeName.toUpperCase();
                if (!allowedTags[tag]) {
                    if (removeTags[tag]) {
                        child.parentNode.removeChild(child);
                        return;
                    }
                    while (child.firstChild) {
                        child.parentNode.insertBefore(child.firstChild, child);
                    }
                    child.parentNode.removeChild(child);
                    return;
                }
                allowed = allowedAttrs[tag] || {};
                attrs = Array.prototype.slice.call(child.attributes || []);
                attrs.forEach(function (attr) {
                    var name = attr.name.toLowerCase();
                    if (!allowed[name] || /^on/u.test(name)) {
                        child.removeAttribute(attr.name);
                        return;
                    }
                    if (name === 'href' && !sanitizeChatHref(attr.value)) {
                        child.removeAttribute(attr.name);
                    }
                });
                if (tag === 'A') {
                    child.setAttribute('target', '_blank');
                    child.setAttribute('rel', 'noopener noreferrer');
                }
                clean(child);
            });
        };
        template.innerHTML = html || '';
        clean(template.content);
        return template.innerHTML;
    };

    var renderChatMarkdown = function (text) {
        var raw = compactChatText(text);
        var renderer = getChatMarkdownRenderer();
        var node = h('div.pft-chat-message-text.pft-chat-markdown');
        var html;
        if (!raw) { return node; }
        if (!Marked || typeof(Marked.parse) !== 'function' || !renderer) {
            node.textContent = raw;
            return node;
        }
        try {
            html = Marked.parse(raw, {
                renderer: renderer,
                gfm: true,
                breaks: true,
                headerIds: false,
                mangle: false
            });
            node.innerHTML = sanitizeChatMarkdownHtml(html);
            return node;
        } catch (err) {
            console.error(err);
            node.textContent = raw;
            return node;
        }
    };

    var getChatMessageDomId = function (message) {
        return 'pft-chat-message-' + String(message && message.id || '')
            .replace(/[^a-zA-Z0-9_-]/g, '');
    };

    var scrollChatToEndNow = function () {
        var el = document.querySelector('.pft-chat-scroll');
        if (el) { el.scrollTop = el.scrollHeight; }
    };

    var updateStreamingChatMessageDom = function (message) {
        var node;
        if (!message || !message.id) { return false; }
        node = document.getElementById(getChatMessageDomId(message));
        if (!node) { return false; }
        node.textContent = String(message.text || '');
        scrollChatToEndNow();
        return true;
    };

    var renderChatPlainText = function (message) {
        var attrs = {};
        if (message && message.id) {
            attrs.id = getChatMessageDomId(message);
        }
        return h('div.pft-chat-message-text.pft-chat-streaming-text', attrs,
            String(message && message.text || message || ''));
    };

    var runAfterChatPaint = function (fn) {
        var raf = window.requestAnimationFrame || function (cb) {
            return setTimeout(cb, 0);
        };
        raf(function () {
            raf(fn);
        });
    };

    var captureChatScrollState = function () {
        var el = document.querySelector('.pft-chat-scroll');
        var distanceFromBottom;
        if (!el) { return null; }
        distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        return {
            sessionId: el.getAttribute('data-session-id') || '',
            scrollTop: el.scrollTop,
            pinnedToBottom: distanceFromBottom <= CHAT_BOTTOM_THRESHOLD
        };
    };

    var restoreChatScrollState = function (state) {
        runAfterChatPaint(function () {
            var el = document.querySelector('.pft-chat-scroll');
            var maxScrollTop;
            if (!el) { return; }
            if (!state || state.sessionId !== APP.activeChatId ||
                    state.pinnedToBottom ||
                    (APP.chatSending && APP.chatSendingSessionId === APP.activeChatId)) {
                el.scrollTop = el.scrollHeight;
                return;
            }
            maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
            el.scrollTop = Math.min(state.scrollTop, maxScrollTop);
        });
    };

    var scrollChatToEnd = function () {
        runAfterChatPaint(function () {
            var el = document.querySelector('.pft-chat-scroll');
            if (el) { el.scrollTop = el.scrollHeight; }
        });
    };

    var formatChatErrorMessage = function (err, stage) {
        var message = String(err && err.message || err || 'Unable to send chat request.');
        var provider = err && err.postFiatProviderLabel || 'AI provider';
        if (/RunPod returned HTTP 524/iu.test(message)) {
            return 'RunPod timed out before Qwen produced a usable stream. Use Fast mode for normal chat; if it repeats, the pod is overloaded or stuck on a long thinking request.';
        }
        if (/operation was aborted|aborted/iu.test(message)) {
            if (stage === 'provider') {
                return provider + ' request was interrupted before a response was returned.';
            }
            if (stage === 'docs') {
                return 'Reading selected docs was interrupted before chat could start.';
            }
            if (stage === 'tasknode') {
                return 'Loading Task Node context was interrupted before chat could start.';
            }
            return 'The chat request was interrupted before it finished.';
        }
        return message;
    };

    var sendChatMessage = function () {
        var input = $('#pft-chat-input');
        var text = compactChatText(input.val() || APP.chatDraft);
        var options = APP.chatOptions || getDefaultChatOptions();
        var promptMode = normalizeChatPromptMode(options.promptMode);
        var isOdvPrompt = promptMode === CHAT_PROMPT_ODV;
        var requestSession;
        var requestSessionId;
        var wantsTaskNode = options.includeContextDoc || options.includeTasks;
        var chatStage = 'idle';
        var streamedAssistant = null;
        var rawStreamedAssistantText = '';
        var lastVisibleStreamText = '';
        var streamBuffer = '';
        var streamRenderPending = false;
        var streamReasoningStatusShown = false;
        var getFinalAssistantText = function (answer) {
            var raw = String(answer || rawStreamedAssistantText || '');
            var extracted;
            if (!isOdvPrompt) {
                return compactChatText(raw);
            }
            extracted = extractOdvFullResponseText(raw, true);
            return compactChatText(extracted.text) ||
                'ODV response did not include a FULL RESPONSE section.';
        };
        var ensureStreamedAssistant = function () {
            if (streamedAssistant) { return; }
            APP.chatStatus = 'Receiving response...';
            streamedAssistant = appendChatMessageToSession(requestSession, 'assistant', '');
            streamedAssistant.streaming = true;
            if (APP.activeChatId === requestSessionId) {
                render();
                scrollChatToEnd();
            }
        };
        var flushStreamedAssistant = function (persist) {
            if (!streamedAssistant || !streamBuffer) { return; }
            streamedAssistant.text += streamBuffer;
            streamBuffer = '';
            requestSession.updatedAt = Date.now();
            updateChatSessionOrder(requestSession);
            if (persist) { saveChatState(); }
            if (APP.activeChatId !== requestSessionId) { return; }
            if (!updateStreamingChatMessageDom(streamedAssistant)) {
                render();
                scrollChatToEnd();
            }
        };
        var queueVisibleStreamText = function (visibleText) {
            var delta;
            visibleText = String(visibleText || '');
            if (!visibleText && !streamedAssistant) { return; }
            ensureStreamedAssistant();
            if (visibleText.indexOf(lastVisibleStreamText) === 0) {
                delta = visibleText.slice(lastVisibleStreamText.length);
                if (!delta) { return; }
                streamBuffer += delta;
                lastVisibleStreamText = visibleText;
                scheduleStreamRender();
                return;
            }
            lastVisibleStreamText = visibleText;
            streamBuffer = '';
            streamedAssistant.text = visibleText;
            if (APP.activeChatId !== requestSessionId) { return; }
            if (!updateStreamingChatMessageDom(streamedAssistant)) {
                render();
                scrollChatToEnd();
            }
        };
        var scheduleStreamRender = function () {
            if (streamRenderPending) { return; }
            streamRenderPending = true;
            setTimeout(function () {
                streamRenderPending = false;
                flushStreamedAssistant(false);
            }, 120);
        };
        var streamHandlers = {
            onDelta: function (delta) {
                var extracted;
                if (!delta) { return; }
                if (isOdvPrompt) {
                    rawStreamedAssistantText += delta;
                    extracted = extractOdvFullResponseText(rawStreamedAssistantText, false);
                    if (!extracted.ready) { return; }
                    queueVisibleStreamText(extracted.text);
                    return;
                }
                ensureStreamedAssistant();
                streamBuffer += delta;
                scheduleStreamRender();
            },
            onReasoningDelta: function () {
                if (streamedAssistant || streamReasoningStatusShown || !APP.chatSending) {
                    return;
                }
                streamReasoningStatusShown = true;
                APP.chatStatus = 'Thinking locally...';
                if (APP.activeChatId === requestSessionId) {
                    render();
                    scrollChatToEnd();
                }
            }
        };
        if (!text || APP.chatSending) { return; }
        requestSession = getActiveChatSession();
        requestSessionId = requestSession.id;
        APP.chatDraft = '';
        appendChatMessageToSession(requestSession, 'user', text);
        APP.chatSending = true;
        APP.chatSendingSessionId = requestSessionId;
        chatStage = 'tasknode';
        APP.chatStatus = wantsTaskNode ? 'Loading selected Task Node context...' :
            'Building context...';
        APP.chatOptionsOpen = false;
        render();
        scrollChatToEnd();
        ensureTaskNodeForChat().then(function () {
            chatStage = 'docs';
            APP.chatStatus = 'Reading selected docs...';
            render();
            return loadSelectedChatDocContexts();
        }).then(function (docRecords) {
            chatStage = 'provider';
            APP.chatStatus = 'Thinking...';
            render();
            return callSelectedAiProvider(
                buildChatMessages(text, docRecords, requestSession),
                streamHandlers
            );
        }).then(function (answer) {
            var finalText = getFinalAssistantText(answer);
            flushStreamedAssistant(false);
            APP.chatSending = false;
            APP.chatSendingSessionId = '';
            APP.chatStatus = '';
            if (streamedAssistant) {
                streamedAssistant.streaming = false;
                streamedAssistant.text = finalText ||
                    'The provider returned an empty response.';
                saveChatState();
            } else {
                appendChatMessageToSession(requestSession, 'assistant', finalText ||
                    'The provider returned an empty response.');
            }
            scheduleChatMemoryRefresh(requestSession);
            render();
            scrollChatToEnd();
        }).catch(function (err) {
            console.error(err);
            flushStreamedAssistant(false);
            APP.chatSending = false;
            APP.chatSendingSessionId = '';
            APP.chatStatus = formatChatErrorMessage(err, chatStage);
            if (streamedAssistant) {
                streamedAssistant.streaming = false;
            }
            appendChatMessageToSession(requestSession, 'system', APP.chatStatus);
            render();
            scrollChatToEnd();
        });
    };

    var queryOuter = function (name, data, timeout) {
        return new Promise(function (resolve, reject) {
            sframeChan.query(name, data, function (err, obj) {
                if (err) { reject(new Error(err)); return; }
                resolve(obj);
            }, { timeout: timeout || 30000 });
        });
    };
    var runWalletShareAction = function (action, data, timeout) {
        return queryOuter('Q_POSTFIAT_WALLET_SHARE', {
            action: action,
            data: data || {}
        }, timeout || 30000).then(function (obj) {
            if (!obj || !obj.state) {
                throw new Error(obj && obj.error || 'POSTFIAT_WALLET_SESSION_REQUIRED');
            }
            return obj.result;
        });
    };

    var loadTaskNodeAction = function (data, timeout) {
        return queryOuter('Q_POSTFIAT_TASKNODE', {
            data: data || {}
        }, timeout || 90000).then(function (obj) {
            if (!obj || !obj.state) {
                throw new Error(obj && obj.error || 'POSTFIAT_TASKNODE_UNAVAILABLE');
            }
            return obj.result;
        });
    };

    var getWalletCore = function () {
        var Core = window.PostFiatWalletCore;
        if (!Core) { throw new Error('POSTFIAT_WALLET_CORE_UNAVAILABLE'); }
        return Core;
    };

    var requestOuterWalletSession = function () {
        return queryOuter('Q_POSTFIAT_WALLET_SESSION', null, 3000).then(function (obj) {
            if (obj && obj.state === false && obj.error) {
                throw new Error(obj.error);
            }
            if (!obj || !obj.state || !obj.wallet) { return null; }
            return {
                wallet: obj.wallet,
                accountName: obj.accountName || ''
            };
        }).catch(function (err) {
            console.error(err);
            throw err;
        });
    };

    var getWalletUnlockErrorMessage = function (err) {
        var code = err && err.message || String(err || '');
        if (code === 'MISSING_WALLET_PASSWORD') { return 'Enter your wallet password.'; }
        if (code === 'NO_SAVED_WALLET') { return 'No saved wallet exists on this browser.'; }
        if (code === 'POSTFIAT_WALLET_ACCOUNT_MISMATCH') {
            return 'Saved wallet does not match this workspace account.';
        }
        if (code === 'POSTFIAT_WALLET_CORE_UNAVAILABLE') {
            return 'Post Fiat wallet code is unavailable.';
        }
        return 'Unable to unlock saved wallet.';
    };

    var unlockSavedWalletInline = function (password) {
        if (!password) {
            APP.walletUnlockStatus = getWalletUnlockErrorMessage(new Error('MISSING_WALLET_PASSWORD'));
            render();
            return Promise.resolve(null);
        }
        APP.walletUnlocking = true;
        APP.walletUnlockStatus = 'Unlocking wallet...';
        render();
        return queryOuter('Q_POSTFIAT_WALLET_UNLOCK', {
            password: password
        }, 10000).then(function (obj) {
            if (!obj || !obj.state || !obj.wallet) {
                throw new Error(obj && obj.error || 'POSTFIAT_WALLET_SESSION_REQUIRED');
            }
            var session = setUnlockedWalletSession({ wallet: obj.wallet });
            APP.walletUnlockStatus = 'Wallet unlocked.';
            APP.walletUnlocking = false;
            render();
            return session;
        }).catch(function (err) {
            console.error(err);
            APP.wallet = null;
            APP.walletSession = null;
            APP.walletStatus = 'Locked';
            APP.walletUnlocking = false;
            APP.walletUnlockStatus = getWalletUnlockErrorMessage(err);
            UI.warn(APP.walletUnlockStatus);
            render();
            return null;
        });
    };

    var getLoggedInWalletAccount = function () {
        var metadataMgr = common && common.getMetadataMgr && common.getMetadataMgr();
        var privateData = metadataMgr && metadataMgr.getPrivateData && metadataMgr.getPrivateData();
        var userData = metadataMgr && metadataMgr.getUserData && metadataMgr.getUserData();
        var accountName = privateData && privateData.accountName || userData && userData.name;

        return isWalletAddress(accountName) ? accountName : '';
    };

    var getActiveWalletAddress = function () {
        return APP.wallet && APP.wallet.address ||
            APP.walletSession && APP.walletSession.wallet &&
                APP.walletSession.wallet.address ||
            getLoggedInWalletAccount();
    };

    var setUnlockedWalletSession = function (session) {
        var Core = getWalletCore();
        var accountName;
        var outerAccountName;

        if (!session || (!session.mnemonic && !session.wallet)) {
            throw new Error('POSTFIAT_WALLET_SESSION_REQUIRED');
        }
        if (!session.wallet && session.mnemonic) {
            session.wallet = Core.deriveWalletFromMnemonic(session.mnemonic);
        }
        outerAccountName = isWalletAddress(session.accountName) ? session.accountName : '';
        if (outerAccountName && session.wallet.address !== outerAccountName) {
            if (Core && typeof(Core.clearSessionWallet) === 'function') {
                Promise.resolve(Core.clearSessionWallet()).catch(function (err) {
                    console.error(err);
                });
            }
            throw new Error('POSTFIAT_WALLET_ACCOUNT_MISMATCH');
        }
        accountName = getLoggedInWalletAccount();
        if (outerAccountName && accountName && outerAccountName !== accountName) {
            if (Core && typeof(Core.clearSessionWallet) === 'function') {
                Promise.resolve(Core.clearSessionWallet()).catch(function (err) {
                    console.error(err);
                });
            }
            throw new Error('POSTFIAT_WALLET_ACCOUNT_MISMATCH');
        }
        if (accountName && session.wallet.address !== accountName) {
            if (Core && typeof(Core.clearSessionWallet) === 'function') {
                Promise.resolve(Core.clearSessionWallet()).catch(function (err) {
                    console.error(err);
                });
            }
            throw new Error('POSTFIAT_WALLET_ACCOUNT_MISMATCH');
        }
        APP.wallet = session.wallet;
        APP.walletSession = session;
        APP.walletStatus = 'Unlocked';
        return session;
    };

    var getSessionWallet = function () {
        if (APP.walletSession && APP.walletSession.wallet) {
            return Promise.resolve(setUnlockedWalletSession(APP.walletSession));
        }
        return requestOuterWalletSession().then(function (session) {
            return setUnlockedWalletSession(session);
        });
    };

    var openTopLevel = function (href) {
        try {
            window.top.location.href = href;
            return;
        } catch (err) {
            console.error(err);
        }
        common.openURL(href);
    };

    var openWalletUnlock = function () {
        APP.walletUnlockStatus = APP.walletUnlockStatus || 'Unlock your saved wallet here.';
        setRoute('settings');
    };

    var clearWalletSession = function () {
        try {
            var Core = getWalletCore();
            if (typeof(Core.clearSessionWallet) === 'function') {
                return Promise.resolve(Core.clearSessionWallet());
            }
        } catch (err) {
            console.error(err);
        }
        return Promise.resolve();
    };

    var lockWalletSession = function () {
        clearWalletSession().catch(function (err) {
            console.error(err);
        }).then(function () {
            APP.wallet = null;
            APP.walletSession = null;
            clearInboxDirectoryState();
            clearTaskNodeState();
            APP.peerLoaded = false;
            APP.peerBalance = null;
            APP.walletStatus = 'Locked';
            APP.settingsStatus = 'Wallet locked.';
            UI.log('Post Fiat wallet locked.');
            render();
        });
    };

    var switchWalletSession = function () {
        APP.walletStatus = 'Logging out';
        APP.walletUnlockStatus = '';
        render();
        queryOuter('Q_POSTFIAT_WALLET_SWITCH', null, 10000).catch(function (err) {
            console.error(err);
            return clearWalletSession();
        }).then(function () {
            APP.wallet = null;
            APP.walletSession = null;
            clearInboxDirectoryState();
            clearTaskNodeState();
            APP.peerLoaded = false;
            APP.peerBalance = null;
            openTopLevel('/login/');
        });
    };

    var isWalletSessionError = function (err) {
        return err && (
            err.message === 'POSTFIAT_WALLET_SESSION_REQUIRED' ||
            err.message === 'POSTFIAT_WALLET_ACCOUNT_MISMATCH'
        );
    };

    var isWalletAccountMismatch = function (err) {
        return err && err.message === 'POSTFIAT_WALLET_ACCOUNT_MISMATCH';
    };

    var handleWalletSessionRequired = function (message) {
        APP.wallet = null;
        APP.walletSession = null;
        clearInboxDirectoryState();
        clearTaskNodeState();
        APP.peerLoaded = false;
        APP.peerBalance = null;
        APP.walletStatus = 'Locked';
        UI.warn(message || 'Unlock your Post Fiat wallet first.');
    };

    var getShareErrorMessage = function (err) {
        var code = err && err.message;
        if (code === 'POSTFIAT_RECIPIENT_DIRECTORY_NOT_FOUND') {
            return 'Recipient wallet has not published a sharing inbox yet.';
        }
        if (code === 'POSTFIAT_RECIPIENT_DIRECTORY_INVALID') {
            return 'Recipient sharing inbox is invalid. Ask them to publish it again.';
        }
        if (code === 'MISSING_NOSTR_RELAYS') {
            return 'Add at least one relay before sending.';
        }
        if (code === 'MISSING_POSTFIAT_RECIPIENT') {
            return 'Enter a recipient wallet address or inbox.';
        }
        if (code === 'POSTFIAT_SELF_MESSAGE') {
            return 'Recipient is the active wallet. Switch wallets or enter a different recipient.';
        }
        if (code === 'INVALID_POSTFIAT_RECIPIENT') {
            return 'Recipient is not a valid wallet address or inbox.';
        }
        if (code === 'POSTFIAT_WALLET_ACCOUNT_MISMATCH') {
            return 'Unlocked wallet does not match this workspace account.';
        }
        if (code === 'MISSING_POSTFIAT_CHAT_TEXT') {
            return 'Enter a message before sending.';
        }
        if (code === 'POSTFIAT_CHAT_TEXT_TOO_LONG') {
            return 'Message is too long for this Nostr payload.';
        }
        if (code === 'INVALID_PFT_AMOUNT') {
            return 'Enter a positive PFT amount with up to 6 decimal places.';
        }
        if (code === 'actNotFound') {
            return 'This PFTL account is not funded yet.';
        }
        return code || 'Unable to send share.';
    };

    var clearInboxDirectoryState = function () {
        APP.inboxDirectory = null;
        APP.inboxDirectoryState = 'idle';
        APP.inboxPublishedRelays = [];
        APP.inboxPublishFailures = [];
    };

    var clearTaskNodeState = function () {
        APP.taskNode = null;
        APP.taskNodeLoaded = false;
        APP.taskNodeLoading = false;
        APP.taskNodePromise = null;
        APP.taskNodeStatus = '';
    };

    var getTaskNodePrimaryCacheStorage = function () {
        try {
            return window.localStorage || window.sessionStorage || null;
        } catch (err) {
            return null;
        }
    };

    var getTaskNodeCacheStorages = function () {
        var stores = [];
        var add = function (storage) {
            if (!storage || stores.indexOf(storage) !== -1) { return; }
            stores.push(storage);
        };
        try { add(window.localStorage); } catch (err) {}
        try { add(window.sessionStorage); } catch (err) {}
        return stores;
    };

    var getTaskNodeCacheKey = function (walletAddress) {
        return TASKNODE_HISTORY_CACHE_PREFIX + walletAddress;
    };

    var taskNodeHistoryHasReadableContent = function (data) {
        var events = data && Array.isArray(data.taskEvents) ? data.taskEvents : [];
        if ((data && data.latestContext && data.latestContext.text) || !events.length) {
            return true;
        }
        return events.some(function (event) {
            return Boolean(event && event.decrypted && taskNodeDisplayText(event));
        });
    };

    var taskNodeHistoryCacheIsReusable = function (data) {
        var taskCount = Number(data && data.taskEventCount) || 0;
        var contextCount = Number(data && data.contextUpdateCount) || 0;
        if (!data) { return false; }
        if (!taskCount && !contextCount) { return false; }
        return taskNodeHistoryHasReadableContent(data);
    };

    var readTaskNodeSessionCache = function (walletAddress) {
        var storages = getTaskNodeCacheStorages();
        var prefixes = [TASKNODE_HISTORY_CACHE_PREFIX]
            .concat(TASKNODE_HISTORY_CACHE_LEGACY_PREFIXES);
        var now = Date.now();
        var raw;
        var record;
        var key;
        var storage;
        if (!walletAddress) { return null; }
        for (var s = 0; s < storages.length; s++) {
            storage = storages[s];
            for (var p = 0; p < prefixes.length; p++) {
                key = prefixes[p] + walletAddress;
                try {
                    raw = storage.getItem(key);
                    if (!raw) { continue; }
                    record = JSON.parse(raw);
                    if (!record || record.version !== TASKNODE_HISTORY_CACHE_VERSION ||
                            record.walletAddress !== walletAddress || !record.data ||
                            record.expiresAt < now ||
                            !taskNodeHistoryCacheIsReusable(record.data)) {
                        storage.removeItem(key);
                        continue;
                    }
                    return record;
                } catch (err) {
                    try {
                        storage.removeItem(key);
                    } catch (removeErr) {
                        console.error(removeErr);
                    }
                }
            }
        }
        return null;
    };

    var writeTaskNodeSessionCache = function (walletAddress, data) {
        var storage = getTaskNodePrimaryCacheStorage();
        var now = Date.now();
        if (!storage || !walletAddress || !data) { return; }
        if (!taskNodeHistoryCacheIsReusable(data)) { return; }
        try {
            storage.setItem(getTaskNodeCacheKey(walletAddress), JSON.stringify({
                version: TASKNODE_HISTORY_CACHE_VERSION,
                walletAddress: walletAddress,
                cachedAt: now,
                expiresAt: now + TASKNODE_HISTORY_CACHE_TTL_MS,
                data: data
            }));
        } catch (err) {
            console.error(err);
        }
    };

    var loadCachedTaskNodeForWallet = function (walletAddress, messageTemplate) {
        var cachedRecord = readTaskNodeSessionCache(walletAddress);
        if (!cachedRecord || !cachedRecord.data) { return false; }
        APP.taskNode = cachedRecord.data;
        APP.taskNodeLoaded = true;
        APP.taskNodeLoading = false;
        APP.taskNodeStatus = String(messageTemplate || 'Using cached Task Node history from {time}.')
            .replace('{time}', new Date(cachedRecord.cachedAt).toLocaleString());
        scheduleChatTaskContextPackRefresh(false);
        return true;
    };

    var clearTaskNodeSessionCache = function (walletAddress) {
        var storages = getTaskNodeCacheStorages();
        var prefixes = [TASKNODE_HISTORY_CACHE_PREFIX]
            .concat(TASKNODE_HISTORY_CACHE_LEGACY_PREFIXES);
        var i;
        var key;
        storages.forEach(function (storage) {
            try {
                if (walletAddress) {
                    prefixes.forEach(function (prefix) {
                        storage.removeItem(prefix + walletAddress);
                    });
                    return;
                }
                for (i = storage.length - 1; i >= 0; i--) {
                    key = storage.key(i);
                    if (key && prefixes.some(function (prefix) {
                        return key.indexOf(prefix) === 0;
                    })) {
                        storage.removeItem(key);
                    }
                }
            } catch (err) {
                console.error(err);
            }
        });
    };

    var getRelayFailureMessage = function (result) {
        return result.relayUrl + ': ' + (result.message || 'Connection failed');
    };

    var getUsableHref = function (value) {
        var href = String(value || '');
        if (href.indexOf('#') === -1) { return ''; }
        return href;
    };

    var getDocHref = function (doc, mode) {
        if (mode === 'view') {
            return getUsableHref(doc.roHref) || getUsableHref(doc.href);
        }
        return getUsableHref(doc.href) || getUsableHref(doc.roHref);
    };

    var getDocType = function (href) {
        try {
            return Hash.parsePadUrl(href).type || 'pad';
        } catch (err) {
            return 'pad';
        }
    };

    var collectRootIds = function (root, out) {
        out = out || {};
        if (!root || typeof(root) !== 'object') { return out; }
        Object.keys(root).forEach(function (key) {
            var value = root[key];
            if (typeof(value) === 'number' || typeof(value) === 'string') {
                out[String(value)] = true;
                return;
            }
            if (value && typeof(value) === 'object' && value.metadata !== true) {
                collectRootIds(value, out);
            }
        });
        return out;
    };

    var collectTrashIds = function (trash, out) {
        out = out || {};
        if (!trash || typeof(trash) !== 'object') { return out; }
        Object.keys(trash).forEach(function (key) {
            var list = trash[key];
            if (!Array.isArray(list)) { return; }
            list.forEach(function (entry) {
                var value = entry && entry.element;
                if (typeof(value) === 'number' || typeof(value) === 'string') {
                    out[String(value)] = true;
                    return;
                }
                collectRootIds(value, out);
            });
        });
        return out;
    };

    var normalizeDriveDocs = function (driveObject) {
        var drive = (driveObject && driveObject.drive) || {};
        var filesData = drive.filesData || {};
        var rootIds = collectRootIds(drive.root || {});
        var trashIds = collectTrashIds(drive.trash || {});
        var templateIds = {};
        (drive.template || []).forEach(function (id) {
            templateIds[String(id)] = true;
        });
        return Object.keys(filesData).map(function (id) {
            var data = filesData[id] || {};
            var href = getUsableHref(data.href);
            var roHref = getUsableHref(data.roHref);
            var bestHref = href || roHref;
            return {
                id: String(id),
                title: data.filename || data.title || 'Untitled document',
                href: href,
                roHref: roHref,
                type: getDocType(bestHref),
                atime: data.atime || data.ctime || 0,
                ctime: data.ctime || 0,
                tags: data.tags || [],
                root: Boolean(rootIds[String(id)]),
                trash: Boolean(trashIds[String(id)]),
                template: Boolean(templateIds[String(id)]),
                channel: data.channel,
                password: data.password || '',
            };
        }).filter(function (doc) {
            return getDocHref(doc, 'view');
        }).sort(function (a, b) {
            return (b.atime || b.ctime || 0) - (a.atime || a.ctime || 0);
        });
    };

    var loadDrive = function () {
        return queryOuter('Q_DRIVE_GETOBJECT', null).then(function (obj) {
            APP.docs = normalizeDriveDocs(obj);
            APP.driveLoaded = true;
        });
    };

    var loadContacts = function () {
        return new Promise(function (resolve) {
            PostFiatContacts.list(common, function (err, contacts) {
                if (err) {
                    console.error(err);
                    APP.contacts = [];
                    resolve();
                    return;
                }
                APP.contacts = contacts || [];
                resolve();
            });
        });
    };

    var openHref = function (href) {
        if (!href) { return; }
        if (href.charAt(0) === '/') {
            common.openURL(href);
            return;
        }
        common.openUnsafeURL(href);
    };

    var compactChatText = function (value) {
        return String(value || '')
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
    };

    var truncateChatText = function (value, limit) {
        var text = compactChatText(value);
        var omitted;
        if (!limit || text.length <= limit) { return text; }
        omitted = text.length - limit;
        return text.slice(0, limit).trim() +
            '\n\n[... ' + omitted.toLocaleString() + ' characters truncated ...]';
    };

    var getSelectedChatDocs = function () {
        var options = APP.chatOptions || getDefaultChatOptions();
        var selected = {};
        options.selectedDocIds.forEach(function (docId) {
            selected[String(docId)] = true;
        });
        return APP.docs.filter(function (doc) {
            return selected[doc.id] && !doc.trash;
        });
    };

    var getFilteredChatDocs = function () {
        var search = String(APP.chatDocSearch || '').toLowerCase();
        return APP.docs.filter(function (doc) {
            if (doc.trash) { return false; }
            if (!search) { return true; }
            return doc.title.toLowerCase().indexOf(search) !== -1 ||
                doc.type.toLowerCase().indexOf(search) !== -1;
        }).slice(0, 40);
    };

    var setChatSourceOption = function (key, value) {
        APP.chatOptions = APP.chatOptions || getDefaultChatOptions();
        APP.chatOptions[key] = value;
        saveChatOptions();
        render();
    };

    var setChatPromptMode = function (mode) {
        APP.chatOptions = APP.chatOptions || getDefaultChatOptions();
        APP.chatOptions.promptMode = normalizeChatPromptMode(mode);
        if (APP.chatOptions.promptMode === CHAT_PROMPT_ODV) {
            APP.chatOptions.thinking = false;
        }
        saveChatOptions();
        render();
    };

    var toggleChatDocSelection = function (docId) {
        var options = APP.chatOptions || getDefaultChatOptions();
        var selected = {};
        options.selectedDocIds.forEach(function (id) {
            selected[String(id)] = true;
        });
        docId = String(docId);
        if (selected[docId]) {
            delete selected[docId];
        } else {
            selected[docId] = true;
        }
        options.selectedDocIds = Object.keys(selected).slice(0, 12);
        APP.chatOptions = options;
        saveChatOptions();
        render();
    };

    var hyperjsonToText = function (value) {
        var node;
        try {
            node = Hyperjson.toDOM(value);
            return compactChatText(node.textContent || node.innerText || '');
        } catch (err) {
            console.error(err);
            return '';
        }
    };

    var isHyperjsonNode = function (value) {
        return Array.isArray(value) && typeof(value[0]) === 'string' &&
            value[1] && typeof(value[1]) === 'object' && Array.isArray(value[2]);
    };

    var extractChatDocText = function (value, depth) {
        var parsed;
        var keys;
        var text;
        if (value === null || typeof(value) === 'undefined') { return ''; }
        if (value && value.tagName) {
            return compactChatText(value.textContent || value.innerText || '');
        }
        if (typeof(value) === 'string') {
            text = compactChatText(value);
            if (/^[\[{]/u.test(text)) {
                try {
                    parsed = JSON.parse(text);
                    return extractChatDocText(parsed, (depth || 0) + 1) || text;
                } catch (err) {
                    return text;
                }
            }
            return text;
        }
        if (Array.isArray(value)) {
            if (isHyperjsonNode(value)) {
                return hyperjsonToText(value);
            }
            return compactChatText(value.map(function (entry) {
                return extractChatDocText(entry, (depth || 0) + 1);
            }).filter(Boolean).join('\n\n'));
        }
        if (typeof(value) === 'object') {
            if ((depth || 0) > 4) {
                try {
                    return truncateChatText(JSON.stringify(value), 3000);
                } catch (err) {
                    return '';
                }
            }
            keys = [
                'content',
                'text',
                'markdown',
                'body',
                'html',
                'userDoc',
                'document',
                'doc',
                'data'
            ];
            for (var i = 0; i < keys.length; i++) {
                if (typeof(value[keys[i]]) !== 'undefined') {
                    text = extractChatDocText(value[keys[i]], (depth || 0) + 1);
                    if (text) { return text; }
                }
            }
            try {
                return truncateChatText(JSON.stringify(value, null, 2), 5000);
            } catch (err) {
                return '';
            }
        }
        return compactChatText(value);
    };

    var loadChatDocContent = function (doc) {
        var cached = APP.chatDocCache[doc.id];
        var href;
        var parsed;
        var pending;
        if (cached && cached.text) { return Promise.resolve(cached); }
        if (APP.chatDocLoading[doc.id]) { return APP.chatDocLoading[doc.id]; }
        href = getDocHref(doc, 'view') || getDocHref(doc, 'edit');
        try {
            parsed = Hash.parsePadUrl(href);
        } catch (err) {
            return Promise.reject(err);
        }
        if (!parsed || !parsed.hash) {
            return Promise.reject(new Error('Document link is missing a readable hash.'));
        }
        pending = new Promise(function (resolve, reject) {
            common.getPad({
                hash: parsed.hash,
                opts: {
                    password: doc.password || ''
                }
            }, function (err, value) {
                var record;
                if (err) {
                    reject(new Error(String(err && err.error || err)));
                    return;
                }
                record = {
                    id: doc.id,
                    title: doc.title,
                    type: doc.type,
                    text: truncateChatText(extractChatDocText(value), 12000),
                    loadedAt: Date.now()
                };
                APP.chatDocCache[doc.id] = record;
                resolve(record);
            });
        });
        APP.chatDocLoading[doc.id] = pending;
        pending.then(function () {
            delete APP.chatDocLoading[doc.id];
        }).catch(function (err) {
            APP.chatDocCache[doc.id] = {
                id: doc.id,
                title: doc.title,
                type: doc.type,
                text: '',
                error: err.message || 'Unable to read document.',
                loadedAt: Date.now()
            };
            delete APP.chatDocLoading[doc.id];
        });
        return pending;
    };

    var fallbackCopyText = function (value) {
        var text = String(value || '');
        var ta = document.createElement('textarea');
        var copied = false;
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '-9999px';
        ta.style.width = '1px';
        ta.style.height = '1px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        if (ta.setSelectionRange) {
            ta.setSelectionRange(0, text.length);
        }
        try {
            copied = Boolean(document.execCommand && document.execCommand('copy'));
        } catch (err) {
            copied = false;
        }
        document.body.removeChild(ta);
        return copied;
    };

    var copyText = function (value, success) {
        var text = String(value || '');
        if (!text) {
            UI.warn(Messages.error);
            return;
        }
        if (fallbackCopyText(text)) {
            UI.log(success || Messages.copied || 'Copied.');
            return;
        }
        Clipboard.copy(text, function (err) {
            if (err && !fallbackCopyText(text)) {
                UI.warn(Messages.error);
                return;
            }
            UI.log(success || Messages.copied || 'Copied.');
        });
    };

    var parseRecipient = function (value, relays) {
        var text = String(value || '').trim();
        if (!text) { throw new Error('MISSING_POSTFIAT_RECIPIENT'); }
        var recipient = text[0] === '{' ? JSON.parse(text) :
            isWalletAddress(text) ? { walletAddress: text } : { publicKeyHex: text };
        if (!Array.isArray(recipient.relays) || !recipient.relays.length) {
            recipient.relays = relays;
        }
        return recipient;
    };

    var shareDocument = function () {
        var doc = APP.shareDoc;
        var mode = $('[name="pft-share-mode"]:checked').val() || 'edit';
        var relayList = parseRelayInput($('#pft-share-relays').val());
        var href = getDocHref(doc, mode);
        var recipientText = $('#pft-share-recipient').val();
        if (!href) {
            APP.shareStatus = 'No usable document link.';
            render();
            return;
        }
        APP.shareStatus = 'Sending...';
        render();
        getSessionWallet().then(function () {
            var recipient = parseRecipient(recipientText, relayList);
            return runWalletShareAction('PUBLISH_LIVE_PAD_PRIVATE_SHARE', {
                recipientDirectory: recipient,
                fallbackRelays: relayList,
                directoryRelays: relayList,
                origin: getPostFiatNostrOrigin(),
                href: href,
                title: doc.title,
                mode: mode,
                timeoutMs: 10000
            });
        }).then(function (result) {
            var accepted = result.publishResults.filter(function (r) {
                return r.accepted;
            }).length;
            APP.shareStatus = accepted ?
                'Sent to ' + accepted + ' relay(s).' :
                'No relay accepted the share.';
            render();
        }).catch(function (err) {
            console.error(err);
            if (isWalletSessionError(err)) {
                APP.shareStatus = isWalletAccountMismatch(err) ?
                    getShareErrorMessage(err) : 'Unlock your wallet first.';
                handleWalletSessionRequired(APP.shareStatus);
                render();
                return;
            }
            APP.shareStatus = getShareErrorMessage(err);
            render();
            UI.warn(APP.shareStatus);
        });
    };

    var fetchInbox = function () {
        var relayList = parseRelayInput($('#pft-inbox-relays').val() || getPostFiatRelays().join('\n'));
        APP.inboxLoading = true;
        APP.inboxStatus = 'Refreshing...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('FETCH_AND_OPEN_LIVE_PAD_PRIVATE_SHARES', {
                relayUrls: relayList,
                fallbackRelays: relayList,
                origin: getPostFiatNostrOrigin(),
                limit: 50,
                timeoutMs: 10000
            });
        }).then(function (inbox) {
            APP.inbox = inbox.shares || [];
            APP.inboxLoaded = true;
            APP.inboxStatus = inbox.failures && inbox.failures.length ?
                inbox.failures.length + ' message(s) could not be decrypted.' : 'Refreshed.';
            APP.inboxLoading = false;
            render();
        }).catch(function (err) {
            console.error(err);
            APP.inbox = [];
            APP.inboxLoaded = true;
            APP.inboxLoading = false;
            if (isWalletSessionError(err)) {
                APP.inboxStatus = isWalletAccountMismatch(err) ?
                    'Unlocked wallet does not match this workspace account.' :
                    'Unlock your wallet first.';
                handleWalletSessionRequired(APP.inboxStatus);
                render();
                return;
            }
            APP.inboxStatus = err.message || 'Unable to refresh inbox.';
            render();
        });
    };

    var refreshTaskNode = function (force) {
        var cachedRecord = null;
        var walletAddress = getActiveWalletAddress();
        var promise;
        force = force === true;
        if (APP.taskNodeLoading && APP.taskNodePromise) {
            return APP.taskNodePromise;
        }
        if (!force && loadCachedTaskNodeForWallet(walletAddress,
                'Using cached Task Node history from {time}. Refresh manually to check the chain.')) {
            render();
            return Promise.resolve(APP.taskNode);
        }
        APP.taskNodeLoading = true;
        APP.taskNodeStatus = 'Loading Task Node history...';
        render();
        promise = getSessionWallet().then(function (session) {
            walletAddress = session && session.wallet && session.wallet.address || '';
            cachedRecord = readTaskNodeSessionCache(walletAddress);
            if (cachedRecord && (!APP.taskNodeLoaded || !APP.taskNode)) {
                APP.taskNode = cachedRecord.data;
                APP.taskNodeLoaded = true;
                APP.taskNodeStatus = 'Showing cached Task Node history from ' +
                    new Date(cachedRecord.cachedAt).toLocaleString() + ' while refreshing...';
                render();
            }
            return loadTaskNodeAction({
                accountTxLimit: 200,
                maxPages: 8,
                maxTaskDetails: 120,
                maxContextDetails: 5,
                timeoutMs: 20000
            }, 90000);
        }).then(function (result) {
            APP.taskNode = result;
            APP.taskNodeLoaded = true;
            APP.taskNodeLoading = false;
            APP.taskNodeStatus = 'Loaded ' + (result.taskEventCount || 0) +
                ' task event(s) and ' + (result.contextUpdateCount || 0) +
                ' context update(s).';
            writeTaskNodeSessionCache(walletAddress || result.walletAddress, result);
            scheduleChatTaskContextPackRefresh(true);
            render();
        }).catch(function (err) {
            console.error(err);
            APP.taskNodeLoading = false;
            if (cachedRecord && cachedRecord.data) {
                APP.taskNode = cachedRecord.data;
                APP.taskNodeLoaded = true;
                APP.taskNodeStatus = 'Showing cached Task Node history; refresh failed: ' +
                    (err.message || 'Unable to refresh.');
                render();
                return;
            }
            APP.taskNode = null;
            APP.taskNodeLoaded = true;
            if (isWalletSessionError(err)) {
                APP.taskNodeStatus = isWalletAccountMismatch(err) ?
                    'Unlocked wallet does not match this workspace account.' :
                    'Unlock your wallet first.';
                handleWalletSessionRequired(APP.taskNodeStatus);
                render();
                return;
            }
            if (err && err.message === 'PFTL RPC is not configured') {
                APP.taskNodeStatus = 'PFTL RPC is not configured for this instance.';
            } else {
                APP.taskNodeStatus = err.message || 'Unable to load Task Node history.';
            }
            render();
        });
        APP.taskNodePromise = promise.then(function (result) {
            APP.taskNodePromise = null;
            return result;
        });
        return APP.taskNodePromise;
    };

    var saveInboxPayload = function (payload) {
        var href = payload && payload.href;
        if (!href) { return void UI.warn(Messages.error); }
        queryOuter('Q_STORE_IN_TEAM', {
            href: href,
            password: payload.password,
            path: ['root'],
            title: payload.title || '',
            teamId: -1
        }).then(function () {
            UI.log(Messages.saved);
            return loadDrive();
        }).then(render).catch(function (err) {
            console.error(err);
            UI.warn(Messages.error);
        });
    };

    var copyInboxDirectory = function () {
        var relayList = parseRelayInput($('#pft-settings-relays').val() || getPostFiatRelays().join('\n'));
        APP.settingsStatus = 'Building inbox...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('BUILD_OWN_NOSTR_INBOX_DIRECTORY', {
                fallbackRelays: relayList,
                origin: getPostFiatNostrOrigin()
            });
        }).then(function (directory) {
            APP.inboxDirectory = directory;
            APP.inboxDirectoryState = 'copied';
            APP.inboxPublishedRelays = [];
            APP.inboxPublishFailures = [];
            copyText(JSON.stringify(directory, null, 2), 'Inbox copied.');
            APP.settingsStatus = 'Inbox JSON copied. Wallet-address sharing still needs a published inbox.';
            render();
        }).catch(function (err) {
            console.error(err);
            if (isWalletSessionError(err)) {
                APP.settingsStatus = isWalletAccountMismatch(err) ?
                    'Unlocked wallet does not match this workspace account.' :
                    'Unlock your wallet first.';
                handleWalletSessionRequired(APP.settingsStatus);
                render();
                return;
            }
            APP.settingsStatus = err.message || 'Unable to build inbox.';
            render();
        });
    };

    var publishInboxDirectory = function () {
        var relayList = parseRelayInput($('#pft-settings-relays').val() || getPostFiatRelays().join('\n'));
        APP.inboxDirectoryState = 'publishing';
        APP.inboxPublishedRelays = [];
        APP.inboxPublishFailures = [];
        APP.settingsStatus = 'Publishing inbox...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('PUBLISH_OWN_NOSTR_INBOX_DIRECTORY', {
                fallbackRelays: relayList,
                relayUrls: relayList,
                origin: getPostFiatNostrOrigin(),
                timeoutMs: 10000
            });
        }).then(function (published) {
            var acceptedResults = published.publishResults.filter(function (r) {
                return r.accepted;
            });
            var rejectedResults = published.publishResults.filter(function (r) {
                return !r.accepted;
            });
            var accepted = acceptedResults.length;
            APP.inboxDirectory = published.directory;
            APP.inboxPublishedRelays = acceptedResults.map(function (r) { return r.relayUrl; });
            APP.inboxPublishFailures = rejectedResults;
            APP.inboxDirectoryState = accepted ? 'published' : 'failed';
            if (accepted) {
                APP.settingsStatus = 'Sharing inbox published for ' + published.directory.walletAddress +
                    ' on ' + accepted + ' relay(s).';
                UI.log(APP.settingsStatus);
            } else {
                APP.settingsStatus = 'Inbox was not published. No relay accepted it.';
                UI.warn(APP.settingsStatus);
            }
            render();
        }).catch(function (err) {
            console.error(err);
            if (isWalletSessionError(err)) {
                APP.settingsStatus = isWalletAccountMismatch(err) ?
                    'Unlocked wallet does not match this workspace account.' :
                    'Unlock your wallet first.';
                handleWalletSessionRequired(APP.settingsStatus);
                render();
                return;
            }
            APP.settingsStatus = err.message || 'Unable to publish inbox.';
            render();
        });
    };

    var getPeerRelayList = function () {
        var value = $('#pft-peer-relays').val() || APP.peerRelaysInput ||
            getPostFiatRelays().join('\n');
        APP.peerRelaysInput = String(value || '');
        return parseRelayInput(value);
    };

    var getAppOrigin = function () {
        return getPostFiatNostrOrigin();
    };

    var saveResolvedPeerContact = function (recipient) {
        if (!recipient || !recipient.publicKeyHex) { return; }
        PostFiatContacts.upsert(common, {
            walletAddress: recipient.walletAddress || '',
            publicKeyHex: recipient.publicKeyHex,
            relays: recipient.relays || [],
            label: recipient.walletAddress || shortText(recipient.publicKeyHex)
        }, function (err) {
            if (err) { return void console.error(err); }
            loadContacts().then(render).catch(function (loadErr) {
                console.error(loadErr);
            });
        });
    };

    var refreshPeerMessages = function () {
        var relayList = getPeerRelayList();
        APP.peerLoading = true;
        APP.peerStatus = 'Refreshing Nostr messages...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('FETCH_AND_OPEN_PEER_CHAT_MESSAGES', {
                relayUrls: relayList,
                fallbackRelays: relayList,
                origin: getAppOrigin(),
                limit: 120,
                timeoutMs: 10000
            });
        }).then(function (inbox) {
            var active = APP.activePeerConversationId;
            var count = mergeFetchedPeerMessages(inbox);
            if (active && APP.peerConversations.some(function (conversation) {
                    return conversation.id === active;
                })) {
                APP.activePeerConversationId = active;
            }
            APP.peerLoading = false;
            APP.peerLoaded = true;
            APP.peerStatus = count ? 'Loaded ' + count + ' new message(s).' :
                'No new peer messages.';
            savePeerMessageState();
            render();
        }).catch(function (err) {
            console.error(err);
            APP.peerLoading = false;
            APP.peerLoaded = true;
            APP.peerStatus = isWalletSessionError(err) ? 'Unlock your wallet first.' :
                (err.message || 'Unable to refresh messages.');
            if (isWalletSessionError(err)) {
                handleWalletSessionRequired(APP.peerStatus);
            }
            render();
        });
    };

    var sendPeerMessage = function (options) {
        options = options || {};
        var text = compactChatText(options.text || $('#pft-peer-input').val() || APP.peerDraft);
        var relayList = getPeerRelayList();
        var active = getActivePeerConversation();
        var recipient;
        if (!text || APP.peerSending) { return; }
        try {
            recipient = APP.peerRecipientInput ?
                parsePeerRecipientInput(APP.peerRecipientInput, relayList) :
                (active && active.recipient ? active.recipient : null);
            if (!recipient) { throw new Error('MISSING_POSTFIAT_RECIPIENT'); }
            if (recipient.walletAddress && recipient.walletAddress === getActiveWalletAddress()) {
                throw new Error('POSTFIAT_SELF_MESSAGE');
            }
        } catch (err) {
            APP.peerStatus = getShareErrorMessage(err);
            render();
            return;
        }
        APP.peerSending = true;
        APP.peerStatus = 'Sending over Nostr...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('PUBLISH_PEER_CHAT_MESSAGE', {
                recipientDirectory: recipient,
                fallbackRelays: relayList,
                directoryRelays: relayList,
                origin: getAppOrigin(),
                text: text,
                payment: options.payment || null,
                timeoutMs: 10000
            });
        }).then(function (published) {
            var accepted = published.publishResults.filter(function (result) {
                return result.accepted;
            }).length;
            var conversation = upsertPeerConversation(published.recipient || recipient);
            appendPeerMessage(conversation, {
                id: published.rumor && published.rumor.id || published.giftWrap && published.giftWrap.id,
                eventId: published.giftWrap && published.giftWrap.id || '',
                direction: 'out',
                text: published.payload && published.payload.text || text,
                payment: published.payload && published.payload.payment || options.payment || null,
                createdAt: Date.parse(published.payload && published.payload.createdAt || '') || Date.now()
            });
            APP.peerDraft = '';
            APP.peerRecipientInput = '';
            APP.peerSending = false;
            APP.peerStatus = accepted ? 'Sent to ' + accepted + ' relay(s).' :
                'No relay accepted the message.';
            savePeerMessageState();
            saveResolvedPeerContact(published.recipient);
            render();
        }).catch(function (err) {
            console.error(err);
            APP.peerSending = false;
            APP.peerStatus = isWalletSessionError(err) ? 'Unlock your wallet first.' :
                getShareErrorMessage(err);
            if (isWalletSessionError(err)) {
                handleWalletSessionRequired(APP.peerStatus);
            }
            render();
        });
    };

    var refreshPftBalance = function () {
        var pftl = getPostFiatPftlConfig();
        APP.peerBalanceStatus = 'Checking PFT balance...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('FETCH_PFT_BALANCE', {
                currency: pftl.pftCurrency || 'PFT',
                timeoutMs: 10000
            });
        }).then(function (balance) {
            APP.peerBalance = balance;
            APP.peerBalanceStatus = balance.balance + ' ' + balance.currency + ' available.';
            render();
        }).catch(function (err) {
            console.error(err);
            APP.peerBalanceStatus = getShareErrorMessage(err) || 'Unable to check PFT balance.';
            render();
        });
    };

    var submitPeerPftPayment = function () {
        var active = getActivePeerConversation();
        var pftl = getPostFiatPftlConfig();
        var amount = String($('#pft-peer-pft-amount').val() || APP.peerPaymentAmount || '').trim();
        var destination = getPeerPaymentDestination(active);
        var activeWallet = getActiveWalletAddress();
        if (!destination) {
            APP.peerPaymentStatus = 'This conversation does not have a wallet address.';
            render();
            return;
        }
        if (activeWallet && destination === activeWallet) {
            APP.peerPaymentStatus = getShareErrorMessage(new Error('POSTFIAT_SELF_MESSAGE'));
            render();
            return;
        }
        if (!amount) {
            APP.peerPaymentStatus = 'Enter a PFT amount.';
            render();
            return;
        }
        APP.peerPaymentStatus = 'Submitting PFT payment...';
        render();
        getSessionWallet().then(function () {
            return runWalletShareAction('SUBMIT_PFT_PAYMENT', {
                destination: destination,
                amount: amount,
                currency: pftl.pftCurrency || 'PFT',
                networkId: pftl.networkId,
                memoText: 'PFT Docs peer payment',
                timeoutMs: 15000
            });
        }).then(function (payment) {
            var txHash = payment.hash || payment.result && payment.result.tx_json &&
                payment.result.tx_json.hash || '';
            var message = 'Sent ' + payment.amount + ' ' + payment.currency +
                (txHash ? ' in tx ' + shortText(txHash) : '.');
            APP.peerPaymentAmount = '';
            APP.peerPaymentStatus = txHash ? 'Submitted ' + txHash : 'Payment submitted.';
            if (active || APP.peerRecipientInput) {
                sendPeerMessage({
                    text: message,
                    payment: {
                        amount: payment.amount,
                        currency: payment.currency,
                        txHash: txHash,
                        destination: payment.destination
                    }
                });
            }
            refreshPftBalance();
        }).catch(function (err) {
            console.error(err);
            APP.peerPaymentStatus = err.message || 'Unable to submit PFT payment.';
            render();
        });
    };

    var renderWalletUnlockPanel = function (className) {
        var inputAttrs = {
            type: 'password',
            autocomplete: 'current-password',
            placeholder: 'Wallet password'
        };
        var unlockAttrs = {};
        if (APP.walletUnlocking) {
            inputAttrs.disabled = 'disabled';
            unlockAttrs.disabled = 'disabled';
        }
        var input = h('input.pft-input.pft-wallet-unlock-password', inputAttrs);
        var unlock = button('pft-primary-button pft-wallet-unlock-submit',
            APP.walletUnlocking ? 'Unlocking' : 'Unlock', 'login', unlockAttrs);
        var form = h('form.pft-wallet-unlock-form' + (className ? '.' + className : ''), [
            h('label.pft-label', 'Wallet unlock'),
            h('div.pft-wallet-unlock-row', [input, unlock]),
            APP.walletUnlockStatus ? h('div.pft-wallet-unlock-status', APP.walletUnlockStatus) : h('div')
        ]);
        $(form).on('submit', function (e) {
            e.preventDefault();
            unlockSavedWalletInline($(input).val());
        });
        $(unlock).on('click', function (e) {
            e.preventDefault();
            unlockSavedWalletInline($(input).val());
        });
        return form;
    };

    var renderShell = function (content, aside) {
        var metadataMgr = common && common.getMetadataMgr();
        var user = metadataMgr ? metadataMgr.getUserData() : {};
        var account = APP.wallet && APP.wallet.address || user.name || 'Wallet';
        var shortAccount = shortText(account);
        var nav = Object.keys(routeLabels).map(function (route) {
            var active = APP.route === route;
            var icons = {
                docs: 'drive',
                shared: 'inbox',
                sent: 'share',
                tasknode: 'history',
                messages: 'chat',
                chat: 'chat',
                superthink: 'brain',
                ai: 'key',
                compute: 'server',
                contacts: 'contacts',
                durable: 'upload',
                settings: 'settings',
            };
            var item = h('button.pft-nav-item' + (active ? '.pft-active' : ''), {
                type: 'button'
            }, [icon(icons[route]), h('span', routeLabels[route])]);
            $(item).on('click', function () { setRoute(route); });
            return item;
        });
        var newButtons = appTypes.map(function (entry) {
            var b = button('pft-new-option', entry.label, entry.type === 'pad' ? 'pad' : entry.type);
            $(b).on('click', function () {
                common.openURL('/' + entry.type + '/');
            });
            return b;
        });
        var walletAction = APP.wallet ?
            button('pft-secondary-button pft-wallet-action', 'Lock wallet', 'lock', { title: 'Lock wallet' }) :
            button('pft-secondary-button pft-wallet-action', 'Unlock wallet', 'login', {
                title: 'Unlock wallet'
            });
        $(walletAction).on('click', function () {
            if (APP.wallet) {
                lockWalletSession();
                return;
            }
            openWalletUnlock();
        });
        var logoutButton = button('pft-secondary-button pft-sidebar-logout',
            'Log out', 'logout', {
                title: 'Log out and switch wallet'
            });
        $(logoutButton).on('click', switchWalletSession);
        var sidebarFooter = [logoutButton];
        if (!APP.wallet) {
            sidebarFooter.unshift(renderWalletUnlockPanel('pft-sidebar-unlock'));
        }
        return h('div.pft-shell', [
            h('aside.pft-sidebar', [
                h('div.pft-brand', [
                    h('div.pft-brand-mark', 'PF'),
                    h('div', [
                        h('div.pft-brand-name', 'PFT Docs'),
                        h('div.pft-brand-subtitle', 'Private workspace')
                    ])
                ]),
                h('nav.pft-nav', nav),
                h('div.pft-sidebar-footer', sidebarFooter)
            ]),
            h('div.pft-main', [
                h('header.pft-topbar', [
                    h('div.pft-search-wrap', [
                        icon('search'),
                        h('input.pft-search', {
                            placeholder: 'Search docs',
                            value: APP.search
                        })
                    ]),
                    h('div.pft-new-menu', [
                        button('pft-primary-button', 'New', 'add'),
                        h('div.pft-new-popover', newButtons)
                    ]),
                    h('div.pft-wallet-chip', [
                        h('span.pft-wallet-dot' + (APP.wallet ? '.pft-ok' : '.pft-warn')),
                        h('span.pft-wallet-address', shortAccount),
                        h('span.pft-wallet-state', APP.walletStatus)
                    ]),
                    walletAction
                ]),
                h('main.pft-content', content)
            ]),
            aside || h('div')
        ]);
    };

    var renderDocs = function () {
        var filtered = APP.docs.filter(function (doc) {
            if (doc.trash) { return false; }
            if (!APP.search) { return true; }
            return doc.title.toLowerCase().indexOf(APP.search.toLowerCase()) !== -1 ||
                doc.type.toLowerCase().indexOf(APP.search.toLowerCase()) !== -1;
        });
        var rows = filtered.map(function (doc) {
            var openButton = button('pft-table-button', 'Open', 'external-link');
            var shareButton = button('pft-table-button', 'Share', 'share');
            var copyButton = button('pft-table-button', 'Copy link', 'link');
            $(openButton).on('click', function () { openHref(getDocHref(doc, 'edit')); });
            $(shareButton).on('click', function () {
                APP.shareDoc = doc;
                APP.shareStatus = '';
                render();
            });
            $(copyButton).on('click', function () {
                copyText(getDocHref(doc, 'edit'), 'Link copied.');
            });
            return h('tr', [
                h('td.pft-doc-title-cell', [
                    h('div.pft-doc-icon', doc.type.slice(0, 1).toUpperCase()),
                    h('div', [
                        h('div.pft-doc-title', doc.title),
                        h('div.pft-doc-subtitle', getDocHref(doc, 'view').slice(0, 92))
                    ])
                ]),
                h('td', h('span.pft-pill', doc.type)),
                h('td', doc.atime ? new Date(doc.atime).toLocaleString() : ''),
                h('td.pft-table-actions', [openButton, shareButton, copyButton])
            ]);
        });
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Docs'),
                    h('div.pft-view-meta', filtered.length + ' active document(s)')
                ]),
                h('div.pft-filter-row', [
                    h('span.pft-filter.pft-active', 'Active'),
                    h('span.pft-filter', 'Recent'),
                    h('span.pft-filter', 'Owned')
                ])
            ]),
            filtered.length ? h('div.pft-table-wrap', [
                h('table.pft-table', [
                    h('thead', h('tr', [
                        h('th', 'Document'),
                        h('th', 'Type'),
                        h('th', 'Last opened'),
                        h('th', 'Actions')
                    ])),
                    h('tbody', rows)
                ])
            ]) : h('div.pft-empty', [
                h('h2', 'No documents'),
                h('div.pft-empty-actions', appTypes.slice(0, 3).map(function (entry) {
                    var b = button('pft-secondary-button', entry.label, entry.type);
                    $(b).on('click', function () { common.openURL('/' + entry.type + '/'); });
                    return b;
                }))
            ])
        ]);
    };

    var renderShared = function () {
        var relays = h('textarea.pft-textarea#pft-inbox-relays', {
            rows: 2,
            spellcheck: false
        }, getPostFiatRelays().join('\n'));
        var refresh = button('pft-primary-button', APP.inboxLoading ? 'Refreshing' : 'Refresh', 'refresh');
        $(refresh).on('click', fetchInbox);
        var rows = APP.inbox.map(function (share) {
            var payload = share.payload || {};
            var openButton = button('pft-table-button', 'Open', 'external-link');
            var saveButton = button('pft-table-button', 'Save', 'drive');
            $(openButton).on('click', function () { openHref(payload.href); });
            $(saveButton).on('click', function () { saveInboxPayload(payload); });
            return h('tr', [
                h('td.pft-doc-title-cell', [
                    h('div.pft-doc-icon', 'S'),
                    h('div', [
                        h('div.pft-doc-title', payload.title || 'Untitled document'),
                        h('div.pft-doc-subtitle', payload.sharedByWallet || share.senderPublicKeyHex || '')
                    ])
                ]),
                h('td', h('span.pft-pill', payload.mode || 'view')),
                h('td', payload.createdAt ? new Date(payload.createdAt).toLocaleString() : ''),
                h('td.pft-table-actions', [openButton, saveButton])
            ]);
        });
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Shared with me'),
                    h('div.pft-view-meta', APP.inboxStatus || 'Encrypted relay inbox')
                ]),
                refresh
            ]),
            h('div.pft-panel', [
                h('label.pft-label', { for: 'pft-inbox-relays' }, 'Relays'),
                relays
            ]),
            rows.length ? h('div.pft-table-wrap', [
                h('table.pft-table', [
                    h('thead', h('tr', [
                        h('th', 'Document'),
                        h('th', 'Access'),
                        h('th', 'Received'),
                        h('th', 'Actions')
                    ])),
                    h('tbody', rows)
                ])
            ]) : h('div.pft-empty', [
                h('h2', APP.inboxLoaded ? 'No private shares' : 'Inbox not refreshed')
            ])
        ]);
    };

    var renderSent = function () {
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Sent'),
                    h('div.pft-view-meta', 'Private share delivery records')
                ])
            ]),
            h('div.pft-empty', [
                h('h2', 'No sent records'),
                h('p', 'Sent-share history is not enabled yet.')
            ])
        ]);
    };

    var taskNodePreview = TaskNodeFormat.preview;
    var taskNodeUsefulText = TaskNodeFormat.usefulText;
    var taskNodeDisplayText = TaskNodeFormat.displayText;
    var taskNodeEventTime = TaskNodeFormat.eventTime;
    var taskNodeFormatDate = TaskNodeFormat.formatDate;
    var taskNodeDateOnly = TaskNodeFormat.dateOnly;
    var taskNodeTimeOnly = TaskNodeFormat.timeOnly;
    var taskNodeKindLabel = TaskNodeFormat.kindLabel;
    var taskNodeMiddlePreview = TaskNodeFormat.middlePreview;
    var taskNodeStepText = TaskNodeFormat.stepText;
    var taskNodeTaskInfo = TaskNodeFormat.taskInfo;
    var taskNodeRewardInfo = TaskNodeFormat.rewardInfo;
    var taskNodeEventHasRewardDetails = TaskNodeFormat.eventHasRewardDetails;
    var taskNodeRewardPillClass = TaskNodeFormat.rewardPillClass;
    var taskNodeFormatPft = TaskNodeFormat.formatPft;

    var taskNodeCopyButton = function (label, value, message) {
        var copy = button('pft-table-button', label, 'copy');
        if (!value) {
            copy.disabled = 'disabled';
            return copy;
        }
        $(copy).on('click', function () {
            copyText(value, message || 'Copied.');
        });
        return copy;
    };

    var taskNodeSortedEvents = TaskNodeFormat.sortedEvents;
    var taskNodePrimaryOutputEvent = TaskNodeFormat.primaryOutputEvent;
    var taskNodeGroupIsTimelineUseful = TaskNodeFormat.groupIsTimelineUseful;

    var taskNodeSummaryLine = function (label, value) {
        if (!value) { return ''; }
        return h('div.pft-tasknode-kv', [
            h('span', label),
            h('strong', value)
        ]);
    };

    var renderTaskNodeSteps = function (steps) {
        var rows = (Array.isArray(steps) ? steps : []).map(taskNodeStepText).filter(Boolean);
        if (!rows.length) { return ''; }
        return h('ol.pft-tasknode-steps', rows.map(function (step) {
            return h('li', step);
        }));
    };

    var renderTaskNodeWorkCard = function (group) {
        var events = taskNodeSortedEvents(group);
        var rewardEvent = events.find(function (event) {
            return taskNodeEventHasRewardDetails(event);
        });
        var outputEvent = taskNodePrimaryOutputEvent(events);
        var verificationEvents = events.filter(function (event) {
            return event && event !== rewardEvent && event !== outputEvent;
        });
        var latest = events[0] || group.latest || {};
        var task = taskNodeTaskInfo(group);
        var reward = rewardEvent ? taskNodeRewardInfo(rewardEvent) : null;
        var outputText = outputEvent ? taskNodeUsefulText(outputEvent) : '';
        var latestTime = taskNodeEventTime(latest);
        var title = task.title || (outputText ? 'Task output' : 'Task event');
        var showTaskId = task.id && (task.hasPayload || !/^cid:/u.test(task.id));
        var hasTaskDetails = task.hasPayload || task.description || task.alignment ||
            task.verificationType || task.verificationCriteria || task.estimate ||
            task.status || task.dueAt || (task.steps && task.steps.length);
        var focusBlocks = [];
        var copyReward = taskNodeCopyButton('Copy reward tx',
            reward && reward.txHash, 'Reward transaction hash copied.');
        var copyOutput = taskNodeCopyButton('Copy output tx',
            outputEvent && outputEvent.txHash, 'Output transaction hash copied.');

        if (hasTaskDetails) {
            focusBlocks.push(h('section.pft-tasknode-block', [
                h('div.pft-tasknode-block-label', 'Task'),
                task.description ? h('p.pft-tasknode-clamp', task.description) : '',
                h('details.pft-tasknode-inline-details', [
                    h('summary', 'Task details'),
                    task.alignment ? h('p', task.alignment) : '',
                    h('div.pft-tasknode-kv-grid', [
                        taskNodeSummaryLine('Status', task.status),
                        taskNodeSummaryLine('Due', taskNodeFormatDate(task.dueAt)),
                        taskNodeSummaryLine('Verification', task.verificationType),
                        task.estimate ? taskNodeSummaryLine('Estimate',
                            taskNodeFormatPft(task.estimate)) : ''
                    ]),
                    task.verificationCriteria ? h('p', task.verificationCriteria) : '',
                    renderTaskNodeSteps(task.steps)
                ])
            ]));
        }

        if (reward) {
            focusBlocks.push(h('section.pft-tasknode-block', [
                h('div.pft-tasknode-block-label', 'Reward'),
                h('p.pft-tasknode-clamp', reward.summary ||
                    'Reward metadata is present without a readable summary.'),
                h('div.pft-table-actions', [copyReward])
            ]));
        }

        return h('article.pft-tasknode-work-card', [
            h('div.pft-tasknode-date-rail', [
                h('div.pft-tasknode-date-day', taskNodeDateOnly(latestTime) || 'Unknown'),
                h('div.pft-tasknode-date-time', taskNodeTimeOnly(latestTime))
            ]),
            h('div.pft-tasknode-work-body', [
                h('div.pft-tasknode-work-head', [
                    h('div.pft-tasknode-work-title', [
                        h('h3', title),
                        h('div.pft-doc-subtitle', [
                            showTaskId ? h('span.pft-mono', task.id) : '',
                            task.acceptedAt ? h('span', 'Accepted ' +
                                taskNodeFormatDate(task.acceptedAt)) : '',
                            !task.acceptedAt && task.generatedAt ? h('span', 'Generated ' +
                                taskNodeFormatDate(task.generatedAt)) : ''
                        ])
                    ]),
                    h('div.pft-tasknode-reward-stack', [
                        h('span.pft-pill' + taskNodeRewardPillClass(reward && reward.tier),
                            reward ? taskNodeFormatPft(reward.amount) :
                                (outputText ? 'Output recorded' : 'No reward yet')),
                        reward && reward.score ? h('span.pft-pill', 'Score ' + reward.score) : '',
                        reward && reward.tier ? h('span.pft-pill', reward.tier) : ''
                    ])
                ]),
                focusBlocks.length ? h('div.pft-tasknode-focus-grid', focusBlocks) : '',
                outputEvent && outputText ? h('section.pft-tasknode-output', [
                    h('div.pft-tasknode-output-head', [
                        h('div', [
                            h('div.pft-tasknode-block-label', 'Output'),
                            h('div.pft-doc-subtitle', [
                                taskNodeKindLabel(outputEvent),
                                outputEvent.createdAt ? ' - ' +
                                    taskNodeFormatDate(outputEvent.createdAt) : ''
                            ].join(''))
                        ]),
                        copyOutput
                    ]),
                    h('p.pft-tasknode-clamp.pft-tasknode-output-preview',
                        taskNodePreview(outputText, 420))
                ]) : '',
                verificationEvents.length ? h('details.pft-tasknode-inline-details', [
                    h('summary', 'Verification and evidence (' + verificationEvents.length + ')'),
                    h('div.pft-tasknode-verification-list', verificationEvents.map(function (event) {
                        var text = taskNodeDisplayText(event);
                        return h('div.pft-tasknode-verification-row', [
                            h('div.pft-tasknode-verification-meta', [
                                h('span.pft-pill', taskNodeKindLabel(event)),
                                h('span', event.createdAt ? taskNodeFormatDate(event.createdAt) : ''),
                                event.txHash ? taskNodeCopyButton('Copy tx', event.txHash,
                                    'Transaction hash copied.') : ''
                            ]),
                            h('pre.pft-tasknode-event-text',
                                taskNodeMiddlePreview(text, 520, 260) || 'No plaintext preview')
                        ]);
                    }))
                ]) : ''
            ])
        ]);
    };

    var renderTaskNodeRawPointerHistory = function (groups) {
        var rows = groups.map(function (group) {
            var latest = group.latest || taskNodeSortedEvents(group)[0] || {};
            var copyCid = taskNodeCopyButton('Copy cid', latest.cid || '',
                'CID copied.');
            var copyTx = taskNodeCopyButton('Copy tx', latest.txHash || '',
                'Transaction hash copied.');
            var state = latest.detailDeferred ? 'Deferred' :
                (latest.error ? 'IPFS error' : 'Pointer only');
            return h('tr', [
                h('td', latest.createdAt ? taskNodeFormatDate(latest.createdAt) : ''),
                h('td', taskNodeKindLabel(latest)),
                h('td.pft-mono', latest.cid || group.taskId || ''),
                h('td', state),
                h('td.pft-table-actions', [copyCid, copyTx])
            ]);
        });

        return h('details.pft-tasknode-inline-details.pft-tasknode-raw-details', [
            h('summary', 'Raw pointer history (' + groups.length + ')'),
            h('div.pft-table-wrap', [
                h('table.pft-table', [
                    h('thead', h('tr', [
                        h('th', 'Saved'),
                        h('th', 'Kind'),
                        h('th', 'Pointer'),
                        h('th', 'State'),
                        h('th', 'Actions')
                    ])),
                    h('tbody', rows)
                ])
            ])
        ]);
    };

    var renderTaskNode = function () {
        var data = APP.taskNode || {};
        var refresh = button('pft-primary-button',
            APP.taskNodeLoading ? 'Loading' : 'Refresh', 'refresh');
        if (APP.taskNodeLoading) {
            refresh.disabled = 'disabled';
        }
        $(refresh).on('click', function () {
            refreshTaskNode(true);
        });

        var taskGroups = data.tasks || [];
        var visibleTaskGroups = [];
        var rawTaskGroups = [];
        var taskCards;

        taskGroups.forEach(function (group) {
            if (taskNodeGroupIsTimelineUseful(group)) {
                visibleTaskGroups.push(group);
            } else {
                rawTaskGroups.push(group);
            }
        });
        taskCards = visibleTaskGroups.map(renderTaskNodeWorkCard);

        var contextUpdates = data.contextUpdates || [];
        var contextRows = contextUpdates.map(function (entry, index) {
            var copyCid = button('pft-table-button', 'Copy cid', 'copy');
            $(copyCid).on('click', function () {
                copyText(entry.cid || '', 'CID copied.');
            });
            return h('tr', [
                h('td.pft-doc-title-cell', [
                    h('div.pft-doc-icon', 'C'),
                    h('div', [
                        h('div.pft-doc-title', index === 0 ? 'Latest context doc' : 'Context update'),
                        h('div.pft-doc-subtitle', entry.cid || '')
                    ])
                ]),
                h('td', entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''),
                h('td.pft-mono', shortText(entry.txHash || '')),
                h('td.pft-table-actions', [copyCid])
            ]);
        });

        var readableCount = (data.taskEvents || []).filter(function (event) {
            return event && event.decrypted && taskNodeDisplayText(event);
        });

        var latestContext = data.latestContext || null;
        var latestText = latestContext && latestContext.text || '';
        var failures = []
            .concat(data.taskHydrationFailures || [])
            .concat(data.contextHydrationFailures || []);
        var meta = APP.taskNodeStatus || (APP.taskNodeLoaded ?
            'Task Node history loaded.' : 'Wallet-derived PFTL/IPFS context');

        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Task Node'),
                    h('div.pft-view-meta', meta)
                ]),
                refresh
            ]),
            h('details.pft-panel.pft-wide-panel.pft-tasknode-section', { open: 'open' }, [
                h('summary.pft-tasknode-section-summary', [
                    h('div', [
                        h('h2', 'Task Timeline'),
                        h('div.pft-view-meta', 'Grouped by task. Rewards and outputs are shown first; verification is collapsed inside each item.')
                    ]),
                    h('span.pft-pill', visibleTaskGroups.length + ' task(s), ' +
                        readableCount.length + ' readable')
                ]),
                taskCards.length ? h('div.pft-tasknode-work-list', taskCards) :
                    h('div.pft-empty', [
                        h('h2', APP.taskNodeLoaded ?
                            'No readable task or reward payloads' : 'Task history not loaded')
                    ]),
                rawTaskGroups.length ? renderTaskNodeRawPointerHistory(rawTaskGroups) : ''
            ]),
            h('details.pft-panel.pft-wide-panel.pft-tasknode-section', [
                h('summary.pft-tasknode-section-summary', [
                    h('h2', 'Context Doc Updates'),
                    h('span.pft-pill', (data.contextUpdateCount || 0) + ' update(s)')
                ]),
                latestText ? h('pre.pft-tasknode-context', latestText) :
                    h('div.pft-empty', [
                        h('h2', latestContext && latestContext.error ?
                            latestContext.error : 'No decrypted context doc')
                    ]),
                contextRows.length ? h('div.pft-table-wrap', [
                    h('table.pft-table', [
                        h('thead', h('tr', [
                            h('th', 'Context'),
                            h('th', 'Saved'),
                            h('th', 'Tx'),
                            h('th', 'Actions')
                        ])),
                        h('tbody', contextRows)
                    ])
                ]) : ''
            ]),
            failures.length ? h('div.pft-warning-panel', [
                h('h2', 'Some IPFS payloads could not be read'),
                h('div.pft-mono', failures.slice(0, 8).map(function (failure) {
                    return (failure.cid || '') + ': ' + (failure.error || 'failed');
                }).join(' | '))
            ]) : ''
        ]);
    };

    var renderContacts = function () {
        var rows = APP.contacts.map(function (contact) {
            var shareButton = button('pft-table-button', 'Share', 'share');
            var messageButton = button('pft-table-button', 'Message', 'chat');
            $(shareButton).on('click', function () {
                setRoute('docs');
            });
            $(messageButton).on('click', function () {
                upsertPeerConversation(PostFiatContacts.toRecipient(contact));
                APP.peerRecipientInput = '';
                savePeerMessageState();
                setRoute('messages');
            });
            return h('tr', [
                h('td', contact.label || contact.walletAddress || 'Contact'),
                h('td.pft-mono', contact.walletAddress || ''),
                h('td.pft-mono', contact.publicKeyHex || ''),
                h('td.pft-table-actions', [messageButton, shareButton])
            ]);
        });
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Contacts'),
                    h('div.pft-view-meta', APP.contacts.length + ' saved recipient(s)')
                ])
            ]),
            rows.length ? h('div.pft-table-wrap', [
                h('table.pft-table', [
                    h('thead', h('tr', [
                        h('th', 'Name'),
                        h('th', 'Wallet'),
                        h('th', 'Nostr key'),
                        h('th', 'Actions')
                    ])),
                    h('tbody', rows)
                ])
            ]) : h('div.pft-empty', [
                h('h2', 'No contacts')
            ])
        ]);
    };

    var renderDurable = function () {
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Durable'),
                    h('div.pft-view-meta', 'Explicit PFTL/IPFS publishing')
                ])
            ]),
            h('div.pft-warning-panel', [
                h('h2', 'Publication review required'),
                h('ul', [
                    h('li', 'CIDs and pinning activity can be observable.'),
                    h('li', 'Ledger pointers can be durable.'),
                    h('li', 'Revocation requires content and key rotation.')
                ]),
                button('pft-secondary-button', 'Open durable publish tools', 'external-link')
            ])
        ]);
    };

    var renderChatSourceToggle = function (key, label, iconName) {
        var options = APP.chatOptions || getDefaultChatOptions();
        var promptMode = normalizeChatPromptMode(options.promptMode);
        var disabled = key === 'thinking' && promptMode === CHAT_PROMPT_ODV;
        var checked = disabled ? false : !!options[key];
        var attrs = {
            type: 'checkbox'
        };
        var input;
        if (checked) { attrs.checked = true; }
        if (disabled) {
            attrs.disabled = true;
            attrs.title = 'ODV uses the fast-path prompt with thinking disabled.';
        }
        input = h('input', attrs);
        $(input).on('change', function () {
            if (disabled) { return; }
            setChatSourceOption(key, $(this).is(':checked'));
        });
        return h('label.pft-chat-source-toggle' + (checked ? '.pft-active' : '') +
                (disabled ? '.pft-disabled' : ''), [
            input,
            icon(iconName),
            h('span', label)
        ]);
    };

    var renderChatPromptModeControl = function () {
        var options = APP.chatOptions || getDefaultChatOptions();
        var activeMode = normalizeChatPromptMode(options.promptMode);
        var rows = [
            { id: CHAT_PROMPT_STANDARD, label: 'Standard' },
            { id: CHAT_PROMPT_ODV, label: 'ODV' }
        ].map(function (mode) {
            var attrs = {
                type: 'radio',
                name: 'pft-chat-prompt-mode',
                value: mode.id
            };
            var input;
            if (activeMode === mode.id) { attrs.checked = true; }
            input = h('input', attrs);
            $(input).on('change', function () {
                setChatPromptMode(mode.id);
            });
            return h('label', [input, h('span', mode.label)]);
        });
        return h('section.pft-chat-popover-section', [
            h('div.pft-chat-popover-label', 'Prompts'),
            h('div.pft-segmented.pft-chat-prompt-toggle', rows)
        ]);
    };

    var renderChatDocPicker = function () {
        var options = APP.chatOptions || getDefaultChatOptions();
        var search = h('input.pft-input#pft-chat-doc-search', {
            placeholder: 'Find docs by name',
            value: APP.chatDocSearch || '',
            autocomplete: 'off'
        });
        var selectedDocs = getSelectedChatDocs();
        var rows = getFilteredChatDocs().map(function (doc) {
            var active = options.selectedDocIds.indexOf(doc.id) !== -1;
            var attrs = { type: 'checkbox' };
            var cached = APP.chatDocCache[doc.id];
            var input;
            if (active) { attrs.checked = true; }
            input = h('input', attrs);
            $(input).on('change', function () {
                toggleChatDocSelection(doc.id);
            });
            return h('label.pft-chat-doc-option' + (active ? '.pft-active' : ''), [
                input,
                h('span.pft-doc-icon', doc.type.slice(0, 1).toUpperCase()),
                h('span.pft-chat-doc-option-text', [
                    h('strong', doc.title),
                    h('span', doc.type + (cached && cached.text ? ' · cached' : ''))
                ])
            ]);
        });
        $(search).on('input', function () {
            APP.chatDocSearch = $(this).val();
            render();
            setTimeout(function () {
                $('#pft-chat-doc-search').trigger('focus');
            }, 0);
        });
        return h('section.pft-chat-popover-section', [
            h('div.pft-chat-popover-label', 'Referenced docs'),
            h('div.pft-chat-doc-search', [icon('search'), search]),
            selectedDocs.length ? h('div.pft-chat-doc-chips', selectedDocs.map(function (doc) {
                var chip = h('button.pft-chat-doc-chip', {
                    type: 'button',
                    title: 'Remove ' + doc.title
                }, [h('span', doc.title), icon('close')]);
                $(chip).on('click', function () {
                    toggleChatDocSelection(doc.id);
                });
                return chip;
            })) : '',
            h('div.pft-chat-doc-list', rows.length ? rows : [
                h('div.pft-chat-empty-row', 'No matching docs')
            ])
        ]);
    };

    var renderChatProviderControls = function () {
        var settings = APP.aiSettings || getDefaultAiSettings();
        var providerRows = AI_PROVIDERS.map(function (provider) {
            var attrs = {
                type: 'radio',
                name: 'pft-chat-provider',
                value: provider.id
            };
            var input;
            if (settings.provider === provider.id) { attrs.checked = true; }
            input = h('input', attrs);
            $(input).on('change', function () {
                APP.chatOptionsOpen = true;
                setAiProvider(provider.id);
            });
            return h('label', [input, h('span', provider.label)]);
        });
        var modelSelect = '';
        if (settings.provider === 'openrouter') {
            modelSelect = h('div.pft-chat-model-row', [
                h('label.pft-label', { for: 'pft-chat-openrouter-model' }, 'OpenRouter model'),
                h('select.pft-input.pft-select#pft-chat-openrouter-model',
                    getOpenRouterModelCatalog().map(function (model) {
                        var attrs = { value: model.id };
                        if (model.id === settings.openRouterModel) { attrs.selected = true; }
                        return h('option', attrs, model.name + ' - ' + model.id);
                    }))
            ]);
            $(modelSelect).find('select').on('change', function () {
                APP.chatOptionsOpen = true;
                setOpenRouterModel($(this).val());
            });
        }
        if (settings.provider === 'runpod') {
            modelSelect = h('div.pft-chat-model-row', [
                h('label.pft-label', { for: 'pft-chat-runpod-model' }, 'RunPod model'),
                h('input.pft-input#pft-chat-runpod-model', {
                    value: settings.runPodModel || RUNPOD_DEFAULT_MODEL,
                    autocomplete: 'off',
                    spellcheck: false
                }),
                h('div.pft-view-meta.pft-mono',
                    getRunPodAiBaseUrl(settings) || 'No RunPod endpoint configured')
            ]);
            $(modelSelect).find('input').on('change', function () {
                APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
                APP.aiSettings.runPodModel = String($(this).val() || '').trim() ||
                    RUNPOD_DEFAULT_MODEL;
                saveAiSettings();
                render();
            });
        }
        return h('section.pft-chat-popover-section', [
            h('div.pft-chat-popover-label', 'Provider'),
            h('div.pft-segmented.pft-chat-provider-toggle', providerRows),
            settings.provider === 'openrouter' ? h('div.pft-inbox-status.pft-ok', [
                h('span.pft-wallet-dot.pft-ok'),
                h('span', getOpenRouterModelStatus())
            ]) : '',
            settings.provider === 'runpod' ? h('div.pft-inbox-status' +
                    (getRunPodAiBaseUrl(settings) ? '.pft-ok' : '.pft-warn'), [
                h('span.pft-wallet-dot' +
                    (getRunPodAiBaseUrl(settings) ? '.pft-ok' : '.pft-warn')),
                h('span', getRunPodAiBaseUrl(settings) ?
                    'RunPod endpoint is selected.' :
                    'Configure a RunPod endpoint on the AI page.')
            ]) : '',
            modelSelect
        ]);
    };

    var renderChatOptionsPopover = function () {
        var options = APP.chatOptions || getDefaultChatOptions();
        var close;
        if (!APP.chatOptionsOpen) { return ''; }
        close = button('pft-secondary-button pft-chat-popover-close', 'Done', 'check');
        $(close).on('click', function () {
            APP.chatOptionsOpen = false;
            render();
        });
        return h('div.pft-chat-popover', [
            h('div.pft-chat-popover-grid', [
                h('section.pft-chat-popover-section', [
                    h('div.pft-chat-popover-label', 'Sources'),
                    h('div.pft-chat-source-grid', [
                        renderChatSourceToggle('includeContextDoc', 'Context Doc', 'documentation'),
                        renderChatSourceToggle('includeTasks', 'Tasks', 'history'),
                        renderChatSourceToggle('thinking', 'Thinking', 'brain')
                    ])
                ]),
                renderChatPromptModeControl(),
                renderChatProviderControls(),
                renderChatDocPicker()
            ]),
            h('div.pft-chat-popover-foot', [
                h('span', options.selectedDocIds.length + ' doc(s) selected · Prompt: ' +
                    (normalizeChatPromptMode(options.promptMode) === CHAT_PROMPT_ODV ?
                        'ODV' : 'Standard')),
                close
            ])
        ]);
    };

    var renderChatRail = function (session) {
        var newChat = button('pft-secondary-button pft-chat-new', 'New chat', 'add');
        var sessions = (APP.chatSessions || []).map(function (entry) {
            var active = entry.id === session.id;
            var open = h('button.pft-chat-rail-item' + (active ? '.pft-active' : ''), {
                type: 'button'
            }, [
                icon('chat'),
                h('span', [
                    h('strong', entry.title || 'New chat'),
                    h('em', entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : '')
                ])
            ]);
            var remove = h('button.pft-chat-rail-delete', {
                type: 'button',
                title: 'Delete chat'
            }, [icon('trash-empty'), h('span', 'Delete')]);
            $(open).on('click', function () {
                setActiveChatSession(entry.id);
            });
            $(remove).on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                deleteChatSession(entry.id);
            });
            return h('div.pft-chat-rail-row' + (active ? '.pft-active' : ''), [
                open,
                remove
            ]);
        });
        $(newChat).on('click', startNewChatSession);
        return h('aside.pft-chat-rail', [
            h('div.pft-chat-rail-head', [
                h('div', [
                    h('h2', 'Chat'),
                    h('div.pft-view-meta', 'Recent conversations')
                ]),
                newChat
            ]),
            h('div.pft-chat-rail-list', sessions)
        ]);
    };

    var renderChatMessageText = function (message) {
        if (message && message.streaming) {
            return renderChatPlainText(message);
        }
        return renderChatMarkdown(message && message.text || message);
    };

    var renderChatMessages = function (session) {
        var messages = session.messages || [];
        var hasStreamingAssistant = messages.some(function (message) {
            return message.role === 'assistant' && message.streaming;
        });
        if (!messages.length) {
            return h('div.pft-chat-empty-state', [
                icon('sparkles'),
                h('h1', 'What are we working through?')
            ]);
        }
        return h('div.pft-chat-thread', messages.map(function (message) {
            if (message.role === 'user') {
                return h('div.pft-chat-turn.pft-chat-turn-user', [
                    h('div.pft-chat-bubble', renderChatMessageText(message)),
                    h('div.pft-chat-memory-row', [
                        icon('check'),
                        h('span', 'Updated memory.')
                    ])
                ]);
            }
            if (message.role === 'system') {
                return h('div.pft-chat-turn.pft-chat-turn-system', [
                    icon('badge-error'),
                    h('span', message.text)
                ]);
            }
            return h('div.pft-chat-turn.pft-chat-turn-assistant', [
                renderChatMessageText(message)
            ]);
        }).concat(APP.chatSending && APP.chatSendingSessionId === session.id &&
                !hasStreamingAssistant ? [
            h('div.pft-chat-turn.pft-chat-turn-assistant.pft-chat-pending', [
                h('span.pft-chat-thinking-dot'),
                h('span', APP.chatStatus || 'Thinking...')
            ])
        ] : []));
    };

    var renderChatComposer = function () {
        var options = APP.chatOptions || getDefaultChatOptions();
        var promptMode = normalizeChatPromptMode(options.promptMode);
        var plus = button('pft-chat-icon-button', 'Sources', 'add', {
            title: 'Sources and parameters'
        });
        var mode = button('pft-chat-mode-button',
            promptMode === CHAT_PROMPT_ODV ? 'ODV' :
                (options.thinking === false ? 'Fast' : 'Thinking'),
            'sparkles', { title: 'Chat parameters' });
        var mic = button('pft-chat-icon-button', 'Voice', 'mic', { title: 'Voice input' });
        var send = button('pft-chat-send', 'Send', 'arrow-up', { title: 'Send' });
        var input = h('textarea.pft-chat-input#pft-chat-input', {
            rows: 1,
            placeholder: 'Ask Post Fiat',
            autocomplete: 'off'
        }, APP.chatDraft || '');
        if (APP.chatSending) {
            send.disabled = 'disabled';
            input.disabled = 'disabled';
        }
        $(plus).on('click', function () {
            APP.chatOptionsOpen = !APP.chatOptionsOpen;
            render();
        });
        $(mode).on('click', function () {
            APP.chatOptionsOpen = !APP.chatOptionsOpen;
            render();
        });
        $(mic).on('click', function () {
            UI.log('Voice input is not enabled in this build.');
        });
        $(send).on('click', sendChatMessage);
        $(input).on('input', function () {
            APP.chatDraft = $(this).val();
        });
        $(input).on('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        return h('div.pft-chat-composer-wrap', [
            renderChatOptionsPopover(),
            h('form.pft-chat-composer', [
                plus,
                input,
                mode,
                mic,
                send
            ])
        ]);
    };

    var renderPeerRail = function (active) {
        var newButton = button('pft-secondary-button pft-peer-new', 'New', 'add');
        var refresh = button('pft-secondary-button pft-peer-refresh',
            APP.peerLoading ? 'Refreshing' : 'Refresh', 'refresh');
        var recipient = h('input.pft-input#pft-peer-recipient', {
            placeholder: 'Wallet address or Nostr public key',
            autocomplete: 'off',
            value: APP.peerRecipientInput || ''
        });
        var relays = h('textarea.pft-textarea#pft-peer-relays', {
            rows: 2,
            spellcheck: false
        }, APP.peerRelaysInput || getPostFiatRelays().join('\n'));
        var rows = (APP.peerConversations || []).map(function (conversation) {
            var isActive = active && conversation.id === active.id;
            var open = h('button.pft-chat-rail-item' + (isActive ? '.pft-active' : ''), {
                type: 'button'
            }, [
                icon('chat'),
                h('span', [
                    h('strong', conversation.name || 'Peer'),
                    h('em', conversation.updatedAt ?
                        new Date(conversation.updatedAt).toLocaleDateString() : '')
                ])
            ]);
            var remove = h('button.pft-chat-rail-delete', {
                type: 'button',
                title: 'Delete conversation'
            }, [icon('trash-empty'), h('span', 'Delete')]);
            $(open).on('click', function () { setActivePeerConversation(conversation.id); });
            $(remove).on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                deletePeerConversation(conversation.id);
            });
            return h('div.pft-chat-rail-row' + (isActive ? '.pft-active' : ''), [
                open,
                remove
            ]);
        });
        $(newButton).on('click', startPeerConversation);
        $(refresh).on('click', refreshPeerMessages);
        $(recipient).on('input', function () {
            APP.peerRecipientInput = $(this).val();
        });
        $(relays).on('input', function () {
            APP.peerRelaysInput = $(this).val();
        });
        return h('aside.pft-chat-rail.pft-peer-rail', [
            h('div.pft-chat-rail-head', [
                h('div', [
                    h('h2', 'Messages'),
                    h('div.pft-view-meta', 'Nostr private DMs')
                ]),
                newButton
            ]),
            h('div.pft-peer-compose-card', [
                h('label.pft-label', { for: 'pft-peer-recipient' }, 'Recipient'),
                recipient,
                h('label.pft-label', { for: 'pft-peer-relays' }, 'Relays'),
                relays,
                refresh
            ]),
            h('div.pft-chat-rail-list', rows.length ? rows : [
                h('div.pft-chat-empty-row', 'No peer conversations')
            ])
        ]);
    };

    var renderPeerThread = function (conversation) {
        var messages = conversation && conversation.messages || [];
        if (!conversation && !APP.peerRecipientInput) {
            return h('div.pft-chat-empty-state', [
                icon('chat'),
                h('h1', 'Message a PFT wallet')
            ]);
        }
        if (!messages.length) {
            return h('div.pft-chat-empty-state', [
                icon('send'),
                h('h1', 'No messages yet')
            ]);
        }
        return h('div.pft-peer-thread', messages.map(function (message) {
            var outgoing = message.direction === 'out';
            return h('div.pft-peer-turn' + (outgoing ? '.pft-peer-out' : '.pft-peer-in'), [
                h('div.pft-peer-bubble', [
                    h('div.pft-chat-message-text', message.text),
                    message.payment ? h('div.pft-peer-payment-chip', [
                        icon('wallet'),
                        h('span', [
                            message.payment.amount || '',
                            ' ',
                            message.payment.currency || 'PFT',
                            message.payment.txHash ? ' · ' + shortText(message.payment.txHash) : ''
                        ].join(''))
                    ]) : ''
                ]),
                h('div.pft-peer-time', new Date(message.createdAt).toLocaleString())
            ]);
        }));
    };

    var renderPeerPaymentPanel = function (conversation) {
        if (!APP.peerPaymentOpen) { return ''; }
        var destination = getPeerPaymentDestination(conversation);
        var canSend = Boolean(destination);
        var amount = h('input.pft-input#pft-peer-pft-amount', {
            placeholder: 'Amount',
            inputmode: 'decimal',
            autocomplete: 'off',
            value: APP.peerPaymentAmount || ''
        });
        var send = button('pft-primary-button', 'Send PFT', 'wallet');
        if (!canSend) { send.disabled = 'disabled'; }
        $(amount).on('input', function () {
            APP.peerPaymentAmount = $(this).val();
        });
        $(send).on('click', submitPeerPftPayment);
        return h('div.pft-peer-payment-panel', [
            h('div.pft-panel-heading', [
                h('h2', 'PFT transfer'),
                h('span.pft-pill', APP.peerBalance ?
                    APP.peerBalance.balance + ' ' + APP.peerBalance.currency : 'Balance unknown')
            ]),
            h('div.pft-peer-payment-row', [
                amount,
                send
            ]),
            h('div.pft-view-meta', canSend ?
                'Payment submits on PFTL to ' + shortText(destination) +
                    '. Nostr messaging still requires a published inbox.' :
                'PFT transfers require a recipient wallet address.'),
            APP.peerPaymentStatus ? h('div.pft-inbox-status', APP.peerPaymentStatus) : ''
        ]);
    };

    var renderPeerComposer = function (conversation) {
        var pay = button('pft-chat-mode-button', 'PFT', 'wallet', {
            title: 'Send PFT'
        });
        var send = button('pft-chat-send', 'Send', 'arrow-up', { title: 'Send message' });
        var input = h('textarea.pft-chat-input#pft-peer-input', {
            rows: 1,
            placeholder: conversation ? 'Message ' + (conversation.name || 'peer') :
                'Enter a recipient, then message',
            autocomplete: 'off'
        }, APP.peerDraft || '');
        if (APP.peerSending) {
            send.disabled = 'disabled';
            input.disabled = 'disabled';
        }
        $(pay).on('click', function () {
            APP.peerPaymentOpen = !APP.peerPaymentOpen;
            if (APP.peerPaymentOpen && !APP.peerBalance && !APP.peerBalanceStatus) {
                refreshPftBalance();
                return;
            }
            render();
        });
        $(send).on('click', function () { sendPeerMessage(); });
        $(input).on('input', function () {
            APP.peerDraft = $(this).val();
        });
        $(input).on('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendPeerMessage();
            }
        });
        return h('div.pft-chat-composer-wrap', [
            renderPeerPaymentPanel(conversation),
            h('form.pft-chat-composer.pft-peer-composer', [
                button('pft-chat-icon-button', 'Attach', 'add', { title: 'Attachments' }),
                input,
                pay,
                send
            ])
        ]);
    };

    var renderMessages = function () {
        var active = getActivePeerConversation();
        var walletAddress = getActiveWalletAddress();
        var publish = button('pft-secondary-button', 'Publish address', 'upload');
        var refreshBalance = button('pft-secondary-button', 'Balance', 'refresh');
        $(publish).on('click', publishInboxDirectory);
        $(refreshBalance).on('click', refreshPftBalance);
        return h('section.pft-chat-view.pft-peer-view', [
            renderPeerRail(active),
            h('div.pft-chat-main.pft-peer-main', [
                h('div.pft-chat-page-actions', [
                    walletAddress ? h('span.pft-pill.pft-mono',
                        'Active ' + shortText(walletAddress)) : '',
                    APP.peerBalanceStatus ? h('span.pft-pill', APP.peerBalanceStatus) : '',
                    APP.peerStatus ? h('span.pft-pill', APP.peerStatus) : '',
                    publish,
                    refreshBalance
                ]),
                h('div.pft-chat-scroll.pft-peer-scroll', [
                    active ? h('div.pft-peer-heading', [
                        h('h1', active.name || 'Peer'),
                        h('div.pft-view-meta.pft-mono',
                            active.recipient.walletAddress || active.recipient.publicKeyHex || '')
                    ]) : '',
                    renderPeerThread(active),
                    APP.peerStatus ? h('div.pft-peer-status', APP.peerStatus) : ''
                ]),
                renderPeerComposer(active)
            ])
        ]);
    };

    var renderChat = function () {
        var session = getActiveChatSession();
        var provider = getAiProvider(APP.aiSettings && APP.aiSettings.provider) ||
            getAiProvider('ambient');
        var share = button('pft-secondary-button pft-chat-share', 'Share', 'share');
        var more = button('pft-icon-button pft-chat-more', 'More', 'ellipsis-horizontal', {
            title: 'More'
        });
        $(share).on('click', function () {
            copyText((session.messages || []).map(function (message) {
                return message.role.toUpperCase() + ': ' + message.text;
            }).join('\n\n'), 'Chat copied.');
        });
        $(more).on('click', function () {
            APP.chatOptionsOpen = !APP.chatOptionsOpen;
            render();
        });
        return h('section.pft-chat-view', [
            renderChatRail(session),
            h('div.pft-chat-main', [
                h('div.pft-chat-page-actions', [
                    h('span.pft-pill', provider ? provider.label : 'AI'),
                    share,
                    more
                ]),
                h('div.pft-chat-scroll', {
                    'data-session-id': session.id
                }, renderChatMessages(session)),
                renderChatComposer()
            ])
        ]);
    };

    var getAiStatusClass = function (state) {
        if (state === 'ok') { return '.pft-ok'; }
        if (state === 'error') { return '.pft-error'; }
        if (state === 'warn' || state === 'missing' || state === 'checking') {
            return '.pft-warn';
        }
        return '';
    };

    var renderAiProviderSelector = function () {
        var settings = APP.aiSettings || getDefaultAiSettings();
        var choices = AI_PROVIDERS.map(function (provider) {
            var inputAttrs = {
                type: 'radio',
                name: 'pft-ai-provider',
                value: provider.id
            };
            var input;
            if (settings.provider === provider.id) { inputAttrs.checked = true; }
            input = h('input', inputAttrs);
            $(input).on('change', function () {
                setAiProvider(provider.id);
            });
            return h('label', [input, h('span', provider.label)]);
        });
        return h('section.pft-panel.pft-ai-selector-card', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'Provider'),
                    h('div.pft-view-meta', 'Choose which AI API this workspace should use')
                ]),
                h('span.pft-pill.pft-ok',
                    (getAiProvider(settings.provider) || getAiProvider('ambient')).label)
            ]),
            h('div.pft-segmented.pft-ai-provider-toggle', choices)
        ]);
    };

    var renderAiProviderCard = function (provider) {
        var savedKey = APP.aiKeys[provider.id] || '';
        var status = getAiKeyStatus(provider.id);
        var checking = APP.aiKeyChecking[provider.id];
        var statusClass = getAiStatusClass(status.state);
        var dotClass = statusClass;
        var input = h('input.pft-input.pft-ai-key-input#pft-ai-key-' + provider.id, {
            type: 'password',
            autocomplete: 'off',
            spellcheck: false,
            placeholder: savedKey ? 'Saved: ' + redactSecret(savedKey) :
                'Paste ' + provider.keyLabel
        });
        var save = button('pft-secondary-button', 'Save', 'key');
        var check = button('pft-primary-button', checking ? 'Checking' : 'Check', 'refresh');
        var remove = button('pft-secondary-button', 'Remove', 'trash-empty', {
            title: 'Remove saved ' + provider.label + ' key'
        });
        if (checking) { check.disabled = 'disabled'; }
        if (!savedKey) { remove.disabled = 'disabled'; }
        $(save).on('click', function () { saveAiProviderKey(provider.id); });
        $(check).on('click', function () { checkAiProviderKey(provider.id); });
        $(remove).on('click', function () { removeAiProviderKey(provider.id); });

        return h('section.pft-panel.pft-ai-provider-card', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', provider.label),
                    h('div.pft-view-meta', getAiProviderBaseUrl(provider))
                ]),
                h('span.pft-pill' + (savedKey ? '.pft-ok' : '.pft-warn'),
                    savedKey ? 'Saved' : 'Missing')
            ]),
            h('label.pft-label', { for: 'pft-ai-key-' + provider.id }, provider.keyLabel),
            h('a.pft-ai-key-help', {
                href: provider.keyHelpUrl,
                target: '_blank',
                rel: 'noopener noreferrer'
            }, provider.keyHelpText),
            input,
            h('div.pft-inbox-status' + statusClass, [
                h('span.pft-wallet-dot' + dotClass),
                h('span', status.message)
            ]),
            status.checkedAt ? h('div.pft-view-meta',
                'Last status update: ' + new Date(status.checkedAt).toLocaleString()) : '',
            h('div.pft-actions-row', [save, check, remove]),
            h('a.pft-provider-doc-link', {
                href: provider.docsUrl,
                target: '_blank',
                rel: 'noopener noreferrer'
            }, provider.label + ' API docs')
        ]);
    };

    var renderOpenRouterSettings = function () {
        var settings = APP.aiSettings || getDefaultAiSettings();
        var modelOptions = getOpenRouterModelCatalog().map(function (model) {
            var attrs = { value: model.id };
            if (model.id === settings.openRouterModel) { attrs.selected = true; }
            return h('option', attrs, model.name + ' - ' + model.id);
        });
        var modelSelect = h('select.pft-input.pft-select#pft-openrouter-model', modelOptions);
        var refresh = button('pft-secondary-button',
            APP.openRouterModelsLoading ? 'Loading models' : 'Refresh models', 'refresh');
        var payload = JSON.stringify(buildOpenRouterRequestDefaults(), null, 2);
        var zdrModelIds = getOpenRouterZdrModelIdMap();
        var hasZdrData = APP.openRouterZdrEndpoints.length > 0;
        var selectedIsZdr = !hasZdrData || !!zdrModelIds[settings.openRouterModel];
        var statusClass = selectedIsZdr ? '.pft-ok' : '.pft-warn';
        if (APP.openRouterModelsLoading) { refresh.disabled = 'disabled'; }
        $(modelSelect).on('change', function () {
            setOpenRouterModel($(this).val());
        });
        $(refresh).on('click', function () {
            loadOpenRouterModels(true);
        });
        return h('section.pft-panel.pft-ai-openrouter-card', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'OpenRouter model'),
                    h('div.pft-view-meta', 'ZDR-only routing is enforced for OpenRouter requests')
                ]),
                h('span.pft-pill.pft-ok', 'ZDR enforced')
            ]),
            h('label.pft-label', { for: 'pft-openrouter-model' }, 'Model'),
            modelSelect,
            h('div.pft-inbox-status' + statusClass, [
                h('span.pft-wallet-dot' + statusClass),
                h('span', getOpenRouterModelStatus())
            ]),
            APP.openRouterModelsStatus ? h('div.pft-view-meta', APP.openRouterModelsStatus) : '',
            h('div.pft-actions-row', [refresh]),
            h('div.pft-ai-zdr-note', [
                h('p', 'OpenRouter calls from this app should include provider.zdr=true, which restricts routing to endpoints OpenRouter marks as Zero Data Retention. The direct request defaults also set provider.data_collection="deny".'),
                h('a.pft-provider-doc-link', {
                    href: getAiProvider('openrouter').zdrDocsUrl,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                }, 'OpenRouter ZDR docs')
            ]),
            h('label.pft-label', 'Direct API request defaults'),
            h('pre.pft-ai-request-preview', payload)
        ]);
    };

    var renderRunPodAiSettings = function () {
        var settings = APP.aiSettings || getDefaultAiSettings();
        var status = getAiKeyStatus('runpod');
        var statusClass = getAiStatusClass(status.state);
        var baseInput = h('input.pft-input#pft-runpod-ai-base', {
            value: getRunPodAiBaseUrl(settings),
            autocomplete: 'off',
            spellcheck: false,
            placeholder: 'https://<pod-id>-8000.proxy.runpod.net/v1'
        });
        var modelInput = h('input.pft-input#pft-runpod-ai-model', {
            value: settings.runPodModel || RUNPOD_DEFAULT_MODEL,
            autocomplete: 'off',
            spellcheck: false,
            placeholder: RUNPOD_DEFAULT_MODEL
        });
        var save = button('pft-secondary-button', 'Save endpoint', 'check');
        var check = button('pft-primary-button',
            APP.aiKeyChecking.runpod ? 'Checking' : 'Check endpoint', 'refresh');
        var loadPods = button('pft-secondary-button',
            APP.runPodPodsLoading ? 'Loading pods' : 'Load pods', 'refresh');
        var latest = button('pft-secondary-button', 'Use latest ready pod', 'bot');
        var latestReadyPod = getLatestReadyRunPodOllamaPod() || getLatestReadyRunPodPod();
        var latestCreatedReady = APP.runPodLastResult && APP.runPodLastResult.baseUrl &&
            APP.runPodLastResult.pod && isRunPodPodReady(APP.runPodLastResult.pod);
        var chatOptions = APP.chatOptions || getDefaultChatOptions();
        var payload = JSON.stringify({
            baseUrl: getRunPodAiBaseUrl(settings),
            model: settings.runPodModel || RUNPOD_DEFAULT_MODEL,
            max_tokens: isChatThinkingEnabled(chatOptions) ? 4096 : 2048,
            nativeOllama: /^qwen3\.6:/u.test(String(settings.runPodModel || RUNPOD_DEFAULT_MODEL)),
            ollamaThink: isChatThinkingEnabled(chatOptions)
        }, null, 2);
        var runningPods = (APP.runPodPods || []).filter(isRunPodPodRunning);
        if (APP.aiKeyChecking.runpod) { check.disabled = 'disabled'; }
        if (!latestCreatedReady && !latestReadyPod) {
            latest.disabled = 'disabled';
        }
        if (APP.runPodPodsLoading) { loadPods.disabled = 'disabled'; }
        $(baseInput).on('input', function () {
            APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
            APP.aiSettings.runPodBaseUrl = normalizeOpenAiCompatibleBaseUrl($(this).val());
        });
        $(modelInput).on('input', function () {
            APP.aiSettings = APP.aiSettings || getDefaultAiSettings();
            APP.aiSettings.runPodModel = String($(this).val() || '').trim();
        });
        $(save).on('click', function () {
            setRunPodAiProvider($(baseInput).val(), $(modelInput).val());
        });
        $(check).on('click', function () {
            setRunPodAiProvider($(baseInput).val(), $(modelInput).val());
            checkAiProviderKey('runpod');
        });
        $(loadPods).on('click', refreshRunPodPods);
        $(latest).on('click', function () {
            if (latestCreatedReady) {
                setRunPodAiProvider(
                    APP.runPodLastResult.baseUrl + '/v1',
                    APP.runPodLastResult.request && APP.runPodLastResult.request.env &&
                        APP.runPodLastResult.request.env.PFT_MODEL_ID || getRunPodAiModel()
                );
                return;
            }
            if (latestReadyPod) {
                setRunPodAiProvider(getRunPodPodAiBaseUrl(latestReadyPod),
                    getRunPodPodModelId(latestReadyPod));
            }
        });
        return h('section.pft-panel.pft-ai-openrouter-card.pft-ai-runpod-card', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'RunPod endpoint'),
                    h('div.pft-view-meta', 'Ollama server on port 8000; the proxy uses native /api/chat for qwen3.6')
                ]),
                h('span.pft-pill' + (getRunPodAiBaseUrl(settings) ? '.pft-ok' : '.pft-warn'),
                    getRunPodAiBaseUrl(settings) ? 'Configured' : 'Missing endpoint')
            ]),
            h('label.pft-label', { for: 'pft-runpod-ai-base' }, 'OpenAI API base'),
            baseInput,
            h('label.pft-label', { for: 'pft-runpod-ai-model' }, 'Model'),
            modelInput,
            h('div.pft-inbox-status' + statusClass, [
                h('span.pft-wallet-dot' + statusClass),
                h('span', status.message)
            ]),
            h('div.pft-actions-row', [save, check, latest, loadPods]),
            !getRunPodAiBaseUrl(settings) && APP.runPodKey ? h('div.pft-view-meta',
                APP.runPodPodsLoading ? 'Loading your RunPod pods to auto-select a running endpoint.' :
                    'No endpoint selected yet. Load pods to auto-select the newest ready pod.') : '',
            runningPods.length ? h('div.pft-runpod-ai-pod-list', runningPods.map(function (pod) {
                var podId = String(pod && pod.id || '');
                var baseUrl = podId ? getRunPodProxyUrl(podId, 8000) + '/v1' : '';
                var readiness = getRunPodPodReadiness(pod);
                var ready = readiness.state === 'ready';
                var readinessClass = ready ? '.pft-ok' : '.pft-warn';
                var use = button('pft-table-button', ready ? 'Use for AI' : 'Waiting', 'bot');
                var checkReady = button('pft-table-button',
                    readiness.state === 'checking' ? 'Checking' : 'Check ready', 'refresh');
                if (ready) {
                    $(use).on('click', function () {
                        setRunPodAiProvider(baseUrl, getRunPodPodModelId(pod));
                    });
                } else {
                    use.disabled = 'disabled';
                }
                if (readiness.state === 'checking') { checkReady.disabled = 'disabled'; }
                $(checkReady).on('click', function () { checkRunPodPodReadiness(pod, false); });
                return h('div.pft-runpod-ai-pod-row', [
                    h('div', [
                        h('strong', pod.name || 'RunPod pod'),
                        h('div.pft-doc-subtitle.pft-mono', podId)
                    ]),
                    h('div.pft-runpod-ready-cell', [
                        h('span.pft-pill' + readinessClass,
                            ready ? 'Ready' :
                                (readiness.state === 'checking' ? 'Checking' : 'Booting')),
                        h('div.pft-doc-subtitle', readiness.message || '')
                    ]),
                    use,
                    checkReady
                ]);
            })) : h('div.pft-view-meta',
                'Load pods here or use RunPod Compute -> RunPod pods -> Use for AI after the model is ready.'),
            h('label.pft-label', 'Request defaults'),
            h('pre.pft-ai-request-preview', payload)
        ]);
    };

    var renderAI = function () {
        var settings = APP.aiSettings || getDefaultAiSettings();
        var activeProvider = getAiProvider(settings.provider) || getAiProvider('ambient');
        var cards = [
            renderAiProviderSelector()
        ];
        if (activeProvider && activeProvider.requiresKey !== false) {
            cards.push(renderAiProviderCard(activeProvider));
        }
        if (activeProvider && activeProvider.id === 'openrouter') {
            cards.push(renderOpenRouterSettings());
        }
        if (activeProvider && activeProvider.id === 'runpod') {
            cards.push(renderRunPodAiSettings());
        }
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'AI'),
                    h('div.pft-view-meta', 'Provider, model, and local API key settings')
                ])
            ]),
            h('div.pft-warning-panel.pft-ai-warning', [
                h('h2', 'API key privacy'),
                h('p', 'Keys saved here are browser-local secrets, not encrypted document content. They are not covered by document end-to-end encryption, are readable by this page while unlocked in the browser, and are sent directly to the selected AI provider when checked or used.'),
                h('p', 'They are stored in this browser profile. Clearing Tor Browser site data, using New Identity, or switching onion origins can remove access to previously saved keys.'),
                h('p', 'Use separate scoped keys and revoke them at the provider if this browser or page context is compromised.')
            ]),
            h('div.pft-settings-grid.pft-ai-grid', cards)
        ]);
    };

    var renderSuperthinkCallStats = function (state) {
        var calls = state && state.calls || [];
        var completed = calls.filter(function (call) { return !call.error; });
        var errors = calls.filter(function (call) { return !!call.error; });
        var totalMs = completed.reduce(function (sum, call) {
            return sum + (call.elapsedMs || 0);
        }, 0);
        var avgMs = completed.length ? Math.round(totalMs / completed.length) : 0;
        return h('div.pft-superthink-stats', [
            h('span.pft-superthink-tag', completed.length + ' call(s) complete'),
            errors.length ? h('span.pft-superthink-tag.pft-warn', errors.length + ' failed') : '',
            avgMs ? h('span.pft-superthink-tag', 'avg ' + (avgMs / 1000).toFixed(1) + 's') : '',
            h('span.pft-superthink-tag.pft-mono', state && state.model || getRunPodAiModel())
        ]);
    };

    var renderSuperthinkPersonaCard = function (persona) {
        var statusTone = persona.error ? '.pft-error' :
            (/ready|complete/iu.test(persona.status || '') ? '.pft-ok' : '.pft-warn');
        return h('article.pft-superthink-persona', [
            h('div.pft-superthink-persona-head', [
                h('div', [
                    h('h3', persona.name || 'Persona'),
                    h('div.pft-view-meta',
                        [persona.era, persona.angle].filter(Boolean).join(' · ') ||
                            (persona.relevance || 'Historical lens'))
                ]),
                h('span.pft-superthink-tag' + statusTone, persona.status || 'queued')
            ]),
            persona.relevance ? h('p.pft-superthink-relevance', persona.relevance) : '',
            persona.voiceStyle ? h('details.pft-superthink-detail', [
                h('summary', 'Voice contract'),
                h('p', persona.voiceStyle),
                persona.rhetoricalPatterns && persona.rhetoricalPatterns.length ?
                    h('ul', persona.rhetoricalPatterns.map(function (pattern) {
                        return h('li', pattern);
                    })) : '',
                persona.signatureMoves && persona.signatureMoves.length ?
                    h('ul', persona.signatureMoves.map(function (move) {
                        return h('li', move);
                    })) : ''
            ]) : '',
            persona.description ? h('details.pft-superthink-detail', [
                h('summary', 'Persona brief'),
                renderChatMarkdown(persona.description)
            ]) : '',
            persona.feedback ? h('div.pft-superthink-feedback', [
                h('div.pft-superthink-label', 'Feedback'),
                renderChatMarkdown(persona.feedback)
            ]) : '',
            persona.error ? h('div.pft-inbox-status.pft-error', [
                h('span.pft-wallet-dot.pft-error'),
                h('span', persona.error)
            ]) : ''
        ]);
    };

    var renderSuperthinkRound = function (round) {
        return h('section.pft-superthink-round', [
            h('div.pft-superthink-round-head', [
                h('div', [
                    h('h2', 'Round ' + round.number),
                    h('div.pft-view-meta',
                        'Five historical lenses, then manager compression')
                ]),
                h('span.pft-superthink-tag' + (round.error ? '.pft-error' :
                        (round.status === 'Complete' ? '.pft-ok' : '.pft-warn')),
                    round.status || 'Queued')
            ]),
            round.selectorText ? h('details.pft-superthink-selector', [
                h('summary', 'Selector output'),
                h('pre.pft-ai-request-preview', round.selectorText)
            ]) : '',
            round.personas.length ? h('div.pft-superthink-persona-grid',
                round.personas.map(renderSuperthinkPersonaCard)) : '',
            round.managerSummary ? h('section.pft-superthink-manager', [
                h('div.pft-superthink-label', 'Manager synthesis'),
                renderChatMarkdown(round.managerSummary)
            ]) : '',
            round.error ? h('div.pft-inbox-status.pft-error', [
                h('span.pft-wallet-dot.pft-error'),
                h('span', round.error)
            ]) : ''
        ]);
    };

    var renderSuperthinkEmpty = function () {
        var configured = !!getRunPodAiBaseUrl();
        return h('section.pft-panel.pft-superthink-empty', [
            icon('brain'),
            h('h2', 'Run a three-round historical persona paper'),
            h('p', 'Superthink uses only the configured RunPod endpoint. It loads the wallet context doc and Task Node history, runs three non-repeating persona rounds, then writes a final report.'),
            h('div.pft-inbox-status' + (configured ? '.pft-ok' : '.pft-warn'), [
                h('span.pft-wallet-dot' + (configured ? '.pft-ok' : '.pft-warn')),
                h('span', configured ?
                    'RunPod endpoint: ' + getRunPodAiBaseUrl() :
                    'No RunPod endpoint configured yet.')
            ])
        ]);
    };

    var renderSuperthink = function () {
        var state = APP.superthink;
        var run = button('pft-primary-button', APP.superthinkRunning ?
            'Running Superthink' : 'Run Superthink', 'brain');
        var reset = button('pft-secondary-button', 'Reset', 'refresh');
        var copyTranscript = button('pft-secondary-button', 'Copy transcript', 'copy');
        var copyFinal = button('pft-secondary-button', 'Copy final', 'copy');
        var statusClass = APP.superthinkRunning ? '.pft-warn' :
            (state && state.error ? '.pft-error' :
                (state && state.finalReport ? '.pft-ok' : ''));
        if (APP.superthinkRunning) {
            run.disabled = 'disabled';
            reset.disabled = 'disabled';
        }
        if (!state || !state.rounds.length) { copyTranscript.disabled = 'disabled'; }
        if (!state || !state.finalReport) { copyFinal.disabled = 'disabled'; }
        $(run).on('click', startSuperthink);
        $(reset).on('click', resetSuperthink);
        $(copyTranscript).on('click', function () {
            copyText(buildSuperthinkTranscriptText(state), 'Superthink transcript copied.');
        });
        $(copyFinal).on('click', function () {
            copyText(state && state.finalReport || '', 'Superthink report copied.');
        });
        return h('section.pft-view.pft-superthink-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Superthink'),
                    h('div.pft-view-meta',
                        'RunPod-only historical persona synthesis over Task Node and context docs')
                ]),
                h('div.pft-actions-row', [run, reset, copyTranscript, copyFinal])
            ]),
            h('div.pft-superthink-topline', [
                h('div.pft-inbox-status' + statusClass, [
                    h('span.pft-wallet-dot' + statusClass),
                    h('span', APP.superthinkStatus ||
                        (getRunPodAiBaseUrl() ? 'Ready.' : 'Configure RunPod before running.'))
                ]),
                state ? renderSuperthinkCallStats(state) : ''
            ]),
            state ? h('section.pft-panel.pft-superthink-context-card', [
                h('div.pft-panel-heading', [
                    h('div', [
                    h('h2', 'Run context'),
                    h('div.pft-view-meta',
                        state.baseUrl || getRunPodAiBaseUrl() || 'No RunPod endpoint')
                ]),
                    h('span.pft-superthink-tag.pft-mono',
                        state.contextText ? String(state.contextText.length) + ' chars' : 'pending')
                ]),
                state.error ? h('div.pft-inbox-status.pft-error', [
                    h('span.pft-wallet-dot.pft-error'),
                    h('span', state.error)
                ]) : '',
                state.contextText ? h('details.pft-superthink-context-preview', [
                    h('summary', 'Context preview'),
                    h('pre.pft-ai-request-preview',
                        truncateChatText(state.contextText, 6000))
                ]) : ''
            ]) : renderSuperthinkEmpty(),
            state && state.rounds.length ? h('div.pft-superthink-rounds',
                state.rounds.map(renderSuperthinkRound)) : '',
            state && state.finalReport ? h('section.pft-panel.pft-superthink-final', [
                h('div.pft-panel-heading', [
                    h('div', [
                        h('h2', 'Final Superthink Report'),
                        h('div.pft-view-meta', state.completedAt ?
                            new Date(state.completedAt).toLocaleString() : '')
                    ]),
                    h('span.pft-superthink-tag.pft-ok', 'Complete')
                ]),
                renderChatMarkdown(state.finalReport)
            ]) : ''
        ]);
    };

    var renderRunPodKeyCard = function () {
        var savedKey = APP.runPodKey || '';
        var status = APP.runPodKeyStatus || {
            state: savedKey ? 'saved' : 'missing',
            message: savedKey ? 'RunPod key saved locally.' : 'No RunPod key saved.'
        };
        var checking = APP.runPodKeyChecking;
        var statusClass = getRunPodKeyStatusClass(status.state);
        var input = h('input.pft-input.pft-ai-key-input#pft-runpod-key', {
            type: 'password',
            autocomplete: 'off',
            spellcheck: false,
            placeholder: savedKey ? 'Saved: ' + redactSecret(savedKey) : 'Paste RunPod API key'
        });
        var save = button('pft-secondary-button', 'Save', 'key');
        var check = button('pft-primary-button', checking ? 'Checking' : 'Check', 'refresh');
        var remove = button('pft-secondary-button', 'Remove', 'trash-empty');
        if (checking) { check.disabled = 'disabled'; }
        if (!savedKey) { remove.disabled = 'disabled'; }
        $(save).on('click', saveRunPodKey);
        $(check).on('click', checkRunPodKey);
        $(remove).on('click', removeRunPodKey);
        return h('section.pft-panel.pft-runpod-key-card', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'RunPod API key'),
                    h('div.pft-view-meta', 'Stored locally in this browser')
                ]),
                h('span.pft-pill' + (savedKey ? '.pft-ok' : '.pft-warn'),
                    savedKey ? 'Saved' : 'Missing')
            ]),
            h('label.pft-label', { for: 'pft-runpod-key' }, 'RunPod API key'),
            h('div.pft-runpod-key-row', [
                input,
                h('div.pft-runpod-key-actions', [save, check, remove])
            ]),
            h('div.pft-inbox-status' + statusClass, [
                h('span.pft-wallet-dot' + statusClass),
                h('span', status.message)
            ]),
            status.checkedAt ? h('div.pft-view-meta',
                'Last status update: ' + new Date(status.checkedAt).toLocaleString()) : '',
            h('a.pft-provider-doc-link', {
                href: 'https://console.runpod.io/user/settings',
                target: '_blank',
                rel: 'noopener noreferrer'
            }, 'RunPod account settings')
        ]);
    };

    var renderRunPodModelControl = function (settings) {
        var select = h('select.pft-input.pft-select#pft-runpod-model',
            RUNPOD_MODEL_PRESETS.map(function (entry) {
                var selected = settings.modelPreset === entry.id ||
                    (entry.id === 'custom' && !RUNPOD_MODEL_PRESETS.some(function (preset) {
                        return preset.id === settings.modelId;
                    }));
                var attrs = { value: entry.id };
                if (selected) { attrs.selected = true; }
                return h('option', attrs, entry.label + (entry.id !== 'custom' ? ' - ' + entry.id : ''));
            }));
        var modelInput = h('input.pft-input#pft-runpod-model-id', {
            value: settings.modelId,
            autocomplete: 'off',
            spellcheck: false,
            placeholder: 'Ollama model name'
        });
        $(select).on('change', function () {
            setRunPodModelPreset($(this).val());
        });
        $(modelInput).on('input', function () {
            APP.runPodSettings.modelPreset = 'custom';
            APP.runPodSettings.modelId = String($(this).val() || '').trim();
            saveRunPodSettings();
        });
        return h('div.pft-runpod-field.pft-runpod-span-2', [
            h('label.pft-label', { for: 'pft-runpod-model' }, 'Model'),
            select,
            h('label.pft-label.pft-runpod-inline-label', { for: 'pft-runpod-model-id' },
                'Ollama model name'),
            modelInput
        ]);
    };

    var renderRunPodGpuControl = function (settings) {
        var seenGpuOptions = {};
        var gpuOptions = RUNPOD_GPU_PRESETS.map(function (entry) {
            var attrs = { value: entry.id };
            entry.gpuTypeIds.forEach(function (id) { seenGpuOptions[id] = true; });
            if (settings.gpuPreset === entry.id) { attrs.selected = true; }
            return h('option', attrs, entry.label);
        }).concat((APP.runPodGpuTypes || []).filter(function (id) {
            if (seenGpuOptions[id]) { return false; }
            seenGpuOptions[id] = true;
            return true;
        }).map(function (id) {
            var value = 'gpu:' + id;
            var attrs = { value: value };
            if (settings.gpuPreset === value) { attrs.selected = true; }
            return h('option', attrs, 'RunPod: ' + id);
        }));
        var select = h('select.pft-input.pft-select#pft-runpod-gpu', gpuOptions);
        var custom = h('textarea.pft-textarea#pft-runpod-custom-gpu', {
            rows: 2,
            spellcheck: false,
            placeholder: 'One or more RunPod GPU type IDs, comma or newline separated'
        }, settings.customGpuTypeIds || '');
        $(select).on('change', function () {
            setRunPodSetting('gpuPreset', $(this).val());
        });
        $(custom).on('input', function () {
            APP.runPodSettings.customGpuTypeIds = $(this).val();
            saveRunPodSettings();
        });
        return h('div.pft-runpod-field.pft-runpod-span-2', [
            h('label.pft-label', { for: 'pft-runpod-gpu' }, 'Machine'),
            select,
            settings.gpuPreset === 'custom' ? h('div', [
                h('label.pft-label.pft-runpod-inline-label', { for: 'pft-runpod-custom-gpu' },
                    'Custom GPU type IDs'),
                custom
            ]) : ''
        ]);
    };

    var renderRunPodNumberInput = function (id, label, key, settings) {
        var input = h('input.pft-input#' + id, {
            type: 'number',
            value: settings[key],
            min: 1
        });
        $(input).on('change', function () {
            setRunPodSetting(key, $(this).val());
        });
        return h('div.pft-runpod-field', [
            h('label.pft-label', { for: id }, label),
            input
        ]);
    };

    var renderRunPodLaunchCard = function () {
        var settings = normalizeRunPodSettings(APP.runPodSettings);
        var refreshGpus = button('pft-secondary-button',
            APP.runPodGpuTypesLoading ? 'Loading GPUs' : 'Refresh GPU types', 'refresh');
        var create = button('pft-primary-button',
            APP.runPodCreating ? 'Creating pod' : 'Create paid pod', 'play');
        var podName = h('input.pft-input#pft-runpod-name', {
            value: settings.podName,
            autocomplete: 'off',
            spellcheck: false
        });
        var image = h('input.pft-input#pft-runpod-image', {
            value: settings.imageName,
            autocomplete: 'off',
            spellcheck: false
        });
        var secureAttrs = { value: 'SECURE' };
        var communityAttrs = { value: 'COMMUNITY' };
        if (settings.cloudType === 'SECURE') { secureAttrs.selected = true; }
        if (settings.cloudType === 'COMMUNITY') { communityAttrs.selected = true; }
        var cloud = h('select.pft-input.pft-select#pft-runpod-cloud', [
            h('option', secureAttrs, 'Secure Cloud'),
            h('option', communityAttrs, 'Community Cloud')
        ]);
        var interruptibleAttrs = { type: 'checkbox' };
        var interruptible;
        if (settings.interruptible) { interruptibleAttrs.checked = true; }
        interruptible = h('input#pft-runpod-interruptible', interruptibleAttrs);
        if (APP.runPodGpuTypesLoading || APP.runPodCreating) {
            refreshGpus.disabled = 'disabled';
        }
        if (APP.runPodCreating) { create.disabled = 'disabled'; }
        $(podName).on('input', function () {
            APP.runPodSettings.podName = String($(this).val() || '').trim();
            saveRunPodSettings();
        });
        $(image).on('input', function () {
            APP.runPodSettings.imageName = String($(this).val() || '').trim();
            saveRunPodSettings();
        });
        $(cloud).on('change', function () {
            setRunPodSetting('cloudType', $(this).val());
        });
        $(interruptible).on('change', function () {
            setRunPodSetting('interruptible', $(this).is(':checked'));
        });
        $(refreshGpus).on('click', function () {
            loadRunPodGpuTypes(true);
        });
        $(create).on('click', createRunPodPod);
        return h('section.pft-panel.pft-runpod-launch-card', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'Qwen Ollama pod'),
                    h('div.pft-view-meta', 'Native Ollama on port 8000; Fast mode uses think:false')
                ]),
                h('div.pft-runpod-heading-actions', [refreshGpus, create])
            ]),
            h('div.pft-runpod-form-grid', [
                h('div.pft-runpod-field.pft-runpod-span-2', [
                    h('label.pft-label', { for: 'pft-runpod-name' }, 'Pod name'),
                    podName
                ]),
                h('div.pft-runpod-field', [
                    h('label.pft-label', { for: 'pft-runpod-cloud' }, 'Cloud'),
                    cloud
                ]),
                renderRunPodModelControl(settings),
                renderRunPodGpuControl(settings),
                h('div.pft-runpod-field.pft-runpod-wide-field', [
                    h('label.pft-label', { for: 'pft-runpod-image' }, 'Container image'),
                    image
                ]),
                renderRunPodNumberInput('pft-runpod-volume', 'Volume GB', 'volumeGb', settings),
                renderRunPodNumberInput('pft-runpod-container-disk', 'Container disk GB',
                    'containerDiskGb', settings),
                renderRunPodNumberInput('pft-runpod-context', 'Context length', 'contextLength', settings),
                renderRunPodNumberInput('pft-runpod-gpu-count', 'GPU count', 'gpuCount', settings),
                renderRunPodNumberInput('pft-runpod-vcpu', 'Min vCPU/GPU', 'minVcpuPerGpu', settings),
                renderRunPodNumberInput('pft-runpod-ram', 'Min RAM/GPU', 'minRamPerGpu', settings),
                h('label.pft-runpod-checkbox', [
                    interruptible,
                    h('span', 'Allow interruptible pricing')
                ])
            ]),
            APP.runPodGpuTypesStatus ? h('div.pft-inbox-status', [
                h('span.pft-wallet-dot' + (APP.runPodGpuTypes.length ? '.pft-ok' : '.pft-warn')),
                h('span', APP.runPodGpuTypesStatus)
            ]) : '',
            APP.runPodStatus ? h('div.pft-inbox-status', [
                h('span.pft-wallet-dot'),
                h('span', APP.runPodStatus)
            ]) : ''
        ]);
    };

    var renderRunPodPayloadPreview = function () {
        var payload;
        var text;
        try {
            payload = buildRunPodPodPayload();
            text = JSON.stringify(payload, null, 2);
        } catch (err) {
            text = err.message || 'Unable to build RunPod payload.';
        }
        return h('details.pft-panel.pft-wide-panel.pft-runpod-preview', [
            h('summary.pft-tasknode-section-summary', [
                h('h2', 'Payload preview'),
                h('span.pft-pill', 'dry run')
            ]),
            h('pre.pft-ai-request-preview.pft-runpod-payload-preview', text)
        ]);
    };

    var renderRunPodResult = function () {
        var result = APP.runPodLastResult;
        var copyBase;
        var copyLogs;
        var useAi;
        var checkReady;
        var readiness;
        var ready;
        var readinessClass;
        if (!result) { return ''; }
        readiness = result.pod ? getRunPodPodReadiness(result.pod) :
            { state: 'unknown', message: 'Waiting for RunPod response.' };
        ready = readiness.state === 'ready';
        readinessClass = ready ? '.pft-ok' :
            (readiness.state === 'stopped' ? '.pft-error' : '.pft-warn');
        copyBase = button('pft-secondary-button', 'Copy API base', 'copy');
        copyLogs = button('pft-secondary-button', 'Copy logs URL', 'copy');
        useAi = button('pft-primary-button', ready ? 'Use for AI' : 'Waiting for model', 'bot');
        checkReady = button('pft-secondary-button',
            readiness.state === 'checking' ? 'Checking model' : 'Check model', 'refresh');
        if (result.baseUrl) {
            $(copyBase).on('click', function () {
                copyText(result.baseUrl + '/v1', 'RunPod API base copied.');
            });
            if (ready) {
                $(useAi).on('click', function () {
                    setRunPodAiProvider(
                        result.baseUrl + '/v1',
                        result.request && result.request.env && result.request.env.PFT_MODEL_ID ||
                            getRunPodAiModel()
                    );
                });
            } else {
                useAi.disabled = 'disabled';
            }
        } else {
            copyBase.disabled = 'disabled';
            useAi.disabled = 'disabled';
        }
        if (result.pod && isRunPodPodRunning(result.pod) && readiness.state !== 'checking') {
            $(checkReady).on('click', function () {
                checkRunPodPodReadiness(result.pod, false);
            });
        } else {
            checkReady.disabled = 'disabled';
        }
        if (result.logsUrl) {
            $(copyLogs).on('click', function () {
                copyText(result.logsUrl, 'RunPod logs URL copied.');
            });
        } else {
            copyLogs.disabled = 'disabled';
        }
        return h('section.pft-panel.pft-wide-panel.pft-runpod-result', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'Latest pod'),
                    h('div.pft-view-meta', result.pod && result.pod.id || 'Pending RunPod response')
                ]),
                h('span.pft-pill' + (result.pod ? '.pft-ok' : '.pft-warn'),
                    result.pod ? 'Created' : 'Request staged')
            ]),
            result.baseUrl ? h('div.pft-settings-summary', [
                h('div.pft-setting-row', [
                    h('span', 'OpenAI API base'),
                    h('span.pft-mono', result.baseUrl + '/v1')
                ]),
                h('div.pft-setting-row', [
                    h('span', 'Ollama tags'),
                    h('span.pft-mono', result.healthUrl)
                ]),
                result.logsUrl ? h('div.pft-setting-row', [
                    h('span', 'Startup logs'),
                    h('span.pft-mono', result.logsUrl)
                ]) : ''
            ]) : '',
            h('div.pft-inbox-status' + readinessClass, [
                h('span.pft-wallet-dot' + readinessClass),
                h('span', readiness.message || 'Model readiness has not been checked yet.')
            ]),
            h('div.pft-actions-row', [useAi, checkReady, copyBase, copyLogs])
        ]);
    };

    var renderRunPodPods = function () {
        var refresh = button('pft-secondary-button',
            APP.runPodPodsLoading ? 'Loading pods' : 'List pods', 'refresh');
        var rows = (APP.runPodPods || []).map(function (pod) {
            var podId = String(pod && pod.id || '');
            var baseUrl = podId ? getRunPodProxyUrl(podId, 8000) + '/v1' : '';
            var running = isRunPodPodRunning(pod);
            var readiness = getRunPodPodReadiness(pod);
            var ready = readiness.state === 'ready';
            var readinessClass = readiness.state === 'ready' ? '.pft-ok' :
                (readiness.state === 'stopped' ? '.pft-error' : '.pft-warn');
            var copyBase = button('pft-table-button', 'Copy API base', 'copy');
            var useAi = button('pft-table-button', ready ? 'Use for AI' : 'Waiting', 'bot');
            var checkReady = button('pft-table-button',
                readiness.state === 'checking' ? 'Checking' : 'Check ready', 'refresh');
            var stop = button('pft-table-button', 'Stop', 'minus');
            var terminate = button('pft-table-button', 'Terminate', 'trash-empty');
            if (baseUrl) {
                $(copyBase).on('click', function () {
                    copyText(baseUrl, 'RunPod API base copied.');
                });
            } else {
                copyBase.disabled = 'disabled';
            }
            if (baseUrl && running && ready) {
                $(useAi).on('click', function () {
                    setRunPodAiProvider(baseUrl, getRunPodPodModelId(pod));
                });
            } else {
                useAi.disabled = 'disabled';
            }
            if (!running || readiness.state === 'checking') {
                checkReady.disabled = 'disabled';
            }
            $(checkReady).on('click', function () { checkRunPodPodReadiness(pod, false); });
            if (!running) { stop.disabled = 'disabled'; }
            $(stop).on('click', function () { stopRunPodPod(podId); });
            $(terminate).on('click', function () { deleteRunPodPod(podId); });
            return h('tr', [
                h('td', [
                    h('strong', pod.name || 'RunPod pod'),
                    h('div.pft-doc-subtitle.pft-mono', podId)
                ]),
                h('td', pod.desiredStatus || pod.status || ''),
                h('td', [
                    h('span.pft-pill' + readinessClass,
                        readiness.state === 'ready' ? 'Ready' :
                            (readiness.state === 'checking' ? 'Checking' :
                                (readiness.state === 'stopped' ? 'Stopped' : 'Booting'))),
                    h('div.pft-doc-subtitle', readiness.message || '')
                ]),
                h('td', pod.gpu && (pod.gpu.displayName || pod.gpu.id) ||
                    pod.machine && (pod.machine.gpuDisplayName || pod.machine.gpuTypeId) || ''),
                h('td', pod.costPerHr || pod.adjustedCostPerHr || ''),
                h('td.pft-table-actions', [useAi, checkReady, copyBase, stop, terminate])
            ]);
        });
        if (APP.runPodPodsLoading) { refresh.disabled = 'disabled'; }
        $(refresh).on('click', refreshRunPodPods);
        return h('section.pft-panel.pft-wide-panel', [
            h('div.pft-panel-heading', [
                h('div', [
                    h('h2', 'RunPod pods'),
                    h('div.pft-view-meta', 'List, copy endpoints, stop, or terminate pods on this key')
                ]),
                refresh
            ]),
            rows.length ? h('div.pft-table-wrap', [
                h('table.pft-table.pft-runpod-table', [
                    h('thead', h('tr', [
                        h('th', 'Pod'),
                        h('th', 'State'),
                        h('th', 'Model'),
                        h('th', 'GPU'),
                        h('th', 'Cost/hr'),
                        h('th', 'Actions')
                    ])),
                    h('tbody', rows)
                ])
            ]) : h('div.pft-empty', [
                h('h2', APP.runPodPodsLoading ? 'Loading pods' : 'No pods loaded')
            ])
        ]);
    };

    var renderRunPod = function () {
        return h('section.pft-view.pft-runpod-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'RunPod Compute'),
                    h('div.pft-view-meta',
                        'Spin up Blackwell Ollama pods from inside PFT Docs')
                ])
            ]),
            h('div.pft-runpod-notice', [
                h('span.pft-pill.pft-warn', 'Paid action'),
                h('span', 'Keys stay browser-local. The server only forwards active RunPod requests; review the payload before creating a pod.')
            ]),
            h('div.pft-settings-grid.pft-runpod-grid', [
                renderRunPodKeyCard(),
                renderRunPodLaunchCard(),
                renderRunPodPayloadPreview(),
                renderRunPodResult(),
                renderRunPodPods()
            ])
        ]);
    };

    var renderSettings = function () {
        var walletAddress = APP.wallet && APP.wallet.address || '';
        var directory = APP.inboxDirectory;
        var inboxReady = APP.inboxDirectoryState === 'published' &&
            APP.inboxPublishedRelays.length > 0;
        var inboxFailed = APP.inboxDirectoryState === 'failed';
        var inboxCopied = APP.inboxDirectoryState === 'copied';
        var inboxPublishing = APP.inboxDirectoryState === 'publishing';
        var inboxStatus = APP.settingsStatus || (walletAddress ?
            (inboxReady ? 'Ready for wallet shares.' : 'Sharing inbox not published.') :
            'Wallet locked.');
        var inboxStatusClass = inboxReady ? '.pft-ok' : (inboxFailed ? '.pft-error' :
            (walletAddress ? '.pft-warn' : ''));
        var inboxDotClass = inboxReady ? '.pft-ok' : (inboxFailed ? '.pft-error' : '');
        var pillClass = inboxReady ? '.pft-ok' : (inboxFailed ? '.pft-error' : '.pft-warn');
        var pillText = inboxReady ? 'Published' : (inboxFailed ? 'Publish failed' :
            (inboxPublishing ? 'Publishing' : (inboxCopied ? 'Copied' : 'Not published')));
        var relayFailures = APP.inboxPublishFailures.map(getRelayFailureMessage);
        var relays = h('textarea.pft-textarea#pft-settings-relays', {
            rows: 3,
            spellcheck: false
        }, getPostFiatRelays().join('\n'));
        var copyInbox = button('pft-secondary-button', 'Copy inbox JSON', 'copy');
        var publishInbox = button('pft-primary-button', 'Publish inbox', 'upload');
        var lockWallet = button('pft-secondary-button', 'Lock wallet', 'lock');
        $(copyInbox).on('click', copyInboxDirectory);
        $(publishInbox).on('click', publishInboxDirectory);
        $(lockWallet).on('click', function () {
            lockWalletSession();
        });
        return h('section.pft-view', [
            h('div.pft-view-header', [
                h('div', [
                    h('h1', 'Settings'),
                    h('div.pft-view-meta', 'Wallet and relay state')
                ])
            ]),
            h('div.pft-settings-grid', [
                h('section.pft-panel.pft-wide-panel', [
                    h('div.pft-panel-heading', [
                        h('h2', 'Sharing inbox'),
                        h('span.pft-pill' + pillClass, pillText)
                    ]),
                    h('div.pft-settings-summary', [
                        h('div.pft-setting-row', [
                            h('span', 'Share address'),
                            h('span.pft-mono', walletAddress || 'Locked')
                        ]),
                        h('div.pft-setting-row', [
                            h('span', 'Directory key'),
                            h('span.pft-mono', directory && directory.publicKeyHex ?
                                shortText(directory.publicKeyHex) : 'Not published')
                        ]),
                        h('div.pft-setting-row', [
                            h('span', 'Published relays'),
                            h('span.pft-mono', APP.inboxPublishedRelays.length ?
                                APP.inboxPublishedRelays.join(', ') : 'None')
                        ])
                    ]),
                    h('label.pft-label', { for: 'pft-settings-relays' }, 'Private relay list'),
                    relays,
                    h('div.pft-inbox-status' + inboxStatusClass, [
                        h('span.pft-wallet-dot' + inboxDotClass),
                        h('span', inboxStatus)
                    ]),
                    relayFailures.length ? h('div.pft-relay-failures.pft-mono',
                        relayFailures.join(' | ')) : '',
                    APP.wallet ? h('div.pft-actions-row', [publishInbox, copyInbox, lockWallet]) :
                        renderWalletUnlockPanel('pft-settings-unlock')
                ])
            ])
        ]);
    };

    var renderShareAside = function () {
        if (!APP.shareDoc) { return; }
        var relays = h('textarea.pft-textarea#pft-share-relays', {
            rows: 3,
            spellcheck: false
        }, getPostFiatRelays().join('\n'));
        var close = button('pft-icon-button', 'Close', 'close', { title: 'Close share' });
        var send = button('pft-primary-button', 'Send private share', 'share');
        $(close).on('click', function () {
            APP.shareDoc = null;
            APP.shareStatus = '';
            render();
        });
        $(send).on('click', shareDocument);
        return h('aside.pft-share-aside', [
            h('div.pft-aside-header', [
                h('div', [
                    h('h2', 'Share to wallet'),
                    h('div.pft-view-meta', APP.shareDoc.title)
                ]),
                close
            ]),
            h('label.pft-label', { for: 'pft-share-recipient' }, 'Recipient'),
            h('input.pft-input#pft-share-recipient', {
                placeholder: 'Wallet address or contact inbox',
                autocomplete: 'off'
            }),
            h('div.pft-segmented', [
                h('label', [
                    h('input', { type: 'radio', name: 'pft-share-mode', value: 'edit', checked: true }),
                    h('span', 'Edit')
                ]),
                h('label', [
                    h('input', { type: 'radio', name: 'pft-share-mode', value: 'view' }),
                    h('span', 'View')
                ])
            ]),
            h('label.pft-label', { for: 'pft-share-relays' }, 'Relays'),
            relays,
            h('div.pft-aside-status', APP.shareStatus),
            h('div.pft-actions-row', [send])
        ]);
    };

    var renderRoute = function () {
        if (APP.route === 'shared') { return renderShared(); }
        if (APP.route === 'sent') { return renderSent(); }
        if (APP.route === 'tasknode') { return renderTaskNode(); }
        if (APP.route === 'messages') { return renderMessages(); }
        if (APP.route === 'chat') { return renderChat(); }
        if (APP.route === 'superthink') { return renderSuperthink(); }
        if (APP.route === 'ai') { return renderAI(); }
        if (APP.route === 'compute') { return renderRunPod(); }
        if (APP.route === 'contacts') { return renderContacts(); }
        if (APP.route === 'durable') { return renderDurable(); }
        if (APP.route === 'settings') { return renderSettings(); }
        return renderDocs();
    };

    var bindShell = function () {
        $('.pft-search').on('input', function () {
            APP.search = $(this).val();
            render();
        });
        $('.pft-new-menu > .pft-primary-button').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            $('.pft-new-menu').toggleClass('pft-open');
        });
        $(window).off('click.pft-app').on('click.pft-app', function () {
            $('.pft-new-menu').removeClass('pft-open');
        });
        $('.pft-new-menu').on('click', function (e) {
            e.stopPropagation();
        });
        if (APP.route === 'shared' && !APP.inboxLoaded && !APP.inboxLoading) {
            setTimeout(fetchInbox);
        }
        if (APP.route === 'tasknode' && !APP.taskNodeLoaded && !APP.taskNodeLoading) {
            setTimeout(refreshTaskNode);
        }
        if (APP.route === 'messages' && !APP.peerLoaded && !APP.peerLoading) {
            setTimeout(refreshPeerMessages);
        }
        if (APP.route === 'chat' && APP.aiSettings &&
                APP.aiSettings.provider === 'openrouter' &&
                !APP.openRouterModelsLoaded && !APP.openRouterModelsLoading) {
            setTimeout(loadOpenRouterModels);
        }
        if (APP.route === 'ai' && APP.aiSettings &&
                APP.aiSettings.provider === 'openrouter' &&
                !APP.openRouterModelsLoaded && !APP.openRouterModelsLoading) {
            setTimeout(loadOpenRouterModels);
        }
        if ((APP.route === 'ai' || APP.route === 'chat' ||
                    (APP.route === 'superthink' && APP.runPodKey)) && APP.aiSettings &&
                (APP.aiSettings.provider === 'runpod' || APP.route === 'superthink') &&
                !getRunPodAiBaseUrl() &&
                !tryAutoPopulateRunPodAiProvider(false) && APP.runPodKey &&
                !APP.runPodPodsLoading && !APP.runPodAutoLoadAttempted) {
            APP.runPodAutoLoadAttempted = true;
            setTimeout(refreshRunPodPods);
        }
        if (APP.route === 'compute' && !APP.runPodGpuTypes.length &&
                !APP.runPodGpuTypesLoading) {
            setTimeout(loadRunPodGpuTypes);
        }
    };

    var renderLoggedOut = function () {
        var login = button('pft-primary-button', 'Log in', 'login');
        $(login).on('click', function () { openTopLevel('/login/'); });
        $('#cp-postfiat-app').empty().append(h('div.pft-login-required', [
            h('div.pft-brand-mark', 'PF'),
            h('h1', 'PFT Docs'),
            login
        ]));
        UI.removeLoadingScreen();
        if (!readySent && sframeChan) {
            readySent = true;
            sframeChan.event('EV_POSTFIAT_APP_READY');
        }
    };

    var render = function () {
        var chatScrollState;
        if (!common) { return; }
        if (!common.isLoggedIn()) {
            renderLoggedOut();
            return;
        }
        if (APP.route === 'chat') {
            chatScrollState = captureChatScrollState();
        }
        $('#cp-postfiat-app').empty().append(renderShell(renderRoute(), renderShareAside()));
        bindShell();
        if (APP.route === 'chat') {
            restoreChatScrollState(chatScrollState);
        }
        UI.removeLoadingScreen();
        if (!readySent && sframeChan) {
            readySent = true;
            sframeChan.event('EV_POSTFIAT_APP_READY');
        }
    };

    var refreshDrive = Util.throttle(function () {
        loadDrive().then(render).catch(function (err) {
            console.error(err);
        });
    }, 500);

    var init = function () {
        sframeChan = common.getSframeChannel();
        common.setTabTitle('PFT Docs');
        loadAiSettings();
        loadAiKeys();
        loadRunPodSettings();
        loadRunPodKey();
        loadChatState();
        loadPeerMessageState();
        if (!common.isLoggedIn()) {
            renderLoggedOut();
            return;
        }
        sframeChan.on('EV_DRIVE_CHANGE', refreshDrive);
        sframeChan.on('EV_DRIVE_REMOVE', refreshDrive);
        sframeChan.on('EV_NETWORK_DISCONNECT', function () {
            APP.walletStatus = 'Offline';
            render();
        });
        sframeChan.on('EV_NETWORK_RECONNECT', function () {
            APP.walletStatus = APP.wallet ? 'Unlocked' : 'Checking';
            refreshDrive();
        });
        Promise.all([
            loadDrive(),
            loadContacts(),
            getSessionWallet().catch(function (err) {
                console.error(err);
                if (isWalletAccountMismatch(err)) {
                    APP.docs = [];
                    APP.contacts = [];
                    APP.walletStatus = 'Account mismatch';
                    setTimeout(function () {
                        switchWalletSession();
                    });
                    return;
                }
                APP.wallet = null;
                APP.walletSession = null;
                clearInboxDirectoryState();
                clearTaskNodeState();
                APP.walletStatus = 'Locked';
            })
        ]).then(render).catch(function (err) {
            console.error(err);
            UI.errorLoadingScreen(Messages.error);
        });
    };

    nThen(function (waitFor) {
        $(waitFor(function () {
            UI.addLoadingScreen();
        }));
        SFCommon.create(waitFor(function (c) {
            common = c;
        }));
    }).nThen(init);
});
