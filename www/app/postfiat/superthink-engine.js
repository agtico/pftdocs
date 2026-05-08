// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var DEFAULTS = {
        rounds: 3,
        personasPerRound: 5,
        parallelCalls: 5,
        contextCharLimit: 28000,
        responseContextLimit: 9000,
        taskNodeWaitMs: 30000,
        selectorMaxTokens: 1800,
        descriptionMaxTokens: 850,
        feedbackMaxTokens: 1200,
        managerMaxTokens: 1200,
        finalMaxTokens: 4500
    };

    var FALLBACK_PERSONAS = [
        { name: 'Niccolo Machiavelli', era: 'Renaissance Florence', relevance: 'Power, sequencing, patronage, and institutional realism.', angle: 'Political strategy and ruthless prioritization' },
        { name: 'John Boyd', era: '20th century', relevance: 'Decision loops, tempo, and avoiding paralysis under uncertainty.', angle: 'OODA loops and operational speed' },
        { name: 'Claude Shannon', era: '20th century', relevance: 'Signal, compression, uncertainty, and communication systems.', angle: 'Information discipline' },
        { name: 'Grace Hopper', era: '20th century', relevance: 'Shipping usable computing systems and making abstractions operational.', angle: 'Practical systems execution' },
        { name: 'Alan Turing', era: '20th century', relevance: 'Computation, intelligence, cryptography, and formal problem reduction.', angle: 'Reducing impossible problems to solvable mechanisms' },
        { name: 'Ada Lovelace', era: '19th century', relevance: 'Symbolic computation and seeing machine potential before it is obvious.', angle: 'Imaginative technical architecture' },
        { name: 'Andrew Carnegie', era: 'Gilded Age', relevance: 'Capital formation, scale, delegation, and infrastructure buildout.', angle: 'Industrial compounding' },
        { name: 'J. P. Morgan', era: 'Gilded Age', relevance: 'Financial control, consolidation, and crisis judgment.', angle: 'Capital discipline' },
        { name: 'Deng Xiaoping', era: '20th century', relevance: 'Pragmatic reform, sequencing, and results over ideological purity.', angle: 'Experimental statecraft' },
        { name: 'Satoshi Nakamoto', era: '21st century', relevance: 'Protocol design, anonymity, incentives, and trust-minimized systems.', angle: 'Cryptographic institution design' },
        { name: 'Elinor Ostrom', era: '20th century', relevance: 'Commons governance and durable incentive systems.', angle: 'Decentralized coordination' },
        { name: 'Frederick Winslow Taylor', era: 'Industrial era', relevance: 'Workflow measurement, productivity bottlenecks, and process decomposition.', angle: 'Operational throughput' },
        { name: 'Peter Drucker', era: '20th century', relevance: 'Executive focus, management by objective, and knowledge-worker leverage.', angle: 'Founder management discipline' },
        { name: 'Benjamin Franklin', era: '18th century', relevance: 'Public networks, invention, compounding reputation, and pragmatic self-improvement.', angle: 'Networked practical intelligence' },
        { name: 'Marcus Aurelius', era: 'Roman Empire', relevance: 'Self-command, duty, and clarity under pressure.', angle: 'Emotional governance' },
        { name: 'Miyamoto Musashi', era: 'Edo Japan', relevance: 'Single-combat focus, timing, and forcing decisive engagements.', angle: 'Execution under direct confrontation' },
        { name: 'Joseph Schumpeter', era: '20th century', relevance: 'Creative destruction, entrepreneurs, and capital reallocation.', angle: 'Innovation and market upheaval' },
        { name: 'Hyman Minsky', era: '20th century', relevance: 'Financial instability, leverage cycles, and risk hidden by calm periods.', angle: 'Market fragility' },
        { name: 'Richard Feynman', era: '20th century', relevance: 'First-principles explanation, debugging reality, and anti-bullshit rigor.', angle: 'Technical clarity' },
        { name: 'Mary Parker Follett', era: 'Progressive era', relevance: 'Coordination, conflict integration, and productive authority.', angle: 'Human systems management' }
    ];

    var truncateText = function (value, limit) {
        var text = String(value || '');
        var omitted;
        if (!limit || text.length <= limit) { return text; }
        omitted = text.length - limit;
        return text.slice(0, limit).trim() +
            '\n\n[... ' + omitted.toLocaleString() + ' characters truncated ...]';
    };

    var getTruncator = function (opts) {
        return opts && opts.truncateText || truncateText;
    };

    var stripJsonFences = function (value) {
        return String(value || '').replace(/```(?:json)?/giu, '').replace(/```/gu, '').trim();
    };

    var extractFirstJsonCandidate = function (value) {
        var text = stripJsonFences(value);
        var start = -1;
        var stack = [];
        var inString = false;
        var escaped = false;
        var i;
        var ch;
        var close;
        for (i = 0; i < text.length; i++) {
            ch = text[i];
            if (ch === '{' || ch === '[') {
                start = i;
                break;
            }
        }
        if (start === -1) { return ''; }
        for (i = start; i < text.length; i++) {
            ch = text[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === '{' || ch === '[') {
                stack.push(ch);
                continue;
            }
            if (ch === '}' || ch === ']') {
                close = stack.pop();
                if ((ch === '}' && close !== '{') || (ch === ']' && close !== '[')) {
                    return '';
                }
                if (!stack.length) {
                    return text.slice(start, i + 1);
                }
            }
        }
        return '';
    };

    var normalizeStringList = function (value) {
        if (Array.isArray(value)) {
            return value.map(function (item) {
                return String(item || '').trim();
            }).filter(Boolean);
        }
        return String(value || '').split(/\s*(?:;|\n|\|)\s*/u)
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
    };

    var getPersonaVoiceDefaults = function (name) {
        var key = String(name || '').toLowerCase();
        var map = {
            'niccolo machiavelli': {
                voiceStyle: 'Cold Florentine statecraft: counsel through power, appearances, enemies, fortune, necessity, and the preservation of authority.',
                rhetoricalPatterns: [
                    'Uses maxims and statecraft analogies.',
                    'Frames delay as loss of power.',
                    'Separates virtue from sentiment.'
                ],
                signatureMoves: [
                    'Names the ruler, the rival, the fortress, and the price of hesitation.',
                    'Turns technical ambiguity into a question of authority.'
                ]
            },
            'john boyd': {
                voiceStyle: 'Operational tempo: terse, kinetic, adversarial, built around OODA loops, orientation, and decision speed.',
                rhetoricalPatterns: [
                    'Short pressure sentences.',
                    'Contrasts tempo with paralysis.',
                    'Treats confusion as a maneuver problem.'
                ],
                signatureMoves: [
                    'Asks what shortens the decision loop.',
                    'Identifies friction that lets the environment act first.'
                ]
            },
            'claude shannon': {
                voiceStyle: 'Information-theory precision: signal, noise, entropy, compression, channel capacity, and error correction.',
                rhetoricalPatterns: [
                    'Defines terms like a mathematical communication problem.',
                    'Prefers compression over drama.',
                    'Turns advice into channel design.'
                ],
                signatureMoves: [
                    'Distinguishes signal from noise.',
                    'Asks what bit must be transmitted with minimum distortion.'
                ]
            },
            'grace hopper': {
                voiceStyle: 'Practical computing executor: plainspoken, implementation-focused, intolerant of ceremony that blocks a working system.',
                rhetoricalPatterns: [
                    'Speaks in operational fixes.',
                    'Favors small shippable mechanisms.',
                    'Uses debugging and compiler metaphors.'
                ],
                signatureMoves: [
                    'Converts vague strategy into a runnable procedure.',
                    'Calls out interface debt as a bug.'
                ]
            },
            'alan turing': {
                voiceStyle: 'Formal mechanistic reduction: converts vague problems into tests, machines, states, and decidable procedures.',
                rhetoricalPatterns: [
                    'Defines the problem before advising.',
                    'Avoids emotional flourish.',
                    'Uses tests and state transitions.'
                ],
                signatureMoves: [
                    'Asks what procedure would decide the question.',
                    'Separates the machine from the illusion of the machine.'
                ]
            },
            'ed thorp': {
                voiceStyle: 'Quiet quantitative edge: probability, expected value, bankroll protection, variance, transaction costs, and disciplined testing.',
                rhetoricalPatterns: [
                    'Speaks like a trader-mathematician.',
                    'Treats proof and sizing as separate gates.',
                    'Warns against betting before edge survives costs.'
                ],
                signatureMoves: [
                    'Turns confidence into expected value.',
                    'Frames failed tests as capital protection.'
                ]
            },
            'jim simons': {
                voiceStyle: 'Empirical research director: data over story, teams and infrastructure only as tools for finding persistent anomalies.',
                rhetoricalPatterns: [
                    'Distrusts narrative explanations.',
                    'Focuses on out-of-sample recurrence.',
                    'Uses research-pipeline language.'
                ],
                signatureMoves: [
                    'Asks whether the signal persists after costs.',
                    'Rejects hand-tuned stories.'
                ]
            },
            'ray dalio': {
                voiceStyle: 'Principles-driven allocator: systems, believability, radical transparency, feedback loops, and explicit decision criteria.',
                rhetoricalPatterns: [
                    'Organizes into principles.',
                    'Names process failure before output failure.',
                    'Asks for explicit criteria.'
                ],
                signatureMoves: [
                    'Turns conflict into a decision rule.',
                    'Requires written principles before action.'
                ]
            },
            'viktor frankl': {
                voiceStyle: 'Existential discipline: meaning, agency under constraint, suffering converted into responsibility, and inner freedom.',
                rhetoricalPatterns: [
                    'Speaks in moral-psychological terms.',
                    'Separates circumstance from response.',
                    'Avoids productivity jargon.'
                ],
                signatureMoves: [
                    'Reframes pain as a responsibility question.',
                    'Asks what meaning the action serves.'
                ]
            },
            'charles babbage': {
                voiceStyle: 'Mechanical computation architect: tables, engines, precision, error, repeatability, and the scandal of sloppy calculation.',
                rhetoricalPatterns: [
                    'Uses mechanical and tabular metaphors.',
                    'Condemns ambiguity as machine error.',
                    'Prefers fixed specifications.'
                ],
                signatureMoves: [
                    'Turns workflow into an engine.',
                    'Asks where the calculation can be inspected.'
                ]
            }
        };
        return map[key] || {
            voiceStyle: 'Distinct historical voice rooted in the persona era, domain, vocabulary, and mode of argument. Avoid generic executive-coach phrasing.',
            rhetoricalPatterns: [
                'Use the persona domain vocabulary and metaphors.',
                'Use a cadence that would identify the speaker even without the name.',
                'Challenge the user through the persona worldview.'
            ],
            signatureMoves: [
                'Translate the user context into the persona native problem frame.',
                'Give advice that another persona would not give in the same words.'
            ]
        };
    };

    var normalizePersona = function (entry, index) {
        var name = String(entry && (entry.name || entry.persona || entry.figure) || '').trim();
        var defaults;
        var rhetoricalPatterns;
        var signatureMoves;
        if (!name) { name = 'Historical Persona ' + (index + 1); }
        defaults = getPersonaVoiceDefaults(name);
        rhetoricalPatterns = normalizeStringList(entry &&
            (entry.rhetorical_patterns || entry.rhetoricalPatterns ||
                entry.speech_patterns || entry.speechPatterns));
        signatureMoves = normalizeStringList(entry &&
            (entry.signature_moves || entry.signatureMoves || entry.moves));
        return {
            index: index,
            name: name,
            era: String(entry && entry.era || '').trim(),
            relevance: String(entry && entry.relevance || entry.why || '').trim(),
            angle: String(entry && entry.angle || entry.lens || '').trim(),
            voiceStyle: String(entry && (entry.voice_style || entry.voiceStyle ||
                entry.rhetorical_style || entry.rhetoricalStyle || entry.style) ||
                defaults.voiceStyle || '').trim(),
            rhetoricalPatterns: rhetoricalPatterns.length ?
                rhetoricalPatterns : defaults.rhetoricalPatterns,
            signatureMoves: signatureMoves.length ?
                signatureMoves : defaults.signatureMoves,
            antiStyle: String(entry && (entry.anti_style || entry.antiStyle ||
                entry.forbidden_tone || entry.forbiddenTone) ||
                'Do not sound like a generic consultant, product manager, executive coach, or the other personas.').trim(),
            description: '',
            feedback: '',
            status: 'queued',
            error: ''
        };
    };

    var parsePersonas = function (text, opts) {
        opts = opts || {};
        var limit = opts.personasPerRound || DEFAULTS.personasPerRound;
        var jsonText = extractFirstJsonCandidate(text);
        var data;
        var rows;
        var lines;
        if (jsonText) {
            try {
                data = JSON.parse(jsonText);
                rows = Array.isArray(data) ? data : data.personas;
            } catch (err) {
                rows = null;
            }
        }
        if (!Array.isArray(rows)) {
            lines = String(text || '').split(/\n/u).map(function (line) {
                return line.replace(/^\s*(?:[-*]|\d+[.)])\s*/u, '').trim();
            }).filter(Boolean).slice(0, limit);
            rows = lines.map(function (line) {
                var parts = line.split(/\s+-\s+/u);
                return {
                    name: parts[0],
                    era: '',
                    relevance: parts.slice(1).join(' - '),
                    angle: ''
                };
            });
        }
        return (rows || []).map(normalizePersona)
            .filter(function (persona) { return !!persona.name; })
            .slice(0, limit);
    };

    var dedupePersonas = function (personas, usedNames, opts) {
        opts = opts || {};
        var limit = opts.personasPerRound || DEFAULTS.personasPerRound;
        var used = {};
        var output = [];
        (usedNames || []).forEach(function (name) {
            used[String(name || '').toLowerCase()] = true;
        });
        (personas || []).forEach(function (persona) {
            var key = String(persona.name || '').toLowerCase();
            if (!key || used[key] || output.length >= limit) { return; }
            used[key] = true;
            persona.index = output.length;
            output.push(persona);
        });
        return output;
    };

    var fillPersonas = function (personas, usedNames, opts) {
        opts = opts || {};
        var limit = opts.personasPerRound || DEFAULTS.personasPerRound;
        var output = dedupePersonas(personas, usedNames, opts);
        var used = {};
        (usedNames || []).forEach(function (name) {
            used[String(name || '').toLowerCase()] = true;
        });
        output.forEach(function (persona) {
            used[String(persona.name || '').toLowerCase()] = true;
        });
        FALLBACK_PERSONAS.some(function (entry) {
            var key = String(entry.name || '').toLowerCase();
            if (output.length >= limit) { return true; }
            if (used[key]) { return false; }
            used[key] = true;
            output.push(normalizePersona(entry, output.length));
            return false;
        });
        output.forEach(function (persona, index) { persona.index = index; });
        return output;
    };

    var buildPriorRoundBrief = function (state, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var responseLimit = opts.responseContextLimit || DEFAULTS.responseContextLimit;
        var parts = [];
        (state && state.rounds || []).forEach(function (round) {
            if (round.status !== 'Complete' && !round.managerSummary) { return; }
            parts.push('## Prior Round ' + round.number);
            parts.push('Personas already used: ' + round.personas.map(function (persona) {
                return persona.name;
            }).join(', '));
            if (round.managerSummary) {
                parts.push('Manager synthesis:\n' + truncate(round.managerSummary, 1800));
            }
            round.personas.forEach(function (persona) {
                if (persona.feedback) {
                    parts.push(persona.name + ' feedback gist:\n' +
                        truncate(persona.feedback, 700));
                }
            });
        });
        return truncate(parts.join('\n\n'), responseLimit);
    };

    var runPool = function (items, worker, limit) {
        var index = 0;
        var activeLimit = Math.max(1, Math.min(limit || 1, items.length || 1));
        var runNext = function () {
            var current = index;
            if (current >= items.length) { return Promise.resolve(); }
            index += 1;
            return Promise.resolve(worker(items[current], current)).catch(function (err) {
                console.error(err);
            }).then(runNext);
        };
        return Promise.all(Array.apply(null, { length: activeLimit }).map(runNext));
    };

    var buildPersonaSelectorMessages = function (contextText, priorRoundBrief, usedNames, roundNo, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var rounds = opts.rounds || DEFAULTS.rounds;
        var responseLimit = opts.responseContextLimit || DEFAULTS.responseContextLimit;
        var userParts = [
            'Select exactly five historical personas most relevant to the supplied Post Fiat user context.',
            'Round: ' + roundNo + ' of ' + rounds + '.',
            usedNames.length ? 'Do not repeat any of these already-used personas: ' +
                usedNames.join(', ') + '.' : '',
            'For each persona, precompute the rhetorical voice. Do not merely select famous names.',
            'voice_style must describe cadence, domain vocabulary, metaphors, and argumentative posture.',
            'rhetorical_patterns must contain 3-5 concrete writing patterns that make the speaker recognizable.',
            'signature_moves must contain 2-4 reasoning moves this persona would naturally make.',
            'anti_style must say what generic modern phrasing this persona must avoid.',
            priorRoundBrief ? 'Previous round transcript and synthesis. Choose new lenses that add information instead of repeating prior advice:\n' +
                truncate(priorRoundBrief, responseLimit) : '',
            'User context:\n' + contextText,
            'Return strict JSON only in this shape: {"personas":[{"name":"","era":"","relevance":"","angle":"","voice_style":"","rhetorical_patterns":["","",""],"signature_moves":["",""],"anti_style":""}]}'
        ].filter(Boolean);
        return [{
            role: 'system',
            content: 'You are a precise historical-persona and rhetorical-style selector for a private strategic reasoning tool. Return JSON only. Do not include markdown.'
        }, {
            role: 'user',
            content: userParts.join('\n\n')
        }];
    };

    var buildPersonaConsultMessages = function (persona, contextText, priorRoundBrief, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var responseLimit = opts.responseContextLimit || DEFAULTS.responseContextLimit;
        var rhetoricalPatterns = (persona.rhetoricalPatterns || []).map(function (pattern) {
            return '- ' + pattern;
        }).join('\n');
        var signatureMoves = (persona.signatureMoves || []).map(function (move) {
            return '- ' + move;
        }).join('\n');
        return [{
            role: 'system',
            content: [
                'You are not a neutral adviser. You are writing as the named historical persona inside Superthink.',
                'The response must be identifiable as that persona even if the name is removed.',
                'Use the persona domain vocabulary, metaphors, cadence, and reasoning habits.',
                'Do not use the shared Superthink house voice.',
                'Avoid repeated generic phrases such as "you are underweighting the risk", "validation theater", "kill or ship", "brutal arithmetic", "core directive", and "what matters now" unless the persona voice makes them unavoidable.',
                'Return exactly two labeled sections: DESCRIPTION: and FEEDBACK:.',
                'Do not use JSON. Do not use markdown fences. Do not mention that you are imitating a style.'
            ].join('\n')
        }, {
            role: 'user',
            content: [
                'Persona: ' + persona.name,
                persona.era ? 'Era: ' + persona.era : '',
                persona.relevance ? 'Why selected: ' + persona.relevance : '',
                persona.angle ? 'Angle: ' + persona.angle : '',
                'Voice style:\n' + persona.voiceStyle,
                rhetoricalPatterns ? 'Rhetorical patterns to use:\n' + rhetoricalPatterns : '',
                signatureMoves ? 'Signature reasoning moves to use:\n' + signatureMoves : '',
                persona.antiStyle ? 'Anti-style / forbidden generic mode:\n' + persona.antiStyle : '',
                'DESCRIPTION: two concise paragraphs describing this persona as a thinking lens for the user. Write it in the persona voice, not a neutral encyclopedia voice.',
                'FEEDBACK: two to four concise paragraphs of advice in the persona voice. The substance should be useful, but the rhetoric should come from the persona world: military tempo for Boyd, information compression for Shannon, statecraft for Machiavelli, mechanical calculation for Babbage, etc.',
                'Do not force every persona into the same categories. Do not make every answer about the same risk. Do not repeat prior wording.',
                'Be concrete. No generic encouragement. Do not dox or quote sensitive details.',
                priorRoundBrief ? 'Previous Superthink rounds. Do not repeat these points; extend, challenge, or sharpen them:\n' +
                    truncate(priorRoundBrief, responseLimit) : '',
                'User context:\n' + truncate(contextText, 16000)
            ].filter(Boolean).join('\n\n')
        }];
    };

    var parsePersonaPacket = function (text) {
        var jsonText = extractFirstJsonCandidate(text);
        var data;
        var raw = String(text || '').trim();
        var feedbackMatch;
        if (jsonText) {
            try {
                data = JSON.parse(jsonText);
            } catch (err) {
                data = null;
            }
            if (data && (data.description || data.feedback)) {
                return {
                    description: String(data.description || '').trim(),
                    feedback: String(data.feedback || '').trim()
                };
            }
        }
        feedbackMatch = /(?:^|\n)\s*(?:#+\s*)?feedback\s*[:|-]\s*/iu.exec(raw);
        if (feedbackMatch) {
            return {
                description: raw.slice(0, feedbackMatch.index)
                    .replace(/(?:^|\n)\s*(?:#+\s*)?description\s*[:|-]\s*/iu, '')
                    .trim(),
                feedback: raw.slice(feedbackMatch.index + feedbackMatch[0].length).trim()
            };
        }
        return {
            description: '',
            feedback: raw
        };
    };

    var buildManagerMessages = function (round, contextText, priorRoundBrief, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var responseLimit = opts.responseContextLimit || DEFAULTS.responseContextLimit;
        var feedbackText = round.personas.map(function (persona) {
            return '## ' + persona.name + '\n' + (persona.feedback || persona.error || '');
        }).join('\n\n');
        return [{
            role: 'system',
            content: [
                'You are the Superthink manager.',
                'Compress five persona responses into a high-signal synthesis.',
                'Preserve meaningful differences in voice and worldview. Do not rewrite all personas into one house doctrine.'
            ].join('\n')
        }, {
            role: 'user',
            content: [
                'Round ' + round.number + ' persona feedback:',
                feedbackText,
                priorRoundBrief ? 'Prior Superthink rounds to avoid repeating:\n' +
                    truncate(priorRoundBrief, responseLimit) : '',
                'User context excerpt:\n' + truncate(contextText, 10000),
                'Write a concise synthesis with: strongest agreement, strongest disagreement, immediate move, and unresolved question. Keep it under 700 words.'
            ].filter(Boolean).join('\n\n')
        }];
    };

    var buildTranscriptText = function (state) {
        var parts = [];
        (state && state.rounds || []).forEach(function (round) {
            parts.push('# Round ' + round.number);
            if (round.selectorText) { parts.push('## Selector output\n' + round.selectorText); }
            round.personas.forEach(function (persona) {
                parts.push('## ' + persona.name);
                if (persona.voiceStyle) { parts.push('Voice style:\n' + persona.voiceStyle); }
                if (persona.rhetoricalPatterns && persona.rhetoricalPatterns.length) {
                    parts.push('Rhetorical patterns:\n' + persona.rhetoricalPatterns.map(function (pattern) {
                        return '- ' + pattern;
                    }).join('\n'));
                }
                if (persona.signatureMoves && persona.signatureMoves.length) {
                    parts.push('Signature moves:\n' + persona.signatureMoves.map(function (move) {
                        return '- ' + move;
                    }).join('\n'));
                }
                if (persona.description) { parts.push('Description:\n' + persona.description); }
                if (persona.feedback) { parts.push('Feedback:\n' + persona.feedback); }
                if (persona.error) { parts.push('Error:\n' + persona.error); }
            });
            if (round.managerSummary) { parts.push('## Manager synthesis\n' + round.managerSummary); }
        });
        return parts.join('\n\n');
    };

    var splitQuoteSentences = function (text) {
        return String(text || '').replace(/\s+/gu, ' ')
            .match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [];
    };

    var scoreQuoteCandidate = function (quote) {
        var lower = String(quote || '').toLowerCase();
        var keywords = [
            'kill', 'ship', 'net-of-cost', 'slippage', 'turnover', 'fee',
            'task node', 'go/no-go', 'capital', 'sovereignty', 'ambiguity',
            'validation', 'overfitting', 'founder-use', 'decision', 'risk',
            'strategy', 'alpha', 'memo', 'edge'
        ];
        var score = 0;
        keywords.forEach(function (keyword) {
            if (lower.indexOf(keyword) !== -1) { score += 2; }
        });
        if (quote.length >= 70 && quote.length <= 220) { score += 2; }
        if (/must|only|stop|do not|if\b|until|before/iu.test(quote)) { score += 1; }
        return score;
    };

    var collectQuoteCandidates = function (label, text, limit) {
        var seen = {};
        return splitQuoteSentences(text).map(function (sentence) {
            var quote = sentence.replace(/^\s*(?:[-*]|\d+[.)]|#+)\s*/u, '').trim();
            var key = quote.toLowerCase();
            if (quote.length < 45 || quote.length > 260 || seen[key]) { return null; }
            seen[key] = true;
            return { label: label, quote: quote, score: scoreQuoteCandidate(quote) };
        }).filter(Boolean).sort(function (a, b) {
            return b.score - a.score;
        }).slice(0, limit || 6);
    };

    var buildQuoteCandidates = function (state) {
        var candidates = [];
        candidates = candidates.concat(collectQuoteCandidates(
            'User context', state && state.contextText || '', 8));
        (state && state.rounds || []).forEach(function (round) {
            if (round.selectorText) {
                candidates = candidates.concat(collectQuoteCandidates(
                    'Round ' + round.number + ' selector', round.selectorText, 3));
            }
            if (round.managerSummary) {
                candidates = candidates.concat(collectQuoteCandidates(
                    'Round ' + round.number + ' manager', round.managerSummary, 5));
            }
            round.personas.forEach(function (persona) {
                if (persona.feedback) {
                    candidates = candidates.concat(collectQuoteCandidates(
                        'Round ' + round.number + ' - ' + persona.name,
                        persona.feedback, 2));
                }
            });
        });
        return candidates.sort(function (a, b) {
            return b.score - a.score;
        }).slice(0, 24).map(function (entry) {
            return '- [' + entry.label + '] "' + entry.quote + '"';
        }).join('\n');
    };

    var buildFinalMessages = function (state, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var quoteCandidates = buildQuoteCandidates(state);
        return [{
            role: 'system',
            content: [
                'You are the final Superthink editor.',
                'Do not write a generic operating brief.',
                'Create an evidence-grounded report that preserves the sharpest language from the transcript.'
            ].join('\n')
        }, {
            role: 'user',
            content: [
                quoteCandidates ? 'Evidence pull-quote candidates. Use exact short quotes from this list or from the transcript; do not invent quotes:\n' +
                    quoteCandidates : '',
                'User context excerpt:\n' + truncate(state.contextText, 12000),
                'Superthink transcript:\n' + truncate(buildTranscriptText(state), 36000),
                [
                    'Write the final Superthink report in markdown.',
                    'Required sections:',
                    '1. Thesis - 3 concise bullets.',
                    '2. Evidence Pull-Quotes - 6 to 10 short exact quotes with source labels and one sentence on why each matters.',
                    '3. What The Personas Actually Disagreed About.',
                    '4. Decision Directives.',
                    '5. Open Questions / Missing Thresholds.',
                    'Requirements:',
                    '- Quote exact language from the pull-quote list or transcript.',
                    '- Include at least three quotes from persona or manager outputs.',
                    '- Include at least one user-context quote when a useful one exists.',
                    '- Tie every strategic conclusion to at least one quoted input.',
                    '- Remove repetition, but do not erase the best harsh/strange phrasing.',
                    '- Do not summarize the entire Post Fiat brief unless it is directly relevant to the quoted evidence.'
                ].join('\n')
            ].filter(Boolean).join('\n\n')
        }];
    };

    var initState = function (options) {
        options = options || {};
        var now = Number(options.now) || Date.now();
        return {
            id: options.id || 'superthink-' + now,
            startedAt: now,
            completedAt: 0,
            baseUrl: options.baseUrl || '',
            model: options.model || '',
            contextText: '',
            status: 'Ready',
            rounds: [],
            calls: [],
            finalReport: '',
            error: ''
        };
    };

    return {
        DEFAULTS: DEFAULTS,
        FALLBACK_PERSONAS: FALLBACK_PERSONAS,
        buildFinalMessages: buildFinalMessages,
        buildManagerMessages: buildManagerMessages,
        buildPersonaConsultMessages: buildPersonaConsultMessages,
        buildPersonaSelectorMessages: buildPersonaSelectorMessages,
        buildPriorRoundBrief: buildPriorRoundBrief,
        buildQuoteCandidates: buildQuoteCandidates,
        buildTranscriptText: buildTranscriptText,
        collectQuoteCandidates: collectQuoteCandidates,
        dedupePersonas: dedupePersonas,
        extractFirstJsonCandidate: extractFirstJsonCandidate,
        fillPersonas: fillPersonas,
        getPersonaVoiceDefaults: getPersonaVoiceDefaults,
        initState: initState,
        normalizePersona: normalizePersona,
        normalizeStringList: normalizeStringList,
        parsePersonaPacket: parsePersonaPacket,
        parsePersonas: parsePersonas,
        runPool: runPool,
        scoreQuoteCandidate: scoreQuoteCandidate,
        splitQuoteSentences: splitQuoteSentences,
        stripJsonFences: stripJsonFences
    };
});
