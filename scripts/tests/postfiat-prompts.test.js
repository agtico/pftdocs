const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('www/tasknode/main.js', 'utf8');
function bridge({ type = 'prompt', origin = 'http://localhost:3195', action = 'create', hash = '' } = {}) {
    let target;
    let stored;
    let error;
    const window = {
        location: {
            search: `?action=${action}&documentType=${type}&requestId=11111111-1111-4111-8111-111111111111&returnOrigin=${encodeURIComponent(origin)}`,
            hash,
            replace: (value) => {
                target = value;
            },
        },
        parent: {},
    };
    vm.runInNewContext(source, {
        window,
        URL,
        URLSearchParams,
        sessionStorage: {
            setItem: (_key, value) => {
                stored = JSON.parse(value);
            },
        },
        document: {
            getElementById: () => ({
                set textContent(value) {
                    error = value;
                },
            }),
        },
        define: (_deps, factory) => factory({ postFiat: { taskNodeOrigins: ['http://localhost:3195'] } }),
    });
    return { target, stored, error };
}
test('prompt creation and reopen use code with prompt isolation preserved', () => {
    const create = bridge();
    assert.match(create.target, /^\/code\/\?tasknodeBootstrap=/);
    assert.equal(create.stored.prompt, true);
    assert.equal(create.stored.documentType, 'code');
    const open = bridge({ action: 'open', hash: '#/2/code/edit/abcdefghijklmnopqrstuvwx/' });
    assert.match(open.target, /^\/code\/\?tasknodeSession=/);
    assert.equal(open.stored.prompt, true);
    assert.equal(bridge({ origin: 'http://untrusted.invalid' }).target, undefined);
    assert.equal(bridge({ action: 'open', hash: '#/2/pad/edit/abcdefghijklmnopqrstuvwx/' }).target, undefined);
});
test('ordinary pad and sheet routing remains unchanged', () => {
    for (const type of ['pad', 'sheet']) {
        const result = bridge({ type });
        assert.ok(result.target.startsWith('/' + type + '/'));
        assert.equal(result.stored.prompt, false);
    }
});
test('prompt bridge offers only the announced prompt assistant and authenticates snapshots and input activity', () => {
    const outer = fs.readFileSync('www/common/sframe-common-outer.js', 'utf8');
    assert.ok(outer.includes('taskNodeAgents = TaskNodeChat.agents(data, taskNodeBridge.prompt === true)'));
    assert.ok(outer.includes('taskNodeAssistantsEnabled = taskNodeAgents.length > 0'));
    assert.ok(outer.includes('agents: taskNodeAgents'));
    assert.ok(outer.includes("odv: taskNodeBridge.prompt ? { enabled: false } : data.odv || {}"));
    assert.ok(outer.includes('TaskNodeChat.mention(prompt, taskNodeAgents)'));
    assert.match(outer, /event.source !== target \|\| event.origin !== taskNodeBridge.returnOrigin/);
    assert.match(outer, /data.requestId !== taskNodeBridge.requestId \|\| data.channelHash !== secret.channel/);
    assert.match(outer, /!target \|\| !taskNodeBridge.prompt \|\| !taskNodeContextAccepted/);
    const inner = fs.readFileSync('www/code/inner.js', 'utf8');
    assert.match(inner, /change.origin !== 'setValue'/);
    assert.match(inner, /EV_TASKNODE_PROMPT_ACTIVITY/);
    // The assistant receives the editor's markdown source, and the chat rail
    // uses the shared Task Node document styling in prompt mode.
    // The assistant gets numbered lines that match the gutter the user sees.
    assert.ok(inner.includes("common.setTaskNodeDocumentTextProvider(function () {"));
    assert.ok(inner.includes("return (index + 1) + '| ' + line;"));
    assert.ok(inner.includes("editor.setOption('lineNumbers', true);"));
    assert.ok(inner.includes("editor.setOption('gutters', ['CodeMirror-linenumbers']);"));
    const style = fs.readFileSync('www/code/app-code.less', 'utf8');
    const promptStyle = style.slice(style.indexOf('&.cp-tasknode-prompt {'));
    assert.ok(promptStyle.includes('.tasknode-chat_main();'));
    assert.ok(!promptStyle.includes('.cp-toolbar-chat-drawer { display: none'));
    assert.match(
        fs.readFileSync('www/common/application_config_internal.js', 'utf8'),
        /availablePadTypes = \['drive', 'pad', 'sheet', 'code'\]/,
    );
});
