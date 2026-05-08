// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadAmd = (relativePath, deps = {}) => {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const context = {
        moduleValue: null,
        define: (depNames, factory) => {
            assert.equal(Array.isArray(depNames), true);
            context.moduleValue = factory(...depNames.map((name) => {
                assert.ok(deps[name], `missing AMD dep ${name}`);
                return deps[name];
            }));
        },
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.moduleValue;
};

const loadChatContext = () => {
    const taskNodeFormat = loadAmd('www/app/postfiat/tasknode-format.js');
    return loadAmd('www/app/postfiat/chat-context.js', {
        '/app/postfiat/tasknode-format.js': taskNodeFormat,
    });
};

const loadFixture = () => JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'scripts/tests/fixtures/postfiat/tasknode-history-sample.json'),
    'utf8'
));

const clone = (value) => JSON.parse(JSON.stringify(value));

const makeGroup = (baseGroup, index, title, description) => {
    const group = clone(baseGroup);
    const createdAt = `2026-05-0${index + 1}T11:00:00.000Z`;
    group.taskId = `task-${index}`;
    group.events.forEach((event) => {
        event.taskId = group.taskId;
        event.createdAt = createdAt;
        if (event.payload && event.payload.task_history && event.payload.task_history.task) {
            event.payload.task_history.task.id = group.taskId;
            event.payload.task_history.task.title = title;
            event.payload.task_history.task.description = description;
            event.payload.task_history.task.alignment = title;
        }
    });
    return group;
};

test('chat context builds context doc and task group blocks', () => {
    const context = loadChatContext();
    const fixture = loadFixture();

    assert.match(
        context.buildContextDocChatSection(fixture),
        /finish Task Node usability/u
    );
    assert.match(
        context.buildTaskGroupChatBlock(fixture.tasks[0]),
        /Reward: 5,357 PFT/u
    );
});

test('chat context pack keeps recent detail and summarizes older history', () => {
    const context = loadChatContext();
    const fixture = loadFixture();
    fixture.tasks = [
        makeGroup(fixture.tasks[0], 3, 'Fix PFT Docs RunPod chat', 'Improve qwen chat latency.'),
        makeGroup(fixture.tasks[0], 2, 'Validate trading autocorrelation', 'Run net-of-cost IBKR sweep.'),
        makeGroup(fixture.tasks[0], 1, 'Patch Task Node verification', 'Reduce verification friction.'),
    ];

    const pack = context.buildChatTaskContextPack(fixture, {
        walletAddress: fixture.walletAddress,
        now: Date.parse('2026-05-08T00:00:00.000Z'),
        recentLimit: 1,
    });

    assert.equal(pack.version, 1);
    assert.equal(pack.walletAddress, fixture.walletAddress);
    assert.equal(pack.recentCount, 1);
    assert.equal(pack.historicalCount, 2);
    assert.match(pack.recentText, /Fix PFT Docs RunPod chat/u);
    assert.match(pack.historicalText, /Trading validation/u);
    assert.match(pack.historicalText, /Task Node \/ verification/u);
});

test('chat context retrieves relevant older task details from query terms', () => {
    const context = loadChatContext();
    const fixture = loadFixture();
    fixture.tasks = [
        makeGroup(fixture.tasks[0], 3, 'Fix PFT Docs RunPod chat', 'Improve qwen chat latency.'),
        makeGroup(fixture.tasks[0], 2, 'Validate trading autocorrelation', 'Run net-of-cost IBKR sweep.'),
        makeGroup(fixture.tasks[0], 1, 'Patch Task Node verification', 'Reduce verification friction.'),
    ];

    const relevant = context.buildRelevantHistoricalTaskDetails(
        fixture,
        'what about trading autocorrelation',
        {
            now: Date.parse('2026-05-08T00:00:00.000Z'),
            recentLimit: 1,
        }
    );

    assert.match(relevant, /Relevant Older Task Detail/u);
    assert.match(relevant, /Validate trading autocorrelation/u);
});

test('chat context section falls back to raw task rows when no pack exists', () => {
    const context = loadChatContext();
    const fixture = loadFixture();
    const section = context.buildTasksChatSection(fixture, 'motivation', null);

    assert.match(section, /Task Node Tasks/u);
    assert.match(section, /Patch Task Node motivation quality/u);
});
