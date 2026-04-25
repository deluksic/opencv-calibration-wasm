# OpenCV Calibration WASM Build

Standalone npm package for browser camera calibration using OpenCV `calibrateCameraRO` (and related functions) compiled to WebAssembly.

## API

Exports:

- `initCalibrator(options?)`
- `calibrateCameraRO(input, options?)`
- `projectPoints(input, options?)`
- `CALIBRATION_FLAGS` (OpenCV-compatible bitmasks)

The wrapper intentionally stays close to OpenCV:

- You provide multiview `objectPoints` and `imagePoints`.
- `calibrateCameraRO` returns intrinsic/extrinsic parameters and refined object points (`newObjPoints`) when object-release is active.
- `projectPoints` projects 3D object points back to image space for reprojection checks/visualization.

## Basic usage

```ts
import {
  calibrateCameraRO,
  projectPoints,
  CALIBRATION_FLAGS
} from "@deluksic/opencv-calibration-wasm";

const calib = await calibrateCameraRO({
  objectPoints,
  imagePoints,
  imageSize: { width, height },
  iFixedPoint: 1,
  flags: CALIBRATION_FLAGS.CALIB_RATIONAL_MODEL,
  criteria: { type: 3, maxCount: 30, epsilon: 1e-3 },
  maxDistCoeffs: 14
}, {
  modulePath: "/node_modules/@deluksic/opencv-calibration-wasm/dist/wasm/calibrate.mjs"
});

const reproj = await projectPoints({
  objectPoints: Array.from({ length: calib.viewCount }, () => calib.newObjPoints),
  rvecs: calib.rvecs,
  tvecs: calib.tvecs,
  cameraMatrix: calib.cameraMatrix,
  distortionCoefficients: calib.distortionCoefficients
}, {
  modulePath: "/node_modules/@deluksic/opencv-calibration-wasm/dist/wasm/calibrate.mjs"
});
```

## Calibration flags

Use `CALIBRATION_FLAGS` instead of raw hex literals:

- `CALIB_USE_INTRINSIC_GUESS`
- `CALIB_FIX_ASPECT_RATIO`
- `CALIB_FIX_PRINCIPAL_POINT`
- `CALIB_ZERO_TANGENT_DIST`
- `CALIB_FIX_FOCAL_LENGTH`
- `CALIB_FIX_K1` ... `CALIB_FIX_K6`
- `CALIB_RATIONAL_MODEL`
- `CALIB_THIN_PRISM_MODEL`
- `CALIB_FIX_S1_S2_S3_S4`
- `CALIB_TILTED_MODEL`
- `CALIB_FIX_TAUX_TAUY`
- `CALIB_FIX_TANGENT_DIST`

## Important OpenCV behavior

When `calibrateCameraRO` runs in object-release mode (`iFixedPoint > 0` and `< pointsPerView - 1`):

- The optimized model includes `newObjPoints`, not only camera parameters.
- Reprojection should use those optimized object points for consistency with solved poses.
- OpenCV asserts if `CALIB_USE_INTRINSIC_GUESS` is combined with object-release mode in this path. The wrapper throws a clear JS error for this case.

## Repository layout

- `src/native/wrapper.cpp` - C++ WASM wrapper
- `src/index.ts` - high-level TypeScript API
- `scripts/build-opencv.sh` - macOS reproducible OpenCV build
- `scripts/build-wrapper.sh` - WASM wrapper build
- `dist/` - package output for publish

## Prerequisites (macOS)

- `third_party/opencv` present
- emsdk available via one of:
  - `EMSDK` environment variable
  - `third_party/emsdk`
  - `emcmake` on `PATH`
- `cmake` and `ninja`

## Setup emsdk from `third_party/emsdk`

If you use the vendored emsdk, install and activate it once:

```bash
cd third_party/emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh # or set PATH as instructed
```

## Build

```bash
npm run prepare:dist
npm run build:opencv
npm run build:wasm
```

Artifacts:

- `dist/index.mjs`
- `dist/index.d.ts`
- `dist/wasm/calibrate.mjs`
- `dist/wasm/calibrate.wasm`

## Example usage (Node smoke test)

```bash
node examples/run-fixture.mjs ./examples/calibration_export_1777035497240.json
```

## Browser usage

```js
import { calibrateCameraRO } from "@deluksic/opencv-calibration-wasm";
const result = await calibrateCameraRO(input, {
  modulePath: "/node_modules/@deluksic/opencv-calibration-wasm/dist/wasm/calibrate.mjs"
});
```

In bundlers, ensure `calibrate.wasm` is served/copied with `calibrate.mjs`.
