package com.phonefarm.client.model

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

/**
 * Detector for the best available inference backend on this device.
 *
 * Backend priority (highest throughput first):
 *   1. QCOM_QNN       — Qualcomm Snapdragon NPU (SD 8 Gen1+)
 *   2. MTK_NEUROPILOT — MediaTek Dimensity APU (D8100+)
 *   3. HUAWEI_HIAI     — Huawei Kirin NPU
 *   4. NNAPI          — Android Neural Networks API
 *   5. VULKAN         — GPU compute via Vulkan
 *   6. CPU_ONLY       — Fallback, always available
 *
 * Detection methods:
 *   - QNN: check for libQnn*.so, /vendor/etc/qnn/ existence
 *   - NeuroPilot: check for com.mediatek.neuropilot package
 *   - HiAI: check for com.huawei.hiai package
 *   - NNAPI: Build.VERSION.SDK_INT >= 27 (Oreo 8.1)
 *   - Vulkan: PackageManager.FEATURE_VULKAN_HARDWARE_COMPUTE
 */
object InferenceBackendDetector {

    /**
     * Detect the best available inference backend for this device.
     *
     * @param context Application context for package manager queries.
     * @return The best [InferenceBackend] supported by this device.
     */
    fun detectBestBackend(context: Context): InferenceBackend {
        // 1. Qualcomm QNN: check for QNN SDK libraries on Snapdragon SoCs
        if (isQnnAvailable()) {
            return InferenceBackend.QCOM_QNN
        }

        // 2. MediaTek NeuroPilot: check system property and library presence
        if (isNeuroPilotAvailable(context)) {
            return InferenceBackend.MTK_NEUROPILOT
        }

        // 3. Huawei HiAI: check system property and package
        if (isHiAiAvailable(context)) {
            return InferenceBackend.HUAWEI_HIAI
        }

        // 4. NNAPI (move before Vulkan — better perf on supported devices)
        if (isNnapiAvailable()) {
            return InferenceBackend.NNAPI
        }

        // 5. Vulkan GPU compute
        if (isVulkanAvailable(context)) {
            return InferenceBackend.VULKAN
        }

        // 6. Fallback: CPU-only inference works on every device
        return InferenceBackend.CPU_ONLY
    }

    /**
     * Check if Qualcomm QNN delegate libraries are present on the device.
     */
    private fun isQnnAvailable(): Boolean {
        // Check for QNN vendor libraries
        val qnnPaths = listOf(
            "/vendor/lib64/libQnnHtp.so",
            "/vendor/lib64/libQnnCpu.so",
            "/vendor/lib64/libQnnGpu.so",
            "/vendor/lib/libQnnHtp.so",
            "/system/lib64/libQnnHtp.so",
        )
        for (path in qnnPaths) {
            if (File(path).exists()) return true
        }

        // Fallback: Snapdragon 8 Gen 1+ (SM8450) boards have QNN
        val hardware = Build.HARDWARE.lowercase()
        if (hardware.contains("qcom") || hardware.contains("qualcomm")) {
            val platform = Build.BOARD.lowercase()
            if (platform.contains("taro") || platform.contains("kalama") ||
                platform.contains("pineapple") || platform.contains("sun") ||
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ) {
                return true
            }
        }
        return false
    }

    /**
     * Check if MediaTek NeuroPilot SDK is available.
     */
    private fun isNeuroPilotAvailable(context: Context): Boolean {
        // Check for NeuroPilot libraries
        val libPaths = listOf(
            "/vendor/lib64/libneuropilot.so",
            "/vendor/lib/libneuropilot.so",
        )
        for (path in libPaths) {
            if (File(path).exists()) return true
        }

        // Check system property
        val mtkPlatform = getSystemProperty("ro.mediatek.platform")
        if (!mtkPlatform.isNullOrBlank()) return true

        // Check for NeuroPilot package
        try {
            context.packageManager.getPackageInfo("com.mediatek.neuropilot", 0)
            return true
        } catch (_: PackageManager.NameNotFoundException) { }

        return false
    }

    /**
     * Check if Huawei HiAI SDK is available.
     */
    private fun isHiAiAvailable(context: Context): Boolean {
        // Check system property
        val hwPlatform = getSystemProperty("ro.config.hw_platform")
        if (!hwPlatform.isNullOrBlank()) return true

        // Check for HiAI package
        try {
            context.packageManager.getPackageInfo("com.huawei.hiai", 0)
            return true
        } catch (_: PackageManager.NameNotFoundException) { }

        return false
    }

    /**
     * Read an Android system property via reflection.
     *
     * SystemProperties is a hidden API (@hide) but is available on all
     * Android versions at runtime. Returns null if the property is not set
     * or the reflection call fails.
     */
    private fun getSystemProperty(key: String): String? {
        return try {
            val clazz = Class.forName("android.os.SystemProperties")
            val method = clazz.getMethod("get", String::class.java)
            method.invoke(null, key) as? String
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Check if the Vulkan compute API is available.
     */
    fun isVulkanAvailable(context: Context): Boolean {
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_COMPUTE)
    }

    /**
     * Check if the Neural Networks API (NNAPI) is available.
     */
    fun isNnapiAvailable(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1
    }
}
