#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const Fs = require('node:fs');
const Path = require('node:path');

const root = Path.resolve(__dirname, '..');
const output = Path.join(root, 'www/login/postfiat-login-bundle.js');

// The login route is intentionally packaged separately. Tor amplifies the cost of
// RequireJS' dependency discovery because every newly discovered module adds a
// high-latency HTTP round trip. Keep dynamic API modules out of this list.
const modules = [
    ['/common/boot.js?ver=1.0', 'www/common/boot.js'],
    ['/common/boot2.js', 'www/common/boot2.js'],
    ['/common/requireconfig.js', 'www/common/requireconfig.js'],
    ['/customize/application_config.js', 'customize.dist/application_config.js'],
    ['/common/application_config_internal.js', 'www/common/application_config_internal.js'],
    ['/customize/template.js', 'customize.dist/template.js'],
    ['jquery', 'www/components/jquery/dist/jquery.min.js'],
    ['/common/hyperscript.js', 'www/common/hyperscript.js'],
    ['/customize/pages.js', 'customize.dist/pages.js'],
    ['/components/nthen/index.js', 'www/components/nthen/index.js'],
    ['/common/common-language.js', 'www/common/common-language.js'],
    ['/common/common-util.js', 'www/common/common-util.js'],
    ['/customize/messages.js', 'customize.dist/messages.js'],
    ['/common/extensions.js', 'www/common/extensions.js'],
    ['optional', 'www/lib/optional/optional.js'],
    ['/common/common-icons.js', 'www/common/common-icons.js'],
    ['/components/tweetnacl-util/nacl-util.min.js', 'www/components/tweetnacl-util/nacl-util.min.js'],
    ['/customize/translations/messages.js', 'customize.dist/translations/messages.js'],
    ['/customize/lucide.js', 'customize.dist/lucide.js'],
    ['json', 'www/components/requirejs-plugins/src/json.js'],
    ['text', 'www/components/requirejs-plugins/lib/text.js'],
    ['/customize/pages/login.js', 'customize.dist/pages/login.js'],
    ['/common/common-interface.js', 'www/common/common-interface.js'],
    ['/common/outer/local-store.js', 'www/common/outer/local-store.js'],
    ['/common/common-constants.js', 'www/common/common-constants.js'],
    ['/common/common-hash.js', 'www/common/common-hash.js'],
    ['/common/cache-store.js', 'www/common/cache-store.js'],
    ['/components/localforage/dist/localforage.min.js', 'www/components/localforage/dist/localforage.min.js'],
    ['/common/common-notifier.js', 'www/common/common-notifier.js'],
    ['/components/alertify.js/dist/js/alertify.js', 'www/components/alertify.js/dist/js/alertify.js'],
    ['/lib/tippy/tippy.min.js', 'www/lib/tippy/tippy.min.js'],
    ['/customize/loading.js', 'customize.dist/loading.js'],
    ['/common/clipboard.js', 'www/common/clipboard.js'],
    ['/lib/jquery-ui/jquery-ui.min.js', 'www/lib/jquery-ui/jquery-ui.min.js'],
    ['/components/bootstrap-tokenfield/dist/bootstrap-tokenfield.js', 'www/components/bootstrap-tokenfield/dist/bootstrap-tokenfield.js'],
    ['/components/require-css/css.js', 'www/components/require-css/css.js'],
    ['/components/chainpad-crypto/crypto.js', 'www/components/chainpad-crypto/crypto.js'],
    ['/common/common-signing-keys.js', 'www/common/common-signing-keys.js'],
    ['/components/tweetnacl/nacl-fast.min.js', 'www/components/tweetnacl/nacl-fast.min.js'],
    ['/common/visible.js', 'www/common/visible.js'],
    ['/common/notify.js', 'www/common/notify.js'],
    ['/common/RequireLess.js', 'www/common/RequireLess.js'],
    ['/common/LessLoader.js', 'www/common/LessLoader.js'],
    ['/lib/less.min.js', 'www/lib/less.min.js'],
    ['/login/main.js', 'www/login/main.js'],
    ['/common/cryptpad-common.js', 'www/common/cryptpad-common.js'],
    ['/customize/login.js', 'customize.dist/login.js'],
    ['/common/common-realtime.js', 'www/common/common-realtime.js'],
    ['/common/common-feedback.js', 'www/common/common-feedback.js'],
    ['/common/postfiat-wallet-auth.js', 'www/common/postfiat-wallet-auth.js'],
    ['/common/user-object.js', 'www/common/user-object.js'],
    ['/common/events-channel.js', 'www/common/events-channel.js'],
    ['/common/outer/login-block.js', 'www/common/outer/login-block.js'],
    ['/common/common-credential.js', 'www/common/common-credential.js'],
    ['/common/common-login.js', 'www/common/common-login.js'],
    ['/common/store-interface.js', 'www/common/store-interface.js'],
    ['/common/pad-types.js', 'www/common/pad-types.js'],
    ['chainpad-listmap', 'www/components/chainpad-listmap/chainpad-listmap.js'],
    ['/common/network-config.js', 'www/common/network-config.js'],
    ['/components/chainpad/chainpad.dist.js', 'www/components/chainpad/chainpad.dist.js'],
    ['/common/outer/http-command.js', 'www/common/outer/http-command.js'],
    ['/components/scrypt-async/scrypt-async.min.js', 'www/components/scrypt-async/scrypt-async.min.js'],
    ['/common/user-object-setter.js', 'www/common/user-object-setter.js'],
    ['/common/onlyoffice/current-version.js', 'www/common/onlyoffice/current-version.js'],
    ['chainpad-netflux', 'www/components/chainpad-netflux/chainpad-netflux.js'],
    ['json.sortify', 'www/components/json.sortify/dist/JSON.sortify.js'],
    ['netflux-client', 'www/components/netflux-websocket/netflux-client.js'],
];

const nameAnonymousModule = (id, source) => {
    if (id === '/components/chainpad/chainpad.dist.js') {
        return source.replace(
            'define(function(){return n})',
            `define(${JSON.stringify(id)}, function(){return n})`
        );
    }
    const match = /\bdefine\s*\(/u.exec(source);
    if (!match) {
        return `${source}\ndefine(${JSON.stringify(id)}, [], function () {});`;
    }
    const valueStart = match.index + match[0].length;
    if (/^\s*['"]/u.test(source.slice(valueStart))) { return source; }
    return source.slice(0, valueStart) + JSON.stringify(id) + ', ' + source.slice(valueStart);
};

const chunks = [
    '// Generated by scripts/postfiat-build-login-bundle.js. Do not edit directly.\n',
];

const resolveSourcePath = (relativePath) => {
    const candidates = [relativePath];
    if (relativePath.startsWith('www/common/')) {
        candidates.push(relativePath.replace(/^www\/common\//u, 'src/common/'));
    }
    const match = candidates.find((candidate) => Fs.existsSync(Path.join(root, candidate)));
    if (!match) { throw new Error(`Missing login bundle source: ${relativePath}`); }
    return [match, Path.join(root, match)];
};

for (const [id, relativePath] of modules) {
    const [, sourcePath] = resolveSourcePath(relativePath);
    const source = Fs.readFileSync(sourcePath, 'utf8');
    chunks.push(`\n/* ${id} */\n`, nameAnonymousModule(id, source), '\n');
}

chunks.push(
    '\nrequire(["/common/boot.js?ver=1.0"]);\n'
);

Fs.writeFileSync(output, chunks.join(''));
console.log(JSON.stringify({ output, modules: modules.length, bytes: Fs.statSync(output).size }));
