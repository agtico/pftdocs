// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([], function () {
    var preview = function (value, max) {
        var text = typeof(value) === 'string' ? value : '';
        text = text.replace(/\s+/g, ' ').trim();
        if (!text) { return ''; }
        max = max || 180;
        return text.length > max ? text.slice(0, max - 3) + '...' : text;
    };

    var textValue = function (value) {
        return typeof(value) === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
    };

    var meaningfulText = function (value) {
        var text = textValue(value);
        if (!text || text === '{}' || text === '[]' || text === 'null') { return ''; }
        return text;
    };

    var objectHasKeys = function (value) {
        return Boolean(value && typeof(value) === 'object' && Object.keys(value).length);
    };

    var pickText = function (obj, names) {
        if (!obj || typeof(obj) !== 'object') { return ''; }
        for (var i = 0; i < names.length; i++) {
            var text = meaningfulText(obj[names[i]]);
            if (text) { return text; }
        }
        return '';
    };

    var artifactText = function (entry) {
        var artifact = entry && entry.artifact && typeof(entry.artifact) === 'object' ?
            entry.artifact : (entry && typeof(entry) === 'object' ? entry : {});
        var direct = pickText(artifact, [
            'response',
            'response_text',
            'responseText',
            'codeSnippet',
            'code_snippet',
            'text',
            'content',
            'description',
            'url',
            'repoUrl',
            'repo_url'
        ]);
        var imageDescription;
        var fileName;
        var mimeType;
        if (direct) { return direct; }

        imageDescription = pickText(entry, [
            'image_description',
            'imageDescription'
        ]);
        if (imageDescription) { return imageDescription; }

        fileName = textValue(artifact.fileName || artifact.file_name);
        mimeType = textValue(artifact.mimeType || artifact.mime_type);
        return [fileName, mimeType].filter(Boolean).join(' ');
    };

    var readableText = function (payload, event) {
        if (typeof(payload) === 'string') { return meaningfulText(payload); }
        if (!payload || typeof(payload) !== 'object' || Array.isArray(payload)) { return ''; }
        var sections = [];
        var add = function (value) {
            var text = meaningfulText(value);
            if (text && sections.indexOf(text) === -1) {
                sections.push(text);
            }
        };

        add(pickText(payload, [
            'response_text',
            'responseText',
            'response',
            'reward_summary',
            'rewardSummary',
            'codeSnippet',
            'code_snippet',
            'image_description',
            'imageDescription',
            'text',
            'content',
            'description',
            'title'
        ]));
        add(artifactText(payload.artifact));
        (Array.isArray(payload.artifacts) ? payload.artifacts : []).forEach(function (entry) {
            add(artifactText(entry));
        });
        if (payload.reward_payload && typeof(payload.reward_payload) === 'object') {
            add(pickText(payload.reward_payload, [
                'summary',
                'reason',
                'response',
                'text',
                'description'
            ]));
        }
        if (!sections.length && event && event.plaintext) {
            add(event.plaintext);
        }
        return sections.join('\n\n');
    };

    var usefulText = function (event) {
        var text = readableText(event && event.payload, event);
        if (text) { return text; }
        if (event && typeof(event.plaintext) === 'string') {
            return meaningfulText(event.plaintext);
        }
        return '';
    };

    var displayText = function (event) {
        var text = usefulText(event);
        var payload;
        if (text) { return text; }
        payload = event && event.payload;
        if (!objectHasKeys(payload)) { return ''; }
        try {
            return JSON.stringify(payload, null, 2);
        } catch (err) {
            return '';
        }
    };

    var eventTime = function (event) {
        var summary = event && event.summary || {};
        var payload = event && event.payload || {};
        var value = event && event.createdAt || summary.createdAt ||
            payload.created_at || payload.createdAt || '';
        return Date.parse(value || '') || 0;
    };

    var formatDate = function (value, options) {
        var time = typeof(value) === 'number' ? value : Date.parse(value || '');
        if (!time) { return ''; }
        return new Date(time).toLocaleString(undefined, options || {});
    };

    var dateOnly = function (value) {
        return formatDate(value, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    var timeOnly = function (value) {
        return formatDate(value, {
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    var kindLabel = function (event) {
        var summary = event && event.summary || {};
        return summary.phase || event && event.kindLabel || 'TASK';
    };

    var middlePreview = function (value, head, tail) {
        var text = textValue(value).replace(/\n{3,}/g, '\n\n');
        var limitHead = head || 700;
        var limitTail = tail || 420;
        var omitted;
        if (!text || text.length <= limitHead + limitTail + 80) { return text; }
        omitted = text.length - limitHead - limitTail;
        return text.slice(0, limitHead).trim() +
            '\n\n[... ' + omitted.toLocaleString() + ' characters hidden ...]\n\n' +
            text.slice(text.length - limitTail).trim();
    };

    var payloadObject = function (event) {
        var payload = event && event.payload;
        return payload && typeof(payload) === 'object' && !Array.isArray(payload) ?
            payload : {};
    };

    var taskHistory = function (event) {
        var payload = payloadObject(event);
        var history = payload.task_history || payload.taskHistory;
        return history && typeof(history) === 'object' ? history : {};
    };

    var eventHasTaskPayload = function (event) {
        var history = taskHistory(event);
        return Boolean(history.task && typeof(history.task) === 'object');
    };

    var findHistoryEvent = function (history, type) {
        var events = Array.isArray(history.events) ? history.events : [];
        for (var i = 0; i < events.length; i++) {
            if (events[i] && events[i].event_type === type) { return events[i]; }
        }
        return null;
    };

    var stepText = function (step, index) {
        if (typeof(step) === 'string') { return textValue(step); }
        if (!step || typeof(step) !== 'object') { return ''; }
        return pickText(step, [
            'title',
            'text',
            'description',
            'instruction',
            'action',
            'details'
        ]) || ('Step ' + (index + 1));
    };

    var taskInfo = function (group) {
        var events = (group && group.events || []).slice();
        var info = {
            hasPayload: false
        };
        events.some(function (event) {
            var history = taskHistory(event);
            var task = history.task && typeof(history.task) === 'object' ? history.task : null;
            var accepted = findHistoryEvent(history, 'task_accepted');
            var generated = findHistoryEvent(history, 'task_generated');
            if (!task) { return false; }
            info = {
                id: task.id || group.taskId || '',
                title: textValue(task.title || task.user_title || task.name),
                description: textValue(task.description || task.task_details ||
                    task.details || task.user_description),
                alignment: textValue(task.tactics_alignment ||
                    task.network_value || task.alignment),
                verificationType: textValue(task.verification_type ||
                    task.verificationType),
                verificationCriteria: textValue(
                    task.verification_criteria && task.verification_criteria.criteria ||
                    task.verification_criteria || task.verificationCriteria
                ),
                estimate: task.reward_amount_estimate || task.reward_estimate || null,
                status: textValue(task.status),
                dueAt: task.deadline_at || task.due_at || '',
                acceptedAt: accepted && accepted.created_at || '',
                generatedAt: generated && generated.created_at || '',
                steps: Array.isArray(task.steps) ? task.steps : [],
                hasPayload: true
            };
            return true;
        });
        if (!info.id) { info.id = group && group.taskId || ''; }
        if (!info.title && info.id && !/^cid:/u.test(info.id)) { info.title = info.id; }
        if (!info.title) { info.title = 'Task event'; }
        return info;
    };

    var rewardInfo = function (event) {
        var payload = payloadObject(event);
        var rewardPayload = payload.reward_payload && typeof(payload.reward_payload) === 'object' ?
            payload.reward_payload : {};
        var amount = payload.reward_pft || payload.reward_amount_actual ||
            rewardPayload.reward_pft || '';
        return {
            amount: amount,
            tier: payload.reward_tier || rewardPayload.reward_tier || '',
            score: payload.reward_score || rewardPayload.total_points ||
                rewardPayload.score || '',
            summary: textValue(payload.reward_summary || rewardPayload.summary ||
                rewardPayload.feedback_to_user || event && event.summary && event.summary.preview),
            txHash: event && event.txHash || ''
        };
    };

    var eventHasRewardDetails = function (event) {
        var payload = payloadObject(event);
        var rewardPayload = payload.reward_payload && typeof(payload.reward_payload) === 'object' ?
            payload.reward_payload : {};
        if (kindLabel(event) !== 'REWARD') { return false; }
        return Boolean(eventHasTaskPayload(event) ||
            objectHasKeys(rewardPayload) ||
            payload.reward_pft || payload.reward_amount_actual ||
            payload.reward_summary || usefulText(event));
    };

    var rewardPillClass = function (tier) {
        var normalized = String(tier || '').toLowerCase();
        if (/exceptional|excellent|very_good|good/u.test(normalized)) { return '.pft-ok'; }
        if (/below|low|weak/u.test(normalized)) { return '.pft-warn'; }
        if (/fail|poor|bad/u.test(normalized)) { return '.pft-error'; }
        return '';
    };

    var formatPft = function (value) {
        var number = Number(value);
        if (Number.isFinite(number) && number >= 0 && value !== '' && value !== null) {
            return number.toLocaleString() + ' PFT';
        }
        return value ? String(value) + ' PFT' : 'No reward yet';
    };

    var sortedEvents = function (group) {
        return (group && group.events || []).slice().sort(function (a, b) {
            return eventTime(b) - eventTime(a);
        });
    };

    var primaryOutputEvent = function (events) {
        var submissions = events.filter(function (event) {
            return event && event.kindLabel === 'TASK_SUBMISSION';
        });
        var nonVerification = submissions.filter(function (event) {
            return kindLabel(event) !== 'verification_response';
        });
        return (nonVerification[0] || submissions[0] || null);
    };

    var groupHasTaskPayload = function (group) {
        return sortedEvents(group).some(eventHasTaskPayload);
    };

    var groupHasRewardDetails = function (group) {
        return sortedEvents(group).some(eventHasRewardDetails);
    };

    var groupHasUsefulOutput = function (group) {
        var outputEvent = primaryOutputEvent(sortedEvents(group));
        return Boolean(outputEvent && usefulText(outputEvent));
    };

    var groupIsTimelineUseful = function (group) {
        return groupHasTaskPayload(group) ||
            groupHasRewardDetails(group) ||
            groupHasUsefulOutput(group);
    };

    var compactChatText = function (value) {
        return String(value || '')
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
    };

    var truncateChatText = function (value, limit) {
        var text = compactChatText(value);
        var omitted;
        if (!limit || text.length <= limit) { return text; }
        omitted = text.length - limit;
        return text.slice(0, limit).trim() +
            '\n\n[... ' + omitted.toLocaleString() + ' characters truncated ...]';
    };

    var buildTaskGroupChatBlock = function (group, opts) {
        opts = opts || {};
        var events = sortedEvents(group);
        var rewardEvent = events.find(function (event) {
            return eventHasRewardDetails(event);
        });
        var outputEvent = primaryOutputEvent(events);
        var latest = events[0] || group.latest || {};
        var task = taskInfo(group);
        var reward = rewardEvent ? rewardInfo(rewardEvent) : null;
        var outputText = outputEvent ? usefulText(outputEvent) : '';
        var parts = [
            '- ' + (eventTime(latest) ?
                formatDate(eventTime(latest)) : 'Unknown'),
            '  Task: ' + (task.title || task.id || 'Task event')
        ];
        if (task.description) {
            parts.push('  Details: ' + truncateChatText(task.description,
                opts.detailLimit || 900)
                .replace(/\n/g, '\n  '));
        }
        if (outputText) {
            parts.push('  Output: ' + truncateChatText(outputText,
                opts.outputLimit || 900)
                .replace(/\n/g, '\n  '));
        }
        if (reward) {
            parts.push('  Reward: ' + formatPft(reward.amount));
            if (reward.summary) {
                parts.push('  Reward notes: ' + truncateChatText(reward.summary,
                    opts.rewardLimit || 700)
                    .replace(/\n/g, '\n  '));
            }
        }
        if (task.id && opts.includeTaskId !== false) { parts.push('  Task ID: ' + task.id); }
        return parts.join('\n');
    };

    return {
        artifactText: artifactText,
        buildTaskGroupChatBlock: buildTaskGroupChatBlock,
        dateOnly: dateOnly,
        displayText: displayText,
        eventHasRewardDetails: eventHasRewardDetails,
        eventHasTaskPayload: eventHasTaskPayload,
        eventTime: eventTime,
        formatDate: formatDate,
        formatPft: formatPft,
        groupIsTimelineUseful: groupIsTimelineUseful,
        kindLabel: kindLabel,
        meaningfulText: meaningfulText,
        middlePreview: middlePreview,
        objectHasKeys: objectHasKeys,
        pickText: pickText,
        preview: preview,
        primaryOutputEvent: primaryOutputEvent,
        readableText: readableText,
        rewardInfo: rewardInfo,
        rewardPillClass: rewardPillClass,
        sortedEvents: sortedEvents,
        stepText: stepText,
        taskInfo: taskInfo,
        textValue: textValue,
        timeOnly: timeOnly,
        usefulText: usefulText
    };
});
