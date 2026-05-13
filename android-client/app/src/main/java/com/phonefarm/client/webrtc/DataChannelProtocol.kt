package com.phonefarm.client.webrtc

import android.util.Log
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.nio.charset.StandardCharsets

/**
 * Binary protocol for device control over WebRTC DataChannel.
 *
 * Message format:
 *   [1 byte: message type][4 bytes: payload length (big-endian)][N bytes: payload]
 *
 * Each message type carries a compact binary payload optimized for low-latency
 * touch/key/scroll events and batch shell commands. ACK and HEARTBEAT messages
 * carry minimal overhead for P2P connection health tracking.
 */
object DataChannelProtocol {

    private const val TAG = "DataChannelProto"

    // ── Message Type Constants ──

    const val TYPE_TOUCH_DOWN: Byte = 0x10
    const val TYPE_TOUCH_MOVE: Byte = 0x11
    const val TYPE_TOUCH_UP: Byte = 0x12
    const val TYPE_KEY_EVENT: Byte = 0x20
    const val TYPE_SCROLL: Byte = 0x30
    const val TYPE_SHELL_CMD: Byte = 0x40
    const val TYPE_CLIPBOARD: Byte = 0x50
    const val TYPE_FILE_TRANSFER: Byte = 0x60
    const val TYPE_HEARTBEAT: Byte = 0xF0.toByte()
    const val TYPE_ACK: Byte = 0xF1.toByte()

    // ── Header Sizes ──

    private const val HEADER_SIZE = 5 // 1 byte type + 4 bytes length
    private const val MAX_PAYLOAD_SIZE = 1_048_576 // 1 MiB safety cap

    // ── Protocol Message Sealed Class ──

    sealed class ProtocolMessage {
        data class TouchEvent(
            val action: Int,         // MotionEvent.ACTION_DOWN/UP/MOVE
            val x: Float,
            val y: Float,
            val pointerId: Int = 0,
            val pressure: Float = 1.0f,
            val timestamp: Long = System.currentTimeMillis()
        ) : ProtocolMessage()

        data class KeyEvent(
            val keyCode: Int,
            val action: Int,         // KeyEvent.ACTION_DOWN/UP
            val metaState: Int = 0,
            val timestamp: Long = System.currentTimeMillis()
        ) : ProtocolMessage()

        data class Scroll(
            val x: Float,
            val y: Float,
            val dx: Float,
            val dy: Float,
            val timestamp: Long = System.currentTimeMillis()
        ) : ProtocolMessage()

        data class ShellCommand(
            val command: String,
            val requestId: String = ""
        ) : ProtocolMessage()

        data class Clipboard(
            val text: String,
            val action: String = "set"  // "set" | "get" | "get_response"
        ) : ProtocolMessage()

        data class Heartbeat(
            val seq: Int,
            val timestamp: Long = System.currentTimeMillis()
        ) : ProtocolMessage()

        data class Ack(
            val seq: Int,
            val originalType: Byte,
            val success: Boolean = true
        ) : ProtocolMessage()
    }

    // ── Encoding ──

    /**
     * Encode a touch event into binary protocol format.
     *
     * Payload layout (19 bytes):
     *   [1b: action][4b: pointerId][4b: x (float)][4b: y (float)][2b: pressure*100][4b: timestamp (int)]
     */
    fun encodeTouchEvent(
        action: Int,
        x: Float,
        y: Float,
        pointerId: Int = 0,
        pressure: Float = 1.0f
    ): ByteArray {
        val payload = ByteArrayOutputStream(19)
        val dos = DataOutputStream(payload)
        dos.writeByte(action)
        dos.writeInt(pointerId)
        dos.writeFloat(x)
        dos.writeFloat(y)
        dos.writeShort((pressure * 100f).toInt().coerceIn(0, 1000))
        dos.writeInt((System.currentTimeMillis() % Int.MAX_VALUE).toInt())
        dos.close()

        val type = when (action) {
            0 -> TYPE_TOUCH_DOWN   // ACTION_DOWN
            1 -> TYPE_TOUCH_UP     // ACTION_UP
            2 -> TYPE_TOUCH_MOVE   // ACTION_MOVE
            else -> TYPE_TOUCH_MOVE
        }
        return frameMessage(type, payload.toByteArray())
    }

