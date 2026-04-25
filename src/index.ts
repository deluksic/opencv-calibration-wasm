export interface CalibrateCameraROCriteria {
    type?: number;
    maxCount?: number;
    epsilon?: number;
}

export interface CalibrateCameraROInput {
    objectPoints: [number, number, number][][];
    imagePoints: [number, number][][];
    imageSize: { width: number; height: number };
    cameraMatrix?: [[number, number, number], [number, number, number], [number, number, number]];
    distortionCoefficients?: number[];
    iFixedPoint?: number;
    flags?: number;
    criteria?: CalibrateCameraROCriteria;
    maxDistCoeffs?: number;
}

export interface CalibrateCameraROResult {
    retval: number;
    pointCount: number;
    viewCount: number;
    imageSize: { width: number; height: number };
    flags: number;
    iFixedPoint: number;
    reprojectionErrorPx: number;
    cameraMatrix: [[number, number, number], [number, number, number], [number, number, number]];
    distortionCoefficients: number[];
    rvecs: [number, number, number][];
    tvecs: [number, number, number][];
    newObjPoints: [number, number, number][];
}

export interface ProjectPointsInput {
    objectPoints: [number, number, number][][];
    rvecs: [number, number, number][];
    tvecs: [number, number, number][];
    cameraMatrix: [[number, number, number], [number, number, number], [number, number, number]];
    distortionCoefficients?: number[];
}

export interface ProjectPointsResult {
    viewCount: number;
    pointCount: number;
    projectedImagePoints: [number, number][][];
}

export interface SolvePnPInput {
    objectPoints: [number, number, number][];
    imagePoints: [number, number][];
    cameraMatrix: [[number, number, number], [number, number, number], [number, number, number]];
    distortionCoefficients?: number[];
    flags?: number;
    useExtrinsicGuess?: boolean;
    rvec?: [number, number, number];
    tvec?: [number, number, number];
}

export interface SolvePnPResult {
    success: boolean;
    rvec: [number, number, number];
    tvec: [number, number, number];
}

export const CALIBRATION_FLAGS = {
    CALIB_USE_INTRINSIC_GUESS: 0x00001,
    CALIB_FIX_ASPECT_RATIO: 0x00002,
    CALIB_FIX_PRINCIPAL_POINT: 0x00004,
    CALIB_ZERO_TANGENT_DIST: 0x00008,
    CALIB_FIX_FOCAL_LENGTH: 0x00010,
    CALIB_FIX_K1: 0x00020,
    CALIB_FIX_K2: 0x00040,
    CALIB_FIX_K3: 0x00080,
    CALIB_FIX_K4: 0x00800,
    CALIB_FIX_K5: 0x01000,
    CALIB_FIX_K6: 0x02000,
    CALIB_RATIONAL_MODEL: 0x04000,
    CALIB_THIN_PRISM_MODEL: 0x08000,
    CALIB_FIX_S1_S2_S3_S4: 0x10000,
    CALIB_TILTED_MODEL: 0x40000,
    CALIB_FIX_TAUX_TAUY: 0x80000,
    CALIB_FIX_TANGENT_DIST: 0x200000,
} as const;

interface PackedMultiviewInput {
    objectPoints: Float32Array;
    imagePoints: Float32Array;
    pointsPerView: Int32Array;
}

interface CalibrateWasmModule {
    _malloc(size: number): number;
    _free(ptr: number): void;
    _calibrate_camera_ro(...args: number[]): number;
    _solve_pnp(...args: number[]): number;
    _project_points(...args: number[]): void;
    HEAPF32: Float32Array;
    HEAP32: Int32Array;
}

type CreateModule = (
    options?: { locateFile?: (path: string) => string }
) => Promise<CalibrateWasmModule> | CalibrateWasmModule;
export interface Calibrator {
    module: CalibrateWasmModule;
    calibrateCameraRO(input: CalibrateCameraROInput): CalibrateCameraROResult;
    solvePnP(input: SolvePnPInput): SolvePnPResult;
    projectPoints(input: ProjectPointsInput): ProjectPointsResult;
}

