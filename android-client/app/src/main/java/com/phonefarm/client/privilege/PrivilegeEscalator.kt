package com.phonefarm.client.privilege

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Privilege escalation guidance and management.
 *
 * PhoneFarm needs elevated privileges for certain operations (silent APK
 * install, accessibility service binding enforcement). This class provides:
 *
 *   1. **Guidance** — step-by-step instructions for enabling each privilege
 *      method (ADB DeviceOwner activation, Shizuku setup).
 *   2. **Auto-detect** — probe the device for available privilege methods.
 *   3. **Escalation ranking** — ordered list of methods to try, best first.
 *   4. **Status display** — UI-ready status of each method.
 *
 * Privilege methods (best to worst):
 *   - **DeviceOwner** (ADB, one-time): Full control, silent installs
 *   - **Shizuku** (ADB or wireless debug): Elevated ADB-level access
 *   - **Root** (Magisk/SuperSU): Full system access
 *   - **None**: Only standard Android APIs (requires user interaction for installs)
 */
@Singleton
class PrivilegeEscalator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val deviceOwnerManager: DeviceOwnerManager,
    private val silentInstallHelper: SilentInstallHelper,
    private val rootPermissionChecker: RootPermissionChecker,
) {

    /**
     * Get the current privilege level for this device.
     *
     * @return [PrivilegeLevel] representing the highest available privilege.
     */
    fun getCurrentLevel(): PrivilegeLevel {
        return when {
            deviceOwnerManager.isDeviceOwner() -> PrivilegeLevel.DEVICE_OWNER
            silentInstallHelper.isShizukuAvailable() -> PrivilegeLevel.SHIZUKU
            rootPermissionChecker.isRootAvailable() -> PrivilegeLevel.ROOT
            else -> PrivilegeLevel.NONE
        }
    }

    /**
     * Get step-by-step ADB instructions for activating DeviceOwner mode.
     *
     * Returns human-readable instructions suitable for display in onboarding
     * or settings screens.
     */
    fun getDeviceOwnerActivationGuide(): DeviceOwnerActivationGuide {
        return DeviceOwnerActivationGuide(
            prerequisites = listOf(
                "Enable USB Debugging in Developer Options (Settings > About Phone > Tap Build Number 7 times > Developer Options > USB Debugging)",
                "Remove ALL accounts (Google, work, etc.) from the device before running the ADB command (Settings > Accounts > Remove each account)",
                "Install ADB on your computer (download Android SDK Platform Tools)",
                "Connect the device to your computer via USB cable and verify with: adb devices",
            ),
            adbCommand = "adb shell dpm set-device-owner ${context.packageName}/.privilege.PhoneFarmDeviceAdminReceiver",
            verificationSteps = listOf(
                "Open Settings > Security > Device Administrators — PhoneFarm should be listed and active",
                "Settings should show \"This device is managed by your organization\" or similar",
                "Run: adb shell dumpsys device_policy — look for \"device_owner\" pointing to ${context.packageName}",
                "In the PhoneFarm app, the privilege status should show \"设备所有者\" as active",
            ),
            troubleshooting = mapOf(
                "Error: Not allowed to set the device owner" to "Remove ALL accounts from the device. Device must have zero accounts registered. Go to Settings > Accounts and remove every account, then try again.",
                "Error: Device already has a device owner" to "Another app is already the device owner. Go to Settings > Security > Device Administrators > Tap the existing device owner > Deactivate. Then run: adb shell dpm remove-active-admin <component-name>",
                "Xiaomi 小米" to "On Xiaomi/HyperOS devices, enable 'USB debugging (Security Settings)' in Developer Options. Also enable 'Install via USB'. If the command fails, try restarting the phone and running the command BEFORE adding any Mi Account.",
                "Huawei 华为" to "On Huawei/HarmonyOS devices, ensure HiSuite is not interfering. Enable 'Allow ADB debugging in charge only mode' in Developer Options. You may need to disable AppGallery auto-login temporarily.",
                "OPPO/OnePlus" to "On OPPO/ColorOS devices, you may need to sign into a system account first, then remove it. Try: adb shell dpm set-device-owner with the --user 0 flag. If it fails, consider using the Shizuku method instead.",
                "VIVO" to "On VIVO/OriginOS devices, enable 'USB debugging (Security Settings)' and disable 'Secure keyboard'. VIVO is known for blocking DeviceOwner — use Shizuku as a reliable alternative.",
                "Samsung" to "On Samsung/OneUI devices, Knox may block device owner provisioning. Try removing Samsung Account first. Consider using Shizuku or Root instead for Samsung devices.",
            ),
        )
    }

    /**
     * Get step-by-step instructions for setting up Shizuku.
     *
     * Shizuku can be activated via:
     *   - ADB: `adb shell sh /sdcard/Android/data/moe.shizuku.privileged.api/start.sh`
     *   - Wireless Debugging (Android 11+): Pair and enable in Shizuku app
     */
    fun getShizukuSetupGuide(): ShizukuSetupGuide {
        return ShizukuSetupGuide(
            installMethod = listOf(
                "Download Shizuku from Google Play: https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api",
                "Or download from F-Droid: https://f-droid.org/packages/moe.shizuku.privileged.api/",
                "Or download from GitHub Releases: https://github.com/RikkaApps/Shizuku/releases",
                "Install the APK and open the Shizuku app once",
            ),
            adbActivationSteps = listOf(
                "1. Open the Shizuku app on your device",
                "2. Select \"Start via ADB\" on the main screen",
                "3. Connect your device to a computer with ADB installed",
                "4. Run the command: adb shell sh /sdcard/Android/data/moe.shizuku.privileged.api/start.sh",
                "5. Shizuku service should start and display version information",
                "6. Return to the Shizuku app — it should show \"Shizuku is running\"",
            ),
            wirelessDebugSteps = listOf(
                "1. Enable Wireless Debugging in Developer Options (Android 11+, Settings > Developer Options > Wireless debugging)",
                "2. Open the Shizuku app",
                "3. Select \"Start via Wireless debugging\"",
                "4. Tap \"Pairing\" in the Shizuku app",
                "5. In Developer Options > Wireless debugging, tap \"Pair device with pairing code\"",
                "6. Enter the 6-digit pairing code displayed by the system into Shizuku",
                "7. Once paired, Shizuku service will start automatically",
            ),
            authorizationSteps = listOf(
                "1. In the Shizuku app, navigate to \"Authorized Applications\"",
                "2. Find \"PhoneFarm\" in the application list",
                "3. Toggle the switch to grant Shizuku access to PhoneFarm",
                "4. Verify authorization: in PhoneFarm, the privilege status should show \"Shizuku\" as active",
            ),
        )
    }

    /**
     * Get a prioritized list of privilege escalation recommendations.
     *
     * The first item is the recommended method; subsequent items are
     * fallbacks with pros and cons.
     */
    fun getRecommendations(): List<PrivilegeRecommendation> {
        return listOf(
            PrivilegeRecommendation(
                method = PrivilegeLevel.DEVICE_OWNER,
                priority = 1,
                pros = listOf(
                    "Silent APK installation and uninstallation with no user prompt",
                    "Automatic runtime permission grants without user interaction",
                    "System-level control: reboot, lock screen, factory reset",
                    "Persists across device reboots (one-time setup)",
                    "Highest level of automation capability",
                ),
                cons = listOf(
                    "Requires ADB one-time setup with empty account state",
                    "Some manufacturers (VIVO, Samsung) partially block device owner",
                    "Cannot be removed without ADB or factory reset",
                ),
            ),
            PrivilegeRecommendation(
                method = PrivilegeLevel.SHIZUKU,
                priority = 2,
                pros = listOf(
                    "Easier setup: ADB or wireless debugging (Android 11+)",
                    "Works on virtually all Android devices",
                    "ADB-level access without full device ownership",
                    "Can be authorized per-application for security",
                    "Less invasive than DeviceOwner mode",
                ),
                cons = listOf(
                    "Requires Shizuku app to be installed separately",
                    "Service must be restarted after every device reboot",
                    "Wireless debug method requires Android 11 or newer",
                    "Slightly fewer capabilities than DeviceOwner",
                ),
            ),
            PrivilegeRecommendation(
                method = PrivilegeLevel.ROOT,
                priority = 3,
                pros = listOf(
                    "Complete system access with no restrictions",
                    "Works on any rooted device without additional apps",
                    "Maximum flexibility for system-level automation",
                ),
                cons = listOf(
                    "Triggers SafetyNet / Play Integrity — breaks banking apps, Google Pay",
                    "May void device warranty on some brands",
                    "Rooting is impossible or difficult on many modern devices",
                    "Security risk if the root access is misused",
                ),
            ),
            PrivilegeRecommendation(
                method = PrivilegeLevel.NONE,
                priority = 4,
                pros = listOf(
                    "Works on every device with zero setup required",
                    "No security or warranty concerns",
                    "Full compatibility with Play Integrity and banking apps",
                ),
                cons = listOf(
                    "User must manually confirm every APK installation dialog",
                    "Limited automation: cannot grant permissions silently",
                    "Accessibility service may be killed by system aggressively",
                ),
            ),
        )
    }

    /**
     * Check if at least one escalation method is available.
     */
    fun hasAnyPrivilege(): Boolean {
        return getCurrentLevel() != PrivilegeLevel.NONE
    }

    /**
     * Get the availability status of all privilege methods.
     */
    fun getAllStatuses(): List<PrivilegeMethodStatus> {
        val currentLevel = getCurrentLevel()
        return listOf(
            PrivilegeMethodStatus(
                method = PrivilegeLevel.DEVICE_OWNER,
                isAvailable = true,
                isActive = deviceOwnerManager.isDeviceOwner(),
                errorMessage = null,
            ),
            PrivilegeMethodStatus(
                method = PrivilegeLevel.SHIZUKU,
                isAvailable = silentInstallHelper.isShizukuAvailable(),
                isActive = silentInstallHelper.isShizukuAvailable(),
                errorMessage = null,
            ),
            PrivilegeMethodStatus(
                method = PrivilegeLevel.ROOT,
                isAvailable = rootPermissionChecker.isRootAvailable(),
                isActive = rootPermissionChecker.isRootAvailable(),
                errorMessage = null,
            ),
            PrivilegeMethodStatus(
                method = PrivilegeLevel.NONE,
                isAvailable = true,
                isActive = currentLevel == PrivilegeLevel.NONE,
                errorMessage = null,
            ),
        )
    }
}

