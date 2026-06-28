package com.nexusllm.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexusllm.app.ui.components.lightningBolt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Launch splash — a lightning-strike: the bolt flashes in with an electric
 * double-flash and shake, three shockwave rings expand outward, then the
 * wordmark + tagline rise. Mirrors the Genspark "01 Splash" design.
 */
@Composable
fun SplashScreen(onDone: () -> Unit) {
    val flash = remember { Animatable(0f) }
    val boltAlpha = remember { Animatable(0f) }
    val boltScale = remember { Animatable(0.5f) }
    val shake = remember { Animatable(0f) }
    val ring1 = remember { Animatable(0f) }
    val ring2 = remember { Animatable(0f) }
    val ring3 = remember { Animatable(0f) }
    val wordmark = remember { Animatable(0f) }
    val tagline = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        // bolt strikes in
        launch { boltScale.animateTo(1f, tween(260)); boltAlpha.animateTo(1f, tween(140)) }
        // electric flash (triple)
        launch {
            delay(160)
            flash.animateTo(1f, tween(50)); flash.animateTo(0.1f, tween(110))
            flash.animateTo(0.8f, tween(50)); flash.animateTo(0f, tween(120))
            flash.animateTo(0.5f, tween(40)); flash.animateTo(0f, tween(160))
        }
        // bolt shake
        launch {
            delay(260)
            repeat(3) {
                shake.animateTo(1f, tween(40)); shake.animateTo(-1f, tween(60)); shake.animateTo(0f, tween(40))
            }
        }
        // shockwave rings, staggered
        launch { delay(420); ring1.animateTo(1f, tween(1400, easing = LinearEasing)) }
        launch { delay(620); ring2.animateTo(1f, tween(1400, easing = LinearEasing)) }
        launch { delay(860); ring3.animateTo(1f, tween(1400, easing = LinearEasing)) }
        // wordmark + tagline rise
        launch { delay(1300); wordmark.animateTo(1f, tween(500)) }
        launch { delay(1500); tagline.animateTo(1f, tween(500)) }

        delay(2400)
        onDone()
    }

    val fg = MaterialTheme.colorScheme.onBackground
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(160.dp)) {
                // shockwave rings
                Canvas(Modifier.fillMaxSize()) {
                    val base = size.minDimension * 0.28f
                    fun ring(p: Float) {
                        if (p <= 0f) return
                        val r = base * (0.3f + p * 3.0f)
                        drawCircle(
                            color = fg,
                            radius = r,
                            alpha = (1f - p) * 0.7f,
                            style = androidx.compose.ui.graphics.drawscope.Stroke(width = 4f),
                        )
                    }
                    ring(ring1.value); ring(ring2.value); ring(ring3.value)
                }
                // the bolt
                Canvas(
                    modifier = Modifier
                        .size(92.dp)
                        .graphicsLayer {
                            alpha = boltAlpha.value
                            scaleX = boltScale.value
                            scaleY = boltScale.value
                            translationX = shake.value * 6f
                        },
                ) { lightningBolt(fg) }
            }
            Spacer(Modifier.height(20.dp))
            Text(
                "NexusLLM",
                color = fg,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.graphicsLayer {
                    alpha = wordmark.value
                    translationY = (1f - wordmark.value) * 24f
                },
            )
            Text(
                "Intelligence, instantly",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                modifier = Modifier.graphicsLayer {
                    alpha = tagline.value
                    translationY = (1f - tagline.value) * 20f
                },
            )
        }
        // full-screen electric flash overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = flash.value * 0.85f }
                .background(Color.White),
        )
    }
}
