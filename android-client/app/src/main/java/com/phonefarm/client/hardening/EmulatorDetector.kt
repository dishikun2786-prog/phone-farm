package com.phonefarm.client.hardening

import android.os.Build
import android.os.Environment
import android.os.StatFs
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Emulator environment detection for preventing script execution on
 * simulated hardware that may not support real platform apps.
 *
 * Detects:
 *  - Official Android Emulator (AVD)
 *  - 雷电模拟器 (LDPlayer / LeiDian)
 *  - 夜神模拟器 (NoxPlayer)
 *  - MuMu模拟器 (NetEase MuMu)
 *  - 逍遥模拟器 (MEmu / XiaoYao)
 *  - 蓝叠模拟器 (BlueStacks)
 *  - Genymotion
 *  - VirtualBox / VMWare artifacts
 *
 * Detection is based on Build properties, file system artifacts,
 * /proc/cpuinfo, and hardware sensor availability.
 */
@Singleton
class EmulatorDetector @Inject constructor() {

    enum class EmulatorType {
        /** Real physical device — no emulator indicators found. */
        REAL_DEVICE,
        /** Google AVD / Android Emulator (qemu-based). */
        ANDROID_EMULATOR,
        /** 雷电模拟器 (LDPlayer). */
        LEIDIAN,
        /** 夜神模拟器 (NoxPlayer). */
        NOX,
        /** 网易MuMu模拟器. */
        MUMU,
        /** 逍遥模拟器 (MEmu). */
        MEMU,
        /** 蓝叠模拟器 (BlueStacks). */
        BLUESTACKS,
        /** Genymotion. */
        GENYMOTION,
        /** Unknown emulator — some indicators present but brand not identified. */
        UNKNOWN_EMULATOR,
    }

    data class DetectionInfo(
        val emulatorType: EmulatorType,
        val confidence: Float, // 0.0–1.0
        val indicatorsFound: List<String>,
    ) {
        val isRealDevice: Boolean get() = emulatorType == EmulatorType.REAL_DEVICE
        val isEmulator: Boolean get() = emulatorType != EmulatorType.REAL_DEVICE
    }

    /**
     * Run full emulator detection and return structured results.
     *
     * @return DetectionInfo with the identified emulator type and confidence score.
     */
    fun detect(): DetectionInfo {
        val indicators = mutableListOf<String>()
        var score = 0
        val maxScore = 18

        // Build property checks
        if (checkBuildFingerprint(indicators)) score += 2
        if (checkBuildModel(indicators)) score += 2
        if (checkBuildManufacturer(indicators)) score += 1
        if (checkBuildHardware(indicators)) score += 1
        if (checkBuildTags(indicators)) score += 1
        if (checkBuildBrand(indicators)) score += 1
        if (checkBuildBoard(indicators)) score += 1

        // File system checks
        if (checkProcCpuinfo(indicators)) score += 2
        if (checkSystemFiles(indicators)) score += 2
        if (checkEmulatorFiles(indicators)) score += 1

        // Sensor / hardware checks
        if (checkSensors(indicators)) score += 1
        if (checkTelephony(indicators)) score += 1
        if (checkDisplayMetrics(indicators)) score += 1
        if (checkStorageSize(indicators)) score += 1

        val confidence = score.toFloat() / maxScore.toFloat()
        val emulatorType = identifyEmulatorType(indicators)

        return DetectionInfo(
            emulatorType = emulatorType,
            confidence = confidence.coerceIn(0f, 1f),
            indicatorsFound = indicators,
        )
    }

    // ---- Build property checks ----

    private fun checkBuildFingerprint(indicators: MutableList<String>): Boolean {
        val fp = Build.FINGERPRINT.lowercase()
        val emulatorKeywords = listOf(
            "generic", "unknown", "emulator", "qemu", "virtual", "sdk", "sdk_gphone",
            "vbox", "google_sdk", "ranchu", "aosp",
        )
        for (keyword in emulatorKeywords) {
            if (fp.contains(keyword)) {
                indicators.add("Build.FINGERPRINT contains '$keyword'")
                return true
            }
        }
        return false
    }

    private fun checkBuildModel(indicators: MutableList<String>): Boolean {
        val model = Build.MODEL.lowercase()
        val emulatorModels = listOf(
            "google sdk", "emulator", "android sdk", "sdk_gphone",
            "leidian", "ldplayer", "nox", "mumu", "memu", "xiaoyao",
            "bluestacks", "genymotion", "virtualbox", "droid4x",
            "gamematrix", "tencent_game_emulator",
        )
        for (emuModel in emulatorModels) {
            if (model.contains(emuModel)) {
                indicators.add("Build.MODEL matches emulator: '$emuModel'")
                return true
            }
        }
        return false
    }