    /**
     * Encode a key event into binary protocol format.
     *
     * Payload layout (9 bytes):
     *   [1b: action][4b: keyCode][4b: metaState]
     */
    fun encodeKeyEvent(keyCode: Int, action: Int, metaState: Int = 0): ByteArray {
        val payload = ByteArrayOutputStream(9)
        val dos = DataOutputStream(payload)
        dos.writeByte(action)
        dos.writeInt(keyCode)
        dos.writeInt(metaState)
        dos.close()
        return frameMessage(TYPE_KEY_EVENT, payload.toByteArray())
    }

    /**
     * Encode a scroll event into binary protocol format.
     *
     * Payload layout (16 bytes):
     *   [4b: x (float)][4b: y (float)][4b: dx (float)][4b: dy (float)]
     */
    fun encodeScroll(x: Float, y: Float, dx: Float, dy: Float): ByteArray {
        val payload = ByteArrayOutputStream(16)
        val dos = DataOutputStream(payload)
        dos.writeFloat(x)
        dos.writeFloat(y)
        dos.writeFloat(dx)
        dos.writeFloat(dy)
        dos.close()
        return frameMessage(TYPE_SCROLL, payload.toByteArray())
    }

    /**
     * Encode a shell command into binary protocol format.
     *
     * Payload layout:
     *   [4b: requestId length][N: requestId UTF-8][2b: command length][N: command UTF-8]
     */
    fun encodeShellCommand(command: String): ByteArray {
        val cmdBytes = command.toByteArray(StandardCharsets.UTF_8)
        if (cmdBytes.size > 65535) {
            throw IllegalArgumentException("Shell command too long: ${cmdBytes.size} bytes (max 65535)")
        }

        // Empty requestId for fire-and-forget commands
        val requestIdBytes = ByteArray(0)
        val payload = ByteArrayOutputStream(4 + requestIdBytes.size + 2 + cmdBytes.size)
        val dos = DataOutputStream(payload)
        dos.writeInt(requestIdBytes.size)
        dos.write(requestIdBytes)
        dos.writeShort(cmdBytes.size)
        dos.write(cmdBytes)
        dos.close()
        return frameMessage(TYPE_SHELL_CMD, payload.toByteArray())
    }

    /**
     * Encode a clipboard text into binary protocol format.
     *
     * Payload layout:
     *   [1b: action length][N: action ASCII][2b: text length][N: text UTF-8]
     */
    fun encodeClipboard(text: String): ByteArray {
        val textBytes = text.toByteArray(StandardCharsets.UTF_8)
        if (textBytes.size > 65535) {
            throw IllegalArgumentException("Clipboard text too long: ${textBytes.size} bytes (max 65535)")
        }
        val action = "set"
        val actionBytes = action.toByteArray(StandardCharsets.US_ASCII)
        val payload = ByteArrayOutputStream(1 + actionBytes.size + 2 + textBytes.size)
        val dos = DataOutputStream(payload)
        dos.writeByte(actionBytes.size)
        dos.write(actionBytes)
        dos.writeShort(textBytes.size)
        dos.write(textBytes)
        dos.close()
        return frameMessage(TYPE_CLIPBOARD, payload.toByteArray())
    }

    /**
     * Encode a heartbeat message.
     *
     * Payload layout (4 bytes):
     *   [4b: seq (int)]
     */
    fun encodeHeartbeat(seq: Int): ByteArray {
        val payload = ByteArrayOutputStream(4)
        val dos = DataOutputStream(payload)
        dos.writeInt(seq)
        dos.close()
        return frameMessage(TYPE_HEARTBEAT, payload.toByteArray())
    }

