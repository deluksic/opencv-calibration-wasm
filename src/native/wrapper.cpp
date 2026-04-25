#include <opencv2/calib3d.hpp>
#include <opencv2/core.hpp>

extern "C" {

double calibrate_camera_ro(
    float* objectPoints,
    float* imagePoints,
    int* pointsPerView,
    int viewCount,
    int width,
    int height,
    int iFixedPoint,
    int flags,
    int termType,
    int termCount,
    float termEps,
    float* cameraMatrixInit9,
    int hasCameraMatrixInit,
    float* distCoeffsInit,
    int distCoeffsInitCount,
    float* cameraMatrixOut9,
    float* distCoeffsOut,
    int maxDistCoeffs,
    float* rvecsOut3N,
    float* tvecsOut3N,
    int maxViews,
    float* newObjPointsOutXYZ,
    int maxNewObjPoints,
    int* distCoeffCountOut,
    int* newObjPointCountOut
) {
    std::vector<std::vector<cv::Point3f>> objVec;
    std::vector<std::vector<cv::Point2f>> imgVec;
    objVec.reserve(viewCount);
    imgVec.reserve(viewCount);

    int pointOffset = 0;
    for (int viewIdx = 0; viewIdx < viewCount; viewIdx++) {
        const int pointCount = pointsPerView[viewIdx];
        std::vector<cv::Point3f> obj;
        std::vector<cv::Point2f> img;
        obj.reserve(pointCount);
        img.reserve(pointCount);

        for (int i = 0; i < pointCount; i++) {
            const int pointIndex = pointOffset + i;
            obj.emplace_back(
                objectPoints[pointIndex * 3 + 0],
                objectPoints[pointIndex * 3 + 1],
                objectPoints[pointIndex * 3 + 2]
            );
            img.emplace_back(
                imagePoints[pointIndex * 2 + 0],
                imagePoints[pointIndex * 2 + 1]
            );
        }

        objVec.push_back(std::move(obj));
        imgVec.push_back(std::move(img));
        pointOffset += pointCount;
    }

    cv::Mat K = cv::Mat::eye(3, 3, CV_64F);
    if (hasCameraMatrixInit) {
        for (int i = 0; i < 9; i++) {
            K.at<double>(i / 3, i % 3) = static_cast<double>(cameraMatrixInit9[i]);
        }
    }

    cv::Mat dist;
    if (distCoeffsInitCount > 0) {
        dist = cv::Mat::zeros(1, distCoeffsInitCount, CV_64F);
        for (int i = 0; i < distCoeffsInitCount; i++) {
            dist.at<double>(0, i) = static_cast<double>(distCoeffsInit[i]);
        }
    }
    std::vector<cv::Mat> rvecs, tvecs;
    std::vector<cv::Point3f> newObjPoints;
    cv::TermCriteria criteria(termType, termCount, termEps);

    const double retval = cv::calibrateCameraRO(
        objVec,
        imgVec,
        cv::Size(width, height),
        iFixedPoint,
        K,
        dist,
        rvecs,
        tvecs,
        newObjPoints,
        flags,
        criteria
    );

    for (int i = 0; i < 9; i++) {
        cameraMatrixOut9[i] = static_cast<float>(K.at<double>(i / 3, i % 3));
    }

    const int distCount = dist.rows * dist.cols;
    const double* distPtr = dist.ptr<double>(0);
    const int distCopyCount = (distCount < maxDistCoeffs) ? distCount : maxDistCoeffs;
    for (int i = 0; i < distCopyCount; i++) {
        distCoeffsOut[i] = static_cast<float>(distPtr[i]);
    }
    for (int i = distCopyCount; i < maxDistCoeffs; i++) {
        distCoeffsOut[i] = 0.0f;
    }
    *distCoeffCountOut = distCount;

    const int rvecCopyCount = (static_cast<int>(rvecs.size()) < maxViews)
        ? static_cast<int>(rvecs.size())
        : maxViews;
    for (int viewIdx = 0; viewIdx < rvecCopyCount; viewIdx++) {
        for (int i = 0; i < 3; i++) {
            rvecsOut3N[viewIdx * 3 + i] = static_cast<float>(rvecs[viewIdx].at<double>(i, 0));
            tvecsOut3N[viewIdx * 3 + i] = static_cast<float>(tvecs[viewIdx].at<double>(i, 0));
        }
    }
    for (int viewIdx = rvecCopyCount; viewIdx < maxViews; viewIdx++) {
        rvecsOut3N[viewIdx * 3 + 0] = 0.0f;
        rvecsOut3N[viewIdx * 3 + 1] = 0.0f;
        rvecsOut3N[viewIdx * 3 + 2] = 0.0f;
        tvecsOut3N[viewIdx * 3 + 0] = 0.0f;
        tvecsOut3N[viewIdx * 3 + 1] = 0.0f;
        tvecsOut3N[viewIdx * 3 + 2] = 0.0f;
    }

    const int newObjCount = static_cast<int>(newObjPoints.size());
    const int newObjCopyCount = (newObjCount < maxNewObjPoints) ? newObjCount : maxNewObjPoints;
    for (int i = 0; i < newObjCopyCount; i++) {
        newObjPointsOutXYZ[i * 3 + 0] = newObjPoints[i].x;
        newObjPointsOutXYZ[i * 3 + 1] = newObjPoints[i].y;
        newObjPointsOutXYZ[i * 3 + 2] = newObjPoints[i].z;
    }
    *newObjPointCountOut = newObjCount;

    return retval;
}

int solve_pnp(
    float* objectPoints,
    float* imagePoints,
    int pointCount,
    float* cameraMatrix9,
    float* distCoeffs,
    int distCoeffCount,
    int flags,
    int useExtrinsicGuess,
    float* rvecInOut3,
    float* tvecInOut3
) {
    std::vector<cv::Point3f> obj;
    std::vector<cv::Point2f> img;
    obj.reserve(pointCount);
    img.reserve(pointCount);
    for (int i = 0; i < pointCount; i++) {
        obj.emplace_back(
            objectPoints[i * 3 + 0],
            objectPoints[i * 3 + 1],
            objectPoints[i * 3 + 2]
        );
        img.emplace_back(
            imagePoints[i * 2 + 0],
            imagePoints[i * 2 + 1]
        );
    }

    cv::Mat K = cv::Mat::eye(3, 3, CV_64F);
    for (int i = 0; i < 9; i++) {
        K.at<double>(i / 3, i % 3) = static_cast<double>(cameraMatrix9[i]);
    }

    cv::Mat dist;
    if (distCoeffCount > 0) {
        dist = cv::Mat::zeros(1, distCoeffCount, CV_64F);
        for (int i = 0; i < distCoeffCount; i++) {
            dist.at<double>(0, i) = static_cast<double>(distCoeffs[i]);
        }
    }

    cv::Mat rvec = cv::Mat::zeros(3, 1, CV_64F);
    cv::Mat tvec = cv::Mat::zeros(3, 1, CV_64F);
    if (useExtrinsicGuess) {
        for (int i = 0; i < 3; i++) {
            rvec.at<double>(i, 0) = static_cast<double>(rvecInOut3[i]);
            tvec.at<double>(i, 0) = static_cast<double>(tvecInOut3[i]);
        }
    }

    const bool ok = cv::solvePnP(
        obj,
        img,
        K,
        dist,
        rvec,
        tvec,
        useExtrinsicGuess != 0,
        flags
    );

    if (ok) {
        for (int i = 0; i < 3; i++) {
            rvecInOut3[i] = static_cast<float>(rvec.at<double>(i, 0));
            tvecInOut3[i] = static_cast<float>(tvec.at<double>(i, 0));
        }
    }

    return ok ? 1 : 0;
}

void project_points(
    float* objectPoints,
    int* pointsPerView,
    int viewCount,
    float* rvecsOut3N,
    float* tvecsOut3N,
    float* cameraMatrix9,
    float* distCoeffs,
    int distCoeffCount,
    float* reprojectedImagePointsOut2N
) {
    cv::Mat K = cv::Mat::eye(3, 3, CV_64F);
    for (int i = 0; i < 9; i++) {
        K.at<double>(i / 3, i % 3) = static_cast<double>(cameraMatrix9[i]);
    }

    cv::Mat dist = cv::Mat::zeros(1, distCoeffCount, CV_64F);
    for (int i = 0; i < distCoeffCount; i++) {
        dist.at<double>(0, i) = static_cast<double>(distCoeffs[i]);
    }

    int pointOffset = 0;
    for (int viewIdx = 0; viewIdx < viewCount; viewIdx++) {
        const int pointCount = pointsPerView[viewIdx];

        std::vector<cv::Point3f> obj;
        obj.reserve(pointCount);
        for (int i = 0; i < pointCount; i++) {
            const int pointIndex = pointOffset + i;
            obj.emplace_back(
                objectPoints[pointIndex * 3 + 0],
                objectPoints[pointIndex * 3 + 1],
                objectPoints[pointIndex * 3 + 2]
            );
        }

        cv::Mat rvec = cv::Mat::zeros(3, 1, CV_64F);
        cv::Mat tvec = cv::Mat::zeros(3, 1, CV_64F);
        for (int i = 0; i < 3; i++) {
            rvec.at<double>(i, 0) = static_cast<double>(rvecsOut3N[viewIdx * 3 + i]);
            tvec.at<double>(i, 0) = static_cast<double>(tvecsOut3N[viewIdx * 3 + i]);
        }

        std::vector<cv::Point2f> proj;
        cv::projectPoints(obj, rvec, tvec, K, dist, proj);

        for (int i = 0; i < pointCount; i++) {
            const int pointIndex = pointOffset + i;
            reprojectedImagePointsOut2N[pointIndex * 2 + 0] = proj[i].x;
            reprojectedImagePointsOut2N[pointIndex * 2 + 1] = proj[i].y;
        }

        pointOffset += pointCount;
    }
}

}