function normalizeMultiviewInput(input: {
    objectPoints: [number, number, number][][];
    imagePoints: [number, number][][];
}): PackedMultiviewInput {
    const objectPoints: number[] = [];
    const imagePoints: number[] = [];
    const pointsPerView: number[] = [];

    if (!Array.isArray(input.objectPoints) || !Array.isArray(input.imagePoints)) {
        throw new Error("objectPoints and imagePoints must be arrays of views.");
    }
    if (input.objectPoints.length !== input.imagePoints.length) {
        throw new Error("objectPoints and imagePoints must have the same number of views.");
    }

    for (let viewIdx = 0; viewIdx < input.objectPoints.length; viewIdx += 1) {
        const objView = input.objectPoints[viewIdx];
        const imgView = input.imagePoints[viewIdx];
        if (!Array.isArray(objView) || !Array.isArray(imgView)) {
            throw new Error("Each view must be an array of points.");
        }
        if (objView.length !== imgView.length) {
            throw new Error(`View ${viewIdx} has mismatched object/image point counts.`);
        }

        for (let i = 0; i < objView.length; i += 1) {
            const objPoint = objView[i];
            const imgPoint = imgView[i];
            if (!Array.isArray(objPoint) || objPoint.length !== 3) {
                throw new Error(`Object point at view ${viewIdx}, index ${i} must have length 3.`);
            }
            if (!Array.isArray(imgPoint) || imgPoint.length !== 2) {
                throw new Error(`Image point at view ${viewIdx}, index ${i} must have length 2.`);
            }

            objectPoints.push(objPoint[0], objPoint[1], objPoint[2]);
            imagePoints.push(imgPoint[0], imgPoint[1]);
        }
        pointsPerView.push(objView.length);
    }

    if (pointsPerView.length === 0) {
        throw new Error("At least one view is required.");
    }

    return {
        objectPoints: new Float32Array(objectPoints),
        imagePoints: new Float32Array(imagePoints),
        pointsPerView: new Int32Array(pointsPerView),
    };
}

export async function initCalibrator(options: { wasmPath: string }): Promise<Calibrator> {
    if (!options?.wasmPath) {
        throw new Error("initCalibrator requires { wasmPath }.");
    }
    // @ts-expect-error generated at wasm build time
    const { default: createModule } = await import("./wasm/calibrate.js");
    const module = await Promise.resolve((createModule as CreateModule)({
        locateFile: (path: string) => (path.endsWith(".wasm") ? options.wasmPath : path),
    }));
    return {
        module,
        calibrateCameraRO: (input) => calibrateCameraROWithModule(module, input),
        solvePnP: (input) => solvePnPWithModule(module, input),
        projectPoints: (input) => projectPointsWithModule(module, input),
    };
}

