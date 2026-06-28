package com.nexusllm.app.data

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/** Records microphone audio to a temp .m4a (AAC) file for transcription. */
class AudioRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var file: File? = null

    val isRecording: Boolean get() = recorder != null

    fun start(): Boolean {
        if (recorder != null) return true
        return try {
            val f = File(context.cacheDir, "voice_${System.currentTimeMillis()}.m4a")
            @Suppress("DEPRECATION")
            val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                MediaRecorder(context) else MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioEncodingBitRate(128_000)
            r.setAudioSamplingRate(44_100)
            r.setOutputFile(f.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = f
            true
        } catch (_: Exception) {
            cleanup()
            false
        }
    }

    /** Stops and returns the recorded bytes (or null on failure). */
    fun stop(): ByteArray? {
        return try {
            recorder?.apply {
                stop()
                release()
            }
            recorder = null
            val bytes = file?.readBytes()
            file?.delete()
            file = null
            bytes
        } catch (_: Exception) {
            cleanup()
            null
        }
    }

    private fun cleanup() {
        try {
            recorder?.release()
        } catch (_: Exception) {
        }
        try {
            file?.delete()
        } catch (_: Exception) {
        }
        recorder = null
        file = null
    }
}
