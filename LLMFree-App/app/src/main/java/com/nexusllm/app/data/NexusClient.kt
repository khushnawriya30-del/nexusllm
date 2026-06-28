package com.nexusllm.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit

/** Events emitted while a chat response streams in. */
sealed interface ChatEvent {
    data class Content(val text: String) : ChatEvent
    data class Reasoning(val text: String) : ChatEvent
    data object Done : ChatEvent
    data class Failure(val message: String) : ChatEvent
}

/**
 * Talks to any OpenAI-compatible NexusLLM endpoint using the user's own base
 * URL + API key. No shared/baked-in credentials.
 */
class NexusClient(
    private val baseUrl: String,
    private val apiKey: String,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)   // reasoning models can think a while
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun authHeaders(b: Request.Builder): Request.Builder {
        if (apiKey.isNotBlank()) b.header("Authorization", "Bearer $apiKey")
        return b
    }

    /** GET {base}/v1/models — the same unified list the website shows (incl.
     *  auto + fusion + every model the user's key unlocks). */
    suspend fun listModels(): List<ModelEntry> = withContext(Dispatchers.IO) {
        val req = authHeaders(Request.Builder().url("$baseUrl/v1/models").get()).build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw RuntimeException("HTTP ${resp.code}: ${body.take(200)}")
            }
            json.decodeFromString(ModelsResponse.serializer(), body).data
        }
    }

    /** Streams a chat completion as SSE. */
    fun streamChat(
        model: String,
        messages: List<ChatMessageDto>,
        thinkingEnabled: Boolean,
        thinkingIntensity: String,
    ): Flow<ChatEvent> = callbackFlow {
        val payload = ChatRequest(
            model = model,
            messages = messages,
            stream = true,
            thinkingEnabled = if (thinkingEnabled) true else null,
            thinkingIntensity = if (thinkingEnabled) thinkingIntensity else null,
        )
        val bodyStr = json.encodeToString(ChatRequest.serializer(), payload)
        val request = authHeaders(
            Request.Builder()
                .url("$baseUrl/v1/chat/completions")
                .post(bodyStr.toRequestBody("application/json".toMediaType()))
        ).build()

        val listener = object : EventSourceListener() {
            override fun onEvent(es: EventSource, id: String?, type: String?, data: String) {
                if (data == "[DONE]") {
                    trySend(ChatEvent.Done)
                    return
                }
                try {
                    val chunk = json.decodeFromString(StreamChunk.serializer(), data)
                    val delta = chunk.choices.firstOrNull()?.delta ?: return
                    val reason = delta.reasoningContent ?: delta.reasoning
                    if (!reason.isNullOrEmpty()) trySend(ChatEvent.Reasoning(reason))
                    if (!delta.content.isNullOrEmpty()) trySend(ChatEvent.Content(delta.content))
                } catch (_: Exception) {
                    // ignore keep-alive / non-JSON frames
                }
            }

            override fun onClosed(es: EventSource) {
                trySend(ChatEvent.Done); close()
            }

            override fun onFailure(es: EventSource, t: Throwable?, response: okhttp3.Response?) {
                val msg = when {
                    response != null -> "HTTP ${response.code}: " +
                        (response.body?.string()?.take(200) ?: response.message)
                    t != null -> t.message ?: "Network error"
                    else -> "Stream failed"
                }
                trySend(ChatEvent.Failure(msg)); close()
            }
        }

        val es = EventSources.createFactory(http).newEventSource(request, listener)
        awaitClose { es.cancel() }
    }.flowOn(Dispatchers.IO)
}
