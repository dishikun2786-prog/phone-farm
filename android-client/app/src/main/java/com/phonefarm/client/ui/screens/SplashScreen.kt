package com.phonefarm.client.ui.screens

import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.data.local.SecurePreferences
import com.phonefarm.client.di.TokenHolder
import com.phonefarm.client.ui.theme.Primary
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class SplashDestination {
    LOGIN, PERMISSION_GUIDE, HOME, ACTIVATION
}

data class SplashUiState(
    val progressMessage: String = "正在检查运行环境...",
    val destination: SplashDestination? = null,
    val showContent: Boolean = false
)

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val securePreferences: SecurePreferences,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    companion object {
        const val KEY_ACTIVATED = "device_activated"
    }

    private val _uiState = MutableStateFlow(SplashUiState())
    val uiState: StateFlow<SplashUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            delay(200)
            _uiState.value = _uiState.value.copy(showContent = true)

            // Step 1: Check activation
            _uiState.value = _uiState.value.copy(progressMessage = "正在检查激活状态...")
            delay(400)
            val isActivated = checkActivation()

            if (!isActivated) {
                _uiState.value = _uiState.value.copy(
                    destination = SplashDestination.ACTIVATION
                )
                return@launch
            }

            // Step 2: Check permissions
            _uiState.value = _uiState.value.copy(progressMessage = "正在检查权限状态...")
            delay(400)
            val hasPermissions = checkPermissions()

            if (!hasPermissions) {
                _uiState.value = _uiState.value.copy(
                    destination = SplashDestination.PERMISSION_GUIDE
                )
                return@launch
            }

            // Step 3: Check login
            _uiState.value = _uiState.value.copy(progressMessage = "正在检查登录状态...")
            delay(400)
            val isLoggedIn = checkLogin()

            delay(300)

            _uiState.value = _uiState.value.copy(
                destination = if (isLoggedIn) SplashDestination.HOME else SplashDestination.LOGIN
            )
        }
    }

    private fun checkActivation(): Boolean {
        val activated = securePreferences.getString(KEY_ACTIVATED)
        return activated == "true"
    }

    private fun checkPermissions(): Boolean {
        val accessibilityEnabled = isAccessibilityServiceEnabled()
        val overlayGranted = Settings.canDrawOverlays(appContext)
        val batteryWhitelisted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(appContext.packageName)
        } else true
        return accessibilityEnabled && overlayGranted && batteryWhitelisted
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val serviceName = "${appContext.packageName}/.service.PhoneFarmAccessibilityService"
        val enabledServices = Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabledServices.split(':').any { it.equals(serviceName, ignoreCase = true) }
    }

    private fun checkLogin(): Boolean {
        return TokenHolder.token.isNotBlank()
    }
}

@Composable
fun SplashScreen(
    onNavigate: (SplashDestination) -> Unit,
    viewModel: SplashViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.destination) {
        uiState.destination?.let { dest ->
            delay(200) // Brief pause for visual transition
            onNavigate(dest)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo area: 120dp placeholder
            val scaleAnim by animateFloatAsState(
                targetValue = if (uiState.showContent) 1f else 0.8f,
                animationSpec = tween(600, easing = FastOutSlowInEasing),
                label = "logoScale"
            )
            val alphaAnim by animateFloatAsState(
                targetValue = if (uiState.showContent) 1f else 0f,
                animationSpec = tween(500),
                label = "logoAlpha"
            )

            Surface(
                modifier = Modifier
                    .size(120.dp)
                    .scale(scaleAnim)
                    .alpha(alphaAnim),
                shape = MaterialTheme.shapes.extraLarge,
                color = Primary,
                shadowElevation = 8.dp
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = "PF",
                        style = MaterialTheme.typography.displayLarge,
                        color = MaterialTheme.colorScheme.onPrimary,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // App name
            Text(
                text = "PhoneFarm",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.alpha(alphaAnim)
            )

            Spacer(modifier = Modifier.height(48.dp))

            // Progress indicator
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                color = Primary,
                strokeWidth = 2.5.dp
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Status message
            Text(
                text = uiState.progressMessage,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }

        // Version text at bottom
        Text(
            text = "v1.0.0",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 32.dp)
        )
    }
}
