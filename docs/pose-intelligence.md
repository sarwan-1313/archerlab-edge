# On-device pose intelligence

ArcherLab Edge uses `@mediapipe/tasks-vision` and the official MediaPipe Pose Landmarker Lite float16 model. Both the model and WebAssembly runtime are served by the Vite application itself:

- Model: `/models/pose_landmarker_lite.task`
- Runtime: `/mediapipe/wasm/`
- Upstream model: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`

No camera frame is uploaded. The browser passes decoded video frames directly from the local `<video>` element to MediaPipe's local WebAssembly runtime.

## Runtime architecture

`MediaStream → HTML video → PoseLandmarker → internal pose result → canvas overlay`

The pose service retains one initialized landmarker instance. Page hooks own only their processing loop. The loop is throttled to a target of 20 inferences per second and rejects repeated `video.currentTime` values. UI summary state updates less frequently than inference, while the overlay reads the latest result from a ref.

Navigation or camera shutdown cancels the page's animation frame, clears the latest pose result, and causes the canvas overlay to clear. The model remains warm for later page visits.

## Manual test checklist

- [ ] Start camera
- [ ] MediaPipe loads
- [ ] Stand in frame
- [ ] Skeleton appears
- [ ] Move arms
- [ ] Skeleton follows
- [ ] Leave frame
- [ ] Athlete Detected becomes No Athlete
- [ ] Return to frame
- [ ] Detection resumes
- [ ] Resize browser
- [ ] Skeleton remains aligned
- [ ] Stop camera
- [ ] Skeleton disappears
- [ ] Navigate away
- [ ] Processing stops

## Performance checklist

- [x] PoseLandmarker instance is cached by the service
- [x] One requestAnimationFrame inference loop per mounted pose page
- [x] Inference is throttled to 20 FPS
- [x] Duplicate decoded video frames are skipped
- [x] High-frequency pose results are retained in a ref
- [x] Camera shutdown and navigation cancel processing
- [x] No camera or video upload path exists

