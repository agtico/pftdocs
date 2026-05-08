// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var compactText = function (value) {
        return String(value || '')
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
    };

    var truncateText = function (value, limit) {
        var text = compactText(value);
        var omitted;
        if (!limit || text.length <= limit) { return text; }
        omitted = text.length - limit;
        return text.slice(0, limit).trim() +
            '\n\n[... ' + omitted.toLocaleString() + ' characters truncated ...]';
    };

    var getUsableHref = function (value) {
        var href = String(value || '');
        if (href.indexOf('#') === -1) { return ''; }
        return href;
    };

    var getDocHref = function (doc, mode) {
        if (mode === 'view') {
            return getUsableHref(doc && doc.roHref) || getUsableHref(doc && doc.href);
        }
        return getUsableHref(doc && doc.href) || getUsableHref(doc && doc.roHref);
    };

    var getDocType = function (href, parsePadUrl) {
        try {
            return parsePadUrl(href).type || 'pad';
        } catch (err) {
            return 'pad';
        }
    };

    var collectRootIds = function (root, out) {
        out = out || {};
        if (!root || typeof(root) !== 'object') { return out; }
        Object.keys(root).forEach(function (key) {
            var value = root[key];
            if (typeof(value) === 'number' || typeof(value) === 'string') {
                out[String(value)] = true;
                return;
            }
            if (value && typeof(value) === 'object' && value.metadata !== true) {
                collectRootIds(value, out);
            }
        });
        return out;
    };

    var collectTrashIds = function (trash, out) {
        out = out || {};
        if (!trash || typeof(trash) !== 'object') { return out; }
        Object.keys(trash).forEach(function (key) {
            var list = trash[key];
            if (!Array.isArray(list)) { return; }
            list.forEach(function (entry) {
                var value = entry && entry.element;
                if (typeof(value) === 'number' || typeof(value) === 'string') {
                    out[String(value)] = true;
                    return;
                }
                collectRootIds(value, out);
            });
        });
        return out;
    };

    var normalizeDriveDocs = function (driveObject, opts) {
        var drive = (driveObject && driveObject.drive) || {};
        var filesData = drive.filesData || {};
        var rootIds = collectRootIds(drive.root || {});
        var trashIds = collectTrashIds(drive.trash || {});
        var templateIds = {};
        (drive.template || []).forEach(function (id) {
            templateIds[String(id)] = true;
        });
        return Object.keys(filesData).map(function (id) {
            var data = filesData[id] || {};
            var href = getUsableHref(data.href);
            var roHref = getUsableHref(data.roHref);
            var bestHref = href || roHref;
            return {
                id: String(id),
                title: data.filename || data.title || 'Untitled document',
                href: href,
                roHref: roHref,
                type: getDocType(bestHref, opts && opts.parsePadUrl || function () {
                    return { type: 'pad' };
                }),
                atime: data.atime || data.ctime || 0,
                ctime: data.ctime || 0,
                tags: data.tags || [],
                root: Boolean(rootIds[String(id)]),
                trash: Boolean(trashIds[String(id)]),
                template: Boolean(templateIds[String(id)]),
                channel: data.channel,
                password: data.password || ''
            };
        }).filter(function (doc) {
            return getDocHref(doc, 'view');
        }).sort(function (a, b) {
            return (b.atime || b.ctime || 0) - (a.atime || a.ctime || 0);
        });
    };

    var hyperjsonToText = function (value, toDOM) {
        var node;
        try {
            node = toDOM(value);
            return compactText(node.textContent || node.innerText || '');
        } catch (err) {
            return '';
        }
    };

    var isHyperjsonNode = function (value) {
        return Array.isArray(value) && typeof(value[0]) === 'string' &&
            value[1] && typeof(value[1]) === 'object' && Array.isArray(value[2]);
    };

    var extractText = function (value, opts, depth) {
        var parsed;
        var keys;
        var text;
        var truncate = opts && opts.truncateText || truncateText;
        if (value === null || typeof(value) === 'undefined') { return ''; }
        if (value && value.tagName) {
            return compactText(value.textContent || value.innerText || '');
        }
        if (typeof(value) === 'string') {
            text = compactText(value);
            if (/^[\[{]/u.test(text)) {
                try {
                    parsed = JSON.parse(text);
                    return extractText(parsed, opts, (depth || 0) + 1) || text;
                } catch (err) {
                    return text;
                }
            }
            return text;
        }
        if (Array.isArray(value)) {
            if (isHyperjsonNode(value) && opts && opts.hyperjsonToText) {
                return opts.hyperjsonToText(value);
            }
            return compactText(value.map(function (entry) {
                return extractText(entry, opts, (depth || 0) + 1);
            }).filter(Boolean).join('\n\n'));
        }
        if (typeof(value) === 'object') {
            if ((depth || 0) > 4) {
                try {
                    return truncate(JSON.stringify(value), 3000);
                } catch (err) {
                    return '';
                }
            }
            keys = [
                'content',
                'text',
                'markdown',
                'body',
                'html',
                'userDoc',
                'document',
                'doc',
                'data'
            ];
            for (var i = 0; i < keys.length; i++) {
                if (typeof(value[keys[i]]) !== 'undefined') {
                    text = extractText(value[keys[i]], opts, (depth || 0) + 1);
                    if (text) { return text; }
                }
            }
            try {
                return truncate(JSON.stringify(value, null, 2), 5000);
            } catch (err) {
                return '';
            }
        }
        return compactText(value);
    };

    return {
        collectRootIds: collectRootIds,
        collectTrashIds: collectTrashIds,
        compactText: compactText,
        extractText: extractText,
        getDocHref: getDocHref,
        getDocType: getDocType,
        getUsableHref: getUsableHref,
        hyperjsonToText: hyperjsonToText,
        isHyperjsonNode: isHyperjsonNode,
        normalizeDriveDocs: normalizeDriveDocs,
        truncateText: truncateText
    };
});
