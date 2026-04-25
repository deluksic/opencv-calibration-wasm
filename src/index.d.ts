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

export function initCalibrator(options?: { modulePath?: string }): Promise<void>;
export function calibrateCameraRO(
  input: CalibrateCameraROInput,
  options?: { modulePath?: string }
): Promise<CalibrateCameraROResult>;
export function projectPoints(
  input: ProjectPointsInput,
  options?: { modulePath?: string }
): Promise<ProjectPointsResult>;
