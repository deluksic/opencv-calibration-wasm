# OpenCV Calibration WASM Build

Standalone npm package for browser camera calibration using OpenCV `calibrateCameraRO` (and related functions) compiled to WebAssembly.

## API

Exports:

- `initCalibrator(options?)` — loads the WASM module and returns a **calibrator**.
- `DEFAULT_WASM_MODULE_PATH` — resolved URL for the Emscripten loader (works with Vite hashed assets).
- `CALIBRATION_FLAGS` — OpenCV-compatible bitmasks.

The returned **calibrator** object:

- `calibrator.calibrateCameraRO(input)` — intrinsics, extrinsics, and `newObjPoints` when object-release is active.
- `calibrator.projectPoints(input)` — projects 3D points to image space.
- `calibrator.module` — low-level Emscripten module (advanced use only).

The wrapper stays close to OpenCV: you pass multiview `objectPoints` and `imagePoints`; calibration optimizes the joint model OpenCV uses.

## Basic usage

```ts
import {
  initCalibrator,
  CALIBRATION_FLAGS
} from "@deluksic/opencv-calibration-wasm";

const calibrator = await initCalibrator();
// optional: await initCalibrator({ modulePath: customUrl })

const calib = calibrator.calibrateCameraRO({
  objectPoints,
  imagePoints,
  imageSize: { width, height },
  iFixedPoint: 1,
  flags: CALIBRATION_FLAGS.CALIB_RATIONAL_MODEL,
  criteria: { type: 3, maxCount: 30, epsilon: 1e-3 },
  maxDistCoeffs: 14
});

const reproj = calibrator.projectPoints({
  objectPoints: Array.from({ length: calib.viewCount }, () => calib.newObjPoints),
  rvecs: calib.rvecs,
  tvecs: calib.tvecs,
  cameraMatrix: calib.cameraMatrix,
  distortionCoefficients: calib.distortionCoefficients
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

When calibration runs in object-release mode (`iFixedPoint > 0` and `< pointsPerView - 1`):

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
pnpm build:ts
pnpm build:opencv
pnpm build:wasm
```

`build:ts` removes `dist/index.js`, `dist/index.d.ts`, then runs `tsc`. It does not touch `dist/wasm/`.

Artifacts:

- `dist/index.js`
- `dist/index.d.ts`
- `dist/wasm/calibrate.js`
- `dist/wasm/calibrate.wasm`

## Example usage (Node smoke test)

```bash
pnpm example
```

## Browser / Vite

Default `initCalibrator()` resolves the WASM loader via `import.meta.url`, so Vite can hash and bundle `calibrate.js` / `calibrate.wasm` without hardcoding paths.

```ts
import { initCalibrator } from "@deluksic/opencv-calibration-wasm";

const calibrator = await initCalibrator();
const result = calibrator.calibrateCameraRO(input);
```

If you need an explicit URL (e.g. custom hosting), pass `modulePath` to `initCalibrator({ modulePath })` once.
