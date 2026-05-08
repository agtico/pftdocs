// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

const loadSuperthinkEngine = () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'www/app/postfiat/superthink-engine.js'),
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

const trunc = (value, limit) => String(value || '').slice(0, limit);

test('Superthink parses persona JSON with rhetorical voice fields', () => {
    const engine = loadSuperthinkEngine();
    const personas = engine.parsePersonas(JSON.stringify({
        personas: [{
            name: 'Claude Shannon',
            era: '20th century',
            relevance: 'Signal extraction',
            angle: 'compression',
            voice_style: 'Signal and entropy',
            rhetorical_patterns: ['compresses ambiguity', 'names channel noise'],
            signature_moves: ['asks what bit matters'],
            anti_style: 'no generic coach tone',
        }],
    }));

    assert.equal(personas.length, 1);
    assert.equal(personas[0].name, 'Claude Shannon');
    assert.equal(personas[0].voiceStyle, 'Signal and entropy');
    assert.deepEqual(Array.from(personas[0].rhetoricalPatterns), [
        'compresses ambiguity',
        'names channel noise',
    ]);
});

test('Superthink fills missing personas without repeating used names', () => {
    const engine = loadSuperthinkEngine();
    const output = engine.fillPersonas([
        engine.normalizePersona({ name: 'John Boyd' }, 0),
    ], ['Niccolo Machiavelli'], { personasPerRound: 5 });

    assert.equal(output.length, 5);
    assert.equal(output[0].name, 'John Boyd');
    assert.equal(output.some((persona) => persona.name === 'Niccolo Machiavelli'), false);
});

test('Superthink consult prompt forces persona-specific rhetoric', () => {
    const engine = loadSuperthinkEngine();
    const persona = engine.normalizePersona({ name: 'John Boyd' }, 0);
    const messages = engine.buildPersonaConsultMessages(
        persona,
        'User context about slow decision loops.',
        '',
        { truncateText: trunc }
    );

    assert.match(messages[0].content, /not a neutral adviser/u);
    assert.match(messages[1].content, /OODA loops/u);
    assert.match(messages[1].content, /Rhetorical patterns/u);
});

test('Superthink final prompt demands pull-quotes and transcript grounding', () => {
    const engine = loadSuperthinkEngine();
    const state = {
        contextText: 'User context: "Task Node is semi usable."',
        rounds: [{
            number: 1,
            selectorText: '',
            personas: [{
                name: 'Claude Shannon',
                feedback: 'The channel is noisy because the interface distorts the signal before the decision bit arrives.',
            }],
            managerSummary: 'The decision artifact must preserve signal and remove repeated generic advice.',
        }],
    };
    const messages = engine.buildFinalMessages(state, { truncateText: trunc });

    assert.match(messages[1].content, /Evidence Pull-Quotes/u);
    assert.match(messages[1].content, /Quote exact language/u);
    assert.match(messages[1].content, /The channel is noisy/u);
});

test('Superthink persona packet parser accepts labeled plain text', () => {
    const engine = loadSuperthinkEngine();
    const packet = engine.parsePersonaPacket(
        'DESCRIPTION: A terse operational lens.\n\nFEEDBACK: Collapse the loop.'
    );

    assert.match(packet.description, /terse operational/u);
    assert.equal(packet.feedback, 'Collapse the loop.');
});
