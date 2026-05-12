package com.phonefarm.client.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BroadcastReceiver that starts [BridgeForegroundService] on BOOT_COMPLETED.
 * Requires RECEIVE_BOOT_COMPLETED permission declared in AndroidManifest.xml.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        // TODO: Guard against non-boot intents; only react to BOOT_COMPLETED.
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.i(TAG, "Boot completed, starting BridgeForegroundService")
            // TODO: Check if activation has been completed; skip if device not yet activated.
            val serviceIntent = Intent(context, BridgeForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
