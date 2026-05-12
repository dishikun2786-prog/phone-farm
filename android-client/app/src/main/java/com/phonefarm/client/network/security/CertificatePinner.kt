package com.phonefarm.client.network.security

import okhttp3.CertificatePinner

/**
 * OkHttp CertificatePinner with pinned SHA-256 public key hashes for the
 * PhoneFarm control server.
 *
 * Certificate pinning prevents man-in-the-middle attacks by verifying the
 * server's certificate chain against pre-configured SHA-256 hashes.
 *
 * The pinned hashes should be updated when the server certificate rotates
 * (typically every 90 days).
 */
object CertificatePinnerFactory {

    // Primary server certificate pin (sha256/<base64-encoded SPKI hash>).
    // These are placeholder values; replace with actual server certificate hashes.
    private const val PRIMARY_PIN = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    // Backup pin for certificate rotation (next certificate in rotation chain).
    private const val BACKUP_PIN = "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="

    // Headscale coordination server pin.
    private const val HEADSCALE_PIN = "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="

    /**
     * Create a CertificatePinner configured with both Tailscale MagicDNS patterns.
     *
     * Pinning strategy:
     * - Production server: pins[0] = PRIMARY_PIN, pins[1] = BACKUP_PIN.
     * - At least one of the two must match for successful TLS handshake.
     * - REPLACE placeholder pins with actual server certificate SHA-256 SPKI hashes
     *   before deploying to production.
     *
     * In debug builds, use [createDebug] which disables pinning.
     */
    fun create(): CertificatePinner {
        return CertificatePinner.Builder()
            .add(
                "*.phonefarm.local",   // Tailscale MagicDNS hostname
                PRIMARY_PIN,
                BACKUP_PIN,
            )
            .add(
                "*.tailnet-*.ts.net",  // Tailscale MagicDNS pattern
                PRIMARY_PIN,
                BACKUP_PIN,
            )
            // TODO: Add production domain once DNS is configured.
            // .add("api.phonefarm.io", PRIMARY_PIN, BACKUP_PIN)
            .build()
    }

    /**
     * Return a no-op pinner for development/debug builds.
     * Allows connecting to self-signed, emulator, or otherwise untrusted TLS endpoints.
     */
    fun createDebug(): CertificatePinner = CertificatePinner.DEFAULT
}
