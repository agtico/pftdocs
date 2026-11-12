// Test-only configuration. Run from an isolated PFDocs checkout.
const config = require('../../../config/config.example.js');
config.httpUnsafeOrigin = 'http://localhost:3190';
config.httpAddress = '127.0.0.1';
config.httpPort = 3190;
// Leave httpSafePort unset: this revision derives port 3191 automatically.
config.websocketPort = 3193;
config.maxWorkers = 2;
config.logToStdout = false;
config.logIP = false;
config.adminEmail = false;
// Public test key only. Prevents printing a first-admin setup capability.
config.adminKeys = [Buffer.alloc(32, 7).toString('base64')];
config.enableEmbedding = true;
config.permittedEmbedders = 'http://localhost:3191 http://localhost:3195';
config.postFiat.taskNodeOrigins = ['http://localhost:3195'];
module.exports = config;
