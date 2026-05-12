package com.phonefarm.client.network.security

import com.phonefarm.client.BuildConfig
import okhttp3.CertificatePinner

/**
 * OkHttp CertificatePinner with SHA-256 public key pinning for the
 * PhoneFarm control server at phone.openedskill.com.
 *
 * Certificate pinning prevents man-in-the-middle attacks by verifying the
 * server's certificate chain against pre-configured SHA-256 SPKI hashes.
 *
 * Pin expires 2026-07-03 — regenerate before expiry:
 *   openssl s_client -connect phone.openedskill.com:443 -servername phone.openedskill.com </dev/null 2>/dev/null \
 *     | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64
 */
object CertificatePinnerFactory {

    // Cloudflare edge certificate (Google Trust Services WE1) — expires 2026-07-03
    private const val CLOUDFLARE_EDGE_PIN =
        "sha256/Ne5iCXIYr1PAn3QMIJOUlerhMjil/BpZiKcUFezYjzA="

    // Backup: Google Trust Services root CA R4
    private const val GTS_ROOT_R4_PIN =
        "sha256/hUqBGNNDFzl2BnemMsKbD7qAuQ1tGlpOXkMRcZqTqOs="

    /**
     * Create a CertificatePinner for the production server.
     *
     * On release/staging builds: pins against Cloudflare edge + GTS root backup.
     * On debug builds: no pinning (allow emulator/localhost/self-signed).
     */
    fun create(): CertificatePinner {
        if (BuildConfig.DEBUG) {
            return CertificatePinner.DEFAULT
        }

        return CertificatePinner.Builder()
            .add("phone.openedskill.com", CLOUDFLARE_EDGE_PIN, GTS_ROOT_R4_PIN)
            .add("*.openedskill.com", CLOUDFLARE_EDGE_PIN, GTS_ROOT_R4_PIN)
            .build()
    }
}
