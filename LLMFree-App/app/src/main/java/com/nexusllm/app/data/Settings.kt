package com.nexusllm.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "nexus_settings")

/**
 * Per-device connection settings. Each user supplies their OWN base URL + API
 * key — nothing is hardcoded and no shared developer key is used, so every
 * install talks to its own endpoint/account.
 */
class Settings(private val context: Context) {

    private val KEY_BASE_URL = stringPreferencesKey("base_url")
    private val KEY_API_KEY = stringPreferencesKey("api_key")
    private val KEY_LAST_MODEL = stringPreferencesKey("last_model")

    val baseUrl: Flow<String> = context.dataStore.data.map { it[KEY_BASE_URL] ?: "" }
    val apiKey: Flow<String> = context.dataStore.data.map { it[KEY_API_KEY] ?: "" }
    val lastModel: Flow<String> = context.dataStore.data.map { it[KEY_LAST_MODEL] ?: "" }

    suspend fun save(baseUrl: String, apiKey: String) {
        context.dataStore.edit {
            it[KEY_BASE_URL] = normalizeBaseUrl(baseUrl)
            it[KEY_API_KEY] = apiKey.trim()
        }
    }

    suspend fun setLastModel(model: String) {
        context.dataStore.edit { it[KEY_LAST_MODEL] = model }
    }

    companion object {
        /** Normalize a user-entered base URL: trim, ensure scheme, strip a
         *  trailing slash and a trailing /v1 (we append paths ourselves). */
        fun normalizeBaseUrl(raw: String): String {
            var s = raw.trim()
            if (s.isEmpty()) return s
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
            s = s.trimEnd('/')
            if (s.endsWith("/v1")) s = s.dropLast(3).trimEnd('/')
            return s
        }
    }
}
