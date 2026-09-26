package expo.modules.punchpayface

internal object EmbeddingMath {
  fun normalize(values: FloatArray): FloatArray? {
    var sum = 0.0
    for (value in values) {
      if (!value.isFinite()) return null
      sum += value.toDouble() * value.toDouble()
    }
    if (sum <= 1e-12) return null
    val inv = 1.0 / kotlin.math.sqrt(sum)
    val out = FloatArray(values.size)
    for (i in values.indices) {
      out[i] = (values[i] * inv).toFloat()
    }
    return out
  }

  fun cosineSimilarity(left: FloatArray, right: FloatArray): Float {
    if (left.size != right.size || left.isEmpty()) return Float.NEGATIVE_INFINITY
    var dot = 0.0
    for (i in left.indices) {
      dot += left[i].toDouble() * right[i].toDouble()
    }
    return dot.toFloat()
  }
}
