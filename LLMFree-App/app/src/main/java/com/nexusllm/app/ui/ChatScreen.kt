package com.nexusllm.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.Canvas
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexusllm.app.data.Conversation
import com.nexusllm.app.data.Message
import com.nexusllm.app.data.ModelEntry
import com.nexusllm.app.ui.components.LightningMark
import com.nexusllm.app.ui.components.MarkdownMessage
import com.nexusllm.app.ui.components.RecordingWave
import com.nexusllm.app.ui.components.TypingDots
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.nexusllm.app.data.AudioRecorder
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    state: UiState,
    onSend: (String) -> Unit,
    onStop: () -> Unit,
    onNewChat: () -> Unit,
    onSelectChat: (String) -> Unit,
    onDeleteChat: (String) -> Unit,
    onSelectModel: (String) -> Unit,
    onToggleThinking: (Boolean) -> Unit,
    onSetIntensity: (String) -> Unit,
    onAddImage: (String) -> Unit,
    onRemoveImage: (Int) -> Unit,
    onTranscribe: (ByteArray, (String) -> Unit) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var showModelPicker by remember { mutableStateOf(false) }
    var showVoice by remember { mutableStateOf(false) }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = cs.surface) {
                HistoryDrawer(
                    conversations = state.conversations,
                    currentId = state.currentId,
                    onNew = { scope.launch { drawerState.close() }; onNewChat() },
                    onSelect = { scope.launch { drawerState.close() }; onSelectChat(it) },
                    onDelete = onDeleteChat,
                    onSettings = { scope.launch { drawerState.close() }; onOpenSettings() },
                )
            }
        },
    ) {
        Scaffold(
            containerColor = cs.background,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = cs.background,
                        titleContentColor = cs.onBackground,
                    ),
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Filled.Menu, "Menu", tint = cs.onBackground)
                        }
                    },
                    title = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { showModelPicker = true }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        ) {
                            Text(
                                prettyModel(state.selectedModel),
                                color = cs.onBackground,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Icon(Icons.Filled.ExpandMore, "Pick model", tint = cs.onSurfaceVariant)
                        }
                    },
                    actions = {
                        IconButton(onClick = onNewChat) {
                            Icon(Icons.Filled.Edit, "New chat", tint = cs.onBackground)
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .imePadding(),
            ) {
                val msgs = state.current?.messages ?: emptyList()
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    if (msgs.isEmpty()) {
                        EmptyState(onSuggestion = onSend)
                    } else {
                        MessageList(msgs, state.isStreaming)
                    }
                }
                Composer(
                    enabled = state.isConfigured,
                    isStreaming = state.isStreaming,
                    showThinking = state.selectedSupportsReasoning,
                    thinkingEnabled = state.thinkingEnabled,
                    intensity = state.thinkingIntensity,
                    pendingImages = state.pendingImages,
                    busyVoice = state.busyVoice,
                    voiceError = state.voiceError,
                    onToggleThinking = onToggleThinking,
                    onSetIntensity = onSetIntensity,
                    onAddImage = onAddImage,
                    onRemoveImage = onRemoveImage,
                    onTranscribe = onTranscribe,
                    onOpenVoice = { showVoice = true },
                    onSend = onSend,
                    onStop = onStop,
                )
            }
        }
    }

    if (showModelPicker) {
        ModelPickerSheet(
            models = state.models,
            selected = state.selectedModel,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            onPick = { onSelectModel(it); showModelPicker = false },
            onDismiss = { showModelPicker = false },
        )
    }

    if (showVoice) {
        VoiceMode(
            state = state,
            onTranscribe = onTranscribe,
            onSend = onSend,
            onClose = { showVoice = false },
        )
    }
}

@Composable
private fun MessageList(messages: List<Message>, streaming: Boolean) {
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size, messages.lastOrNull()?.content) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        items(messages, key = { it.id }) { m -> MessageBubble(m, streaming) }
    }
}

