import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace phonefarm. */
export namespace phonefarm {

    /** Namespace video. */
    namespace video {

        /** Properties of a VideoFrame. */
        interface IVideoFrame {

            /** VideoFrame deviceId */
            deviceId?: (string|null);

            /** VideoFrame frameSeq */
            frameSeq?: (number|null);

            /** VideoFrame timestampMs */
            timestampMs?: (number|Long|null);

            /** VideoFrame codec */
            codec?: (string|null);

            /** VideoFrame isKeyframe */
            isKeyframe?: (boolean|null);

            /** VideoFrame nalData */
            nalData?: (Uint8Array|null);

            /** VideoFrame ptsUs */
            ptsUs?: (number|Long|null);

            /** VideoFrame durationUs */
            durationUs?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a VideoFrame. */
        class VideoFrame implements IVideoFrame {

            /**
             * Constructs a new VideoFrame.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.video.IVideoFrame);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** VideoFrame deviceId. */
            public deviceId: string;

            /** VideoFrame frameSeq. */
            public frameSeq: number;

            /** VideoFrame timestampMs. */
            public timestampMs: (number|Long);

            /** VideoFrame codec. */
            public codec: string;

            /** VideoFrame isKeyframe. */
            public isKeyframe: boolean;

            /** VideoFrame nalData. */
            public nalData: Uint8Array;

            /** VideoFrame ptsUs. */
            public ptsUs: (number|Long);

            /** VideoFrame durationUs. */
            public durationUs: number;

            /**
             * Creates a new VideoFrame instance using the specified properties.
             * @param [properties] Properties to set
             * @returns VideoFrame instance
             */
            public static create(properties?: phonefarm.video.IVideoFrame): phonefarm.video.VideoFrame;

            /**
             * Encodes the specified VideoFrame message. Does not implicitly {@link phonefarm.video.VideoFrame.verify|verify} messages.
             * @param message VideoFrame message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.video.IVideoFrame, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified VideoFrame message, length delimited. Does not implicitly {@link phonefarm.video.VideoFrame.verify|verify} messages.
             * @param message VideoFrame message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.video.IVideoFrame, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a VideoFrame message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns VideoFrame
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.video.VideoFrame;

            /**
             * Decodes a VideoFrame message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns VideoFrame
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.video.VideoFrame;

            /**
             * Verifies a VideoFrame message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a VideoFrame message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns VideoFrame
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.video.VideoFrame;

            /**
             * Creates a plain object from a VideoFrame message. Also converts values to other types if specified.
             * @param message VideoFrame
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.video.VideoFrame, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this VideoFrame to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for VideoFrame
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a DeviceMeta. */
        interface IDeviceMeta {

            /** DeviceMeta deviceId */
            deviceId?: (string|null);

            /** DeviceMeta deviceName */
            deviceName?: (string|null);

            /** DeviceMeta width */
            width?: (number|null);

            /** DeviceMeta height */
            height?: (number|null);

            /** DeviceMeta codec */
            codec?: (string|null);

            /** DeviceMeta bitRate */
            bitRate?: (number|null);

            /** DeviceMeta maxFps */
            maxFps?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a DeviceMeta. */
        class DeviceMeta implements IDeviceMeta {

            /**
             * Constructs a new DeviceMeta.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.video.IDeviceMeta);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** DeviceMeta deviceId. */
            public deviceId: string;

            /** DeviceMeta deviceName. */
            public deviceName: string;

            /** DeviceMeta width. */
            public width: number;

            /** DeviceMeta height. */
            public height: number;

            /** DeviceMeta codec. */
            public codec: string;

            /** DeviceMeta bitRate. */
            public bitRate: number;

            /** DeviceMeta maxFps. */
            public maxFps: number;

            /**
             * Creates a new DeviceMeta instance using the specified properties.
             * @param [properties] Properties to set
             * @returns DeviceMeta instance
             */
            public static create(properties?: phonefarm.video.IDeviceMeta): phonefarm.video.DeviceMeta;

            /**
             * Encodes the specified DeviceMeta message. Does not implicitly {@link phonefarm.video.DeviceMeta.verify|verify} messages.
             * @param message DeviceMeta message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.video.IDeviceMeta, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified DeviceMeta message, length delimited. Does not implicitly {@link phonefarm.video.DeviceMeta.verify|verify} messages.
             * @param message DeviceMeta message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.video.IDeviceMeta, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a DeviceMeta message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns DeviceMeta
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.video.DeviceMeta;

            /**
             * Decodes a DeviceMeta message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns DeviceMeta
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.video.DeviceMeta;

            /**
             * Verifies a DeviceMeta message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a DeviceMeta message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns DeviceMeta
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.video.DeviceMeta;

            /**
             * Creates a plain object from a DeviceMeta message. Also converts values to other types if specified.
             * @param message DeviceMeta
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.video.DeviceMeta, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this DeviceMeta to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for DeviceMeta
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }
    }
}
