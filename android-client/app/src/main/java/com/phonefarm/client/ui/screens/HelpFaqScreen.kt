package com.phonefarm.client.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

private data class FaqItem(val question: String, val answer: String)

private val faqs = listOf(
    FaqItem("如何激活设备？", "登录后进入激活页面，输入管理员提供的16位卡密即可完成激活。"),
    FaqItem("浮窗不显示怎么办？", "请确认已在系统设置中授予悬浮窗权限。路径：设置 → 应用 → PhoneFarm → 显示在其他应用上方。"),
    FaqItem("任务执行失败怎么办？", "检查目标APP是否已安装、网络是否正常、无障碍服务是否开启。可在诊断页面一键自检。"),
    FaqItem("如何更新脚本？", "打开脚本管理页面，点击「检查更新」按钮。有新版本时会自动下载。"),
    FaqItem("VLM AI 如何使用？", "在浮窗或VLM任务页面输入自然语言指令（如「打开抖音刷5个视频」），AI将自动执行。"),
    FaqItem("本地模型如何下载？", "进入设置 → 本地模型管理，选择模型后点击下载。推荐WiFi环境下下载（约1-2GB）。"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpFaqScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("帮助与常见问题") },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("返回") }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            faqs.forEach { faq ->
                var expanded by remember { mutableStateOf(false) }
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { expanded = !expanded },
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = faq.question,
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                text = if (expanded) "▲" else "▼",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        AnimatedVisibility(visible = expanded) {
                            Column {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = faq.answer,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
