package com.phonefarm.client.network.codec

import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Protobuf encode/decode for binary WebSocket messages.
 *
 * Handles two high-bandwidth message types:
 * 1. **VideoFrame** — scrcpy H.264/H.265 encoded frames pushed from device.
 *    Fields: frame_id (int64), timestamp_ms (int64), keyframe (bool),
 *            format (enum: h264/h265), width (int32), height (int32),
 *            data (bytes).
 * 2. **ControlMessage** — generic binary command/control.
 *    Fields: command_id (string), request_id (string), action (string),
 *            payload (bytes), timestamp_ms (int64).
 *
 * Encoding is wire-format Protocol Buffers (proto3) implemented manually
 * to avoid relying on generated Kotlin classes or protobuf-lite runtime.
 */
@Singleton
class ProtobufCodec @Inject constructor() {

    // ---- VideoFrame encoding / decoding ----

    /**
     * Encode a VideoFrame to protobuf wire format.
     *
     *   message VideoFrame {
     *     int64 frame_id = 1;
     *     int64 timestamp_ms = 2;
     *     bool keyframe = 3;
     *     VideoFormat format = 4; // H264=0, H265=1
     *     int32 width = 5;
     *     int32 height = 6;
     *     bytes data = 7;
     *   }
     */
    fun encodeVideoFrame(frame: VideoFrame): ByteArray {
        val out = ByteArrayOutputStream()
        // Field 1: frameId (varint)
        writeVarintField(out, 1, frame.frameId)
        // Field 2: timestampMs (varint)
        writeVarintField(out, 2, frame.timestampMs)
        // Field 3: keyframe (varint, 0 or 1)
        writeVarintField(out, 3, if (frame.isKeyframe) 1L else 0L)
        // Field 4: format (varint enum)
        writeVarintField(out, 4, frame.format.ordinal.toLong())
        // Field 5: width (varint)
        writeVarintField(out, 5, frame.width.toLong())
        // Field 6: height (varint)
        writeVarintField(out, 6, frame.height.toLong())
        // Field 7: data (length-delimited)
        writeLengthDelimitedField(out, 7, frame.data)
        return out.toByteArray()
    }

    /**
     * Decode a protobuf VideoFrame from wire format.
     */
    fun decodeVideoFrame(data: ByteArray): VideoFrame {
        var frameId: Long = 0
        var timestampMs: Long = 0
        var isKeyframe: Boolean = false
        var format: VideoFormat = VideoFormat.H264
        var width: Int = 0
        var height: Int = 0
        var frameData: ByteArray = byteArrayOf()

        var offset = 0
        while (offset < data.size) {
            val tag = readVarint(data, offset)
            offset += tag.readBytes
            val fieldNumber = (tag.value ushr 3).toInt()
            val wireType = (tag.value and 0x07).toInt()

            when {
                wireType == 0 && fieldNumber == 1 -> {
                    val v = readVarint(data, offset); frameId = v.value; offset += v.readBytes
                }
                wireType == 0 && fieldNumber == 2 -> {
                    val v = readVarint(data, offset); timestampMs = v.value; offset += v.readBytes
                }
                wireType == 0 && fieldNumber == 3 -> {
                    val v = readVarint(data, offset); isKeyframe = v.value != 0L; offset += v.readBytes
                }
                wireType == 0 && fieldNumber == 4 -> {
                    val v = readVarint(data, offset)
                    format = if (v.value.toInt() == 1) VideoFormat.H265 else VideoFormat.H264
                    offset += v.readBytes
                }
                wireType == 0 && fieldNumber == 5 -> {
                    val v = readVarint(data, offset); width = v.value.toInt(); offset += v.readBytes
                }
                wireType == 0 && fieldNumber == 6 -> {
                    val v = readVarint(data, offset); height = v.value.toInt(); offset += v.readBytes
                }
                wireType == 2 && fieldNumber == 7 -> {
                    val len = readVarint(data, offset)
                    offset += len.readBytes
                    frameData = data.copyOfRange(offset, offset + len.value.toInt())
                    offset += len.value.toInt()
                }
                wireType == 0 -> {
                    // Unknown varint field — skip it.
                    val v = readVarint(data, offset); offset += v.readBytes
                }
                wireType == 2 -> {
                    // Unknown length-delimited field — skip it.
                    val len = readVarint(data, offset)
                    offset += len.readBytes + len.value.toInt()
                }
                else -> {
                    // Unknown wire type — cannot skip safely; break to avoid infinite loop.
                    break
                }
            }
        }

        return VideoFrame(
            frameId = frameId,
            timestampMs = timestampMs,
            isKeyframe = isKeyframe,
            format = format,
            width = width,
            height = height,
            data = frameData,
        )
    }

    // ---- ControlMessage encoding / decoding ----

    /**
     * Encode a ControlMessage to protobuf wire format.
     *
     *   message ControlMessage {
     *     string command_id = 1;
     *     string request_id = 2;
     *     string action = 3;
     *     bytes payload = 4;
     *     int64 timestamp_ms = 5;
     *   }
     */
    fun encodeControlMessage(msg: ControlMessage): ByteArray {
        val out = ByteArrayOutputStream()
        // Field 1: command_id (length-delimited)
        writeLengthDelimitedField(out, 1, msg.commandId.toByteArray(Charsets.UTF_8))
        // Field 2: request_id (length-delimited)
        writeLengthDelimitedField(out, 2, msg.requestId.toByteArray(Charsets.UTF_8))
        // Field 3: action (length-delimited)
        writeLengthDelimitedField(out, 3, msg.action.toByteArray(Charsets.UTF_8))
        // Field 4: payload (length-delimited)
        writeLengthDelimitedField(out, 4, msg.payload)
        // Field 5: timestamp_ms (varint)
        writeVarintField(out, 5, msg.timestampMs)
        return out.toByteArray()
    }

