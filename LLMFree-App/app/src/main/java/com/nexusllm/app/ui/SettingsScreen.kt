package com.nexusllm.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexusllm.app.ui.components.lightningBolt
import androidx.compose.foundation.Canvas

/**
 * Connect / Settings screen. The "account" of this app is simply the user's
 * OWN endpoint: a base URL + API key. Nothing is shared between installs.
 */
@Composable
fun SettingsScreen(
    state: UiState,
    isOnboarding: Boolean,
    onSave: (String, String) -> Unit,
    onBack: () -> Unit,
) {
    var baseUrl by remember { mutableStateOf(state.baseUrl) }
    var apiKey by remember { mutableStateOf(state.apiKey) }
    var showKey by remember { mutableStateOf(false) }
    val cs = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(cs.background)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp),
    ) {
        Spacer(Modifier.height(18.dp))
        if (!isOnboarding) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = cs.onBackground)
                }
                Text("Settings", color = cs.onBackground, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(8.dp))
        } else {
            Spacer(Modifier.height(28.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(56.dp)) { lightningBolt(cs.onBackground) }
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Connect your endpoint",
                color = cs.onBackground, fontSize = 24.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Enter your own NexusLLM Base URL and API key. Your key stays on this device — every user connects to their own account.",
                color = cs.onSurfaceVariant, fontSize = 14.sp,
            )
            Spacer(Modifier.height(20.dp))
        }

        OutlinedTextField(
            value = baseUrl,
            onValueChange = { baseUrl = it },
            label = { Text("Base URL") },
            placeholder = { Text("https://your-app.onrender.com") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text("API Key") },
            placeholder = { Text("sk-... or your unified key") },
            singleLine = true,
            visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { showKey = !showKey }) {
                    Icon(
                        if (showKey) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = "Toggle key visibility",
                        tint = cs.onSurfaceVariant,
                    )
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
        )

        if (state.connectionError != null) {
            Spacer(Modifier.height(12.dp))
            Text("⚠️ ${state.connectionError}", color = cs.onSurfaceVariant, fontSize = 13.sp)
        }

        Spacer(Modifier.height(22.dp))
        Button(
            onClick = { onSave(baseUrl, apiKey) },
            enabled = !state.testing && baseUrl.isNotBlank() && apiKey.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
        ) {
            if (state.testing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = cs.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else {
                Text(if (isOnboarding) "Connect" else "Save & reconnect", fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            "Tip: paste the same Base URL + key you use on the NexusLLM website. All the same models (including Auto and Fusion) will appear here.",
            color = cs.onSurfaceVariant, fontSize = 12.sp,
        )
        Spacer(Modifier.height(28.dp))
    }
}
