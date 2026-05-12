package com.phonefarm.client.bridge

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowManager
import android.os.PowerManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `device` global object.
 *
 * Exposes device properties and methods to Rhino scripts:
 *   device.serial, device.model, device.width, device.height,
 *   device.getBattery(), device.isScreenOn(), device.getAndroidId(),
 *   device.brand, device.manufacturer, device.sdkVersionInt
 */
@Singleton
class JsDevice @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    // ---- properties ----

    /**
     * TODO: Return device serial number (Build.getSerial() on API 26+, or ro.serialno).
     */
    val serial: String
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Build.getSerial()
        } else {
            @Suppress("DEPRECATION")
            Build.SERIAL
        }

    /**
     * TODO: Return device model name (Build.MODEL).
     */
    val model: String
        get() = Build.MODEL

    /**
     * TODO: Return screen width in pixels.
     */
    val width: Int
        get() {
            val metrics = DisplayMetrics()
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
            return metrics.widthPixels
        }

    /**
     * TODO: Return screen height in pixels.
     */
    val height: Int
        get() {
            val metrics = DisplayMetrics()
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
            return metrics.heightPixels
        }

    /**
     * TODO: Return device brand (Build.BRAND).
     */
    val brand: String
        get() = Build.BRAND

    /**
     * TODO: Return device manufacturer (Build.MANUFACTURER).
     */
    val manufacturer: String
        get() = Build.MANUFACTURER

    /**
     * TODO: Return Android SDK version integer (Build.VERSION.SDK_INT).
     */
    val sdkVersionInt: Int
        get() = Build.VERSION.SDK_INT

    // ---- methods ----

    /**
     * TODO: Return battery level (0-100) and charging status as a JS-friendly object/string.
     * Uses ACTION_BATTERY_CHANGED sticky intent.
     */
    fun getBattery(): String {
        val intent = context.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED),
        )
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val pct = (level * 100 / scale)
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL

        return """{"level":$pct,"charging":$charging}"""
    }

    /**
     * TODO: Return whether the screen is currently on.
     */
    fun isScreenOn(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            pm.isInteractive
        } else {
            @Suppress("DEPRECATION")
            pm.isScreenOn
        }
    }

    /**
     * TODO: Return the Android ID (Settings.Secure.ANDROID_ID).
     */
    fun getAndroidId(): String {
        return Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        ) ?: ""
    }

    /**
     * TODO: Wake up the device and/or unlock screen (requires appropriate permissions).
     */
    fun wakeUp() {
        // Acquire wake lock briefly and/or dispatch key event
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "phonefarm:device.wakeUp",
        )
        wakeLock.acquire(1000)
        wakeLock.release()
    }

    /**
     * TODO: Keep the screen on for the duration of an automation session.
     */
    fun keepScreenOn(durationMs: Long) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE,
            "phonefarm:device.keepScreenOn",
        )
        wakeLock.acquire(durationMs)
    }
}
