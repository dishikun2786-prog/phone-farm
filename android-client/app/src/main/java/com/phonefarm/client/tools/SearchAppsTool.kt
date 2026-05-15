package com.phonefarm.client.tools

import android.content.Context
import android.content.pm.PackageManager
import net.sourceforge.pinyin4j.PinyinHelper
import net.sourceforge.pinyin4j.format.HanyuPinyinOutputFormat
import net.sourceforge.pinyin4j.format.HanyuPinyinToneType
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Smart app search with pinyin + semantic matching.
 *
 * Supports:
 * - Exact package name match
 * - Exact app name match
 * - Pinyin abbreviation (e.g. "wx" → 微信)
 * - Substring match on app name
 * - Category/semantic keyword match
 */
@Singleton
class SearchAppsTool @Inject constructor() : Tool {

    override val name = "search_apps"
    override val description = "Search installed apps by name, pinyin, or keyword. Returns matching app packages and names."

    override val parameters = listOf(
        ToolParam("query", ParamType.STRING, "Search query — app name, pinyin abbreviation, or keyword", required = true),
        ToolParam("max_results", ParamType.INTEGER, "Maximum results to return (default 5)", defaultValue = 5),
    )

    @Volatile
    private var cachedApps: List<AppInfo> = emptyList()

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val query = params["query"] as? String ?: return ToolResult.Error("query is required")
        val maxResults = (params["max_results"] as? Number)?.toInt() ?: 5

        if (query.isBlank()) return ToolResult.Error("query cannot be empty")

        val apps = getInstalledApps(context.androidContext)

        val results = search(query, apps).take(maxResults)

        return ToolResult.Success(
            data = results.map { mapOf(
                "package" to it.packageName,
                "name" to it.name,
                "score" to it.score,
            )},
            message = "Found ${results.size} app(s) matching \"$query\"",
        )
    }

    private fun getInstalledApps(ctx: Context): List<AppInfo> {
        if (cachedApps.isNotEmpty()) return cachedApps

        val pm = ctx.packageManager
        cachedApps = try {
            pm.getInstalledApplications(PackageManager.GET_META_DATA).map { info ->
                AppInfo(
                    packageName = info.packageName,
                    name = pm.getApplicationLabel(info).toString(),
                )
            }.filter { it.name.isNotBlank() }
                .distinctBy { it.packageName }
                .sortedBy { it.name.lowercase() }
        } catch (_: Exception) {
            emptyList()
        }
        return cachedApps
    }

    /** Force refresh the app cache (call when apps are installed/uninstalled). */
    fun invalidateCache() { cachedApps = emptyList() }

    data class AppInfo(val packageName: String, val name: String)
    data class ScoredApp(val packageName: String, val name: String, val score: Int)

    // ── Search logic ──

    private val categoryKeywords = mapOf(
        "外卖" to listOf("美团", "饿了么", "外卖", "百度外卖"),
        "点外卖" to listOf("美团", "饿了么"),
        "打车" to listOf("滴滴", "高德", "曹操", "T3", "花小猪"),
        "出行" to listOf("滴滴", "高德", "百度地图", "腾讯地图"),
        "地图" to listOf("高德", "百度地图", "腾讯地图"),
        "导航" to listOf("高德", "百度地图", "腾讯地图"),
        "购物" to listOf("淘宝", "京东", "拼多多", "苏宁", "蘑菇街", "咸鱼"),
        "聊天" to listOf("微信", "QQ", "钉钉", "飞书", "Telegram", "WhatsApp"),
        "视频" to listOf("抖音", "快手", "B站", "bilibili", "优酷", "腾讯视频", "爱奇艺", "YouTube"),
        "音乐" to listOf("QQ音乐", "网易云", "酷狗", "Spotify"),
        "社交" to listOf("微信", "QQ", "微博", "小红书", "豆瓣"),
        "支付" to listOf("支付宝", "微信"),
        "浏览器" to listOf("Chrome", "Firefox", "Edge", "UC"),
        "邮件" to listOf("Gmail", "QQ邮箱", "网易邮箱", "Outlook"),
        "日历" to listOf("日历", "Calendar", "Google日历"),
        "相机" to listOf("相机", "Camera"),
        "相册" to listOf("相册", "图库", "Photos", "Google相册"),
        "天气" to listOf("天气", "墨迹天气"),
        "笔记" to listOf("备忘录", "Keep", "Notion", "印象笔记", "OneNote"),
        "翻译" to listOf("Google翻译", "百度翻译", "有道", "DeepL"),
        "阅读" to listOf("微信读书", "Kindle", "番茄小说", "起点"),
        "AI" to listOf("豆包", "ChatGPT", "Copilot", "文心一言", "讯飞星火"),
    )

    data class SearchResult(val packageName: String, val name: String, val score: Int)

    fun search(query: String, apps: List<AppInfo>): List<ScoredApp> {
        val lower = query.lowercase().trim()

        return apps.map { app ->
            var score = 0

            // Exact package name match
            if (app.packageName.equals(query, ignoreCase = true)) score += 100
            // Exact app name match
            if (app.name.equals(query, ignoreCase = true)) score += 90
            // App name starts with query
            if (app.name.lowercase().startsWith(lower)) score += 70
            // App name contains query
            if (app.name.contains(query, ignoreCase = true)) score += 50

            // Pinyin abbreviation match (e.g. "wx" → "微信")
            val namePinyin = toPinyin(app.name)
            val abbrPinyin = toPinyinAbbreviation(app.name)
            if (abbrPinyin.equals(lower, ignoreCase = true)) score += 80
            if (abbrPinyin.startsWith(lower)) score += 60
            if (namePinyin.contains(lower, ignoreCase = true)) score += 40

            // Category keyword matching
            for ((category, keywords) in categoryKeywords) {
                if (category.contains(lower) || lower.contains(category)) {
                    for (kw in keywords) {
                        if (app.name.contains(kw, ignoreCase = true)) {
                            score += 30
                            break
                        }
                    }
                }
            }

            // Keyword substring match within app name (reverse)
            if (score == 0) {
                val lowered = app.name.lowercase()
                // Split query into words and check each
                for (word in lower.split("\\s+".toRegex())) {
                    if (word.length >= 2 && lowered.contains(word)) {
                        score += 20
                    }
                }
            }

            ScoredApp(packageName = app.packageName, name = app.name, score = score)
        }
            .filter { it.score > 0 }
            .sortedByDescending { it.score }
    }

    private val pinyinFormat = HanyuPinyinOutputFormat().apply {
        toneType = HanyuPinyinToneType.WITHOUT_TONE
    }

    private fun toPinyin(chinese: String): String {
        return try {
            PinyinHelper.toHanYuPinyinString(chinese, pinyinFormat, "", false) ?: chinese
        } catch (_: Exception) {
            chinese
        }
    }

    private fun toPinyinAbbreviation(chinese: String): String {
        return try {
            val sb = StringBuilder()
            for (c in chinese) {
                if (c.code > 0x4E00) {
                    val arr = PinyinHelper.toHanyuPinyinStringArray(c, pinyinFormat)
                    if (arr != null && arr.isNotEmpty()) {
                        sb.append(arr[0][0])
                    }
                } else {
                    sb.append(c)
                }
            }
            sb.toString()
        } catch (_: Exception) {
            chinese
        }
    }
}
