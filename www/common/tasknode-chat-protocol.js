// SPDX-License-Identifier: AGPL-3.0-or-later
(function (factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else if (typeof define === 'function' && define.amd) { define([], factory); }
}(function () {
    'use strict';
    var personas = [
        { persona: 'odv', mention: '@odv', display: '@ODV', label: 'ODV' },
        { persona: 'coach', mention: '@coach', display: '@coach', label: 'Trading Coach' },
        { persona: 'prompt', mention: '@prompt', display: '@prompt', label: 'Prompt Assistant' }
    ];
    function persona(id) {
        var key = String(id || '').toLowerCase();
        for (var p = 0; p < personas.length; p++) {
            if (personas[p].persona === key) {
                return { persona: personas[p].persona, mention: personas[p].display, label: personas[p].label };
            }
        }
    }
    // The assistants a document can address are the ones Task Node announced in
    // its context message. Prompt documents accept only the prompt assistant;
    // every other document never accepts it.
    function agents(context, promptMode) {
        var list = context && Array.isArray(context.agents) ? context.agents.slice(0, 8) : [];
        var result = [];
        var add = function (id) {
            var known = persona(id);
            if (!known || (known.persona === 'prompt') !== (promptMode === true)) { return; }
            if (result.some(function (agent) { return agent.persona === known.persona; })) { return; }
            result.push(known);
        };
        list.forEach(function (agent) { add(agent && agent.persona); });
        if (context && context.odv && context.odv.enabled === true) { add('odv'); }
        return result;
    }
    // Without an announced agent list only the document assistants are
    // addressable; the prompt assistant always has to be announced.
    function candidates(allowed) {
        return personas.filter(function (entry) {
            if (!Array.isArray(allowed)) { return entry.persona !== 'prompt'; }
            return allowed.some(function (agent) { return agent && agent.persona === entry.persona; });
        });
    }
    function mention(value, allowed) {
        var text = String(value || '').toLowerCase();
        var list = candidates(allowed);
        for (var index = 0; index < text.length; index++) {
            if (index && text[index - 1].trim()) { continue; }
            for (var p = 0; p < list.length; p++) {
                var persona = list[p];
                if (text.slice(index, index + persona.mention.length) !== persona.mention) { continue; }
                var next = text[index + persona.mention.length] || '';
                if (next && 'abcdefghijklmnopqrstuvwxyz0123456789_'.indexOf(next) !== -1) { continue; }
                return { persona: persona.persona, mention: persona.display, label: persona.label };
            }
        }
    }
    function assistantMessage(value) {
        var text = String(value || '');
        if (text.slice(0, 2) !== '**') { return; }
        var end = text.indexOf('**', 2);
        if (end < 0 || end > 120) { return; }
        var header = text.slice(2, end).toLowerCase();
        for (var p = 0; p < personas.length; p++) {
            var persona = personas[p];
            var label = persona.mention + ' · ' + persona.label.toLowerCase();
            if (header !== label && header !== label + ' · glm 5.2 via ambient' &&
                !(persona.persona === 'odv' && header === '@odv · glm 5.2 via ambient')) { continue; }
            return { body: text.slice(end + 2).trim(), persona: persona.persona, label: persona.label };
        }
    }
    function documentText(parsed) {
        var text = '';
        var blocks = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BR'];
        function walk(node) {
            if (text.length >= 80000 || node === null || typeof node === 'undefined') { return; }
            if (typeof node === 'string') { text += node.slice(0, 80000 - text.length); return; }
            if (!Array.isArray(node)) { return; }
            if (typeof node[0] === 'string' && Array.isArray(node[2])) {
                node[2].forEach(walk);
                if (blocks.indexOf(node[0].toUpperCase()) !== -1) { text += '\n'; }
            } else { node.forEach(walk); }
        }
        walk(parsed);
        return text.trim().slice(0, 80000);
    }
    function spreadsheetText(api) {
        if (!api || typeof api.GetSheets !== 'function') { return 'Spreadsheet content is still loading.'; }
        var sheets = api.GetSheets();
        var result = { type: 'spreadsheet', rangePerSheet: 'A1:AN200', sheetLimit: 8, truncated: sheets.length > 8, sheets: [] };
        var size = 200;
        sheets.slice(0, 8).forEach(function (sheet) {
            var values = sheet.GetRange('A1:AN200').GetValue();
            var entry = { name: String(sheet.GetName()).slice(0, 180), rows: [] };
            if (!Array.isArray(values)) { values = [[values]]; }
            values.slice(0, 200).forEach(function (cells, index) {
                if (!Array.isArray(cells)) { cells = [cells]; }
                cells = cells.slice(0, 40).map(function (cell) { return typeof cell === 'string' ? cell.slice(0, 2000) : cell; });
                if (!cells.some(function (cell) { return cell !== '' && cell !== null && typeof cell !== 'undefined'; })) { return; }
                var row = { row: index + 1, cells: cells };
                var length = JSON.stringify(row).length;
                if (size + length > 76000) { result.truncated = true; return; }
                size += length;
                entry.rows.push(row);
            });
            result.sheets.push(entry);
        });
        return JSON.stringify(result);
    }
    return { persona: persona, agents: agents, mention: mention, assistantMessage: assistantMessage, documentText: documentText, spreadsheetText: spreadsheetText,
        assistantTimeoutMs: 570000, assistantQueryTimeoutMs: 600000 };
}));
