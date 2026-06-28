package com.nexusllm.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nexusllm.app.ui.ChatScreen
import com.nexusllm.app.ui.ChatViewModel
import com.nexusllm.app.ui.OnboardingScreen
import com.nexusllm.app.ui.SettingsScreen
import com.nexusllm.app.ui.SplashScreen
import com.nexusllm.app.ui.theme.NexusTheme

private enum class Route { Splash, Onboarding, Connect, Chat, Settings }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NexusTheme {
                AppRoot()
            }
        }
    }
}

@Composable
private fun AppRoot() {
    val vm: ChatViewModel = viewModel()
    val state by vm.state.collectAsState()
    var route by remember { mutableStateOf(Route.Splash) }

    when (route) {
        Route.Splash -> SplashScreen(onDone = {
            route = if (state.isConfigured) Route.Chat else Route.Onboarding
        })

        Route.Onboarding -> OnboardingScreen(onGetStarted = { route = Route.Connect })

        Route.Connect -> {
            // Advance to chat once a connection succeeds.
            androidx.compose.runtime.LaunchedEffect(state.isConfigured) {
                if (state.isConfigured) route = Route.Chat
            }
            SettingsScreen(
                state = state,
                isOnboarding = true,
                onSave = { base, key -> vm.saveSettings(base, key) },
                onBack = { route = Route.Onboarding },
            )
        }

        Route.Settings -> SettingsScreen(
            state = state,
            isOnboarding = false,
            onSave = { base, key -> vm.saveSettings(base, key) },
            onBack = { route = Route.Chat },
        )

        Route.Chat -> ChatScreen(
            state = state,
            onSend = vm::send,
            onStop = vm::stopStreaming,
            onNewChat = vm::newChat,
            onSelectChat = vm::selectChat,
            onDeleteChat = vm::deleteChat,
            onSelectModel = vm::selectModel,
            onToggleThinking = vm::setThinking,
            onSetIntensity = vm::setIntensity,
            onAddImage = vm::addImage,
            onRemoveImage = vm::removeImage,
            onTranscribe = vm::transcribe,
            onOpenSettings = { route = Route.Settings },
        )
    }
}
