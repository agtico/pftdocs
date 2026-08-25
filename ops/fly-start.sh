#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
set -eu

: "${PFDOCS_MAIN_ORIGIN:?PFDOCS_MAIN_ORIGIN is required}"
: "${PFDOCS_SANDBOX_ORIGIN:?PFDOCS_SANDBOX_ORIGIN is required}"
: "${PFDOCS_TASKNODE_ORIGINS:?PFDOCS_TASKNODE_ORIGINS is required}"

data_root="${PFDOCS_DATA_ROOT:-/data}"
mkdir -p \
    "${data_root}/archive" \
    "${data_root}/blob" \
    "${data_root}/blobstage" \
    "${data_root}/block" \
    "${data_root}/datastore" \
    "${data_root}/decrees" \
    "${data_root}/logs" \
    "${data_root}/pins" \
    "${data_root}/tasks"
chown -R cryptpad:cryptpad "${data_root}"

sed \
    -e "s|__PFDOCS_MAIN_ORIGIN__|${PFDOCS_MAIN_ORIGIN}|g" \
    -e "s|__PFDOCS_SANDBOX_ORIGIN__|${PFDOCS_SANDBOX_ORIGIN}|g" \
    -e "s|__PFDOCS_TASKNODE_EMBEDDER__|${PFDOCS_TASKNODE_ORIGINS%%,*}|g" \
    -e "s|__PFDOCS_DATA_ROOT__|${data_root}|g" \
    /cryptpad/ops/fly-config.template.js > /cryptpad/config/config.js
chown cryptpad:cryptpad /cryptpad/config/config.js

caddy run --config /cryptpad/ops/fly-main.Caddyfile --adapter caddyfile &
caddy_pid=$!

cleanup() {
    kill "${caddy_pid}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Keep precompressed production assets, but use CryptPad's FRESH cache mode so
# every Fly machine rollout advertises a unique RequireJS/localStorage cache key.
# PACKAGE mode pins the key to package.json and can leave clients executing an
# older deployment indefinitely when the application version is unchanged.
su-exec cryptpad node server.js
