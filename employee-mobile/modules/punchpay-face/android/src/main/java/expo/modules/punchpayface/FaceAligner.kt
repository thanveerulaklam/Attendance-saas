package expo.modules.punchpayface

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import kotlin.math.sqrt

/**
 * 5-point similarity warp used by OpenCV FaceRecognizerSF for this MobileFaceNet.
 * Source order is the subject's right eye, left eye, nose, right mouth, left mouth.
 * Destination is the 112x112 ArcFace template shipped with the SFace model.
 */
internal object FaceAligner {
  const val SIZE = 112

  private val dst = arrayOf(
    floatArrayOf(38.2946f, 51.6963f),
    floatArrayOf(73.5318f, 51.5014f),
    floatArrayOf(56.0252f, 71.7366f),
    floatArrayOf(41.5493f, 92.3655f),
    floatArrayOf(70.7299f, 92.2041f),
  )
  private const val dstMeanX = 56.0262
  private const val dstMeanY = 71.9008

  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

  fun warp(source: Bitmap, points: Array<FloatArray>, output: Bitmap) {
    val transform = similarity(points)
    val matrix = Matrix()
    matrix.setValues(
      floatArrayOf(
        transform[0], transform[1], transform[2],
        transform[3], transform[4], transform[5],
        0f, 0f, 1f,
      )
    )
    val canvas = Canvas(output)
    canvas.drawColor(Color.BLACK)
    canvas.drawBitmap(source, matrix, paint)
  }

  private fun similarity(src: Array<FloatArray>): FloatArray {
    var srcMeanX = 0.0
    var srcMeanY = 0.0
    for (point in src) {
      srcMeanX += point[0]
      srcMeanY += point[1]
    }
    srcMeanX /= 5.0
    srcMeanY /= 5.0

    val srcDemean = Array(5) { DoubleArray(2) }
    val dstDemean = Array(5) { DoubleArray(2) }
    for (i in 0 until 5) {
      srcDemean[i][0] = src[i][0] - srcMeanX
      srcDemean[i][1] = src[i][1] - srcMeanY
      dstDemean[i][0] = dst[i][0] - dstMeanX
      dstDemean[i][1] = dst[i][1] - dstMeanY
    }

    var a00 = 0.0
    var a01 = 0.0
    var a10 = 0.0
    var a11 = 0.0
    for (i in 0 until 5) {
      a00 += dstDemean[i][0] * srcDemean[i][0]
      a01 += dstDemean[i][0] * srcDemean[i][1]
      a10 += dstDemean[i][1] * srcDemean[i][0]
      a11 += dstDemean[i][1] * srcDemean[i][1]
    }
    a00 /= 5.0
    a01 /= 5.0
    a10 /= 5.0
    a11 /= 5.0

    val svd = svd2(a00, a01, a10, a11)
    var d1 = 1.0
    if (a00 * a11 - a01 * a10 < 0) d1 = -1.0

    val detU = svd.u00 * svd.u11 - svd.u01 * svd.u10
    val detVt = svd.vt00 * svd.vt11 - svd.vt01 * svd.vt10
    var t00: Double
    var t01: Double
    var t10: Double
    var t11: Double
    if (svd.rank == 1 && detU * detVt <= 0) {
      d1 = -1.0
    }
    val dVt00 = svd.vt00
    val dVt01 = svd.vt01
    val dVt10 = d1 * svd.vt10
    val dVt11 = d1 * svd.vt11
    t00 = svd.u00 * dVt00 + svd.u01 * dVt10
    t01 = svd.u00 * dVt01 + svd.u01 * dVt11
    t10 = svd.u10 * dVt00 + svd.u11 * dVt10
    t11 = svd.u10 * dVt01 + svd.u11 * dVt11

    var varSum = 0.0
    for (i in 0 until 5) {
      varSum += srcDemean[i][0] * srcDemean[i][0] + srcDemean[i][1] * srcDemean[i][1]
    }
    varSum /= 5.0
    val scale = if (varSum == 0.0) 1.0 else (svd.s0 + svd.s1 * d1) / varSum
    val ts0 = t00 * srcMeanX + t01 * srcMeanY
    val ts1 = t10 * srcMeanX + t11 * srcMeanY
    return floatArrayOf(
      (t00 * scale).toFloat(),
      (t01 * scale).toFloat(),
      (dstMeanX - scale * ts0).toFloat(),
      (t10 * scale).toFloat(),
      (t11 * scale).toFloat(),
      (dstMeanY - scale * ts1).toFloat(),
    )
  }

  private data class Svd(
    val u00: Double, val u01: Double, val u10: Double, val u11: Double,
    val s0: Double, val s1: Double,
    val vt00: Double, val vt01: Double, val vt10: Double, val vt11: Double,
    val rank: Int,
  )

  private fun svd2(a00: Double, a01: Double, a10: Double, a11: Double): Svd {
    val ata00 = a00 * a00 + a10 * a10
    val ata01 = a00 * a01 + a10 * a11
    val ata11 = a01 * a01 + a11 * a11
    val trace = ata00 + ata11
    val det = ata00 * ata11 - ata01 * ata01
    val gap = sqrt(kotlin.math.max(0.0, trace * trace / 4.0 - det))
    val s0 = sqrt(kotlin.math.max(0.0, trace / 2.0 + gap))
    val s1 = sqrt(kotlin.math.max(0.0, trace / 2.0 - gap))

    fun eigen(value: Double): DoubleArray {
      val lambda = value * value
      var x = ata01
      var y = lambda - ata00
      if (kotlin.math.abs(x) + kotlin.math.abs(y) < 1e-12) {
        x = lambda - ata11
        y = ata01
      }
      val norm = sqrt(x * x + y * y)
      if (norm < 1e-12) return doubleArrayOf(1.0, 0.0)
      return doubleArrayOf(x / norm, y / norm)
    }

    val v0 = eigen(s0)
    var v1x = -v0[1]
    var v1y = v0[0]
    val smax = kotlin.math.max(s0, s1)
    val tol = smax * 2.0 * Float.MIN_VALUE.toDouble()
    var rank = 0
    if (s0 > tol) rank += 1
    if (s1 > tol) rank += 1

    val u0x = if (s0 > tol) (a00 * v0[0] + a01 * v0[1]) / s0 else 1.0
    val u0y = if (s0 > tol) (a10 * v0[0] + a11 * v0[1]) / s0 else 0.0
    var u1x = if (s1 > tol) (a00 * v1x + a01 * v1y) / s1 else -u0y
    var u1y = if (s1 > tol) (a10 * v1x + a11 * v1y) / s1 else u0x

    val uNorm0 = sqrt(u0x * u0x + u0y * u0y)
    val uNorm1 = sqrt(u1x * u1x + u1y * u1y)
    val uu0x = if (uNorm0 > 1e-12) u0x / uNorm0 else 1.0
    val uu0y = if (uNorm0 > 1e-12) u0y / uNorm0 else 0.0
    val uu1x = if (uNorm1 > 1e-12) u1x / uNorm1 else -uu0y
    val uu1y = if (uNorm1 > 1e-12) u1y / uNorm1 else uu0x

    return Svd(
      uu0x, uu1x, uu0y, uu1y,
      s0, s1,
      v0[0], v0[1], v1x, v1y,
      rank,
    )
  }
}
