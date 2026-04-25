#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE}" != "darwin"* ]]; then
  echo "This script currently supports macOS only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCV_DIR="${ROOT_DIR}/third_party/opencv"
LOCAL_EMSDK_DIR="${ROOT_DIR}/third_party/emsdk"
BUILD_DIR="${OPENCV_DIR}/build-wasm"

if [[ ! -d "${OPENCV_DIR}" ]]; then
  echo "Missing OpenCV source at third_party/opencv."
  echo "Add OpenCV as a git submodule first."
  exit 1
fi

if [[ -n "${EMSDK:-}" ]] && [[ -f "${EMSDK}/emsdk_env.sh" ]] && [[ -f "${EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" ]]; then
  EMSDK_DIR="${EMSDK}"
elif [[ -f "${LOCAL_EMSDK_DIR}/emsdk_env.sh" ]] && [[ -f "${LOCAL_EMSDK_DIR}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" ]]; then
  EMSDK_DIR="${LOCAL_EMSDK_DIR}"
elif command -v emcmake >/dev/null 2>&1; then
  EMSDK_DIR="$(cd "$(dirname "$(command -v emcmake)")/.." && pwd)"
  if [[ ! -f "${EMSDK_DIR}/emsdk_env.sh" ]] || [[ ! -f "${EMSDK_DIR}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" ]]; then
    echo "Found emcmake in PATH, but could not resolve a valid emsdk root."
    echo "Set EMSDK to your emsdk install directory."
    exit 1
  fi
else
  echo "Missing emsdk environment script."
  echo "Expected an installed emsdk with toolchain from one of:"
  echo "  1) EMSDK environment variable"
  echo "  2) ${LOCAL_EMSDK_DIR}"
  echo "  3) emcmake available in PATH"
  exit 1
fi

source "${EMSDK_DIR}/emsdk_env.sh" >/dev/null

TOOLCHAIN_FILE="${EMSDK_DIR}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"

HAVE_NINJA=0
if command -v ninja >/dev/null 2>&1; then
  HAVE_NINJA=1
fi

if [[ -f "${BUILD_DIR}/CMakeCache.txt" ]]; then
  CMAKE_GENERATOR_NAME="$(awk -F= '/^CMAKE_GENERATOR:INTERNAL=/{print $2}' "${BUILD_DIR}/CMakeCache.txt")"
  if [[ "${CMAKE_GENERATOR_NAME}" == "Ninja" && "${HAVE_NINJA}" -eq 0 ]]; then
    CMAKE_GENERATOR_NAME="Unix Makefiles"
  fi
elif [[ "${HAVE_NINJA}" -eq 1 ]]; then
  CMAKE_GENERATOR_NAME="Ninja"
else
  CMAKE_GENERATOR_NAME="Unix Makefiles"
fi

if [[ -f "${BUILD_DIR}/CMakeCache.txt" ]]; then
  PREV_GENERATOR="$(awk -F= '/^CMAKE_GENERATOR:INTERNAL=/{print $2}' "${BUILD_DIR}/CMakeCache.txt")"
  if [[ -n "${PREV_GENERATOR}" && "${PREV_GENERATOR}" != "${CMAKE_GENERATOR_NAME}" ]]; then
    rm -rf "${BUILD_DIR}"
  fi
fi

cmake -S "${OPENCV_DIR}" -B "${BUILD_DIR}" \
  -G "${CMAKE_GENERATOR_NAME}" \
  -D CMAKE_BUILD_TYPE=Release \
  -D CMAKE_TOOLCHAIN_FILE="${TOOLCHAIN_FILE}" \
  -D CMAKE_C_FLAGS="-msimd128" \
  -D CMAKE_CXX_FLAGS="-msimd128" \
  -D BUILD_LIST=core,calib3d \
  -D BUILD_SHARED_LIBS=OFF \
  -D BUILD_opencv_world=OFF \
  -D BUILD_DOCS=OFF \
  -D BUILD_TESTS=OFF \
  -D BUILD_PERF_TESTS=OFF \
  -D BUILD_EXAMPLES=OFF \
  -D BUILD_opencv_js=OFF \
  -D BUILD_opencv_apps=OFF \
  -D BUILD_opencv_objdetect=OFF \
  -D WITH_ZLIB=ON \
  -D WITH_PNG=OFF \
  -D WITH_JPEG=OFF \
  -D WITH_TIFF=OFF \
  -D WITH_WEBP=OFF \
  -D WITH_OPENEXR=OFF \
  -D WITH_GTK=OFF \
  -D WITH_FFMPEG=OFF \
  -D WITH_GSTREAMER=OFF \
  -D WITH_OPENCL=OFF \
  -D WITH_IPP=OFF \
  -D WITH_ITT=OFF \
  -D WITH_TBB=OFF \
  -D WITH_1394=OFF \
  -D WITH_PERSISTENCE=OFF \
  -D WITH_PTHREADS_PF=OFF \
  -D WITH_OPENMP=OFF

cmake --build "${BUILD_DIR}" --target \
  opencv_core opencv_calib3d -j

echo "OpenCV wasm static libs ready at ${BUILD_DIR}/lib"
