const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('www/tasknode/main.js','utf8');
function bridge({type = 'prompt', origin = 'http://localhost:3195', action = 'create', hash = ''} = {}) {
    let target; let stored; let error;
    const window = {location:{search:`?action=${action}&documentType=${type}&requestId=11111111-1111-4111-8111-111111111111&returnOrigin=${encodeURIComponent(origin)}`,hash,replace:value => {target = value;}},parent:{}};
    vm.runInNewContext(source,{window,URL,URLSearchParams,sessionStorage:{setItem:(_key,value) => {stored = JSON.parse(value);}},document:{getElementById:() => ({set textContent(value) {error = value;}})},define:(_deps,factory) => factory({postFiat:{taskNodeOrigins:['http://localhost:3195']}})});
    return {target,stored,error};
}
test('prompt creation and reopen use code with prompt isolation preserved',() => {
    const create = bridge(); assert.match(create.target,/^\/code\/\?tasknodeBootstrap=/); assert.equal(create.stored.prompt,true); assert.equal(create.stored.documentType,'code');
    const open = bridge({action:'open',hash:'#/2/code/edit/abcdefghijklmnopqrstuvwx/'}); assert.match(open.target,/^\/code\/\?tasknodeSession=/); assert.equal(open.stored.prompt,true);
    assert.equal(bridge({origin:'http://untrusted.invalid'}).target,undefined);
    assert.equal(bridge({action:'open',hash:'#/2/pad/edit/abcdefghijklmnopqrstuvwx/'}).target,undefined);
});
test('ordinary pad and sheet routing remains unchanged',() => {
    for (const type of ['pad','sheet']) { const result = bridge({type}); assert.ok(result.target.startsWith('/'+type+'/')); assert.equal(result.stored.prompt,false); }
});
test('prompt bridge suppresses assistants and authenticates snapshots and input activity',() => {
    const outer = fs.readFileSync('www/common/sframe-common-outer.js','utf8');
    assert.match(outer,/taskNodeAssistantsEnabled = !taskNodeBridge.prompt && Boolean/);
    assert.match(outer,/event.source !== target \|\| event.origin !== taskNodeBridge.returnOrigin/);
    assert.match(outer,/data.requestId !== taskNodeBridge.requestId \|\| data.channelHash !== secret.channel/);
    assert.match(outer,/!target \|\| !taskNodeBridge.prompt \|\| !taskNodeContextAccepted/);
    const inner = fs.readFileSync('www/code/inner.js','utf8');
    assert.match(inner,/change.origin !== 'setValue'/);
    assert.match(inner,/EV_TASKNODE_PROMPT_ACTIVITY/);
    assert.match(fs.readFileSync('www/common/application_config_internal.js','utf8'),/availablePadTypes = \['drive', 'pad', 'sheet', 'code'\]/);
});
