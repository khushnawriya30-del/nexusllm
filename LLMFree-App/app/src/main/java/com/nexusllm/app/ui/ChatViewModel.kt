package com.nexusllm.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.nexusllm.app.data.ChatEvent
import com.nexusllm.app.data.ChatMessageDto
import com.nexusllm.app.data.Conversation
import com.nexusllm.app.data.ConversationStore
import com.nexusllm.app.data.Message
import com.nexusllm.app.data.ModelEntry
import com.nexusllm.app.data.NexusClient
import com.nexusllm.app.data.Settings
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class UiState(
    val loadingSettings: Boolean = true,
    val baseUrl: String = "",
    val apiKey: String = "",
    val isConfigured: Boolean = false,
    val testing: Boolean = false,
    val connectionError: String? = null,
    val models: List<ModelEntry> = emptyList(),
    val conversations: List<Conversation> = emptyList(),
    val currentId: String? = null,
    val selectedModel: String = "auto",
    val thinkingEnabled: Boolean = false,
    val thinkingIntensity: String = "medium",
    val isStreaming: Boolean = false,
) {
    val current: Conversation? get() = conversations.firstOrNull { it.id == currentId }
    val selectedSupportsReasoning: Boolean
        get() = models.firstOrNull { it.id == selectedModel }?.supportsReasoning == true
}

class ChatViewModel(app: Application) : AndroidViewModel(app) {
    private val settings = Settings(app)
    private val store = ConversationStore(app)

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    private var streamJob: Job? = null

    init {
        viewModelScope.launch {
            val base = settings.baseUrl.first()
            val key = settings.apiKey.first()
            val lastModel = settings.lastModel.first()
            val convs = store.conversations.first()
            _state.value = _state.value.copy(
                loadingSettings = false,
                baseUrl = base,
                apiKey = key,
                isConfigured = base.isNotBlank() && key.isNotBlank(),
                conversations = convs,
                selectedModel = lastModel.ifBlank { "auto" },
            )
            if (base.isNotBlank() && key.isNotBlank()) refreshModels()
        }
    }

    private fun client(): NexusClient =
        NexusClient(_state.value.baseUrl, _state.value.apiKey)

    fun saveSettings(baseUrl: String, apiKey: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(testing = true, connectionError = null)
            settings.save(baseUrl, apiKey)
            val normBase = Settings.normalizeBaseUrl(baseUrl)
            _state.value = _state.value.copy(baseUrl = normBase, apiKey = apiKey.trim())
            try {
                val models = client().listModels()
                _state.value = _state.value.copy(
                    testing = false,
                    isConfigured = true,
                    models = models,
                    connectionError = null,
                    selectedModel = pickDefaultModel(models, _state.value.selectedModel),
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    testing = false,
                    isConfigured = false,
                    connectionError = e.message ?: "Could not reach the endpoint",
                )
            }
        }
    }

    fun refreshModels() {
        viewModelScope.launch {
            try {
                val models = client().listModels()
                _state.value = _state.value.copy(
                    models = models,
                    isConfigured = true,
                    connectionError = null,
                    selectedModel = pickDefaultModel(models, _state.value.selectedModel),
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(connectionError = e.message)
            }
        }
    }

    private fun pickDefaultModel(models: List<ModelEntry>, current: String): String {
        if (models.any { it.id == current }) return current
        return models.firstOrNull { it.id == "auto" }?.id
            ?: models.firstOrNull()?.id ?: "auto"
    }

    fun selectModel(id: String) {
        _state.value = _state.value.copy(
            selectedModel = id,
            thinkingEnabled = _state.value.thinkingEnabled &&
                (models().firstOrNull { it.id == id }?.supportsReasoning == true),
        )
        viewModelScope.launch { settings.setLastModel(id) }
    }

    private fun models() = _state.value.models

    fun setThinking(enabled: Boolean) { _state.value = _state.value.copy(thinkingEnabled = enabled) }
    fun setIntensity(v: String) { _state.value = _state.value.copy(thinkingIntensity = v) }

    fun newChat() { _state.value = _state.value.copy(currentId = null) }

    fun selectChat(id: String) { _state.value = _state.value.copy(currentId = id) }

    fun deleteChat(id: String) {
        val list = _state.value.conversations.filterNot { it.id == id }
        val newCurrent = if (_state.value.currentId == id) null else _state.value.currentId
        _state.value = _state.value.copy(conversations = list, currentId = newCurrent)
        persist()
    }

    private fun persist() {
        viewModelScope.launch { store.save(_state.value.conversations) }
    }

    fun stopStreaming() {
        streamJob?.cancel()
        streamJob = null
        _state.value = _state.value.copy(isStreaming = false)
        persist()
    }

    fun send(text: String) {
        val content = text.trim()
        if (content.isEmpty() || _state.value.isStreaming) return
        if (!_state.value.isConfigured) return

        val model = _state.value.selectedModel
        // Ensure there is a current conversation.
        var convs = _state.value.conversations.toMutableList()
        var current = _state.value.current
        if (current == null) {
            current = Conversation(title = content.take(40), model = model)
            convs.add(0, current)
        }
        val conv = current
        conv.messages.add(Message(role = "user", content = content))
        val assistant = Message(role = "assistant", content = "", reasoning = "")
        conv.messages.add(assistant)
        conv.model = model
        conv.updatedAt = System.currentTimeMillis()
        if (conv.title == "New chat") conv.title = content.take(40)

        _state.value = _state.value.copy(
            conversations = convs,
            currentId = conv.id,
            isStreaming = true,
        )

        val history = conv.messages
            .dropLast(1) // exclude the empty assistant placeholder
            .map { ChatMessageDto(role = it.role, content = it.content) }

        streamJob = viewModelScope.launch {
            val sb = StringBuilder()
            val rb = StringBuilder()
            try {
                client().streamChat(
                    model = model,
                    messages = history,
                    thinkingEnabled = _state.value.thinkingEnabled,
                    thinkingIntensity = _state.value.thinkingIntensity,
                ).collect { ev ->
                    when (ev) {
                        is ChatEvent.Content -> { sb.append(ev.text); updateAssistant(conv.id, assistant.id, sb.toString(), rb.toString()) }
                        is ChatEvent.Reasoning -> { rb.append(ev.text); updateAssistant(conv.id, assistant.id, sb.toString(), rb.toString()) }
                        is ChatEvent.Failure -> {
                            val msg = if (sb.isEmpty()) "⚠️ ${ev.message}" else sb.toString()
                            updateAssistant(conv.id, assistant.id, msg, rb.toString())
                        }
                        ChatEvent.Done -> { /* handled below */ }
                    }
                }
            } catch (e: Exception) {
                updateAssistant(conv.id, assistant.id,
                    sb.toString().ifEmpty { "⚠️ ${e.message}" }, rb.toString())
            } finally {
                _state.value = _state.value.copy(isStreaming = false)
                persist()
            }
        }
    }

    private fun updateAssistant(convId: String, msgId: String, content: String, reasoning: String) {
        val convs = _state.value.conversations.map { c ->
            if (c.id != convId) c else {
                val msgs = c.messages.map { m ->
                    if (m.id == msgId) m.copy(content = content, reasoning = reasoning) else m
                }.toMutableList()
                c.copy(messages = msgs, updatedAt = System.currentTimeMillis())
            }
        }
        _state.value = _state.value.copy(conversations = convs)
    }
}
