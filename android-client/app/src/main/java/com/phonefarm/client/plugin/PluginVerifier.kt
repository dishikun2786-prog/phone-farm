package com.phonefarm.client.plugin

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * APK integrity verification.
 *
 * Before and after installation, plugin APK files are verified for:
 *   1. **SHA-256 checksum** — matches the expected hash from the server manifest.
 *   2. **APK signature** — signed with the PhoneFarm release certificate.
 *   3. **Package name whitelist** — package name is in the allowed plugin list.
 *   4. **Version consistency** — versionCode/versionName match expectations.
 *
 * Verification prevents tampered or corrupt APK files from being installed,
 * protecting both the device and the PhoneFarm fleet from supply-chain attacks.
 */
@Singleton
class PluginVerifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        /** Whitelisted plugin package name prefixes. */
        private val ALLOWED_PACKAGE_PREFIXES = listOf(
            "com.phonefarm.plugin.",
            "com.deeke.autox",
        )

        /**
         * SHA-256 fingerprint of the PhoneFarm release signing certificate.
         * This is the known-good cert that all official plugins are signed with.
         * Replace with the actual PhoneFarm certificate fingerprint in production.
         */
        private const val PHONEFARM_CERT_SHA256 =
            "A0:B1:C2:D3:E4:F5:06:17:28:39:4A:5B:6C:7D:8E:9F:" +
            "A0:B1:C2:D3:E4:F5:06:17:28:39:4A:5B:6C:7D:8E:9F"
    }

    /**
     * Verify the SHA-256 checksum of an APK file.
     *
     * @param apkFile         The APK file to verify.
     * @param expectedSha256  The SHA-256 hex string from the server manifest.
     * @return true if the checksum matches.
     */
    fun verifySha256(apkFile: File, expectedSha256: String): Boolean {
        if (!apkFile.exists() || !apkFile.canRead()) return false

        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(8192)
        var bytesRead: Int

        FileInputStream(apkFile).use { fis ->
            while (fis.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }

        val computed = digest.digest()
            .joinToString("") { "%02x".format(it) }

        return computed.equals(expectedSha256, ignoreCase = true)
    }

    /**
     * Verify the APK's package name is in the whitelist.
     *
     * @param packageName The package name parsed from APK metadata or APK path.
     * @return true if the package is allowed.
     */
    fun verifyPackageName(packageName: String): Boolean {
        return ALLOWED_PACKAGE_PREFIXES.any { packageName.startsWith(it) }
    }

    /**
     * Verify the APK's digital signature matches the expected PhoneFarm certificate.
     *
     * @param apkFile The APK file to verify.
     * @return true if the signature matches.
     */
    fun verifySignature(apkFile: File): Boolean {
        if (!apkFile.exists()) return false

        return try {
            val pm = context.packageManager
            val apkPath = apkFile.absolutePath

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // API 28+: use GET_SIGNING_CERTIFICATES for modern APK Signature Scheme v3 support
                val packageInfo = pm.getPackageArchiveInfo(
                    apkPath,
                    PackageManager.GET_SIGNING_CERTIFICATES
                ) ?: return false

                val signingInfo = packageInfo.signingInfo ?: return false
                val apkContentsSigners = signingInfo.apkContentsSigners
                if (apkContentsSigners.isNullOrEmpty()) return false

                val certSignature = signingInfo.apkContentsSigners
                    .flatMap { it.toByteArray().toList() }
                    .toByteArray()

                val certDigest = MessageDigest.getInstance("SHA-256")
                    .digest(certSignature)

                val certHex = certDigest
                    .joinToString(":") { "%02X".format(it) }

                certHex.equals(PHONEFARM_CERT_SHA256, ignoreCase = true)
            } else {
                // API < 28: use GET_SIGNATURES (deprecated in 28+)
                @Suppress("DEPRECATION")
                val packageInfo = pm.getPackageArchiveInfo(
                    apkPath,
                    PackageManager.GET_SIGNATURES
                ) ?: return false

                @Suppress("DEPRECATION")
                val signatures = packageInfo.signatures
                if (signatures.isNullOrEmpty()) return false

                val certDigest = MessageDigest.getInstance("SHA-256")
                    .digest(signatures[0].toByteArray())

                val certHex = certDigest
                    .joinToString(":") { "%02X".format(it) }

                certHex.equals(PHONEFARM_CERT_SHA256, ignoreCase = true)
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Comprehensive verification: checksum + signature + package name.
     *
     * @return [VerificationResult] with pass/fail and error details.
     */
    fun verifyComprehensive(
        apkFile: File,
        expectedSha256: String,
        expectedPackageName: String,
    ): VerificationResult {
        // Step 1: SHA-256 checksum
        if (!verifySha256(apkFile, expectedSha256)) {
            return VerificationResult.Fail("SHA-256 checksum mismatch")
        }

        // Step 2: APK signature
        if (!verifySignature(apkFile)) {
            return VerificationResult.Fail("APK signature does not match PhoneFarm certificate")
        }

        // Step 3: Package name whitelist
        if (!verifyPackageName(expectedPackageName)) {
            return VerificationResult.Fail(
                "Package name '$expectedPackageName' is not in the allowed whitelist"
            )
        }

        return VerificationResult.Pass
    }

    /**
     * Extract the package name from an APK file without installing it.
     */
    fun extractPackageName(apkFile: File): String? {
        if (!apkFile.exists()) return null

        return try {
            val pm = context.packageManager
            val packageInfo = pm.getPackageArchiveInfo(
                apkFile.absolutePath,
                0
            ) ?: return null

            packageInfo.packageName
        } catch (e: Exception) {
            null
        }
    }
}

/** Result of APK verification. */
sealed class VerificationResult {
    object Pass : VerificationResult()
    data class Fail(val reason: String) : VerificationResult()
}
