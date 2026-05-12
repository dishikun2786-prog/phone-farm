/**
 * app-automation.js — 基于节点信息的多平台 APP 自动化框架
 *
 * 依赖: node-inspector.js (提供节点获取能力)
 * 遵循 DeekeScript API 规范 (https://doc.deeke.cn)
 *
 * 核心设计:
 * 1. 通用工具层 — 等待节点、安全点击、滚动查找、OCR辅助等
 * 2. 平台适配层 — 抖音/快手/微信视频号/小红书 各自的节点定位规则
 * 3. 行为编排层 — 浏览/点赞/评论/关注/私信 的标准流程
 * 4. 远程桥接 — 与 control-server 通信上报状态
 *
 * 节点定位策略 (优先级从高到低):
 *   优先: id (viewIdResourceName) → 最稳定，跨版本兼容好
 *   备选: text + className 组合 → 适配多语言/多版本
 *   兜底: desc (contentDescription) → 图标按钮常用
 *   最后: bounds + 坐标点击 → 仅作紧急降级
 */

var AppAutomation = (function () {
  'use strict';

  // ==========================================================================
  // SECTION 1: 通用工具层
  // ==========================================================================

  /**
   * 等待节点出现（阻塞式）
   * @param {function} selectorBuilder 返回 UiSelector 的函数
   * @param {number} timeoutMs 超时毫秒
   * @returns UiObject | null
   */
  function waitForNode(selectorBuilder, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        var selector = selectorBuilder();
        var node = selector.findOnce();
        if (node) return node;
      } catch (e) {}
      sleep(300);
    }
    Log.log('[Auto] waitForNode 超时');
    return null;
  }

  /**
   * 安全点击 — 先检查是否存在再点击
   */
  function safeClick(selectorBuilder, timeoutMs) {
    var node = waitForNode(selectorBuilder, timeoutMs);
    if (node) {
      try { return node.click(); } catch (e) { return false; }
    }
    return false;
  }

  /**
   * 按文本点击
   */
  function clickByText(text, timeoutMs) {
    return safeClick(function () {
      return UiSelector().text(text).clickable(true);
    }, timeoutMs);
  }

  /**
   * 按描述点击
   */
  function clickByDesc(desc, timeoutMs) {
    return safeClick(function () {
      return UiSelector().desc(desc).clickable(true);
    }, timeoutMs);
  }

  /**
   * 按 ID 点击
   */
  function clickById(resId, timeoutMs) {
    return safeClick(function () {
      return UiSelector().id(resId).clickable(true);
    }, timeoutMs);
  }

  /**
   * 输入文本到输入框
   */
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

  /**
   * 滚动查找 — 向下滑动直到找到目标节点
   * @param {function} targetSelector 目标节点选择器
   * @param {number} maxScrolls 最大滚动次数
   * @returns UiObject | null
   */
  function scrollToFind(targetSelector, maxScrolls) {
    maxScrolls = maxScrolls || 20;
    for (var i = 0; i < maxScrolls; i++) {
      try {
        var node = targetSelector().findOnce();
        if (node) return node;
      } catch (e) {}
      // 向下滚动一屏
      Gesture.swipe(
        Device.width * 0.5,  Device.height * 0.75,
        Device.width * 0.5,  Device.height * 0.25,
        400
      );
      sleep(800);
    }
    return null;
  }

  /**
   * 检查当前 APP 是否是目标 APP
   */
  function ensureApp(packageName, launchIfNot) {
    var current = App.currentPackageName();
    if (current !== packageName) {
      if (launchIfNot) {
        Log.log('[Auto] 启动 APP: ' + packageName);
        App.launch(packageName);
        sleep(3000);
        return App.currentPackageName() === packageName;
      }
      return false;
    }
    return true;
  }

  /**
   * 随机延迟 (模拟真人操作)
   */
  function randomDelay(baseMs, varianceMs) {
    baseMs = baseMs || 500;
    varianceMs = varianceMs || 300;
    var delay = baseMs + Math.floor(Math.random() * varianceMs);
    sleep(delay);
  }

  /**
   * 坐标点击 (兜底方案)
   */
  function clickXY(x, y) {
    try { Gesture.click(x, y); return true; } catch (e) { return false; }
  }

  /**
   * 向上滑动 (模拟手指上滑刷视频)
   */
  function swipeUp() {
    Gesture.swipe(
      Device.width * 0.5,  Device.height * 0.75,
      Device.width * 0.5,  Device.height * 0.25,
      350 + Math.floor(Math.random() * 200)
    );
  }

  /**
   * 返回键
   */
  function goBack() {
    Gesture.back();
    sleep(500);
  }

  // ==========================================================================
  // SECTION 2: 平台适配层 — 抖音 (com.ss.android.ugc.aweme)
  // ==========================================================================

  var DouyinSelectors = {
    // --- 视频播放页 ---
    // 点赞按钮 (爱心图标, desc包含"赞")
    likeBtn: function () {
      return UiSelector()
        .descContains('赞')
        .clickable(true);
    },
    // 评论按钮
    commentBtn: function () {
      return UiSelector()
        .descContains('评论')
        .clickable(true);
    },
    // 关注按钮
    followBtn: function () {
      return UiSelector()
        .text('关注')
        .clickable(true);
    },
    // "关注"状态（已关注）
    followedBtn: function () {
      return UiSelector()
        .text('已关注')
        .clickable(true);
    },
    // 私信按钮
    privateMsgBtn: function () {
      return UiSelector()
        .descContains('私信')
        .clickable(true);
    },
    // 分享按钮
    shareBtn: function () {
      return UiSelector()
        .descContains('分享')
        .clickable(true);
    },
    // 评论区输入框
    commentInput: function () {
      return UiSelector()
        .editable(true)
        .className('android.widget.EditText');
    },
    // 评论区发送按钮
    commentSendBtn: function () {
      return UiSelector()
        .text('发送')
        .clickable(true);
    },
    // 搜索按钮(首页)
    searchBtn: function () {
      return UiSelector()
        .descContains('搜索')
        .clickable(true);
    },
    // 搜索输入框
    searchInput: function () {
      return UiSelector()
        .id('com.ss.android.ugc.aweme:id/et_search_kw')
        .editable(true);
    },
    // 搜索结果-用户tab
    searchUserTab: function () {
      return UiSelector()
        .text('用户')
        .clickable(true);
    },
    // 用户关注按钮(搜索结果列表中的)
    searchFollowBtn: function () {
      return UiSelector()
        .text('关注')
        .clickable(true)
        .isVisibleToUser(true);
    },
    // 同城Tab
    cityTab: function () {
      return UiSelector()
        .textContains('同城')
        .clickable(true);
    },
    // 直播间
    liveRoom: function () {
      return UiSelector()
        .descContains('直播')
        .clickable(true);
    },
    // 直播间弹幕输入框
    liveBarrageInput: function () {
      return UiSelector()
        .className('android.widget.EditText')
        .isVisibleToUser(true);
    },
    // 直播间发送按钮
    liveBarrageSend: function () {
      return UiSelector()
        .text('发送')
        .clickable(true)
        .isVisibleToUser(true);
    },
    // 视频作者名
    authorName: function () {
      return UiSelector()
        .id('com.ss.android.ugc.aweme:id/title');
    },
    // 搜索返回结果中的用户列表item
    searchResultItem: function () {
      return UiSelector()
        .id('com.ss.android.ugc.aweme:id/avatar')
        .clickable(true);
    },
  };

  var Douyin = {
    packageName: 'com.ss.android.ugc.aweme',
    selectors: DouyinSelectors,

    /** 打开抖音 */
    open: function () {
      App.launch(DouyinSelectors._pkg || 'com.ss.android.ugc.aweme');
      sleep(3000);
      return App.currentPackageName() === 'com.ss.android.ugc.aweme';
    },

    /** 点赞当前视频 */
    like: function () {
      // 先判断是否已点赞
      var liked = false;
      try {
        liked = UiSelector().descContains('已赞').findOne() !== null;
      } catch (e) {}
      if (liked) return true;

      var result = safeClick(DouyinSelectors.likeBtn, 3000);
      randomDelay(200, 100);
      return result;
    },

    /** 评论当前视频 */
    comment: function (text) {
      // 1. 点评论按钮打开评论区
      if (!safeClick(DouyinSelectors.commentBtn, 3000)) return false;
      sleep(800);

      // 2. 定位输入框并输入
      if (!inputToField(DouyinSelectors.commentInput, text, 5000)) return false;
      sleep(500);

      // 3. 发送
      var sent = clickByText('发送', 2000);
      sleep(300);
      return sent;
    },

    /** 关注当前视频作者 */
    follow: function () {
      // 先检查是否已经关注
      try {
        var followed = UiSelector().text('已关注').findOnce();
        if (followed) return true; // 已关注，跳过
      } catch (e) {}

      return safeClick(DouyinSelectors.followBtn, 2000);
    },

    /** 私信当前视频作者 */
    privateMessage: function (text) {
      // 1. 点头像进个人主页（或点私信按钮）
      if (!safeClick(DouyinSelectors.privateMsgBtn, 3000)) {
        // 降级：通过头像进个人主页再点私信
        safeClick(function () {
          return UiSelector().id('com.ss.android.ugc.aweme:id/avatar').clickable(true);
        }, 3000);
        sleep(1000);
        safeClick(function () {
          return UiSelector().text('私信').clickable(true);
        }, 3000);
      }
      sleep(800);

      // 2. 输入私信内容并发送
      if (!inputToField(DouyinSelectors.commentInput, text, 5000)) return false;
      sleep(500);
      return clickByText('发送', 2000);
    },

    /** 滑动到下一个视频 */
    nextVideo: function () {
      swipeUp();
      sleep(1500); // 等待视频加载
    },

    /** 搜索关键词 */
    search: function (keyword) {
      // 1. 点搜索按钮
      if (!safeClick(DouyinSelectors.searchBtn, 5000)) return false;
      sleep(500);

      // 2. 输入搜索词
      if (!inputToField(DouyinSelectors.searchInput, keyword, 5000)) return false;
      sleep(500);

      // 3. 点搜索（键盘回车）
      Gesture.press(Device.width * 0.5, Device.height * 0.35, 100);
      sleep(2000);
      return true;
    },

    /** 在直播间发弹幕 */
    sendBarrage: function (text) {
      if (!inputToField(DouyinSelectors.liveBarrageInput, text, 5000)) return false;
      sleep(300);
      return safeClick(DouyinSelectors.liveBarrageSend, 2000);
    },

    /** 获取当前作者名 (用于判断是否应该操作) */
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
      return UiSelector()
        .descContains('赞')
        .clickable(true);
    },
    commentBtn: function () {
      return UiSelector()
        .descContains('评论')
        .clickable(true)
        .isVisibleToUser(true);
    },
    followBtn: function () {
      return UiSelector()
        .text('关注')
        .clickable(true);
    },
    commentInput: function () {
      return UiSelector()
        .className('android.widget.EditText')
        .editable(true);
    },
    commentSendBtn: function () {
      return UiSelector()
        .text('发送')
        .clickable(true);
    },
    searchBtn: function () {
      return UiSelector()
        .descContains('搜索')
        .clickable(true);
    },
    searchInput: function () {
      return UiSelector()
        .editable(true)
        .className('android.widget.EditText');
    },
    searchUserResult: function () {
      return UiSelector()
        .id('com.smile.gifmaker:id/user_name');
    },
  };

  var Kuaishou = {
    packageName: 'com.smile.gifmaker',
    selectors: KuaishouSelectors,

    open: function () {
      App.launch('com.smile.gifmaker');
      sleep(3000);
      return App.currentPackageName() === 'com.smile.gifmaker';
    },

    like: function () {
      return safeClick(KuaishouSelectors.likeBtn, 3000);
    },

    comment: function (text) {
      if (!safeClick(KuaishouSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(KuaishouSelectors.commentInput, text, 5000)) return false;
      sleep(400);
      return clickByText('发送', 2000);
    },

    follow: function () {
      return safeClick(KuaishouSelectors.followBtn, 2000);
    },

    nextVideo: function () {
      swipeUp();
      sleep(1500);
    },

    search: function (keyword) {
      if (!safeClick(KuaishouSelectors.searchBtn, 5000)) return false;
      sleep(500);
      if (!inputToField(KuaishouSelectors.searchInput, keyword, 5000)) return false;
      sleep(500);
      Gesture.press(Device.width * 0.5, Device.height * 0.35, 50);
      sleep(2000);
      return true;
    },
  };

  // ==========================================================================
  // SECTION 4: 平台适配层 — 微信视频号 (com.tencent.mm)
  // ==========================================================================

  var WechatSelectors = {
    // 发现Tab
    discoverTab: function () {
      return UiSelector()
        .text('发现')
        .clickable(true);
    },
    // 视频号入口
    videoChannelEntry: function () {
      return UiSelector()
        .textContains('视频号')
        .clickable(true);
    },
    // 点赞
    likeBtn: function () {
      return UiSelector()
        .descContains('赞')
        .clickable(true);
    },
    // 评论按钮
    commentBtn: function () {
      return UiSelector()
        .descContains('评论')
        .clickable(true);
    },
    // 关注
    followBtn: function () {
      return UiSelector()
        .text('关注')
        .clickable(true);
    },
    commentInput: function () {
      return UiSelector()
        .className('android.widget.EditText')
        .editable(true)
        .isVisibleToUser(true);
    },
    // 搜索放大镜
    searchIcon: function () {
      return UiSelector()
        .descContains('搜索')
        .clickable(true);
    },
    searchInput: function () {
      return UiSelector()
        .className('android.widget.EditText')
        .editable(true);
    },
  };

  var Wechat = {
    packageName: 'com.tencent.mm',
    selectors: WechatSelectors,

    open: function () {
      App.launch('com.tencent.mm');
      sleep(2000);
      return App.currentPackageName() === 'com.tencent.mm';
    },

    /** 进入视频号 */
    enterVideoChannel: function () {
      // 先点"发现"Tab
      if (!clickByText('发现', 3000)) {
        // 降级：用坐标点底部发现tab
        clickXY(Device.width * 0.75, Device.height - 40);
        sleep(500);
      }
      sleep(500);

      // 点"视频号"
      return safeClick(WechatSelectors.videoChannelEntry, 3000);
    },

    like: function () {
      return safeClick(WechatSelectors.likeBtn, 3000);
    },

    comment: function (text) {
      if (!safeClick(WechatSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(WechatSelectors.commentInput, text, 5000)) return false;
      sleep(300);
      return clickByText('发送', 2000);
    },

    follow: function () {
      return safeClick(WechatSelectors.followBtn, 2000);
    },

    nextVideo: function () {
      swipeUp();
      sleep(1500);
    },
  };

  // ==========================================================================
  // SECTION 5: 平台适配层 — 小红书 (com.xingin.xhs)
  // ==========================================================================

  var XiaohongshuSelectors = {
    likeBtn: function () {
      return UiSelector()
        .descContains('赞')
        .clickable(true);
    },
    collectBtn: function () {
      return UiSelector()
        .descContains('收藏')
        .clickable(true);
    },
    commentBtn: function () {
      return UiSelector()
        .descContains('评论')
        .clickable(true);
    },
    followBtn: function () {
      return UiSelector()
        .text('关注')
        .clickable(true);
    },
    commentInput: function () {
      return UiSelector()
        .className('android.widget.EditText')
        .editable(true);
    },
    commentSendBtn: function () {
      return UiSelector()
        .text('发送')
        .clickable(true);
    },
    searchBtn: function () {
      return UiSelector()
        .descContains('搜索')
        .clickable(true);
    },
    searchInput: function () {
      return UiSelector()
        .className('android.widget.EditText')
        .editable(true)
        .isVisibleToUser(true);
    },
    // 笔记作者
    authorName: function () {
      return UiSelector()
        .id('com.xingin.xhs:id/tv_nickname');
    },
    // "笔记"tab（在个人主页）
    notesTab: function () {
      return UiSelector()
        .text('笔记')
        .clickable(true);
    },
  };

  var Xiaohongshu = {
    packageName: 'com.xingin.xhs',
    selectors: XiaohongshuSelectors,

    open: function () {
      App.launch('com.xingin.xhs');
      sleep(3000);
      return App.currentPackageName() === 'com.xingin.xhs';
    },

    like: function () {
      return safeClick(XiaohongshuSelectors.likeBtn, 3000);
    },

    collect: function () {
      return safeClick(XiaohongshuSelectors.collectBtn, 3000);
    },

    comment: function (text) {
      if (!safeClick(XiaohongshuSelectors.commentBtn, 3000)) return false;
      sleep(800);
      if (!inputToField(XiaohongshuSelectors.commentInput, text, 5000)) return false;
      sleep(400);
      return clickByText('发送', 2000);
    },

    follow: function () {
      return safeClick(XiaohongshuSelectors.followBtn, 2000);
    },

    nextNote: function () {
      swipeUp();
      sleep(1500);
    },

    search: function (keyword) {
      if (!safeClick(XiaohongshuSelectors.searchBtn, 5000)) return false;
      sleep(500);
      if (!inputToField(XiaohongshuSelectors.searchInput, keyword, 5000)) return false;
      sleep(300);
      Gesture.press(Device.width * 0.5, Device.height * 0.3, 50);
      sleep(2000);
      return true;
    },
  };

  // ==========================================================================
  // SECTION 6: 行为编排层 — 标准营销任务流程
  // ==========================================================================

  /**
   * 标准推荐流营销任务
   * @param {object} platform 平台适配对象 (Douyin/Kuaishou/Wechat/Xiaohongshu)
   * @param {object} config 任务配置
   *   - maxScroll: 最大刷视频数 (默认 30)
   *   - viewSeconds: 每个视频观看秒数 (默认 15)
   *   - likeRate: 点赞概率 0-100 (默认 50)
   *   - commentRate: 评论概率 0-100 (默认 30)
   *   - followRate: 关注概率 0-100 (默认 10)
   *   - pmRate: 私信概率 0-100 (默认 5)
   *   - comments: 评论话术数组 ["不错", "学到了", ...]
   *   - pmMessages: 私信话术数组
   */
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

    Log.log('[Auto] 开始推荐流营销: ' + platform.packageName);
    Log.log('[Auto] 配置: ' + JSON.stringify({
      maxScroll: maxScroll, viewSeconds: viewSeconds,
      likeRate: likeRate, commentRate: commentRate, followRate: followRate, pmRate: pmRate
    }));

    // 确保 APP 打开
    if (!ensureApp(platform.packageName, true)) {
      Log.log('[Auto] 无法启动 APP');
      return stats;
    }
    sleep(2000);

    // 如果平台需要额外初始化（如微信需进入视频号）
    if (platform.enterVideoChannel) {
      platform.enterVideoChannel();
      sleep(1000);
    }

    for (var i = 0; i < maxScroll; i++) {
      try {
        Log.log('[Auto] 视频 #' + (i + 1));
        stats.views++;

        // 观看视频
        sleep(viewSeconds * 1000);

        // 随机决策
        var rand = Math.random() * 100;

        // 点赞
        if (rand < likeRate) {
          if (platform.like()) {
            stats.likes++;
            randomDelay(300, 200);
          }
        }

        // 评论
        if (rand < commentRate) {
          var commentText = comments[Math.floor(Math.random() * comments.length)];
          if (platform.comment(commentText)) {
            stats.comments++;
            randomDelay(800, 500);
            goBack(); // 关闭评论区
            sleep(300);
          }
        }

        // 关注
        if (rand < followRate) {
          if (platform.follow()) {
            stats.follows++;
            randomDelay(500, 300);
          }
        }

        // 私信
        if (platform.privateMessage && rand < pmRate) {
          var pmText = pmMessages[Math.floor(Math.random() * pmMessages.length)];
          if (platform.privateMessage(pmText)) {
            stats.pms++;
            randomDelay(800, 500);
            goBack();
            sleep(300);
          }
        }

        // 下一个视频（最后一条不滑）
        if (i < maxScroll - 1) {
          if (platform.nextVideo) {
            platform.nextVideo();
          } else {
            swipeUp();
            sleep(1500);
          }
        }

        // 上报远程状态（如果 global.remoteBridge 存在）
        reportProgress(stats, i + 1, maxScroll);

      } catch (e) {
        stats.errors++;
        Log.log('[Auto] 视频 #' + (i + 1) + ' 出错: ' + e.message);
        // 继续下一个
        if (i < maxScroll - 1) {
          swipeUp();
          sleep(1000);
        }
      }
    }

    Log.log('[Auto] 推荐流营销完成: ' + JSON.stringify(stats));
    return stats;
  }

  /**
   * 养号任务 — 模拟真人浏览行为
   */
  function runYanghao(platform, config) {
    config = config || {};
    var durationMinutes = config.durationMinutes || 30;
    var scrollInterval  = config.scrollInterval || 15; // 滑动间隔秒数

    var stats = { views: 0, likes: 0, startTime: time() };

    if (!ensureApp(platform.packageName, true)) return stats;
    if (platform.enterVideoChannel) { platform.enterVideoChannel(); sleep(1000); }

    var endTime = Date.now() + durationMinutes * 60 * 1000;

    while (Date.now() < endTime) {
      try {
        stats.views++;
        sleep(scrollInterval * 1000);

        // 随机互动（低频率，模拟真人）
        var rand = Math.random() * 100;
        if (rand < 8) { // 8% 点赞
          platform.like();
          stats.likes++;
        }

        // 滑动
        if (platform.nextVideo) {
          platform.nextVideo();
        } else {
          swipeUp();
          sleep(1500);
        }

        // 每5分钟短暂休息 30-60 秒
        if (stats.views % 20 === 0) {
          var restTime = 30 + Math.floor(Math.random() * 30);
          Log.log('[Auto] 休息 ' + restTime + ' 秒...');
          sleep(restTime * 1000);
        }

        reportProgress(stats, stats.views, 0);
      } catch (e) {
        Log.log('[Auto] 养号出错: ' + e.message);
        sleep(2000);
      }
    }

    stats.endTime = time();
    Log.log('[Auto] 养号完成: ' + JSON.stringify(stats));
    return stats;
  }

  /**
   * 搜索营销任务 — 搜索关键词后对目标用户互动
   */
  function runSearchMarketing(platform, config) {
    config = config || {};
    var keywords      = config.keywords || [];
    var maxUsers      = config.maxUsers || 20;
    var followRate    = config.followRate || 30;
    var likeRate      = config.likeRate || 50;
    var commentRate   = config.commentRate || 20;
    var comments      = config.comments || ['不错', '互关一下'];

    var stats = { searched: 0, follows: 0, likes: 0, comments: 0, errors: 0 };

    if (!ensureApp(platform.packageName, true)) return stats;

    for (var k = 0; k < keywords.length; k++) {
      var keyword = keywords[k];
      Log.log('[Auto] 搜索关键词: ' + keyword);

      if (!platform.search(keyword)) {
        Log.log('[Auto] 搜索失败: ' + keyword);
        continue;
      }

      stats.searched++;
      sleep(1500);

      // 逐个处理搜索结果中的用户
      for (var u = 0; u < maxUsers; u++) {
        try {
          var rand = Math.random() * 100;

          if (rand < followRate) {
            if (platform.follow()) {
              stats.follows++;
              randomDelay(800, 500);
            }
          }

          if (rand < likeRate) {
            if (platform.like()) {
              stats.likes++;
              randomDelay(300, 200);
            }
          }

          if (platform.comment && rand < commentRate) {
            var text = comments[Math.floor(Math.random() * comments.length)];
            if (platform.comment(text)) {
              stats.comments++;
              randomDelay(500, 300);
            }
          }

          reportProgress(stats, 0, 0);

          // 下一个用户 (向下滚动)
          if (u < maxUsers - 1) {
            swipeUp();
            sleep(1000);
          }
        } catch (e) {
          stats.errors++;
        }
      }

      // 返回重新搜索下一个关键词
      if (k < keywords.length - 1) {
        goBack();
        sleep(500);
      }
    }

    Log.log('[Auto] 搜索营销完成: ' + JSON.stringify(stats));
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
    // 平台适配器
    Douyin:      Douyin,
    Kuaishou:    Kuaishou,
    Wechat:      Wechat,
    Xiaohongshu: Xiaohongshu,

    // 行为编排
    runFeedMarketing:   runFeedMarketing,
    runYanghao:         runYanghao,
    runSearchMarketing: runSearchMarketing,

    // 通用工具（也可单独使用）
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

    // 通信
    reportProgress: reportProgress,
    reportComplete: reportComplete,
  };
})();

// ==========================================================================
// 导出到全局作用域（供 ad-deeke 任务脚本 import）
// ==========================================================================
global.AppAutomation = AppAutomation;

Log.log('[AppAutomation] 多平台自动化框架已加载');
Log.log('[AppAutomation] 可用平台: Douyin, Kuaishou, Wechat, Xiaohongshu');
Log.log('[AppAutomation] 可用任务: runFeedMarketing, runYanghao, runSearchMarketing');