    private fun checkBuildManufacturer(indicators: MutableList<String>): Boolean {
        val mfr = Build.MANUFACTURER.lowercase()
        if (mfr.contains("genymotion") || mfr.contains("unknown") ||
            mfr.contains("virtual") || mfr.contains("android")
        ) {
            indicators.add("Build.MANUFACTURER suspicious: '${Build.MANUFACTURER}'")
            return true
        }
        return false
    }

    private fun checkBuildHardware(indicators: MutableList<String>): Boolean {
        val hw = Build.HARDWARE.lowercase()
        val emulatorHw = listOf(
            "goldfish", "ranchu", "vbox86", "nox", "ttvm_x86",
            "intel", "unknown", "android_x86",
        )
        if (hw in emulatorHw || hw.startsWith("qemu")) {
            indicators.add("Build.HARDWARE is emulator: '${Build.HARDWARE}'")
            return true
        }
        return false
    }

    private fun checkBuildTags(indicators: MutableList<String>): Boolean {
        if (Build.TAGS.contains("test-keys", ignoreCase = true) ||
            Build.TAGS.contains("dev-keys", ignoreCase = true)
        ) {
            // Not definitive alone, but contributes weight.
            indicators.add("Build.TAGS is '${Build.TAGS}'")
            return true
        }
        return false
    }

    private fun checkBuildBrand(indicators: MutableList<String>): Boolean {
        val brand = Build.BRAND.lowercase()
        if (brand == "generic" || brand == "unknown" || brand == "android") {
            indicators.add("Build.BRAND is '$brand'")
            return true
        }
        return false
    }

    private fun checkBuildBoard(indicators: MutableList<String>): Boolean {
        val board = Build.BOARD.lowercase()
        if (board.contains("unknown") || board.contains("generic") || board.isEmpty()) {
            indicators.add("Build.BOARD is empty or generic")
            return true
        }
        return false
    }

    // ---- File system checks ----

