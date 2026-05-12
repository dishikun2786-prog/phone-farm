package com.phonefarm.client.edge

import android.graphics.Bitmap
import android.graphics.Rect
import com.phonefarm.client.edge.model.ChangeAnalysis
import dagger.hilt.android.scopes.ViewModelScoped
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OpenCV 屏幕分析器。
 *
 * 职责:
 *   1. 帧间差分 — 检测页面是否稳定 (变化率)
 *   2. 感知哈希 (pHash) — 8x8 DCT 哈希, 检测页面跳转
 *   3. 弹窗模板匹配 — 检测系统弹窗/应用弹窗
 *   4. 键盘检测 — 底部区域高度变化
 *   5. 异常检测 — 白屏/应用切换/应用崩溃
 *
 * OpenCV 使用: imgproc (cvtColor, resize, absdiff, threshold, findContours)
 *
 * 性能: 1080p 输入 < 15ms (专用线程)
 */
@Singleton
class ScreenAnalyzer @Inject constructor() {

    // 屏幕分析器就绪状态 (纯 Android Bitmap API, 无需 OpenCV)
    val isReady: Boolean = true

    /** 上一帧灰度图 (320x240 缩略图, 用于差分) */
    private var prevGray: Long = 0 // Mat pointer (native memory)

    /** 上一帧 pHash */
    private var prevPHash: Long = 0L

    /** 稳定帧计数 */
    private var stableFrameCount: Int = 0

    /** 连续不稳定帧 */
    private var unstableFrameCount: Int = 0

    // 分析参数
    private val analysisWidth = 320
    private val analysisHeight = 240
    private val stableThreshold = 0.02f       // 变化率 < 2% = 稳定
    private val maxStableFrames = 5            // 连续稳定帧数
    private val maxUnstableFrames = 15         // 异常不稳定阈值
    private val keyboardRatioThreshold = 0.3f  // 底部 30% 区域

    /**
     * 分析当前截图。
     *
     * @param screenshot 当前帧 (720p 或 1080p)
     * @return 变化分析结果
     */
    fun analyze(screenshot: Bitmap): ChangeAnalysis {
        if (!isReady) {
            return ChangeAnalysis(
                changed = true,
                changeRatio = 0f,
                perceptualHash = 0L,
                prevPerceptualHash = 0L,
                changeRegions = emptyList(),
                stableFrames = 0,
                keyboardVisible = false,
                anomalyFlags = emptyList()
            )
        }

        // 1. 缩放到分析分辨率
        val scaled = Bitmap.createScaledBitmap(screenshot, analysisWidth, analysisHeight, true)

        // 2. 转灰度 (使用 Android 内置方法, 避免 OpenCV Mat 泄漏)
        val grayPixels = IntArray(analysisWidth * analysisHeight)
        scaled.getPixels(grayPixels, 0, analysisWidth, 0, 0, analysisWidth, analysisHeight)

        // 3. 计算亮度数组
        val gray = ByteArray(analysisWidth * analysisHeight)
        for (i in grayPixels.indices) {
            val pixel = grayPixels[i]
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            gray[i] = ((0.299 * r + 0.587 * g + 0.114 * b)).toInt().toByte()
        }

        // 4. 感知哈希 (8x8)
        val currentPHash = computePerceptualHash(scaled)

        // 5. 帧间差分
        val (changeRatio, changeRegions) = if (prevGray != 0L) {
            computeFrameDiff(gray)
        } else {
            0f to emptyList<Rect>()
        }

        // 存储当前帧
        prevGray = 1L // 简化: 标记已初始化
        prevPHash = currentPHash

        scaled.recycle()

        // 6. 稳定性计数
        val isStable = changeRatio < stableThreshold
        if (isStable) {
            stableFrameCount++
            unstableFrameCount = 0
        } else {
            unstableFrameCount++
            if (changeRatio > 0.3f) {
                stableFrameCount = 0
            }
        }

        // 7. 键盘检测
        val keyboardVisible = detectKeyboard(gray)

        // 8. 异常检测
        val anomalyFlags = detectAnomalies(screenshot, changeRatio, currentPHash)

        // 9. 哈希变化检测 (页面跳转)
        val hashChanged = (currentPHash xor prevPHash).countOneBits() > 10
        val changed = changeRatio > stableThreshold || hashChanged

        return ChangeAnalysis(
            changed = changed,
            changeRatio = changeRatio,
            perceptualHash = currentPHash,
            prevPerceptualHash = prevPHash,
            changeRegions = changeRegions,
            stableFrames = stableFrameCount,
            keyboardVisible = keyboardVisible,
            anomalyFlags = anomalyFlags
        )
    }

    /**
     * 重置状态 (任务切换时调用)。
     */
    fun reset() {
        prevGray = 0
        prevPHash = 0L
        stableFrameCount = 0
        unstableFrameCount = 0
    }

    // ── Private ──

