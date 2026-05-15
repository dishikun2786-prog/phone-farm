package com.phonefarm.client.assistant

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.phonefarm.client.ui.theme.PhoneFarmTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Full-screen AI Assistant chat activity.
 *
 * Launched from the home screen FAB or floating chat button.
 * Uses [AssistantViewModel] (@Singleton) injected via Hilt.
 */
@AndroidEntryPoint
class AssistantActivity : ComponentActivity() {

    @Inject
    lateinit var viewModel: AssistantViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        viewModel.showOnboardingIfNeeded()

        setContent {
            PhoneFarmTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AssistantChatScreen(
                        viewModel = viewModel,
                        onBack = { finish() },
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            viewModel.onCleared()
        }
    }
}
