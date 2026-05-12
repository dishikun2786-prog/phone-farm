/**
 * app-automation.js — 基于节点信息的多平台 APP 自动化框架 (AutoX v7 原生版)
 *
 * 全部使用 AutoX v7 Rhino 原生 API:
 *   selector() / click() / swipe() / press() / back() / home()
 *   device.* / app.* / currentPackage() / log() / toast()
 *
 * 不依赖 compat.js 适配层。
 *
 * 核心设计:
 * 1. 通用工具层 — 等待节点、安全点击、滚动查找
 * 2. 平台适配层 — 抖音/快手/微信视频号/小红书 各自的节点定位规则
 * 3. 行为编排层 — 浏览/点赞/评论/关注/私信 的标准流程
 * 4. 远程桥接 — 与 control-server 通信上报状态
 */

var AppAutomation = (function () {
  'use strict';

  // ==========================================================================
  // SECTION 1: 通用工具层
  // ==========================================================================

  function waitForNode(selectorBuilder, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        var sel = selectorBuilder();
        var node = sel.findOnce();
        if (node) return node;
      } catch (e) {}
      sleep(300);
    }
    log('[Auto] waitForNode 超时');
    return null;
  }

  function safeClick(selectorBuilder, timeoutMs) {
    var node = waitForNode(selectorBuilder, timeoutMs);
    if (node) {
      try { return node.click(); } catch (e) { return false; }
    }
    return false;
  }

  function clickByText(text, timeoutMs) {
    return safeClick(function () {
      return selector().text(text).clickable(true);
    }, timeoutMs);
  }

  function clickByDesc(desc, timeoutMs) {
    return safeClick(function () {
      return selector().desc(desc).clickable(true);
    }, timeoutMs);
  }

  function clickById(resId, timeoutMs) {
    return safeClick(function () {
      return selector().id(resId).clickable(true);
    }, timeoutMs);
  }

  function inputToField(selectorBuilder, text, timeoutMs) {
    var node = waitForNode(selectorBuilder, timeoutMs);
    if (node) {
      try {
        node.focus();
        sleep(200);
        return node.setText(text);
      } catch (e) { return false; }
    }
    return false;
  }

  function scrollToFind(targetSelector, maxScrolls) {
    maxScrolls = maxScrolls || 20;
    for (var i = 0; i < maxScrolls; i++) {
      try {
        var node = targetSelector().findOnce();
        if (node) return node;
      } catch (e) {}
      swipe(
        device.width * 0.5,  device.height * 0.75,
        device.width * 0.5,  device.height * 0.25,
        400
      );
      sleep(800);
    }
    return null;
  }

  function ensureApp(packageName, launchIfNot) {
    var current = currentPackage();
    if (current !== packageName) {
      if (launchIfNot) {
        log('[Auto] 启动 APP: ' + packageName);
        app.launch(packageName);
        sleep(3000);
        return currentPackage() === packageName;
      }
      return false;
    }
    return true;
  }

  function randomDelay(baseMs, varianceMs) {
    baseMs = baseMs || 500;
    varianceMs = varianceMs || 300;
    sleep(baseMs + Math.floor(Math.random() * varianceMs));
  }

  function clickXY(x, y) {
    try { click(x, y); return true; } catch (e) { return false; }
  }

  function swipeUp() {
    swipe(
      device.width * 0.5,  device.height * 0.75,
      device.width * 0.5,  device.height * 0.25,
      350 + Math.floor(Math.random() * 200)
    );
  }

  function goBack() {
    back();
    sleep(500);
  }

  // ==========================================================================
  // SECTION 2: 平台适配层 — 抖音 (com.ss.android.ugc.aweme)
  // ==========================================================================

  var DouyinSelectors = {
    likeBtn: function () {
      return selector().descContains('赞').clickable(true);
    },
    commentBtn: function () {
      return selector().descContains('评论').clickable(true);
    },
    followBtn: function () {
      return selector().text('关注').clickable(true);
    },
    followedBtn: function () {
      return selector().text('已关注').clickable(true);
    },
    privateMsgBtn: function () {
      return selector().descContains('私信').clickable(true);
    },
    shareBtn: function () {
      return selector().descContains('分享').clickable(true);
    },
    commentInput: function () {
      return selector().editable(true).className('android.widget.EditText');
    },
    commentSendBtn: function () {
      return selector().text('发送').clickable(true);
    },
    searchBtn: function () {
      return selector().descContains('搜索').clickable(true);
    },
    searchInput: function () {
      return selector().id('com.ss.android.ugc.aweme:id/et_search_kw').editable(true);
    },
    searchUserTab: function () {
      return selector().text('用户').clickable(true);
    },
    searchFollowBtn: function () {
      return selector().text('关注').clickable(true).visibleToUser(true);
    },
    cityTab: function () {
      return selector().textContains('同城').clickable(true);
    },
    liveRoom: function () {
      return selector().descContains('直播').clickable(true);
    },
    liveBarrageInput: function () {
      return selector().className('android.widget.EditText').visibleToUser(true);
    },
    liveBarrageSend: function () {
      return selector().text('发送').clickable(true).visibleToUser(true);
    },
    authorName: function () {
      return selector().id('com.ss.android.ugc.aweme:id/title');
    },
    searchResultItem: function () {
      return selector().id('com.ss.android.ugc.aweme:id/avatar').clickable(true);
    },
  };

  var Douyin = {
    packageName: 'com.ss.android.ugc.aweme',
    selectors: DouyinSelectors,

    open: function () {
      app.launch('com.ss.android.ugc.aweme');
      sleep(3000);
      return currentPackage() === 'com.ss.android.ugc.aweme';
    },

    like: function () {
      var liked = false;
      try {
        liked = selector().descContains('已赞').findOne() !== null;
      } catch (e) {}
      if (liked) return true;
      var result = safeClick(DouyinSelectors.likeBtn, 3000);
      randomDelay(200, 100);
      return result;
    },

    comment: function (text) {
      if (!safeClick(DouyinSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(DouyinSelectors.commentInput, text, 5000)) return false;
      sleep(500);
      var sent = clickByText('发送', 2000);
      sleep(300);
      return sent;
    },

    follow: function () {
      try {
        var followed = selector().text('已关注').findOnce();
        if (followed) return true;
      } catch (e) {}
      return safeClick(DouyinSelectors.followBtn, 2000);
    },

    privateMessage: function (text) {
      if (!safeClick(DouyinSelectors.privateMsgBtn, 3000)) {
        safeClick(function () {
          return selector().id('com.ss.android.ugc.aweme:id/avatar').clickable(true);
        }, 3000);
        sleep(1000);
        safeClick(function () {
          return selector().text('私信').clickable(true);
        }, 3000);
      }
      sleep(800);
      if (!inputToField(DouyinSelectors.commentInput, text, 5000)) return false;
      sleep(500);
      return clickByText('发送', 2000);
    },

    nextVideo: function () {
      swipeUp();
      sleep(1500);
    },

    search: function (keyword) {
      if (!safeClick(DouyinSelectors.searchBtn, 5000)) return false;
      sleep(500);
      if (!inputToField(DouyinSelectors.searchInput, keyword, 5000)) return false;
      sleep(500);
      press(device.width * 0.5, device.height * 0.35, 100);
      sleep(2000);
      return true;
    },

    sendBarrage: function (text) {
      if (!inputToField(DouyinSelectors.liveBarrageInput, text, 5000)) return false;
      sleep(300);
      return safeClick(DouyinSelectors.liveBarrageSend, 2000);
    },

    getAuthorName: function () {
      try {
        var node = DouyinSelectors.authorName().findOnce();
        return node ? node.text() : '';
      } catch (e) { return ''; }
    },
  };

  // ==========================================================================
  // SECTION 3: 平台适配层 — 快手 (com.smile.gifmaker)
  // ==========================================================================

  var KuaishouSelectors = {
    likeBtn: function () {
      return selector().descContains('赞').clickable(true);
    },
    commentBtn: function () {
      return selector().descContains('评论').clickable(true).visibleToUser(true);
    },
    followBtn: function () {
      return selector().text('关注').clickable(true);
    },
    commentInput: function () {
      return selector().className('android.widget.EditText').editable(true);
    },
    commentSendBtn: function () {
      return selector().text('发送').clickable(true);
    },
    searchBtn: function () {
      return selector().descContains('搜索').clickable(true);
    },
    searchInput: function () {
      return selector().editable(true).className('android.widget.EditText');
    },
    searchUserResult: function () {
      return selector().id('com.smile.gifmaker:id/user_name');
    },
  };

  var Kuaishou = {
    packageName: 'com.smile.gifmaker',
    selectors: KuaishouSelectors,

    open: function () {
      app.launch('com.smile.gifmaker');
      sleep(3000);
      return currentPackage() === 'com.smile.gifmaker';
    },

    like: function () { return safeClick(KuaishouSelectors.likeBtn, 3000); },

    comment: function (text) {
      if (!safeClick(KuaishouSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(KuaishouSelectors.commentInput, text, 5000)) return false;
      sleep(400);
      return clickByText('发送', 2000);
    },

    follow: function () { return safeClick(KuaishouSelectors.followBtn, 2000); },

    nextVideo: function () { swipeUp(); sleep(1500); },

    search: function (keyword) {
      if (!safeClick(KuaishouSelectors.searchBtn, 5000)) return false;
      sleep(500);
      if (!inputToField(KuaishouSelectors.searchInput, keyword, 5000)) return false;
      sleep(500);
      press(device.width * 0.5, device.height * 0.35, 50);
      sleep(2000);
      return true;
    },
  };

  // ==========================================================================
  // SECTION 4: 平台适配层 — 微信视频号 (com.tencent.mm)
  // ==========================================================================

  var WechatSelectors = {
    discoverTab: function () {
      return selector().text('发现').clickable(true);
    },
    videoChannelEntry: function () {
      return selector().textContains('视频号').clickable(true);
    },
    likeBtn: function () {
      return selector().descContains('赞').clickable(true);
    },
    commentBtn: function () {
      return selector().descContains('评论').clickable(true);
    },
    followBtn: function () {
      return selector().text('关注').clickable(true);
    },
    commentInput: function () {
      return selector().className('android.widget.EditText').editable(true).visibleToUser(true);
    },
    searchIcon: function () {
      return selector().descContains('搜索').clickable(true);
    },
    searchInput: function () {
      return selector().className('android.widget.EditText').editable(true);
    },
  };

  var Wechat = {
    packageName: 'com.tencent.mm',
    selectors: WechatSelectors,

    open: function () {
      app.launch('com.tencent.mm');
      sleep(2000);
      return currentPackage() === 'com.tencent.mm';
    },

    enterVideoChannel: function () {
      if (!clickByText('发现', 3000)) {
        clickXY(device.width * 0.75, device.height - 40);
        sleep(500);
      }
      sleep(500);
      return safeClick(WechatSelectors.videoChannelEntry, 3000);
    },

    like: function () { return safeClick(WechatSelectors.likeBtn, 3000); },

    comment: function (text) {
      if (!safeClick(WechatSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(WechatSelectors.commentInput, text, 5000)) return false;
      sleep(300);
      return clickByText('发送', 2000);
    },

    follow: function () { return safeClick(WechatSelectors.followBtn, 2000); },

    nextVideo: function () { swipeUp(); sleep(1500); },
  };

  // ==========================================================================
  // SECTION 5: 平台适配层 — 小红书 (com.xingin.xhs)
  // ==========================================================================

  var XiaohongshuSelectors = {
    likeBtn: function () {
      return selector().descContains('赞').clickable(true);
    },
    collectBtn: function () {
      return selector().descContains('收藏').clickable(true);
    },
    commentBtn: function () {
      return selector().descContains('评论').clickable(true);
    },
    followBtn: function () {
      return selector().text('关注').clickable(true);
    },
    commentInput: function () {
      return selector().className('android.widget.EditText').editable(true);
    },
    commentSendBtn: function () {
      return selector().text('发送').clickable(true);
    },
    searchBtn: function () {
      return selector().descContains('搜索').clickable(true);
    },
    searchInput: function () {
      return selector().className('android.widget.EditText').editable(true).visibleToUser(true);
    },
    authorName: function () {
      return selector().id('com.xingin.xhs:id/tv_nickname');
    },
    notesTab: function () {
      return selector().text('笔记').clickable(true);
    },
  };

  var Xiaohongshu = {
    packageName: 'com.xingin.xhs',
    selectors: XiaohongshuSelectors,

    open: function () {
      app.launch('com.xingin.xhs');
      sleep(3000);
      return currentPackage() === 'com.xingin.xhs';
    },

    like: function () { return safeClick(XiaohongshuSelectors.likeBtn, 3000); },
    collect: function () { return safeClick(XiaohongshuSelectors.collectBtn, 3000); },

    comment: function (text) {
      if (!safeClick(XiaohongshuSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(XiaohongshuSelectors.commentInput, text, 5000)) return false;
      sleep(400);
      return clickByText('发送', 2000);
    },

    follow: function () { return safeClick(XiaohongshuSelectors.followBtn, 2000); },

    nextNote: function () { swipeUp(); sleep(1500); },

    search: function (keyword) {
      if (!safeClick(XiaohongshuSelectors.searchBtn, 5000)) return false;
      sleep(500);
      if (!inputToField(XiaohongshuSelectors.searchInput, keyword, 5000)) return false;
      sleep(300);
      press(device.width * 0.5, device.height * 0.3, 50);
      sleep(2000);
      return true;
    },
  };

  // ==========================================================================
  // SECTION 6: 行为编排层 — 标准营销任务流程
  // ==========================================================================

  function runFeedMarketing(platform, config) {
    config = config || {};
    var maxScroll   = config.maxScroll || 30;
    var viewSeconds = config.viewSeconds || 15;
    var likeRate    = config.likeRate || 50;
    var commentRate = config.commentRate || 30;
    var followRate  = config.followRate || 10;
    var pmRate      = config.pmRate || 5;
    var comments    = config.comments || ['不错', '学到了', '很有用', '666', '点赞'];
    var pmMessages  = config.pmMessages || ['你好，想交流一下'];

    var stats = { views: 0, likes: 0, comments: 0, follows: 0, pms: 0, errors: 0 };

    log('[Auto] 开始推荐流营销: ' + platform.packageName);
    log('[Auto] 配置: maxScroll=' + maxScroll + ' view=' + viewSeconds + 's like=' + likeRate + '% comment=' + commentRate + '%');

    if (!ensureApp(platform.packageName, true)) {
      log('[Auto] 无法启动 APP');
      return stats;
    }
    sleep(2000);

    if (platform.enterVideoChannel) { platform.enterVideoChannel(); sleep(1000); }

    for (var i = 0; i < maxScroll; i++) {
      try {
        log('[Auto] 视频 #' + (i + 1));
        stats.views++;
        sleep(viewSeconds * 1000);

        var rand = Math.random() * 100;

        if (rand < likeRate && platform.like()) { stats.likes++; randomDelay(300, 200); }

        if (rand < commentRate) {
          var commentText = comments[Math.floor(Math.random() * comments.length)];
          if (platform.comment(commentText)) { stats.comments++; randomDelay(800, 500); goBack(); sleep(300); }
        }

        if (rand < followRate && platform.follow()) { stats.follows++; randomDelay(500, 300); }

        if (platform.privateMessage && rand < pmRate) {
          var pmText = pmMessages[Math.floor(Math.random() * pmMessages.length)];
          if (platform.privateMessage(pmText)) { stats.pms++; randomDelay(800, 500); goBack(); sleep(300); }
        }

        if (i < maxScroll - 1) {
          if (platform.nextVideo) platform.nextVideo(); else { swipeUp(); sleep(1500); }
        }

        reportProgress(stats, i + 1, maxScroll);
      } catch (e) {
        stats.errors++;
        log('[Auto] 视频 #' + (i + 1) + ' 出错: ' + e.message);
        if (i < maxScroll - 1) { swipeUp(); sleep(1000); }
      }
    }

    log('[Auto] 推荐流营销完成: ' + JSON.stringify(stats));
    return stats;
  }

  function runYanghao(platform, config) {
    config = config || {};
    var durationMinutes = config.durationMinutes || 30;
    var scrollInterval  = config.scrollInterval || 15;

    var stats = { views: 0, likes: 0, startTime: new Date().toISOString() };

    if (!ensureApp(platform.packageName, true)) return stats;
    if (platform.enterVideoChannel) { platform.enterVideoChannel(); sleep(1000); }

    var endTime = Date.now() + durationMinutes * 60 * 1000;

    while (Date.now() < endTime) {
      try {
        stats.views++;
        sleep(scrollInterval * 1000);

        if (Math.random() * 100 < 8 && platform.like()) stats.likes++;

        if (platform.nextVideo) platform.nextVideo(); else { swipeUp(); sleep(1500); }

        if (stats.views % 20 === 0) {
          var restTime = 30 + Math.floor(Math.random() * 30);
          log('[Auto] 休息 ' + restTime + ' 秒...');
          sleep(restTime * 1000);
        }

        reportProgress(stats, stats.views, 0);
      } catch (e) { log('[Auto] 养号出错: ' + e.message); sleep(2000); }
    }

    stats.endTime = new Date().toISOString();
    log('[Auto] 养号完成: ' + JSON.stringify(stats));
    return stats;
  }

  function runSearchMarketing(platform, config) {
    config = config || {};
    var keywords    = config.keywords || [];
    var maxUsers    = config.maxUsers || 20;
    var followRate  = config.followRate || 30;
    var likeRate    = config.likeRate || 50;
    var commentRate = config.commentRate || 20;
    var comments    = config.comments || ['不错', '互关一下'];

    var stats = { searched: 0, follows: 0, likes: 0, comments: 0, errors: 0 };

    if (!ensureApp(platform.packageName, true)) return stats;

    for (var k = 0; k < keywords.length; k++) {
      var keyword = keywords[k];
      log('[Auto] 搜索关键词: ' + keyword);

      if (!platform.search(keyword)) { log('[Auto] 搜索失败: ' + keyword); continue; }

      stats.searched++;
      sleep(1500);

      for (var u = 0; u < maxUsers; u++) {
        try {
          var rand = Math.random() * 100;
          if (rand < followRate && platform.follow()) { stats.follows++; randomDelay(800, 500); }
          if (rand < likeRate && platform.like()) { stats.likes++; randomDelay(300, 200); }
          if (platform.comment && rand < commentRate) {
            var text = comments[Math.floor(Math.random() * comments.length)];
            if (platform.comment(text)) { stats.comments++; randomDelay(500, 300); }
          }
          reportProgress(stats, 0, 0);
          if (u < maxUsers - 1) { swipeUp(); sleep(1000); }
        } catch (e) { stats.errors++; }
      }

      if (k < keywords.length - 1) { goBack(); sleep(500); }
    }

    log('[Auto] 搜索营销完成: ' + JSON.stringify(stats));
    return stats;
  }

  // ==========================================================================
  // SECTION 7: 控制服务器通信
  // ==========================================================================

  function reportProgress(stats, current, total) {
    try {
      if (typeof remoteBridge !== 'undefined' && remoteBridge.sendTaskStatus) {
        remoteBridge.sendTaskStatus('running', total > 0 ? Math.floor(current / total * 100) : 0,
          'views=' + stats.views + ' likes=' + stats.likes + ' follows=' + stats.follows);
      }
    } catch (e) {}
  }

  function reportComplete(stats) {
    try {
      if (typeof remoteBridge !== 'undefined' && remoteBridge.sendTaskResult) {
        remoteBridge.sendTaskResult('completed', stats);
      }
    } catch (e) {}
  }

  // ==========================================================================
  // SECTION 8: 公开接口
  // ==========================================================================

  return {
    Douyin:      Douyin,
    Kuaishou:    Kuaishou,
    Wechat:      Wechat,
    Xiaohongshu: Xiaohongshu,

    runFeedMarketing:   runFeedMarketing,
    runYanghao:         runYanghao,
    runSearchMarketing: runSearchMarketing,

    waitForNode:   waitForNode,
    safeClick:     safeClick,
    clickByText:   clickByText,
    clickByDesc:   clickByDesc,
    clickById:     clickById,
    inputToField:  inputToField,
    scrollToFind:  scrollToFind,
    swipeUp:       swipeUp,
    goBack:        goBack,
    ensureApp:     ensureApp,
    randomDelay:   randomDelay,
    clickXY:       clickXY,

    reportProgress: reportProgress,
    reportComplete: reportComplete,
  };
})();

global.AppAutomation = AppAutomation;

log('[AppAutomation] AutoX v7 多平台自动化框架已加载');
log('[AppAutomation] 可用平台: Douyin, Kuaishou, Wechat, Xiaohongshu');
log('[AppAutomation] 可用任务: runFeedMarketing, runYanghao, runSearchMarketing');