@Composable
private fun MessageBubble(m: Message, streaming: Boolean) {
    val cs = MaterialTheme.colorScheme
    val isUser = m.role == "user"
    if (isUser) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Surface(
                color = cs.surfaceVariant,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.widthInMax(),
            ) {
                Column(Modifier.padding(6.dp)) {
                    m.images.forEach { dataUrl ->
                        val bmp = remember(dataUrl) { decodeDataUrl(dataUrl) }
                        if (bmp != null) {
                            Image(
                                bitmap = bmp,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .padding(4.dp)
                                    .size(190.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            )
                        }
                    }
                    if (m.content.isNotBlank()) {
                        Text(
                            m.content,
                            color = cs.onSurface,
                            fontSize = 15.sp,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
    } else {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            LightningMark(size = 22.dp, color = cs.onBackground)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                if (m.reasoning.isNotBlank()) {
                    Surface(
                        color = Color.Transparent,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, cs.outline, RoundedCornerShape(12.dp)),
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text("Thinking", color = cs.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text(m.reasoning, color = cs.onSurfaceVariant, fontSize = 13.sp)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                if (m.content.isBlank() && streaming) {
                    TypingDots(cs.onSurfaceVariant)
                } else {
                    MarkdownMessage(m.content, cs.onBackground)
                    if (m.content.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        val clipboard = LocalClipboardManager.current
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { clipboard.setText(AnnotatedString(m.content)) }
                                .padding(horizontal = 6.dp, vertical = 4.dp),
                        ) {
                            Icon(Icons.Filled.ContentCopy, "Copy", tint = cs.onSurfaceVariant, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Copy", color = cs.onSurfaceVariant, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(onSuggestion: (String) -> Unit) {
    val cs = MaterialTheme.colorScheme
    // (heading, prompt) pairs — mirrors the Genspark empty-state suggestions.
    val suggestions = listOf(
        "Brainstorm" to "10 names for an indie coffee shop",
        "Code" to "Write a debounce hook in TypeScript",
        "Summarize" to "this article on quantum computing",
        "Create image" to "a misty mountain at dawn",
    )
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LightningMark(size = 56.dp, color = cs.onBackground)
        Spacer(Modifier.height(20.dp))
        Text(
            "How can I help you today?",
            color = cs.onBackground,
            fontSize = 26.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(26.dp))
        suggestions.forEach { (head, prompt) ->
            Surface(
                color = cs.surface,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 5.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { onSuggestion(prompt) },
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(14.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(cs.background),
                        contentAlignment = Alignment.Center,
                    ) { LightningMark(size = 16.dp, color = cs.onSurfaceVariant) }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(head, color = cs.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(prompt, color = cs.onSurfaceVariant, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Composer(
    enabled: Boolean,
    isStreaming: Boolean,
    showThinking: Boolean,
    thinkingEnabled: Boolean,
    intensity: String,
    pendingImages: List<String>,
    busyVoice: Boolean,
    voiceError: String?,
    onToggleThinking: (Boolean) -> Unit,
    onSetIntensity: (String) -> Unit,
    onAddImage: (String) -> Unit,
    onRemoveImage: (Int) -> Unit,
    onTranscribe: (ByteArray, (String) -> Unit) -> Unit,
    onOpenVoice: () -> Unit,
    onSend: (String) -> Unit,
    onStop: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val context = LocalContext.current
    var text by remember { mutableStateOf("") }
    var showAttach by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    val recorder = remember { AudioRecorder(context) }

    fun appendTranscript(t: String) {
        text = if (text.isBlank()) t else "$text $t".trim()
    }

    val imgLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? ->
        if (uri != null) uriToDataUrl(context, uri)?.let(onAddImage)
    }
    val docLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri != null) uriToBytes(context, uri)?.let { b -> onTranscribe(b) { appendTranscript(it) } }
    }
    val micPerm = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) recording = recorder.start() }

    fun toggleMic() {
        if (recording) {
            recording = false
            recorder.stop()?.let { b -> onTranscribe(b) { appendTranscript(it) } }
        } else {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.RECORD_AUDIO,
            ) == PackageManager.PERMISSION_GRANTED
            if (granted) recording = recorder.start()
            else micPerm.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    Column(Modifier.fillMaxWidth().padding(12.dp)) {
        if (voiceError != null) {
            Text("⚠️ $voiceError", color = cs.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
        }
        if (busyVoice) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = cs.onSurfaceVariant)
                Spacer(Modifier.width(8.dp))
                Text("Transcribing…", color = cs.onSurfaceVariant, fontSize = 12.sp)
            }
        }
        if (pendingImages.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(bottom = 8.dp),
            ) {
                pendingImages.forEachIndexed { i, dataUrl ->
                    val bmp = remember(dataUrl) { decodeDataUrl(dataUrl) }
                    Box(Modifier.padding(end = 8.dp)) {
                        if (bmp != null) {
                            Image(
                                bitmap = bmp,
                                contentDescription = null,
                                modifier = Modifier.size(60.dp).clip(RoundedCornerShape(12.dp)),
                            )
                        } else {
                            Box(Modifier.size(60.dp).clip(RoundedCornerShape(12.dp)).background(cs.surfaceVariant))
                        }
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(2.dp)
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(cs.background.copy(alpha = 0.7f))
                                .clickable { onRemoveImage(i) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Close, "Remove", tint = cs.onBackground, modifier = Modifier.size(13.dp))
                        }
                    }
                }
            }
        }
        if (showThinking) {
            ReasoningControl(thinkingEnabled, intensity, onToggleThinking, onSetIntensity)
            Spacer(Modifier.height(8.dp))
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(cs.surfaceVariant)
                    .clickable(enabled = enabled) { showAttach = true },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Add, "Attach", tint = cs.onSurface)
            }
            Spacer(Modifier.width(8.dp))
            TextField(
                value = text,
                onValueChange = { text = it },
                enabled = enabled,
                placeholder = { Text("Message NexusLLM…", color = cs.onSurfaceVariant) },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(max = 160.dp)
                    .clip(RoundedCornerShape(24.dp)),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = cs.surfaceVariant,
                    unfocusedContainerColor = cs.surfaceVariant,
                    disabledContainerColor = cs.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                    cursorColor = cs.onBackground,
                ),
                maxLines = 6,
            )
            Spacer(Modifier.width(8.dp))

            // Voice (talking) agent — converse hands-free
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(enabled = enabled) { onOpenVoice() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.GraphicEq, "Voice mode", tint = cs.onSurfaceVariant)
            }
            Spacer(Modifier.width(4.dp))

            val canSend = enabled && (text.isNotBlank() || pendingImages.isNotEmpty())
            if (isStreaming) {
                Box(
                    modifier = Modifier.size(48.dp).clip(CircleShape).background(cs.primary)
                        .clickable { onStop() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Stop, "Stop", tint = cs.onPrimary) }
            } else if (canSend) {
                Box(
                    modifier = Modifier.size(48.dp).clip(CircleShape).background(cs.primary)
                        .clickable { onSend(text.trim()); text = "" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = cs.onPrimary) }
            } else {
                Box(
                    modifier = Modifier.size(48.dp).clip(CircleShape)
                        .background(if (recording) cs.primary else cs.surfaceVariant)
                        .clickable(enabled = enabled) { toggleMic() },
                    contentAlignment = Alignment.Center,
                ) {
                    if (recording) {
                        RecordingWave(color = cs.onPrimary, bars = 4, minDp = 5, maxDp = 18)
                    } else {
                        Icon(Icons.Filled.Mic, "Voice", tint = cs.onSurfaceVariant)
                    }
                }
            }
        }
    }

    if (showAttach) {
        ModalBottomSheet(
            onDismissRequest = { showAttach = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = cs.surface,
        ) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp).padding(bottom = 24.dp)) {
                AttachRow(Icons.Filled.PhotoLibrary, "Photo", "Send an image to a vision model") {
                    showAttach = false
                    imgLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                }
                AttachRow(Icons.Filled.Videocam, "Audio / Video", "Transcribe its speech and send as text") {
                    showAttach = false
                    docLauncher.launch(arrayOf("audio/*", "video/*"))
                }
            }
        }
    }
}

@Composable
private fun AttachRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    sub: String,
    onClick: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 14.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(cs.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = cs.onSurface) }
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, color = cs.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text(sub, color = cs.onSurfaceVariant, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ReasoningControl(
    enabled: Boolean,
    intensity: String,
    onToggle: (Boolean) -> Unit,
    onSetIntensity: (String) -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val levels = listOf("low", "medium", "high", "max")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(
            color = if (enabled) cs.onBackground else cs.surfaceVariant,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.clickable { onToggle(!enabled) },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                LightningMark(size = 14.dp, color = if (enabled) cs.background else cs.onSurfaceVariant)
                Spacer(Modifier.width(6.dp))
                Text(
                    "Think",
                    color = if (enabled) cs.background else cs.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        if (enabled) {
            Spacer(Modifier.width(8.dp))
            levels.forEach { lv ->
                val active = lv == intensity
                Surface(
                    color = if (active) cs.surfaceVariant else Color.Transparent,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .clickable { onSetIntensity(lv) }
                        .border(
                            1.dp,
                            if (active) cs.onSurfaceVariant else cs.outline,
                            RoundedCornerShape(14.dp),
                        ),
                ) {
                    Text(
                        lv.replaceFirstChar { it.uppercase() },
                        color = if (active) cs.onSurface else cs.onSurfaceVariant,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                Spacer(Modifier.width(6.dp))
            }
        }
    }
}

@Composable
private fun HistoryDrawer(
    conversations: List<Conversation>,
    currentId: String?,
    onNew: () -> Unit,
    onSelect: (String) -> Unit,
    onDelete: (String) -> Unit,
    onSettings: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(8.dp),
        ) {
            LightningMark(size = 22.dp, color = cs.onBackground)
            Spacer(Modifier.width(10.dp))
            Text("NexusLLM", color = cs.onBackground, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
        Surface(
            color = cs.surfaceVariant,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().clickable { onNew() },
        ) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Add, null, tint = cs.onSurface)
                Spacer(Modifier.width(10.dp))
                Text("New chat", color = cs.onSurface, fontWeight = FontWeight.Medium)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("History", color = cs.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
        Spacer(Modifier.height(4.dp))
        LazyColumn(Modifier.weight(1f)) {
            items(conversations, key = { it.id }) { c ->
                val active = c.id == currentId
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (active) cs.surfaceVariant else Color.Transparent)
                        .clickable { onSelect(c.id) }
                        .padding(horizontal = 10.dp, vertical = 10.dp),
                ) {
                    Text(
                        c.title.ifBlank { "New chat" },
                        color = cs.onSurface,
                        fontSize = 14.sp,
                        maxLines = 1,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { onDelete(c.id) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Outlined.DeleteOutline, "Delete", tint = cs.onSurfaceVariant, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
        Surface(
            color = Color.Transparent,
            modifier = Modifier.fillMaxWidth().clickable { onSettings() },
        ) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Settings, null, tint = cs.onSurface)
                Spacer(Modifier.width(10.dp))
                Text("Settings", color = cs.onSurface)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModelPickerSheet(
    models: List<ModelEntry>,
    selected: String,
    sheetState: androidx.compose.material3.SheetState,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = cs.surface) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text("Choose a model", color = cs.onSurface, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            LazyColumn(Modifier.heightInMaxSheet()) {
                items(models, key = { it.id }) { m ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { onPick(m.id) }
                            .padding(vertical = 12.dp, horizontal = 8.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(prettyModel(m.id), color = cs.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            val tags = m.meta?.capabilities?.filter { it != "chat" }?.joinToString(" · ") ?: ""
                            if (tags.isNotBlank()) {
                                Text(tags, color = cs.onSurfaceVariant, fontSize = 12.sp)
                            }
                        }
                        if (m.id == selected) {
                            Icon(Icons.Filled.Check, "Selected", tint = cs.onSurface)
                        }
                    }
                }
            }
        }
    }
}

// ---- small helpers --------------------------------------------------------

private fun prettyModel(id: String): String = when (id) {
    "auto" -> "Auto"
    "fusion" -> "Fusion"
    else -> id.substringAfterLast('/')
}

@Composable
private fun Modifier.widthInMax(): Modifier = this.widthIn(max = 300.dp)

@Composable
private fun Modifier.heightInMaxSheet(): Modifier = this.heightIn(max = 460.dp)

// ---- media helpers --------------------------------------------------------

private const val MAX_IMAGE_BYTES = 5_000_000

private fun uriToBytes(context: android.content.Context, uri: Uri): ByteArray? =
    try {
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
    } catch (_: Exception) {
        null
    }

private fun uriToDataUrl(context: android.content.Context, uri: Uri): String? {
    val bytes = uriToBytes(context, uri) ?: return null
    if (bytes.size > MAX_IMAGE_BYTES) return null
    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
    return "data:$mime;base64,$b64"
}

private fun decodeDataUrl(dataUrl: String): androidx.compose.ui.graphics.ImageBitmap? =
    try {
        val comma = dataUrl.indexOf(',')
        val b64 = if (comma >= 0) dataUrl.substring(comma + 1) else dataUrl
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (_: Exception) {
        null
    }