    /**
     * Encode an ACK message.
     *
     * Payload layout (6 bytes):
     *   [4b: seq (int)][1b: originalType][1b: success flag]
     */
    fun encodeAck(seq: Int, originalType: Byte, success: Boolean = true): ByteArray {
        val payload = ByteArrayOutputStream(6)
        val dos = DataOutputStream(payload)
        dos.writeInt(seq)
        dos.writeByte(originalType.toInt())
        dos.writeByte(if (success) 1 else 0)
        dos.close()
        return frameMessage(TYPE_ACK, payload.toByteArray())
    }

    // ── Decoding ──

    /**
     * Decode a binary protocol message from a byte array.
     *
     * @param data the raw bytes received from the DataChannel
     * @return the decoded [ProtocolMessage], or null if the data is malformed
     */
    fun decode(data: ByteArray): ProtocolMessage? {
        if (data.size < HEADER_SIZE) {
            Log.w(TAG, "Message too short: ${data.size} bytes (min $HEADER_SIZE)")
            return null
        }

        return try {
            val dis = DataInputStream(ByteArrayInputStream(data))
            val msgType = dis.readByte()
            val payloadLength = dis.readInt()

            // Validate payload length bounds
            if (payloadLength < 0 || payloadLength > MAX_PAYLOAD_SIZE) {
                Log.w(TAG, "Invalid payload length: $payloadLength")
                return null
            }

            val availablePayload = data.size - HEADER_SIZE
            if (availablePayload < payloadLength) {
                Log.w(TAG, "Truncated payload: expected $payloadLength, got $availablePayload")
                return null
            }

            val payload = ByteArray(payloadLength)
            dis.readFully(payload)
            dis.close()

            decodePayload(msgType, payload)
        } catch (e: EOFException) {
            Log.w(TAG, "EOF while decoding message", e)
            null
        } catch (e: Exception) {
            Log.e(TAG, "Decode error", e)
            null
        }
    }

    /**
     * Check if the raw data starts with a valid protocol header by examining the
     * first byte for a known message type.
     */
    fun looksLikeProtocolMessage(data: ByteArray): Boolean {
        if (data.isEmpty()) return false
        return when (data[0]) {
            TYPE_TOUCH_DOWN, TYPE_TOUCH_MOVE, TYPE_TOUCH_UP,
            TYPE_KEY_EVENT, TYPE_SCROLL, TYPE_SHELL_CMD,
            TYPE_CLIPBOARD, TYPE_FILE_TRANSFER,
            TYPE_HEARTBEAT, TYPE_ACK -> true
            else -> false
        }
    }

    // ── Private Helpers ──

    /**
     * Frame a payload with the 5-byte header.
     */
    private fun frameMessage(type: Byte, payload: ByteArray): ByteArray {
        if (payload.size > MAX_PAYLOAD_SIZE) {
            throw IllegalArgumentException("Payload too large: ${payload.size} bytes (max $MAX_PAYLOAD_SIZE)")
        }
        val framed = ByteArray(HEADER_SIZE + payload.size)
        val dos = DataOutputStream(ByteArrayOutputStream().apply { write(framed, 0, 0) })
        // Write directly into the array
        framed[0] = type
        framed[1] = ((payload.size shr 24) and 0xFF).toByte()
        framed[2] = ((payload.size shr 16) and 0xFF).toByte()
        framed[3] = ((payload.size shr 8) and 0xFF).toByte()
        framed[4] = (payload.size and 0xFF).toByte()
        System.arraycopy(payload, 0, framed, HEADER_SIZE, payload.size)
        return framed
    }

