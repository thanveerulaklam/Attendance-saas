#!/usr/bin/env python3
"""Convert OpenCV Zoo's Apache-2.0 MobileFaceNet (SFace) ONNX model to float32 TFLite.

The ONNX file is the published artifact. OpenCV feeds it RGB float32 pixels in
0..255, NCHW. This script checks that contract, converts, and refuses to write
a TFLite file whose outputs disagree with ONNX Runtime.
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np

_np_load = np.load


def _load_allow_pickle(*args, **kwargs):
    kwargs.setdefault("allow_pickle", True)
    return _np_load(*args, **kwargs)


np.load = _load_allow_pickle

import onnx
import onnx2tf.onnx2tf as onnx2tf_mod
import onnx2tf.utils.common_functions as onnx2tf_common
import onnxruntime as ort
import tensorflow as tf
from onnx2tf import convert

def _fake_calibration_images():
    return np.zeros((20, 112, 112, 3), dtype=np.float32)

onnx2tf_common.download_test_image_data = _fake_calibration_images
onnx2tf_mod.download_test_image_data = _fake_calibration_images

ROOT = Path(__file__).resolve().parents[1]
ONNX_PATH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/sface-src/face_recognition_sface_2021dec.onnx")
OUT_DIR = ROOT / "employee-mobile/modules/punchpay-face/android/src/main/assets"
TFLITE_NAME = "mobilefacenet_sface_v1.tflite"
CONTRACT_NAME = "mobilefacenet_sface_v1.json"


def main():
    if not ONNX_PATH.is_file():
        raise SystemExit(f"ONNX model not found: {ONNX_PATH}")

    fixed_onnx = fix_onnx_initializers(ONNX_PATH)
    session = ort.InferenceSession(str(fixed_onnx), providers=["CPUExecutionProvider"])
    onnx_input = session.get_inputs()[0]
    onnx_output = session.get_outputs()[0]
    if list(onnx_input.shape) != [1, 3, 112, 112]:
        raise SystemExit(f"Unexpected ONNX input shape: {onnx_input.shape}")
    if list(onnx_output.shape)[-1] != 128 and onnx_output.shape[-1] is not None:
        raise SystemExit(f"Unexpected ONNX output shape: {onnx_output.shape}")

    work = Path(tempfile.mkdtemp(prefix="sface-tflite-"))
    try:
        convert(
            input_onnx_file_path=str(fixed_onnx),
            output_folder_path=str(work),
            non_verbose=True,
            verbosity="error",
        )
        candidates = sorted(work.glob("*float32.tflite"))
        if not candidates:
            candidates = sorted(work.glob("*.tflite"))
        if not candidates:
            raise SystemExit(f"onnx2tf did not write a tflite file in {work}")
        converted = candidates[0]

        image = np.random.default_rng(7).integers(0, 256, size=(112, 112, 3)).astype(np.float32)
        nchw = np.transpose(image, (2, 0, 1))[None, ...]
        onnx_embedding = np.array(session.run(None, {onnx_input.name: nchw})[0]).reshape(-1)

        interpreter = tf.lite.Interpreter(model_path=str(converted))
        interpreter.allocate_tensors()
        details_in = interpreter.get_input_details()[0]
        details_out = interpreter.get_output_details()[0]
        input_shape = [int(v) for v in details_in["shape"]]
        output_shape = [int(v) for v in details_out["shape"]]
        tensor = feed_tensor(image, input_shape, details_in["dtype"])
        interpreter.set_tensor(details_in["index"], tensor)
        interpreter.invoke()
        tflite_embedding = np.array(interpreter.get_tensor(details_out["index"])).reshape(-1).astype(np.float32)

        if tflite_embedding.shape != onnx_embedding.shape:
            raise SystemExit(
                f"Output rank mismatch onnx={onnx_embedding.shape} tflite={tflite_embedding.shape}"
            )
        max_abs = float(np.max(np.abs(tflite_embedding - onnx_embedding)))
        if max_abs > 1e-2:
            raise SystemExit(f"TFLite output disagrees with ONNX. max abs diff={max_abs}")

        layout = "NHWC" if input_shape[-1] == 3 else "NCHW" if input_shape[1] == 3 else "UNKNOWN"
        if layout == "UNKNOWN":
            raise SystemExit(f"Unsupported TFLite input shape: {input_shape}")

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(converted, OUT_DIR / TFLITE_NAME)
        contract = {
            "model": "mobilefacenet_sface_v1",
            "source": "https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface",
            "sourceFile": "face_recognition_sface_2021dec.onnx",
            "license": "Apache-2.0",
            "architecture": "MobileFaceNet trained with SFace loss",
            "inputShape": input_shape,
            "inputType": np.dtype(details_in["dtype"]).name,
            "layout": layout,
            "color": "RGB",
            "valueRange": [0, 255],
            "outputShape": output_shape,
            "outputType": np.dtype(details_out["dtype"]).name,
            "embeddingDimension": int(tflite_embedding.shape[0]),
            "embeddingAlreadyNormalized": False,
            "onnxAgreementMaxAbs": max_abs,
        }
        (OUT_DIR / CONTRACT_NAME).write_text(json.dumps(contract, indent=2) + "\n")
        print(json.dumps({"wrote": str(OUT_DIR / TFLITE_NAME), "maxAbs": max_abs, "contract": contract}, indent=2))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def fix_onnx_initializers(path: Path) -> Path:
    model = onnx.load(str(path))
    initializer_names = {item.name for item in model.graph.initializer}
    kept = [item for item in model.graph.input if item.name not in initializer_names]
    del model.graph.input[:]
    model.graph.input.extend(kept)
    fixed = path.with_name(path.stem + ".fixed.onnx")
    onnx.save(model, str(fixed))
    return fixed


def feed_tensor(image_nhwc, input_shape, dtype):
    if dtype != np.float32:
        raise SystemExit(f"Only float32 TFLite input is accepted, got {dtype}")
    if input_shape == [1, 112, 112, 3]:
        return image_nhwc[None, ...]
    if input_shape == [1, 3, 112, 112]:
        return np.transpose(image_nhwc, (2, 0, 1))[None, ...]
    raise SystemExit(f"Unsupported TFLite input shape: {input_shape}")


if __name__ == "__main__":
    main()
