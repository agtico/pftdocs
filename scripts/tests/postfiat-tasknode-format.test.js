// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadTaskNodeFormat = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/tasknode-format.js'),
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

const loadFixture = () => JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'scripts/tests/fixtures/postfiat/tasknode-history-sample.json'),
    'utf8'
));

test('Task Node formatter extracts reward-first task groups', () => {
    const format = loadTaskNodeFormat();
    const fixture = loadFixture();
    const group = fixture.tasks[0];
    const block = format.buildTaskGroupChatBlock(group);

    assert.match(block, /Patch Task Node motivation quality/u);
    assert.match(block, /Implemented a prompt-level motivation quality pass/u);
    assert.match(block, /Reward: 5,357 PFT/u);
    assert.match(block, /Reward notes: Accepted/u);
});

test('Task Node formatter identifies useful timeline groups', () => {
    const format = loadTaskNodeFormat();
    const fixture = loadFixture();

    assert.equal(format.groupIsTimelineUseful(fixture.tasks[0]), true);
    assert.equal(format.groupIsTimelineUseful({ taskId: 'empty', events: [] }), false);
});

test('Task Node formatter keeps middle previews bounded', () => {
    const format = loadTaskNodeFormat();
    const text = 'a'.repeat(100) + '\n' + 'b'.repeat(100) + '\n' + 'c'.repeat(100);
    const preview = format.middlePreview(text, 40, 40);

    assert.match(preview, /\[\.{3} .+ characters hidden \.{3}\]/u);
    assert.ok(preview.length < text.length);
});
