const test = require('node:test');
const assert = require('node:assert/strict');
const Fs = require('node:fs');
const Path = require('node:path');

const root = Path.join(__dirname, '../..');

test('login loads the generated AMD bundle before booting CryptPad', () => {
    const html = Fs.readFileSync(Path.join(root, 'www/login/index.html'), 'utf8');
    const requireIndex = html.indexOf('/components/requirejs/require.js');
    const bundleIndex = html.indexOf('/login/postfiat-login-bundle.js');

    assert.ok(requireIndex >= 0);
    assert.ok(bundleIndex > requireIndex);
    assert.doesNotMatch(html, /data-main=/u);
});

test('login bundle contains named critical modules and starts boot once', () => {
    const bundle = Fs.readFileSync(
        Path.join(root, 'www/login/postfiat-login-bundle.js'),
        'utf8'
    );

    assert.match(bundle, /define\("\/customize\/template\.js",/u);
    assert.match(bundle, /define\("\/login\/main\.js",/u);
    assert.doesNotMatch(bundle, /define\("\/common\/postfiat-wallet-core\.bundle\.js"/u);
    assert.match(
        Fs.readFileSync(Path.join(root, 'www/login/main.js'), 'utf8'),
        /'\/common\/postfiat-wallet-core\.bundle\.js'/u
    );
    assert.equal((bundle.match(/require\(\["\/common\/boot\.js\?ver=1\.0"\]\)/gu) || []).length, 1);
});

test('login page styles are loaded after its critical UI can render', () => {
    const template = Fs.readFileSync(Path.join(root, 'customize.dist/template.js'), 'utf8');

    assert.match(template, /if \(pageName !== 'login'\) \{ pageDependencies\.push\(pageLess\); \}/u);
    assert.match(template, /if \(pageName === 'login'\) \{\s*require\(\[pageLess\]/u);
});

test('package-mode startup preserves versioned browser cache keys', () => {
    const api = Fs.readFileSync(Path.join(root, 'lib/api.js'), 'utf8');
    const onionRunner = Fs.readFileSync(
        Path.join(root, 'scripts/postfiat-onion-dev.sh'),
        'utf8'
    );

    assert.match(api, /if \(!process\.env\.PACKAGE\) \{ Env\.flushCache\(\); \}/u);
    assert.match(onionRunner, /exec npm run package/u);
});

test('onion startup and runtime health use fresh end-to-end evidence', () => {
    const onionRunner = Fs.readFileSync(
        Path.join(root, 'scripts/postfiat-onion-dev.sh'),
        'utf8'
    );

    assert.match(onionRunner, /BOOTSTRAP_LOG_START/u);
    assert.match(onionRunner, /tail -n "\+\$\(\(BOOTSTRAP_LOG_START \+ 1\)\)"/u);
    assert.match(onionRunner, /local_app_healthy/u);
    assert.match(onionRunner, /onion_healthy/u);
    assert.match(onionRunner, /POSTFIAT_ONION_HEALTH_FAILURES/u);
    assert.match(onionRunner, /systemctl --user restart pftdocs-tor\.service/u);
});

test('systemd units supervise the app, Tor, and recurring onion health', () => {
    const unitRoot = Path.join(root, 'ops/systemd/user');
    const appUnit = Fs.readFileSync(Path.join(unitRoot, 'pftdocs.service'), 'utf8');
    const torUnit = Fs.readFileSync(Path.join(unitRoot, 'pftdocs-tor.service'), 'utf8');
    const healthUnit = Fs.readFileSync(
        Path.join(unitRoot, 'pftdocs-onion-health.service'),
        'utf8'
    );
    const healthTimer = Fs.readFileSync(
        Path.join(unitRoot, 'pftdocs-onion-health.timer'),
        'utf8'
    );

    assert.match(appUnit, /Restart=always/u);
    assert.match(torUnit, /Restart=always/u);
    assert.match(torUnit, /tor-service/u);
    assert.match(healthUnit, /onion:recover/u);
    assert.match(healthTimer, /OnUnitActiveSec=2min/u);
});