function calibrateCameraROWithModule(
    Module: CalibrateWasmModule,
    input: CalibrateCameraROInput
): CalibrateCameraROResult {
    const packed = normalizeMultiviewInput(input);
    const frameCount = packed.pointsPerView.length;
    const totalPointCount = packed.imagePoints.length / 2;
    const maxPointsPerView = packed.pointsPerView.reduce((m, v) => (v > m ? v : m), 0);
    const maxDistCoeffs = input.maxDistCoeffs ?? 14;
    const flags = input.flags ?? 0;
    const iFixedPoint = input.iFixedPoint ?? 1;
    const criteriaType = input.criteria?.type ?? 3;
    const criteriaMaxCount = input.criteria?.maxCount ?? 100;
    const criteriaEpsilon = input.criteria?.epsilon ?? 1e-9;
    const width = input.imageSize.width;
    const height = input.imageSize.height;
    const releaseObject = iFixedPoint > 0 && iFixedPoint < (packed.pointsPerView[0] - 1);
    if ((flags & CALIBRATION_FLAGS.CALIB_USE_INTRINSIC_GUESS) !== 0 && releaseObject) {
        throw new Error(
            "OpenCV calibrateCameraRO does not support CALIB_USE_INTRINSIC_GUESS when object-release optimization is active (iFixedPoint > 0 and < pointsPerView-1)."
        );
    }
    const inputCameraMatrix = input.cameraMatrix;
    const hasCameraMatrixInit = Number(
        Array.isArray(inputCameraMatrix)
        && inputCameraMatrix.length === 3
        && inputCameraMatrix.every((row) => Array.isArray(row) && row.length === 3)
    );
    if (Array.isArray(inputCameraMatrix) && !hasCameraMatrixInit) {
        throw new Error("cameraMatrix must be a 3x3 array.");
    }
    const cameraMatrixInitFlat = new Float32Array(
        hasCameraMatrixInit
            ? [
                inputCameraMatrix[0][0], inputCameraMatrix[0][1], inputCameraMatrix[0][2],
                inputCameraMatrix[1][0], inputCameraMatrix[1][1], inputCameraMatrix[1][2],
                inputCameraMatrix[2][0], inputCameraMatrix[2][1], inputCameraMatrix[2][2],
            ]
            : [0, 0, 0, 0, 0, 0, 0, 0, 0]
    );
    const distortionCoefficientsInit = input.distortionCoefficients ?? [];
    if (!Array.isArray(distortionCoefficientsInit)) {
        throw new Error("distortionCoefficients must be an array.");
    }
    if (distortionCoefficientsInit.length > maxDistCoeffs) {
        throw new Error("distortionCoefficients length cannot exceed maxDistCoeffs.");
    }
    const distInitFlat = new Float32Array(distortionCoefficientsInit);

    const objPtr = Module._malloc(packed.objectPoints.byteLength);
    const imgPtr = Module._malloc(packed.imagePoints.byteLength);
    const countsPtr = Module._malloc(packed.pointsPerView.byteLength);
    const kInitPtr = Module._malloc(cameraMatrixInitFlat.byteLength);
    const distInitPtr = Module._malloc(Math.max(1, distInitFlat.byteLength));
    const kPtr = Module._malloc(9 * Float32Array.BYTES_PER_ELEMENT);
    const distPtr = Module._malloc(maxDistCoeffs * Float32Array.BYTES_PER_ELEMENT);
    const rvecsPtr = Module._malloc(frameCount * 3 * Float32Array.BYTES_PER_ELEMENT);
    const tvecsPtr = Module._malloc(frameCount * 3 * Float32Array.BYTES_PER_ELEMENT);
    const newObjPtr = Module._malloc(maxPointsPerView * 3 * Float32Array.BYTES_PER_ELEMENT);
    const distCountPtr = Module._malloc(Int32Array.BYTES_PER_ELEMENT);
    const newObjCountPtr = Module._malloc(Int32Array.BYTES_PER_ELEMENT);

    try {
        Module.HEAPF32.set(packed.objectPoints, objPtr >> 2);
        Module.HEAPF32.set(packed.imagePoints, imgPtr >> 2);
        Module.HEAP32.set(packed.pointsPerView, countsPtr >> 2);
        Module.HEAPF32.set(cameraMatrixInitFlat, kInitPtr >> 2);
        if (distInitFlat.length > 0) Module.HEAPF32.set(distInitFlat, distInitPtr >> 2);

        const retval = Module._calibrate_camera_ro(
            objPtr,
            imgPtr,
            countsPtr,
            frameCount,
            width,
            height,
            iFixedPoint,
            flags,
            criteriaType,
            criteriaMaxCount,
            criteriaEpsilon,
            kInitPtr,
            hasCameraMatrixInit,
            distInitPtr,
            distInitFlat.length,
            kPtr,
            distPtr,
            maxDistCoeffs,
            rvecsPtr,
            tvecsPtr,
            frameCount,
            newObjPtr,
            maxPointsPerView,
            distCountPtr,
            newObjCountPtr
        );

        const k = Array.from(Module.HEAPF32.subarray(kPtr >> 2, (kPtr >> 2) + 9));
        const distCount = Module.HEAP32[distCountPtr >> 2];
        const dist = Array.from(
            Module.HEAPF32.subarray(
                distPtr >> 2,
                (distPtr >> 2) + Math.min(distCount, maxDistCoeffs)
            )
        );

        const rvecs: [number, number, number][] = [];
        const tvecs: [number, number, number][] = [];
        for (let viewIdx = 0; viewIdx < frameCount; viewIdx += 1) {
            const base = (rvecsPtr >> 2) + (viewIdx * 3);
            const tbase = (tvecsPtr >> 2) + (viewIdx * 3);
            rvecs.push([
                Module.HEAPF32[base + 0],
                Module.HEAPF32[base + 1],
                Module.HEAPF32[base + 2],
            ]);
            tvecs.push([
                Module.HEAPF32[tbase + 0],
                Module.HEAPF32[tbase + 1],
                Module.HEAPF32[tbase + 2],
            ]);
        }

        const newObjCount = Module.HEAP32[newObjCountPtr >> 2];
        const newObjPoints: [number, number, number][] = [];
        for (let i = 0; i < Math.min(newObjCount, maxPointsPerView); i += 1) {
            const base = (newObjPtr >> 2) + (i * 3);
            newObjPoints.push([
                Module.HEAPF32[base + 0],
                Module.HEAPF32[base + 1],
                Module.HEAPF32[base + 2],
            ]);
        }

        return {
            retval,
            pointCount: totalPointCount,
            viewCount: frameCount,
            imageSize: { width, height },
            flags,
            iFixedPoint,
            reprojectionErrorPx: retval,
            cameraMatrix: [
                [k[0], k[1], k[2]],
                [k[3], k[4], k[5]],
                [k[6], k[7], k[8]],
            ],
            distortionCoefficients: dist,
            rvecs,
            tvecs,
            newObjPoints,
        };
    } finally {
        Module._free(objPtr);
        Module._free(imgPtr);
        Module._free(countsPtr);
        Module._free(kInitPtr);
        Module._free(distInitPtr);
        Module._free(kPtr);
        Module._free(distPtr);
        Module._free(rvecsPtr);
        Module._free(tvecsPtr);
        Module._free(newObjPtr);
        Module._free(distCountPtr);
        Module._free(newObjCountPtr);
    }
}

