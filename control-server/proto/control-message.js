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

    phonefarm.control = (function() {

        /**
         * Namespace control.
         * @memberof phonefarm
         * @namespace
         */
        var control = {};

        control.ControlMessage = (function() {

            /**
             * Properties of a ControlMessage.
             * @memberof phonefarm.control
             * @interface IControlMessage
             * @property {phonefarm.control.ITouchEvent|null} [touch] ControlMessage touch
             * @property {phonefarm.control.IKeyEvent|null} [key] ControlMessage key
             * @property {phonefarm.control.IScrollEvent|null} [scroll] ControlMessage scroll
             * @property {phonefarm.control.IClipboardData|null} [clipboard] ControlMessage clipboard
             * @property {phonefarm.control.IKeymapCommand|null} [keymap] ControlMessage keymap
             * @property {string|null} [groupId] ControlMessage groupId
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new ControlMessage.
             * @memberof phonefarm.control
             * @classdesc Represents a ControlMessage.
             * @implements IControlMessage
             * @constructor
             * @param {phonefarm.control.IControlMessage=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function ControlMessage(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ControlMessage touch.
             * @member {phonefarm.control.ITouchEvent|null|undefined} touch
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            ControlMessage.prototype.touch = null;

            /**
             * ControlMessage key.
             * @member {phonefarm.control.IKeyEvent|null|undefined} key
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            ControlMessage.prototype.key = null;

            /**
             * ControlMessage scroll.
             * @member {phonefarm.control.IScrollEvent|null|undefined} scroll
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            ControlMessage.prototype.scroll = null;

            /**
             * ControlMessage clipboard.
             * @member {phonefarm.control.IClipboardData|null|undefined} clipboard
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            ControlMessage.prototype.clipboard = null;

            /**
             * ControlMessage keymap.
             * @member {phonefarm.control.IKeymapCommand|null|undefined} keymap
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            ControlMessage.prototype.keymap = null;

            /**
             * ControlMessage groupId.
             * @member {string} groupId
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            ControlMessage.prototype.groupId = "";

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * ControlMessage action.
             * @member {"touch"|"key"|"scroll"|"clipboard"|"keymap"|undefined} action
             * @memberof phonefarm.control.ControlMessage
             * @instance
             */
            Object.defineProperty(ControlMessage.prototype, "action", {
                get: $util.oneOfGetter($oneOfFields = ["touch", "key", "scroll", "clipboard", "keymap"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new ControlMessage instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {phonefarm.control.IControlMessage=} [properties] Properties to set
             * @returns {phonefarm.control.ControlMessage} ControlMessage instance
             */
            ControlMessage.create = function create(properties) {
                return new ControlMessage(properties);
            };

            /**
             * Encodes the specified ControlMessage message. Does not implicitly {@link phonefarm.control.ControlMessage.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {phonefarm.control.IControlMessage} message ControlMessage message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ControlMessage.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.touch != null && Object.hasOwnProperty.call(message, "touch"))
                    $root.phonefarm.control.TouchEvent.encode(message.touch, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.key != null && Object.hasOwnProperty.call(message, "key"))
                    $root.phonefarm.control.KeyEvent.encode(message.key, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.scroll != null && Object.hasOwnProperty.call(message, "scroll"))
                    $root.phonefarm.control.ScrollEvent.encode(message.scroll, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                if (message.clipboard != null && Object.hasOwnProperty.call(message, "clipboard"))
                    $root.phonefarm.control.ClipboardData.encode(message.clipboard, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                if (message.keymap != null && Object.hasOwnProperty.call(message, "keymap"))
                    $root.phonefarm.control.KeymapCommand.encode(message.keymap, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
                if (message.groupId != null && Object.hasOwnProperty.call(message, "groupId"))
                    writer.uint32(/* id 10, wireType 2 =*/82).string(message.groupId);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified ControlMessage message, length delimited. Does not implicitly {@link phonefarm.control.ControlMessage.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {phonefarm.control.IControlMessage} message ControlMessage message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ControlMessage.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ControlMessage message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.ControlMessage} ControlMessage
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ControlMessage.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.ControlMessage(), value;
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
                            message.touch = $root.phonefarm.control.TouchEvent.decode(reader, reader.uint32(), undefined, _depth + 1, message.touch);
                            message.action = "touch";
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            message.key = $root.phonefarm.control.KeyEvent.decode(reader, reader.uint32(), undefined, _depth + 1, message.key);
                            message.action = "key";
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            message.scroll = $root.phonefarm.control.ScrollEvent.decode(reader, reader.uint32(), undefined, _depth + 1, message.scroll);
                            message.action = "scroll";
                            continue;
                        }
                    case 4: {
                            if (wireType !== 2)
                                break;
                            message.clipboard = $root.phonefarm.control.ClipboardData.decode(reader, reader.uint32(), undefined, _depth + 1, message.clipboard);
                            message.action = "clipboard";
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            message.keymap = $root.phonefarm.control.KeymapCommand.decode(reader, reader.uint32(), undefined, _depth + 1, message.keymap);
                            message.action = "keymap";
                            continue;
                        }
                    case 10: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.groupId = value;
                            else
                                delete message.groupId;
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
             * Decodes a ControlMessage message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.ControlMessage} ControlMessage
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ControlMessage.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ControlMessage message.
             * @function verify
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ControlMessage.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                var properties = {};
                if (message.touch != null && message.hasOwnProperty("touch")) {
                    properties.action = 1;
                    {
                        var error = $root.phonefarm.control.TouchEvent.verify(message.touch, _depth + 1);
                        if (error)
                            return "touch." + error;
                    }
                }
                if (message.key != null && message.hasOwnProperty("key")) {
                    if (properties.action === 1)
                        return "action: multiple values";
                    properties.action = 1;
                    {
                        var error = $root.phonefarm.control.KeyEvent.verify(message.key, _depth + 1);
                        if (error)
                            return "key." + error;
                    }
                }
                if (message.scroll != null && message.hasOwnProperty("scroll")) {
                    if (properties.action === 1)
                        return "action: multiple values";
                    properties.action = 1;
                    {
                        var error = $root.phonefarm.control.ScrollEvent.verify(message.scroll, _depth + 1);
                        if (error)
                            return "scroll." + error;
                    }
                }
                if (message.clipboard != null && message.hasOwnProperty("clipboard")) {
                    if (properties.action === 1)
                        return "action: multiple values";
                    properties.action = 1;
                    {
                        var error = $root.phonefarm.control.ClipboardData.verify(message.clipboard, _depth + 1);
                        if (error)
                            return "clipboard." + error;
                    }
                }
                if (message.keymap != null && message.hasOwnProperty("keymap")) {
                    if (properties.action === 1)
                        return "action: multiple values";
                    properties.action = 1;
                    {
                        var error = $root.phonefarm.control.KeymapCommand.verify(message.keymap, _depth + 1);
                        if (error)
                            return "keymap." + error;
                    }
                }
                if (message.groupId != null && message.hasOwnProperty("groupId"))
                    if (!$util.isString(message.groupId))
                        return "groupId: string expected";
                return null;
            };

            /**
             * Creates a ControlMessage message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.ControlMessage} ControlMessage
             */
            ControlMessage.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.ControlMessage)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.ControlMessage();
                if (object.touch != null) {
                    if (typeof object.touch !== "object")
                        throw TypeError(".phonefarm.control.ControlMessage.touch: object expected");
                    message.touch = $root.phonefarm.control.TouchEvent.fromObject(object.touch, _depth + 1);
                }
                if (object.key != null) {
                    if (typeof object.key !== "object")
                        throw TypeError(".phonefarm.control.ControlMessage.key: object expected");
                    message.key = $root.phonefarm.control.KeyEvent.fromObject(object.key, _depth + 1);
                }
                if (object.scroll != null) {
                    if (typeof object.scroll !== "object")
                        throw TypeError(".phonefarm.control.ControlMessage.scroll: object expected");
                    message.scroll = $root.phonefarm.control.ScrollEvent.fromObject(object.scroll, _depth + 1);
                }
                if (object.clipboard != null) {
                    if (typeof object.clipboard !== "object")
                        throw TypeError(".phonefarm.control.ControlMessage.clipboard: object expected");
                    message.clipboard = $root.phonefarm.control.ClipboardData.fromObject(object.clipboard, _depth + 1);
                }
                if (object.keymap != null) {
                    if (typeof object.keymap !== "object")
                        throw TypeError(".phonefarm.control.ControlMessage.keymap: object expected");
                    message.keymap = $root.phonefarm.control.KeymapCommand.fromObject(object.keymap, _depth + 1);
                }
                if (object.groupId != null)
                    if (typeof object.groupId !== "string" || object.groupId.length)
                        message.groupId = String(object.groupId);
                return message;
            };

            /**
             * Creates a plain object from a ControlMessage message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {phonefarm.control.ControlMessage} message ControlMessage
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ControlMessage.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults)
                    object.groupId = "";
                if (message.touch != null && message.hasOwnProperty("touch")) {
                    object.touch = $root.phonefarm.control.TouchEvent.toObject(message.touch, options);
                    if (options.oneofs)
                        object.action = "touch";
                }
                if (message.key != null && message.hasOwnProperty("key")) {
                    object.key = $root.phonefarm.control.KeyEvent.toObject(message.key, options);
                    if (options.oneofs)
                        object.action = "key";
                }
                if (message.scroll != null && message.hasOwnProperty("scroll")) {
                    object.scroll = $root.phonefarm.control.ScrollEvent.toObject(message.scroll, options);
                    if (options.oneofs)
                        object.action = "scroll";
                }
                if (message.clipboard != null && message.hasOwnProperty("clipboard")) {
                    object.clipboard = $root.phonefarm.control.ClipboardData.toObject(message.clipboard, options);
                    if (options.oneofs)
                        object.action = "clipboard";
                }
                if (message.keymap != null && message.hasOwnProperty("keymap")) {
                    object.keymap = $root.phonefarm.control.KeymapCommand.toObject(message.keymap, options);
                    if (options.oneofs)
                        object.action = "keymap";
                }
                if (message.groupId != null && message.hasOwnProperty("groupId"))
                    object.groupId = message.groupId;
                return object;
            };

            /**
             * Converts this ControlMessage to JSON.
             * @function toJSON
             * @memberof phonefarm.control.ControlMessage
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ControlMessage.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for ControlMessage
             * @function getTypeUrl
             * @memberof phonefarm.control.ControlMessage
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            ControlMessage.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.ControlMessage";
            };

            return ControlMessage;
        })();

        control.TouchEvent = (function() {

            /**
             * Properties of a TouchEvent.
             * @memberof phonefarm.control
             * @interface ITouchEvent
             * @property {phonefarm.control.TouchEvent.Action|null} [action] TouchEvent action
             * @property {number|null} [pointerId] TouchEvent pointerId
             * @property {number|null} [x] TouchEvent x
             * @property {number|null} [y] TouchEvent y
             * @property {number|null} [pressure] TouchEvent pressure
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new TouchEvent.
             * @memberof phonefarm.control
             * @classdesc Represents a TouchEvent.
             * @implements ITouchEvent
             * @constructor
             * @param {phonefarm.control.ITouchEvent=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function TouchEvent(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TouchEvent action.
             * @member {phonefarm.control.TouchEvent.Action} action
             * @memberof phonefarm.control.TouchEvent
             * @instance
             */
            TouchEvent.prototype.action = 0;

            /**
             * TouchEvent pointerId.
             * @member {number} pointerId
             * @memberof phonefarm.control.TouchEvent
             * @instance
             */
            TouchEvent.prototype.pointerId = 0;

            /**
             * TouchEvent x.
             * @member {number} x
             * @memberof phonefarm.control.TouchEvent
             * @instance
             */
            TouchEvent.prototype.x = 0;

            /**
             * TouchEvent y.
             * @member {number} y
             * @memberof phonefarm.control.TouchEvent
             * @instance
             */
            TouchEvent.prototype.y = 0;

            /**
             * TouchEvent pressure.
             * @member {number} pressure
             * @memberof phonefarm.control.TouchEvent
             * @instance
             */
            TouchEvent.prototype.pressure = 0;

            /**
             * Creates a new TouchEvent instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {phonefarm.control.ITouchEvent=} [properties] Properties to set
             * @returns {phonefarm.control.TouchEvent} TouchEvent instance
             */
            TouchEvent.create = function create(properties) {
                return new TouchEvent(properties);
            };

            /**
             * Encodes the specified TouchEvent message. Does not implicitly {@link phonefarm.control.TouchEvent.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {phonefarm.control.ITouchEvent} message TouchEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TouchEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.action != null && Object.hasOwnProperty.call(message, "action"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.action);
                if (message.pointerId != null && Object.hasOwnProperty.call(message, "pointerId"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.pointerId);
                if (message.x != null && Object.hasOwnProperty.call(message, "x"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.x);
                if (message.y != null && Object.hasOwnProperty.call(message, "y"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.y);
                if (message.pressure != null && Object.hasOwnProperty.call(message, "pressure"))
                    writer.uint32(/* id 5, wireType 5 =*/45).float(message.pressure);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified TouchEvent message, length delimited. Does not implicitly {@link phonefarm.control.TouchEvent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {phonefarm.control.ITouchEvent} message TouchEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TouchEvent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TouchEvent message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.TouchEvent} TouchEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TouchEvent.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.TouchEvent(), value;
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
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.action = value;
                            else
                                delete message.action;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.pointerId = value;
                            else
                                delete message.pointerId;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.x = value;
                            else
                                delete message.x;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.y = value;
                            else
                                delete message.y;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.pressure = value;
                            else
                                delete message.pressure;
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
             * Decodes a TouchEvent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.TouchEvent} TouchEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TouchEvent.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TouchEvent message.
             * @function verify
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TouchEvent.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.action != null && message.hasOwnProperty("action"))
                    switch (message.action) {
                    default:
                        return "action: enum value expected";
                    case 0:
                    case 1:
                    case 2:
                        break;
                    }
                if (message.pointerId != null && message.hasOwnProperty("pointerId"))
                    if (!$util.isInteger(message.pointerId))
                        return "pointerId: integer expected";
                if (message.x != null && message.hasOwnProperty("x"))
                    if (typeof message.x !== "number")
                        return "x: number expected";
                if (message.y != null && message.hasOwnProperty("y"))
                    if (typeof message.y !== "number")
                        return "y: number expected";
                if (message.pressure != null && message.hasOwnProperty("pressure"))
                    if (typeof message.pressure !== "number")
                        return "pressure: number expected";
                return null;
            };

            /**
             * Creates a TouchEvent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.TouchEvent} TouchEvent
             */
            TouchEvent.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.TouchEvent)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.TouchEvent();
                if (object.action !== 0 && (typeof object.action !== "string" || $root.phonefarm.control.TouchEvent.Action[object.action] !== 0))
                    switch (object.action) {
                    default:
                        if (typeof object.action === "number") {
                            message.action = object.action;
                            break;
                        }
                        break;
                    case "DOWN":
                    case 0:
                        message.action = 0;
                        break;
                    case "UP":
                    case 1:
                        message.action = 1;
                        break;
                    case "MOVE":
                    case 2:
                        message.action = 2;
                        break;
                    }
                if (object.pointerId != null)
                    if (Number(object.pointerId) !== 0)
                        message.pointerId = object.pointerId >>> 0;
                if (object.x != null)
                    if (Number(object.x) !== 0)
                        message.x = Number(object.x);
                if (object.y != null)
                    if (Number(object.y) !== 0)
                        message.y = Number(object.y);
                if (object.pressure != null)
                    if (Number(object.pressure) !== 0)
                        message.pressure = Number(object.pressure);
                return message;
            };

            /**
             * Creates a plain object from a TouchEvent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {phonefarm.control.TouchEvent} message TouchEvent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TouchEvent.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.action = options.enums === String ? "DOWN" : 0;
                    object.pointerId = 0;
                    object.x = 0;
                    object.y = 0;
                    object.pressure = 0;
                }
                if (message.action != null && message.hasOwnProperty("action"))
                    object.action = options.enums === String ? $root.phonefarm.control.TouchEvent.Action[message.action] === undefined ? message.action : $root.phonefarm.control.TouchEvent.Action[message.action] : message.action;
                if (message.pointerId != null && message.hasOwnProperty("pointerId"))
                    object.pointerId = message.pointerId;
                if (message.x != null && message.hasOwnProperty("x"))
                    object.x = options.json && !isFinite(message.x) ? String(message.x) : message.x;
                if (message.y != null && message.hasOwnProperty("y"))
                    object.y = options.json && !isFinite(message.y) ? String(message.y) : message.y;
                if (message.pressure != null && message.hasOwnProperty("pressure"))
                    object.pressure = options.json && !isFinite(message.pressure) ? String(message.pressure) : message.pressure;
                return object;
            };

            /**
             * Converts this TouchEvent to JSON.
             * @function toJSON
             * @memberof phonefarm.control.TouchEvent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TouchEvent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for TouchEvent
             * @function getTypeUrl
             * @memberof phonefarm.control.TouchEvent
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            TouchEvent.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.TouchEvent";
            };

            /**
             * Action enum.
             * @name phonefarm.control.TouchEvent.Action
             * @enum {number}
             * @property {number} DOWN=0 DOWN value
             * @property {number} UP=1 UP value
             * @property {number} MOVE=2 MOVE value
             */
            TouchEvent.Action = (function() {
                var valuesById = {}, values = Object.create(valuesById);
                values[valuesById[0] = "DOWN"] = 0;
                values[valuesById[1] = "UP"] = 1;
                values[valuesById[2] = "MOVE"] = 2;
                return values;
            })();

            return TouchEvent;
        })();

        control.KeyEvent = (function() {

            /**
             * Properties of a KeyEvent.
             * @memberof phonefarm.control
             * @interface IKeyEvent
             * @property {phonefarm.control.KeyEvent.Action|null} [action] KeyEvent action
             * @property {number|null} [keycode] KeyEvent keycode
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new KeyEvent.
             * @memberof phonefarm.control
             * @classdesc Represents a KeyEvent.
             * @implements IKeyEvent
             * @constructor
             * @param {phonefarm.control.IKeyEvent=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function KeyEvent(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * KeyEvent action.
             * @member {phonefarm.control.KeyEvent.Action} action
             * @memberof phonefarm.control.KeyEvent
             * @instance
             */
            KeyEvent.prototype.action = 0;

            /**
             * KeyEvent keycode.
             * @member {number} keycode
             * @memberof phonefarm.control.KeyEvent
             * @instance
             */
            KeyEvent.prototype.keycode = 0;

            /**
             * Creates a new KeyEvent instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {phonefarm.control.IKeyEvent=} [properties] Properties to set
             * @returns {phonefarm.control.KeyEvent} KeyEvent instance
             */
            KeyEvent.create = function create(properties) {
                return new KeyEvent(properties);
            };

            /**
             * Encodes the specified KeyEvent message. Does not implicitly {@link phonefarm.control.KeyEvent.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {phonefarm.control.IKeyEvent} message KeyEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeyEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.action != null && Object.hasOwnProperty.call(message, "action"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.action);
                if (message.keycode != null && Object.hasOwnProperty.call(message, "keycode"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.keycode);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified KeyEvent message, length delimited. Does not implicitly {@link phonefarm.control.KeyEvent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {phonefarm.control.IKeyEvent} message KeyEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeyEvent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a KeyEvent message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.KeyEvent} KeyEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeyEvent.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.KeyEvent(), value;
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
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.action = value;
                            else
                                delete message.action;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.keycode = value;
                            else
                                delete message.keycode;
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
             * Decodes a KeyEvent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.KeyEvent} KeyEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeyEvent.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a KeyEvent message.
             * @function verify
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            KeyEvent.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.action != null && message.hasOwnProperty("action"))
                    switch (message.action) {
                    default:
                        return "action: enum value expected";
                    case 0:
                    case 1:
                        break;
                    }
                if (message.keycode != null && message.hasOwnProperty("keycode"))
                    if (!$util.isInteger(message.keycode))
                        return "keycode: integer expected";
                return null;
            };

            /**
             * Creates a KeyEvent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.KeyEvent} KeyEvent
             */
            KeyEvent.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.KeyEvent)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.KeyEvent();
                if (object.action !== 0 && (typeof object.action !== "string" || $root.phonefarm.control.KeyEvent.Action[object.action] !== 0))
                    switch (object.action) {
                    default:
                        if (typeof object.action === "number") {
                            message.action = object.action;
                            break;
                        }
                        break;
                    case "DOWN":
                    case 0:
                        message.action = 0;
                        break;
                    case "UP":
                    case 1:
                        message.action = 1;
                        break;
                    }
                if (object.keycode != null)
                    if (Number(object.keycode) !== 0)
                        message.keycode = object.keycode >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a KeyEvent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {phonefarm.control.KeyEvent} message KeyEvent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KeyEvent.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.action = options.enums === String ? "DOWN" : 0;
                    object.keycode = 0;
                }
                if (message.action != null && message.hasOwnProperty("action"))
                    object.action = options.enums === String ? $root.phonefarm.control.KeyEvent.Action[message.action] === undefined ? message.action : $root.phonefarm.control.KeyEvent.Action[message.action] : message.action;
                if (message.keycode != null && message.hasOwnProperty("keycode"))
                    object.keycode = message.keycode;
                return object;
            };

            /**
             * Converts this KeyEvent to JSON.
             * @function toJSON
             * @memberof phonefarm.control.KeyEvent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KeyEvent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for KeyEvent
             * @function getTypeUrl
             * @memberof phonefarm.control.KeyEvent
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            KeyEvent.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.KeyEvent";
            };

            /**
             * Action enum.
             * @name phonefarm.control.KeyEvent.Action
             * @enum {number}
             * @property {number} DOWN=0 DOWN value
             * @property {number} UP=1 UP value
             */
            KeyEvent.Action = (function() {
                var valuesById = {}, values = Object.create(valuesById);
                values[valuesById[0] = "DOWN"] = 0;
                values[valuesById[1] = "UP"] = 1;
                return values;
            })();

            return KeyEvent;
        })();

        control.ScrollEvent = (function() {

            /**
             * Properties of a ScrollEvent.
             * @memberof phonefarm.control
             * @interface IScrollEvent
             * @property {number|null} [x] ScrollEvent x
             * @property {number|null} [y] ScrollEvent y
             * @property {number|null} [hscroll] ScrollEvent hscroll
             * @property {number|null} [vscroll] ScrollEvent vscroll
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new ScrollEvent.
             * @memberof phonefarm.control
             * @classdesc Represents a ScrollEvent.
             * @implements IScrollEvent
             * @constructor
             * @param {phonefarm.control.IScrollEvent=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function ScrollEvent(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ScrollEvent x.
             * @member {number} x
             * @memberof phonefarm.control.ScrollEvent
             * @instance
             */
            ScrollEvent.prototype.x = 0;

            /**
             * ScrollEvent y.
             * @member {number} y
             * @memberof phonefarm.control.ScrollEvent
             * @instance
             */
            ScrollEvent.prototype.y = 0;

            /**
             * ScrollEvent hscroll.
             * @member {number} hscroll
             * @memberof phonefarm.control.ScrollEvent
             * @instance
             */
            ScrollEvent.prototype.hscroll = 0;

            /**
             * ScrollEvent vscroll.
             * @member {number} vscroll
             * @memberof phonefarm.control.ScrollEvent
             * @instance
             */
            ScrollEvent.prototype.vscroll = 0;

            /**
             * Creates a new ScrollEvent instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {phonefarm.control.IScrollEvent=} [properties] Properties to set
             * @returns {phonefarm.control.ScrollEvent} ScrollEvent instance
             */
            ScrollEvent.create = function create(properties) {
                return new ScrollEvent(properties);
            };

            /**
             * Encodes the specified ScrollEvent message. Does not implicitly {@link phonefarm.control.ScrollEvent.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {phonefarm.control.IScrollEvent} message ScrollEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ScrollEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.x != null && Object.hasOwnProperty.call(message, "x"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.x);
                if (message.y != null && Object.hasOwnProperty.call(message, "y"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.y);
                if (message.hscroll != null && Object.hasOwnProperty.call(message, "hscroll"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.hscroll);
                if (message.vscroll != null && Object.hasOwnProperty.call(message, "vscroll"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.vscroll);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified ScrollEvent message, length delimited. Does not implicitly {@link phonefarm.control.ScrollEvent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {phonefarm.control.IScrollEvent} message ScrollEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ScrollEvent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ScrollEvent message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.ScrollEvent} ScrollEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ScrollEvent.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.ScrollEvent(), value;
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
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.x = value;
                            else
                                delete message.x;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.y = value;
                            else
                                delete message.y;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.hscroll = value;
                            else
                                delete message.hscroll;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.vscroll = value;
                            else
                                delete message.vscroll;
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
             * Decodes a ScrollEvent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.ScrollEvent} ScrollEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ScrollEvent.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ScrollEvent message.
             * @function verify
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ScrollEvent.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.x != null && message.hasOwnProperty("x"))
                    if (typeof message.x !== "number")
                        return "x: number expected";
                if (message.y != null && message.hasOwnProperty("y"))
                    if (typeof message.y !== "number")
                        return "y: number expected";
                if (message.hscroll != null && message.hasOwnProperty("hscroll"))
                    if (!$util.isInteger(message.hscroll))
                        return "hscroll: integer expected";
                if (message.vscroll != null && message.hasOwnProperty("vscroll"))
                    if (!$util.isInteger(message.vscroll))
                        return "vscroll: integer expected";
                return null;
            };

            /**
             * Creates a ScrollEvent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.ScrollEvent} ScrollEvent
             */
            ScrollEvent.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.ScrollEvent)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.ScrollEvent();
                if (object.x != null)
                    if (Number(object.x) !== 0)
                        message.x = Number(object.x);
                if (object.y != null)
                    if (Number(object.y) !== 0)
                        message.y = Number(object.y);
                if (object.hscroll != null)
                    if (Number(object.hscroll) !== 0)
                        message.hscroll = object.hscroll | 0;
                if (object.vscroll != null)
                    if (Number(object.vscroll) !== 0)
                        message.vscroll = object.vscroll | 0;
                return message;
            };

            /**
             * Creates a plain object from a ScrollEvent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {phonefarm.control.ScrollEvent} message ScrollEvent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ScrollEvent.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.x = 0;
                    object.y = 0;
                    object.hscroll = 0;
                    object.vscroll = 0;
                }
                if (message.x != null && message.hasOwnProperty("x"))
                    object.x = options.json && !isFinite(message.x) ? String(message.x) : message.x;
                if (message.y != null && message.hasOwnProperty("y"))
                    object.y = options.json && !isFinite(message.y) ? String(message.y) : message.y;
                if (message.hscroll != null && message.hasOwnProperty("hscroll"))
                    object.hscroll = message.hscroll;
                if (message.vscroll != null && message.hasOwnProperty("vscroll"))
                    object.vscroll = message.vscroll;
                return object;
            };

            /**
             * Converts this ScrollEvent to JSON.
             * @function toJSON
             * @memberof phonefarm.control.ScrollEvent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ScrollEvent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for ScrollEvent
             * @function getTypeUrl
             * @memberof phonefarm.control.ScrollEvent
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            ScrollEvent.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.ScrollEvent";
            };

            return ScrollEvent;
        })();

        control.ClipboardData = (function() {

            /**
             * Properties of a ClipboardData.
             * @memberof phonefarm.control
             * @interface IClipboardData
             * @property {string|null} [text] ClipboardData text
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new ClipboardData.
             * @memberof phonefarm.control
             * @classdesc Represents a ClipboardData.
             * @implements IClipboardData
             * @constructor
             * @param {phonefarm.control.IClipboardData=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function ClipboardData(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ClipboardData text.
             * @member {string} text
             * @memberof phonefarm.control.ClipboardData
             * @instance
             */
            ClipboardData.prototype.text = "";

            /**
             * Creates a new ClipboardData instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {phonefarm.control.IClipboardData=} [properties] Properties to set
             * @returns {phonefarm.control.ClipboardData} ClipboardData instance
             */
            ClipboardData.create = function create(properties) {
                return new ClipboardData(properties);
            };

            /**
             * Encodes the specified ClipboardData message. Does not implicitly {@link phonefarm.control.ClipboardData.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {phonefarm.control.IClipboardData} message ClipboardData message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ClipboardData.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.text != null && Object.hasOwnProperty.call(message, "text"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.text);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified ClipboardData message, length delimited. Does not implicitly {@link phonefarm.control.ClipboardData.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {phonefarm.control.IClipboardData} message ClipboardData message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ClipboardData.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ClipboardData message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.ClipboardData} ClipboardData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ClipboardData.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.ClipboardData(), value;
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
                                message.text = value;
                            else
                                delete message.text;
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
             * Decodes a ClipboardData message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.ClipboardData} ClipboardData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ClipboardData.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ClipboardData message.
             * @function verify
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ClipboardData.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.text != null && message.hasOwnProperty("text"))
                    if (!$util.isString(message.text))
                        return "text: string expected";
                return null;
            };

            /**
             * Creates a ClipboardData message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.ClipboardData} ClipboardData
             */
            ClipboardData.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.ClipboardData)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.ClipboardData();
                if (object.text != null)
                    if (typeof object.text !== "string" || object.text.length)
                        message.text = String(object.text);
                return message;
            };

            /**
             * Creates a plain object from a ClipboardData message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {phonefarm.control.ClipboardData} message ClipboardData
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ClipboardData.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults)
                    object.text = "";
                if (message.text != null && message.hasOwnProperty("text"))
                    object.text = message.text;
                return object;
            };

            /**
             * Converts this ClipboardData to JSON.
             * @function toJSON
             * @memberof phonefarm.control.ClipboardData
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ClipboardData.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for ClipboardData
             * @function getTypeUrl
             * @memberof phonefarm.control.ClipboardData
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            ClipboardData.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.ClipboardData";
            };

            return ClipboardData;
        })();

        control.KeymapCommand = (function() {

            /**
             * Properties of a KeymapCommand.
             * @memberof phonefarm.control
             * @interface IKeymapCommand
             * @property {phonefarm.control.IKeymapTouch|null} [tap] KeymapCommand tap
             * @property {phonefarm.control.IKeymapSwipe|null} [swipe] KeymapCommand swipe
             * @property {phonefarm.control.IKeymapTouch|null} [longPress] KeymapCommand longPress
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new KeymapCommand.
             * @memberof phonefarm.control
             * @classdesc Represents a KeymapCommand.
             * @implements IKeymapCommand
             * @constructor
             * @param {phonefarm.control.IKeymapCommand=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function KeymapCommand(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * KeymapCommand tap.
             * @member {phonefarm.control.IKeymapTouch|null|undefined} tap
             * @memberof phonefarm.control.KeymapCommand
             * @instance
             */
            KeymapCommand.prototype.tap = null;

            /**
             * KeymapCommand swipe.
             * @member {phonefarm.control.IKeymapSwipe|null|undefined} swipe
             * @memberof phonefarm.control.KeymapCommand
             * @instance
             */
            KeymapCommand.prototype.swipe = null;

            /**
             * KeymapCommand longPress.
             * @member {phonefarm.control.IKeymapTouch|null|undefined} longPress
             * @memberof phonefarm.control.KeymapCommand
             * @instance
             */
            KeymapCommand.prototype.longPress = null;

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * KeymapCommand cmd.
             * @member {"tap"|"swipe"|"longPress"|undefined} cmd
             * @memberof phonefarm.control.KeymapCommand
             * @instance
             */
            Object.defineProperty(KeymapCommand.prototype, "cmd", {
                get: $util.oneOfGetter($oneOfFields = ["tap", "swipe", "longPress"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new KeymapCommand instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {phonefarm.control.IKeymapCommand=} [properties] Properties to set
             * @returns {phonefarm.control.KeymapCommand} KeymapCommand instance
             */
            KeymapCommand.create = function create(properties) {
                return new KeymapCommand(properties);
            };

            /**
             * Encodes the specified KeymapCommand message. Does not implicitly {@link phonefarm.control.KeymapCommand.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {phonefarm.control.IKeymapCommand} message KeymapCommand message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeymapCommand.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tap != null && Object.hasOwnProperty.call(message, "tap"))
                    $root.phonefarm.control.KeymapTouch.encode(message.tap, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.swipe != null && Object.hasOwnProperty.call(message, "swipe"))
                    $root.phonefarm.control.KeymapSwipe.encode(message.swipe, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.longPress != null && Object.hasOwnProperty.call(message, "longPress"))
                    $root.phonefarm.control.KeymapTouch.encode(message.longPress, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified KeymapCommand message, length delimited. Does not implicitly {@link phonefarm.control.KeymapCommand.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {phonefarm.control.IKeymapCommand} message KeymapCommand message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeymapCommand.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a KeymapCommand message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.KeymapCommand} KeymapCommand
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeymapCommand.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.KeymapCommand();
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
                            message.tap = $root.phonefarm.control.KeymapTouch.decode(reader, reader.uint32(), undefined, _depth + 1, message.tap);
                            message.cmd = "tap";
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            message.swipe = $root.phonefarm.control.KeymapSwipe.decode(reader, reader.uint32(), undefined, _depth + 1, message.swipe);
                            message.cmd = "swipe";
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            message.longPress = $root.phonefarm.control.KeymapTouch.decode(reader, reader.uint32(), undefined, _depth + 1, message.longPress);
                            message.cmd = "longPress";
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
             * Decodes a KeymapCommand message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.KeymapCommand} KeymapCommand
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeymapCommand.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a KeymapCommand message.
             * @function verify
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            KeymapCommand.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                var properties = {};
                if (message.tap != null && message.hasOwnProperty("tap")) {
                    properties.cmd = 1;
                    {
                        var error = $root.phonefarm.control.KeymapTouch.verify(message.tap, _depth + 1);
                        if (error)
                            return "tap." + error;
                    }
                }
                if (message.swipe != null && message.hasOwnProperty("swipe")) {
                    if (properties.cmd === 1)
                        return "cmd: multiple values";
                    properties.cmd = 1;
                    {
                        var error = $root.phonefarm.control.KeymapSwipe.verify(message.swipe, _depth + 1);
                        if (error)
                            return "swipe." + error;
                    }
                }
                if (message.longPress != null && message.hasOwnProperty("longPress")) {
                    if (properties.cmd === 1)
                        return "cmd: multiple values";
                    properties.cmd = 1;
                    {
                        var error = $root.phonefarm.control.KeymapTouch.verify(message.longPress, _depth + 1);
                        if (error)
                            return "longPress." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a KeymapCommand message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.KeymapCommand} KeymapCommand
             */
            KeymapCommand.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.KeymapCommand)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.KeymapCommand();
                if (object.tap != null) {
                    if (typeof object.tap !== "object")
                        throw TypeError(".phonefarm.control.KeymapCommand.tap: object expected");
                    message.tap = $root.phonefarm.control.KeymapTouch.fromObject(object.tap, _depth + 1);
                }
                if (object.swipe != null) {
                    if (typeof object.swipe !== "object")
                        throw TypeError(".phonefarm.control.KeymapCommand.swipe: object expected");
                    message.swipe = $root.phonefarm.control.KeymapSwipe.fromObject(object.swipe, _depth + 1);
                }
                if (object.longPress != null) {
                    if (typeof object.longPress !== "object")
                        throw TypeError(".phonefarm.control.KeymapCommand.longPress: object expected");
                    message.longPress = $root.phonefarm.control.KeymapTouch.fromObject(object.longPress, _depth + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a KeymapCommand message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {phonefarm.control.KeymapCommand} message KeymapCommand
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KeymapCommand.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (message.tap != null && message.hasOwnProperty("tap")) {
                    object.tap = $root.phonefarm.control.KeymapTouch.toObject(message.tap, options);
                    if (options.oneofs)
                        object.cmd = "tap";
                }
                if (message.swipe != null && message.hasOwnProperty("swipe")) {
                    object.swipe = $root.phonefarm.control.KeymapSwipe.toObject(message.swipe, options);
                    if (options.oneofs)
                        object.cmd = "swipe";
                }
                if (message.longPress != null && message.hasOwnProperty("longPress")) {
                    object.longPress = $root.phonefarm.control.KeymapTouch.toObject(message.longPress, options);
                    if (options.oneofs)
                        object.cmd = "longPress";
                }
                return object;
            };

            /**
             * Converts this KeymapCommand to JSON.
             * @function toJSON
             * @memberof phonefarm.control.KeymapCommand
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KeymapCommand.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for KeymapCommand
             * @function getTypeUrl
             * @memberof phonefarm.control.KeymapCommand
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            KeymapCommand.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.KeymapCommand";
            };

            return KeymapCommand;
        })();

        control.KeymapTouch = (function() {

            /**
             * Properties of a KeymapTouch.
             * @memberof phonefarm.control
             * @interface IKeymapTouch
             * @property {number|null} [x] KeymapTouch x
             * @property {number|null} [y] KeymapTouch y
             * @property {number|null} [durationMs] KeymapTouch durationMs
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new KeymapTouch.
             * @memberof phonefarm.control
             * @classdesc Represents a KeymapTouch.
             * @implements IKeymapTouch
             * @constructor
             * @param {phonefarm.control.IKeymapTouch=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function KeymapTouch(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * KeymapTouch x.
             * @member {number} x
             * @memberof phonefarm.control.KeymapTouch
             * @instance
             */
            KeymapTouch.prototype.x = 0;

            /**
             * KeymapTouch y.
             * @member {number} y
             * @memberof phonefarm.control.KeymapTouch
             * @instance
             */
            KeymapTouch.prototype.y = 0;

            /**
             * KeymapTouch durationMs.
             * @member {number} durationMs
             * @memberof phonefarm.control.KeymapTouch
             * @instance
             */
            KeymapTouch.prototype.durationMs = 0;

            /**
             * Creates a new KeymapTouch instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {phonefarm.control.IKeymapTouch=} [properties] Properties to set
             * @returns {phonefarm.control.KeymapTouch} KeymapTouch instance
             */
            KeymapTouch.create = function create(properties) {
                return new KeymapTouch(properties);
            };

            /**
             * Encodes the specified KeymapTouch message. Does not implicitly {@link phonefarm.control.KeymapTouch.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {phonefarm.control.IKeymapTouch} message KeymapTouch message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeymapTouch.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.x != null && Object.hasOwnProperty.call(message, "x"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.x);
                if (message.y != null && Object.hasOwnProperty.call(message, "y"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.y);
                if (message.durationMs != null && Object.hasOwnProperty.call(message, "durationMs"))
                    writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.durationMs);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified KeymapTouch message, length delimited. Does not implicitly {@link phonefarm.control.KeymapTouch.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {phonefarm.control.IKeymapTouch} message KeymapTouch message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeymapTouch.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a KeymapTouch message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.KeymapTouch} KeymapTouch
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeymapTouch.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.KeymapTouch(), value;
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
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.x = value;
                            else
                                delete message.x;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.y = value;
                            else
                                delete message.y;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.durationMs = value;
                            else
                                delete message.durationMs;
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
             * Decodes a KeymapTouch message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.KeymapTouch} KeymapTouch
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeymapTouch.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a KeymapTouch message.
             * @function verify
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            KeymapTouch.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.x != null && message.hasOwnProperty("x"))
                    if (typeof message.x !== "number")
                        return "x: number expected";
                if (message.y != null && message.hasOwnProperty("y"))
                    if (typeof message.y !== "number")
                        return "y: number expected";
                if (message.durationMs != null && message.hasOwnProperty("durationMs"))
                    if (!$util.isInteger(message.durationMs))
                        return "durationMs: integer expected";
                return null;
            };

            /**
             * Creates a KeymapTouch message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.KeymapTouch} KeymapTouch
             */
            KeymapTouch.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.KeymapTouch)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.KeymapTouch();
                if (object.x != null)
                    if (Number(object.x) !== 0)
                        message.x = Number(object.x);
                if (object.y != null)
                    if (Number(object.y) !== 0)
                        message.y = Number(object.y);
                if (object.durationMs != null)
                    if (Number(object.durationMs) !== 0)
                        message.durationMs = object.durationMs >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a KeymapTouch message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {phonefarm.control.KeymapTouch} message KeymapTouch
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KeymapTouch.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.x = 0;
                    object.y = 0;
                    object.durationMs = 0;
                }
                if (message.x != null && message.hasOwnProperty("x"))
                    object.x = options.json && !isFinite(message.x) ? String(message.x) : message.x;
                if (message.y != null && message.hasOwnProperty("y"))
                    object.y = options.json && !isFinite(message.y) ? String(message.y) : message.y;
                if (message.durationMs != null && message.hasOwnProperty("durationMs"))
                    object.durationMs = message.durationMs;
                return object;
            };

            /**
             * Converts this KeymapTouch to JSON.
             * @function toJSON
             * @memberof phonefarm.control.KeymapTouch
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KeymapTouch.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for KeymapTouch
             * @function getTypeUrl
             * @memberof phonefarm.control.KeymapTouch
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            KeymapTouch.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.KeymapTouch";
            };

            return KeymapTouch;
        })();

        control.KeymapSwipe = (function() {

            /**
             * Properties of a KeymapSwipe.
             * @memberof phonefarm.control
             * @interface IKeymapSwipe
             * @property {number|null} [fromX] KeymapSwipe fromX
             * @property {number|null} [fromY] KeymapSwipe fromY
             * @property {number|null} [toX] KeymapSwipe toX
             * @property {number|null} [toY] KeymapSwipe toY
             * @property {number|null} [durationMs] KeymapSwipe durationMs
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new KeymapSwipe.
             * @memberof phonefarm.control
             * @classdesc Represents a KeymapSwipe.
             * @implements IKeymapSwipe
             * @constructor
             * @param {phonefarm.control.IKeymapSwipe=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function KeymapSwipe(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * KeymapSwipe fromX.
             * @member {number} fromX
             * @memberof phonefarm.control.KeymapSwipe
             * @instance
             */
            KeymapSwipe.prototype.fromX = 0;

            /**
             * KeymapSwipe fromY.
             * @member {number} fromY
             * @memberof phonefarm.control.KeymapSwipe
             * @instance
             */
            KeymapSwipe.prototype.fromY = 0;

            /**
             * KeymapSwipe toX.
             * @member {number} toX
             * @memberof phonefarm.control.KeymapSwipe
             * @instance
             */
            KeymapSwipe.prototype.toX = 0;

            /**
             * KeymapSwipe toY.
             * @member {number} toY
             * @memberof phonefarm.control.KeymapSwipe
             * @instance
             */
            KeymapSwipe.prototype.toY = 0;

            /**
             * KeymapSwipe durationMs.
             * @member {number} durationMs
             * @memberof phonefarm.control.KeymapSwipe
             * @instance
             */
            KeymapSwipe.prototype.durationMs = 0;

            /**
             * Creates a new KeymapSwipe instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {phonefarm.control.IKeymapSwipe=} [properties] Properties to set
             * @returns {phonefarm.control.KeymapSwipe} KeymapSwipe instance
             */
            KeymapSwipe.create = function create(properties) {
                return new KeymapSwipe(properties);
            };

            /**
             * Encodes the specified KeymapSwipe message. Does not implicitly {@link phonefarm.control.KeymapSwipe.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {phonefarm.control.IKeymapSwipe} message KeymapSwipe message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeymapSwipe.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.fromX != null && Object.hasOwnProperty.call(message, "fromX"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.fromX);
                if (message.fromY != null && Object.hasOwnProperty.call(message, "fromY"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.fromY);
                if (message.toX != null && Object.hasOwnProperty.call(message, "toX"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.toX);
                if (message.toY != null && Object.hasOwnProperty.call(message, "toY"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.toY);
                if (message.durationMs != null && Object.hasOwnProperty.call(message, "durationMs"))
                    writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.durationMs);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified KeymapSwipe message, length delimited. Does not implicitly {@link phonefarm.control.KeymapSwipe.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {phonefarm.control.IKeymapSwipe} message KeymapSwipe message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeymapSwipe.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a KeymapSwipe message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.KeymapSwipe} KeymapSwipe
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeymapSwipe.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.KeymapSwipe(), value;
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
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.fromX = value;
                            else
                                delete message.fromX;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.fromY = value;
                            else
                                delete message.fromY;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.toX = value;
                            else
                                delete message.toX;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.toY = value;
                            else
                                delete message.toY;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.durationMs = value;
                            else
                                delete message.durationMs;
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
             * Decodes a KeymapSwipe message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.KeymapSwipe} KeymapSwipe
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeymapSwipe.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a KeymapSwipe message.
             * @function verify
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            KeymapSwipe.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.fromX != null && message.hasOwnProperty("fromX"))
                    if (typeof message.fromX !== "number")
                        return "fromX: number expected";
                if (message.fromY != null && message.hasOwnProperty("fromY"))
                    if (typeof message.fromY !== "number")
                        return "fromY: number expected";
                if (message.toX != null && message.hasOwnProperty("toX"))
                    if (typeof message.toX !== "number")
                        return "toX: number expected";
                if (message.toY != null && message.hasOwnProperty("toY"))
                    if (typeof message.toY !== "number")
                        return "toY: number expected";
                if (message.durationMs != null && message.hasOwnProperty("durationMs"))
                    if (!$util.isInteger(message.durationMs))
                        return "durationMs: integer expected";
                return null;
            };

            /**
             * Creates a KeymapSwipe message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.KeymapSwipe} KeymapSwipe
             */
            KeymapSwipe.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.KeymapSwipe)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.KeymapSwipe();
                if (object.fromX != null)
                    if (Number(object.fromX) !== 0)
                        message.fromX = Number(object.fromX);
                if (object.fromY != null)
                    if (Number(object.fromY) !== 0)
                        message.fromY = Number(object.fromY);
                if (object.toX != null)
                    if (Number(object.toX) !== 0)
                        message.toX = Number(object.toX);
                if (object.toY != null)
                    if (Number(object.toY) !== 0)
                        message.toY = Number(object.toY);
                if (object.durationMs != null)
                    if (Number(object.durationMs) !== 0)
                        message.durationMs = object.durationMs >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a KeymapSwipe message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {phonefarm.control.KeymapSwipe} message KeymapSwipe
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KeymapSwipe.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.fromX = 0;
                    object.fromY = 0;
                    object.toX = 0;
                    object.toY = 0;
                    object.durationMs = 0;
                }
                if (message.fromX != null && message.hasOwnProperty("fromX"))
                    object.fromX = options.json && !isFinite(message.fromX) ? String(message.fromX) : message.fromX;
                if (message.fromY != null && message.hasOwnProperty("fromY"))
                    object.fromY = options.json && !isFinite(message.fromY) ? String(message.fromY) : message.fromY;
                if (message.toX != null && message.hasOwnProperty("toX"))
                    object.toX = options.json && !isFinite(message.toX) ? String(message.toX) : message.toX;
                if (message.toY != null && message.hasOwnProperty("toY"))
                    object.toY = options.json && !isFinite(message.toY) ? String(message.toY) : message.toY;
                if (message.durationMs != null && message.hasOwnProperty("durationMs"))
                    object.durationMs = message.durationMs;
                return object;
            };

            /**
             * Converts this KeymapSwipe to JSON.
             * @function toJSON
             * @memberof phonefarm.control.KeymapSwipe
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KeymapSwipe.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for KeymapSwipe
             * @function getTypeUrl
             * @memberof phonefarm.control.KeymapSwipe
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            KeymapSwipe.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.KeymapSwipe";
            };

            return KeymapSwipe;
        })();

        control.DeviceStatus = (function() {

            /**
             * Properties of a DeviceStatus.
             * @memberof phonefarm.control
             * @interface IDeviceStatus
             * @property {string|null} [deviceId] DeviceStatus deviceId
             * @property {number|null} [battery] DeviceStatus battery
             * @property {string|null} [currentApp] DeviceStatus currentApp
             * @property {boolean|null} [screenOn] DeviceStatus screenOn
             * @property {number|Long|null} [timestampMs] DeviceStatus timestampMs
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new DeviceStatus.
             * @memberof phonefarm.control
             * @classdesc Represents a DeviceStatus.
             * @implements IDeviceStatus
             * @constructor
             * @param {phonefarm.control.IDeviceStatus=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function DeviceStatus(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * DeviceStatus deviceId.
             * @member {string} deviceId
             * @memberof phonefarm.control.DeviceStatus
             * @instance
             */
            DeviceStatus.prototype.deviceId = "";

            /**
             * DeviceStatus battery.
             * @member {number} battery
             * @memberof phonefarm.control.DeviceStatus
             * @instance
             */
            DeviceStatus.prototype.battery = 0;

            /**
             * DeviceStatus currentApp.
             * @member {string} currentApp
             * @memberof phonefarm.control.DeviceStatus
             * @instance
             */
            DeviceStatus.prototype.currentApp = "";

            /**
             * DeviceStatus screenOn.
             * @member {boolean} screenOn
             * @memberof phonefarm.control.DeviceStatus
             * @instance
             */
            DeviceStatus.prototype.screenOn = false;

            /**
             * DeviceStatus timestampMs.
             * @member {number|Long} timestampMs
             * @memberof phonefarm.control.DeviceStatus
             * @instance
             */
            DeviceStatus.prototype.timestampMs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new DeviceStatus instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {phonefarm.control.IDeviceStatus=} [properties] Properties to set
             * @returns {phonefarm.control.DeviceStatus} DeviceStatus instance
             */
            DeviceStatus.create = function create(properties) {
                return new DeviceStatus(properties);
            };

            /**
             * Encodes the specified DeviceStatus message. Does not implicitly {@link phonefarm.control.DeviceStatus.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {phonefarm.control.IDeviceStatus} message DeviceStatus message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DeviceStatus.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.deviceId != null && Object.hasOwnProperty.call(message, "deviceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.deviceId);
                if (message.battery != null && Object.hasOwnProperty.call(message, "battery"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.battery);
                if (message.currentApp != null && Object.hasOwnProperty.call(message, "currentApp"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.currentApp);
                if (message.screenOn != null && Object.hasOwnProperty.call(message, "screenOn"))
                    writer.uint32(/* id 4, wireType 0 =*/32).bool(message.screenOn);
                if (message.timestampMs != null && Object.hasOwnProperty.call(message, "timestampMs"))
                    writer.uint32(/* id 5, wireType 0 =*/40).int64(message.timestampMs);
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified DeviceStatus message, length delimited. Does not implicitly {@link phonefarm.control.DeviceStatus.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {phonefarm.control.IDeviceStatus} message DeviceStatus message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DeviceStatus.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a DeviceStatus message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.DeviceStatus} DeviceStatus
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DeviceStatus.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.DeviceStatus(), value;
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
                            if (wireType !== 5)
                                break;
                            if ((value = reader.float()) !== 0)
                                message.battery = value;
                            else
                                delete message.battery;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.currentApp = value;
                            else
                                delete message.currentApp;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.bool())
                                message.screenOn = value;
                            else
                                delete message.screenOn;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 0)
                                break;
                            if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                message.timestampMs = value;
                            else
                                delete message.timestampMs;
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
             * Decodes a DeviceStatus message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.DeviceStatus} DeviceStatus
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DeviceStatus.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a DeviceStatus message.
             * @function verify
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            DeviceStatus.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                    if (!$util.isString(message.deviceId))
                        return "deviceId: string expected";
                if (message.battery != null && message.hasOwnProperty("battery"))
                    if (typeof message.battery !== "number")
                        return "battery: number expected";
                if (message.currentApp != null && message.hasOwnProperty("currentApp"))
                    if (!$util.isString(message.currentApp))
                        return "currentApp: string expected";
                if (message.screenOn != null && message.hasOwnProperty("screenOn"))
                    if (typeof message.screenOn !== "boolean")
                        return "screenOn: boolean expected";
                if (message.timestampMs != null && message.hasOwnProperty("timestampMs"))
                    if (!$util.isInteger(message.timestampMs) && !(message.timestampMs && $util.isInteger(message.timestampMs.low) && $util.isInteger(message.timestampMs.high)))
                        return "timestampMs: integer|Long expected";
                return null;
            };

            /**
             * Creates a DeviceStatus message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.DeviceStatus} DeviceStatus
             */
            DeviceStatus.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.DeviceStatus)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.DeviceStatus();
                if (object.deviceId != null)
                    if (typeof object.deviceId !== "string" || object.deviceId.length)
                        message.deviceId = String(object.deviceId);
                if (object.battery != null)
                    if (Number(object.battery) !== 0)
                        message.battery = Number(object.battery);
                if (object.currentApp != null)
                    if (typeof object.currentApp !== "string" || object.currentApp.length)
                        message.currentApp = String(object.currentApp);
                if (object.screenOn != null)
                    if (object.screenOn)
                        message.screenOn = Boolean(object.screenOn);
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
                return message;
            };

            /**
             * Creates a plain object from a DeviceStatus message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {phonefarm.control.DeviceStatus} message DeviceStatus
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            DeviceStatus.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.deviceId = "";
                    object.battery = 0;
                    object.currentApp = "";
                    object.screenOn = false;
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, false);
                        object.timestampMs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.timestampMs = options.longs === String ? "0" : 0;
                }
                if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                    object.deviceId = message.deviceId;
                if (message.battery != null && message.hasOwnProperty("battery"))
                    object.battery = options.json && !isFinite(message.battery) ? String(message.battery) : message.battery;
                if (message.currentApp != null && message.hasOwnProperty("currentApp"))
                    object.currentApp = message.currentApp;
                if (message.screenOn != null && message.hasOwnProperty("screenOn"))
                    object.screenOn = message.screenOn;
                if (message.timestampMs != null && message.hasOwnProperty("timestampMs"))
                    if (typeof message.timestampMs === "number")
                        object.timestampMs = options.longs === String ? String(message.timestampMs) : message.timestampMs;
                    else
                        object.timestampMs = options.longs === String ? $util.Long.prototype.toString.call(message.timestampMs) : options.longs === Number ? new $util.LongBits(message.timestampMs.low >>> 0, message.timestampMs.high >>> 0).toNumber() : message.timestampMs;
                return object;
            };

            /**
             * Converts this DeviceStatus to JSON.
             * @function toJSON
             * @memberof phonefarm.control.DeviceStatus
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            DeviceStatus.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for DeviceStatus
             * @function getTypeUrl
             * @memberof phonefarm.control.DeviceStatus
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            DeviceStatus.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.DeviceStatus";
            };

            return DeviceStatus;
        })();

        control.GroupBroadcast = (function() {

            /**
             * Properties of a GroupBroadcast.
             * @memberof phonefarm.control
             * @interface IGroupBroadcast
             * @property {string|null} [groupId] GroupBroadcast groupId
             * @property {string|null} [sourceDeviceId] GroupBroadcast sourceDeviceId
             * @property {phonefarm.control.IControlMessage|null} [control] GroupBroadcast control
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */

            /**
             * Constructs a new GroupBroadcast.
             * @memberof phonefarm.control
             * @classdesc Represents a GroupBroadcast.
             * @implements IGroupBroadcast
             * @constructor
             * @param {phonefarm.control.IGroupBroadcast=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding
             */
            function GroupBroadcast(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * GroupBroadcast groupId.
             * @member {string} groupId
             * @memberof phonefarm.control.GroupBroadcast
             * @instance
             */
            GroupBroadcast.prototype.groupId = "";

            /**
             * GroupBroadcast sourceDeviceId.
             * @member {string} sourceDeviceId
             * @memberof phonefarm.control.GroupBroadcast
             * @instance
             */
            GroupBroadcast.prototype.sourceDeviceId = "";

            /**
             * GroupBroadcast control.
             * @member {phonefarm.control.IControlMessage|null|undefined} control
             * @memberof phonefarm.control.GroupBroadcast
             * @instance
             */
            GroupBroadcast.prototype.control = null;

            /**
             * Creates a new GroupBroadcast instance using the specified properties.
             * @function create
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {phonefarm.control.IGroupBroadcast=} [properties] Properties to set
             * @returns {phonefarm.control.GroupBroadcast} GroupBroadcast instance
             */
            GroupBroadcast.create = function create(properties) {
                return new GroupBroadcast(properties);
            };

            /**
             * Encodes the specified GroupBroadcast message. Does not implicitly {@link phonefarm.control.GroupBroadcast.verify|verify} messages.
             * @function encode
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {phonefarm.control.IGroupBroadcast} message GroupBroadcast message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GroupBroadcast.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.groupId != null && Object.hasOwnProperty.call(message, "groupId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.groupId);
                if (message.sourceDeviceId != null && Object.hasOwnProperty.call(message, "sourceDeviceId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.sourceDeviceId);
                if (message.control != null && Object.hasOwnProperty.call(message, "control"))
                    $root.phonefarm.control.ControlMessage.encode(message.control, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                if (message.$unknowns != null && Object.hasOwnProperty.call(message, "$unknowns"))
                    for (var i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Encodes the specified GroupBroadcast message, length delimited. Does not implicitly {@link phonefarm.control.GroupBroadcast.verify|verify} messages.
             * @function encodeDelimited
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {phonefarm.control.IGroupBroadcast} message GroupBroadcast message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GroupBroadcast.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a GroupBroadcast message from the specified reader or buffer.
             * @function decode
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {phonefarm.control.GroupBroadcast} GroupBroadcast
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            GroupBroadcast.decode = function decode(reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw Error("max depth exceeded");
                var end = length === undefined ? reader.len : reader.pos + length, message = _target || new $root.phonefarm.control.GroupBroadcast(), value;
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
                                message.groupId = value;
                            else
                                delete message.groupId;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.string()).length)
                                message.sourceDeviceId = value;
                            else
                                delete message.sourceDeviceId;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            message.control = $root.phonefarm.control.ControlMessage.decode(reader, reader.uint32(), undefined, _depth + 1, message.control);
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
             * Decodes a GroupBroadcast message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {phonefarm.control.GroupBroadcast} GroupBroadcast
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            GroupBroadcast.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a GroupBroadcast message.
             * @function verify
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            GroupBroadcast.verify = function verify(message, _depth) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    return "max depth exceeded";
                if (message.groupId != null && message.hasOwnProperty("groupId"))
                    if (!$util.isString(message.groupId))
                        return "groupId: string expected";
                if (message.sourceDeviceId != null && message.hasOwnProperty("sourceDeviceId"))
                    if (!$util.isString(message.sourceDeviceId))
                        return "sourceDeviceId: string expected";
                if (message.control != null && message.hasOwnProperty("control")) {
                    var error = $root.phonefarm.control.ControlMessage.verify(message.control, _depth + 1);
                    if (error)
                        return "control." + error;
                }
                return null;
            };

            /**
             * Creates a GroupBroadcast message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {phonefarm.control.GroupBroadcast} GroupBroadcast
             */
            GroupBroadcast.fromObject = function fromObject(object, _depth) {
                if (object instanceof $root.phonefarm.control.GroupBroadcast)
                    return object;
                if (_depth === undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw Error("max depth exceeded");
                var message = new $root.phonefarm.control.GroupBroadcast();
                if (object.groupId != null)
                    if (typeof object.groupId !== "string" || object.groupId.length)
                        message.groupId = String(object.groupId);
                if (object.sourceDeviceId != null)
                    if (typeof object.sourceDeviceId !== "string" || object.sourceDeviceId.length)
                        message.sourceDeviceId = String(object.sourceDeviceId);
                if (object.control != null) {
                    if (typeof object.control !== "object")
                        throw TypeError(".phonefarm.control.GroupBroadcast.control: object expected");
                    message.control = $root.phonefarm.control.ControlMessage.fromObject(object.control, _depth + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a GroupBroadcast message. Also converts values to other types if specified.
             * @function toObject
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {phonefarm.control.GroupBroadcast} message GroupBroadcast
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            GroupBroadcast.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.groupId = "";
                    object.sourceDeviceId = "";
                    object.control = null;
                }
                if (message.groupId != null && message.hasOwnProperty("groupId"))
                    object.groupId = message.groupId;
                if (message.sourceDeviceId != null && message.hasOwnProperty("sourceDeviceId"))
                    object.sourceDeviceId = message.sourceDeviceId;
                if (message.control != null && message.hasOwnProperty("control"))
                    object.control = $root.phonefarm.control.ControlMessage.toObject(message.control, options);
                return object;
            };

            /**
             * Converts this GroupBroadcast to JSON.
             * @function toJSON
             * @memberof phonefarm.control.GroupBroadcast
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            GroupBroadcast.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the type url for GroupBroadcast
             * @function getTypeUrl
             * @memberof phonefarm.control.GroupBroadcast
             * @static
             * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns {string} The type url
             */
            GroupBroadcast.getTypeUrl = function getTypeUrl(prefix) {
                if (prefix === undefined)
                    prefix = "type.googleapis.com";
                return prefix + "/phonefarm.control.GroupBroadcast";
            };

            return GroupBroadcast;
        })();

        return control;
    })();

    return phonefarm;
})();

module.exports = $root;
