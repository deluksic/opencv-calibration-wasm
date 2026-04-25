import { readFile } from "node:fs/promises";
import { initCalibrator } from "../dist/index.js";

const fixturePath = process.argv[2] ?? "./calibration_export_1777035497240.json";
const json = JSON.parse(await readFile(new URL(fixturePath, import.meta.url), "utf-8"));

const targetPointById = new Map();
for (const tag of json.layout) {
    for (let cornerIndex = 0; cornerIndex < tag.corners.length; cornerIndex += 1) {
        const [x, y] = tag.corners[cornerIndex];
        const pointId = tag.tagId * 10000 + cornerIndex;
        targetPointById.set(pointId, [x, y, 0.0]);
    }
}

const frames = json.calibrationFrames.map((frame) => {
    const byId = new Map();
    for (const p of frame.framePoints) {
        if (targetPointById.has(p.pointId)) byId.set(p.pointId, p.imagePoint);
    }
    return { frameId: frame.frameId, byId };
}).filter((f) => f.byId.size > 0);

let commonIds = new Set(frames[0].byId.keys());
for (let i = 1; i < frames.length; i += 1) {
    const next = new Set();
    for (const id of commonIds) {
        if (frames[i].byId.has(id)) next.add(id);
    }
    commonIds = next;
}
const ids = Array.from(commonIds).sort((a, b) => a - b);

const objectPoints = [];
const imagePoints = [];
for (const frame of frames) {
    objectPoints.push(ids.map((id) => targetPointById.get(id)));
    imagePoints.push(ids.map((id) => frame.byId.get(id)));
}

const calibrator = await initCalibrator({
    wasmPath: new URL("../dist/wasm/calibrate.wasm", import.meta.url).href,
});

const t0 = performance.now();
const initial = calibrator.calibrateCameraRO({
    objectPoints,
    imagePoints,
    imageSize: json.resolution,
    iFixedPoint: 1,
    flags: 0,
    criteria: { type: 3, maxCount: 100, epsilon: 1e-9 },
    maxDistCoeffs: 14,
});
const t1 = performance.now();

const refined = calibrator.calibrateCameraRO({
    objectPoints,
    imagePoints,
    imageSize: json.resolution,
    cameraMatrix: initial.cameraMatrix,
    distortionCoefficients: initial.distortionCoefficients,
    iFixedPoint: 1,
    flags: 0,
    criteria: { type: 3, maxCount: 30, epsilon: 1e-3 },
    maxDistCoeffs: 14,
});
const t2 = performance.now();

const reprojectionObjectPoints = refined.newObjPoints.length === ids.length
    ? Array.from({ length: frames.length }, () => refined.newObjPoints)
    : objectPoints;
const reprojectionOptimized = calibrator.projectPoints({
    objectPoints: reprojectionObjectPoints,
    rvecs: refined.rvecs,
    tvecs: refined.tvecs,
    cameraMatrix: refined.cameraMatrix,
    distortionCoefficients: refined.distortionCoefficients,
});
const t3 = performance.now();

const singleFrameIndex = 0;
const singleFrameObjectPoints = [reprojectionObjectPoints[singleFrameIndex]];
const singleFrameRvecs = [refined.rvecs[singleFrameIndex]];
const singleFrameTvecs = [refined.tvecs[singleFrameIndex]];
const tSingle0 = performance.now();
const singleFrameReprojection = calibrator.projectPoints({
    objectPoints: singleFrameObjectPoints,
    rvecs: singleFrameRvecs,
    tvecs: singleFrameTvecs,
    cameraMatrix: refined.cameraMatrix,
    distortionCoefficients: refined.distortionCoefficients,
});
const tSingle1 = performance.now();

const initialMs = t1 - t0;
const refinedMs = t2 - t1;
const reprojectionOptimizedMs = t3 - t2;
const singleFrameReprojectionMs = tSingle1 - tSingle0;

function imageSpaceErrorStats(measuredImagePoints, projectedImagePoints) {
    let sumSq = 0;
    let sum = 0;
    let max = 0;
    let sampleCount = 0;
    for (let viewIdx = 0; viewIdx < measuredImagePoints.length; viewIdx += 1) {
        for (let pointIdx = 0; pointIdx < measuredImagePoints[viewIdx].length; pointIdx += 1) {
            const [mx, my] = measuredImagePoints[viewIdx][pointIdx];
            const [px, py] = projectedImagePoints[viewIdx][pointIdx];
            const err = Math.hypot(px - mx, py - my);
            sum += err;
            sumSq += err * err;
            if (err > max) max = err;
            sampleCount += 1;
        }
    }
    const mean = sampleCount > 0 ? (sum / sampleCount) : 0;
    const rmse = sampleCount > 0 ? Math.sqrt(sumSq / sampleCount) : 0;
    return { mean, rmse, max, sampleCount };
}

const errOptimized = imageSpaceErrorStats(imagePoints, reprojectionOptimized.projectedImagePoints);
const errSingleFrame = imageSpaceErrorStats(
    [imagePoints[singleFrameIndex]],
    singleFrameReprojection.projectedImagePoints
);

console.log([
    `Fixture: ${fixturePath}`,
    `Views: ${initial.viewCount}, Shared points/view: ${ids.length}`,
    `Initial pass: ${initialMs.toFixed(2)} ms, RMS: ${initial.reprojectionErrorPx.toFixed(6)} px`,
    `Refine pass (with provided intrinsics): ${refinedMs.toFixed(2)} ms, RMS: ${refined.reprojectionErrorPx.toFixed(6)} px`,
    `RMS delta (warm - initial): ${(refined.reprojectionErrorPx - initial.reprojectionErrorPx).toFixed(6)} px`,
    `Image->Object(optimized)->Image: ${reprojectionOptimizedMs.toFixed(2)} ms, mean=${errOptimized.mean.toFixed(6)} px, rmse=${errOptimized.rmse.toFixed(6)} px, max=${errOptimized.max.toFixed(6)} px`,
    `Single-frame reprojection (frame 0): ${singleFrameReprojectionMs.toFixed(2)} ms, mean=${errSingleFrame.mean.toFixed(6)} px, rmse=${errSingleFrame.rmse.toFixed(6)} px, max=${errSingleFrame.max.toFixed(6)} px`,
    `Dist coeffs: initial=${initial.distortionCoefficients.length}, warm=${refined.distortionCoefficients.length}`,
    `Refined target points: initial=${initial.newObjPoints.length}, warm=${refined.newObjPoints.length}`,
].join("\n"));
