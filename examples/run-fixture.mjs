import { readFile } from "node:fs/promises";
import { calibrateCameraRO } from "../dist/index.mjs";

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

const result = await calibrateCameraRO({
    objectPoints,
    imagePoints,
    imageSize: json.resolution,
    iFixedPoint: 1,
    flags: 0,
    criteria: { type: 3, maxCount: 100, epsilon: 1e-9 },
    maxDistCoeffs: 14,
}, {
    modulePath: "../dist/wasm/calibrate.mjs",
});

console.log(JSON.stringify(result, null, 2));
