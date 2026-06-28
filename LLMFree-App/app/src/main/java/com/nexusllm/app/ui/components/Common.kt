package com.nexusllm.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp

/** A monochrome lightning bolt drawn to fill the given canvas. */
fun DrawScope.lightningBolt(color: Color, alpha: Float = 1f) {
    val w = size.width
    val h = size.height
    val p = Path().apply {
        moveTo(w * 0.56f, h * 0.06f)
        lineTo(w * 0.30f, h * 0.55f)
        lineTo(w * 0.48f, h * 0.55f)
        lineTo(w * 0.42f, h * 0.94f)
        lineTo(w * 0.72f, h * 0.40f)
        lineTo(w * 0.52f, h * 0.40f)
        close()
    }
    drawPath(p, color = color, alpha = alpha)
}

/** Static lightning mark used in headers / empty states. */
@Composable
fun LightningMark(size: androidx.compose.ui.unit.Dp, color: Color) {
    Canvas(modifier = Modifier.size(size)) { lightningBolt(color) }
}

/** Three animated typing dots shown while the assistant is responding. */
@Composable
fun TypingDots(color: Color) {
    val t = rememberInfiniteTransition(label = "dots")
    Row {
        repeat(3) { i ->
            val a by t.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, delayMillis = i * 150, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "dot$i",
            )
            Canvas(modifier = Modifier.size(7.dp)) {
                drawCircle(color = color, alpha = a, center = Offset(size.width / 2, size.height / 2))
            }
            Spacer(Modifier.width(4.dp))
        }
    }
}

/** Animated audio bars — shown while the mic is actively recording so it's
 *  obvious the app is listening (heights bounce like a live level meter). */
@Composable
fun RecordingWave(
    color: Color,
    modifier: Modifier = Modifier,
    bars: Int = 5,
    minDp: Int = 6,
    maxDp: Int = 22,
) {
    val t = rememberInfiniteTransition(label = "wave")
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        repeat(bars) { i ->
            val h by t.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(360 + i * 90, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "bar$i",
            )
            Box(
                modifier = Modifier
                    .padding(horizontal = 2.dp)
                    .width(4.dp)
                    .height((minDp + (maxDp - minDp) * h).dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(color),
            )
        }
    }
}
