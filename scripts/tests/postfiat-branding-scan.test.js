// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require('node:assert/strict');
const test = require('node:test');

const brandingScan = require('../postfiat-branding-scan');

test('Post Fiat product-facing branding scan has no blocked visible terms', () => {
    const violations = brandingScan.run(['node', 'postfiat-branding-scan']);

    assert.deepEqual(violations, []);
});