function solvePnPWithModule(
    Module: CalibrateWasmModule,
    input: SolvePnPInput
): SolvePnPResult {
    if (!Array.isArray(input.objectPoints) || !Array.isArray(input.imagePoints)) {
        throw new Error("objectPoints and imagePoints must be arrays.");
    }
    if (input.objectPoints.length !== input.imagePoints.length) {
        throw new Error("objectPoints and imagePoints must have the same length.");
    }
    if (input.objectPoints.length === 0) {
        throw new Error("At least one point is required.");
    }

    const pointCount = input.objectPoints.length;
    const objectFlat = new Float32Array(pointCount * 3);
    const imageFlat = new Float32Array(pointCount * 2);
    for (let i = 0; i < pointCount; i += 1) {
        const obj = input.objectPoints[i];
        const img = input.imagePoints[i];
        if (!Array.isArray(obj) || obj.length !== 3) {
            throw new Error(`Object point at index ${i} must have length 3.`);
        }
        if (!Array.isArray(img) || img.length !== 2) {
            throw new Error(`Image point at index ${i} must have length 2.`);
        }
        objectFlat[i * 3 + 0] = obj[0];
        objectFlat[i * 3 + 1] = obj[1];
        objectFlat[i * 3 + 2] = obj[2];
        imageFlat[i * 2 + 0] = img[0];
        imageFlat[i * 2 + 1] = img[1];
    }

    const k = input.cameraMatrix;
    if (!Array.isArray(k) || k.length !== 3 || k.some((row) => !Array.isArray(row) || row.length !== 3)) {
        throw new Error("cameraMatrix must be a 3x3 array.");
    }
    const kFlat = new Float32Array([
        k[0][0], k[0][1], k[0][2],
        k[1][0], k[1][1], k[1][2],
        k[2][0], k[2][1], k[2][2],
    ]);

    const dist = new Float32Array(input.distortionCoefficients ?? []);
    const useExtrinsicGuess = input.useExtrinsicGuess ?? false;
    const rvecIn = input.rvec ?? [0, 0, 0];
    const tvecIn = input.tvec ?? [0, 0, 0];
    if (!Array.isArray(rvecIn) || rvecIn.length !== 3 || !Array.isArray(tvecIn) || tvecIn.length !== 3) {
        throw new Error("rvec and tvec must have length 3.");
    }
    const rvecInit = new Float32Array([rvecIn[0], rvecIn[1], rvecIn[2]]);
    const tvecInit = new Float32Array([tvecIn[0], tvecIn[1], tvecIn[2]]);
    const flags = input.flags ?? 0;

    const objPtr = Module._malloc(objectFlat.byteLength);
    const imgPtr = Module._malloc(imageFlat.byteLength);
    const kPtr = Module._malloc(kFlat.byteLength);
    const distPtr = Module._malloc(Math.max(1, dist.byteLength));
    const rvecPtr = Module._malloc(rvecInit.byteLength);
    const tvecPtr = Module._malloc(tvecInit.byteLength);

    try {
        Module.HEAPF32.set(objectFlat, objPtr >> 2);
        Module.HEAPF32.set(imageFlat, imgPtr >> 2);
        Module.HEAPF32.set(kFlat, kPtr >> 2);
        if (dist.length > 0) Module.HEAPF32.set(dist, distPtr >> 2);
        Module.HEAPF32.set(rvecInit, rvecPtr >> 2);
        Module.HEAPF32.set(tvecInit, tvecPtr >> 2);

        const ok = Module._solve_pnp(
            objPtr,
            imgPtr,
            pointCount,
            kPtr,
            distPtr,
            dist.length,
            flags,
            useExtrinsicGuess ? 1 : 0,
            rvecPtr,
            tvecPtr
        );

        const rBase = rvecPtr >> 2;
        const tBase = tvecPtr >> 2;
        return {
            success: ok !== 0,
            rvec: [Module.HEAPF32[rBase + 0], Module.HEAPF32[rBase + 1], Module.HEAPF32[rBase + 2]],
            tvec: [Module.HEAPF32[tBase + 0], Module.HEAPF32[tBase + 1], Module.HEAPF32[tBase + 2]],
        };
    } finally {
        Module._free(objPtr);
        Module._free(imgPtr);
        Module._free(kPtr);
        Module._free(distPtr);
        Module._free(rvecPtr);
        Module._free(tvecPtr);
    }
}

