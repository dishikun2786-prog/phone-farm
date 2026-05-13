import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { WsHub } from "../ws-hub.js";

// -- WebRTC Signaling Message Types --

interface WebrtcOffer {
  type: "webrtc_offer";
  from: string;
  to: string;
  sdp: string;
}

interface WebrtcAnswer {
  type: "webrtc_answer";
  from: string;
  to: string;
  sdp: string;
}

interface WebrtcIceCandidate {
  type: "webrtc_ice";
  from: string;
  to: string;
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

interface WebrtcRequestConnection {
  type: "webrtc_connect_request";
  from: string;
  to: string;
}

interface WebrtcAcceptConnection {
  type: "webrtc_connect_accept";
  from: string;
  to: string;
}

interface WebrtcRejectConnection {
  type: "webrtc_connect_reject";
  from: string;
  to: string;
  reason?: string;
}

type WebrtcSignalingMessage =
  | WebrtcOffer
  | WebrtcAnswer
  | WebrtcIceCandidate
  | WebrtcRequestConnection
  | WebrtcAcceptConnection
  | WebrtcRejectConnection;

// -- Supported signaling message types --

const WEBRTC_SIGNALING_TYPES = new Set([
  "webrtc_offer",
  "webrtc_answer",
  "webrtc_ice",
  "webrtc_connect_request",
  "webrtc_connect_accept",
  "webrtc_connect_reject",
]);

// -- Signaling relay logic --

export function handleWebrtcSignaling(
  wsHub: WsHub,
  msg: Record<string, unknown>,
  fromDeviceId: string,
): boolean {
  const type = msg.type as string | undefined;
  if (!type || !WEBRTC_SIGNALING_TYPES.has(type)) {
    return false;
  }

  console.log(
    `[webrtc-signaling] ${type} from=${fromDeviceId} to=${msg.to}`,
  );

  try {
    switch (type) {
      case "webrtc_offer":
        handleOffer(wsHub, fromDeviceId, msg as unknown as WebrtcOffer);
        break;
      case "webrtc_answer":
        handleAnswer(wsHub, fromDeviceId, msg as unknown as WebrtcAnswer);
        break;
      case "webrtc_ice":
        handleIceCandidate(wsHub, fromDeviceId, msg as unknown as WebrtcIceCandidate);
        break;
      case "webrtc_connect_request":
        handleConnectRequest(wsHub, fromDeviceId, msg as unknown as WebrtcRequestConnection);
        break;
      case "webrtc_connect_accept":
        handleConnectAccept(wsHub, fromDeviceId, msg as unknown as WebrtcAcceptConnection);
        break;
      case "webrtc_connect_reject":
        handleConnectReject(wsHub, fromDeviceId, msg as unknown as WebrtcRejectConnection);
        break;
      default:
        console.warn(`[webrtc-signaling] Unhandled type: ${type}`);
        return false;
    }
    return true;
  } catch (err) {
    console.error(`[webrtc-signaling] Error handling ${type}:`, err);
    return false;
  }
}

// -- Per-type handlers --

function handleOffer(wsHub: WsHub, fromDeviceId: string, msg: WebrtcOffer): void {
  const targetOnline = wsHub.isDeviceOnline(msg.to);
  if (!targetOnline) {
    console.warn(
      `[webrtc-signaling] Cannot relay offer - target device ${msg.to} is offline`,
    );
    wsHub.sendToDevice(fromDeviceId, {
      type: "webrtc_error",
      message: `Target device ${msg.to} is offline`,
      targetId: msg.to,
    });
    return;
  }

  const sent = wsHub.sendToDevice(msg.to, {
    type: "webrtc_offer",
    from: fromDeviceId,
    to: msg.to,
    sdp: msg.sdp,
  });

  if (!sent) {
    console.error(
      `[webrtc-signaling] Failed to deliver offer to device ${msg.to}`,
    );
  } else {
    console.log(
      `[webrtc-signaling] Offer relayed: ${fromDeviceId} -> ${msg.to}`,
    );
  }
}

function handleAnswer(wsHub: WsHub, fromDeviceId: string, msg: WebrtcAnswer): void {
  const targetOnline = wsHub.isDeviceOnline(msg.to);
  if (!targetOnline) {
    console.warn(
      `[webrtc-signaling] Cannot relay answer - target device ${msg.to} is offline`,
    );
    wsHub.sendToDevice(fromDeviceId, {
      type: "webrtc_error",
      message: `Target device ${msg.to} is offline`,
      targetId: msg.to,
    });
    return;
  }

  const sent = wsHub.sendToDevice(msg.to, {
    type: "webrtc_answer",
    from: fromDeviceId,
    to: msg.to,
    sdp: msg.sdp,
  });

  if (!sent) {
    console.error(
      `[webrtc-signaling] Failed to deliver answer to device ${msg.to}`,
    );
  } else {
    console.log(
      `[webrtc-signaling] Answer relayed: ${fromDeviceId} -> ${msg.to}`,
    );
  }
}

function handleIceCandidate(
  wsHub: WsHub,
  fromDeviceId: string,
  msg: WebrtcIceCandidate,
): void {
  const targetOnline = wsHub.isDeviceOnline(msg.to);
  if (!targetOnline) {
    console.debug(
      `[webrtc-signaling] Target ${msg.to} offline - dropping ICE candidate from ${fromDeviceId}`,
    );
    return;
  }

  const sent = wsHub.sendToDevice(msg.to, {
    type: "webrtc_ice",
    from: fromDeviceId,
    to: msg.to,
    candidate: msg.candidate,
    sdpMid: msg.sdpMid ?? null,
    sdpMLineIndex: msg.sdpMLineIndex ?? 0,
  });

  if (!sent) {
    console.debug(
      `[webrtc-signaling] Failed to deliver ICE candidate to ${msg.to}`,
    );
  }
}

function handleConnectRequest(
  wsHub: WsHub,
  fromDeviceId: string,
  msg: WebrtcRequestConnection,
): void {
  const targetOnline = wsHub.isDeviceOnline(msg.to);
  if (!targetOnline) {
    console.warn(
      `[webrtc-signaling] Cannot relay connect request - target ${msg.to} is offline`,
    );
    wsHub.sendToDevice(fromDeviceId, {
      type: "webrtc_error",
      message: `Target device ${msg.to} is offline`,
      targetId: msg.to,
    });
    return;
  }

  const sent = wsHub.sendToDevice(msg.to, {
    type: "webrtc_connect_request",
    from: fromDeviceId,
    to: msg.to,
  });

  if (sent) {
    console.log(
      `[webrtc-signaling] Connection request relayed: ${fromDeviceId} -> ${msg.to}`,
    );
  }
}

function handleConnectAccept(
  wsHub: WsHub,
  fromDeviceId: string,
  msg: WebrtcAcceptConnection,
): void {
  const sent = wsHub.sendToDevice(msg.to, {
    type: "webrtc_connect_accept",
    from: fromDeviceId,
    to: msg.to,
  });

  if (sent) {
    console.log(
      `[webrtc-signaling] Connection accepted: ${fromDeviceId} -> ${msg.to}`,
    );
  }
}

function handleConnectReject(
  wsHub: WsHub,
  fromDeviceId: string,
  msg: WebrtcRejectConnection,
): void {
  const sent = wsHub.sendToDevice(msg.to, {
    type: "webrtc_connect_reject",
    from: fromDeviceId,
    to: msg.to,
    reason: msg.reason || "",
  });

  if (sent) {
    console.log(
      `[webrtc-signaling] Connection rejected: ${fromDeviceId} -> ${msg.to} (${msg.reason || "no reason"})`,
    );
  }
}

// -- Fastify Route Registration --

export async function webrtcSignalingRoutes(app: FastifyInstance): Promise<void> {
  const wsHub: WsHub = (app as any).wsHub;

  app.get("/ws/webrtc", { websocket: true }, (socket: WebSocket, req: any) => {
    wsHub.handleDeviceUpgrade(socket, req);

    console.log(
      `[webrtc-signaling-routes] WebRTC WS connected from ${req?.socket?.remoteAddress || req?.ip || "unknown"}`,
    );
  });
}

export function isWebrtcSupported(deviceId: string): boolean {
  return true;
}
