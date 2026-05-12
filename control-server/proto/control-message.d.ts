import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace phonefarm. */
export namespace phonefarm {

    /** Namespace control. */
    namespace control {

        /** Properties of a ControlMessage. */
        interface IControlMessage {

            /** ControlMessage touch */
            touch?: (phonefarm.control.ITouchEvent|null);

            /** ControlMessage key */
            key?: (phonefarm.control.IKeyEvent|null);

            /** ControlMessage scroll */
            scroll?: (phonefarm.control.IScrollEvent|null);

            /** ControlMessage clipboard */
            clipboard?: (phonefarm.control.IClipboardData|null);

            /** ControlMessage keymap */
            keymap?: (phonefarm.control.IKeymapCommand|null);

            /** ControlMessage groupId */
            groupId?: (string|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a ControlMessage. */
        class ControlMessage implements IControlMessage {

            /**
             * Constructs a new ControlMessage.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IControlMessage);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** ControlMessage touch. */
            public touch?: (phonefarm.control.ITouchEvent|null);

            /** ControlMessage key. */
            public key?: (phonefarm.control.IKeyEvent|null);

            /** ControlMessage scroll. */
            public scroll?: (phonefarm.control.IScrollEvent|null);

            /** ControlMessage clipboard. */
            public clipboard?: (phonefarm.control.IClipboardData|null);

            /** ControlMessage keymap. */
            public keymap?: (phonefarm.control.IKeymapCommand|null);

            /** ControlMessage groupId. */
            public groupId: string;

            /** ControlMessage action. */
            public action?: ("touch"|"key"|"scroll"|"clipboard"|"keymap");

            /**
             * Creates a new ControlMessage instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ControlMessage instance
             */
            public static create(properties?: phonefarm.control.IControlMessage): phonefarm.control.ControlMessage;

            /**
             * Encodes the specified ControlMessage message. Does not implicitly {@link phonefarm.control.ControlMessage.verify|verify} messages.
             * @param message ControlMessage message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IControlMessage, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ControlMessage message, length delimited. Does not implicitly {@link phonefarm.control.ControlMessage.verify|verify} messages.
             * @param message ControlMessage message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IControlMessage, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ControlMessage message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ControlMessage
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.ControlMessage;

            /**
             * Decodes a ControlMessage message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ControlMessage
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.ControlMessage;

            /**
             * Verifies a ControlMessage message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a ControlMessage message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ControlMessage
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.ControlMessage;

            /**
             * Creates a plain object from a ControlMessage message. Also converts values to other types if specified.
             * @param message ControlMessage
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.ControlMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ControlMessage to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for ControlMessage
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a TouchEvent. */
        interface ITouchEvent {

            /** TouchEvent action */
            action?: (phonefarm.control.TouchEvent.Action|null);

            /** TouchEvent pointerId */
            pointerId?: (number|null);

            /** TouchEvent x */
            x?: (number|null);

            /** TouchEvent y */
            y?: (number|null);

            /** TouchEvent pressure */
            pressure?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a TouchEvent. */
        class TouchEvent implements ITouchEvent {

            /**
             * Constructs a new TouchEvent.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.ITouchEvent);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** TouchEvent action. */
            public action: phonefarm.control.TouchEvent.Action;

            /** TouchEvent pointerId. */
            public pointerId: number;

            /** TouchEvent x. */
            public x: number;

            /** TouchEvent y. */
            public y: number;

            /** TouchEvent pressure. */
            public pressure: number;

            /**
             * Creates a new TouchEvent instance using the specified properties.
             * @param [properties] Properties to set
             * @returns TouchEvent instance
             */
            public static create(properties?: phonefarm.control.ITouchEvent): phonefarm.control.TouchEvent;

            /**
             * Encodes the specified TouchEvent message. Does not implicitly {@link phonefarm.control.TouchEvent.verify|verify} messages.
             * @param message TouchEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.ITouchEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified TouchEvent message, length delimited. Does not implicitly {@link phonefarm.control.TouchEvent.verify|verify} messages.
             * @param message TouchEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.ITouchEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a TouchEvent message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns TouchEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.TouchEvent;

            /**
             * Decodes a TouchEvent message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns TouchEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.TouchEvent;

            /**
             * Verifies a TouchEvent message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a TouchEvent message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns TouchEvent
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.TouchEvent;

            /**
             * Creates a plain object from a TouchEvent message. Also converts values to other types if specified.
             * @param message TouchEvent
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.TouchEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this TouchEvent to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for TouchEvent
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        namespace TouchEvent {

            /** Action enum. */
            enum Action {
                DOWN = 0,
                UP = 1,
                MOVE = 2
            }
        }

        /** Properties of a KeyEvent. */
        interface IKeyEvent {

            /** KeyEvent action */
            action?: (phonefarm.control.KeyEvent.Action|null);

            /** KeyEvent keycode */
            keycode?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a KeyEvent. */
        class KeyEvent implements IKeyEvent {

            /**
             * Constructs a new KeyEvent.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IKeyEvent);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** KeyEvent action. */
            public action: phonefarm.control.KeyEvent.Action;

            /** KeyEvent keycode. */
            public keycode: number;

            /**
             * Creates a new KeyEvent instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KeyEvent instance
             */
            public static create(properties?: phonefarm.control.IKeyEvent): phonefarm.control.KeyEvent;

            /**
             * Encodes the specified KeyEvent message. Does not implicitly {@link phonefarm.control.KeyEvent.verify|verify} messages.
             * @param message KeyEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IKeyEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified KeyEvent message, length delimited. Does not implicitly {@link phonefarm.control.KeyEvent.verify|verify} messages.
             * @param message KeyEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IKeyEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KeyEvent message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns KeyEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.KeyEvent;

            /**
             * Decodes a KeyEvent message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns KeyEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.KeyEvent;

            /**
             * Verifies a KeyEvent message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a KeyEvent message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KeyEvent
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.KeyEvent;

            /**
             * Creates a plain object from a KeyEvent message. Also converts values to other types if specified.
             * @param message KeyEvent
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.KeyEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KeyEvent to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for KeyEvent
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        namespace KeyEvent {

            /** Action enum. */
            enum Action {
                DOWN = 0,
                UP = 1
            }
        }

        /** Properties of a ScrollEvent. */
        interface IScrollEvent {

            /** ScrollEvent x */
            x?: (number|null);

            /** ScrollEvent y */
            y?: (number|null);

            /** ScrollEvent hscroll */
            hscroll?: (number|null);

            /** ScrollEvent vscroll */
            vscroll?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a ScrollEvent. */
        class ScrollEvent implements IScrollEvent {

            /**
             * Constructs a new ScrollEvent.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IScrollEvent);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** ScrollEvent x. */
            public x: number;

            /** ScrollEvent y. */
            public y: number;

            /** ScrollEvent hscroll. */
            public hscroll: number;

            /** ScrollEvent vscroll. */
            public vscroll: number;

            /**
             * Creates a new ScrollEvent instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ScrollEvent instance
             */
            public static create(properties?: phonefarm.control.IScrollEvent): phonefarm.control.ScrollEvent;

            /**
             * Encodes the specified ScrollEvent message. Does not implicitly {@link phonefarm.control.ScrollEvent.verify|verify} messages.
             * @param message ScrollEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IScrollEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ScrollEvent message, length delimited. Does not implicitly {@link phonefarm.control.ScrollEvent.verify|verify} messages.
             * @param message ScrollEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IScrollEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ScrollEvent message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ScrollEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.ScrollEvent;

            /**
             * Decodes a ScrollEvent message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ScrollEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.ScrollEvent;

            /**
             * Verifies a ScrollEvent message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a ScrollEvent message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ScrollEvent
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.ScrollEvent;

            /**
             * Creates a plain object from a ScrollEvent message. Also converts values to other types if specified.
             * @param message ScrollEvent
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.ScrollEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ScrollEvent to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for ScrollEvent
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a ClipboardData. */
        interface IClipboardData {

            /** ClipboardData text */
            text?: (string|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a ClipboardData. */
        class ClipboardData implements IClipboardData {

            /**
             * Constructs a new ClipboardData.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IClipboardData);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** ClipboardData text. */
            public text: string;

            /**
             * Creates a new ClipboardData instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ClipboardData instance
             */
            public static create(properties?: phonefarm.control.IClipboardData): phonefarm.control.ClipboardData;

            /**
             * Encodes the specified ClipboardData message. Does not implicitly {@link phonefarm.control.ClipboardData.verify|verify} messages.
             * @param message ClipboardData message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IClipboardData, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ClipboardData message, length delimited. Does not implicitly {@link phonefarm.control.ClipboardData.verify|verify} messages.
             * @param message ClipboardData message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IClipboardData, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ClipboardData message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ClipboardData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.ClipboardData;

            /**
             * Decodes a ClipboardData message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ClipboardData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.ClipboardData;

            /**
             * Verifies a ClipboardData message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a ClipboardData message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ClipboardData
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.ClipboardData;

            /**
             * Creates a plain object from a ClipboardData message. Also converts values to other types if specified.
             * @param message ClipboardData
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.ClipboardData, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ClipboardData to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for ClipboardData
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a KeymapCommand. */
        interface IKeymapCommand {

            /** KeymapCommand tap */
            tap?: (phonefarm.control.IKeymapTouch|null);

            /** KeymapCommand swipe */
            swipe?: (phonefarm.control.IKeymapSwipe|null);

            /** KeymapCommand longPress */
            longPress?: (phonefarm.control.IKeymapTouch|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a KeymapCommand. */
        class KeymapCommand implements IKeymapCommand {

            /**
             * Constructs a new KeymapCommand.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IKeymapCommand);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** KeymapCommand tap. */
            public tap?: (phonefarm.control.IKeymapTouch|null);

            /** KeymapCommand swipe. */
            public swipe?: (phonefarm.control.IKeymapSwipe|null);

            /** KeymapCommand longPress. */
            public longPress?: (phonefarm.control.IKeymapTouch|null);

            /** KeymapCommand cmd. */
            public cmd?: ("tap"|"swipe"|"longPress");

            /**
             * Creates a new KeymapCommand instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KeymapCommand instance
             */
            public static create(properties?: phonefarm.control.IKeymapCommand): phonefarm.control.KeymapCommand;

            /**
             * Encodes the specified KeymapCommand message. Does not implicitly {@link phonefarm.control.KeymapCommand.verify|verify} messages.
             * @param message KeymapCommand message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IKeymapCommand, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified KeymapCommand message, length delimited. Does not implicitly {@link phonefarm.control.KeymapCommand.verify|verify} messages.
             * @param message KeymapCommand message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IKeymapCommand, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KeymapCommand message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns KeymapCommand
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.KeymapCommand;

            /**
             * Decodes a KeymapCommand message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns KeymapCommand
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.KeymapCommand;

            /**
             * Verifies a KeymapCommand message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a KeymapCommand message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KeymapCommand
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.KeymapCommand;

            /**
             * Creates a plain object from a KeymapCommand message. Also converts values to other types if specified.
             * @param message KeymapCommand
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.KeymapCommand, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KeymapCommand to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for KeymapCommand
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a KeymapTouch. */
        interface IKeymapTouch {

            /** KeymapTouch x */
            x?: (number|null);

            /** KeymapTouch y */
            y?: (number|null);

            /** KeymapTouch durationMs */
            durationMs?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a KeymapTouch. */
        class KeymapTouch implements IKeymapTouch {

            /**
             * Constructs a new KeymapTouch.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IKeymapTouch);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** KeymapTouch x. */
            public x: number;

            /** KeymapTouch y. */
            public y: number;

            /** KeymapTouch durationMs. */
            public durationMs: number;

            /**
             * Creates a new KeymapTouch instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KeymapTouch instance
             */
            public static create(properties?: phonefarm.control.IKeymapTouch): phonefarm.control.KeymapTouch;

            /**
             * Encodes the specified KeymapTouch message. Does not implicitly {@link phonefarm.control.KeymapTouch.verify|verify} messages.
             * @param message KeymapTouch message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IKeymapTouch, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified KeymapTouch message, length delimited. Does not implicitly {@link phonefarm.control.KeymapTouch.verify|verify} messages.
             * @param message KeymapTouch message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IKeymapTouch, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KeymapTouch message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns KeymapTouch
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.KeymapTouch;

            /**
             * Decodes a KeymapTouch message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns KeymapTouch
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.KeymapTouch;

            /**
             * Verifies a KeymapTouch message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a KeymapTouch message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KeymapTouch
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.KeymapTouch;

            /**
             * Creates a plain object from a KeymapTouch message. Also converts values to other types if specified.
             * @param message KeymapTouch
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.KeymapTouch, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KeymapTouch to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for KeymapTouch
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a KeymapSwipe. */
        interface IKeymapSwipe {

            /** KeymapSwipe fromX */
            fromX?: (number|null);

            /** KeymapSwipe fromY */
            fromY?: (number|null);

            /** KeymapSwipe toX */
            toX?: (number|null);

            /** KeymapSwipe toY */
            toY?: (number|null);

            /** KeymapSwipe durationMs */
            durationMs?: (number|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a KeymapSwipe. */
        class KeymapSwipe implements IKeymapSwipe {

            /**
             * Constructs a new KeymapSwipe.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IKeymapSwipe);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** KeymapSwipe fromX. */
            public fromX: number;

            /** KeymapSwipe fromY. */
            public fromY: number;

            /** KeymapSwipe toX. */
            public toX: number;

            /** KeymapSwipe toY. */
            public toY: number;

            /** KeymapSwipe durationMs. */
            public durationMs: number;

            /**
             * Creates a new KeymapSwipe instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KeymapSwipe instance
             */
            public static create(properties?: phonefarm.control.IKeymapSwipe): phonefarm.control.KeymapSwipe;

            /**
             * Encodes the specified KeymapSwipe message. Does not implicitly {@link phonefarm.control.KeymapSwipe.verify|verify} messages.
             * @param message KeymapSwipe message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IKeymapSwipe, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified KeymapSwipe message, length delimited. Does not implicitly {@link phonefarm.control.KeymapSwipe.verify|verify} messages.
             * @param message KeymapSwipe message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IKeymapSwipe, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KeymapSwipe message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns KeymapSwipe
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.KeymapSwipe;

            /**
             * Decodes a KeymapSwipe message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns KeymapSwipe
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.KeymapSwipe;

            /**
             * Verifies a KeymapSwipe message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a KeymapSwipe message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KeymapSwipe
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.KeymapSwipe;

            /**
             * Creates a plain object from a KeymapSwipe message. Also converts values to other types if specified.
             * @param message KeymapSwipe
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.KeymapSwipe, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KeymapSwipe to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for KeymapSwipe
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a DeviceStatus. */
        interface IDeviceStatus {

            /** DeviceStatus deviceId */
            deviceId?: (string|null);

            /** DeviceStatus battery */
            battery?: (number|null);

            /** DeviceStatus currentApp */
            currentApp?: (string|null);

            /** DeviceStatus screenOn */
            screenOn?: (boolean|null);

            /** DeviceStatus timestampMs */
            timestampMs?: (number|Long|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a DeviceStatus. */
        class DeviceStatus implements IDeviceStatus {

            /**
             * Constructs a new DeviceStatus.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IDeviceStatus);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** DeviceStatus deviceId. */
            public deviceId: string;

            /** DeviceStatus battery. */
            public battery: number;

            /** DeviceStatus currentApp. */
            public currentApp: string;

            /** DeviceStatus screenOn. */
            public screenOn: boolean;

            /** DeviceStatus timestampMs. */
            public timestampMs: (number|Long);

            /**
             * Creates a new DeviceStatus instance using the specified properties.
             * @param [properties] Properties to set
             * @returns DeviceStatus instance
             */
            public static create(properties?: phonefarm.control.IDeviceStatus): phonefarm.control.DeviceStatus;

            /**
             * Encodes the specified DeviceStatus message. Does not implicitly {@link phonefarm.control.DeviceStatus.verify|verify} messages.
             * @param message DeviceStatus message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IDeviceStatus, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified DeviceStatus message, length delimited. Does not implicitly {@link phonefarm.control.DeviceStatus.verify|verify} messages.
             * @param message DeviceStatus message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IDeviceStatus, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a DeviceStatus message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns DeviceStatus
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.DeviceStatus;

            /**
             * Decodes a DeviceStatus message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns DeviceStatus
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.DeviceStatus;

            /**
             * Verifies a DeviceStatus message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a DeviceStatus message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns DeviceStatus
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.DeviceStatus;

            /**
             * Creates a plain object from a DeviceStatus message. Also converts values to other types if specified.
             * @param message DeviceStatus
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.DeviceStatus, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this DeviceStatus to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for DeviceStatus
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }

        /** Properties of a GroupBroadcast. */
        interface IGroupBroadcast {

            /** GroupBroadcast groupId */
            groupId?: (string|null);

            /** GroupBroadcast sourceDeviceId */
            sourceDeviceId?: (string|null);

            /** GroupBroadcast control */
            control?: (phonefarm.control.IControlMessage|null);

            /** Unknown fields preserved while decoding */
            $unknowns?: Uint8Array[];
        }

        /** Represents a GroupBroadcast. */
        class GroupBroadcast implements IGroupBroadcast {

            /**
             * Constructs a new GroupBroadcast.
             * @param [properties] Properties to set
             */
            constructor(properties?: phonefarm.control.IGroupBroadcast);

            /** Unknown fields preserved while decoding */
            public $unknowns?: Uint8Array[];

            /** GroupBroadcast groupId. */
            public groupId: string;

            /** GroupBroadcast sourceDeviceId. */
            public sourceDeviceId: string;

            /** GroupBroadcast control. */
            public control?: (phonefarm.control.IControlMessage|null);

            /**
             * Creates a new GroupBroadcast instance using the specified properties.
             * @param [properties] Properties to set
             * @returns GroupBroadcast instance
             */
            public static create(properties?: phonefarm.control.IGroupBroadcast): phonefarm.control.GroupBroadcast;

            /**
             * Encodes the specified GroupBroadcast message. Does not implicitly {@link phonefarm.control.GroupBroadcast.verify|verify} messages.
             * @param message GroupBroadcast message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: phonefarm.control.IGroupBroadcast, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified GroupBroadcast message, length delimited. Does not implicitly {@link phonefarm.control.GroupBroadcast.verify|verify} messages.
             * @param message GroupBroadcast message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: phonefarm.control.IGroupBroadcast, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a GroupBroadcast message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns GroupBroadcast
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): phonefarm.control.GroupBroadcast;

            /**
             * Decodes a GroupBroadcast message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns GroupBroadcast
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): phonefarm.control.GroupBroadcast;

            /**
             * Verifies a GroupBroadcast message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a GroupBroadcast message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns GroupBroadcast
             */
            public static fromObject(object: { [k: string]: any }): phonefarm.control.GroupBroadcast;

            /**
             * Creates a plain object from a GroupBroadcast message. Also converts values to other types if specified.
             * @param message GroupBroadcast
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: phonefarm.control.GroupBroadcast, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this GroupBroadcast to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the type url for GroupBroadcast
             * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
             * @returns The type url
             */
            public static getTypeUrl(prefix?: string): string;
        }
    }
}
