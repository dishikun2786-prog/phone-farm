package com.phonefarm.client.service

import android.inputmethodservice.InputMethodService
import android.text.InputType
import android.text.TextUtils
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Programmatic IME for stable text input during VLM task execution.
 *
 * Android's AccessibilityService ACTION_SET_TEXT is unreliable for:
 * - Non-ASCII characters (Chinese, Japanese, etc.)
 * - Apps that use custom EditText implementations
 * - WebView contenteditable fields
 *
 * This IME directly commits text via InputConnection.commitText(),
 * which bypasses all of those issues. The workflow:
 *
 *   1. VLM emits Type("中文内容")
 *   2. ActionExecutor switches IME to PhoneFarmIME via Settings.Secure
 *   3. PhoneFarmIME receives text via setPendingText() + onStartInputView()
 *   4. PhoneFarmIME commits the text and switches back to the previous IME
 */
class PhoneFarmInputMethodService : InputMethodService() {

    companion object {
        private const val TAG = "PhoneFarmIME"

        @Volatile
        @JvmStatic
        var instance: PhoneFarmInputMethodService? = null
    }

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    /** Pending text to commit on next input connection. */
    @Volatile
    private var pendingText: String? = null

    /** Completable for signaling text commit completion. */
    @Volatile
    private var commitDeferred: CompletableDeferred<Boolean>? = null

    /** Pending action after text commit (e.g., press ENTER). */
    @Volatile
    private var pendingAction: Int = -1 // IME_ACTION_NONE = -1

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "PhoneFarmIME created")
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
        Log.d(TAG, "PhoneFarmIME destroyed")
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        _isReady.value = true

        val text = pendingText
        if (text != null) {
            pendingText = null
            commitTextInternal(text)
        }
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        super.onFinishInputView(finishingInput)
        _isReady.value = false
    }

    /**
     * Queue text for the next input session.
     * Called by ActionExecutor before switching IME.
     *
     * @param text the text to commit
     * @param action optional post-commit IME action (e.g. IME_ACTION_SEARCH)
     * @param deferred a deferred to complete when the text has been committed
     */
    fun setPendingText(text: String, action: Int = -1, deferred: CompletableDeferred<Boolean>? = null) {
        pendingText = text
        pendingAction = action
        commitDeferred = deferred
    }

    /**
     * Check whether there is a current input connection available.
     */
    fun hasConnection(): Boolean {
        return currentInputConnection != null
    }

    private fun commitTextInternal(text: String) {
        val ic = currentInputConnection ?: run {
            Log.w(TAG, "No InputConnection available")
            commitDeferred?.complete(false)
            commitDeferred = null
            return
        }

        try {
            // Clear any existing composing text
            ic.finishComposingText()

            // Commit the text
            val committed = ic.commitText(text, 1)
            Log.d(TAG, "Committed text (${text.length} chars): $committed")

            // Execute post-commit action
            if (pendingAction >= 0) {
                ic.performEditorAction(pendingAction)
            }

            commitDeferred?.complete(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to commit text: ${e.message}")
            commitDeferred?.complete(false)
        } finally {
            commitDeferred = null
            pendingAction = -1
        }
    }

    /**
     * Switch away from this IME after text commit (handled by caller).
     */
    fun requestHide() {
        try {
            requestHideSelf(0)
        } catch (_: Exception) {}
    }
}
