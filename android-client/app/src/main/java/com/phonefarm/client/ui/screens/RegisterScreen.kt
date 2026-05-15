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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.di.TokenHolder
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.network.RegisterRequest
import com.phonefarm.client.network.SmsRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RegisterUiState(
    val step: RegisterStep = RegisterStep.PHONE,
    val phone: String = "",
    val smsCode: String = "",
    val username: String = "",
    val password: String = "",
    val smsCooldown: Int = 0,
    val smsSending: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

enum class RegisterStep { PHONE, INFO }

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    fun updatePhone(phone: String) {
        _uiState.value = _uiState.value.copy(phone = phone.take(11), errorMessage = null)
    }

    fun updateSmsCode(code: String) {
        _uiState.value = _uiState.value.copy(smsCode = code.take(6), errorMessage = null)
    }

    fun updateUsername(username: String) {
        _uiState.value = _uiState.value.copy(username = username.take(32), errorMessage = null)
    }

    fun updatePassword(password: String) {
        _uiState.value = _uiState.value.copy(password = password.take(128), errorMessage = null)
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
                apiService.sendSms(SmsRequest(phone = state.phone, scene = "register"))
                _uiState.value = _uiState.value.copy(smsSending = false, smsCooldown = 60)
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

    fun goToInfoStep() {
        if (_uiState.value.smsCode.length != 6) {
            _uiState.value = _uiState.value.copy(errorMessage = "请输入6位验证码")
            return
        }
        _uiState.value = _uiState.value.copy(step = RegisterStep.INFO, errorMessage = null)
    }

    fun goBackToPhone() {
        _uiState.value = _uiState.value.copy(step = RegisterStep.PHONE, errorMessage = null)
    }

    fun register(onSuccess: () -> Unit) {
        viewModelScope.launch {
            val state = _uiState.value
            _uiState.value = state.copy(isLoading = true, errorMessage = null)

            try {
                val response = apiService.register(
                    RegisterRequest(
                        phone = state.phone,
                        code = state.smsCode,
                        username = state.username.ifBlank { null },
                        password = state.password.ifBlank { null },
                    )
                )

                TokenHolder.token = response.token
                TokenHolder.refreshToken = response.refreshToken ?: ""

                _uiState.value = _uiState.value.copy(isLoading = false)
                onSuccess()
            } catch (e: retrofit2.HttpException) {
                val msg = when (e.code()) {
                    409 -> "该手机号已注册"
                    400 -> "验证码错误或已过期"
                    429 -> "请求过于频繁，请稍后再试"
                    else -> "服务器错误 (${e.code()})"
                }
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "注册失败: ${e.message}"
                )
            }
        }
    }
}

@Composable
fun RegisterScreen(
    onBack: () -> Unit,
    onRegisterSuccess: () -> Unit,
    viewModel: RegisterViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(40.dp))

        // Back button
        Row(modifier = Modifier.fillMaxWidth()) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "返回")
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text("创建账号", style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onBackground)
        Spacer(modifier = Modifier.height(4.dp))
        Text(if (state.step == RegisterStep.PHONE) "手机号注册" else "设置账号信息",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)

        Spacer(modifier = Modifier.height(24.dp))

        // Step indicators
        Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            StepDot(number = 1, active = state.step == RegisterStep.PHONE, completed = state.step == RegisterStep.INFO)
            Divider(modifier = Modifier.width(32.dp).height(2.dp))
            StepDot(number = 2, active = state.step == RegisterStep.INFO, completed = false)
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (state.step == RegisterStep.PHONE) {
            // Phone + SMS
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
                    keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus(); viewModel.goToInfoStep() }),
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
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = viewModel::goToInfoStep,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                enabled = state.smsCode.length == 6 && !state.isLoading
            ) {
                Text("下一步")
            }
        } else {
            // Info step
            OutlinedTextField(
                value = state.username,
                onValueChange = viewModel::updateUsername,
                label = { Text("用户名（选填）") },
                placeholder = { Text("2-32个字符，不填自动生成") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::updatePassword,
                label = { Text("密码（选填）") },
                placeholder = { Text("8-128位，不填则短信登录") },
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text("未设置密码可使用短信验证码直接登录",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth())

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = { viewModel.register(onRegisterSuccess) },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                enabled = !state.isLoading
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text("完成注册")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = viewModel::goBackToPhone) {
                Text("返回修改手机号")
            }
        }

        // Error
        AnimatedVisibility(visible = state.errorMessage != null, enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()) {
            Card(modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null,
                        tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(state.errorMessage ?: "", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        Spacer(modifier = Modifier.height(40.dp))
    }
}

@Composable
private fun StepDot(number: Int, active: Boolean, completed: Boolean) {
    val bgColor = when {
        completed -> MaterialTheme.colorScheme.primary
        active -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val textColor = when {
        completed || active -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        modifier = Modifier.size(32.dp),
        shape = MaterialTheme.shapes.extraLarge,
        color = bgColor
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (completed) {
                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp), tint = textColor)
            } else {
                Text("$number", style = MaterialTheme.typography.labelLarge, color = textColor)
            }
        }
    }
}
