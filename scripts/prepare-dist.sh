#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${ROOT_DIR}/dist"
cp "${ROOT_DIR}/src/index.mjs" "${ROOT_DIR}/dist/index.mjs"
cp "${ROOT_DIR}/src/index.d.ts" "${ROOT_DIR}/dist/index.d.ts"
echo "Prepared dist JS API files."