    private fun checkProcCpuinfo(indicators: MutableList<String>): Boolean {
        return try {
            val cpuinfo = java.io.File("/proc/cpuinfo")
            if (!cpuinfo.canRead()) return false
            val content = cpuinfo.readText()
            val lower = content.lowercase()

            val emuIndicators = listOf(
                "qemu", "goldfish", "ranchu", "kvm", "hypervisor",
                "intel" to "android", // x86_64 CPU in Android is strong emulator signal
            )

            for (indicator in emuIndicators) {
                if (indicator is String && lower.contains(indicator)) {
                    indicators.add("/proc/cpuinfo contains '$indicator'")
                    return true
                } else if (indicator is Pair<*, *>) {
                    val a = (indicator.first as String).lowercase()
                    val b = (indicator.second as String).lowercase()
                    if (lower.contains(a) && lower.contains(b)) {
                        indicators.add("/proc/cpuinfo contains '$a' and '$b'")
                        return true
                    }
                }
            }
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun checkSystemFiles(indicators: MutableList<String>): Boolean {
        val suspiciousPaths = listOf(
            "/system/lib/libc_malloc_debug_qemu.so",
            "/sys/qemu_trace",
            "/system/bin/qemu-props",
            "/dev/socket/qemud",
            "/dev/qemu_pipe",
            "/proc/tty/drivers",
        )
        for (path in suspiciousPaths) {
            val file = java.io.File(path)
            if (file.exists()) {
                indicators.add("QEMU system file found: $path")
                return true
            }
        }
        return false
    }

    private fun checkEmulatorFiles(indicators: MutableList<String>): Boolean {
        val emulatorPathTemplates = mapOf(
            "LeiDian" to listOf(
                "/system/bin/ldinit", "/data/data/com.android.ld.appstore",
                "/system/app/LDAppStore", "/data/data/com.ldmnq.launcher3",
            ),
            "Nox" to listOf(
                "/system/bin/nox-prop", "/system/bin/noxspeedup",
                "/data/data/com.vphone.launcher", "/system/app/NoxLauncher",
            ),
            "MuMu" to listOf(
                "/system/bin/mumu", "/data/data/com.mumu.launcher",
                "/system/app/NemuLauncher", "/system/bin/nemu",
            ),
            "MEmu" to listOf(
                "/system/bin/memu", "/data/data/com.microvirt.launcher",
                "/system/lib/libmemu.so",
            ),
            "BlueStacks" to listOf(
                "/data/data/com.bluestacks.appmart",
                "/data/data/com.bluestacks.BstCommandProcessor",
                "/system/bin/bstk",
            ),
        )

        for ((label, paths) in emulatorPathTemplates) {
            for (path in paths) {
                if (java.io.File(path).exists()) {
                    indicators.add("$label file found: $path")
                    return true
                }
            }
        }
        return false
    }

    // ---- Sensor checks ----

    private fun checkSensors(indicators: MutableList<String>): Boolean {
        // Real devices have many sensors; emulators often have few or none.
        try {
            val sensorManager = android.hardware.SensorManager::class.java
            // Cannot instantiate SensorManager without Context, so we check via
            // the system service pattern. This is a heuristic — it returns true
            // if we detect that sensor service isn't available which is unlikely
            // on a real device.
            val hasAccelerometer = !Build.MODEL.contains("sdk", ignoreCase = true) &&
                    !Build.HARDWARE.contains("goldfish")
            // This is a light heuristic.
            return !hasAccelerometer
        } catch (_: Exception) {
            // If we can't access SensorManager at all, that itself is suspicious.
            indicators.add("Cannot access SensorManager")
            return true
        }
    }

    // ---- Telephony checks ----

    private fun checkTelephony(indicators: MutableList<String>): Boolean {
        // Emulators typically have no IMEI/MEID or return all-zero values.
        // This check can't directly access TelephonyManager without Context,
        // so we check properties set by the RIL layer.
        val telephonyProps = listOf(
            "gsm.version.baseband",
            "ro.telephony.ril_class",
        )
        val hasBaseband = telephonyProps.any { prop ->
            val value = getSystemProperty(prop)
            value.isNotEmpty() && value != "unknown" && value != "generic"
        }
        if (!hasBaseband && !Build.MODEL.contains("sdk", ignoreCase = true)) {
            indicators.add("No baseband/telephony properties found")
            return true
        }
        return false
    }

    // ---- Display metrics ----

    private fun checkDisplayMetrics(indicators: MutableList<String>): Boolean {
        // Emulators often report unusual DPI values or resolutions.
        val density = Build.SUPPORTED_ABIS
        // Check for x86 ABI — almost always an emulator (few x86 Android phones exist).
        val hasX86 = Build.SUPPORTED_ABIS.any { abi ->
            abi.contains("x86", ignoreCase = true)
        }
        if (hasX86) {
            indicators.add("x86 ABI detected: ${Build.SUPPORTED_ABIS.joinToString()}")
            return true
        }
        return false
    }

    // ---- Storage size ----

    private fun checkStorageSize(indicators: MutableList<String>): Boolean {
        try {
            val stat = StatFs(Environment.getDataDirectory().absolutePath)
            val totalBytes = stat.blockCountLong * stat.blockSizeLong
            val totalGb = totalBytes / (1024 * 1024 * 1024)
            // Emulators commonly have very small (< 16 GB) or very specific
            // storage sizes (e.g., exactly 4 GB, 8 GB).
            if (totalGb < 8 || totalGb == 4L || totalGb == 8L) {
                indicators.add("Small/suspicious total storage: ${totalGb}GB")
                return true
            }
        } catch (_: Exception) {
            // Cannot determine storage size.
        }
        return false
    }

    // ---- Emulator type identification ----

    private fun identifyEmulatorType(indicators: List<String>): EmulatorType {
        val combined = indicators.joinToString(" ").lowercase()

        return when {
            combined.contains("leidian") || combined.contains("ldplayer") ||
            combined.contains("ldappstore") -> EmulatorType.LEIDIAN
            combined.contains("nox") || combined.contains("vphone") -> EmulatorType.NOX
            combined.contains("mumu") || combined.contains("nemu") -> EmulatorType.MUMU
            combined.contains("memu") || combined.contains("microvirt") ||
            combined.contains("xiaoyao") -> EmulatorType.MEMU
            combined.contains("bluestacks") || combined.contains("bstcommand") ->
                EmulatorType.BLUESTACKS
            combined.contains("genymotion") || combined.contains("vbox") ->
                EmulatorType.GENYMOTION
            combined.contains("qemu") || combined.contains("goldfish") ||
            combined.contains("ranchu") || combined.contains("generic") ||
            combined.contains("sdk_gphone") -> EmulatorType.ANDROID_EMULATOR
            indicators.isNotEmpty() -> EmulatorType.UNKNOWN_EMULATOR
            else -> EmulatorType.REAL_DEVICE
        }
    }

    // ---- Utility ----

    /**
     * Read a system property value via reflection (since android.os.SystemProperties
     * is @hide). Returns empty string if the property cannot be read.
     */
    private fun getSystemProperty(key: String): String {
        return try {
            val clazz = Class.forName("android.os.SystemProperties")
            val method = clazz.getMethod("get", String::class.java)
            method.invoke(null, key) as? String ?: ""
        } catch (_: Exception) {
            ""
        }
    }
}
