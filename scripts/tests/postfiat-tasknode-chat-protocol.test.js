const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const protocol = require('../../www/common/tasknode-chat-protocol.js');

test('explicit assistant mentions use protocol boundaries across paraphrases', () => {
    for (const text of ['@ODV review this', 'Could you look at this @odv?', 'Next step\n@ODV: thoughts']) {
        assert.equal(protocol.mention(text).persona, 'odv');
    }
    for (const text of ['@coach help me plan', 'What changed? @COACH', 'Question\t@coach, explain']) {
        assert.equal(protocol.mention(text).persona, 'coach');
    }
    for (const text of ['hello', 'a@coach.example', '@coaching advice', '@odv_team']) assert.equal(protocol.mention(text), undefined);
    assert.equal(protocol.mention('@coach ask @ODV too').persona, 'coach');
});

test('prompt documents address only the announced prompt assistant', () => {
    const announced = { odv: { enabled: false }, agents: [{ persona: 'prompt', mention: '@prompt', label: 'Prompt Assistant' }] };
    const promptAgents = protocol.agents(announced, true);
    assert.deepEqual(promptAgents, [{ persona: 'prompt', mention: '@prompt', label: 'Prompt Assistant' }]);
    for (const text of ['@prompt what does this do?', 'Is step 2 ambiguous, @PROMPT?', 'Rewrite it\n@prompt: shorter']) {
        assert.deepEqual(protocol.mention(text, promptAgents), { persona: 'prompt', mention: '@prompt', label: 'Prompt Assistant' });
    }
    for (const text of ['@ODV review', '@coach help', 'the prompt is long', 'a@prompt.example', '@prompts', '@prompt_x']) {
        assert.equal(protocol.mention(text, promptAgents), undefined);
    }
    // Other assistants cannot be smuggled into a prompt document, and nothing
    // is addressable until Task Node announces the prompt assistant.
    assert.deepEqual(protocol.agents({ odv: { enabled: true }, agents: [{ persona: 'odv' }, { persona: 'coach' }] }, true), []);
    assert.equal(protocol.mention('@prompt hello', protocol.agents({ agents: [] }, true)), undefined);
    assert.deepEqual(protocol.agents({ agents: [{ persona: 'odv' }, { persona: 'prompt' }, { persona: 'prompt' }] }, true).map(a => a.persona), ['prompt']);
});

test('ordinary documents never address the prompt assistant', () => {
    const agents = protocol.agents({ odv: { enabled: true }, agents: [{ persona: 'odv' }, { persona: 'coach' }, { persona: 'prompt' }, { persona: 'unknown' }, null] }, false);
    assert.deepEqual(agents.map(a => a.persona), ['odv', 'coach']);
    assert.deepEqual(agents[0], { persona: 'odv', mention: '@ODV', label: 'ODV' });
    assert.equal(protocol.mention('@prompt review this', agents), undefined);
    assert.equal(protocol.mention('@prompt then @coach', agents).persona, 'coach');
    assert.equal(protocol.mention('@prompt review this'), undefined);
    assert.equal(protocol.mention('@coach', protocol.agents({ agents: [{ persona: 'odv' }] }, false)), undefined);
    // Legacy contexts that only enable ODV still address ODV.
    assert.deepEqual(protocol.agents({ odv: { enabled: true } }, false).map(a => a.persona), ['odv']);
    assert.deepEqual(protocol.agents({ odv: { enabled: false } }, false), []);
    assert.deepEqual(protocol.agents(undefined, false), []);
});

test('persona lookup drives response labels', () => {
    assert.deepEqual(protocol.persona('PROMPT'), { persona: 'prompt', mention: '@prompt', label: 'Prompt Assistant' });
    assert.deepEqual(protocol.persona('coach'), { persona: 'coach', mention: '@coach', label: 'Trading Coach' });
    assert.equal(protocol.persona('other'), undefined);
    assert.deepEqual(protocol.assistantMessage('**@prompt · Prompt Assistant**\n\nLine 3 is ambiguous.'), { body: 'Line 3 is ambiguous.', persona: 'prompt', label: 'Prompt Assistant' });
});

test('assistant envelopes preserve body text and supported historical labels', () => {
    assert.deepEqual(protocol.assistantMessage('**@coach · Trading Coach**\n\nA response.'), { body: 'A response.', persona: 'coach', label: 'Trading Coach' });
    assert.equal(protocol.assistantMessage('**@ODV · GLM 5.2 via Ambient**\nLegacy.').body, 'Legacy.');
    assert.equal(protocol.assistantMessage('**@ODV · ODV · GLM 5.2 via Ambient**\nLegacy.').persona, 'odv');
    assert.equal(protocol.assistantMessage('**@coach · someone else** content'), undefined);
    assert.equal(protocol.assistantMessage('ordinary **bold** text'), undefined);
});

test('rich text extracts visible content without attributes or metadata', () => {
    assert.equal(protocol.documentText(['BODY', { secret: 'excluded' }, [['P', {}, ['One ', ['STRONG', {}, ['two']]]], ['P', {}, ['Three']]]]), 'One two\nThree');
    assert.ok(protocol.documentText(['BODY', {}, ['x'.repeat(90000)]]).length <= 80000);
    assert.equal(protocol.documentText({ title: 'metadata' }), '');
});

test('spreadsheet chat snapshots preserve row numbers, zeroes, and bounded context', () => {
    const sheet = { GetName: () => 'Budget', GetRange: (range) => { assert.equal(range, 'A1:AN200'); return { GetValue: () => [['Category', 'Amount'], ['', ''], ['Rent', 0], ['Reviewed', false]] }; } };
    const result = JSON.parse(protocol.spreadsheetText({ GetSheets: () => [sheet] }));
    assert.deepEqual(result.sheets[0].rows.map(r => r.row), [1, 3, 4]);
    assert.equal(result.sheets[0].rows[1].cells[1], 0);
    assert.equal(result.sheets[0].rows[2].cells[1], false);
    const huge = { GetName: () => 'Large', GetRange: () => ({ GetValue: () => Array.from({ length: 200 }, () => Array(40).fill('x'.repeat(2000))) }) };
    const bounded = protocol.spreadsheetText({ GetSheets: () => Array(10).fill(huge) });
    assert.ok(bounded.length <= 80000);
    assert.equal(JSON.parse(bounded).truncated, true);
    assert.equal(JSON.parse(bounded).sheets.length, 8);
});

test('chat protocol does not depend on regex', () => {
    const source = fs.readFileSync(require.resolve('../../www/common/tasknode-chat-protocol.js'), 'utf8');
    const espree = require('espree');
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        assert.ok(!node.regex, 'Regex literals are forbidden on the chat protocol path');
        if (node.type === 'Identifier') assert.notEqual(node.name, 'RegExp');
        if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
            assert.ok(!['match', 'matchAll', 'replace', 'replaceAll', 'search', 'test', 'exec'].includes(node.property.name));
        }
        Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : visit(value));
    };
    visit(espree.parse(source, { ecmaVersion: 'latest' }));
});

test('large assistant answers retain their tail for both personas and have time to finish', () => {
    const answer = 'Detailed analysis and next steps. '.repeat(5000) + 'COMPLETE_RESPONSE_TAIL';
    for (const header of ['@coach · Trading Coach', '@ODV · ODV']) {
        assert.equal(protocol.assistantMessage('**' + header + '**\n\n' + answer).body, answer);
    }
    assert.ok(protocol.assistantTimeoutMs > 540000);
    assert.ok(protocol.assistantQueryTimeoutMs > protocol.assistantTimeoutMs);
});
