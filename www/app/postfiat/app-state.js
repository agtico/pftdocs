// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var routeLabels = {
        docs: 'Docs',
        shared: 'Shared with me',
        sent: 'Sent',
        tasknode: 'Task Node',
        messages: 'Messages',
        chat: 'Chat',
        superthink: 'Superthink',
        ai: 'AI',
        compute: 'RunPod',
        contacts: 'Contacts',
        durable: 'Durable',
        settings: 'Settings'
    };

    var appTypes = [
        { type: 'pad', label: 'Document' },
        { type: 'sheet', label: 'Sheet' },
        { type: 'code', label: 'Code' },
        { type: 'kanban', label: 'Board' },
        { type: 'whiteboard', label: 'Whiteboard' }
    ];

    var getInitialRoute = function (hash) {
        var raw = String(hash || '#docs').slice(1) || 'docs';
        var boot;
        try {
            boot = JSON.parse(decodeURIComponent(raw));
            if (boot && typeof(boot.postFiatRoute) === 'string') {
                return boot.postFiatRoute;
            }
        } catch (err) {}
        return raw;
    };

    var normalizeRoute = function (route) {
        return routeLabels[route] ? route : 'docs';
    };

    return {
        appTypes: appTypes,
        getInitialRoute: getInitialRoute,
        normalizeRoute: normalizeRoute,
        routeLabels: routeLabels
    };
});
