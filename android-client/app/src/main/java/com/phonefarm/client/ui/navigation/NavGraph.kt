package com.phonefarm.client.ui.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.phonefarm.client.ui.components.FabAction
import com.phonefarm.client.ui.components.QuickActionFab
import com.phonefarm.client.ui.screens.*

object Routes {
    const val SPLASH = "splash"
    const val ACTIVATION = "activation"
    const val PERMISSION_GUIDE = "permissionGuide"
    const val MAIN = "main"
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val VLM_AGENT = "vlmAgent"
    const val SCRIPT_MANAGER = "scriptManager"
    const val SCRIPT_EDITOR = "scriptEditor/{scriptId}"
    const val TASK_LOG = "taskLog"
    const val EPISODE_REPLAY = "episodeReplay/{episodeId}"
    const val MODEL_MANAGER = "modelManager"
    const val ACCOUNT_MANAGER = "accountManager"
    const val DIAGNOSTICS = "diagnostics"
    const val NOTIFICATIONS = "notifications"
    const val LOCAL_CRON = "localCron"
    const val DATA_USAGE = "dataUsage"
    const val PRIVACY = "privacy"
    const val HELP = "help"
    const val ASSISTANT = "assistant"
    const val ACCOUNT_CENTER = "accountCenter"
    const val UPGRADE_PLAN = "upgradePlan"
    const val USAGE_STATS = "usageStats"
    const val SUPPORT_CENTER = "supportCenter"
    const val AGENT_DASHBOARD = "agentDashboard"

    fun episodeReplay(id: String) = "episodeReplay/$id"
    fun scriptEditor(id: String) = "scriptEditor/$id"
}

private const val T_DUR = 300