function projectPointsWithModule(
    Module: CalibrateWasmModule,
    input: ProjectPointsInput
): ProjectPointsResult {
    const packed = normalizeMultiviewInput({
        objectPoints: input.objectPoints,
        imagePoints: input.objectPoints.map((v) => v.map(() => [0, 0] as [number, number])),
    });
    const viewCount = packed.pointsPerView.length;
    const totalPointCount = packed.objectPoints.length / 3;

    if (!Array.isArray(input.rvecs) || !Array.isArray(input.tvecs)) {
        throw new Error("rvecs and tvecs must be arrays of per-view vectors.");
    }
    if (input.rvecs.length !== viewCount || input.tvecs.length !== viewCount) {
        throw new Error("rvecs/tvecs count must match view count.");
    }

    const rvecFlat = new Float32Array(viewCount * 3);
    const tvecFlat = new Float32Array(viewCount * 3);
    for (let i = 0; i < viewCount; i += 1) {
        const r = input.rvecs[i];
        const t = input.tvecs[i];
        if (!Array.isArray(r) || r.length !== 3 || !Array.isArray(t) || t.length !== 3) {
            throw new Error(`rvec/tvec at view ${i} must have length 3.`);
        }
        rvecFlat.set(r, i * 3);
        tvecFlat.set(t, i * 3);
    }

    const k = input.cameraMatrix;
    if (!Array.isArray(k) || k.length !== 3 || k.some((row) => !Array.isArray(row) || row.length !== 3)) {
        throw new Error("cameraMatrix must be a 3x3 array.");
    }
    const kFlat = new Float32Array([
        k[0][0], k[0][1], k[0][2],
        k[1][0], k[1][1], k[1][2],
        k[2][0], k[2][1], k[2][2],
    ]);

    const dist = new Float32Array(input.distortionCoefficients ?? []);
    const objPtr = Module._malloc(packed.objectPoints.byteLength);
    const countsPtr = Module._malloc(packed.pointsPerView.byteLength);
    const rvecPtr = Module._malloc(rvecFlat.byteLength);
    const tvecPtr = Module._malloc(tvecFlat.byteLength);
    const kPtr = Module._malloc(kFlat.byteLength);
    const distPtr = Module._malloc(Math.max(1, dist.byteLength));
    const outPtr = Module._malloc(totalPointCount * 2 * Float32Array.BYTES_PER_ELEMENT);

    try {
        Module.HEAPF32.set(packed.objectPoints, objPtr >> 2);
        Module.HEAP32.set(packed.pointsPerView, countsPtr >> 2);
        Module.HEAPF32.set(rvecFlat, rvecPtr >> 2);
        Module.HEAPF32.set(tvecFlat, tvecPtr >> 2);
        Module.HEAPF32.set(kFlat, kPtr >> 2);
        if (dist.length > 0) Module.HEAPF32.set(dist, distPtr >> 2);

        Module._project_points(
            objPtr,
            countsPtr,
            viewCount,
            rvecPtr,
            tvecPtr,
            kPtr,
            distPtr,
            dist.length,
            outPtr
        );

        const projectedFlat = Module.HEAPF32.subarray(
            outPtr >> 2,
            (outPtr >> 2) + (totalPointCount * 2)
        );
        const projectedImagePoints: [number, number][][] = [];
        let offset = 0;
        for (let v = 0; v < viewCount; v += 1) {
            const count = packed.pointsPerView[v];
            const view: [number, number][] = [];
            for (let i = 0; i < count; i += 1) {
                view.push([projectedFlat[(offset + i) * 2 + 0], projectedFlat[(offset + i) * 2 + 1]]);
            }
            projectedImagePoints.push(view);
            offset += count;
        }

        return {
            viewCount,
            pointCount: totalPointCount,
            projectedImagePoints,
        };
    } finally {
        Module._free(objPtr);
        Module._free(countsPtr);
        Module._free(rvecPtr);
        Module._free(tvecPtr);
        Module._free(kPtr);
        Module._free(distPtr);
        Module._free(outPtr);
    }
}
