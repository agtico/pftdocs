const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'www/tasknode/main.js'), 'utf8');
const commonSource = fs.readFileSync(path.join(root, 'www/common/sframe-common.js'), 'utf8');
const outerSource = fs.readFileSync(path.join(root, 'www/common/sframe-common-outer.js'), 'utf8');
const frameworkSource = fs.readFileSync(path.join(root, 'www/common/sframe-app-framework.js'), 'utf8');
const env = fs.readFileSync(path.join(root, 'lib/env.js'), 'utf8');
const defaults = fs.readFileSync(path.join(root, 'lib/defaults.js'), 'utf8');
const flyStart = fs.readFileSync(path.join(root, 'ops/fly-start.sh'), 'utf8');
const bootSource = fs.readFileSync(path.join(root, 'www/common/boot.js'), 'utf8');
const toolbarSource = fs.readFileSync(path.join(root, 'www/common/toolbar.js'), 'utf8');
const messengerSource = fs.readFileSync(path.join(root, 'www/common/messenger-ui.js'), 'utf8');
const messengerWorkerSource = fs.readFileSync(path.join(root, 'src/worker/modules/messenger.js'), 'utf8');
const padStyleSource = fs.readFileSync(path.join(root, 'www/pad/app-pad.less'), 'utf8');
const editorStyleSource = fs.readFileSync(path.join(root, 'customize.dist/ckeditor-contents.css'), 'utf8');

