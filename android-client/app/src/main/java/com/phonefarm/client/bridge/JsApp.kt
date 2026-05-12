package com.phonefarm.client.bridge

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `app` global object.
 *
 * Exposes app management methods to Rhino scripts:
 *   app.launch(pkg), app.versionName, app.packageName, app.isInstalled(pkg),
 *   app.uninstall(pkg), app.clearData(pkg), app.forceStop(pkg)
 */
@Singleton
class JsApp @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * TODO: Return the version name of this app (PhoneFarm client itself).
     */
    val versionName: String
        get() {
            return try {
                val info = context.packageManager.getPackageInfo(
                    context.packageName,
                    0,
                )
                info.versionName ?: "unknown"
            } catch (e: PackageManager.NameNotFoundException) {
                "unknown"
            }
        }

    /**
     * TODO: Return the package name of this app.
     */
    val packageName: String
        get() = context.packageName

    /**
     * TODO: Launch the given package name via its launch intent.
     * Returns true if the package has a launcher activity and was successfully started.
     */
    fun launch(pkg: String): Boolean {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(pkg)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * TODO: Check if the given package is installed on the device.
     */
    fun isInstalled(pkg: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(pkg, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * TODO: Open the app info settings page for [pkg].
     */
    fun openAppSettings(pkg: String) {
        val intent = Intent(
            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            android.net.Uri.parse("package:$pkg"),
        ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /**
     * TODO: Return the version name of the given package.
     */
    fun getVersionName(pkg: String): String? {
        return try {
            val info = context.packageManager.getPackageInfo(pkg, 0)
            info.versionName
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }
    }

    /**
     * TODO: Return a list of all installed package names (non-system filter optional).
     */
    fun listPackages(includeSystem: Boolean = false): List<String> {
        val pm = context.packageManager
        return pm.getInstalledPackages(0)
            .filter {
                includeSystem ||
                    ((it.applicationInfo?.flags ?: 0) and android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0
            }
            .map { it.packageName }
    }
}
