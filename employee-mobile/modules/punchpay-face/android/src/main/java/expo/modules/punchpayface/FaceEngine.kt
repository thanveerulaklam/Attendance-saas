package expo.modules.punchpayface

import android.content.Context
import android.graphics.Bitmap
import org.json.JSONObject
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal object FaceEngine {
  data class Match(val employeeId: Int, val name: String, val similarity: Float)

  @Volatile var threshold: Float = 0.363f
  @Volatile var ready: Boolean = false
  @Volatile var backendName: String = "cpu"

  var dimension: Int = 0
    private set

  private val lock = Any()
  private var interpreter: Interpreter? = null
  private var gpuDelegate: GpuDelegate? = null
  private var inputBuffer: ByteBuffer? = null
  private var output = FloatArray(0)
  private var layoutNhwc = true
  private var people: List<Person> = emptyList()
  private val timings = linkedMapOf<String, Long>()

  private data class Person(val employeeId: Int, val name: String, val vectors: List<FloatArray>)

  fun initialize(context: Context) {
    if (ready) return
    synchronized(lock) {
      if (ready) return
      val model = loadModel(context)
      val contract = JSONObject(context.assets.open("mobilefacenet_sface_v1.json").bufferedReader().readText())
      val range = contract.getJSONArray("valueRange")
      if (range.getDouble(0) != 0.0 || range.getDouble(1) != 255.0) {
        throw IllegalStateException("Unsupported face model input range")
      }
      layoutNhwc = contract.getString("layout") == "NHWC"
      val chosen = openFastest(model)
      interpreter = chosen.first
      gpuDelegate = chosen.second
      backendName = chosen.third
      val input = chosen.first.getInputTensor(0)
      val bytes = input.numBytes()
      inputBuffer = ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder())
      dimension = chosen.first.getOutputTensor(0).numElements()
      output = FloatArray(dimension)
      if (dimension != contract.getInt("embeddingDimension")) {
        throw IllegalStateException("Face model dimension does not match its contract")
      }
      ready = true
    }
    warmup()
  }

  fun setGalleryJson(json: String) {
    val root = JSONObject(json)
    if (root.has("match_threshold")) {
      threshold = root.getDouble("match_threshold").toFloat()
    }
    val employees = root.getJSONArray("employees")
    val next = ArrayList<Person>(employees.length())
    for (i in 0 until employees.length()) {
      val person = employees.getJSONObject(i)
      val rows = person.getJSONArray("embeddings")
      val vectors = ArrayList<FloatArray>(rows.length())
      for (r in 0 until rows.length()) {
        val row = rows.getJSONArray(r)
        val values = FloatArray(row.length())
        for (c in 0 until row.length()) values[c] = row.getDouble(c).toFloat()
        val normalized = EmbeddingMath.normalize(values) ?: continue
        if (dimension == 0 || normalized.size == dimension) vectors.add(normalized)
      }
      if (vectors.isNotEmpty()) {
        next.add(
          Person(
            person.getInt("employee_id"),
            person.optString("name"),
            vectors,
          )
        )
      }
    }
    synchronized(lock) { people = next }
  }

  fun embed(face: Bitmap): FloatArray? {
    val current = interpreter ?: return null
    val buffer = inputBuffer ?: return null
    if (face.width != FaceAligner.SIZE || face.height != FaceAligner.SIZE) return null
    val pixels = IntArray(FaceAligner.SIZE * FaceAligner.SIZE)
    face.getPixels(pixels, 0, FaceAligner.SIZE, 0, 0, FaceAligner.SIZE, FaceAligner.SIZE)
    buffer.rewind()
    if (layoutNhwc) {
      for (pixel in pixels) {
        buffer.putFloat(red(pixel))
        buffer.putFloat(green(pixel))
        buffer.putFloat(blue(pixel))
      }
    } else {
      for (pixel in pixels) buffer.putFloat(red(pixel))
      for (pixel in pixels) buffer.putFloat(green(pixel))
      for (pixel in pixels) buffer.putFloat(blue(pixel))
    }
    buffer.rewind()
    synchronized(lock) {
      current.run(buffer, output)
    }
    for (value in output) {
      if (!value.isFinite()) return null
    }
    return EmbeddingMath.normalize(output.copyOf())
  }

  fun match(embedding: FloatArray): Match? {
    val gallery = synchronized(lock) { people }
    var best: Match? = null
    for (person in gallery) {
      var score = Float.NEGATIVE_INFINITY
      for (vector in person.vectors) {
        val next = EmbeddingMath.cosineSimilarity(embedding, vector)
        if (next > score) score = next
      }
      if (score >= threshold && (best == null || score > best.similarity)) {
        best = Match(person.employeeId, person.name, score)
      }
    }
    return best
  }

  fun topCandidate(embedding: FloatArray): Match? {
    val gallery = synchronized(lock) { people }
    var best: Match? = null
    for (person in gallery) {
      var score = Float.NEGATIVE_INFINITY
      for (vector in person.vectors) {
        val next = EmbeddingMath.cosineSimilarity(embedding, vector)
        if (next > score) score = next
      }
      if (best == null || score > best.similarity) {
        best = Match(person.employeeId, person.name, score)
      }
    }
    return best
  }

  fun recordTiming(name: String, millis: Long) {
    synchronized(lock) { timings[name] = millis }
  }

  fun performanceStats(): Map<String, Any> {
    synchronized(lock) {
      return linkedMapOf(
        "backend" to backendName,
        "dimension" to dimension,
        "threshold" to threshold,
        "employees" to people.size,
        "timings" to HashMap(timings),
      )
    }
  }

  fun close() {
    synchronized(lock) {
      interpreter?.close()
      interpreter = null
      gpuDelegate?.close()
      gpuDelegate = null
      ready = false
    }
  }

  private fun warmup() {
    val blank = Bitmap.createBitmap(FaceAligner.SIZE, FaceAligner.SIZE, Bitmap.Config.ARGB_8888)
    embed(blank)
    embed(blank)
    blank.recycle()
  }

  private fun loadModel(context: Context): ByteBuffer {
    context.assets.open("mobilefacenet_sface_v1.tflite").use { input ->
      val bytes = input.readBytes()
      val buffer = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
      buffer.put(bytes)
      buffer.rewind()
      return buffer
    }
  }

  private fun openFastest(model: ByteBuffer): Triple<Interpreter, GpuDelegate?, String> {
    val cpu = Interpreter(duplicate(model), Interpreter.Options().setNumThreads(4))
    val cpuMs = benchmark(cpu)
    var gpu: GpuDelegate? = null
    var gpuInterpreter: Interpreter? = null
    var gpuMs = Long.MAX_VALUE
    try {
      gpu = GpuDelegate()
      gpuInterpreter = Interpreter(duplicate(model), Interpreter.Options().addDelegate(gpu))
      gpuMs = benchmark(gpuInterpreter)
    } catch (_: Throwable) {
      gpuInterpreter?.close()
      gpu?.close()
      gpuInterpreter = null
      gpu = null
    }
    return if (gpuInterpreter != null && gpuMs + 5 < cpuMs) {
      cpu.close()
      Triple(gpuInterpreter, gpu, "gpu")
    } else {
      gpuInterpreter?.close()
      gpu?.close()
      Triple(cpu, null, "cpu")
    }
  }

  private fun benchmark(interpreter: Interpreter): Long {
    val input = ByteBuffer.allocateDirect(interpreter.getInputTensor(0).numBytes()).order(ByteOrder.nativeOrder())
    val out = FloatArray(interpreter.getOutputTensor(0).numElements())
    interpreter.run(input, out)
    val started = System.nanoTime()
    interpreter.run(input, out)
    return (System.nanoTime() - started) / 1_000_000
  }

  private fun duplicate(model: ByteBuffer): ByteBuffer {
    val copy = ByteBuffer.allocateDirect(model.capacity()).order(ByteOrder.nativeOrder())
    model.rewind()
    copy.put(model)
    copy.rewind()
    model.rewind()
    return copy
  }

  private fun red(pixel: Int) = ((pixel shr 16) and 0xFF).toFloat()
  private fun green(pixel: Int) = ((pixel shr 8) and 0xFF).toFloat()
  private fun blue(pixel: Int) = (pixel and 0xFF).toFloat()
}
