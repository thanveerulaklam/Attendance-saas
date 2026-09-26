# Face recognition

## Old architecture

The kiosk matched faces with `@vladmandic/face-api` 1.7.15 inside a hidden WebView. TensorFlow.js ran SSD MobileNet v1, a 68-point landmark net, and `faceRecognitionNet`. The result was one 128-number embedding compared with Euclidean distance. The default cutoff was `0.55`. ML Kit only decided whether a face was present and cropped it. Enrollment uploaded a photo so the server could compute the same face-api embedding.

That path is still in the app behind `FACE_ENGINE = "legacy_face_api"` in `employee-mobile/src/face/engine.ts`. The production value is `mobilefacenet`. The server still accepts the old photo punch for tablets that have not updated.

## New architecture

```text
CameraX frame
→ ML Kit face box, pose, and 5 landmarks
→ quality gate
→ 112×112 similarity alignment
→ MobileFaceNet TFLite
→ L2-normalized embedding
→ cosine similarity against local templates
→ two agreeing frames
→ existing POST /api/kiosk/mark
```

No photo, embedding, or recognition request is sent for a punch. The server only stores the attendance event.

Recognition does not need the network. Employee templates are downloaded once, cached on the tablet, and kept in native memory. If the network is down, a punch is stored on the tablet and sent later. The server’s existing duplicate-punch cooldown still applies. An offline punch is timestamped when it reaches the server, not when the face was seen.

## Model

| Item | Value |
| --- | --- |
| Name | `mobilefacenet_sface_v1` |
| File | `employee-mobile/modules/punchpay-face/android/src/main/assets/mobilefacenet_sface_v1.tflite` |
| Source | [opencv/opencv_zoo `face_recognition_sface`](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) `face_recognition_sface_2021dec.onnx` |
| Architecture | MobileFaceNet trained with the SFace loss |
| License | Apache License 2.0. The model directory states that all files there are under Apache 2.0. |
| Input | float32 RGB, pixels `0..255`, shape recorded in `mobilefacenet_sface_v1.json` after conversion |
| Output | 128 floats, not assumed to be normalized |
| Match | cosine similarity of L2-normalized vectors |

The published weights are ONNX. `scripts/convert-sface-tflite.py` removes weight tensors from the ONNX inputs, converts with `onnx2tf`, and refuses to save the TFLite file unless a random 112×112 image matches ONNX Runtime within `0.01`. The file in this repo matched with a maximum absolute difference of `0.00000304`. The converted input is float32 NHWC `[1, 112, 112, 3]`.

Do not replace the file with a different MobileFaceNet. Other files use 192 dimensions, different crops, or a `-1..1` input, and old templates would silently stop matching.

## Preprocessing

Enrollment and recognition both use the native camera. The preview is mirrored. The frame that is recognized is not mirrored a second time. The same function runs for both.

ML Kit fast mode supplies the box plus five landmarks: subject’s right eye, left eye, nose, right mouth corner, left mouth corner. Contours and eye-open classification are not requested.

A frame is rejected before the model runs when:

- there is not exactly one face
- the box is smaller than 110 pixels
- the face is far from the center
- roll or pitch is beyond about 25 degrees
- yaw is beyond about 35 degrees during recognition

The five points are warped with the same similarity transform OpenCV uses for this model onto the 112×112 template:

```text
(38.2946, 51.6963), (73.5318, 51.5014), (56.0252, 71.7366),
(41.5493, 92.3655), (70.7299, 92.2041)
```

Pixels are written as RGB floats from 0 to 255. The embedding is L2-normalized in `EmbeddingMath.normalize`. Cosine similarity is the dot product of those unit vectors, in `EmbeddingMath.cosineSimilarity`.

## Threshold

`FACE_MATCH_THRESHOLD` starts at **0.363**, which is OpenCV’s published cosine cutoff for this model (`FR_COSINE`). The server sends it as `match_threshold` on `GET /api/kiosk/face-profiles`. Override it with `KIOSK_MOBILEFACE_MATCH_THRESHOLD`.

0.363 is not a PunchPay measurement. Calibrate it on the office tablet with the people who will actually punch. A development build shows detect, crop, inference, match, and total milliseconds after a match. Do not treat those numbers as a substitute for a tablet measurement.

## Enrollment and migration

face-api embeddings and MobileFaceNet embeddings are different spaces. The app never compares them.

`employee_face_enrollments.embedding` remains the old face-api vector and is now nullable. New columns:

- `recognition_model` = `mobilefacenet_sface_v1`
- `embedding_dimension`
- `embeddings` = 3 to 5 templates

Registration is done on the tablet: straight, slight left, slight right, straight again. Bad frames are not saved. `POST /api/kiosk/employees/:id/face-profile` stores the templates and does not run a recognition model. Employees without this model are shown as “Face registration required”.

## Performance

The interpreter is created once. `AUTO` times one CPU run and one GPU-delegate run and keeps the faster one that initializes. NNAPI is not used. Only one inference runs at a time, and CameraX keeps only the latest frame.

There is no on-device timing in this document because it was not measured on a PunchPay tablet. The first install must be timed on that tablet before the threshold or the delegate choice is treated as final.

## Known limits

- People already enrolled with face-api must register again on the new app.
- Glasses, strong backlight, and more than one person in frame are rejected or can miss.
- There is no liveness check. The native module is the place to add one later. Do not run a second model on every frame until that is a separate decision.
- Embeddings are cached in the app documents directory so recognition works offline. They are not written to logs. SecureStore cannot hold a full branch gallery.
- An offline punch uses the server clock at sync time.
- The 0.363 threshold is the model author’s cutoff, not a PunchPay calibration.
