// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

// Stage 0, this gets cached which means we can't change it. boot2.js is changable.
define(['/api/config?cb=' + (+new Date()).toString(16)], function (Config) {
    // The cache-busting request above is the authoritative config for this boot.
    // Register it under the stable module id too so downstream modules do not
    // make a second high-latency request, which is especially costly over Tor.
    define('/api/config', [], function () { return Config; });
    // RequireJS normalizes urlArgs by mutating the object it receives. ApiConfig
    // is also consumed later to build sandbox and SharedWorker URLs, so passing
    // the shared object here turns its urlArgs string into a function and yields
    // broken `?undefined` / `?function (...)` resource URLs. Keep the API config
    // immutable and let RequireJS mutate only its private clone.
    if (Config.requireConf) {
        require.config(JSON.parse(JSON.stringify(Config.requireConf)));
    }
    require(['/common/boot2.js']);
});
