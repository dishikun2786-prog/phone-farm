package com.phonefarm.client.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * APK self-update downloader with SHA-256 verification and system-installer integration.
 *
 * Flow:
 *  1. [checkForUpdate] — query server API for latest version
 *  2. [downloadUpdate] — fetch APK via OkHttp with progress reporting
 *  3. [installUpdate] — verify SHA-256, expose via FileProvider URI, launch system installer
 *
 * The update state is exposed as a [StateFlow] for UI binding.
 */
@Singleton
class SelfUpdater @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
) {

    enum class UpdateStatus {
        IDLE,
        CHECKING,
        UPDATE_AVAILABLE,
        DOWNLOADING,
        VERIFYING,
        READY_TO_INSTALL,
        INSTALLING,
        ERROR,
    }

    data class UpdateState(
        val status: UpdateStatus = UpdateStatus.IDLE,
        val progress: Float = 0f,        // 0.0–1.0
        val downloadedBytes: Long = 0L,
        val totalBytes: Long = 0L,
        val errorMessage: String? = null,
        val updateInfo: UpdateInfo? = null,
    )

    data class UpdateInfo(
        val versionName: String,
        val versionCode: Int,
        val downloadUrl: String,
        val sha256: String,
        val releaseNotes: String?,
        val fileSizeBytes: Long,
        val isForceUpdate: Boolean,
    )

    private val _updateState = MutableStateFlow(UpdateState())
    val updateState: StateFlow<UpdateState> = _updateState.asStateFlow()

    /**
     * Query the server for the latest APK version.
     *
     * Compares against the currently installed version code to determine
     * whether an update is available.
     *
     * @return [UpdateInfo] if an update is available, null otherwise.
     */
    suspend fun checkForUpdate(): UpdateInfo? {
        _updateState.value = _updateState.value.copy(
            status = UpdateStatus.CHECKING
        )

        return try {
            val currentVersionCode = getCurrentVersionCode()

            // TODO: Call the server API:
            //       val response = okHttpClient.newCall(
            //           Request.Builder().url("${baseUrl}/api/v1/android/version").build()
            //       ).execute()
            //       Parse JSON response into UpdateInfo.
            //       Compare versionCode with currentVersionCode.

            _updateState.value = _updateState.value.copy(
                status = UpdateStatus.IDLE
            )
            null // No update available by default.
        } catch (e: Exception) {
            _updateState.value = _updateState.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = "Version check failed: ${e.message}",
            )
            null
        }
    }

    /**
     * Download the APK from [url] to the internal cache directory.
     *
     * Reports download progress via [onProgress] and [updateState].
     *
     * @param url         The download URL for the APK.
     * @param onProgress  Callback receiving progress 0.0–1.0.
     * @return The downloaded APK [File].
     */
    suspend fun downloadUpdate(
        url: String,
        onProgress: (Float) -> Unit = {},
    ): File = withContext(Dispatchers.IO) {
        _updateState.value = _updateState.value.copy(
            status = UpdateStatus.DOWNLOADING, progress = 0f
        )

        val apkFile = File(context.cacheDir, "update_${System.currentTimeMillis()}.apk")

        try {
            val request = Request.Builder().url(url).build()
            val response = okHttpClient.newCall(request).execute()

            if (!response.isSuccessful) {
                throw Exception("Download failed: HTTP ${response.code}")
            }

            val body = response.body
                ?: throw Exception("Empty response body")

            val contentLength = body.contentLength()
            var downloadedBytes = 0L

            body.byteStream().use { input ->
                FileOutputStream(apkFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead
                        val progress = if (contentLength > 0) {
                            downloadedBytes.toFloat() / contentLength.toFloat()
                        } else -1f
                        _updateState.value = _updateState.value.copy(
                            progress = progress,
                            downloadedBytes = downloadedBytes,
                            totalBytes = contentLength,
                        )
                        onProgress(progress)
                    }
                }
            }

            response.close()

            _updateState.value = _updateState.value.copy(
                status = UpdateStatus.READY_TO_INSTALL,
                progress = 1f,
            )

            apkFile
        } catch (e: Exception) {
            apkFile.delete()
            _updateState.value = _updateState.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = "Download failed: ${e.message}",
            )
            throw e
        }
    }

    /**
     * Verify SHA-256 checksum of the downloaded APK and launch system installer.
     *
     * @param apkFile       The downloaded APK file.
     * @param expectedSha256 Expected SHA-256 hex string.
     */
    suspend fun installUpdate(apkFile: File, expectedSha256: String? = null) {
        _updateState.value = _updateState.value.copy(status = UpdateStatus.VERIFYING)

        // SHA-256 verification.
        if (expectedSha256 != null) {
            val actualSha256 = computeSha256(apkFile)
            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                _updateState.value = _updateState.value.copy(
                    status = UpdateStatus.ERROR,
                    errorMessage = "SHA-256 mismatch: expected=$expectedSha256 actual=$actualSha256",
                )
                apkFile.delete()
                return
            }
        }

        _updateState.value = _updateState.value.copy(status = UpdateStatus.INSTALLING)

        try {
            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile,
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            context.startActivity(installIntent)

            _updateState.value = _updateState.value.copy(status = UpdateStatus.IDLE)
        } catch (e: Exception) {
            _updateState.value = _updateState.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = "Install failed: ${e.message}",
            )
        }
    }

    /**
     * Get the currently installed app version code.
     */
    private fun getCurrentVersionCode(): Int {
        return try {
            val pkgInfo = context.packageManager
                .getPackageInfo(context.packageName, 0)
            pkgInfo.versionCode
        } catch (_: Exception) {
            0
        }
    }

    /**
     * Compute SHA-256 hash of a file.
     */
    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
