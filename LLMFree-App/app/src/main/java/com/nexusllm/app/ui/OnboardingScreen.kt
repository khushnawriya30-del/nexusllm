package com.nexusllm.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexusllm.app.ui.components.lightningBolt

private data class Slide(val title: String, val body: String)

private val slides = listOf(
    Slide("Every model, one app", "Chat with GPT, Claude, Llama, Gemini, DeepSeek and dozens more — plus Auto and Fusion modes."),
    Slide("Bring your own key", "Your Base URL and API key stay on your device. You're always on your own account, never a shared one."),
    Slide("Think when it matters", "Reasoning-capable models get a thinking toggle with Low → Max depth, just like the website."),
)

@Composable
fun OnboardingScreen(onGetStarted: () -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    val cs = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(cs.background)
            .statusBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onGetStarted) { Text("Skip", color = cs.onSurfaceVariant) }
        }
        Spacer(Modifier.height(40.dp))
        Canvas(Modifier.size(84.dp)) { lightningBolt(cs.onBackground) }
        Spacer(Modifier.height(40.dp))

        AnimatedContent(
            targetState = page,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "slide",
        ) { p ->
            val s = slides[p]
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(s.title, color = cs.onBackground, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(14.dp))
                Text(s.body, color = cs.onSurfaceVariant, fontSize = 15.sp, textAlign = TextAlign.Center)
            }
        }

        Spacer(Modifier.height(36.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            slides.indices.forEach { i ->
                val active = i == page
                Box(
                    Modifier
                        .size(if (active) 10.dp else 8.dp)
                        .clip(CircleShape)
                        .background(if (active) cs.onBackground else cs.outline),
                )
            }
        }

        Spacer(Modifier.weight(1f))
        Button(
            onClick = { if (page < slides.lastIndex) page++ else onGetStarted() },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text(if (page < slides.lastIndex) "Next" else "Get started", fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(8.dp))
    }
}
