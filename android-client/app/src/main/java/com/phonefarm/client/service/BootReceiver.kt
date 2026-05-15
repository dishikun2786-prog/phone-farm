package com.phonefarm.client.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.phonefarm.client.data.local.SecurePreferences
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "BootReceiver"
        const val KEY_ACTIVATED = "device_activated"
    }

    @Inject
    lateinit var securePreferences: SecurePreferences

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        Log.i(TAG, "Boot completed, checking activation status")

        val activated = try {
            securePreferences.getString(KEY_ACTIVATED) == "true"
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read activation status, assuming not activated", e)
            false
        }

        if (!activated) {
            Log.i(TAG, "Device not activated, skipping service start")
            return
        }

        Log.i(TAG, "Device activated, starting BridgeForegroundService")
        val serviceIntent = Intent(context, BridgeForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
