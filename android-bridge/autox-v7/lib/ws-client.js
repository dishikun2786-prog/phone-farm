/**
 * ws-client.js — AutoX v7 原生 WebSocket 客户端
 *
 * 封装 web.newWebSocket()，提供:
 *   - 属性风格事件绑定 (onOpen / onMessage / onClose / onError)
 *   - readyState 模拟 (CONNECTING/OPEN/CLOSING/CLOSED)
 *   - 自动重连 (指数退避)
 *   - send() 方法 + 连接状态检查
 *
 * 用法:
 *   var ws = new WsClient('ws://server:8443/ws/device');
 *   ws.onOpen = function() { ... };
 *   ws.onMessage = function(msg) { ... };
 *   ws.connect();
 */

var WsClient = (function () {
  'use strict';

  var CONNECTING = 0;
  var OPEN = 1;
  var CLOSING = 2;
  var CLOSED = 3;

  function WsClient(url, options) {
    options = options || {};
    this._url = url;
    this._reconnectMs = options.reconnectMs || 10000;
    this._maxReconnectMs = options.maxReconnectMs || 120000;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._socket = null;

    this.readyState = CLOSED;

    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;
  }

  WsClient.prototype.connect = function () {
    if (this._socket && this.readyState === OPEN) return;
    var self = this;

    try {
      this.readyState = CONNECTING;
      this._socket = web.newWebSocket(this._url);

      this._socket.on('open', function () {
        self.readyState = OPEN;
        self._reconnectAttempt = 0;
        if (typeof self.onOpen === 'function') self.onOpen();
      });

      this._socket.on('message', function (raw) {
        if (typeof self.onMessage === 'function') {
          try {
            self.onMessage(raw);
          } catch (e) {
            log('[ws-client] onMessage error: ' + e.message);
          }
        }
      });

      this._socket.on('close', function (code, reason) {
        self.readyState = CLOSED;
        self._socket = null;
        if (typeof self.onClose === 'function') {
          try { self.onClose(code || 0, reason || ''); } catch (e) {}
        }
        self._scheduleReconnect();
      });

      this._socket.on('error', function (err) {
        if (typeof self.onError === 'function') {
          try { self.onError(err); } catch (e) {}
        }
      });
    } catch (e) {
      log('[ws-client] connect failed: ' + e.message);
      this._scheduleReconnect();
    }
  };

  WsClient.prototype.send = function (data) {
    if (this._socket && this.readyState === OPEN) {
      try {
        this._socket.send(typeof data === 'string' ? data : JSON.stringify(data));
        return true;
      } catch (e) {
        log('[ws-client] send error: ' + e.message);
      }
    }
    return false;
  };

  WsClient.prototype.close = function () {
    this._cancelReconnect();
    if (this._socket) {
      try { this._socket.close(); } catch (e) {}
      this._socket = null;
    }
    this.readyState = CLOSED;
  };

  WsClient.prototype.isOpen = function () {
    return this.readyState === OPEN && this._socket !== null;
  };

  WsClient.prototype._scheduleReconnect = function () {
    if (this._reconnectTimer) return;
    var self = this;
    var delay = Math.min(
      this._reconnectMs * Math.pow(2, Math.min(this._reconnectAttempt, 5)),
      this._maxReconnectMs
    );
    this._reconnectAttempt++;
    log('[ws-client] ' + (delay / 1000) + 's 后重连 (attempt ' + this._reconnectAttempt + ')');
    this._reconnectTimer = setTimeout(function () {
      self._reconnectTimer = null;
      self.connect();
    }, delay);
  };

  WsClient.prototype._cancelReconnect = function () {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  };

  WsClient.CONNECTING = CONNECTING;
  WsClient.OPEN = OPEN;
  WsClient.CLOSING = CLOSING;
  WsClient.CLOSED = CLOSED;

  return WsClient;
})();
