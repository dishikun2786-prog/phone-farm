package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.BuildConfig
import com.phonefarm.client.data.local.SecurePreferences
import com.phonefarm.client.di.TokenHolder
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.network.LoginRequest
import com.phonefarm.client.network.PhoneLoginRequest
import com.phonefarm.client.network.SmsRequest
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LoginMode { PASSWORD, SMS }

data class LoginUiState(
    val mode: LoginMode = LoginMode.PASSWORD,
    val serverUrl: String = BuildConfig.API_BASE_URL,
    val account: String = "",
    val password: String = "",
    val phone: String = "",
    val smsCode: String = "",
    val smsCooldown: Int = 0,
    val smsSending: Boolean = false,
    val isLoading: Boolean = false,
    val isTestingConnection: Boolean = false,
    val errorMessage: String? = null,
    val serverStatus: ServerStatus = ServerStatus.UNKNOWN,
    val serverLatency: Long? = null,
    val serverVersion: String? = null
)

enum class ServerStatus { UNKNOWN, ONLINE, OFFLINE, CHECKING }

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val apiService: ApiService,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    companion object {
        const val KEY_SERVER_URL = "server_url"
    }

    fun setMode(mode: LoginMode) {
        _uiState.value = _uiState.value.copy(mode = mode, errorMessage = null)
    }

    fun updateServerUrl(url: String) {
        _uiState.value = _uiState.value.copy(serverUrl = url, errorMessage = null)
    }

    fun updateAccount(account: String) {
        _uiState.value = _uiState.value.copy(account = account, errorMessage = null)
    }

    fun updatePassword(password: String) {
        _uiState.value = _uiState.value.copy(password = password, errorMessage = null)
    }

    fun updatePhone(phone: String) {
        _uiState.value = _uiState.value.copy(phone = phone.take(11), errorMessage = null)
    }

    fun updateSmsCode(code: String) {
        _uiState.value = _uiState.value.copy(smsCode = code.take(6), errorMessage = null)
    }

    fun sendSmsCode() {
        viewModelScope.launch {
            val state = _uiState.value
            if (state.phone.length != 11) {
                _uiState.value = state.copy(errorMessage = "请输入正确的手机号")
                return@launch
            }
            if (state.smsCooldown > 0 || state.smsSending) return@launch

            _uiState.value = state.copy(smsSending = true, errorMessage = null)
            try {
                apiService.sendSms(SmsRequest(phone = state.phone, scene = "login"))
                _uiState.value = _uiState.value.copy(smsSending = false, smsCooldown = 60)
                // Countdown
                launch {
                    while (_uiState.value.smsCooldown > 0) {
                        delay(1000)
                        val cd = _uiState.value.smsCooldown
                        _uiState.value = _uiState.value.copy(smsCooldown = (cd - 1).coerceAtLeast(0))
                    }
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    smsSending = false,
                    errorMessage = "发送失败: ${e.message}"
                )
            }
        }
    }

    fun testConnection() {
        viewModelScope.launch {
            val url = _uiState.value.serverUrl
            if (url.isBlank()) {
                _uiState.value = _uiState.value.copy(errorMessage = "请先填写服务器地址")
                return@launch
            }
            _uiState.value = _uiState.value.copy(isTestingConnection = true, serverStatus = ServerStatus.CHECKING, errorMessage = null)
            try {
                val startTime = System.currentTimeMillis()
                val health = apiService.healthCheck()
                val elapsed = System.currentTimeMillis() - startTime
                _uiState.value = _uiState.value.copy(
                    isTestingConnection = false,
                    serverStatus = if (health.status == "ok") ServerStatus.ONLINE else ServerStatus.OFFLINE,
                    serverLatency = elapsed,
                    serverVersion = health.version
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isTestingConnection = false,
                    serverStatus = ServerStatus.OFFLINE,
                    errorMessage = "无法连接到服务器: ${e.message}"
                )
            }
        }
    }

    fun login(onSuccess: () -> Unit) {
        viewModelScope.launch {
            val state = _uiState.value
            _uiState.value = state.copy(isLoading = true, errorMessage = null)

            try {
                val response = if (state.mode == LoginMode.SMS) {
                    apiService.loginByPhone(PhoneLoginRequest(phone = state.phone, code = state.smsCode))
                } else {
                    apiService.login(LoginRequest(account = state.account, password = state.password))
                }

                TokenHolder.token = response.token
                TokenHolder.refreshToken = response.refreshToken ?: ""
                securePreferences.putString(KEY_SERVER_URL, state.serverUrl)

                _uiState.value = _uiState.value.copy(isLoading = false)
                onSuccess()
            } catch (e: retrofit2.HttpException) {
                val msg = when (e.code()) {
                    401 -> if (state.mode == LoginMode.SMS) "验证码错误或手机号未注册" else "账号或密码错误"
                    403 -> "账号已被禁用"
                    429 -> "请求过于频繁，请稍后再试"
                    else -> "服务器错误 (${e.code()})"
                }
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
            } catch (e: java.net.ConnectException) {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "无法连接服务器，请检查地址")
            } catch (e: java.net.SocketTimeoutException) {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "连接超时，请检查网络")
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "登录失败: ${e.message}")
            }
        }
    }
}

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit = {},
    onNavigateToPermissionGuide: () -> Unit = {},
    viewModel: LoginViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(60.dp))

        Surface(
            modifier = Modifier.size(72.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.primary
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("PF", style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text("PhoneFarm", style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onBackground)
        Text("远程手机群控自动化平台", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)

        Spacer(modifier = Modifier.height(24.dp))

        // Mode tabs
        TabRow(
            selectedTabIndex = if (state.mode == LoginMode.PASSWORD) 0 else 1,
            modifier = Modifier.fillMaxWidth()
        ) {
            Tab(selected = state.mode == LoginMode.PASSWORD, onClick = { viewModel.setMode(LoginMode.PASSWORD) }) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("密码登录")
                }
            }
            Tab(selected = state.mode == LoginMode.SMS, onClick = { viewModel.setMode(LoginMode.SMS) }) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Smartphone, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("短信登录")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Server URL
        OutlinedTextField(
            value = state.serverUrl,
            onValueChange = viewModel::updateServerUrl,
            label = { Text("服务器地址") },
            placeholder = { Text("https://phone.openedskill.com") },
            leadingIcon = { Icon(Icons.Default.Cloud, contentDescription = null) },
            trailingIcon = {
                ServerStatusIndicator(status = state.serverStatus, latency = state.serverLatency, version = state.serverVersion)
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.isLoading
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (state.mode == LoginMode.PASSWORD) {
            // Password login fields
            OutlinedTextField(
                value = state.account,
                onValueChange = viewModel::updateAccount,
                label = { Text("用户名 / 手机号") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::updatePassword,
                label = { Text("密码") },
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (passwordVisible) "隐藏密码" else "显示密码"
                        )
                    }
                },
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus(); viewModel.login(onLoginSuccess) }),
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            )
        } else {
            // SMS login fields
            OutlinedTextField(
                value = state.phone,
                onValueChange = viewModel::updatePhone,
                label = { Text("手机号") },
                placeholder = { Text("请输入11位手机号") },
                leadingIcon = { Icon(Icons.Default.Smartphone, contentDescription = null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = state.smsCode,
                    onValueChange = viewModel::updateSmsCode,
                    label = { Text("验证码") },
                    placeholder = { Text("6位验证码") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus(); viewModel.login(onLoginSuccess) }),
                    modifier = Modifier.weight(1f),
                    enabled = !state.isLoading
                )
                Button(
                    onClick = viewModel::sendSmsCode,
                    enabled = state.phone.length == 11 && state.smsCooldown == 0 && !state.smsSending && !state.isLoading,
                    modifier = Modifier.height(56.dp)
                ) {
                    if (state.smsSending) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text(if (state.smsCooldown > 0) "${state.smsCooldown}秒" else "获取验证码")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Error
        AnimatedVisibility(visible = state.errorMessage != null, enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()) {
            Card(modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null,
                        tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = state.errorMessage ?: "", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = { viewModel.login(onLoginSuccess) },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = MaterialTheme.shapes.medium,
            enabled = !state.isLoading && !state.isTestingConnection
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text("登录")
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = viewModel::testConnection,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = MaterialTheme.shapes.medium,
            enabled = state.serverUrl.isNotBlank() && !state.isLoading && !state.isTestingConnection
        ) {
            if (state.isTestingConnection) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text("测试服务器连接")
        }

        Spacer(modifier = Modifier.height(8.dp))

        TextButton(onClick = onNavigateToRegister) {
            Text("没有账号？立即注册")
        }

        Spacer(modifier = Modifier.height(40.dp))
    }
}

@Composable
private fun ServerStatusIndicator(status: ServerStatus, latency: Long?, version: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        val dotColor = when (status) {
            ServerStatus.ONLINE -> Success
            ServerStatus.OFFLINE -> Error
            ServerStatus.CHECKING -> MaterialTheme.colorScheme.outline
            ServerStatus.UNKNOWN -> MaterialTheme.colorScheme.outlineVariant
        }
        Surface(modifier = Modifier.size(8.dp), shape = MaterialTheme.shapes.extraSmall, color = dotColor) {}
        if (latency != null) {
            Spacer(modifier = Modifier.width(4.dp))
            Text("${latency}ms", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (version != null) {
            Spacer(modifier = Modifier.width(4.dp))
            Text("v$version", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
