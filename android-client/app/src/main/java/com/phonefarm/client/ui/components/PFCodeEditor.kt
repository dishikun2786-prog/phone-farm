package com.phonefarm.client.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Simple keyword lists for syntax highlighting
private val keywords = setOf(
    "function", "var", "let", "const", "if", "else", "for", "while",
    "return", "true", "false", "null", "new", "this", "switch", "case",
    "break", "continue", "try", "catch", "finally", "throw", "async", "await"
)

private val domKeywords = setOf(
    "click", "swipe", "sleep", "log", "waitForElement", "text", "desc",
    "id", "className", "app", "launch", "back", "home", "recents",
    "input", "paste", "scrollDown", "scrollUp", "longClick",
    "findElement", "findElements"
)

private val typeColors = mapOf(
    "keyword" to Color(0xFF7B1FA2),       // Purple
    "domKeyword" to Color(0xFF1565C0),     // Blue
    "string" to Color(0xFF2E7D32),         // Green
    "comment" to Color(0xFF757575),        // Gray
    "number" to Color(0xFFE65100),         // Orange
    "function" to Color(0xFFC62828),       // Red
    "operator" to Color(0xFF00838F),       // Teal
    "default" to Color.Unspecified
)

@Composable
fun PFCodeEditor(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    showLineNumbers: Boolean = true,
    fontSize: Int = 13,
    minLines: Int = 10
) {
    val verticalScrollState = rememberScrollState()
    val horizontalScrollState = rememberScrollState()

    val lineCount = value.text.lines().size

    Row(modifier = modifier.fillMaxWidth()) {
        // Line numbers
        if (showLineNumbers) {
            Column(
                modifier = Modifier
                    .width(44.dp)
                    .verticalScroll(verticalScrollState)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                    .padding(vertical = 12.dp),
                horizontalAlignment = Alignment.End
            ) {
                for (i in 1..maxOf(lineCount, minLines)) {
                    Text(
                        text = "$i",
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize = fontSize.sp,
                            lineHeight = 20.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.padding(end = 8.dp)
                    )
                }
            }

            // Separator
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            )
        }

        // Code area
        Box(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(verticalScrollState)
                .horizontalScroll(horizontalScrollState)
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
                    .defaultMinSize(
                        minWidth = 300.dp,
                        minHeight = (minLines * 20).dp
                    ),
                readOnly = readOnly,
                textStyle = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = fontSize.sp,
                    lineHeight = 20.sp,
                    color = MaterialTheme.colorScheme.onSurface
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                decorationBox = { innerTextField ->
                    if (value.text.isEmpty()) {
                        Text(
                            text = "// 在此编写脚本...",
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = FontFamily.Monospace,
                                fontSize = fontSize.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                            )
                        )
                    }
                    innerTextField()
                }
            )
        }
    }
}

/**
 * Builds an AnnotatedString with syntax highlighting for PhoneFarm scripts.
 */
fun highlightCode(code: String, defaultColor: Color = Color.Unspecified): AnnotatedString {
    return buildAnnotatedString {
        var i = 0
        while (i < code.length) {
            when {
                // Line comment: //
                i + 1 < code.length && code[i] == '/' && code[i + 1] == '/' -> {
                    val end = code.indexOf('\n', i).let { if (it == -1) code.length else it }
                    withStyle(SpanStyle(color = typeColors["comment"]!!)) {
                        append(code.substring(i, end))
                    }
                    i = end
                }
                // Block comment: /* ... */
                i + 1 < code.length && code[i] == '/' && code[i + 1] == '*' -> {
                    val end = code.indexOf("*/", i + 2).let { if (it == -1) code.length else it + 2 }
                    withStyle(SpanStyle(color = typeColors["comment"]!!)) {
                        append(code.substring(i, end))
                    }
                    i = end
                }
                // String literals
                code[i] == '"' || code[i] == '\'' || code[i] == '`' -> {
                    val quote = code[i]
                    val start = i
                    i++
                    while (i < code.length && code[i] != quote) {
                        if (code[i] == '\\') i++ // skip escape
                        i++
                    }
                    if (i < code.length) i++ // closing quote
                    withStyle(SpanStyle(color = typeColors["string"]!!)) {
                        append(code.substring(start, i))
                    }
                }
                // Numbers
                code[i].isDigit() -> {
                    val start = i
                    while (i < code.length && (code[i].isDigit() || code[i] == '.')) i++
                    withStyle(SpanStyle(color = typeColors["number"]!!)) {
                        append(code.substring(start, i))
                    }
                }
                // Word: identifiers and keywords
                code[i].isLetter() || code[i] == '_' || code[i] == '$' -> {
                    val start = i
                    while (i < code.length && (code[i].isLetterOrDigit() || code[i] == '_' || code[i] == '$')) i++
                    val word = code.substring(start, i)

                    val color = when {
                        keywords.contains(word) -> typeColors["keyword"]!!
                        domKeywords.contains(word) -> typeColors["domKeyword"]!!
                        i < code.length && code[i] == '(' -> typeColors["function"]!!
                        else -> defaultColor
                    }

                    withStyle(SpanStyle(color = color, fontWeight = if (keywords.contains(word)) FontWeight.Bold else FontWeight.Normal)) {
                        append(word)
                    }
                }
                else -> {
                    append(code[i])
                    i++
                }
            }
        }
    }
}
