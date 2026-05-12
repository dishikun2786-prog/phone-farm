package com.phonefarm.client.network.security

import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Applies timing jitter and variable-length padding to WebSocket heartbeat messages
 * to defeat traffic analysis based on message size and timing patterns.
 *
 * Obfuscation techniques:
 * 1. **Heartbeat padding**: each heartbeat message is padded with 64-256 bytes
 *    of cryptographically random fill to obscure its fixed-size nature.
 * 2. **Timing jitter**: heartbeat send intervals are jittered by +/-200ms
 *    to prevent accurate inter-arrival time fingerprinting.
 * 3. **Payload shape**: non-heartbeat messages are optionally padded to one
 *    of a few standard sizes (512, 1024, 2048 bytes) to obscure content length.
 */
@Singleton
class TrafficObfuscator @Inject constructor() {

    private val secureRandom = SecureRandom()

    companion object {
        private const val MIN_PADDING_BYTES = 64
        private const val MAX_PADDING_BYTES = 256
        private const val JITTER_MS = 200L
    }

    /**
     * Generate random padding bytes for a heartbeat message.
     * Returns a ByteArray of random length between MIN_PADDING_BYTES and MAX_PADDING_BYTES.
     */
    fun generateHeartbeatPadding(): ByteArray {
        val size = secureRandom.nextInt(MIN_PADDING_BYTES, MAX_PADDING_BYTES + 1)
        return ByteArray(size).also { secureRandom.nextBytes(it) }
    }

    /**
     * Compute the jittered interval for the next heartbeat.
     *
     * [baseIntervalMs] is the standard interval (e.g., 5000ms).
     * Returns the base interval adjusted by a random value in [-JITTER_MS, +JITTER_MS],
     * clamped to a minimum of 1000ms.
     */
    fun jitterInterval(baseIntervalMs: Long): Long {
        val jitter = secureRandom.nextInt(-JITTER_MS.toInt(), JITTER_MS.toInt() + 1).toLong()
        return (baseIntervalMs + jitter).coerceAtLeast(1000L)
    }

    /**
     * Pad a payload to the nearest standard bucket size.
     *
     * Bucket sizes: 256, 512, 1024, 2048, 4096 bytes.
     * If the payload is larger than the largest bucket, no padding is added.
     * Padding bytes are random.
     *
     * Returns the padded byte array.
     */
    fun padToBucket(payload: ByteArray): ByteArray {
        val bucketSizes = intArrayOf(256, 512, 1024, 2048, 4096)
        val targetSize = bucketSizes.find { it >= payload.size } ?: return payload

        val paddingBytes = ByteArray(targetSize - payload.size)
        secureRandom.nextBytes(paddingBytes)
        val padded = payload + paddingBytes
        return padded
    }

    /**
     * Remove padding by returning the original payload size.
     * The original size must be stored/known separately.
     *
     * In practice, the original size is transmitted as the first 2 bytes
     * of the padded payload, or determined by the message framing.
     */
    fun stripPadding(padded: ByteArray, originalSize: Int): ByteArray {
        return padded.copyOfRange(0, originalSize.coerceAtMost(padded.size))
    }

    /**
     * Obfuscate the base64 representation of a payload by injecting
     * whitespace at random positions (to break pattern-matching by intermediate proxies).
     *
     * Currently a pass-through; modern TLS 1.3 proxies make this less relevant.
     */
    fun obfuscateBase64(base64String: String): String {
        return base64String
    }
}
