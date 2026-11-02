# Bow and arrow detection: building a dataset

ArcherLab Edge tracks the archer's body but not the bow, the arrow or the target face. A small object detector for those three things would let the app measure bow cant, arrow angle and where the target sits in the frame. This page covers **step 1: building a training dataset from your own footage**. No model is trained or shipped yet, and nothing here changes how the app scores shots.

## 1. The Dataset tools page

Profile → **Coach tools** → *Show coach tools*, then **Dataset tools** (`/dataset-tools`). The page is hidden while Coach tools is off.

1. **Pick a clip.**
   - **A saved analysis** (a video analysed on this device with its video kept). Frames are sampled once a second, plus **every frame within ±0.3 s of each detected release**, where the bow and arrow move fastest and are hardest to detect. A dashed **suggested bow box** is pre-filled around the bow hand from the pose.
   - **Any video file.** Frames are sampled once a second only, with no suggestions.
2. **Label each frame.** Choose a class (**bow**, **arrow**, **target-face**) and drag a box. Click a box to select it, then **Delete box** to remove it. **Accept suggestion** turns the dashed bow box into a real label. Adjust it by deleting it and drawing a tighter one if it is off.
3. **Save and next** marks the frame as reviewed. Only reviewed frames are exported, because a frame with no boxes becomes a *negative* example ("nothing here"). An unchecked frame isn't a true negative. Suggestions you have not accepted are never exported.
4. **Export COCO ZIP** writes `images/*.jpg` (full resolution, JPEG quality 0.92) and `labels.json`. Category ids are `1 bow`, `2 arrow`, `3 target-face`, and id 0 is left free for background. File names hold the clip name and the time in milliseconds, so ZIPs from several clips can be merged.

Labelling tips:

- Box the **whole bow from tip to tip**, including the parts behind the archer's arm. Include the stabilisers only if you decide to everywhere; consistency matters more than the choice.
- Box the **arrow shaft** from the nock to the point while it is visible. Skip it once it is a blur in flight.
- Box the **target face** (the scoring rings), not the boss or the stand.
- If an object is cut off by the frame edge, box the visible part.

The code is in `src/dataset/`: sampling (`sampling.ts`), the pose-based suggestion (`bowBox.ts`), the COCO builder (`coco.ts`) and a small stored-only ZIP writer (`zip.ts`, no dependency). The tunables are in `config.ts`.

## 2. How many images

- **Start with 300–500 labelled images**, spread across conditions instead of drawn from one session. Fifty frames from each of eight sessions beat 400 frames from one.
- Vary **light** (indoor halls, overcast, bright sun, evening), **camera angle** (broadside, oblique, down the line, high and low), **distance**, **bow type** (recurve, compound, barebow, traditional, longbow) and **archer** (handedness, clothing, size).
- Include **hard cases** on purpose: bows partly hidden by the body, cluttered ranges with other bows on racks, and target faces far away or at an angle.
- Hold back a **test set** of whole sessions (not random frames from the training sessions, which look nearly identical) to measure the model honestly.
- Expect to add data after the first model. Run it on new footage, label what it gets wrong, and retrain.

## 3. Privacy

- **Only use footage you have the right to use**, with the same consent rules as [validation](validation.md). That means written consent where a club or school is involved, and a parent or guardian's consent for under-18s.
- **No other people's faces without their consent.** Ranges are busy, so crop or skip frames with recognisable bystanders, or get their agreement. Unlike the validation fixtures, this dataset **contains images**, not just landmarks.
- **Keep the dataset private.** Don't commit it to this repository, don't upload it to public dataset hubs, and store it encrypted or in a private location. Delete it when the project no longer needs it.
- The Dataset tools page sends nothing anywhere. Frames are decoded and encoded in the browser, and the ZIP is saved to your device.

## 4. Training options

Both options below are permissively licensed (Apache-2.0) and suit this MIT project. Check the licences again when you start, because they can change between releases.

### Option A: MediaPipe Model Maker object detector

- **Licence:** Apache-2.0 (`mediapipe-model-maker` on PyPI, from the MediaPipe repository).
- **Input:** reads this export directly. `object_detector.Dataset.from_coco_folder(path)` expects a folder with `images/` and `labels.json`, which is the ZIP's layout once unzipped.
- **Output:** a `.tflite` model with its label map in the metadata. It runs in the **MediaPipe Object Detector task** (`ObjectDetector` in `@mediapipe/tasks-vision`). That's the same package and self-hosted WASM runtime the app already uses for Pose, Hand and Face Landmarker, so no new runtime is needed. The model would go in `public/models/` like the others.
- **Models:** small MobileNet-based detectors trained by transfer learning, so a few hundred images can be enough to start.
- **Caveat:** Google says Model Maker is **no longer actively maintained**. It may need an older Python and TensorFlow version, and fixes are unlikely. It is the quickest path to a working model, but plan for it to stop installing someday.

### Option B: YOLOX exported to ONNX

- **Licence:** Apache-2.0 (Megvii's YOLOX repository).
- **Input:** COCO format, so it uses this export after rearranging the files into YOLOX's expected folders (for example `train2017/`, `val2017/` and `annotations/instances_train2017.json`). Set `num_classes = 3` in the experiment file.
- **Output:** YOLOX's ONNX export script produces an `.onnx` model. In the browser it runs with **onnxruntime-web** (MIT) on WebGPU or WASM. That's a new dependency, and pre- and post-processing (resize, decode, non-maximum suppression) would need writing in TypeScript.
- **Models:** YOLOX-Nano and YOLOX-Tiny are small enough for phones. It is actively used, more accurate than the MobileNet detectors and gives more control, at the cost of more integration work.

Whichever option you choose, the assets stay self-hosted (no CDN), inference stays on the device, and any detector output must be presented as an **experimental measurement**, like auto release detection.

## 5. Why not Ultralytics YOLO

Ultralytics YOLO (YOLOv5, YOLOv8, YOLO11 and later) is popular and easy to train, but it is licensed under **AGPL-3.0**, and Ultralytics treats trained models and the code that serves them as covered. Shipping one in a web app, where users interact with it over a network, would bring AGPL obligations to the app. That doesn't suit an MIT-licensed project. The alternative is a paid Ultralytics Enterprise licence. Use the Apache-2.0 options above instead, and avoid copying Ultralytics code, export scripts or pretrained weights into this repository.
