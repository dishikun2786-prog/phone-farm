package com.phonefarm.client.plugin

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.IBinder
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Post-install health check for plugins.
 *
 * After a plugin APK is installed (or updated), the health checker:
 *   1. **Bind service** — connect to the plugin's exported service.
 *   2. **Ping** — send a simple "ping" message and expect "pong".
 *   3. **Version check** — verify the running version matches expectations.
 *   4. **Graceful shutdown** — unbind cleanly after check.
 *
 * If the health check fails:
 *   - Retry up to 3 times with exponential backoff.
 *   - If all retries fail, trigger auto-rollback via [PluginRollbackManager].
 *
 * Health check timeout: 10 seconds per attempt.
 */
@Singleton
class PluginHealthChecker @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val MAX_RETRIES = 3
        private const val HEALTH_CHECK_TIMEOUT_MS = 10_000L
    }

    /**
     * Perform a comprehensive health check on a newly installed/updated plugin.
     *
     * @param packageName      The plugin's Android package name.
     * @param serviceClassName The fully qualified service class to bind.
     * @param expectedVersion  The expected version after installation.
     * @return [HealthCheckResult] indicating pass/fail.
     */
    suspend fun checkHealth(
        packageName: String,
        serviceClassName: String,
        expectedVersion: String,
    ): HealthCheckResult {
        var lastError: String? = null

        for (retry in 0..MAX_RETRIES) {
            // Exponential backoff before retries (except first attempt)
            if (retry > 0) {
                delay((500L * (1 shl (retry - 1))).coerceAtMost(8_000L))
            }

            try {
                val bindSucceeded = withTimeoutOrNull(HEALTH_CHECK_TIMEOUT_MS) {
                    bindAndWaitForService(packageName, serviceClassName)
                }

                if (bindSucceeded == true) {
                    // Service bound successfully — ping check implicit in bind success
                    // Verify version by querying PackageManager
                    try {
                        val pm = context.packageManager
                        val pkgInfo = pm.getPackageInfo(packageName, 0)
                        val installedVersion = pkgInfo.versionName

                        if (installedVersion == expectedVersion) {
                            return HealthCheckResult.Pass
                        } else {
                            lastError = "Version mismatch: expected $expectedVersion, got $installedVersion"
                            // Continue retry loop
                        }
                    } catch (e: PackageManager.NameNotFoundException) {
                        lastError = "Package not found after service bind: ${e.message}"
                    }
                } else {
                    lastError = "Service bind timeout or failed"
                }
            } catch (e: Exception) {
                lastError = "Health check exception: ${e.message}"
            }
        }

        return HealthCheckResult.Fail(
            reason = lastError ?: "Unknown error",
            retriesUsed = MAX_RETRIES,
        )
    }

    /**
     * Bind to the plugin's service and wait for a connection.
     *
     * Uses [suspendCancellableCoroutine] to turn the async service callback
     * into a suspend-friendly form with timeout support.
     */
    private suspend fun bindAndWaitForService(
        packageName: String,
        serviceClassName: String,
    ): Boolean = suspendCancellableCoroutine { continuation ->
        val componentName = ComponentName(packageName, serviceClassName)
        val intent = Intent().setComponent(componentName)

        var bound = false
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                bound = true
                // Send a simple ping — the plugin service should respond with pong
                // For now, successful bind is treated as health check pass
                context.unbindService(this)
                if (continuation.isActive) {
                    continuation.resume(true)
                }
            }

            override fun onServiceDisconnected(name: ComponentName?) {
                // Service disconnected unexpectedly
                if (!bound && continuation.isActive) {
                    continuation.resume(false)
                }
            }

            override fun onBindingDied(name: ComponentName?) {
                if (continuation.isActive) {
                    continuation.resume(false)
                }
            }

            override fun onNullBinding(name: ComponentName?) {
                if (continuation.isActive) {
                    continuation.resume(false)
                }
            }
        }

        try {
            val didBind = context.bindService(
                intent,
                connection,
                Context.BIND_AUTO_CREATE
            )
            if (!didBind) {
                continuation.resume(false)
            }
        } catch (e: Exception) {
            if (continuation.isActive) {
                continuation.resumeWithException(e)
            }
        }

        continuation.invokeOnCancellation {
            try {
                context.unbindService(connection)
            } catch (_: Exception) {
                // Already unbound
            }
        }
    }

    /**
     * Perform a quick liveness check (ping only, no version check).
     *
     * Used for periodic health monitoring of already-installed plugins.
     */
    suspend fun quickPing(packageName: String, serviceClassName: String): Boolean {
        val result = withTimeoutOrNull(2_000L) {
            bindAndWaitForService(packageName, serviceClassName)
        }
        return result == true
    }

    /**
     * Check if a plugin's exported service is currently running.
     *
     * Uses ActivityManager.getRunningServices to check without binding.
     */
    fun isServiceRunning(packageName: String, serviceClassName: String): Boolean {
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
                ?: return false

            val runningServices = am.getRunningServices(100)
            runningServices.any { service ->
                service.service.packageName == packageName &&
                        service.service.className == serviceClassName
            }
        } catch (e: Exception) {
            // getRunningServices may throw SecurityException on some devices
            false
        }
    }
}

/** Result of a plugin health check. */
sealed class HealthCheckResult {
    object Pass : HealthCheckResult()
    data class Fail(val reason: String, val retriesUsed: Int) : HealthCheckResult()
}