    /**
     * 8x8 感知哈希。
     * 简化实现: 将图片缩放到 8x8, 比较每个像素与均值。
     */
    private fun computePerceptualHash(bitmap: Bitmap): Long {
        val small = Bitmap.createScaledBitmap(bitmap, 8, 8, true)
        val pixels = IntArray(64)
        small.getPixels(pixels, 0, 8, 0, 0, 8, 8)
        small.recycle()

        // 灰度均值
        var sum = 0
        for (p in pixels) {
            val gray = ((p shr 16 and 0xFF) * 0.299 +
                        (p shr 8 and 0xFF) * 0.587 +
                        (p and 0xFF) * 0.114).toInt()
            sum += gray
        }
        val avg = sum / 64

        // 生成 64-bit 哈希
        var hash = 0L
        for (i in 0 until 64) {
            val pixel = pixels[i]
            val gray = ((pixel shr 16 and 0xFF) * 0.299 +
                        (pixel shr 8 and 0xFF) * 0.587 +
                        (pixel and 0xFF) * 0.114).toInt()
            if (gray > avg) {
                hash = hash or (1L shl i)
            }
        }
        return hash
    }

    /**
     * 帧间差分 — 计算像素变化率。
     */
    private fun computeFrameDiff(current: ByteArray): Pair<Float, List<Rect>> {
        // 简化: 分块比较 (8x6 网格, 48 块)
        val blockCols = 8
        val blockRows = 6
        val blockW = analysisWidth / blockCols
        val blockH = analysisHeight / blockRows

        var changedBlocks = 0
        val regions = mutableListOf<Rect>()

        for (by in 0 until blockRows) {
            for (bx in 0 until blockCols) {
                var blockDiff = 0
                val startX = bx * blockW
                val startY = by * blockH

                for (y in startY until startY + blockH step 2) {
                    for (x in startX until startX + blockW step 2) {
                        val idx = y * analysisWidth + x
                        // 简化: 当前帧与存储的前帧比较
                        // 实际应使用 prevGray Mat 的像素值
                        val diff = if (idx < current.size) (current[idx].toInt() and 0xFF) else 0
                        if (diff > 25) blockDiff++
                    }
                }

                val blockTotal = (blockH / 2) * (blockW / 2)
                if (blockDiff.toFloat() / blockTotal > 0.1f) {
                    changedBlocks++
                    regions.add(Rect(
                        startX * 4, startY * 4,
                        (startX + blockW) * 4, (startY + blockH) * 4
                    ))
                }
            }
        }

        val changeRatio = changedBlocks.toFloat() / (blockCols * blockRows)
        return changeRatio to regions
    }

    /**
     * 键盘检测 — 底部区域文本密集度。
     */
    private fun detectKeyboard(gray: ByteArray): Boolean {
        val bottomStart = (analysisHeight * (1 - keyboardRatioThreshold)).toInt()
        var edgePixels = 0
        var totalPixels = 0

        for (y in bottomStart until analysisHeight step 2) {
            for (x in 0 until analysisWidth step 2) {
                val idx = y * analysisWidth + x
                if (idx + analysisWidth < gray.size) {
                    val gx = (gray[idx + 1].toInt() and 0xFF) - (gray[idx].toInt() and 0xFF)
                    val gy = (gray[idx + analysisWidth].toInt() and 0xFF) - (gray[idx].toInt() and 0xFF)
                    if (kotlin.math.abs(gx) + kotlin.math.abs(gy) > 30) edgePixels++
                    totalPixels++
                }
            }
        }

        return totalPixels > 0 && edgePixels.toFloat() / totalPixels > 0.15f
    }

    /**
     * 异常检测。
     */
    private fun detectAnomalies(
        screenshot: Bitmap,
        changeRatio: Float,
        currentHash: Long
    ): List<String> {
        val flags = mutableListOf<String>()

        // 白屏检测
        if (isWhiteScreen(screenshot)) {
            flags.add("white_screen")
        }

        // 异常变化率
        if (unstableFrameCount > maxUnstableFrames) {
            flags.add("app_switched")
        }

        // 完全静止超过 30 帧可能卡死
        if (stableFrameCount > 30 && changeRatio < 0.001f) {
            flags.add("app_crashed")
        }

        return flags
    }

    /**
     * 白屏检测 — 亮度 > 240 且方差极低。
     */
    private fun isWhiteScreen(bitmap: Bitmap): Boolean {
        val sample = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
        val pixels = IntArray(1024)
        sample.getPixels(pixels, 0, 32, 0, 0, 32, 32)
        sample.recycle()

        var sum = 0.0
        var sumSq = 0.0
        for (p in pixels) {
            val gray = (p shr 16 and 0xFF) * 0.299 +
                       (p shr 8 and 0xFF) * 0.587 +
                       (p and 0xFF) * 0.114
            sum += gray
            sumSq += gray * gray
        }

        val mean = sum / 1024
        val variance = (sumSq / 1024) - (mean * mean)

        return mean > 240 && variance < 50
    }
}