    /**
     * Decode a protobuf ControlMessage from wire format.
     */
    fun decodeControlMessage(data: ByteArray): ControlMessage {
        var commandId: String = ""
        var requestId: String = ""
        var action: String = ""
        var payload: ByteArray = byteArrayOf()
        var timestampMs: Long = 0

        var offset = 0
        while (offset < data.size) {
            val tag = readVarint(data, offset)
            offset += tag.readBytes
            val fieldNumber = (tag.value ushr 3).toInt()
            val wireType = (tag.value and 0x07).toInt()

            when {
                wireType == 2 && fieldNumber == 1 -> {
                    val len = readVarint(data, offset); offset += len.readBytes
                    commandId = String(data, offset, len.value.toInt(), Charsets.UTF_8)
                    offset += len.value.toInt()
                }
                wireType == 2 && fieldNumber == 2 -> {
                    val len = readVarint(data, offset); offset += len.readBytes
                    requestId = String(data, offset, len.value.toInt(), Charsets.UTF_8)
                    offset += len.value.toInt()
                }
                wireType == 2 && fieldNumber == 3 -> {
                    val len = readVarint(data, offset); offset += len.readBytes
                    action = String(data, offset, len.value.toInt(), Charsets.UTF_8)
                    offset += len.value.toInt()
                }
                wireType == 2 && fieldNumber == 4 -> {
                    val len = readVarint(data, offset); offset += len.readBytes
                    payload = data.copyOfRange(offset, offset + len.value.toInt())
                    offset += len.value.toInt()
                }
                wireType == 0 && fieldNumber == 5 -> {
                    val v = readVarint(data, offset); timestampMs = v.value; offset += v.readBytes
                }
                wireType == 0 -> {
                    val v = readVarint(data, offset); offset += v.readBytes
                }
                wireType == 2 -> {
                    val len = readVarint(data, offset); offset += len.readBytes + len.value.toInt()
                }
                else -> break
            }
        }

        return ControlMessage(
            commandId = commandId,
            requestId = requestId,
            action = action,
            payload = payload,
            timestampMs = timestampMs,
        )
    }

    // ---- Wire-format helpers ----

    /** Writes a varint field: tag byte(s) + value varint. */
    private fun writeVarintField(out: ByteArrayOutputStream, fieldNumber: Int, value: Long) {
        out.write(encodeVarint((fieldNumber.toLong() shl 3) or 0))
        out.write(encodeVarint(value))
    }

    /** Writes a length-delimited field: tag byte(s) + length varint + data bytes. */
    private fun writeLengthDelimitedField(out: ByteArrayOutputStream, fieldNumber: Int, data: ByteArray) {
        out.write(encodeVarint((fieldNumber.toLong() shl 3) or 2))
        out.write(encodeVarint(data.size.toLong()))
        out.write(data)
    }

    /** Encode a 64-bit unsigned integer in Protocol Buffers varint format. */
    private fun encodeVarint(value: Long): ByteArray {
        val buf = ByteArray(10) // max 10 bytes for 64-bit varint
        var v = value
        var i = 0
        // While there are bits set beyond the lower 7 bits, emit continuation bytes.
        while (v ushr 7 != 0L) {
            buf[i++] = (v.toInt() and 0x7F or 0x80).toByte()
            v = v ushr 7
        }
        // Final byte (no continuation bit).
        buf[i++] = (v.toInt() and 0x7F).toByte()
        return buf.copyOf(i)
    }

    /** Read a varint from [data] starting at [offset]. Returns decoded value + bytes consumed. */
    private fun readVarint(data: ByteArray, offset: Int): VarintResult {
        var value: Long = 0
        var shift = 0
        var bytes = 0
        while (offset + bytes < data.size) {
            val b = data[offset + bytes]
            value = value or ((b.toLong() and 0x7F) shl shift)
            bytes++
            if (b.toInt() and 0x80 == 0) break
            shift += 7
        }
        return VarintResult(value, bytes)
    }

    private data class VarintResult(val value: Long, val readBytes: Int)
}

// ---- Protobuf message types ----

data class VideoFrame(
    val frameId: Long,
    val timestampMs: Long,
    val isKeyframe: Boolean,
    val format: VideoFormat,
    val width: Int,
    val height: Int,
    val data: ByteArray,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as VideoFrame
        return frameId == other.frameId && timestampMs == other.timestampMs &&
            isKeyframe == other.isKeyframe && format == other.format &&
            width == other.width && height == other.height &&
            data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = frameId.hashCode()
        result = 31 * result + timestampMs.hashCode()
        result = 31 * result + isKeyframe.hashCode()
        result = 31 * result + format.hashCode()
        result = 31 * result + width
        result = 31 * result + height
        result = 31 * result + data.contentHashCode()
        return result
    }
}

enum class VideoFormat { H264, H265 }

data class ControlMessage(
    val commandId: String,
    val requestId: String,
    val action: String,
    val payload: ByteArray,
    val timestampMs: Long,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as ControlMessage
        return commandId == other.commandId && requestId == other.requestId &&
            action == other.action && payload.contentEquals(other.payload) &&
            timestampMs == other.timestampMs
    }

    override fun hashCode(): Int {
        var result = commandId.hashCode()
        result = 31 * result + requestId.hashCode()
        result = 31 * result + action.hashCode()
        result = 31 * result + payload.contentHashCode()
        result = 31 * result + timestampMs.hashCode()
        return result
    }
}
