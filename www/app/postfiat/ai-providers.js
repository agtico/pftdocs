// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var OPENROUTER_MEMORY_MODEL = 'deepseek/deepseek-v4-flash';
    var AMBIENT_MEMORY_MODEL = 'stepfun/step-3.5-flash';
    var AMBIENT_MEMORY_FALLBACK_MODEL = 'ambient/large';

    var OPENROUTER_FALLBACK_MODELS = [
        { id: 'openai/gpt-5-mini', name: 'OpenAI: GPT-5 Mini' },
        { id: 'anthropic/claude-sonnet-4.5', name: 'Anthropic: Claude Sonnet 4.5' },
        { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
        { id: 'deepseek/deepseek-r1-0528', name: 'DeepSeek: R1 0528' },
        { id: 'qwen/qwen3-32b', name: 'Qwen: Qwen3 32B' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta: Llama 3.3 70B Instruct' }
    ];

    var AI_PROVIDERS = [
        {
            id: 'ambient',
            label: 'Ambient',
            keyLabel: 'Ambient API Key',
            baseConfigKey: 'ambientBaseUrl',
            defaultBaseUrl: 'https://api.ambient.xyz',
            checkPath: '/v1/models',
            docsUrl: 'https://docs.ambient.xyz/api',
            keyHelpText: 'Get API Keys at https://app.ambient.xyz/',
            keyHelpUrl: 'https://app.ambient.xyz/'
        },
        {
            id: 'openrouter',
            label: 'OpenRouter',
            keyLabel: 'OpenRouter API Key',
            baseConfigKey: 'openRouterBaseUrl',
            defaultBaseUrl: 'https://openrouter.ai',
            checkPath: '/api/v1/key',
            docsUrl: 'https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key',
            keyHelpText: 'Sign up at openrouter.com',
            keyHelpUrl: 'https://openrouter.com/',
            zdrDocsUrl: 'https://openrouter.ai/docs/features/zdr'
        },
        {
            id: 'runpod',
            label: 'RunPod',
            keyLabel: 'RunPod endpoint token',
            baseConfigKey: 'runPodBaseUrl',
            defaultBaseUrl: '',
            checkPath: '/models',
            docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
            keyHelpText: 'Use a running Ollama pod from RunPod Compute',
            keyHelpUrl: 'https://console.runpod.io/pods',
            requiresKey: false
        }
    ];

    var buildAmbientResponsesInput = function (messages) {
        return (messages || []).map(function (message) {
            var role = String(message && message.role || 'user').toUpperCase();
            return role + ':\n' + String(message && message.content || '');
        }).join('\n\n');
    };

    var buildAmbientResponsesPayload = function (messages, options) {
        options = options || {};
        var thinking = options.thinking === true;
        var payload = {
            model: options.model || 'ambient/large',
            input: buildAmbientResponsesInput(messages),
            stream: options.stream === true,
            store: false,
            emit_usage: options.emitUsage !== false,
            reasoning: { enabled: thinking }
        };
        if (thinking) {
            payload.thinking_budget = options.thinkingBudget || 1200;
        }
        if (typeof(options.temperature) === 'number') {
            payload.temperature = options.temperature;
        }
        return payload;
    };

    var buildOpenRouterChatPayload = function (messages, defaults, options) {
        options = options || {};
        defaults = defaults || {};
        return {
            model: defaults.model,
            messages: messages,
            provider: defaults.provider || {
                zdr: true,
                data_collection: 'deny'
            },
            temperature: typeof(options.temperature) === 'number' ? options.temperature : 0.2,
            max_tokens: options.maxTokens
        };
    };

    var prepareRunPodChatMessages = function (messages, options) {
        options = options || {};
        var truncateText = options.truncateText || function (value) {
            return String(value || '');
        };
        var systemLimit = options.systemLimit || 12000;
        var messageLimit = options.messageLimit || 6000;
        return (messages || []).map(function (message) {
            var role = String(message && message.role || 'user');
            var limit = role === 'system' ? systemLimit : messageLimit;
            return Object.assign({}, message, {
                role: role,
                content: truncateText(message && message.content || '', limit)
            });
        });
    };

    var buildRunPodChatPayload = function (messages, options) {
        options = options || {};
        return {
            model: options.model,
            messages: prepareRunPodChatMessages(messages, options),
            stream: options.stream === true,
            temperature: typeof(options.temperature) === 'number' ? options.temperature : 0.2,
            max_tokens: options.maxTokens,
            think: options.thinking === true,
            chat_template_kwargs: { enable_thinking: options.thinking === true }
        };
    };

    return {
        AI_PROVIDERS: AI_PROVIDERS,
        AMBIENT_MEMORY_FALLBACK_MODEL: AMBIENT_MEMORY_FALLBACK_MODEL,
        AMBIENT_MEMORY_MODEL: AMBIENT_MEMORY_MODEL,
        OPENROUTER_FALLBACK_MODELS: OPENROUTER_FALLBACK_MODELS,
        OPENROUTER_MEMORY_MODEL: OPENROUTER_MEMORY_MODEL,
        buildAmbientResponsesInput: buildAmbientResponsesInput,
        buildAmbientResponsesPayload: buildAmbientResponsesPayload,
        buildOpenRouterChatPayload: buildOpenRouterChatPayload,
        buildRunPodChatPayload: buildRunPodChatPayload,
        prepareRunPodChatMessages: prepareRunPodChatMessages
    };
});
