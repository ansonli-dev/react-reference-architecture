#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 || (${1:-} != '' && ${1:-} != --update-snapshots) ]]; then
  printf 'Usage: bash scripts/test-visual.sh [--update-snapshots]\n' >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"
mkdir -p test-results/visual-container
bookstore_artifacts=$(mktemp -d "$PWD/test-results/visual-container/run.XXXXXX")
printf 'Visual test artifacts: %s\n' "$bookstore_artifacts"
bookstore_image='mcr.microsoft.com/playwright:v1.65.1-noble@sha256:56be08aca06bf736a928da2e3235a3b63ef71ee97313beb18c6019fea791aba4'

# A fresh checkout in the container keeps the host build and node_modules separate.
git ls-files --cached --others --exclude-standard -z |
  while IFS= read -r -d '' path; do
    if [[ -e $path || -L $path ]]; then printf '%s\0' "$path"; fi
  done |
  COPYFILE_DISABLE=1 tar -c -f - --no-xattrs --null -T - |
  docker run --rm --interactive --init --ipc=host --platform linux/arm64 \
    --env NEXT_TELEMETRY_DISABLED=1 \
    --mount "type=bind,source=$bookstore_artifacts,target=/artifacts" \
    --workdir /project "$bookstore_image" bash -euc '
      collect_artifacts() {
        if [[ -d test-results/visual ]]; then
          cp -R test-results/visual/. /artifacts/
        fi
        chown -R "$1:$2" /artifacts
      }
      trap '\''collect_artifacts "$1" "$2"'\'' EXIT
      tar -xf -
      bookstore_pnpm=$(node -p "require(\"./package.json\").packageManager")
      npm install --prefix /opt/bookstore-tools --no-audit --no-fund \
        node@24.15.0 "$bookstore_pnpm"
      export PATH="/opt/bookstore-tools/node_modules/.bin:$PATH"
      pnpm install --frozen-lockfile
      pnpm build:demo
      pnpm test:e2e:visual "${@:3}"
      if [[ ${3:-} == --update-snapshots ]]; then
        pnpm test:e2e:visual
        cp -R test/visual/screenshots /artifacts/
      fi
    ' visual-test "$(id -u)" "$(id -g)" "$@"

if [[ ${1:-} == --update-snapshots ]]; then
  mkdir -p test/visual/screenshots
  cp "$bookstore_artifacts"/screenshots/*.png test/visual/screenshots/
fi
