// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([
    '/app/postfiat/tasknode-format.js',
], function (TaskNodeFormat) {
    var CHAT_CONTEXT_PACK_VERSION = 1;
    var CHAT_CONTEXT_RAW_RECENT_DAYS = 14;
    var CHAT_CONTEXT_RAW_RECENT_LIMIT = 14;
    var CHAT_CONTEXT_HISTORICAL_HIGHLIGHT_LIMIT = 44;
    var CHAT_CONTEXT_RELEVANT_OLD_LIMIT = 4;

    var truncateText = function (value, limit) {
        var text = String(value || '');
        limit = limit || 12000;
        return text.length > limit ? text.slice(0, limit - 3) + '...' : text;
    };

    var getTruncator = function (opts) {
        return opts && opts.truncateText || truncateText;
    };

    var buildTaskGroupChatBlock = function (group, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var events = TaskNodeFormat.sortedEvents(group);
        var rewardEvent = events.find(function (event) {
            return TaskNodeFormat.eventHasRewardDetails(event);
        });
        var outputEvent = TaskNodeFormat.primaryOutputEvent(events);
        var latest = events[0] || group.latest || {};
        var task = TaskNodeFormat.taskInfo(group);
        var reward = rewardEvent ? TaskNodeFormat.rewardInfo(rewardEvent) : null;
        var outputText = outputEvent ? TaskNodeFormat.usefulText(outputEvent) : '';
        var parts = [
            '- ' + (TaskNodeFormat.eventTime(latest) ?
                TaskNodeFormat.formatDate(TaskNodeFormat.eventTime(latest)) : 'Unknown'),
            '  Task: ' + (task.title || task.id || 'Task event')
        ];
        if (task.description) {
            parts.push('  Details: ' + truncate(task.description,
                opts.detailLimit || 900)
                .replace(/\n/g, '\n  '));
        }
        if (outputText) {
            parts.push('  Output: ' + truncate(outputText,
                opts.outputLimit || 900)
                .replace(/\n/g, '\n  '));
        }
        if (reward) {
            parts.push('  Reward: ' + TaskNodeFormat.formatPft(reward.amount));
            if (reward.summary) {
                parts.push('  Reward notes: ' + truncate(reward.summary,
                    opts.rewardLimit || 700)
                    .replace(/\n/g, '\n  '));
            }
        }
        if (task.id && opts.includeTaskId !== false) { parts.push('  Task ID: ' + task.id); }
        return parts.join('\n');
    };

    var buildContextDocChatSection = function (data, opts) {
        var latest = data && data.latestContext || {};
        if (!latest.text) { return ''; }
        return '## Context Doc\n' + getTruncator(opts)(latest.text, 14000);
    };

    var taskContextGroupTime = function (group) {
        return TaskNodeFormat.eventTime(
            (TaskNodeFormat.sortedEvents(group)[0] || group.latest || {})
        );
    };

    var sortedUsefulTaskGroups = function (data) {
        var groups = Array.isArray(data && data.tasks) ? data.tasks.slice() : [];
        return groups.filter(TaskNodeFormat.groupIsTimelineUseful).sort(function (a, b) {
            return taskContextGroupTime(b) - taskContextGroupTime(a);
        });
    };

    var buildTaskContextSignature = function (data, opts) {
        opts = opts || {};
        var events = Array.isArray(data && data.taskEvents) ? data.taskEvents.slice() : [];
        var latestContext = data && data.latestContext || {};
        events.sort(function (a, b) {
            return TaskNodeFormat.eventTime(b) - TaskNodeFormat.eventTime(a);
        });
        return [
            CHAT_CONTEXT_PACK_VERSION,
            data && data.walletAddress || opts.walletAddress || '',
            data && data.pointerCount || '',
            data && data.taskEventCount || events.length,
            data && data.contextUpdateCount || '',
            latestContext.cid || '',
            latestContext.txHash || '',
            latestContext.createdAt || '',
            events.slice(0, 48).map(function (event) {
                return [
                    event.cid || '',
                    event.txHash || event.eventId || '',
                    event.taskId || '',
                    event.kindLabel || '',
                    event.createdAt || ''
                ].join(':');
            }).join('|')
        ].join('::');
    };

    var partitionTaskGroupsForChatContext = function (groups, opts) {
        opts = opts || {};
        var now = Number(opts.now) || Date.now();
        var recentDays = opts.recentDays || CHAT_CONTEXT_RAW_RECENT_DAYS;
        var recentLimit = opts.recentLimit || CHAT_CONTEXT_RAW_RECENT_LIMIT;
        var cutoffMs = now - recentDays * 24 * 60 * 60 * 1000;
        var recent = [];
        var historical = [];
        (groups || []).forEach(function (group, index) {
            var time = taskContextGroupTime(group);
            if (recent.length < recentLimit &&
                    (index < recentLimit || time >= cutoffMs)) {
                recent.push(group);
                return;
            }
            historical.push(group);
        });
        return {
            cutoffMs: cutoffMs,
            recent: recent,
            historical: historical
        };
    };

    var inferTaskContextWorkstream = function (text) {
        var lower = String(text || '').toLowerCase();
        if (/task node|verification|evidence|task generation|alignment score|sybil/u.test(lower)) {
            return 'Task Node / verification';
        }
        if (/trading|autocorr|autocorrelation|ibkr|equities|backtest|strategy|fills|cost model/u.test(lower)) {
            return 'Trading validation';
        }
        if (/pftdocs|docs|tor|wallet|nostr|runpod|openrouter|ambient|qwen|chat/u.test(lower)) {
            return 'PFT Docs / AI infrastructure';
        }
        if (/l1|validator|runbook|chain|pftl|rpc|ipfs|cid/u.test(lower)) {
            return 'PFT network infrastructure';
        }
        if (/telegram|discord|reddit|x account|twitter|social|distribution/u.test(lower)) {
            return 'Distribution / community';
        }
        return 'Other';
    };

    var summarizeTaskGroupForContextPack = function (group) {
        var events = TaskNodeFormat.sortedEvents(group);
        var latest = events[0] || group.latest || {};
        var rewardEvent = events.find(function (event) {
            return TaskNodeFormat.eventHasRewardDetails(event);
        });
        var outputEvent = TaskNodeFormat.primaryOutputEvent(events);
        var task = TaskNodeFormat.taskInfo(group);
        var reward = rewardEvent ? TaskNodeFormat.rewardInfo(rewardEvent) : null;
        var outputText = outputEvent ? TaskNodeFormat.usefulText(outputEvent) : '';
        var time = TaskNodeFormat.eventTime(latest);
        var text = [
            task.title,
            task.description,
            task.alignment,
            outputText,
            reward && reward.summary
        ].filter(Boolean).join('\n');
        return {
            taskId: task.id || group.taskId || '',
            title: task.title || task.id || group.taskId || 'Task event',
            date: time ? TaskNodeFormat.dateOnly(time) : 'Unknown',
            time: time,
            workstream: inferTaskContextWorkstream(text),
            detail: TaskNodeFormat.preview(task.description || task.alignment, 180),
            output: TaskNodeFormat.preview(outputText, 180),
            rewardAmount: reward && reward.amount || '',
            rewardSummary: reward && TaskNodeFormat.preview(reward.summary, 160) || '',
            hasReward: Boolean(reward && (reward.amount || reward.summary))
        };
    };

    var buildHistoricalTaskSummaryText = function (historicalGroups, opts) {
        opts = opts || {};
        var highlightLimit = opts.historicalHighlightLimit ||
            CHAT_CONTEXT_HISTORICAL_HIGHLIGHT_LIMIT;
        var records = (historicalGroups || []).map(summarizeTaskGroupForContextPack);
        var workstreams = {};
        var rewardCount = 0;
        var rewardTotal = 0;
        var openLoops = [];
        var highlights;
        var parts;
        records.forEach(function (record) {
            var amount = Number(String(record.rewardAmount || '').replace(/,/g, ''));
            workstreams[record.workstream] = workstreams[record.workstream] || {
                count: 0,
                examples: []
            };
            workstreams[record.workstream].count += 1;
            if (record.title && workstreams[record.workstream].examples.length < 3) {
                workstreams[record.workstream].examples.push(record.title);
            }
            if (record.hasReward) { rewardCount += 1; }
            if (Number.isFinite(amount) && amount > 0) { rewardTotal += amount; }
            if (!record.hasReward && openLoops.length < 8) { openLoops.push(record.title); }
        });
        highlights = records.slice(0, highlightLimit);
        parts = [
            '### Historical Task Cache',
            'Compressed ' + records.length + ' older task group(s). Recent task groups are kept in detail below.'
        ];
        if (records.length) {
            parts.push('Range: ' + records[records.length - 1].date + ' to ' + records[0].date + '.');
        }
        parts.push('Major workstreams:');
        Object.keys(workstreams).sort(function (a, b) {
            return workstreams[b].count - workstreams[a].count;
        }).forEach(function (name) {
            parts.push('- ' + name + ': ' + workstreams[name].count + ' task group(s)' +
                (workstreams[name].examples.length ?
                    ' - examples: ' + workstreams[name].examples.join('; ') : ''));
        });
        if (rewardCount) {
            parts.push('Rewards/completions: ' + rewardCount + ' older group(s) had reward details' +
                (rewardTotal ? '; visible total about ' + TaskNodeFormat.formatPft(rewardTotal) : '') + '.');
        }
        if (openLoops.length) {
            parts.push('Open/less-resolved older loops: ' + openLoops.join('; ') + '.');
        }
        if (highlights.length) {
            parts.push('Dated highlights:');
            highlights.forEach(function (record) {
                var line = '- ' + record.date + ': [' + record.workstream + '] ' + record.title;
                if (record.rewardAmount) {
                    line += ' - reward ' + TaskNodeFormat.formatPft(record.rewardAmount);
                }
                if (record.output) { line += ' - output: ' + record.output; }
                else if (record.detail) { line += ' - detail: ' + record.detail; }
                if (record.rewardSummary) { line += ' - reward notes: ' + record.rewardSummary; }
                parts.push(line);
            });
        }
        return parts.join('\n');
    };

    var buildRecentTaskDetailText = function (recentGroups, opts) {
        opts = opts || {};
        if (!recentGroups || !recentGroups.length) { return ''; }
        return '### Recent Task Detail\n' + recentGroups.map(function (group) {
            return buildTaskGroupChatBlock(group, {
                detailLimit: 420,
                outputLimit: 520,
                rewardLimit: 260,
                truncateText: opts.truncateText
            });
        }).join('\n\n');
    };

    var buildChatTaskContextPack = function (data, opts) {
        opts = opts || {};
        var groups = sortedUsefulTaskGroups(data);
        var partition = partitionTaskGroupsForChatContext(groups, opts);
        var historicalText = partition.historical.length ?
            buildHistoricalTaskSummaryText(partition.historical, opts) : '';
        var recentText = buildRecentTaskDetailText(partition.recent, opts);
        if (!groups.length) { return null; }
        return {
            version: CHAT_CONTEXT_PACK_VERSION,
            walletAddress: data && data.walletAddress || opts.walletAddress || '',
            signature: buildTaskContextSignature(data, opts),
            createdAt: Number(opts.now) || Date.now(),
            cutoffMs: partition.cutoffMs,
            recentCount: partition.recent.length,
            historicalCount: partition.historical.length,
            historicalText: historicalText,
            recentText: recentText
        };
    };

    var extractChatQueryTerms = function (value) {
        var stop = {
            about: true,
            after: true,
            again: true,
            also: true,
            because: true,
            before: true,
            have: true,
            just: true,
            like: true,
            need: true,
            should: true,
            that: true,
            this: true,
            what: true,
            when: true,
            where: true,
            with: true,
            your: true
        };
        var seen = {};
        return (String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}/gu) || [])
            .filter(function (term) {
                if (stop[term] || seen[term]) { return false; }
                seen[term] = true;
                return true;
            }).slice(0, 12);
    };

    var taskGroupSearchText = function (group) {
        var events = TaskNodeFormat.sortedEvents(group);
        var task = TaskNodeFormat.taskInfo(group);
        var outputEvent = TaskNodeFormat.primaryOutputEvent(events);
        var rewardEvent = events.find(function (event) {
            return TaskNodeFormat.eventHasRewardDetails(event);
        });
        var reward = rewardEvent ? TaskNodeFormat.rewardInfo(rewardEvent) : null;
        return [
            task.title,
            task.description,
            task.alignment,
            outputEvent && TaskNodeFormat.usefulText(outputEvent),
            reward && reward.summary
        ].filter(Boolean).join('\n').toLowerCase();
    };

    var buildRelevantHistoricalTaskDetails = function (data, userText, opts) {
        opts = opts || {};
        var terms = extractChatQueryTerms(userText);
        var groups;
        var partition;
        var scored;
        if (!terms.length) { return ''; }
        groups = sortedUsefulTaskGroups(data);
        partition = partitionTaskGroupsForChatContext(groups, opts);
        scored = partition.historical.map(function (group) {
            var haystack = taskGroupSearchText(group);
            var score = 0;
            terms.forEach(function (term) {
                if (haystack.indexOf(term) !== -1) { score += 1; }
            });
            return { group: group, score: score };
        }).filter(function (entry) {
            return entry.score > 0;
        }).sort(function (a, b) {
            return b.score - a.score || taskContextGroupTime(b.group) - taskContextGroupTime(a.group);
        }).slice(0, opts.relevantOldLimit || CHAT_CONTEXT_RELEVANT_OLD_LIMIT);
        if (!scored.length) { return ''; }
        return '### Relevant Older Task Detail\n' + scored.map(function (entry) {
            return buildTaskGroupChatBlock(entry.group, {
                detailLimit: 380,
                outputLimit: 460,
                rewardLimit: 220,
                truncateText: opts.truncateText
            });
        }).join('\n\n');
    };

    var buildFallbackTasksChatSection = function (data, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var groups = Array.isArray(data && data.tasks) ? data.tasks.slice() : [];
        var events = Array.isArray(data && data.taskEvents) ? data.taskEvents.slice() : [];
        var lines = [];
        groups.sort(function (a, b) {
            return TaskNodeFormat.eventTime((TaskNodeFormat.sortedEvents(b)[0] || b.latest || {})) -
                TaskNodeFormat.eventTime((TaskNodeFormat.sortedEvents(a)[0] || a.latest || {}));
        }).some(function (group) {
            if (!TaskNodeFormat.groupIsTimelineUseful(group)) { return false; }
            lines.push(buildTaskGroupChatBlock(group, opts));
            return lines.length >= 18;
        });
        if (lines.length) {
            return '## Task Node Tasks\n' + lines.join('\n\n');
        }
        events.sort(function (a, b) {
            return TaskNodeFormat.eventTime(b) - TaskNodeFormat.eventTime(a);
        }).some(function (event) {
            var text = TaskNodeFormat.displayText(event);
            if (!text) { return false; }
            lines.push([
                '- ' + (event.createdAt ? TaskNodeFormat.formatDate(event.createdAt) : 'Unknown'),
                '  Kind: ' + TaskNodeFormat.kindLabel(event),
                event.cid ? '  CID: ' + event.cid : '',
                '  Text: ' + truncate(text, 1200).replace(/\n/g, '\n  ')
            ].filter(Boolean).join('\n'));
            return lines.length >= 24;
        });
        if (!lines.length) { return ''; }
        return '## Task Node Tasks\n' + lines.join('\n\n');
    };

    var buildTasksChatSection = function (data, userText, pack, opts) {
        opts = opts || {};
        var truncate = getTruncator(opts);
        var relevant = buildRelevantHistoricalTaskDetails(data, userText, opts);
        var parts;
        if (!pack) { return buildFallbackTasksChatSection(data, opts); }
        parts = [
            '## Task Node Tasks',
            pack.historicalText,
            pack.recentText,
            relevant,
            'Context pack: ' + pack.recentCount + ' recent detailed group(s), ' +
                pack.historicalCount + ' older summarized group(s). Built ' +
                TaskNodeFormat.formatDate(pack.createdAt) + '.'
        ].filter(Boolean);
        return truncate(parts.join('\n\n'), 26000);
    };

    return {
        CHAT_CONTEXT_HISTORICAL_HIGHLIGHT_LIMIT: CHAT_CONTEXT_HISTORICAL_HIGHLIGHT_LIMIT,
        CHAT_CONTEXT_PACK_VERSION: CHAT_CONTEXT_PACK_VERSION,
        CHAT_CONTEXT_RAW_RECENT_DAYS: CHAT_CONTEXT_RAW_RECENT_DAYS,
        CHAT_CONTEXT_RAW_RECENT_LIMIT: CHAT_CONTEXT_RAW_RECENT_LIMIT,
        CHAT_CONTEXT_RELEVANT_OLD_LIMIT: CHAT_CONTEXT_RELEVANT_OLD_LIMIT,
        buildChatTaskContextPack: buildChatTaskContextPack,
        buildContextDocChatSection: buildContextDocChatSection,
        buildFallbackTasksChatSection: buildFallbackTasksChatSection,
        buildHistoricalTaskSummaryText: buildHistoricalTaskSummaryText,
        buildRecentTaskDetailText: buildRecentTaskDetailText,
        buildRelevantHistoricalTaskDetails: buildRelevantHistoricalTaskDetails,
        buildTaskContextSignature: buildTaskContextSignature,
        buildTaskGroupChatBlock: buildTaskGroupChatBlock,
        buildTasksChatSection: buildTasksChatSection,
        extractChatQueryTerms: extractChatQueryTerms,
        inferTaskContextWorkstream: inferTaskContextWorkstream,
        partitionTaskGroupsForChatContext: partitionTaskGroupsForChatContext,
        sortedUsefulTaskGroups: sortedUsefulTaskGroups,
        summarizeTaskGroupForContextPack: summarizeTaskGroupForContextPack,
        taskContextGroupTime: taskContextGroupTime
    };
});
