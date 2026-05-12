package com.phonefarm.client.floating

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Speech-to-text integration for the float window.
 *
 * Converts user voice input to text for task submission in the float chat.
 * Uses Android's built-in SpeechRecognizer with online/offline support.
 *
 * Flow:
 *   1. User taps mic button -> start listening
 *   2. Intermediate results displayed as live transcript
 *   3. Final result auto-submitted to FloatChatViewModel.sendTask()
 *
 * Offline support: Downloads language model via Play Services to enable
 * speech recognition without network.
 */
@Singleton
class FloatVoiceInput @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    /**
     * Start listening for voice input.
     *
     * @param onPartialResult Called with intermediate recognition results (live transcript).
     * @param onFinalResult   Called with the final recognized text.
     * @param onError         Called if recognition fails with a user-friendly message.
     */
    fun startListening(
        onPartialResult: (String) -> Unit,
        onFinalResult: (String) -> Unit,
        onError: (String) -> Unit,
    ) {
        if (isListening) return

        // Check RECORD_AUDIO permission
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            onError("Microphone permission not granted")
            return
        }

        // Check if speech recognition is available
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onError("Speech recognition not available on this device")
            return
        }

        // Create and configure SpeechRecognizer
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    isListening = true
                }

                override fun onBeginningOfSpeech() {
                    // User started speaking
                }

                override fun onRmsChanged(rmsdB: Float) {
                    // Audio level changed 鈥?could be used for VU meter
                }

                override fun onBufferReceived(buffer: ByteArray?) {
                    // Raw audio buffer
                }

                override fun onEndOfSpeech() {
                    isListening = false
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val partial = matches?.firstOrNull() ?: return
                    onPartialResult(partial)
                }

                override fun onResults(results: Bundle?) {
                    isListening = false
                    val matches = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val final = matches?.firstOrNull()
                    if (final != null) {
                        onFinalResult(final)
                    } else {
                        onError("No speech recognized")
                    }
                }

                override fun onError(error: Int) {
                    isListening = false
                    val message = when (error) {
                        SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                        SpeechRecognizer.ERROR_CLIENT -> "Client error"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                        SpeechRecognizer.ERROR_NETWORK -> "Network error 鈥?check connectivity"
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                        SpeechRecognizer.ERROR_NO_MATCH -> "No speech match found"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer is busy"
                        SpeechRecognizer.ERROR_SERVER -> "Server error"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected"
                        else -> "Recognition error (code: $error)"
                    }
                    onError(message)
                }

                override fun onEvent(eventType: Int, params: Bundle?) {
                    // Reserved events
                }
            })

            // Start listening
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, java.util.Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
            }
            startListening(intent)
        }
    }

    /**
     * Stop listening and finalize the recognition.
     */
    fun stopListening() {
        isListening = false
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null
    }

    /**
     * Check whether speech recognition is available on this device.
     */
    fun isAvailable(): Boolean {
        return SpeechRecognizer.isRecognitionAvailable(context)
    }

    /**
     * Cancel listening without finalizing (e.g., user dismisses).
     */
    fun cancel() {
        isListening = false
        speechRecognizer?.cancel()
        speechRecognizer?.destroy()
        speechRecognizer = null
    }
}
