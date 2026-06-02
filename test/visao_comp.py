import cv2
import numpy as np
import math
from pupil_apriltags import Detector

fx = 818.035048081
fy = 818.035048081
cx = 362.333072996
cy = 212.410243815

camera_matrix = np.array([
    [fx, 0, cx],
    [0, fy, cy],
    [0, 0, 1]
], dtype=np.float64)

dist_coeffs = np.array([
    -0.245766726354,
    3.02541650022,
    -0.019545346502,
    0.00572149972098,
    -7.19033666473
])

TAG_SIZE = 0.04

at_detector = Detector(families='tag25h9')

axis_length = TAG_SIZE * 1.5
axis_points = np.array([
    [0, 0, 0],
    [axis_length, 0, 0],
    [0, axis_length, 0],
    [0, 0, axis_length]
], dtype=np.float32)

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("ERRO: Camera nao encontrada.")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        print("ERRO: Falha ao capturar frame.")
        break

    h, w = frame.shape[:2]

    new_camera_matrix, roi = cv2.getOptimalNewCameraMatrix(
        camera_matrix, dist_coeffs, (w, h), 1, (w, h)
    )

    undistorted_frame = cv2.undistort(
        frame, camera_matrix, dist_coeffs, None, new_camera_matrix
    )

    gray = cv2.cvtColor(undistorted_frame, cv2.COLOR_BGR2GRAY)

    results = at_detector.detect(
        gray,
        estimate_tag_pose=True,
        camera_params=[
            new_camera_matrix[0, 0],
            new_camera_matrix[1, 1],
            new_camera_matrix[0, 2],
            new_camera_matrix[1, 2]
        ],
        tag_size=TAG_SIZE
    )

    if len(results) == 0:
        cv2.putText(
            undistorted_frame, "NO TAG", (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2
        )
    else:
        for r in results:
            t = r.pose_t
            x = t[0][0]
            y = t[1][0]
            z = t[2][0]
            
            distancia = math.sqrt(x**2 + y**2 + z**2)
            
            R = r.pose_R
            
            pitch = math.atan2(R[2, 1], R[2, 2])
            yaw = math.atan2(-R[2, 0], math.sqrt(R[2, 1]**2 + R[2, 2]**2))
            roll = math.atan2(R[1, 0], R[0, 0])
            
            pitch_deg = math.degrees(pitch)
            yaw_deg = math.degrees(yaw)
            roll_deg = math.degrees(roll)

            corners = r.corners
            for i in range(4):
                pt1 = (int(corners[i][0]), int(corners[i][1]))
                pt2 = (int(corners[(i + 1) % 4][0]), int(corners[(i + 1) % 4][1]))
                cv2.line(undistorted_frame, pt1, pt2, (0, 255, 0), 2)

            rvec, _ = cv2.Rodrigues(R)
            tvec = t

            img_points, _ = cv2.projectPoints(
                axis_points, rvec, tvec, new_camera_matrix, np.zeros(5)
            )
            
            centro = (int(img_points[0].ravel()[0]), int(img_points[0].ravel()[1]))
            eixo_x = (int(img_points[1].ravel()[0]), int(img_points[1].ravel()[1]))
            eixo_y = (int(img_points[2].ravel()[0]), int(img_points[2].ravel()[1]))
            eixo_z = (int(img_points[3].ravel()[0]), int(img_points[3].ravel()[1]))

            cv2.line(undistorted_frame, centro, eixo_x, (0, 0, 255), 2)
            cv2.line(undistorted_frame, centro, eixo_y, (0, 255, 0), 2)
            cv2.line(undistorted_frame, centro, eixo_z, (255, 0, 0), 2)

            text_x = int(corners[0][0])
            text_y = int(corners[0][1])

            cv2.putText(
                undistorted_frame,
                f"ID: {r.tag_id} | D: {distancia:.2f}m",
                (text_x, text_y - 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2
            )
            
            cv2.putText(
                undistorted_frame,
                f"P:{pitch_deg:.1f} Y:{yaw_deg:.1f} R:{roll_deg:.1f}",
                (text_x, text_y - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1
            )

            print(
                f"TAG[{r.tag_id}] -> X={x:.2f}m Y={y:.2f}m Z={z:.2f}m | "
                f"Dist={distancia:.2f}m | P={pitch_deg:.1f} Y={yaw_deg:.1f} R={roll_deg:.1f}"
            )

    cv2.imshow("Tracking", undistorted_frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()