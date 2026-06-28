package com.nexusllm.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// ---- /v1/models ----------------------------------------------------------

@Serializable
data class ModelsResponse(
    val data: List<ModelEntry> = emptyList(),
)

@Serializable
data class ModelEntry(
    val id: String,
    @SerialName("owned_by") val ownedBy: String? = null,
    @SerialName("x-nexusllm") val meta: ModelMeta? = null,
) {
    /** True if this model exposes the "reasoning" capability (thinking toggle). */
    val supportsReasoning: Boolean
        get() = meta?.capabilities?.contains("reasoning") == true
}

@Serializable
data class ModelMeta(
    val description: String? = null,
    val capabilities: List<String> = emptyList(),
    @SerialName("context_window") val contextWindow: Int? = null,
)

// ---- /v1/chat/completions request ----------------------------------------

@Serializable
data class ChatMessageDto(
    val role: String,
    val content: String,
)

@Serializable
data class ChatRequest(
    val model: String,
    val messages: List<ChatMessageDto>,
    val stream: Boolean,
    @SerialName("thinking_enabled") val thinkingEnabled: Boolean? = null,
    @SerialName("thinking_intensity") val thinkingIntensity: String? = null,
)

// ---- streaming chunk (OpenAI SSE) ----------------------------------------

@Serializable
data class StreamChunk(
    val choices: List<StreamChoice> = emptyList(),
)

@Serializable
data class StreamChoice(
    val delta: StreamDelta? = null,
    @SerialName("finish_reason") val finishReason: String? = null,
)

@Serializable
data class StreamDelta(
    val role: String? = null,
    val content: String? = null,
    // NexusLLM / NVIDIA emit reasoning tokens separately during "thinking".
    @SerialName("reasoning_content") val reasoningContent: String? = null,
    val reasoning: String? = null,
)

// Raw error body passthrough (best-effort).
@Serializable
data class ErrorEnvelope(val error: JsonObject? = null)
