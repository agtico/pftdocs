// SPDX-License-Identifier: AGPL-3.0-or-later
const config = require('../config/config.example');

config.httpUnsafeOrigin = '__PFDOCS_MAIN_ORIGIN__';
config.httpSafeOrigin = '__PFDOCS_SANDBOX_ORIGIN__';
config.httpAddress = '127.0.0.1';
config.httpPort = 3000;
config.websocketPort = 3003;
config.maxWorkers = 2;
config.logToStdout = true;
config.logIP = false;
config.enableEmbedding = true;
config.permittedEmbedders = '__PFDOCS_TASKNODE_EMBEDDER__';

config.inactiveTime = 180;
config.archiveRetentionTime = 30;
config.maxUploadSize = 20 * 1024 * 1024;
config.defaultStorageLimit = 50 * 1024 * 1024;

config.filePath = '__PFDOCS_DATA_ROOT__/datastore';
config.archivePath = '__PFDOCS_DATA_ROOT__/archive';
config.pinPath = '__PFDOCS_DATA_ROOT__/pins';
config.taskPath = '__PFDOCS_DATA_ROOT__/tasks';
config.blockPath = '__PFDOCS_DATA_ROOT__/block';
config.blobPath = '__PFDOCS_DATA_ROOT__/blob';
config.blobStagingPath = '__PFDOCS_DATA_ROOT__/blobstage';
config.decreePath = '__PFDOCS_DATA_ROOT__/decrees';
config.logPath = '__PFDOCS_DATA_ROOT__/logs';

config.postFiat = config.postFiat || {};
config.postFiat.walletFirst = true;
config.postFiat.disableLegacyLogin = true;
config.postFiat.taskNodeOrigins = [];

module.exports = config;
