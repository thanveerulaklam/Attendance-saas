package expo.modules.punchpayface

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

class FaceCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onRecognition by EventDispatcher<Map<String, Any?>>()
  private val previewView = PreviewView(context)
  private val cameraExecutor = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  private val detector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
      .setMinFaceSize(0.12f)
      .build()
  )
  private var cameraProvider: ProcessCameraProvider? = null
  private var started = false
  private var lastStatus = ""
  private var confirmId = -1
  private var confirmStreak = 0
  private var holdEmployee = -1
  private var capturedStep = ""
  private var uprightBitmap: Bitmap? = null
  private val alignedBitmap = Bitmap.createBitmap(FaceAligner.SIZE, FaceAligner.SIZE, Bitmap.Config.ARGB_8888)

  var active: Boolean = false
    set(value) {
      field = value
      if (value) startCamera() else stopCamera()
    }

  var mode: String = "recognize"
  var paused: Boolean = false
    set(value) {
      field = value
      confirmId = -1
      confirmStreak = 0
      holdEmployee = -1
    }
  var enrollStep: String = "straight"
    set(value) {
      field = value
      capturedStep = ""
    }

  init {
    previewView.scaleX = -1f
    previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onDetachedFromWindow() {
    stopCamera()
    super.onDetachedFromWindow()
  }

  private fun startCamera() {
    if (started) return
    val activity = appContext.currentActivity as? LifecycleOwner ?: run {
      emitStatus("Camera is not ready")
      return
    }
    val context = appContext.reactContext ?: this.context
    cameraExecutor.execute {
      try {
        FaceEngine.initialize(context)
        val provider = ProcessCameraProvider.getInstance(context).get()
        post {
          if (!active) return@post
          bind(provider, activity)
        }
      } catch (err: Throwable) {
        emitStatus(err.message ?: "Face recognition could not start")
      }
    }
  }

  private fun bind(provider: ProcessCameraProvider, owner: LifecycleOwner) {
    cameraProvider = provider
    val rotation = previewView.display?.rotation ?: Surface.ROTATION_0
    val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
    preview.targetRotation = rotation
    val analysis = ImageAnalysis.Builder()
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
      .setTargetResolution(Size(640, 480))
      .build()
    analysis.targetRotation = rotation
    analysis.setAnalyzer(cameraExecutor) { image -> analyze(image) }
    provider.unbindAll()
    provider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
    started = true
    emitStatus(if (mode == "enroll") "Look at the camera" else "Ready — look at the camera")
  }

  private fun stopCamera() {
    started = false
    cameraProvider?.unbindAll()
    confirmId = -1
    confirmStreak = 0
    holdEmployee = -1
  }

  private fun analyze(image: ImageProxy) {
    if (!active || !busy.compareAndSet(false, true)) {
      image.close()
      return
    }
    val startedAt = System.nanoTime()
    var imageOpen = true
    try {
      val bitmap = uprightBitmap(image)
      image.close()
      imageOpen = false
      val detectedAt = System.nanoTime()
      val faces = Tasks.await(detector.process(InputImage.fromBitmap(bitmap, 0)))
      val detectionMs = (System.nanoTime() - detectedAt) / 1_000_000
      if (faces.size != 1) {
        confirmId = -1
        confirmStreak = 0
        holdEmployee = -1
        emitStatus(if (faces.isEmpty()) "Ready — look at the camera" else "Only one face should be visible")
        return
      }
      val face = faces[0]
      val rejection = reject(bitmap, face)
      if (rejection != null) {
        confirmId = -1
        confirmStreak = 0
        emitStatus(rejection)
        return
      }
      val cropStarted = System.nanoTime()
      val points = landmarks(face) ?: run {
        emitStatus("Look at the camera")
        return
      }
      FaceAligner.warp(bitmap, points, alignedBitmap)
      val cropMs = (System.nanoTime() - cropStarted) / 1_000_000
      val inferStarted = System.nanoTime()
      val embedding = FaceEngine.embed(alignedBitmap)
      val inferenceMs = (System.nanoTime() - inferStarted) / 1_000_000
      if (embedding == null) {
        emitStatus("Could not read the face")
        return
      }
      val matchStarted = System.nanoTime()
      if (mode == "enroll") {
        if (capturedStep != enrollStep) {
          capturedStep = enrollStep
          onRecognition(
            mapOf(
              "type" to "sample",
              "step" to enrollStep,
              "embedding" to embedding.toList(),
              "dimension" to embedding.size,
            )
          )
        }
        return
      }
      val candidate = if (mode == "calibrate") FaceEngine.topCandidate(embedding) else FaceEngine.match(embedding)
      val matchMs = (System.nanoTime() - matchStarted) / 1_000_000
      val totalMs = (System.nanoTime() - startedAt) / 1_000_000
      FaceEngine.recordTiming("face_detection_ms", detectionMs)
      FaceEngine.recordTiming("crop_ms", cropMs)
      FaceEngine.recordTiming("inference_ms", inferenceMs)
      FaceEngine.recordTiming("matching_ms", matchMs)
      FaceEngine.recordTiming("total_recognition_ms", totalMs)
      if (mode == "calibrate") {
        onRecognition(
          mapOf(
            "type" to "calibration",
            "employeeId" to (candidate?.employeeId ?: 0),
            "name" to (candidate?.name ?: ""),
            "similarity" to (candidate?.similarity ?: 0f),
            "threshold" to FaceEngine.threshold,
            "matched" to (candidate != null && candidate.similarity >= FaceEngine.threshold),
            "detectionMs" to detectionMs,
            "cropMs" to cropMs,
            "inferenceMs" to inferenceMs,
            "matchingMs" to matchMs,
            "totalMs" to totalMs,
          )
        )
        return
      }
      if (candidate == null || paused || candidate.employeeId == holdEmployee) {
        if (candidate == null) {
          confirmId = -1
          confirmStreak = 0
          emitStatus("Face not recognized — try again")
        }
        return
      }
      if (candidate.employeeId == confirmId) confirmStreak += 1 else {
        confirmId = candidate.employeeId
        confirmStreak = 1
      }
      if (confirmStreak < 2) {
        emitStatus("Recognizing…")
        return
      }
      holdEmployee = candidate.employeeId
      onRecognition(
        mapOf(
          "type" to "match",
          "employeeId" to candidate.employeeId,
          "name" to candidate.name,
          "similarity" to candidate.similarity,
          "threshold" to FaceEngine.threshold,
          "embedding" to embedding.toList(),
          "dimension" to embedding.size,
          "detectionMs" to detectionMs,
          "cropMs" to cropMs,
          "inferenceMs" to inferenceMs,
          "matchingMs" to matchMs,
          "totalMs" to totalMs,
        )
      )
    } catch (err: Throwable) {
      if (imageOpen) image.close()
      emitStatus(err.message ?: "Face recognition failed")
    } finally {
      busy.set(false)
    }
  }

  private fun reject(bitmap: Bitmap, face: Face): String? {
    val box = face.boundingBox
    if (box.width() < 110 || box.height() < 110) return "Move closer"
    val yaw = face.headEulerAngleY
    val pitch = face.headEulerAngleX
    val roll = face.headEulerAngleZ
    if (abs(roll) > 25f || abs(pitch) > 22f) return "Keep your face straight"
    val centerX = box.exactCenterX()
    val centerY = box.exactCenterY()
    if (abs(centerX - bitmap.width / 2f) > bitmap.width * 0.30f) return "Center your face"
    if (abs(centerY - bitmap.height / 2f) > bitmap.height * 0.34f) return "Center your face"
    if (mode == "enroll") {
      return when (enrollStep) {
        "left" -> if (yaw < 12f) "Turn slightly to your left" else null
        "right" -> if (yaw > -12f) "Turn slightly to your right" else null
        else -> if (abs(yaw) > 12f) "Look straight at the camera" else null
      }
    }
    if (abs(yaw) > 35f) return "Look at the camera"
    return null
  }

  private fun landmarks(face: Face): Array<FloatArray>? {
    val rightEye = face.getLandmark(FaceLandmark.RIGHT_EYE)?.position ?: return null
    val leftEye = face.getLandmark(FaceLandmark.LEFT_EYE)?.position ?: return null
    val nose = face.getLandmark(FaceLandmark.NOSE_BASE)?.position ?: return null
    val mouthRight = face.getLandmark(FaceLandmark.MOUTH_RIGHT)?.position ?: return null
    val mouthLeft = face.getLandmark(FaceLandmark.MOUTH_LEFT)?.position ?: return null
    return arrayOf(
      floatArrayOf(rightEye.x, rightEye.y),
      floatArrayOf(leftEye.x, leftEye.y),
      floatArrayOf(nose.x, nose.y),
      floatArrayOf(mouthRight.x, mouthRight.y),
      floatArrayOf(mouthLeft.x, mouthLeft.y),
    )
  }

  private fun uprightBitmap(image: ImageProxy): Bitmap {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val width = image.width
    val height = image.height
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val raw = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val pixels = IntArray(width * height)
    buffer.rewind()
    val row = ByteArray(rowStride)
    for (y in 0 until height) {
      val available = buffer.remaining()
      if (available <= 0) break
      buffer.get(row, 0, rowStride.coerceAtMost(available))
      for (x in 0 until width) {
        val index = x * pixelStride
        if (index + 2 >= row.size) break
        val r = row[index].toInt() and 0xFF
        val g = row[index + 1].toInt() and 0xFF
        val b = row[index + 2].toInt() and 0xFF
        pixels[y * width + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
      }
    }
    raw.setPixels(pixels, 0, width, 0, 0, width, height)
    val rotation = image.imageInfo.rotationDegrees
    if (rotation == 0) {
      uprightBitmap?.recycle()
      uprightBitmap = raw
      return raw
    }
    val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
    val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
    raw.recycle()
    uprightBitmap?.recycle()
    uprightBitmap = rotated
    return rotated
  }

  private fun emitStatus(message: String) {
    if (message == lastStatus) return
    lastStatus = message
    onRecognition(mapOf("type" to "status", "message" to message))
  }
}