    /**
     * Decode a payload based on its message type.
     */
    private fun decodePayload(type: Byte, payload: ByteArray): ProtocolMessage? {
        val dis = DataInputStream(ByteArrayInputStream(payload))
        return try {
            when (type) {
                TYPE_TOUCH_DOWN, TYPE_TOUCH_MOVE, TYPE_TOUCH_UP -> {
                    if (payload.size < 19) {
                        Log.w(TAG, "Touch payload too short: ${payload.size}")
                        return null
                    }
                    val action = dis.readByte().toInt()
                    val pointerId = dis.readInt()
                    val x = dis.readFloat()
                    val y = dis.readFloat()
                    val pressure = dis.readShort().toInt() / 100f
                    val timestamp = dis.readInt().toLong()
                    ProtocolMessage.TouchEvent(
                        action = action,
                        x = x, y = y,
                        pointerId = pointerId,
                        pressure = pressure.coerceIn(0f, 10f),
                        timestamp = timestamp
                    )
                }

                TYPE_KEY_EVENT -> {
                    if (payload.size < 9) {
                        Log.w(TAG, "KeyEvent payload too short: ${payload.size}")
                        return null
                    }
                    val action = dis.readByte().toInt()
                    val keyCode = dis.readInt()
                    val metaState = dis.readInt()
                    ProtocolMessage.KeyEvent(keyCode = keyCode, action = action, metaState = metaState)
                }

                TYPE_SCROLL -> {
                    if (payload.size < 16) {
                        Log.w(TAG, "Scroll payload too short: ${payload.size}")
                        return null
                    }
                    val x = dis.readFloat()
                    val y = dis.readFloat()
                    val dx = dis.readFloat()
                    val dy = dis.readFloat()
                    ProtocolMessage.Scroll(x = x, y = y, dx = dx, dy = dy)
                }

                TYPE_SHELL_CMD -> {
                    if (payload.size < 6) {
                        Log.w(TAG, "ShellCommand payload too short: ${payload.size}")
                        return null
                    }
                    val reqIdLen = dis.readInt()
                    val requestIdBytes = ByteArray(reqIdLen.coerceIn(0, 256))
                    if (reqIdLen > 0) dis.readFully(requestIdBytes)
                    val cmdLen = dis.readShort().toInt() and 0xFFFF
                    if (cmdLen < 0 || cmdLen > MAX_PAYLOAD_SIZE) {
                        Log.w(TAG, "Invalid shell command length: $cmdLen")
                        return null
                    }
                    val cmdBytes = ByteArray(cmdLen)
                    dis.readFully(cmdBytes)
                    ProtocolMessage.ShellCommand(
                        command = String(cmdBytes, StandardCharsets.UTF_8),
                        requestId = String(requestIdBytes, StandardCharsets.UTF_8)
                    )
                }

                TYPE_CLIPBOARD -> {
                    if (payload.size < 3) {
                        Log.w(TAG, "Clipboard payload too short: ${payload.size}")
                        return null
                    }
                    val actionLen = dis.readByte().toInt() and 0xFF
                    val actionBytes = ByteArray(actionLen.coerceIn(0, 64))
                    if (actionLen > 0) dis.readFully(actionBytes)
                    val textLen = dis.readShort().toInt() and 0xFFFF
                    if (textLen < 0 || textLen > MAX_PAYLOAD_SIZE) {
                        Log.w(TAG, "Invalid clipboard text length: $textLen")
                        return null
                    }
                    val textBytes = ByteArray(textLen)
                    dis.readFully(textBytes)
                    ProtocolMessage.Clipboard(
                        text = String(textBytes, StandardCharsets.UTF_8),
                        action = String(actionBytes, StandardCharsets.US_ASCII)
                    )
                }

                TYPE_HEARTBEAT -> {
                    if (payload.size < 4) {
                        Log.w(TAG, "Heartbeat payload too short: ${payload.size}")
                        return null
                    }
                    ProtocolMessage.Heartbeat(seq = dis.readInt())
                }

                TYPE_ACK -> {
                    if (payload.size < 6) {
                        Log.w(TAG, "ACK payload too short: ${payload.size}")
                        return null
                    }
                    val seq = dis.readInt()
                    val origType = dis.readByte()
                    val success = dis.readByte() != 0.toByte()
                    ProtocolMessage.Ack(seq = seq, originalType = origType, success = success)
                }

                else -> {
                    Log.w(TAG, "Unknown message type: 0x${String.format("%02X", type)}")
                    null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Payload decode error for type 0x${String.format("%02X", type)}", e)
            null
        } finally {
            try { dis.close() } catch (_: Exception) {}
        }
    }
}
