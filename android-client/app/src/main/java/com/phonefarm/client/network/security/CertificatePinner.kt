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

    // Google Trust Services root CA R4 — permanent, does not expire.
    // cloudflare uses GTS as CA, so pinning the root validates any GTS-issued cert.
    private const val GTS_ROOT_R4_PIN =
        "sha256/hUqBGNNDFzl2BnemMsKbD7qAuQ1tGlpOXkMRcZqTqOs="

    // Cloudflare edge certificate (GTS WE1 leaf) — expires 2026-07-03.
    // Secondary pin; remove or replace with current edge cert hash after renewal.
    private const val CLOUDFLARE_EDGE_PIN =
        "sha256/Ne5iCXIYr1PAn3QMIJOUlerhMjil/BpZiKcUFezYjzA="

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
            .add("phone.openedskill.com", GTS_ROOT_R4_PIN, CLOUDFLARE_EDGE_PIN)
            .add("*.openedskill.com", GTS_ROOT_R4_PIN, CLOUDFLARE_EDGE_PIN)
            .build()
    }
}
