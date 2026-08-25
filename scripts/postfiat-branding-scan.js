#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_TARGETS = [
    'www/app',
    'www/login',
    'www/register',
    'www/recovery',
    'customize.dist/pages',
    'customize.dist/translations/messages.js',
    'customize.dist/loading.js',
    'customize.dist/pre-loading.js',
];

const BLOCKED_PATTERNS = [
    { id: 'cryptpad-product-name', re: /\bCryptPad\b/g },
    { id: 'cryptdrive-product-name', re: /\bCryptDrive\b/g },
    { id: 'legacy-cryptpad-view', re: /\bLegacy CryptPad view\b/g },
    { id: 'cryptpad-fr', re: /\bcryptpad\.fr\b/g },
    { id: 'cryptpad-org', re: /\bcryptpad\.org\b/g },
];

const BINARY_OR_GENERATED_RE = /\.(?:br|gz|png|jpg|jpeg|gif|ico|woff|woff2|svg|map)$/u;

const INTERNAL_LINE_ALLOWLIST = [
    /SPDX-FileCopyrightText/u,
    /cryptpad-common\.js/u,
    /window\.CryptPad_/u,
    /CryptPad_[A-Za-z0-9_]+/u,
    /localStorage\.CryptPad_/u,
    /postfiat:\/\/cryptpad/u,
    /deriveCryptPadEntropy/u,
    /@cryptpad_[A-Za-z0-9_]+/u,
    /github:cryptpad\//u,
    /github\.com\/cryptpad\/cryptpad/u,
    /\.replace\([^)]*\\bCryptPad\\b/u,
];

const shouldScanFile = (filePath) => {
    if (BINARY_OR_GENERATED_RE.test(filePath)) { return false; }
    if (path.basename(filePath) === 'postfiat-login-bundle.js') { return false; }
    if (/node_modules|\.git/u.test(filePath)) { return false; }
    return true;
};

const walk = (entryPath, files) => {
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
        fs.readdirSync(entryPath).sort().forEach((child) => {
            walk(path.join(entryPath, child), files);
        });
        return files;
    }
    if (stat.isFile() && shouldScanFile(entryPath)) {
        files.push(entryPath);
    }
    return files;
};

const getTargets = (argv) => {
    const values = argv.slice(2).filter((arg) => arg !== '--json');
    return values.length ? values : DEFAULT_TARGETS;
};

const isAllowedLine = (line) => INTERNAL_LINE_ALLOWLIST.some((re) => re.test(line));

const scanFile = (filePath) => {
    const rel = path.relative(repoRoot, filePath);
    const text = fs.readFileSync(filePath, 'utf8');
    const results = [];
    text.split(/\r?\n/u).forEach((line, index) => {
        if (isAllowedLine(line)) { return; }
        BLOCKED_PATTERNS.forEach((pattern) => {
            pattern.re.lastIndex = 0;
            let match;
            while ((match = pattern.re.exec(line))) {
                results.push({
                    file: rel,
                    line: index + 1,
                    column: match.index + 1,
                    rule: pattern.id,
                    text: match[0],
                });
            }
        });
    });
    return results;
};

const run = (argv = process.argv) => {
    const targets = getTargets(argv);
    const files = [];
    targets.forEach((target) => {
        const fullPath = path.resolve(repoRoot, target);
        if (!fs.existsSync(fullPath)) { return; }
        walk(fullPath, files);
    });

    const violations = files.flatMap(scanFile);
    if (argv.includes('--json')) {
        process.stdout.write(JSON.stringify({ violations }, null, 2) + '\n');
    } else if (violations.length) {
        violations.forEach((violation) => {
            process.stderr.write(
                `${violation.file}:${violation.line}:${violation.column} ` +
                `${violation.rule} ${violation.text}\n`
            );
        });
    }
    return violations;
};

if (require.main === module) {
    const violations = run();
    if (violations.length) { process.exit(1); }
}

module.exports = {
    BLOCKED_PATTERNS,
    DEFAULT_TARGETS,
    run,
};
