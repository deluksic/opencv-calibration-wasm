# calibration-wasm-npm

Standalone npm package scaffold for browser camera calibration using OpenCV `calibrateCameraRO` compiled to WebAssembly.

## What this package returns

- `reprojectionErrorPx`
- `cameraMatrix`
- `distortionCoefficients`
- `optimizedTargetPoints` (refined layout points)
- metadata (`usedFrameIds`, `sharedPointIds`, counts)

## Input mapping

This package expects labeled points where:

- `pointId = tagId * 10000 + cornerId`

The calibrator enforces the OpenCV object-release requirement by using only point IDs shared across all used frames with identical object-point ordering.

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
node examples/run-fixture.mjs ../calibration_export_1777035497240.json
```

## Browser usage

```js
import { calibrateFromLabeledFrames } from "@your-scope/calibration-wasm";
const result = await calibrateFromLabeledFrames(calibrationJson, {
  modulePath: "/node_modules/@your-scope/calibration-wasm/dist/wasm/calibrate.mjs"
});
```

In bundlers, ensure `calibrate.wasm` is served/copied with `calibrate.mjs`.