@Composable
fun NavGraph(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.SPLASH) {

        // ==============================
        // Onboarding flow
        // ==============================
        composable(Routes.SPLASH) {
            SplashScreen(
                onNavigate = { destination ->
                    val route = when (destination) {
                        SplashDestination.ACTIVATION -> Routes.ACTIVATION
                        SplashDestination.PERMISSION_GUIDE -> Routes.PERMISSION_GUIDE
                        SplashDestination.LOGIN -> Routes.LOGIN
                        SplashDestination.HOME -> Routes.MAIN
                    }
                    navController.navigate(route) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.ACTIVATION) {
            ActivationScreen(
                onBack = { navController.popBackStack() },
                onActivationSuccess = {
                    navController.navigate(Routes.PERMISSION_GUIDE) {
                        popUpTo(Routes.ACTIVATION) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.PERMISSION_GUIDE) {
            PermissionGuideScreen(
                onAllComplete = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                },
            )
        }

        // ==============================
        // Main scaffold with 3-tab bottom nav
        // ==============================
        composable(Routes.MAIN) {
            var currentTab by remember { mutableStateOf(BottomTab.HOME) }

            MainScaffold(
                currentTab = currentTab,
                onTabSelected = { currentTab = it },
                topBarTitle = when (currentTab) {
                    BottomTab.HOME -> "PhoneFarm"
                    BottomTab.TASKS -> "任务中心"
                    BottomTab.SETTINGS -> "设置"
                },
                topBarActions = {
                    when (currentTab) {
                        BottomTab.HOME -> {
                            IconButton(onClick = { navController.navigate(Routes.NOTIFICATIONS) }) {
                                Icon(Icons.Default.Notifications, contentDescription = "通知")
                            }
                        }
                        BottomTab.TASKS -> {
                            IconButton(onClick = { navController.navigate(Routes.TASK_LOG) }) {
                                Icon(Icons.Default.History, contentDescription = "日志")
                            }
                        }
                        BottomTab.SETTINGS -> {
                            // No action
                        }
                    }
                },
                floatingActionButton = {
                    if (currentTab == BottomTab.HOME) {
                        QuickActionFab(
                            modifier = Modifier.padding(bottom = 64.dp, end = 16.dp),
                            actions = listOf(
                                FabAction(
                                    label = "AI Assistant",
                                    color = androidx.compose.ui.graphics.Color(0xFF1565C0),
                                    onClick = {
                                        val ctx = navController.context
                                        ctx.startActivity(android.content.Intent(ctx, com.phonefarm.client.assistant.AssistantActivity::class.java))
                                    },
                                    icon = Icons.Default.Psychology,
                                ),
                                FabAction(
                                    label = "VLM Agent",
                                    color = androidx.compose.ui.graphics.Color(0xFF7C4DFF),
                                    onClick = { navController.navigate(Routes.VLM_AGENT) },
                                    icon = Icons.Default.Tungsten,
                                ),
                                FabAction(
                                    label = "执行脚本",
                                    color = androidx.compose.ui.graphics.Color(0xFF00BCD4),
                                    onClick = { navController.navigate(Routes.SCRIPT_MANAGER) },
                                    icon = Icons.Default.PlayArrow,
                                ),
                                FabAction(
                                    label = "批量操作",
                                    color = androidx.compose.ui.graphics.Color(0xFF4CAF50),
                                    onClick = { navController.navigate(Routes.TASK_LOG) },
                                    icon = Icons.Default.List,
                                ),
                            ),
                        )
                    }
                },
            ) { padding ->
                androidx.compose.animation.AnimatedContent(
                    targetState = currentTab,
                    modifier = Modifier.padding(padding),
                    transitionSpec = {
                        fadeIn(tween(T_DUR)) togetherWith fadeOut(tween(T_DUR / 2))
                    },
                ) { tab ->
                    when (tab) {
                        BottomTab.HOME -> HomeScreen(
                            onDeviceClick = { /* device detail */ },
                            onNavigateToNotifications = { navController.navigate(Routes.NOTIFICATIONS) },
                            onNavigateToTaskLog = { navController.navigate(Routes.TASK_LOG) },
                        )
                        BottomTab.TASKS -> TaskHubScreen(
                            onNavigateToVlmAgent = { navController.navigate(Routes.VLM_AGENT) },
                            onNavigateToScriptManager = { navController.navigate(Routes.SCRIPT_MANAGER) },
                            onNavigateToTaskLog = { navController.navigate(Routes.TASK_LOG) },
                        )
                        BottomTab.SETTINGS -> SettingsScreen(
                            onNavigateToModelManager = { navController.navigate(Routes.MODEL_MANAGER) },
                            onNavigateToPrivacyPolicy = { navController.navigate(Routes.PRIVACY) },
                            onNavigateToDiagnostics = { navController.navigate(Routes.DIAGNOSTICS) },
                            onNavigateToNotifications = { navController.navigate(Routes.NOTIFICATIONS) },
                            onNavigateToDataUsage = { navController.navigate(Routes.DATA_USAGE) },
                            onNavigateToHelp = { navController.navigate(Routes.HELP) },
                        )
                    }
                }
            }
        }

        // ==============================
        // Pushed screens
        // ==============================
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Routes.MAIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onNavigateToRegister = { navController.navigate(Routes.REGISTER) },
                onNavigateToPermissionGuide = {
                    navController.navigate(Routes.PERMISSION_GUIDE) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.REGISTER) {
            RegisterScreen(
                onBack = { navController.popBackStack() },
                onRegisterSuccess = {
                    navController.navigate(Routes.MAIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.VLM_AGENT) {
            VlmAgentScreen(
                onBack = { navController.popBackStack() },
                onStopAndCompile = {
                    navController.navigate(Routes.scriptEditor("compiled")) {
                        popUpTo(Routes.VLM_AGENT) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.SCRIPT_MANAGER) {
            ScriptManagerScreen(
                onBack = { navController.popBackStack() },
                onExecuteScript = { id -> navController.navigate(Routes.scriptEditor(id)) },
            )
        }

        composable(Routes.TASK_LOG) {
            TaskLogScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.MODEL_MANAGER) {
            ModelManagerScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.ACCOUNT_MANAGER) {
            AccountManagerScreen(
                onBack = { navController.popBackStack() },
                onAddAccount = { /* platform login flow */ },
            )
        }

        composable(
            route = Routes.EPISODE_REPLAY,
            arguments = listOf(navArgument("episodeId") { type = NavType.StringType }),
        ) { entry ->
            val id = entry.arguments?.getString("episodeId") ?: ""
            EpisodeReplayScreen(episodeId = id, onBack = { navController.popBackStack() }, onCompile = {
                navController.navigate(Routes.scriptEditor(id)) { popUpTo(Routes.EPISODE_REPLAY) { inclusive = true } }
            })
        }

        composable(
            route = Routes.SCRIPT_EDITOR,
            arguments = listOf(navArgument("scriptId") { type = NavType.StringType }),
        ) { entry ->
            val id = entry.arguments?.getString("scriptId") ?: ""
            ScriptEditorScreen(scriptId = id, onBack = { navController.popBackStack() })
        }

        composable(Routes.DIAGNOSTICS) {
            DiagnosticsScreen(
                onBack = { navController.popBackStack() },
                onFixAction = { actionId ->
                    when (actionId) {
                        "accessibility", "permissions" -> {
                            navController.navigate(Routes.PERMISSION_GUIDE)
                        }
                    }
                },
            )
        }

        composable(Routes.NOTIFICATIONS) {
            NotificationsCenterScreen(onBack = { navController.popBackStack() }, onNavigateToAction = { /* action */ })
        }

        composable(Routes.LOCAL_CRON) {
            LocalCronSchedulerScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.DATA_USAGE) {
            DataUsageScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.PRIVACY) {
            PrivacyPolicyScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.HELP) {
            HelpFaqScreen(onBack = { navController.popBackStack() })
        }

        // ── Portal pages ──
        composable(Routes.ACCOUNT_CENTER) {
            AccountCenterScreen(
                onBack = { navController.popBackStack() },
                onNavigate = { id ->
                    when (id) {
                        "plans" -> navController.navigate(Routes.UPGRADE_PLAN)
                        "usage" -> navController.navigate(Routes.USAGE_STATS)
                        "support" -> navController.navigate(Routes.SUPPORT_CENTER)
                        "dashboard" -> navController.navigate(Routes.AGENT_DASHBOARD)
                    }
                },
            )
        }

        composable(Routes.UPGRADE_PLAN) {
            UpgradePlanScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.USAGE_STATS) {
            UsageStatsScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.SUPPORT_CENTER) {
            SupportCenterScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.AGENT_DASHBOARD) {
            AgentDashboardScreen(onBack = { navController.popBackStack() })
        }
    }
}
