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
