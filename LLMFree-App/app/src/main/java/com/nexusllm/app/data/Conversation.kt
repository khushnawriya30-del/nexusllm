package com.nexusllm.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

@Serializable
data class Message(
    val id: String = UUID.randomUUID().toString(),
    val role: String,                 // "user" | "assistant"
    val content: String = "",
    val reasoning: String = "",       // collected "thinking" tokens, if any
    val images: List<String> = emptyList(), // attached image data URLs (user)
)

@Serializable
data class Conversation(
    val id: String = UUID.randomUUID().toString(),
    var title: String = "New chat",
    var model: String = "auto",
    val messages: MutableList<Message> = mutableListOf(),
    var updatedAt: Long = System.currentTimeMillis(),
)

private val Context.convStore by preferencesDataStore(name = "nexus_conversations")

/** Persists the full conversation list locally (offline history, like ChatGPT). */
class ConversationStore(private val context: Context) {
    private val KEY = stringPreferencesKey("conversations_json")
    private val json = Json { ignoreUnknownKeys = true }

    val conversations: Flow<List<Conversation>> = context.convStore.data.map { prefs ->
        val raw = prefs[KEY] ?: return@map emptyList()
        runCatching {
            json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(Conversation.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    suspend fun save(list: List<Conversation>) {
        val raw = json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(Conversation.serializer()),
            list,
        )
        context.convStore.edit { it[KEY] = raw }
    }
}
