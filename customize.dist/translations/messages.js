// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * You can override the translation text using this file.
 * The recommended method is to make a copy of this file (/customize.dist/translations/messages.{LANG}.js)
   in a 'customize' directory (/customize/translations/messages.{LANG}.js).
 * If you want to check all the existing translation keys, you can open the internal language file
   but you should not change it directly (/common/translations/messages.{LANG}.js)
*/
define(['/common/translations/messages.js'], function (Messages) {
    var rebrandText = function (value) {
        if (typeof(value) !== 'string') { return value; }
        return value
            .replace(/\bCryptDrives\b/g, 'Documents')
            .replace(/\bCryptDrive\b/g, 'Documents')
            .replace(/\bCryptPad\b/g, 'PFT Docs')
            .replace(/\bcryptpad\.org\b/g, 'postfiat.org')
            .replace(/I love PFT Docs/g, 'I understand');
    };

    var rebrandObject = function (obj) {
        if (!obj || typeof(obj) !== 'object') { return; }
        Object.keys(obj).forEach(function (key) {
            if (typeof(obj[key]) === 'string') {
                obj[key] = rebrandText(obj[key]);
                return;
            }
            rebrandObject(obj[key]);
        });
    };

    rebrandObject(Messages);

    Messages.main_title = 'PFT Docs';
    if (Messages.type) { Messages.type.drive = 'Documents'; }
    Messages.header_logoTitle = 'Go to your documents';
    Messages.header_homeTitle = 'Go to PFT Docs';
    Messages.label_logo = 'PFT Docs logo';
    Messages.og_default = 'PFT Docs: end-to-end encrypted collaboration';

    return Messages;
});
