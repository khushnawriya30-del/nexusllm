package com.nexusllm.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * AssemblyAI speech-to-text. Uploads recorded audio (or the audio track of a
 * picked video/audio file) and returns the transcript, which the app feeds
 * into the chat as text — so users can talk to the AI or "send" media whose
 * speech the AI then understands.
 *
 * NOTE: the key ships inside the app (it's the owner's own key). Rotate or
 * revoke it any time from the AssemblyAI dashboard.
 */
object AssemblyAI {
    const val API_KEY = "6a96ccd8890e405c92eb9619e521225b"
    private const val BASE = "https://api.assemblyai.com/v2"

    private val json = Json { ignoreUnknownKeys = true }
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    /** Upload raw media bytes, transcribe, and return recognized text. */
    suspend fun transcribe(bytes: ByteArray): String = withContext(Dispatchers.IO) {
        if (bytes.isEmpty()) throw RuntimeException("No audio captured")

        // 1) upload bytes
        val upReq = Request.Builder()
            .url("$BASE/upload")
            .header("authorization", API_KEY)
            .post(bytes.toRequestBody("application/octet-stream".toMediaType()))
            .build()
        val uploadUrl = http.newCall(upReq).execute().use { r ->
            val b = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw RuntimeException("Upload ${r.code}: ${b.take(160)}")
            json.parseToJsonElement(b).jsonObject["upload_url"]?.jsonPrimitive?.content
                ?: throw RuntimeException("No upload_url returned")
        }

        // 2) request transcription
        val tBody = buildJsonObject { put("audio_url", uploadUrl) }.toString()
        val tReq = Request.Builder()
            .url("$BASE/transcript")
            .header("authorization", API_KEY)
            .post(tBody.toRequestBody("application/json".toMediaType()))
            .build()
        val id = http.newCall(tReq).execute().use { r ->
            val b = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw RuntimeException("Transcript ${r.code}: ${b.take(160)}")
            json.parseToJsonElement(b).jsonObject["id"]?.jsonPrimitive?.content
                ?: throw RuntimeException("No transcript id")
        }

        // 3) poll until done (~ up to 2 min)
        repeat(60) {
            val pReq = Request.Builder()
                .url("$BASE/transcript/$id")
                .header("authorization", API_KEY)
                .get()
                .build()
            val obj = http.newCall(pReq).execute().use { r ->
                json.parseToJsonElement(r.body?.string().orEmpty()).jsonObject
            }
            when (obj["status"]?.jsonPrimitive?.content) {
                "completed" -> return@withContext (obj["text"]?.jsonPrimitive?.content.orEmpty())
                "error" -> throw RuntimeException(obj["error"]?.jsonPrimitive?.content ?: "Transcription failed")
            }
            delay(2000)
        }
        throw RuntimeException("Transcription timed out")
    }
}
