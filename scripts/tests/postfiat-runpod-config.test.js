// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadRunPodConfig = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/runpod-config.js'),
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

test('RunPod defaults target the fast Ollama Blackwell path', () => {
    const config = loadRunPodConfig();
    const settings = config.getDefaultRunPodSettings();

    assert.equal(settings.modelId, 'qwen3.6:27b');
    assert.equal(settings.gpuPreset, 'blackwell-server');
    assert.equal(settings.imageName, 'ollama/ollama:latest');
    assert.equal(settings.volumeGb, 300);
    assert.equal(settings.containerDiskGb, 80);
    assert.equal(settings.contextLength, 32768);
});

test('RunPod settings migrate legacy SGLang values and clamp numeric fields', () => {
    const config = loadRunPodConfig();
    const settings = config.normalizeRunPodSettings({
        modelPreset: 'Qwen/Qwen3.6-27B-FP8',
        modelId: 'Qwen/Qwen3.6-27B-FP8',
        imageName: 'lmsysorg/sglang:latest',
        podName: 'old-sglang-pod',
        gpuCount: 99,
        volumeGb: 3,
        containerDiskGb: 3,
        contextLength: 128,
        minVcpuPerGpu: 0,
        minRamPerGpu: 1,
        cloudType: 'COMMUNITY',
        interruptible: 'yes',
    });

    assert.equal(settings.modelId, 'qwen3.6:27b');
    assert.equal(settings.modelPreset, 'qwen3.6:27b');
    assert.equal(settings.imageName, 'ollama/ollama:latest');
    assert.equal(settings.podName, 'pftdocs-qwen36-ollama-blackwell-fast');
    assert.equal(settings.gpuCount, 8);
    assert.equal(settings.volumeGb, 20);
    assert.equal(settings.containerDiskGb, 50);
    assert.equal(settings.contextLength, 4096);
    assert.equal(settings.minVcpuPerGpu, 1);
    assert.equal(settings.minRamPerGpu, 8);
    assert.equal(settings.cloudType, 'COMMUNITY');
    assert.equal(settings.interruptible, true);
});

test('RunPod GPU selection filters presets against available GPU types', () => {
    const config = loadRunPodConfig();
    const ids = config.getSelectedGpuTypeIds({
        gpuPreset: '6090',
    }, [
        'NVIDIA RTX PRO 6000 Blackwell Workstation Edition',
    ]);

    assert.deepEqual(Array.from(ids), ['NVIDIA RTX PRO 6000 Blackwell Workstation Edition']);
});

test('RunPod custom GPU selection parses comma and newline lists', () => {
    const config = loadRunPodConfig();
    const ids = config.getSelectedGpuTypeIds({
        gpuPreset: 'custom',
        customGpuTypeIds: 'GPU A,\nGPU B',
    }, []);

    assert.deepEqual(Array.from(ids), ['GPU A', 'GPU B']);
});

test('RunPod model presets include Huihui Qwen 3.5 abliterated as Ollama-native', () => {
    const config = loadRunPodConfig();
    const modelId = 'huihui_ai/qwen3.5-abliterated';
    const preset = config.RUNPOD_MODEL_PRESETS.find((entry) => entry.id === modelId);
    const settings = config.normalizeRunPodSettings({
        modelPreset: modelId,
        modelId,
    });
    const payload = config.buildPodPayload(settings, ['NVIDIA H200']);

    assert.equal(config.RUNPOD_HUIHUI_QWEN35_ABLITERATED_MODEL, modelId);
    assert.equal(preset.label, 'Huihui Qwen 3.5 27B Abliterated');
    assert.equal(config.isRunPodNativeOllamaModel(modelId), true);
    assert.deepEqual(Array.from(config.getRunPodModelAliases(modelId)), [
        modelId,
        `${modelId}:latest`,
    ]);
    assert.equal(config.isRunPodModelAvailable(modelId, [`${modelId}:latest`]), true);
    assert.equal(config.isRunPodModelAvailable('qwen3.6:27b', ['qwen3.6:latest']), false);
    assert.equal(settings.modelPreset, modelId);
    assert.equal(settings.modelId, modelId);
    assert.equal(payload.env.PFT_MODEL_ID, modelId);
});

test('RunPod pod payload boots Ollama with fast Qwen settings', () => {
    const config = loadRunPodConfig();
    const payload = config.buildPodPayload({
        modelPreset: 'custom',
        modelId: 'qwen3.6:27b-mxfp8',
        podName: 'pftdocs-test',
        contextLength: 65536,
    }, ['NVIDIA RTX PRO 6000 Blackwell Server Edition']);

    assert.equal(payload.name, 'pftdocs-test');
    assert.deepEqual(Array.from(payload.gpuTypeIds), ['NVIDIA RTX PRO 6000 Blackwell Server Edition']);
    assert.deepEqual(Array.from(payload.allowedCudaVersions), ['13.0']);
    assert.deepEqual(Array.from(payload.ports), ['8000/http', '22/tcp']);
    assert.equal(payload.env.PFT_MODEL_ID, 'qwen3.6:27b-mxfp8');
    assert.equal(payload.env.OLLAMA_FLASH_ATTENTION, '1');
    assert.equal(payload.env.OLLAMA_NUM_PARALLEL, '1');
    assert.equal(payload.env.OLLAMA_CONTEXT_LENGTH, '65536');
    assert.match(payload.dockerStartCmd[0], /ollama serve/u);
    assert.match(payload.dockerStartCmd[0], /ollama pull/u);
});
