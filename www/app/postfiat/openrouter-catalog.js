// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var normalizeModelRecord = function (record) {
        var id = String(record && (record.id || record.model_id) || '').trim();
        if (!id) { return null; }
        return {
            id: id,
            name: String(record.name || record.model_name || id),
            contextLength: Number(record.context_length || 0) || 0
        };
    };

    var parseModels = function (data) {
        var seen = {};
        var records = Array.isArray(data && data.data) ? data.data : [];
        return records.map(normalizeModelRecord).filter(function (model) {
            if (!model || seen[model.id]) { return false; }
            seen[model.id] = true;
            return true;
        }).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    };

    var parseZdrEndpoints = function (data) {
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

    var getZdrModelIdMap = function (endpoints) {
        var map = {};
        (endpoints || []).forEach(function (endpoint) {
            map[endpoint.modelId] = true;
        });
        return map;
    };

    var countZdrModels = function (endpoints) {
        return Object.keys(getZdrModelIdMap(endpoints)).length;
    };

    var getModelCatalog = function (opts) {
        var models = opts && opts.models && opts.models.length ?
            opts.models : opts && opts.fallbackModels || [];
        var endpoints = opts && opts.zdrEndpoints || [];
        var modelMap = {};
        var selected = opts && opts.selectedModel || '';
        var zdrOnly = Boolean(opts && opts.zdrOnly);
        var zdrMap = getZdrModelIdMap(endpoints);
        var hasZdrFilter = endpoints.length > 0;
        models.forEach(function (model) {
            if (zdrOnly && hasZdrFilter && !zdrMap[model.id]) { return; }
            modelMap[model.id] = model;
        });
        if (selected && !modelMap[selected]) {
            modelMap[selected] = {
                id: selected,
                name: selected + (hasZdrFilter && !zdrMap[selected] ?
                    ' (not in current ZDR list)' : '')
            };
        }
        return Object.keys(modelMap).map(function (id) {
            return modelMap[id];
        }).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    };

    var getZdrProvidersForModel = function (endpoints, modelId) {
        var names = {};
        (endpoints || []).forEach(function (endpoint) {
            if (endpoint.modelId === modelId && endpoint.providerName) {
                names[endpoint.providerName] = true;
            }
        });
        return Object.keys(names).sort();
    };

    var getModelStatus = function (opts) {
        var selected = opts && opts.selectedModel || '';
        var endpoints = opts && opts.zdrEndpoints || [];
        var providers = getZdrProvidersForModel(endpoints, selected);
        if (opts && opts.loading) {
            return 'Loading OpenRouter models and ZDR endpoint data...';
        }
        if (providers.length) {
            return 'Selected model has ' + providers.length +
                ' ZDR endpoint(s): ' + providers.slice(0, 6).join(', ') +
                (providers.length > 6 ? ', ...' : '') + '.';
        }
        if (endpoints.length) {
            return 'Selected model is not present in the current OpenRouter ZDR endpoint list.';
        }
        return opts && opts.status ||
            'Using fallback model list until OpenRouter model data is loaded.';
    };

    return {
        countZdrModels: countZdrModels,
        getModelCatalog: getModelCatalog,
        getModelStatus: getModelStatus,
        getZdrModelIdMap: getZdrModelIdMap,
        getZdrProvidersForModel: getZdrProvidersForModel,
        normalizeModelRecord: normalizeModelRecord,
        parseModels: parseModels,
        parseZdrEndpoints: parseZdrEndpoints
    };
});
