// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var RUNPOD_OLLAMA_IMAGE = 'ollama/ollama:latest';
    var RUNPOD_OLLAMA_DEFAULT_MODEL = 'qwen3.6:27b';
    var RUNPOD_HUIHUI_QWEN35_ABLITERATED_MODEL = 'huihui_ai/qwen3.5-abliterated';
    var RUNPOD_SGLANG_DEFAULT_MODEL = 'Qwen/Qwen3.6-27B-FP8';
    var RUNPOD_DEFAULT_MODEL = RUNPOD_OLLAMA_DEFAULT_MODEL;

    var RUNPOD_GPU_PRESETS = [
        {
            id: '6090',
            label: 'RTX PRO 6000 Blackwell auto',
            gpuTypeIds: [
                'NVIDIA RTX PRO 6000 Blackwell Server Edition',
                'NVIDIA RTX PRO 6000 Blackwell Workstation Edition'
            ]
        },
        {
            id: 'blackwell-server',
            label: 'RTX PRO 6000 Blackwell Server',
            gpuTypeIds: ['NVIDIA RTX PRO 6000 Blackwell Server Edition']
        },
        {
            id: 'blackwell-workstation',
            label: 'RTX PRO 6000 Blackwell Workstation',
            gpuTypeIds: ['NVIDIA RTX PRO 6000 Blackwell Workstation Edition']
        },
        {
            id: 'rtx-6000-ada',
            label: 'RTX 6000 Ada',
            gpuTypeIds: ['NVIDIA RTX 6000 Ada Generation']
        },
        { id: 'h100-hbm3', label: 'H100 80GB HBM3', gpuTypeIds: ['NVIDIA H100 80GB HBM3'] },
        { id: 'h100-pcie', label: 'H100 PCIe', gpuTypeIds: ['NVIDIA H100 PCIe'] },
        { id: 'h200', label: 'H200', gpuTypeIds: ['NVIDIA H200'] },
        { id: 'a100-sxm', label: 'A100 SXM4 80GB', gpuTypeIds: ['NVIDIA A100-SXM4-80GB'] },
        { id: 'a100-pcie', label: 'A100 PCIe 80GB', gpuTypeIds: ['NVIDIA A100 80GB PCIe'] },
        { id: 'b200', label: 'B200', gpuTypeIds: ['NVIDIA B200'] },
        { id: 'custom', label: 'Custom GPU IDs', gpuTypeIds: [] }
    ];

    var RUNPOD_MODEL_PRESETS = [
        { id: 'qwen3.6:27b', label: 'Qwen 3.6 27B', nativeOllama: true },
        { id: 'qwen3.6:27b-q4_K_M', label: 'Qwen 3.6 27B Q4_K_M', nativeOllama: true },
        { id: 'qwen3.6:27b-mxfp8', label: 'Qwen 3.6 27B MXFP8', nativeOllama: true },
        { id: 'qwen3.6:27b-nvfp4', label: 'Qwen 3.6 27B NVFP4', nativeOllama: true },
        {
            id: RUNPOD_HUIHUI_QWEN35_ABLITERATED_MODEL,
            label: 'Huihui Qwen 3.5 27B Abliterated',
            nativeOllama: true
        },
        { id: 'custom', label: 'Custom Ollama model' }
    ];

    var getRunPodGpuPreset = function (presetId) {
        return RUNPOD_GPU_PRESETS.filter(function (preset) {
            return preset.id === presetId;
        })[0] || RUNPOD_GPU_PRESETS[0];
    };

    var getDefaultRunPodSettings = function () {
        return {
            modelPreset: RUNPOD_DEFAULT_MODEL,
            modelId: RUNPOD_DEFAULT_MODEL,
            gpuPreset: 'blackwell-server',
            customGpuTypeIds: '',
            podName: 'pftdocs-qwen36-ollama-blackwell-fast',
            imageName: RUNPOD_OLLAMA_IMAGE,
            cloudType: 'SECURE',
            gpuCount: 1,
            volumeGb: 300,
            containerDiskGb: 80,
            contextLength: 32768,
            minVcpuPerGpu: 8,
            minRamPerGpu: 48,
            interruptible: false
        };
    };

    var toPositiveInteger = function (value, fallback, min, max) {
        var parsed = Number.parseInt(String(value), 10);
        if (!Number.isInteger(parsed)) { return fallback; }
        parsed = Math.max(min, parsed);
        if (Number.isInteger(max)) { parsed = Math.min(max, parsed); }
        return parsed;
    };

    var isLegacySglangModel = function (value) {
        return /^Qwen\//u.test(String(value || ''));
    };

    var isLegacySglangImage = function (value) {
        return /sglang|lmsysorg/u.test(String(value || ''));
    };

    var isRunPodNativeOllamaModel = function (value) {
        var modelId = String(value || '').trim();
        if (!modelId || isLegacySglangModel(modelId)) { return false; }
        var preset = RUNPOD_MODEL_PRESETS.filter(function (entry) {
            return entry.id === modelId;
        })[0];
        if (preset) { return preset.nativeOllama === true; }
        return /:/u.test(modelId);
    };

    var getRunPodModelAliases = function (value) {
        var modelId = String(value || '').trim();
        var aliases = {};
        var lastSlash = modelId.lastIndexOf('/');
        var lastColon = modelId.lastIndexOf(':');
        var hasExplicitTag = lastColon > lastSlash;
        if (!modelId) { return []; }
        aliases[modelId] = true;
        if (!hasExplicitTag) {
            aliases[modelId + ':latest'] = true;
        } else if (modelId.endsWith(':latest')) {
            aliases[modelId.slice(0, -':latest'.length)] = true;
        }
        return Object.keys(aliases);
    };

    var isRunPodModelAvailable = function (modelId, modelIds) {
        var aliasMap = {};
        getRunPodModelAliases(modelId).forEach(function (alias) {
            aliasMap[alias] = true;
        });
        return (Array.isArray(modelIds) ? modelIds : []).some(function (availableId) {
            return aliasMap[String(availableId || '').trim()] === true;
        });
    };

    var normalizeRunPodSettings = function (value) {
        var defaults = getDefaultRunPodSettings();
        var settings = Object.assign({}, defaults, value || {});
        var preset = RUNPOD_MODEL_PRESETS.some(function (entry) {
            return entry.id === settings.modelPreset;
        }) ? settings.modelPreset : settings.modelId;
        if (isLegacySglangModel(settings.modelPreset) ||
                isLegacySglangModel(settings.modelId) ||
                settings.modelId === RUNPOD_SGLANG_DEFAULT_MODEL) {
            settings.modelPreset = defaults.modelPreset;
            preset = defaults.modelId;
        }
        if (!settings.modelId || settings.modelPreset !== 'custom') {
            settings.modelId = preset && preset !== 'custom' ? preset : defaults.modelId;
        }
        if (!RUNPOD_GPU_PRESETS.some(function (entry) { return entry.id === settings.gpuPreset; }) &&
                !/^gpu:/u.test(String(settings.gpuPreset || ''))) {
            settings.gpuPreset = defaults.gpuPreset;
        }
        settings.podName = /sglang/u.test(String(settings.podName || '')) ?
            defaults.podName : String(settings.podName || defaults.podName).slice(0, 80);
        settings.imageName = isLegacySglangImage(settings.imageName) ?
            defaults.imageName : String(settings.imageName || defaults.imageName).slice(0, 180);
        settings.cloudType = settings.cloudType === 'COMMUNITY' ? 'COMMUNITY' : 'SECURE';
        settings.gpuCount = toPositiveInteger(settings.gpuCount, defaults.gpuCount, 1, 8);
        settings.volumeGb = toPositiveInteger(settings.volumeGb, defaults.volumeGb, 20, 2000);
        settings.containerDiskGb = toPositiveInteger(
            settings.containerDiskGb,
            defaults.containerDiskGb,
            50,
            1000
        );
        settings.contextLength = toPositiveInteger(
            settings.contextLength,
            defaults.contextLength,
            4096,
            262144
        );
        settings.minVcpuPerGpu = toPositiveInteger(
            settings.minVcpuPerGpu,
            defaults.minVcpuPerGpu,
            1,
            64
        );
        settings.minRamPerGpu = toPositiveInteger(
            settings.minRamPerGpu,
            defaults.minRamPerGpu,
            8,
            512
        );
        settings.interruptible = !!settings.interruptible;
        return settings;
    };

    var getSelectedGpuTypeIds = function (settings, availableGpuTypes) {
        var normalized = normalizeRunPodSettings(settings);
        var preset = getRunPodGpuPreset(normalized.gpuPreset);
        var ids = normalized.gpuPreset === 'custom' ?
            String(normalized.customGpuTypeIds || '').split(/[\n,]+/u).map(function (id) {
                return id.trim();
            }).filter(Boolean) :
            (/^gpu:/u.test(String(normalized.gpuPreset || '')) ?
                [String(normalized.gpuPreset).slice(4)] : preset.gpuTypeIds.slice());
        var supported = {};
        availableGpuTypes = Array.isArray(availableGpuTypes) ? availableGpuTypes : [];
        if (availableGpuTypes.length && normalized.gpuPreset !== 'custom') {
            availableGpuTypes.forEach(function (id) { supported[id] = true; });
            ids = ids.filter(function (id) { return supported[id]; });
        }
        if (!ids.length) {
            throw new Error('Select at least one supported RunPod GPU type.');
        }
        return ids;
    };

    var buildOllamaLaunchCommand = function () {
        return [
            'set -eu',
            'export OLLAMA_HOST=0.0.0.0:8000',
            'export OLLAMA_MODELS=/workspace/ollama-models',
            'export OLLAMA_FLASH_ATTENTION=1',
            'export OLLAMA_KEEP_ALIVE=-1',
            'export OLLAMA_NUM_PARALLEL=1',
            'mkdir -p /workspace/ollama-models',
            'ollama serve &',
            'OLLAMA_PID=$!',
            'sleep 3',
            'OLLAMA_HOST=127.0.0.1:8000 ollama pull ${PFT_MODEL_ID:-' +
                RUNPOD_OLLAMA_DEFAULT_MODEL + '}',
            'wait "$OLLAMA_PID"'
        ].join('\n');
    };

    var buildPodPayload = function (settings, gpuTypeIds) {
        var normalized = normalizeRunPodSettings(settings);
        var env = {
            PFT_MODEL_ID: normalized.modelId || RUNPOD_DEFAULT_MODEL,
            OLLAMA_HOST: '0.0.0.0:8000',
            OLLAMA_MODELS: '/workspace/ollama-models',
            OLLAMA_FLASH_ATTENTION: '1',
            OLLAMA_KEEP_ALIVE: '-1',
            OLLAMA_NUM_PARALLEL: '1',
            OLLAMA_CONTEXT_LENGTH: String(normalized.contextLength)
        };
        if (!Array.isArray(gpuTypeIds) || !gpuTypeIds.length) {
            throw new Error('Select at least one supported RunPod GPU type.');
        }
        return {
            name: normalized.podName || 'pftdocs-qwen36-ollama-blackwell-fast',
            cloudType: normalized.cloudType,
            computeType: 'GPU',
            gpuTypeIds: gpuTypeIds,
            gpuTypePriority: 'custom',
            gpuCount: normalized.gpuCount,
            allowedCudaVersions: ['13.0'],
            imageName: normalized.imageName || RUNPOD_OLLAMA_IMAGE,
            dockerEntrypoint: ['/bin/sh', '-lc'],
            dockerStartCmd: [buildOllamaLaunchCommand()],
            env: env,
            ports: ['8000/http', '22/tcp'],
            globalNetworking: true,
            supportPublicIp: true,
            containerDiskInGb: normalized.containerDiskGb,
            volumeInGb: normalized.volumeGb,
            volumeMountPath: '/workspace',
            minVCPUPerGPU: normalized.minVcpuPerGpu,
            minRAMPerGPU: normalized.minRamPerGpu,
            interruptible: normalized.interruptible,
            locked: false
        };
    };

    return {
        RUNPOD_DEFAULT_MODEL: RUNPOD_DEFAULT_MODEL,
        RUNPOD_GPU_PRESETS: RUNPOD_GPU_PRESETS,
        RUNPOD_HUIHUI_QWEN35_ABLITERATED_MODEL: RUNPOD_HUIHUI_QWEN35_ABLITERATED_MODEL,
        RUNPOD_MODEL_PRESETS: RUNPOD_MODEL_PRESETS,
        RUNPOD_OLLAMA_DEFAULT_MODEL: RUNPOD_OLLAMA_DEFAULT_MODEL,
        RUNPOD_OLLAMA_IMAGE: RUNPOD_OLLAMA_IMAGE,
        RUNPOD_SGLANG_DEFAULT_MODEL: RUNPOD_SGLANG_DEFAULT_MODEL,
        buildOllamaLaunchCommand: buildOllamaLaunchCommand,
        buildPodPayload: buildPodPayload,
        getDefaultRunPodSettings: getDefaultRunPodSettings,
        getRunPodGpuPreset: getRunPodGpuPreset,
        getRunPodModelAliases: getRunPodModelAliases,
        getSelectedGpuTypeIds: getSelectedGpuTypeIds,
        isLegacySglangImage: isLegacySglangImage,
        isLegacySglangModel: isLegacySglangModel,
        isRunPodModelAvailable: isRunPodModelAvailable,
        isRunPodNativeOllamaModel: isRunPodNativeOllamaModel,
        normalizeRunPodSettings: normalizeRunPodSettings,
        toPositiveInteger: toPositiveInteger
    };
});
