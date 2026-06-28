package com.nexusllm.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexusllm.app.ui.components.LightningMark
import com.nexusllm.app.ui.components.RecordingWave
import com.nexusllm.app.data.AudioRecorder
import java.util.Locale

private enum class Phase { Idle, Listening, Transcribing, Thinking, Speaking }

/**
 * Hands-free talking mode: tap to speak → AssemblyAI transcribes → the model
 * answers → Android TTS reads the reply aloud, then it's ready for the next
 * turn. A full-screen, monochrome conversation surface.
 */
@Composable
fun VoiceMode(
    state: UiState,
    onTranscribe: (ByteArray, (String) -> Unit) -> Unit,
    onSend: (String) -> Unit,
    onClose: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val context = LocalContext.current
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val recorder = remember { AudioRecorder(context) }

    var phase by remember { mutableStateOf(Phase.Idle) }
    var awaiting by remember { mutableStateOf(false) }
    var lastReply by remember { mutableStateOf("") }

    // Text-to-speech engine
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }
    DisposableEffect(Unit) {
        val engine = TextToSpeech(context) { }
        engine.setLanguage(Locale.getDefault())
        tts = engine
        onDispose {
            try { engine.stop(); engine.shutdown() } catch (_: Exception) {}
            try { if (recorder.isRecording) recorder.stop() } catch (_: Exception) {}
        }
    }

    fun speak(text: String) {
        val engine = tts ?: run { phase = Phase.Idle; return }
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { mainHandler.post { phase = Phase.Idle } }
            @Deprecated("deprecated") override fun onError(utteranceId: String?) { mainHandler.post { phase = Phase.Idle } }
        })
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reply")
    }

    // When the model finishes streaming our turn, read the answer aloud.
    LaunchedEffect(state.isStreaming) {
        if (awaiting && !state.isStreaming) {
            awaiting = false
            val reply = state.current?.messages?.lastOrNull { it.role == "assistant" }?.content.orEmpty()
            lastReply = reply
            if (reply.isNotBlank()) { phase = Phase.Speaking; speak(reply) } else phase = Phase.Idle
        }
    }

    fun startListening() {
        if (recorder.start()) phase = Phase.Listening
    }

    val micPerm = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) startListening() }

    fun onOrbTap() {
        when (phase) {
            Phase.Idle -> {
                val granted = androidx.core.content.ContextCompat.checkSelfPermission(
                    context, Manifest.permission.RECORD_AUDIO,
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) startListening() else micPerm.launch(Manifest.permission.RECORD_AUDIO)
            }
            Phase.Listening -> {
                val bytes = recorder.stop()
                if (bytes == null) { phase = Phase.Idle; return }
                phase = Phase.Transcribing
                onTranscribe(bytes) { transcript ->
                    if (transcript.isBlank()) {
                        phase = Phase.Idle
                    } else {
                        awaiting = true
                        phase = Phase.Thinking
                        onSend(transcript)
                    }
                }
            }
            Phase.Speaking -> { tts?.stop(); phase = Phase.Idle }
            else -> { /* busy: ignore */ }
        }
    }

    val status = when (phase) {
        Phase.Idle -> "Tap to talk"
        Phase.Listening -> "Listening…"
        Phase.Transcribing -> "Transcribing…"
        Phase.Thinking -> "Thinking…"
        Phase.Speaking -> "Speaking…"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(cs.background.copy(alpha = 0.98f)),
    ) {
        IconButton(
            onClick = { tts?.stop(); onClose() },
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
        ) {
            Icon(Icons.Filled.Close, "Close", tint = cs.onBackground)
        }

        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                prettyModelName(state.selectedModel),
                color = cs.onSurfaceVariant,
                fontSize = 13.sp,
            )
            Spacer(Modifier.height(28.dp))

            // pulsing orb
            val t = rememberInfiniteTransition(label = "orb")
            val pulse by t.animateFloat(
                initialValue = 1f,
                targetValue = if (phase == Phase.Idle) 1f else 1.12f,
                animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
                label = "pulse",
            )
            Box(
                modifier = Modifier
                    .size(190.dp)
                    .scale(pulse)
                    .clip(CircleShape)
                    .background(cs.surface)
                    .clickable { onOrbTap() },
                contentAlignment = Alignment.Center,
            ) {
                when (phase) {
                    Phase.Listening -> RecordingWave(color = cs.onBackground, bars = 6, minDp = 14, maxDp = 70)
                    Phase.Transcribing, Phase.Thinking ->
                        CircularProgressIndicator(color = cs.onBackground, strokeWidth = 3.dp, modifier = Modifier.size(48.dp))
                    Phase.Speaking ->
                        Box(Modifier.graphicsLayer { alpha = pulse - 0.1f }) { LightningMark(size = 72.dp, color = cs.onBackground) }
                    Phase.Idle -> Icon(Icons.Filled.Mic, "Talk", tint = cs.onBackground, modifier = Modifier.size(56.dp))
                }
            }

            Spacer(Modifier.height(36.dp))
            Text(
                status,
                color = cs.onBackground,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (lastReply.isNotBlank() && phase == Phase.Speaking) {
                Spacer(Modifier.height(16.dp))
                Text(
                    lastReply.take(240) + if (lastReply.length > 240) "…" else "",
                    color = cs.onSurfaceVariant,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    lineHeight = 20.sp,
                )
            }
            Spacer(Modifier.height(24.dp))
            Text(
                "Tap the circle to speak · tap again to send",
                color = cs.onSurfaceVariant,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

private fun prettyModelName(id: String): String = when (id) {
    "auto" -> "Auto"
    "fusion" -> "Fusion"
    else -> id.substringAfterLast('/')
}
