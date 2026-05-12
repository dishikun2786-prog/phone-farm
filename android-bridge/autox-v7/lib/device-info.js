/**
 * device-info.js — AutoX v7 原生设备信息采集
 *
 * 采集设备标识、系统版本、电池、屏幕状态等，用于 WebSocket auth 消息。
 * 全部使用 AutoX v7 原生 API (device.*, app.*, currentPackage())。
 *
 * 用法:
 *   var info = DeviceInfo.collect();
 *   // { device_id, model, android_version, autoX_version, tailscale_ip, ... }
 */

var DeviceInfo = (function () {
  'use strict';

  var STORAGE_NAME = 'phonefarm';

  function collect() {
    var s = storages.create(STORAGE_NAME);

    return {
      device_id: device.getAndroidId() || ('device-' + (device.serial || 'unknown')),
      model: device.model || 'Unknown',
      android_version: device.release || 'Unknown',
      autoX_version: app.versionName || 'Unknown',
      tailscale_ip: s.get('tailscale_ip', 'unknown'),
      runtime: 'autox',
    };
  }

  function getHeartbeatData() {
    return {
      battery: device.getBattery() || 0,
      current_app: currentPackage() || '',
      screen_on: device.isScreenOn(),
    };
  }

  function getInstalledScriptVersion() {
    var SCRIPTS_DIR = '/sdcard/AutoX/scripts/';
    try {
      var versionPath = SCRIPTS_DIR + 'version.json';
      if (files.exists(versionPath)) {
        var raw = files.read(versionPath);
        var manifest = JSON.parse(raw);
        return manifest.version || '0.0.0';
      }
    } catch (e) {}
    return 'builtin';
  }

  return {
    collect: collect,
    getHeartbeatData: getHeartbeatData,
    getInstalledScriptVersion: getInstalledScriptVersion,
  };
})();