test('Task Node bridge uses an exact configured opener origin', () => {
    assert.match(source, /taskNodeOrigins/);
    assert.match(source, /allowed\.indexOf\(returnOrigin\) === -1/);
    assert.match(outerSource, /taskNodeOrigins\.indexOf\(storedTaskNodeBridge\.returnOrigin\) !== -1/);
    assert.match(outerSource, /target\.postMessage\([\s\S]*taskNodeBridge\.returnOrigin\)/);
    assert.doesNotMatch(outerSource, /target\.postMessage\([\s\S]{0,500},\s*['"]\*['"]\s*\)/);
});

test('Task Node bridge creates separate edit and view capabilities', () => {
    assert.match(source, /sessionStorage\.setItem\('PFDocs_taskNodeBridge'/);
    assert.match(source, /window\.location\.replace\('\/' \+ documentType \+ '\/\?tasknodeBootstrap='/);
    assert.match(outerSource, /Utils\.Hash\.parsePadUrl\(currentPad\.href\)/);
    assert.match(outerSource, /Utils\.Hash\.getViewHashFromKeys\(secret\)/);
    assert.match(outerSource, /channelHash: secret\.channel/);
    assert.match(outerSource, /EV_TASKNODE_PAD_INITIALIZED/);
    assert.match(frameworkSource, /EV_TASKNODE_PAD_INITIALIZED/);
    assert.match(outerSource, /pfdocs\.tasknode\.document-title/);
    assert.match(outerSource, /var publishTaskNodeTitle = function \(\) \{\};/);
    assert.doesNotMatch(outerSource, /var publishTaskNodeTitle = function \(title\)/);
    const titleHandler = outerSource.slice(outerSource.indexOf("sframeChan.on('Q_SET_PAD_TITLE_IN_DRIVE'"));
    assert.ok(
        titleHandler.indexOf('publishTaskNodeTitle(newTitle)') < titleHandler.indexOf('setPadTitle(data'),
        'Task Node title sync must not wait for an anonymous-drive callback'
    );
    assert.match(source, /targetMode/);
    assert.match(source, /action === 'open'/);
    assert.ok(
        outerSource.indexOf("sframeChan.on('EV_TASKNODE_PAD_INITIALIZED'") <
            outerSource.indexOf('var startRealtime = function'),
        'the Task Node capability handler must be registered before realtime startup'
    );
    const commonStartSource = outerSource.slice(outerSource.indexOf('common.start = function'));
    assert.ok(
        commonStartSource.indexOf("searchParams.get('tasknodeBootstrap')") <
            commonStartSource.indexOf('window.history.replaceState'),
        'the Task Node request id must be captured before editor URL canonicalization'
    );
    assert.ok(
        frameworkSource.indexOf("chainpad.onSettle") < frameworkSource.indexOf("onLocal();"),
        'the Task Node initialization listener must be attached before the first local edit'
    );
    assert.doesNotMatch(source + outerSource, /createRandomHash\('pad'\)/);
});

test('Task Node bridge creates and reopens spreadsheets without changing document behavior', () => {
    const onlyOfficeSource = fs.readFileSync(path.join(root, 'www/common/onlyoffice/inner.js'), 'utf8');
    const appConfigSource = fs.readFileSync(path.join(root, 'www/common/application_config_internal.js'), 'utf8');
    const flyDockerfile = fs.readFileSync(path.join(root, 'Dockerfile.fly'), 'utf8');
    assert.match(appConfigSource, /availablePadTypes = \['drive', 'pad', 'sheet'\]/);
    assert.match(flyDockerfile, /install-onlyoffice\.sh --accept-license --no-rdfind/);
    assert.match(source, /params\.get\('documentType'\) === 'sheet' \? 'sheet' : 'pad'/);
    assert.match(source, /'\/' \+ documentType \+ '\/\?tasknodeBootstrap='/);
    assert.match(source, /'\/' \+ documentType \+ '\/\?tasknodeSession='/);
    assert.match(source, /documentType: documentType/);
    assert.match(commonSource, /priv\.app === 'sheet' \? \{\} : \['BODY'/);
    assert.match(outerSource, /capabilityParsed\.type !== documentType/);
    assert.match(outerSource, /editHref: '\/' \+ documentType \+ '\/#' \+ editHash/);
    assert.match(outerSource, /viewHref: '\/' \+ documentType \+ '\/#' \+ viewHash/);
    assert.match(onlyOfficeSource, /privateData\.taskNodeBootstrap/);
    assert.match(onlyOfficeSource, /taskNodeCapabilityInitialized/);
    assert.match(onlyOfficeSource, /EV_TASKNODE_PAD_INITIALIZED/);
    assert.doesNotMatch(onlyOfficeSource, /taskNodeBootstrap[\s\S]{0,180}onSettle/);
});

test('configured Task Node origins are normalized to HTTP origins', () => {
    assert.match(env, /normalizeHttpOrigins/);
    assert.match(env, /PFDOCS_TASKNODE_ORIGINS/);
    assert.match(env, /return url\.origin/);
    assert.match(env, /enableEmbedding: config\.enableEmbedding === true/);
    assert.match(defaults, /frame-ancestors 'self' \$\{domain\} \$\{Env\.permittedEmbedders\}/);
});

test('Task Node document creation durably initializes the encrypted channel', () => {
    assert.match(commonSource, /priv\.taskNodeBootstrap/);
    assert.match(commonSource, /templateContent: priv\.app === 'sheet' \? \{\} : \['BODY', \{\}, \[\['P', \{\}, \[\]\]\]\]/);
    assert.match(commonSource, /funcs\.createPad\(c, waitFor\(\)\)/);
});

test('Task Node document context aligns titles and encrypted chat identity', () => {
    assert.match(outerSource, /tasknode\.pfdocs\.context/);
    assert.match(outerSource, /data\.documentOwned === true/);
    assert.match(commonSource, /data\.documentOwned === true && !privateData\.readOnly/);
    assert.match(commonSource, /if \(currentTitle\)/);
    assert.match(commonSource, /Q_SET_PAD_TITLE_IN_DRIVE/);
    assert.match(commonSource, /else if \(title && title !== current\.defaultTitle\)/);
    assert.match(commonSource, /ctx\.metadataMgr\.updateTitle\(title\)/);
    assert.match(outerSource, /Cryptpad\.setDisplayName\(displayName/);
    assert.match(toolbarSource, /tasknode:document-context/);
    assert.match(toolbarSource, /window\.CryptPad_taskNodeContext/);
    const chatSource = toolbarSource.slice(toolbarSource.indexOf('var createChat = function'));
    assert.match(chatSource, /Bar\.isEmbed && !window\.CryptPad_taskNodeContext/);
    assert.doesNotMatch(chatSource, /PadTypes\.isAvailable\('contacts'\)/);
    assert.doesNotMatch(messengerWorkerSource, /PadTypes\.isAvailable\('contacts'\)/);
    assert.match(messengerWorkerSource, /OPEN_PAD_CHAT/);
    assert.match(commonSource, /cp-tasknode-document/);
    assert.match(padStyleSource, /&\.cp-tasknode-document/);
    assert.match(messengerSource, /cp-tasknode-chat-' \+ assistantMessage\.persona/);
    assert.match(padStyleSource, /cp-tasknode-formatbar-overflow/);
    assert.match(padStyleSource, /cp-tasknode-editor-status/);
    assert.match(padStyleSource, /max-width:\s*1180px/);
    assert.match(messengerSource, /cp-tasknode-chat-collapse/);
    assert.match(messengerSource, /taskNodeAssistantMessage/);
    assert.match(messengerSource, /senderLabel = assistantMessage \? assistantMessage\.label : name/);
    assert.match(messengerSource, /tasknode-assistant-' \+ assistantMessage\.persona/);
    assert.match(messengerSource, /assistantMessage \? assistantMessage\.body : msg\.text/);
    assert.match(messengerSource, /Ask about this doc…/);
    assert.match(messengerSource, /Chat can read this document\. Billing is usage-based\./);
    assert.match(padStyleSource, /cp-tasknode-chat-assistant/);
    assert.match(padStyleSource, /\.cp-tasknode-chat-assistant\s*\{[\s\S]*\.cp-app-contacts-sender\s*\{[\s\S]*display:\s*block !important/);
    assert.doesNotMatch(padStyleSource, /background:\s*#f0fdf4/);
    assert.doesNotMatch(padStyleSource, /background:\s*#fffbeb/);
    assert.match(padStyleSource, /> p \+ p \{ margin-top: 8px !important/);
    assert.match(padStyleSource, /strong \{ font-weight: inherit; \}/);
    assert.match(padStyleSource, /\.cp-app-contacts-time \{ display: none !important; \}/);
    assert.match(padStyleSource, /\.cp-app-contacts-sender \{ display: none !important; \}/);
    assert.match(padStyleSource, /cp-tasknode-chat-composer/);
    assert.match(messengerSource, /var taskNodeAssistantStates = \{\}/);
    assert.match(messengerSource, /taskNodeAssistantStates\[id\]/);
    assert.match(messengerSource, /assistantState\.queue\.push/);
    assert.match(messengerSource, /assistantState\.statusNode = assistantStatus/);
    assert.match(messengerSource, /runNextAssistant/);
    assert.match(messengerSource, /mention queued/);
    assert.match(messengerSource, /getTaskNodeDocumentText/);
    assert.match(commonSource, /funcs\.getTaskNodeDocumentText = taskNodeDocumentText/);
    assert.match(commonSource, /typeof\(data && data\.documentContent\) === 'string'/);
    assert.doesNotMatch(messengerSource, /requestTaskNodeAssistant\) !== 'function' \|\| assistantState\.pending/);
    assert.match(messengerSource, /data-tasknode-assistant-state/);
    assert.match(padStyleSource, /cp-tasknode-chat-status/);
    assert.match(commonSource + padStyleSource, /cp-app-pad-comments/);
    assert.match(editorStyleSource, /max-width: 824px/);
});

test('Task Node editor chrome prioritizes controls and moves overflow without cloning actions', () => {
    const padSource = fs.readFileSync(path.join(root, 'www/pad/inner.js'), 'utf8');
    const ckeditorConfig = fs.readFileSync(path.join(root, 'customize.dist/ckeditor-config.js'), 'utf8');
    assert.ok(ckeditorConfig.indexOf('{"name":"basicstyles"') < ckeditorConfig.indexOf('{"name":"links"'));
    assert.match(padSource, /\$toolbox\.children\('\.cke_toolbar'\)\.detach\(\)/);
    assert.match(padSource, /\$toolbox\.css\('display', ''\)/);
    assert.match(padStyleSource, /display:\s*block !important/);
    assert.match(padSource, /primary\.scrollWidth > primary\.clientWidth \+ 1/);
    assert.doesNotMatch(padSource, /var available = \$row\.innerWidth/);
    assert.match(padSource, /\$overflow\.prepend\(visibleGroups\(\)\.last\(\)\)/);
    assert.match(padSource, /if \(\$row\.innerWidth\(\) < 100\)/);
    assert.match(padSource, /\$overflow\.find\('\.cke_button, \.cke_combo'\)/);
    assert.match(padSource, /new window\.ResizeObserver/);
    assert.match(padSource, /window\.setTimeout\(fitToolbar, 400\)/);
    assert.match(padStyleSource, /\.cke_toolgroup\s*\{[\s\S]*margin-bottom:\s*0/);
    assert.match(padStyleSource, /\.cke_combo\s*\{[\s\S]*margin-bottom:\s*0/);
    assert.match(padStyleSource, /padding:\s*12px 14px !important/);
    assert.match(padSource, /Version history/);
});

test('Task Node document chat contains narrow composers and unbroken message content', () => {
    assert.match(padStyleSource, /\.cp-toolbar-chat-drawer\s*\{[\s\S]*width:\s*340px;[\s\S]*overflow:\s*hidden;/);
    assert.match(padStyleSource, /#cp-app-contacts-container,[\s\S]*\.cp-app-contacts-chat\s*\{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/);
    assert.match(padStyleSource, /\.cp-app-contacts-input\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/);
    assert.match(padStyleSource, /\.cp-tasknode-chat-composer\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/);
    assert.match(padStyleSource, /textarea\s*\{[\s\S]*width:\s*0;[\s\S]*min-width:\s*0;[\s\S]*flex:\s*1 1 0;/);
    assert.match(padStyleSource, /overflow-wrap:\s*anywhere;/);
    assert.match(padStyleSource, /word-break:\s*break-word;/);
});

test('Task Node editor commands stay on the validated exact-channel bridge', () => {
    assert.match(outerSource, /tasknode\.pfdocs\.command/);
    assert.match(outerSource, /taskNodeContextAccepted/);
    assert.match(outerSource, /\['import-content', 'export', 'history', 'chat-toggle', 'set-title'\]/);
    assert.match(outerSource, /pfdocs\.tasknode\.import-result/);
    assert.match(commonSource, /EV_TASKNODE_COMMAND/);
    assert.match(commonSource, /metadataMgr\.updateTitle\(title\)/);
    assert.doesNotMatch(commonSource, /'import': '\.cp-toolbar-icon-import'/);
    assert.match(commonSource, /cp-toolbar-icon-history/);
    assert.match(frameworkSource, /command \|\| ''\) !== 'import-content'/);
    assert.match(frameworkSource, /UIElements\.importContent\('text\/plain', fileImporter/);
    assert.match(frameworkSource, /EV_TASKNODE_IMPORT_RESULT/);
});

test('Task Node pad skin remains compatible with the browser LESS compiler', () => {
    assert.doesNotMatch(padStyleSource, /\b(?:min|max|clamp)\(/);
    assert.match(padStyleSource, /max-width:\s*100%/);
});

test('@ODV and @coach use the current decrypted document through one exact-origin assistant bridge', () => {
    assert.match(commonSource, /funcs\.requestTaskNodeAssistant/);
    assert.match(commonSource, /funcs\.requestTaskNodeOdv/);
    assert.match(commonSource, /chainpad\.getUserDoc\(\)/);
    assert.match(outerSource, /Q_TASKNODE_ASSISTANT_REQUEST/);
    assert.match(outerSource, /Q_TASKNODE_ODV_REQUEST/);
    assert.match(outerSource, /pfdocs\.tasknode\.assistant-request/);
    assert.match(outerSource, /tasknode\.pfdocs\.assistant-response/);
    assert.match(messengerSource, /@\(ODV\|coach\)/);
    assert.match(messengerSource, /data\.isPadChat \|\| liveChannel\.isPadChat/);
    assert.match(messengerSource, /persona: 'coach'/);
    assert.match(messengerSource, /Trading Coach/);
    assert.match(messengerSource, /GLM 5\.2 via Ambient/);
});

test('Fly rollouts use a deployment-specific browser asset cache key', () => {
    assert.match(flyStart, /su-exec cryptpad node server\.js/);
    assert.doesNotMatch(flyStart, /npm run package/);
});

test('RequireJS cannot mutate the shared PFDocs API configuration', () => {
    assert.match(bootSource, /require\.config\(JSON\.parse\(JSON\.stringify\(Config\.requireConf\)\)\)/);
    assert.doesNotMatch(bootSource, /require\.config\(Config\.requireConf\)/);
});
