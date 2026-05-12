package com.phonefarm.client.privilege

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Device Owner mode management for silent APK installation and system-level control.
 *
 * When PhoneFarm is set as the device owner (via ADB: `dpm set-device-owner`),
 * it gains elevated privileges:
 *   - Silent APK installation (no user prompt)
 *   - Silent APK uninstallation
 *   - Disable/enable system apps
 *   - Set runtime permission grants automatically
 *   - Wipe device (factory reset)
 *   - Lock screen / reboot
 *
 * Requirements:
 *   - No Google account on device (or use --user 0 work profile)
 *   - Set via ADB before any accounts are added
 *   - Can be removed via Settings > Security > Device Admin or `dpm remove-active-admin`
 *
 * Note: DeviceOwner mode is optional. PhoneFarm falls back to Shizuku
 * or root for silent install if DeviceOwner is not available.
 */
@Singleton
class DeviceOwnerManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val devicePolicyManager: DevicePolicyManager by lazy {
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }

    private val adminComponent: ComponentName by lazy {
        ComponentName(context, "com.phonefarm.client.privilege.PhoneFarmDeviceAdminReceiver")
    }

    /**
     * Check if PhoneFarm is the active device owner.
     */
    fun isDeviceOwner(): Boolean {
        return devicePolicyManager.isDeviceOwnerApp(context.packageName)
    }

    /**
     * Get the device owner status for display in settings/hub.
     */
    fun getStatus(): DeviceOwnerStatus {
        return DeviceOwnerStatus(
            isDeviceOwner = isDeviceOwner(),
            isProfileOwner = devicePolicyManager.isProfileOwnerApp(context.packageName),
            isActiveAdmin = devicePolicyManager.isAdminActive(adminComponent),
            adbCommand = getAdbCommand(),
        )
    }

    /**
     * Attempt to provision PhoneFarm as device owner via NFC bump.
     *
     * This requires NFC hardware and the provisioning intent from
     * setup wizard. Most deployments use ADB instead.
     */
    fun startNfcProvisioning() {
        val intent = android.nfc.NfcAdapter.getDefaultAdapter(context)?.let { adapter ->
            if (!adapter.isEnabled) return@let null
            Intent(android.app.admin.DevicePolicyManager.ACTION_PROVISION_MANAGED_DEVICE).apply {
                putExtra(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME, adminComponent)
                putExtra(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_WIFI_SSID, "")
                putExtra(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE, android.os.Bundle())
            }
        }
        intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        intent?.let { context.startActivity(it) }
    }

    /**
     * Get the command that needs to be run via ADB to set PhoneFarm as device owner.
     *
     * Returns a copyable command string for display in onboarding.
     */
    fun getAdbCommand(): String {
        return "adb shell dpm set-device-owner ${context.packageName}/.privilege.PhoneFarmDeviceAdminReceiver"
    }

    /**
     * Grant a runtime permission using device owner authority.
     *
     * Only works when PhoneFarm is the device owner.
     *
     * @param permission The Android permission to grant.
     * @return true if the permission was granted successfully.
     */
    fun grantPermission(permission: String): Boolean {
        return if (isDeviceOwner()) {
            try {
                devicePolicyManager.setPermissionGrantState(
                    adminComponent,
                    context.packageName,
                    permission,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                )
                true
            } catch (e: Exception) {
                false
            }
        } else {
            false
        }
    }

    /**
     * Install an APK package silently using DeviceOwner authority.
     * Requires PhoneFarm to be set as device owner.
     *
     * @param apkFile The APK file to install.
     * @throws SecurityException if not device owner.
     */
    fun installPackage(apkFile: java.io.File) {
        // installPackage(ComponentName, String) was @removed in API 34.
        // Use PackageInstaller session API via device owner authority instead.
        val packageInstaller = context.packageManager.packageInstaller
        val sessionParams = android.content.pm.PackageInstaller.SessionParams(
            android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        val sessionId = packageInstaller.createSession(sessionParams)
        val session = packageInstaller.openSession(sessionId)
        session.use { s ->
            apkFile.inputStream().use { input ->
                s.openWrite("package", 0, apkFile.length()).use { output ->
                    input.copyTo(output)
                }
            }
        }
    }

    /**
     * Disable screen lock / keyguard (for automation purposes).
     */
    fun setKeyguardDisabled(disabled: Boolean) {
        if (isDeviceOwner() || devicePolicyManager.isAdminActive(adminComponent)) {
            try {
                devicePolicyManager.setKeyguardDisabled(adminComponent, disabled)
            } catch (_: SecurityException) {
                // Not authorized — operation silently fails
            }
        }
    }
}

/** Device owner status information. */
data class DeviceOwnerStatus(
    val isDeviceOwner: Boolean,
    val isProfileOwner: Boolean,
    val isActiveAdmin: Boolean,
    val adbCommand: String,
)
