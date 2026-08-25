// SPDX-License-Identifier: AGPL-3.0-or-later
define([
    '/api/config'
], function (ApiConfig) {
    'use strict';

    var fail = function (message) {
        var node = document.getElementById('error');
        if (node) { node.textContent = String(message || 'PFDocs bridge failed'); }
    };

    var start = function () {
        try {
            var params = new URLSearchParams(window.location.search);
            var action = params.get('action');
            var documentType = params.get('documentType') === 'sheet' ? 'sheet' : 'pad';
            var requestId = String(params.get('requestId') || '');
            var returnOrigin = new URL(String(params.get('returnOrigin') || '')).origin;
            var allowed = (ApiConfig.postFiat && ApiConfig.postFiat.taskNodeOrigins) || [];

            if (['create', 'open'].indexOf(action) === -1 || !/^[0-9a-f-]{36}$/i.test(requestId)) {
                throw new Error('Invalid Task Node bridge request.');
            }
            if (allowed.indexOf(returnOrigin) === -1) {
                throw new Error('Task Node origin is not authorized by PFDocs.');
            }
            var targetMode = window.parent !== window ? 'parent' : 'opener';
            if (targetMode === 'opener' && (!window.opener || window.opener.closed)) {
                throw new Error('The Task Node opener is unavailable.');
            }

            var capabilityHash = window.location.hash;
            var capabilityPattern = new RegExp('^#\\/[0-9]+\\/' + documentType + '\\/(?:edit|view)\\/[A-Za-z0-9+/_=-]+\\/$');
            if (action === 'open' && !capabilityPattern.test(capabilityHash || '')) {
                throw new Error('Invalid PFDocs document capability.');
            }

            sessionStorage.setItem('PFDocs_taskNodeBridge', JSON.stringify({
                action: action,
                documentType: documentType,
                requestId: requestId,
                returnOrigin: returnOrigin,
                targetMode: targetMode
            }));
            if (action === 'create') {
                window.location.replace('/' + documentType + '/?tasknodeBootstrap=' + encodeURIComponent(requestId) +
                    '&tasknodeSession=' + encodeURIComponent(requestId));
                return;
            }
            window.location.replace('/' + documentType + '/?tasknodeSession=' + encodeURIComponent(requestId) + capabilityHash);
        } catch (error) {
            fail(error && error.message || error);
        }
    };

    start();
});
