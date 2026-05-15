package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.network.ApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TicketItem(
    val id: String,
    val ticketNumber: String,
    val subject: String,
    val category: String,
    val status: String,
    val updatedAt: String,
)

data class SupportUiState(
    val tickets: List<TicketItem> = emptyList(),
    val loading: Boolean = false,
    val error: String = "",
    val showCreateForm: Boolean = false,
    val submittingTicket: Boolean = false,
    val submitError: String = "",
)

@HiltViewModel
class SupportViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SupportUiState())
    val uiState: StateFlow<SupportUiState> = _uiState.asStateFlow()

    init { loadTickets() }

    private fun loadTickets() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true)
            try {
                val response = apiService.getSupportTickets()
                _uiState.value = _uiState.value.copy(
                    tickets = response.tickets,
                    loading = false,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "加载失败", loading = false)
            }
        }
    }

    fun showCreateForm() { _uiState.value = _uiState.value.copy(showCreateForm = true) }
    fun hideCreateForm() { _uiState.value = _uiState.value.copy(showCreateForm = false, submitError = "") }

    fun createTicket(subject: String, category: String, message: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(submittingTicket = true)
            try {
                apiService.createSupportTicket(subject, category, message, "normal")
                _uiState.value = _uiState.value.copy(submittingTicket = false, showCreateForm = false)
                loadTickets()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    submittingTicket = false,
                    submitError = e.message ?: "提交失败",
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportCenterScreen(
    onBack: () -> Unit,
    viewModel: SupportViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var newSubject by remember { mutableStateOf("") }
    var newCategory by remember { mutableStateOf("technical") }
    var newMessage by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("技术支持") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { padding ->
        if (state.showCreateForm) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("提交工单", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

                OutlinedTextField(value = newSubject, onValueChange = { newSubject = it }, label = { Text("主题") }, modifier = Modifier.fillMaxWidth())

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("technical" to "技术", "billing" to "账单", "account" to "账户", "activation" to "激活", "other" to "其他").forEach { (value, label) ->
                        FilterChip(selected = newCategory == value, onClick = { newCategory = value }, label = { Text(label) })
                    }
                }

                OutlinedTextField(value = newMessage, onValueChange = { newMessage = it }, label = { Text("描述") }, modifier = Modifier.fillMaxWidth(), minLines = 4)

                if (state.submitError.isNotEmpty()) {
                    Text(state.submitError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.hideCreateForm() }) { Text("取消") }
                    Button(
                        onClick = { viewModel.createTicket(newSubject, newCategory, newMessage) },
                        enabled = newSubject.isNotBlank() && newMessage.isNotBlank() && !state.submittingTicket
                    ) {
                        if (state.submittingTicket) CircularProgressIndicator(modifier = Modifier.size(16.dp))
                        else Text("提交")
                    }
                }
            }
        } else if (state.loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("我的工单", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Button(onClick = { viewModel.showCreateForm() }) { Text("新建工单") }
                    }
                }

                if (state.tickets.isEmpty()) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            Text("暂无工单", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                items(state.tickets) { ticket ->
                    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text(ticket.ticketNumber, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                val statusLabel = when (ticket.status) {
                                    "open" -> "待处理"
                                    "in_progress" -> "处理中"
                                    "waiting" -> "等待回复"
                                    "closed" -> "已关闭"
                                    else -> ticket.status
                                }
                                SuggestionChip(onClick = {}, label = { Text(statusLabel) })
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(ticket.subject, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            Text(ticket.updatedAt, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
