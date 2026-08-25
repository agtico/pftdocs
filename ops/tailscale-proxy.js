#!/usr/bin/env node
// PFDocs Tailscale proxy: forwards the Tailscale interface to the local
// CryptPad listener. TCP-level pipe, so HTTP and websockets both pass
// through untouched. Binds ONLY to the Tailscale IP - never public.
'use strict';
const net = require('net');

const TS_ADDR = process.env.PFDOCS_TS_ADDR || '100.85.116.26';
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 3200;
const PORTS = [8091, 8092]; // main origin, sandbox origin

for (const port of PORTS) {
    const server = net.createServer((client) => {
        const upstream = net.connect(BACKEND_PORT, BACKEND_HOST);
        client.pipe(upstream);
        upstream.pipe(client);
        const kill = () => { client.destroy(); upstream.destroy(); };
        client.on('error', kill);
        upstream.on('error', kill);
    });
    server.on('error', (err) => {
        console.error(`listener ${TS_ADDR}:${port} failed: ${err.message}`);
        process.exit(1);
    });
    server.listen(port, TS_ADDR, () => {
        console.log(`pfdocs tailscale proxy: ${TS_ADDR}:${port} -> ${BACKEND_HOST}:${BACKEND_PORT}`);
    });
}
