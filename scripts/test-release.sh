#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
revision=$(git rev-parse HEAD)
unique=$(mktemp -d)
name=bookstore-release-smoke-$(printf '%s' "${unique##*.}" | tr '[:upper:]' '[:lower:]')
rmdir "$unique"
image="$name:$revision"
network="$name"
fixture="$name-java"
ready="$name-ready"
empty="$name-empty"

cleanup() {
  if [[ $1 -ne 0 ]]; then
    for container in "$ready" "$empty" "$fixture"; do
      if docker inspect --type container "$container" >/dev/null 2>&1; then
        docker logs "$container" >&2 || true
      fi
    done
  fi
  docker rm -f "$ready" "$empty" "$fixture" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap 'cleanup $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker build --label "org.opencontainers.image.revision=$revision" -t "$image" .
[[ $(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image") == "$revision" ]]
docker image inspect --format 'Release revision {{ index .Config.Labels "org.opencontainers.image.revision" }}: {{.Id}}' "$image"

docker network create --internal "$network" >/dev/null
docker run -d --name "$fixture" --network "$network" --network-alias catalog \
  --entrypoint node "$image" --input-type=module --eval "$(cat test/support/release-java-fixture.mjs)" >/dev/null
docker run -d --name "$ready" --network "$network" --network-alias storefront \
  -e JAVA_CONTRACT=v1-catalog -e JAVA_CATALOG_BASE_URL=http://catalog:8081 \
  "$image" >/dev/null
docker run -d --name "$empty" --network "$network" --network-alias unconfigured \
  "$image" >/dev/null

docker exec "$ready" node --input-type=module -e '
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";
  const uid = Number(readFileSync("/proc/1/status", "utf8").match(/^Uid:\s+(\d+)/m)?.[1]);
  assert.ok(uid > 0, "expected a non-root server process");
  console.log("Release PID 1 UID:", uid);
'

docker run --rm -i --network "$network" --entrypoint node "$image" --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';

const ready = 'http://storefront:3000';
const empty = 'http://unconfigured:3000';
const get = (origin, path) => fetch(origin + path, { signal: AbortSignal.timeout(3_000) });

for (const origin of [ready, empty]) {
  let health;
  for (let attempt = 0; attempt < 30; attempt++) {
    health = await get(origin, '/api/health').catch(() => undefined);
    if (health?.status === 200) break;
    await wait(500);
  }
  assert.equal(health?.status, 200, origin + ' health');
  assert.deepEqual(await health.json(), { status: 'ok' });

  for (const locale of ['en', 'zh-CN']) {
    const home = await get(origin, '/' + locale);
    assert.equal(home.status, 200, origin + '/' + locale);
    const html = await home.text();
    assert.ok(html.includes('<html lang="' + locale + '"'));
    assert.ok(html.includes('href="/' + locale + '/books"'));
    const asset = html.match(/(?:href|src)="(\/_next\/static\/[^"]+\.(?:css|js))"/)?.[1];
    assert.ok(asset, 'missing asset in home HTML');
    const stylesOrScript = await get(origin, asset);
    assert.equal(stylesOrScript.status, 200, asset);
    assert.match(stylesOrScript.headers.get('content-type') ?? '',
      asset.endsWith('.css') ? /^text\/css\b/i : /^(?:application|text)\/javascript\b/i);
    assert.ok((await stylesOrScript.arrayBuffer()).byteLength > 0);
  }
}

const healthy = await get(ready, '/api/ready');
assert.equal(healthy.status, 200);
assert.deepEqual(await healthy.json(), { status: 'ready' });
const missing = await get(empty, '/api/ready');
assert.equal(missing.status, 503);
assert.deepEqual(await missing.json(), {
  status: 'unavailable',
  reason: 'CATALOG_NOT_CONFIGURED',
});
const catalog = await get(ready, '/api/v1/catalog/books');
assert.equal(catalog.status, 200);
assert.deepEqual(await catalog.json(), {
  page: 1,
  hasNext: false,
  books: [{
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Isolated release fixture',
    author: 'Fixture',
    category: 'Architecture',
    priceMinor: 4900,
    currency: 'CNY',
    stock: 5,
  }],
});
console.log('Release smoke passed: both homes and assets, health, readiness 200/503, fixture BFF.');
JS
