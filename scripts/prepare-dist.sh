#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${ROOT_DIR}/dist"
rm -f "${ROOT_DIR}/dist/index.js" "${ROOT_DIR}/dist/index.mjs" "${ROOT_DIR}/dist/index.d.ts"
npx tsc -p "${ROOT_DIR}/tsconfig.json"
mv "${ROOT_DIR}/dist/index.js" "${ROOT_DIR}/dist/index.mjs"
echo "Prepared dist TS API files."
