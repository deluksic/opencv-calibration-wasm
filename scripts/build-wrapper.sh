#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCV_DIR="${ROOT_DIR}/third_party/opencv"
OPENCV_BUILD_DIR="${OPENCV_DIR}/build-wasm"
DIST_WASM_DIR="${ROOT_DIR}/dist/wasm"
LOCAL_EMSDK_DIR="${ROOT_DIR}/third_party/emsdk"
FALLBACK_EMSDK_DIR="/Users/admin/Projects/emsdk"

if [[ -x "${LOCAL_EMSDK_DIR}/upstream/emscripten/em++" ]]; then
  EMSDK_DIR="${LOCAL_EMSDK_DIR}"
elif [[ -x "${FALLBACK_EMSDK_DIR}/upstream/emscripten/em++" ]]; then
  EMSDK_DIR="${FALLBACK_EMSDK_DIR}"
else
  echo "emscripten compiler not found."
  echo "Expected em++ at one of:"
  echo "  ${LOCAL_EMSDK_DIR}/upstream/emscripten/em++"
  echo "  ${FALLBACK_EMSDK_DIR}/upstream/emscripten/em++"
  exit 1
fi

if [[ ! -d "${OPENCV_BUILD_DIR}/lib" ]]; then
  echo "OpenCV build artifacts not found at ${OPENCV_BUILD_DIR}/lib."
  echo "Run scripts/build-opencv.sh first."
  exit 1
fi

rm -rf "${DIST_WASM_DIR}"
mkdir -p "${DIST_WASM_DIR}"
EMPP="${ROOT_DIR}/third_party/emsdk/upstream/emscripten/em++"
EMPP="${EMSDK_DIR}/upstream/emscripten/em++"

"${EMPP}" "${ROOT_DIR}/src/native/wrapper.cpp" \
  -I"${OPENCV_BUILD_DIR}" \
  -I"${OPENCV_DIR}/modules/core/include" \
  -I"${OPENCV_DIR}/modules/flann/include" \
  -I"${OPENCV_DIR}/modules/imgproc/include" \
  -I"${OPENCV_DIR}/modules/features2d/include" \
  -I"${OPENCV_DIR}/modules/calib3d/include" \
  -Oz \
  -msimd128 \
  -flto \
  -s WASM=1 \
  -s ENVIRONMENT=web,worker \
  -s FILESYSTEM=0 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s USE_ZLIB=1 \
  -s ASSERTIONS=2 \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -s EXPORTED_FUNCTIONS='["_calibrate_camera_ro","_solve_pnp","_project_points","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPF32","HEAP32"]' \
  "${OPENCV_BUILD_DIR}/lib/libopencv_core.a" \
  "${OPENCV_BUILD_DIR}/lib/libopencv_flann.a" \
  "${OPENCV_BUILD_DIR}/lib/libopencv_imgproc.a" \
  "${OPENCV_BUILD_DIR}/lib/libopencv_features2d.a" \
  "${OPENCV_BUILD_DIR}/lib/libopencv_calib3d.a" \
  -o "${DIST_WASM_DIR}/calibrate.js"

echo "Built:"
echo "  ${DIST_WASM_DIR}/calibrate.js"
echo "  ${DIST_WASM_DIR}/calibrate.wasm"

WASM_OPT_BIN="${EMSDK_DIR}/upstream/bin/wasm-opt"
if [[ -x "${WASM_OPT_BIN}" ]]; then
  TMP_OPT_WASM="${DIST_WASM_DIR}/calibrate.optimizing.wasm"
  "${WASM_OPT_BIN}" -Oz --all-features \
    "${DIST_WASM_DIR}/calibrate.wasm" \
    -o "${TMP_OPT_WASM}"
  mv "${TMP_OPT_WASM}" "${DIST_WASM_DIR}/calibrate.wasm"
  echo "Optimized wasm with wasm-opt -Oz"
  ls -lh "${DIST_WASM_DIR}/calibrate.wasm"
fi
