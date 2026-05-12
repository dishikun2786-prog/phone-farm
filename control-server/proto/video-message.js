/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.phonefarm = (function() {

    /**
     * Namespace phonefarm.
     * @exports phonefarm
     * @namespace
     */
    var phonefarm = {};

    phonefarm.video = (function() {

        /**
         * Namespace video.
         * @memberof phonefarm
         * @namespace
         */
        var video = {};

        video.VideoFrame = (function() {

            /**
             * Properties of a VideoFrame.
             * @memberof phonefarm.video
             * @interface IVideoFrame
             * @property {string|null} [deviceId] VideoFrame deviceId
             * @property {number|null} [frameSeq] VideoFrame frameSeq
             * @property {number|Long|null} [timestampMs] VideoFrame timestampMs
             * @property {string|null} [codec] VideoFrame codec
             * @property {boolean|null} [isKeyframe] VideoFrame isKeyframe
             * @property {Uint8Array|null} [nalData] VideoFrame nalData
             * @property {number|Long|null} [ptsUs] VideoFrame ptsUs
             * @property {number|null} [durationUs] VideoFrame durationUs
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new VideoFrame.
             * @memberof phonefarm.video
             * @classdesc Represents a VideoFrame.
             * @implements IVideoFrame
             * @constructor
             * @param {phonefarm.video.IVideoFrame=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function VideoFrame(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * VideoFrame deviceId.
             * @member {string} deviceId
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.deviceId = "";

            /**
             * VideoFrame frameSeq.
             * @member {number} frameSeq
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.frameSeq = 0;

            /**
             * VideoFrame timestampMs.
             * @member {number|Long} timestampMs
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.timestampMs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * VideoFrame codec.
             * @member {string} codec
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.codec = "";

            /**
             * VideoFrame isKeyframe.
             * @member {boolean} isKeyframe
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.isKeyframe = false;

            /**
             * VideoFrame nalData.
             * @member {Uint8Array} nalData
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.nalData = $util.newBuffer([]);

            /**
             * VideoFrame ptsUs.
             * @member {number|Long} ptsUs
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.ptsUs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * VideoFrame durationUs.
             * @member {number} durationUs
             * @memberof phonefarm.video.VideoFrame
             * @instance
             */
            VideoFrame.prototype.durationUs = 0;

            /**
             * Creates a new VideoFrame instance using the specified properties.
             * @function create
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {phonefarm.video.IVideoFrame=} [properties] Properties to set
             * @returns {phonefarm.video.VideoFrame} VideoFrame instance
             */
            VideoFrame.create = function create(properties) {
                return new VideoFrame(properties);
            };

            /**
             * Encodes the specified VideoFrame message. Does not implicitly {@link phonefarm.video.VideoFrame.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {phonefarm.video.IVideoFrame} message VideoFrame message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            VideoFrame.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.deviceId != null && Object.hasOwnProperty.call(message, "deviceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.deviceId);
                if (message.frameSeq != null && Object.hasOwnProperty.call(message, "frameSeq"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.frameSeq);
                if (message.timestampMs != null && Object.hasOwnProperty.call(message, "timestampMs"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int64(message.timestampMs);
                if (message.codec != null && Object.hasOwnProperty.call(message, "codec"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.codec);
                if (message.isKeyframe != null && Object.hasOwnProperty.call(message, "isKeyframe"))
                    writer.uint32(/* id 5, wireType 0 =*/40).bool(message.isKeyframe);
                if (message.nalData != null && Object.hasOwnProperty.call(message, "nalData"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.nalData);
                if (message.ptsUs != null && Object.hasOwnProperty.call(message, "ptsUs"))
                    writer.uint32(/* id 7, wireType 0 =*/56).int64(message.ptsUs);
                if (message.durationUs != null && Object.hasOwnProperty.call(message, "durationUs"))
                    writer.uint32(/* id 8, wireType 0 =*/64).int32(message.durationUs);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified VideoFrame message, length delimited. Does not implicitly {@link phonefarm.video.VideoFrame.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {phonefarm.video.IVideoFrame} message VideoFrame message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            VideoFrame.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a VideoFrame message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.video.VideoFrame} VideoFrame
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            VideoFrame.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.video.VideoFrame(), value;
                while (reader.pos < end) {
                    var start = reader.pos;
                    var tag = reader.tag();
                    if (tag === _end) {
                        _end = undefined;
                        break;
                    }
                    var wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.deviceId = value;
                            else
                                delete message.deviceId;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.frameSeq = value;
                            else
                                delete message.frameSeq;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                message.timestampMs = value;
                            else
                                delete message.timestampMs;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.codec = value;
                            else
                                delete message.codec;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.bool())
                                message.isKeyframe = value;
                            else
                                delete message.isKeyframe;
                            continue;
                        }
                    case 6: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.nalData = value;
                            else
                                delete message.nalData;
                            continue;
                        }
                    case 7: {
                            if (wireType !== 0)
                                break;
                            if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                message.ptsUs = value;
                            else
                                delete message.ptsUs;
                            continue;
                        }
                    case 8: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.durationUs = value;
                            else
                                delete message.durationUs;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
                if (_end !== undefined)
                    throw Error("missing end group");
                return message;
            };

            /**
             * Decodes a VideoFrame message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.video.VideoFrame} VideoFrame
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            VideoFrame.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a VideoFrame message.
             * @function verify
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            VideoFrame.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                    if (!$util.isString(message.deviceId))
                        return "deviceId: string expected";
                if (message.frameSeq != null && message.hasOwnProperty("frameSeq"))
                    if (!$util.isInteger(message.frameSeq))
                        return "frameSeq: integer expected";
                if (message.timestampMs != null && message.hasOwnProperty("timestampMs"))
                    if (!$util.isInteger(message.timestampMs) && !(message.timestampMs && $util.isInteger(message.timestampMs.low) && $util.isInteger(message.timestampMs.high)))
                        return "timestampMs: integer|Long expected";
                if (message.codec != null && message.hasOwnProperty("codec"))
                    if (!$util.isString(message.codec))
                        return "codec: string expected";
                if (message.isKeyframe != null && message.hasOwnProperty("isKeyframe"))
                    if (typeof message.isKeyframe !== "boolean")
                        return "isKeyframe: boolean expected";
                if (message.nalData != null && message.hasOwnProperty("nalData"))
                    if (!(message.nalData && typeof message.nalData.length === "number" || $util.isString(message.nalData)))
                        return "nalData: buffer expected";
                if (message.ptsUs != null && message.hasOwnProperty("ptsUs"))
                    if (!$util.isInteger(message.ptsUs) && !(message.ptsUs && $util.isInteger(message.ptsUs.low) && $util.isInteger(message.ptsUs.high)))
                        return "ptsUs: integer|Long expected";
                if (message.durationUs != null && message.hasOwnProperty("durationUs"))
                    if (!$util.isInteger(message.durationUs))
                        return "durationUs: integer expected";
                return null;
            };

            /**
             * Creates a VideoFrame message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.video.VideoFrame} VideoFrame
             */
            VideoFrame.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.video.VideoFrame)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.video.VideoFrame();
                if (object.deviceId != null)
                    if (typeof object.deviceId !== "string" || object.deviceId.length)
                        message.deviceId = String(object.deviceId);
                if (object.frameSeq != null)
                    if (Number(object.frameSeq) !== 0)
                        message.frameSeq = object.frameSeq >>> 0;
                if (object.timestampMs != null)
                    if (typeof object.timestampMs === "object" ? object.timestampMs.low || object.timestampMs.high : Number(object.timestampMs) !== 0)
                        if ($util.Long)
                            (message.timestampMs = $util.Long.fromValue(object.timestampMs)).unsigned = false;
                        else if (typeof object.timestampMs === "string")
                            message.timestampMs = parseInt(object.timestampMs, 10);
                        else if (typeof object.timestampMs === "number")
                            message.timestampMs = object.timestampMs;
                        else if (typeof object.timestampMs === "object")
                            message.timestampMs = new $util.LongBits(object.timestampMs.low >>> 0, object.timestampMs.high >>> 0).toNumber();
                if (object.codec != null)
                    if (typeof object.codec !== "string" || object.codec.length)
                        message.codec = String(object.codec);
                if (object.isKeyframe != null)
                    if (object.isKeyframe)
                        message.isKeyframe = Boolean(object.isKeyframe);
                if (object.nalData != null)
                    if (object.nalData.length)
                        if (typeof object.nalData === "string")
                            $util.base64.decode(object.nalData, message.nalData = $util.newBuffer($util.base64.length(object.nalData)), 0);
                        else if (object.nalData.length >= 0)
                            message.nalData = object.nalData;
                if (object.ptsUs != null)
                    if (typeof object.ptsUs === "object" ? object.ptsUs.low || object.ptsUs.high : Number(object.ptsUs) !== 0)
                        if ($util.Long)
                            (message.ptsUs = $util.Long.fromValue(object.ptsUs)).unsigned = false;
                        else if (typeof object.ptsUs === "string")
                            message.ptsUs = parseInt(object.ptsUs, 10);
                        else if (typeof object.ptsUs === "number")
                            message.ptsUs = object.ptsUs;
                        else if (typeof object.ptsUs === "object")
                            message.ptsUs = new $util.LongBits(object.ptsUs.low >>> 0, object.ptsUs.high >>> 0).toNumber();
                if (object.durationUs != null)
                    if (Number(object.durationUs) !== 0)
                        message.durationUs = object.durationUs | 0;
                return message;
            };

            /**
             * Creates a plain object from a VideoFrame message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {phonefarm.video.VideoFrame} message VideoFrame
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            VideoFrame.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.deviceId = "";
                    object.frameSeq = 0;
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, false);
                        object.timestampMs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.timestampMs = options.longs === String ? "0" : 0;
                    object.codec = "";
                    object.isKeyframe = false;
                    if (options.bytes === String)
                        object.nalData = "";
                    else {
                        object.nalData = [];
                        if (options.bytes !== Array)
                            object.nalData = $util.newBuffer(object.nalData);
                    }
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, false);
                        object.ptsUs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.ptsUs = options.longs === String ? "0" : 0;
                    object.durationUs = 0;
                }
                if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                    object.deviceId = message.deviceId;
                if (message.frameSeq != null && message.hasOwnProperty("frameSeq"))
                    object.frameSeq = message.frameSeq;
                if (message.timestampMs != null && message.hasOwnProperty("timestampMs"))
                    if (typeof message.timestampMs === "number")
                        object.timestampMs = options.longs === String ? String(message.timestampMs) : message.timestampMs;
                    else
                        object.timestampMs = options.longs === String ? $util.Long.prototype.toString.call(message.timestampMs) : options.longs === Number ? new $util.LongBits(message.timestampMs.low >>> 0, message.timestampMs.high >>> 0).toNumber() : message.timestampMs;
                if (message.codec != null && message.hasOwnProperty("codec"))
                    object.codec = message.codec;
                if (message.isKeyframe != null && message.hasOwnProperty("isKeyframe"))
                    object.isKeyframe = message.isKeyframe;
                if (message.nalData != null && message.hasOwnProperty("nalData"))
                    object.nalData = options.bytes === String ? $util.base64.encode(message.nalData, 0, message.nalData.length) : options.bytes === Array ? Array.prototype.slice.call(message.nalData) : message.nalData;
                if (message.ptsUs != null && message.hasOwnProperty("ptsUs"))
                    if (typeof message.ptsUs === "number")
                        object.ptsUs = options.longs === String ? String(message.ptsUs) : message.ptsUs;
                    else
                        object.ptsUs = options.longs === String ? $util.Long.prototype.toString.call(message.ptsUs) : options.longs === Number ? new $util.LongBits(message.ptsUs.low >>> 0, message.ptsUs.high >>> 0).toNumber() : message.ptsUs;
                if (message.durationUs != null && message.hasOwnProperty("durationUs"))
                    object.durationUs = message.durationUs;
                return object;
            };

            /**
             * Converts this VideoFrame to JSON.
             * @function toJSON
             * @memberof phonefarm.video.VideoFrame
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            VideoFrame.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for VideoFrame
             * @function getTypeUrl
             * @memberof phonefarm.video.VideoFrame
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            VideoFrame.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.video.VideoFrame";
            };

            return VideoFrame;
        })();

        video.DeviceMeta = (function() {

            /**
             * Properties of a DeviceMeta.
             * @memberof phonefarm.video
             * @interface IDeviceMeta
             * @property {string|null} [deviceId] DeviceMeta deviceId
             * @property {string|null} [deviceName] DeviceMeta deviceName
             * @property {number|null} [width] DeviceMeta width
             * @property {number|null} [height] DeviceMeta height
             * @property {string|null} [codec] DeviceMeta codec
             * @property {number|null} [bitRate] DeviceMeta bitRate
             * @property {number|null} [maxFps] DeviceMeta maxFps
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new DeviceMeta.
             * @memberof phonefarm.video
             * @classdesc Represents a DeviceMeta.
             * @implements IDeviceMeta
             * @constructor
             * @param {phonefarm.video.IDeviceMeta=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function DeviceMeta(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * DeviceMeta deviceId.
             * @member {string} deviceId
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.deviceId = "";

            /**
             * DeviceMeta deviceName.
             * @member {string} deviceName
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.deviceName = "";

            /**
             * DeviceMeta width.
             * @member {number} width
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.width = 0;

            /**
             * DeviceMeta height.
             * @member {number} height
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.height = 0;

            /**
             * DeviceMeta codec.
             * @member {string} codec
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.codec = "";

            /**
             * DeviceMeta bitRate.
             * @member {number} bitRate
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.bitRate = 0;

            /**
             * DeviceMeta maxFps.
             * @member {number} maxFps
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             */
            DeviceMeta.prototype.maxFps = 0;

            /**
             * Creates a new DeviceMeta instance using the specified properties.
             * @function create
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {phonefarm.video.IDeviceMeta=} [properties] Properties to set
             * @returns {phonefarm.video.DeviceMeta} DeviceMeta instance
             */
            DeviceMeta.create = function create(properties) {
                return new DeviceMeta(properties);
            };

            /**
             * Encodes the specified DeviceMeta message. Does not implicitly {@link phonefarm.video.DeviceMeta.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {phonefarm.video.IDeviceMeta} message DeviceMeta message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DeviceMeta.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.deviceId != null && Object.hasOwnProperty.call(message, "deviceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.deviceId);
                if (message.deviceName != null && Object.hasOwnProperty.call(message, "deviceName"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.deviceName);
                if (message.width != null && Object.hasOwnProperty.call(message, "width"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.width);
                if (message.height != null && Object.hasOwnProperty.call(message, "height"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.height);
                if (message.codec != null && Object.hasOwnProperty.call(message, "codec"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.codec);
                if (message.bitRate != null && Object.hasOwnProperty.call(message, "bitRate"))
                    writer.uint32(/* id 6, wireType 0 =*/48).int32(message.bitRate);
                if (message.maxFps != null && Object.hasOwnProperty.call(message, "maxFps"))
                    writer.uint32(/* id 7, wireType 0 =*/56).int32(message.maxFps);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified DeviceMeta message, length delimited. Does not implicitly {@link phonefarm.video.DeviceMeta.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {phonefarm.video.IDeviceMeta} message DeviceMeta message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DeviceMeta.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a DeviceMeta message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.video.DeviceMeta} DeviceMeta
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DeviceMeta.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.video.DeviceMeta(), value;
                while (reader.pos < end) {
                    var start = reader.pos;
                    var tag = reader.tag();
                    if (tag === _end) {
                        _end = undefined;
                        break;
                    }
                    var wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.deviceId = value;
                            else
                                delete message.deviceId;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.deviceName = value;
                            else
                                delete message.deviceName;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.width = value;
                            else
                                delete message.width;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.height = value;
                            else
                                delete message.height;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.codec = value;
                            else
                                delete message.codec;
                            continue;
                        }
                    case 6: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.bitRate = value;
                            else
                                delete message.bitRate;
                            continue;
                        }
                    case 7: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.maxFps = value;
                            else
                                delete message.maxFps;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
                if (_end !== undefined)
                    throw Error("missing end group");
                return message;
            };

            /**
             * Decodes a DeviceMeta message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.video.DeviceMeta} DeviceMeta
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DeviceMeta.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a DeviceMeta message.
             * @function verify
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            DeviceMeta.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                    if (!$util.isString(message.deviceId))
                        return "deviceId: string expected";
                if (message.deviceName != null && message.hasOwnProperty("deviceName"))
                    if (!$util.isString(message.deviceName))
                        return "deviceName: string expected";
                if (message.width != null && message.hasOwnProperty("width"))
                    if (!$util.isInteger(message.width))
                        return "width: integer expected";
                if (message.height != null && message.hasOwnProperty("height"))
                    if (!$util.isInteger(message.height))
                        return "height: integer expected";
                if (message.codec != null && message.hasOwnProperty("codec"))
                    if (!$util.isString(message.codec))
                        return "codec: string expected";
                if (message.bitRate != null && message.hasOwnProperty("bitRate"))
                    if (!$util.isInteger(message.bitRate))
                        return "bitRate: integer expected";
                if (message.maxFps != null && message.hasOwnProperty("maxFps"))
                    if (!$util.isInteger(message.maxFps))
                        return "maxFps: integer expected";
                return null;
            };

            /**
             * Creates a DeviceMeta message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.video.DeviceMeta} DeviceMeta
             */
            DeviceMeta.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.video.DeviceMeta)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.video.DeviceMeta();
                if (object.deviceId != null)
                    if (typeof object.deviceId !== "string" || object.deviceId.length)
                        message.deviceId = String(object.deviceId);
                if (object.deviceName != null)
                    if (typeof object.deviceName !== "string" || object.deviceName.length)
                        message.deviceName = String(object.deviceName);
                if (object.width != null)
                    if (Number(object.width) !== 0)
                        message.width = object.width | 0;
                if (object.height != null)
                    if (Number(object.height) !== 0)
                        message.height = object.height | 0;
                if (object.codec != null)
                    if (typeof object.codec !== "string" || object.codec.length)
                        message.codec = String(object.codec);
                if (object.bitRate != null)
                    if (Number(object.bitRate) !== 0)
                        message.bitRate = object.bitRate | 0;
                if (object.maxFps != null)
                    if (Number(object.maxFps) !== 0)
                        message.maxFps = object.maxFps | 0;
                return message;
            };

            /**
             * Creates a plain object from a DeviceMeta message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {phonefarm.video.DeviceMeta} message DeviceMeta
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            DeviceMeta.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.deviceId = "";
                    object.deviceName = "";
                    object.width = 0;
                    object.height = 0;
                    object.codec = "";
                    object.bitRate = 0;
                    object.maxFps = 0;
                }
                if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                    object.deviceId = message.deviceId;
                if (message.deviceName != null && message.hasOwnProperty("deviceName"))
                    object.deviceName = message.deviceName;
                if (message.width != null && message.hasOwnProperty("width"))
                    object.width = message.width;
                if (message.height != null && message.hasOwnProperty("height"))
                    object.height = message.height;
                if (message.codec != null && message.hasOwnProperty("codec"))
                    object.codec = message.codec;
                if (message.bitRate != null && message.hasOwnProperty("bitRate"))
                    object.bitRate = message.bitRate;
                if (message.maxFps != null && message.hasOwnProperty("maxFps"))
                    object.maxFps = message.maxFps;
                return object;
            };

            /**
             * Converts this DeviceMeta to JSON.
             * @function toJSON
             * @memberof phonefarm.video.DeviceMeta
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            DeviceMeta.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for DeviceMeta
             * @function getTypeUrl
             * @memberof phonefarm.video.DeviceMeta
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            DeviceMeta.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.video.DeviceMeta";
            };

            return DeviceMeta;
        })();

        return video;
    })();

    return phonefarm;
})();

module.exports = $root;
