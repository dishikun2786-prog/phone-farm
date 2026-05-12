/**
 * script-loader.js — AutoX v7 原生脚本加载器 + OTA 部署
 *
 * 功能:
 *   1. 接收服务器推送的 base64 编码脚本包 → 解码写入 /sdcard/AutoX/scripts/
 *   2. 优先加载 OTA 部署的外部脚本，回退到内置脚本
 *   3. 版本清单管理 (version.json)
 *
 * 用法:
 *   ScriptLoader.deploy(msg.files, msg.version);   // 部署脚本包
 *   ScriptLoader.load('task_dy_toker', config);     // 加载并执行脚本
 */

var ScriptLoader = (function () {
  'use strict';

  var SCRIPTS_DIR = '/sdcard/AutoX/scripts/';

  function ensureScriptsDir() {
    if (!files.exists(SCRIPTS_DIR)) {
      files.ensureDir(SCRIPTS_DIR);
    }
  }

  /**
   * Decode a base64 string to UTF-8 using Android APIs.
   */
  function decodeBase64(str) {
    try {
      var bytes = android.util.Base64.decode(str, 0);
      return new java.lang.String(bytes, 'UTF-8');
    } catch (e) {
      log('[script-loader] base64 decode error: ' + e.message);
      return null;
    }
  }

  /**
   * Handle an incoming deploy_scripts message from the server.
   * msg.files: { "filename.js": "<base64>", ... }
   * msg.version: "1.0.1"
   */
  function deploy(files, version) {
    ensureScriptsDir();
    var deployed = [];
    var failed = [];

    var filenames = Object.keys(files || {});
    for (var i = 0; i < filenames.length; i++) {
      var filename = filenames[i];
      try {
        var content = decodeBase64(files[filename]);
        if (content !== null) {
          files.write(SCRIPTS_DIR + filename, content);
          deployed.push(filename);
          log('[script-loader] deployed: ' + filename);
        } else {
          failed.push(filename + ': decode error');
        }
      } catch (e) {
        failed.push(filename + ': ' + e.message);
        log('[script-loader] deploy failed: ' + filename + ' — ' + e.message);
      }
    }

    if (deployed.length > 0) {
      try {
        files.write(SCRIPTS_DIR + 'deployed_at.txt', new Date().toISOString());
      } catch (e) {}
      toast('脚本已更新: ' + deployed.length + ' 个文件 (v' + (version || '?') + ')');
    }

    return { deployed: deployed, failed: failed };
  }

  /**
   * Get the path to a script file. Prefers external (OTA-deployed) over bundled.
   * @param {string} scriptName — e.g. "task_dy_toker"
   * @returns {string} resolved file path
   */
  function resolvePath(scriptName) {
    var extPath = SCRIPTS_DIR + scriptName + '.js';
    if (files.exists(extPath)) {
      if (scriptName.indexOf('tasks/') === 0) {
        // Already prefixed
        extPath = SCRIPTS_DIR + scriptName + '.js';
      }
      return extPath;
    }
    return scriptName + '.js'; // bundled fallback
  }

  /**
   * Check if external scripts are installed.
   */
  function hasExternalScripts() {
    try {
      return files.exists(SCRIPTS_DIR + 'version.json');
    } catch (e) {
      return false;
    }
  }

  /**
   * Get the installed version string.
   */
  function getInstalledVersion() {
    try {
      var versionPath = SCRIPTS_DIR + 'version.json';
      if (files.exists(versionPath)) {
        var manifest = JSON.parse(files.read(versionPath));
        return manifest.version || '0.0.0';
      }
    } catch (e) {}
    return 'builtin';
  }

  /**
   * Collect version info for all installed OTA scripts.
   */
  function collectVersions() {
    var info = { installedVersion: 'builtin', deployedAt: '', files: {} };

    try {
      if (hasExternalScripts()) {
        var raw = files.read(SCRIPTS_DIR + 'version.json');
        var manifest = JSON.parse(raw);
        info.installedVersion = manifest.version || '0.0.0';

        var filenames = Object.keys(manifest.files || {});
        for (var i = 0; i < filenames.length; i++) {
          var fn = filenames[i];
          info.files[fn] = {
            manifestVersion: manifest.files[fn].version || '0.0.0',
            exists: files.exists(SCRIPTS_DIR + fn),
          };
        }
      }

      if (files.exists(SCRIPTS_DIR + 'deployed_at.txt')) {
        info.deployedAt = files.read(SCRIPTS_DIR + 'deployed_at.txt').trim();
      }
    } catch (e) {}

    return info;
  }

  return {
    deploy: deploy,
    resolvePath: resolvePath,
    hasExternalScripts: hasExternalScripts,
    getInstalledVersion: getInstalledVersion,
    collectVersions: collectVersions,
  };
})();
