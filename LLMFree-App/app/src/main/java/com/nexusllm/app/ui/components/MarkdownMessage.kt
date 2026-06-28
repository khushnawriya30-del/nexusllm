package com.nexusllm.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private sealed interface Seg
private data class TextSeg(val text: String) : Seg
private data class CodeSeg(val lang: String, val code: String) : Seg

private val FENCE = Regex("```([a-zA-Z0-9+#._-]*)\\n?([\\s\\S]*?)```")

private fun parse(md: String): List<Seg> {
    val segs = mutableListOf<Seg>()
    var last = 0
    for (m in FENCE.findAll(md)) {
        if (m.range.first > last) {
            val t = md.substring(last, m.range.first).trim('\n')
            if (t.isNotBlank()) segs.add(TextSeg(t))
        }
        segs.add(CodeSeg(m.groupValues[1].ifBlank { "code" }, m.groupValues[2].trimEnd('\n')))
        last = m.range.last + 1
    }
    if (last < md.length) {
        val t = md.substring(last).trim('\n')
        if (t.isNotBlank()) segs.add(TextSeg(t))
    }
    if (segs.isEmpty()) segs.add(TextSeg(md))
    return segs
}

/** Renders inline **bold** and `code` spans. */
private fun inline(text: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        when {
            text.startsWith("**", i) -> {
                val end = text.indexOf("**", i + 2)
                if (end > 0) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(text.substring(i + 2, end)) }
                    i = end + 2
                } else { append(text[i]); i++ }
            }
            text[i] == '`' -> {
                val end = text.indexOf('`', i + 1)
                if (end > 0) {
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(text.substring(i + 1, end)) }
                    i = end + 1
                } else { append(text[i]); i++ }
            }
            else -> { append(text[i]); i++ }
        }
    }
}

/** Assistant message body: plain text with bold and inline-code spans, plus
 *  fenced code blocks rendered in a copyable, monospaced, scrollable box. */
@Composable
fun MarkdownMessage(content: String, color: Color) {
    val segs = remember(content) { parse(content) }
    Column {
        segs.forEachIndexed { idx, s ->
            when (s) {
                is TextSeg -> Text(inline(s.text), color = color, fontSize = 15.sp, lineHeight = 22.sp)
                is CodeSeg -> CodeBlock(s.lang, s.code)
            }
            if (idx < segs.lastIndex) Spacer(Modifier.height(10.dp))
        }
    }
}

@Composable
private fun CodeBlock(lang: String, code: String) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1500); copied = false } }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF0B0B12)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF15151F))
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(lang, color = Color(0xFF9CA3AF), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
            Spacer(Modifier.weight(1f))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable {
                        clipboard.setText(AnnotatedString(code))
                        copied = true
                    }
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            ) {
                Icon(
                    if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    "Copy",
                    tint = Color(0xFF9CA3AF),
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(if (copied) "Copied" else "Copy", color = Color(0xFF9CA3AF), fontSize = 12.sp)
            }
        }
        Text(
            code,
            color = Color(0xFFE5E5E5),
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace,
            lineHeight = 19.sp,
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(12.dp),
        )
    }
}