/** Privilege levels, ordered highest to lowest. */
enum class PrivilegeLevel(val label: String, val description: String) {
    DEVICE_OWNER("设备所有者", "完全控制，静默安装和权限管理"),
    SHIZUKU("Shizuku", "ADB 级别权限，静默安装和命令执行"),
    ROOT("Root", "完全系统访问（可能影响 SafetyNet）"),
    NONE("无", "标准安卓权限（需要用户交互）"),
}

/** Step-by-step guide for DeviceOwner activation. */
data class DeviceOwnerActivationGuide(
    val prerequisites: List<String>,
    val adbCommand: String,
    val verificationSteps: List<String>,
    val troubleshooting: Map<String, String>,
)

/** Step-by-step guide for Shizuku setup. */
data class ShizukuSetupGuide(
    val installMethod: List<String>,
    val adbActivationSteps: List<String>,
    val wirelessDebugSteps: List<String>,
    val authorizationSteps: List<String>,
)

/** A privilege escalation recommendation. */
data class PrivilegeRecommendation(
    val method: PrivilegeLevel,
    val priority: Int,
    val pros: List<String>,
    val cons: List<String>,
)

/** Status of a single privilege method. */
data class PrivilegeMethodStatus(
    val method: PrivilegeLevel,
    val isAvailable: Boolean,
    val isActive: Boolean,
    val errorMessage: String?,
)
