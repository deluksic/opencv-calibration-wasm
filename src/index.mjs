let modulePromise;

async function getModule(createModule) {
    if (!modulePromise) {
        modulePromise = createModule();
    }
    return modulePromise;
}

function normalizeMultiviewInput(input) {
    const objectPoints = [];
    const imagePoints = [];
    const pointsPerView = [];

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

export async function initCalibrator(options = {}) {
    const modulePath = options.modulePath ?? "./wasm/calibrate.mjs";
    const { default: createModule } = await import(modulePath);
    await getModule(createModule);
}

export async function calibrateCameraRO(input, options = {}) {
    const modulePath = options.modulePath ?? "./wasm/calibrate.mjs";
    const { default: createModule } = await import(modulePath);
    const Module = await getModule(createModule);

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

        const rvecs = [];
        const tvecs = [];
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
        const newObjPoints = [];
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

export async function projectPoints(input, options = {}) {
    const modulePath = options.modulePath ?? "./wasm/calibrate.mjs";
    const { default: createModule } = await import(modulePath);
    const Module = await getModule(createModule);

    const packed = normalizeMultiviewInput({
        objectPoints: input.objectPoints,
        imagePoints: input.objectPoints.map((v) => v.map(() => [0, 0])),
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
        const projectedImagePoints = [];
        let offset = 0;
        for (let v = 0; v < viewCount; v += 1) {
            const count = packed.pointsPerView[v];
            const view = [];
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
