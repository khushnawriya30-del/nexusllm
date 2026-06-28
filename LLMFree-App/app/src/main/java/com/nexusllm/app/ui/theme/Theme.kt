package com.nexusllm.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Pure monochrome palette — black/white only, like ChatGPT. No colored accent.
// Values mirror the Genspark design tokens exactly.

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFFFFF),         // --accent (send button)
    onPrimary = Color(0xFF0D0D0D),       // --accent-contrast
    secondary = Color(0xFFECECEC),
    onSecondary = Color(0xFF0D0D0D),
    background = Color(0xFF212121),      // --bg
    onBackground = Color(0xFFECECEC),    // --text
    surface = Color(0xFF2F2F2F),         // --bg-elev (composer / drawer / user bubble)
    onSurface = Color(0xFFECECEC),
    surfaceVariant = Color(0xFF424242),  // --bg-elev-2 (hover / badges)
    onSurfaceVariant = Color(0xFFB4B4B4),// --text-2
    outline = Color(0xFF424242),         // --border
    outlineVariant = Color(0xFF565656),  // --border-strong
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF0D0D0D),         // --accent
    onPrimary = Color(0xFFFFFFFF),       // --accent-contrast
    secondary = Color(0xFF0D0D0D),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFFFFFFF),      // --bg
    onBackground = Color(0xFF0D0D0D),    // --text
    surface = Color(0xFFF7F7F8),         // --bg-elev
    onSurface = Color(0xFF0D0D0D),
    surfaceVariant = Color(0xFFECECF1),  // --bg-elev-2
    onSurfaceVariant = Color(0xFF5D5D67),// --text-2
    outline = Color(0xFFE5E5E7),         // --border
    outlineVariant = Color(0xFFD4D4D8),  // --border-strong
)

@Composable
fun NexusTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colors.background.toArgb()
            window.navigationBarColor = colors.background.toArgb()
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = colors,
        typography = Typography(),
        content = content,
    )
}
