// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var API_BASE_PATH = '/api/postfiat/runpod';
    var DEFAULT_MODEL = 'qwen3.6:27b';
    var DEFAULT_OLLAMA_MODEL = 'qwen3.6:27b';

    var stripTrailingSlash = function (value) {
        return String(value || '').replace(/\/+$/u, '');
    };

    var getApiUrls = function (path, opts) {
        var suffix = (opts && opts.apiBasePath || API_BASE_PATH) + path;
        var urls = [suffix];
        var unsafeOrigin = stripTrailingSlash(opts && opts.unsafeOrigin);
        var currentOrigin = stripTrailingSlash(opts && opts.currentOrigin);
        var unsafeUrl = unsafeOrigin ? unsafeOrigin + suffix : '';
        if (unsafeUrl && unsafeOrigin !== currentOrigin) { urls.push(unsafeUrl); }
        return urls;
    };

    var isCrossOrigin = function (url, currentOrigin) {
        return /^https?:\/\//u.test(String(url || '')) &&
            String(url).indexOf(stripTrailingSlash(currentOrigin)) !== 0;
    };

    var makeFetchOptions = function (options, crossOrigin, defaultKey) {
        var hasExplicitKey = options && Object.prototype.hasOwnProperty.call(options, 'key');
        var key = hasExplicitKey ? options.key :
            (options && options.skipDefaultKey ? '' : defaultKey || '');
        var headers = { Accept: options && options.accept || 'application/json' };
        var body;
        if (key) { headers.Authorization = 'Bearer ' + key; }
        if (options && typeof(options.body) !== 'undefined') {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(options.body);
        }
        options = {
            method: options && options.method || 'GET',
            credentials: crossOrigin ? 'omit' : 'same-origin',
            headers: headers,
            body: body
        };
        if (crossOrigin) { options.mode = 'cors'; }
        return options;
    };

    var parseResponse = function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
            var err;
            if (!response.ok) {
                err = new Error(data && (data.error || data.message) ||
                    ('RunPod returned HTTP ' + response.status + '.'));
                if (response.status === 404) { err.postFiatRetryableRunPod = true; }
                throw err;
            }
            return data;
        });
    };

    var normalizeFetchError = function (err) {
        var message = err && err.message || '';
        if (/Failed to fetch|NetworkError|Load failed/u.test(message)) {
            return new Error('Unable to reach the PFT Docs RunPod proxy from this browser origin. Reload and try again; if it persists, the safe/unsafe origin route is blocked.');
        }
        return err;
    };

    var shouldRetryFetch = function (err) {
        var message = err && err.message || '';
        return Boolean(err && err.postFiatRetryableRunPod) ||
            /Failed to fetch|NetworkError|Load failed/u.test(message);
    };

    var fetchJson = function (path, options, env) {
        var urls = getApiUrls(path, env);
        var fetchFn = env && env.fetch;
        var attempt = function (index) {
            var url = urls[index];
            var crossOrigin = isCrossOrigin(url, env && env.currentOrigin);
            return fetchFn(url, makeFetchOptions(options, crossOrigin,
                env && env.defaultKey)).then(parseResponse).catch(function (err) {
                if (index + 1 < urls.length && shouldRetryFetch(err)) {
                    return attempt(index + 1);
                }
                throw normalizeFetchError(err);
            });
        };
        if (typeof(fetchFn) !== 'function') {
            return Promise.reject(new Error('RunPod fetch is unavailable.'));
        }
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

    var fetchSse = function (path, options, handlers, env) {
        var urls = getApiUrls(path, env);
        var fetchFn = env && env.fetch;
        var attempt = function (index) {
            var url = urls[index];
            var crossOrigin = isCrossOrigin(url, env && env.currentOrigin);
            var fetchOptions = makeFetchOptions(Object.assign({}, options || {}, {
                accept: 'text/event-stream'
            }), crossOrigin, env && env.defaultKey);
            return fetchFn(url, fetchOptions).then(function (response) {
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
                if (index + 1 < urls.length && shouldRetryFetch(err)) {
                    return attempt(index + 1);
                }
                throw normalizeFetchError(err);
            });
        };
        if (typeof(fetchFn) !== 'function') {
            return Promise.reject(new Error('RunPod fetch is unavailable.'));
        }
        return attempt(0);
    };

    var parseModelIds = function (data) {
        var records = Array.isArray(data && data.data) ? data.data :
            (Array.isArray(data && data.models) ? data.models :
                (Array.isArray(data) ? data : []));
        return records.map(function (record) {
            return String(record && (record.id || record.name || record.model) || '').trim();
        }).filter(Boolean);
    };

    var getProxyUrl = function (podId, port) {
        return 'https://' + podId + '-' + (port || 8000) + '.proxy.runpod.net';
    };

    var isOllamaPod = function (pod) {
        return /ollama/ui.test(String(pod && (pod.name || pod.imageName || pod.image) || ''));
    };

    var getPodModelId = function (pod, opts) {
        var env = pod && pod.env || {};
        if (isOllamaPod(pod)) {
            return String(env.PFT_MODEL_ID || env.OLLAMA_MODEL ||
                opts && opts.defaultOllamaModel || DEFAULT_OLLAMA_MODEL).trim() ||
                (opts && opts.defaultOllamaModel || DEFAULT_OLLAMA_MODEL);
        }
        return String(env.PFT_MODEL_ID || env.AAO_MODEL_ID ||
            opts && opts.settings && opts.settings.modelId ||
            opts && opts.defaultModel || DEFAULT_MODEL).trim() ||
            (opts && opts.defaultModel || DEFAULT_MODEL);
    };

    var isPodRunning = function (pod) {
        var state = String(pod && (pod.desiredStatus || pod.status || '')).toUpperCase();
        return Boolean(pod && pod.id) && state !== 'EXITED' && state !== 'TERMINATED';
    };

    var getPodSortTime = function (pod) {
        return Date.parse(pod && (pod.lastStartedAt || pod.createdAt) || '') || 0;
    };

    return {
        extractAmbientStreamDelta: extractAmbientStreamDelta,
        extractRunPodStreamDelta: extractRunPodStreamDelta,
        fetchJson: fetchJson,
        fetchSse: fetchSse,
        getApiUrls: getApiUrls,
        getPodModelId: getPodModelId,
        getPodSortTime: getPodSortTime,
        getProxyUrl: getProxyUrl,
        isOllamaPod: isOllamaPod,
        isPodRunning: isPodRunning,
        makeFetchOptions: makeFetchOptions,
        normalizeFetchError: normalizeFetchError,
        parseModelIds: parseModelIds,
        parseResponse: parseResponse,
        readRunPodSseResponse: readRunPodSseResponse,
        readSseTextResponse: readSseTextResponse,
        shouldRetryFetch: shouldRetryFetch
    };
});
