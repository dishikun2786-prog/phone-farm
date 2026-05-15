package com.phonefarm.client.ui.screens

import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.data.local.SecurePreferences
import com.phonefarm.client.network.ActivationRequest
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ActivationUiState(
    val codeChars: List<String> = List(16) { "" },
    val focusedIndex: Int = 0,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val errorMessage: String? = null,
    val activationInfo: ActivationInfo? = null
)

data class ActivationInfo(
    val activationCode: String = "",
    val deviceQuota: Int = 0,
    val expiresAt: String = "",
    val activatedDevices: Int = 0
)

@HiltViewModel
class ActivationViewModel @Inject constructor(
    private val apiService: ApiService,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    companion object {
        const val KEY_ACTIVATED = "device_activated"
        const val KEY_ACTIVATION_CODE = "activation_code"
    }

    private val _uiState = MutableStateFlow(ActivationUiState())
    val uiState: StateFlow<ActivationUiState> = _uiState.asStateFlow()

    private val focusRequesters = List(16) { FocusRequester() }

    fun onCodeCharChanged(index: Int, char: String) {
        val current = _uiState.value
        when {
            char.length > 1 -> {
                val sanitized = char.uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }
                val newChars = current.codeChars.toMutableList()
                var writeIndex = index
                for (c in sanitized) {
                    if (writeIndex < 16) {
                        newChars[writeIndex] = c.toString()
                        writeIndex++
                    }
                }
                _uiState.value = current.copy(
                    codeChars = newChars,
                    focusedIndex = minOf(writeIndex, 15),
                    errorMessage = null
                )
            }
            else -> {
                val sanitized = char.uppercase().take(1).filter { it in 'A'..'Z' || it in '0'..'9' }
                val newChars = current.codeChars.toMutableList()
                newChars[index] = sanitized
                val nextIndex = if (sanitized.isNotEmpty() && index < 15) index + 1 else index
                _uiState.value = current.copy(
                    codeChars = newChars,
                    focusedIndex = nextIndex,
                    errorMessage = null
                )
            }
        }
    }

    fun onCodeBackspace(index: Int) {
        val current = _uiState.value
        val newChars = current.codeChars.toMutableList()
        if (newChars[index].isNotEmpty()) {
            newChars[index] = ""
        } else if (index > 0) {
            newChars[index - 1] = ""
            _uiState.value = current.copy(codeChars = newChars, focusedIndex = index - 1, errorMessage = null)
            return
        }
        _uiState.value = current.copy(codeChars = newChars, errorMessage = null)
    }

    fun activate() {
        viewModelScope.launch {
            val state = _uiState.value
            val code = state.codeChars.joinToString("")

            if (code.length < 16) {
                _uiState.value = state.copy(errorMessage = "请输入完整的16位激活码")
                return@launch
            }

            _uiState.value = state.copy(isLoading = true, errorMessage = null)

            try {
                val deviceId = Settings.Secure.ANDROID_ID
                val response = apiService.activateDevice(
                    ActivationRequest(deviceId = deviceId, activationCode = code)
                )

                if (response.success) {
                    securePreferences.putString(KEY_ACTIVATED, "true")
                    securePreferences.putString(KEY_ACTIVATION_CODE, code)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isSuccess = true,
                        activationInfo = ActivationInfo(
                            activationCode = code,
                            deviceQuota = 0,
                            expiresAt = response.expiresAt?.toString() ?: "无限制",
                            activatedDevices = 0
                        )
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = response.message ?: "激活失败，请检查激活码是否正确"
                    )
                }
            } catch (e: retrofit2.HttpException) {
                val msg = when (e.code()) {
                    400 -> "激活码无效或格式错误"
                    404 -> "激活码不存在"
                    409 -> "该激活码已达到设备上限"
                    410 -> "激活码已过期，请联系管理员获取新码"
                    else -> "服务器错误 (${e.code()})"
                }
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
            } catch (e: java.net.ConnectException) {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "无法连接服务器，请检查网络")
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "激活失败: ${e.message}")
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivationScreen(
    onBack: () -> Unit,
    onActivationSuccess: () -> Unit,
    viewModel: ActivationViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设备激活") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "返回"
                        )
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(32.dp))

            if (!state.isSuccess) {
                // Activation code input UI
                Icon(
                    Icons.Default.Key,
                    contentDescription = null,
                    modifier = Modifier.size(56.dp),
                    tint = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "请输入16位激活码",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "激活码由管理员提供，用于授权设备接入平台",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(32.dp))

                // 4-group x 4-char code input
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    for (groupIndex in 0 until 4) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            for (charIndex in 0 until 4) {
                                val absoluteIndex = groupIndex * 4 + charIndex
                                CodeInputChar(
                                    value = state.codeChars[absoluteIndex],
                                    isFocused = state.focusedIndex == absoluteIndex,
                                    onValueChange = { viewModel.onCodeCharChanged(absoluteIndex, it) },
                                    onBackspace = { viewModel.onCodeBackspace(absoluteIndex) },
                                    enabled = !state.isLoading,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        // Visual separator between groups
                        if (groupIndex < 3) {
                            Spacer(modifier = Modifier.height(4.dp))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Error message
                AnimatedVisibility(
                    visible = state.errorMessage != null,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer
                        )
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = state.errorMessage ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = viewModel::clearError,
                                modifier = Modifier.size(24.dp)
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "关闭",
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Activate button
                val code = state.codeChars.joinToString("")
                Button(
                    onClick = viewModel::activate,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = MaterialTheme.shapes.medium,
                    enabled = code.length >= 16 && !state.isLoading
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text("激活设备")
                }
            } else {
                // Success state
                Spacer(modifier = Modifier.height(24.dp))

                Surface(
                    modifier = Modifier.size(72.dp),
                    shape = MaterialTheme.shapes.extraLarge,
                    color = Success.copy(alpha = 0.15f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = Success
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "激活成功",
                    style = MaterialTheme.typography.headlineMedium,
                    color = Success
                )

                Spacer(modifier = Modifier.height(24.dp))

                state.activationInfo?.let { info ->
                    ActivationInfoCard(info)
                }

                Spacer(modifier = Modifier.height(32.dp))

                Button(
                    onClick = onActivationSuccess,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = MaterialTheme.shapes.medium
                ) {
                    Text("继续")
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun CodeInputChar(
    value: String,
    isFocused: Boolean,
    onValueChange: (String) -> Unit,
    onBackspace: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(isFocused) {
        if (isFocused) {
            focusRequester.requestFocus()
        }
    }

    BasicTextField(
        value = value,
        onValueChange = { newValue ->
            if (newValue.isEmpty() && value.isEmpty()) {
                onBackspace()
            } else {
                onValueChange(newValue)
            }
        },
        modifier = modifier
            .focusRequester(focusRequester)
            .aspectRatio(1f),
        textStyle = MaterialTheme.typography.titleLarge.copy(
            textAlign = TextAlign.Center,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 22.sp,
            color = MaterialTheme.colorScheme.onSurface
        ),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
        singleLine = true,
        enabled = enabled,
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        decorationBox = { innerTextField ->
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.fillMaxSize()
            ) {
                val borderColor = when {
                    isFocused -> MaterialTheme.colorScheme.primary
                    value.isNotEmpty() -> MaterialTheme.colorScheme.outline
                    else -> MaterialTheme.colorScheme.outlineVariant
                }

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    shape = MaterialTheme.shapes.small,
                    color = if (isFocused)
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                    else
                        MaterialTheme.colorScheme.surface,
                    border = if (isFocused)
                        androidx.compose.foundation.BorderStroke(2.dp, borderColor)
                    else
                        androidx.compose.foundation.BorderStroke(1.dp, borderColor)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        innerTextField()
                    }
                }
            }
        }
    )
}

@Composable
private fun ActivationInfoCard(info: ActivationInfo) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "激活信息",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(12.dp))
            InfoRow("激活码", info.activationCode)
            InfoRow("设备配额", "${info.activatedDevices}/${info.deviceQuota}")
            InfoRow("有效期至", info.expiresAt)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium
        )
    }
}
