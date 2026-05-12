/**
 * PhoneFarm llama.cpp JNI Bridge
 *
 * Provides Kotlin-callable native functions for local GGUF model inference.
 * Dynamically links libllama.so when PHONEFARM_LLAMA_AVAILABLE=1.
 *
 * JNI naming convention: Java_com_phonefarm_client_vlm_LocalVlmClient_<method>
 *
 * Reference: Operit llama/src/main/cpp/llama_jni_stub.cpp (LGPLv3 — design only)
 */
#include <jni.h>
#include <android/log.h>
#include <string>
#include <cstring>

#define LOG_TAG "PhoneFarmLLaMA"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// ============================================================
// Conditional llama.cpp includes
// ============================================================
#if PHONEFARM_LLAMA_AVAILABLE
#include "llama.h"
#include "common.h"
#include "sampling.h"
#endif

// ============================================================
// Global model context state
// ============================================================
static struct {
#if PHONEFARM_LLAMA_AVAILABLE
    llama_model* model = nullptr;
    llama_context* ctx = nullptr;
    const llama_vocab* vocab = nullptr;
    llama_sampler* smpl = nullptr;
    llama_batch batch;
#endif
    bool loaded = false;
    int32_t n_gpu_layers = 0;
    int32_t gpu_backend = 0; // 0=CPU, 1=Vulkan, 2=NNAPI
    char model_path[1024] = {0};
} g_state;

// ============================================================
// Helper: clear current model state
// ============================================================
static void clearState() {
#if PHONEFARM_LLAMA_AVAILABLE
    if (g_state.smpl) { llama_sampler_free(g_state.smpl); g_state.smpl = nullptr; }
    if (g_state.ctx)  { llama_free(g_state.ctx); g_state.ctx = nullptr; }
    if (g_state.model) { llama_free_model(g_state.model); g_state.model = nullptr; }
#endif
    g_state.loaded = false;
    g_state.model_path[0] = '\0';
}

// ============================================================
// loadModel(String modelPath, int nGpuLayers, int gpuBackend) -> boolean
// ============================================================
extern "C"
JNIEXPORT jboolean JNICALL
Java_com_phonefarm_client_vlm_LocalVlmClient_nativeLoadModel(
    JNIEnv* env, jobject /* thiz */,
    jstring model_path, jint n_gpu_layers, jint gpu_backend) {

    clearState();

    const char* path = env->GetStringUTFChars(model_path, nullptr);
    strncpy(g_state.model_path, path, sizeof(g_state.model_path) - 1);
    g_state.n_gpu_layers = n_gpu_layers;
    g_state.gpu_backend = gpu_backend;
    env->ReleaseStringUTFChars(model_path, path);

    LOGI("Loading model: %s (gpu_layers=%d, backend=%d)",
         g_state.model_path, n_gpu_layers, gpu_backend);

#if PHONEFARM_LLAMA_AVAILABLE
    // Initialize llama backend (CPU or Vulkan)
    llama_backend_init();

    // Configure GPU layers
    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = n_gpu_layers;
    // Vulkan is auto-detected when GGML_VULKAN=ON at compile time
    // No extra param needed in llama_model_params for Vulkan

    // Load model from GGUF file
    g_state.model = llama_model_load_from_file(g_state.model_path, model_params);
    if (!g_state.model) {
        LOGE("Failed to load model from: %s", g_state.model_path);
        llama_backend_free();
        return JNI_FALSE;
    }

    // Get vocabulary
    g_state.vocab = llama_model_get_vocab(g_state.model);

    // Create context
    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = 2048;     // Context window size
    ctx_params.n_batch = 512;    // Batch size for prompt processing
    ctx_params.n_threads = 4;    // CPU thread count (auto-detected on Android)
    ctx_params.n_threads_batch = 4;

    g_state.ctx = llama_init_from_model(g_state.model, ctx_params);
    if (!g_state.ctx) {
        LOGE("Failed to create context for model");
        llama_free_model(g_state.model);
        g_state.model = nullptr;
        llama_backend_free();
        return JNI_FALSE;
    }

    // Create sampler (default: greedy with temperature)
    auto sparams = llama_sampler_chain_default_params();
    g_state.smpl = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(g_state.smpl,
        llama_sampler_init_greedy());

    g_state.loaded = true;
    LOGI("Model loaded successfully: %s", g_state.model_path);
    return JNI_TRUE;
#else
    LOGE("llama.cpp not linked (PHONEFARM_LLAMA_AVAILABLE=0). Placeholder stub.");
    g_state.loaded = true; // Pretend loaded for API testing
    return JNI_TRUE;
#endif
}

// ============================================================
// infer(String prompt, int maxTokens) -> String
// ============================================================
extern "C"
JNIEXPORT jstring JNICALL
Java_com_phonefarm_client_vlm_LocalVlmClient_nativeInfer(
    JNIEnv* env, jobject /* thiz */,
    jstring prompt, jint max_tokens) {

    if (!g_state.loaded) {
        LOGE("Model not loaded — cannot infer");
        return env->NewStringUTF("");
    }

    const char* prompt_utf8 = env->GetStringUTFChars(prompt, nullptr);
    std::string result;

#if PHONEFARM_LLAMA_AVAILABLE
    // Tokenize the prompt
    int n_tokens = -llama_tokenize(g_state.vocab, prompt_utf8, strlen(prompt_utf8), nullptr, 0, true, true);
    std::vector<llama_token> tokens(n_tokens);
    llama_tokenize(g_state.vocab, prompt_utf8, strlen(prompt_utf8), tokens.data(), n_tokens, true, true);

    // Process prompt in batches
    int n_past = 0;
    size_t pos = 0;
    while (pos < tokens.size()) {
        int batch_size = std::min(512, (int)(tokens.size() - pos));
        llama_batch batch = llama_batch_get_one(&tokens[pos], batch_size);
        if (llama_decode(g_state.ctx, batch) != 0) {
            LOGE("llama_decode failed during prompt processing");
            break;
        }
        pos += batch_size;
        n_past += batch_size;
    }

    // Generate response
    llama_token new_token_id;
    int n_generated = 0;
    while (n_generated < max_tokens) {
        new_token_id = llama_sampler_sample(g_state.smpl, g_state.ctx, -1);
        if (llama_vocab_is_eog(g_state.vocab, new_token_id)) break;

        char buf[256];
        int n_chars = llama_token_to_piece(g_state.vocab, new_token_id, buf, sizeof(buf), 0, true);
        if (n_chars > 0 && n_chars < (int)sizeof(buf)) {
            buf[n_chars] = '\0';
            result += buf;
        }

        // Decode single token
        llama_batch single = llama_batch_get_one(&new_token_id, 1);
        if (llama_decode(g_state.ctx, single) != 0) break;
        n_past++;
        n_generated++;
    }

    LOGI("Inference complete: %d tokens generated (max=%d)", n_generated, max_tokens);
#else
    result = "[stub] Model inference placeholder — build with llama.cpp submodule for real inference.";
#endif

    env->ReleaseStringUTFChars(prompt, prompt_utf8);
    return env->NewStringUTF(result.c_str());
}

// ============================================================
// freeModel() -> void
// ============================================================
extern "C"
JNIEXPORT void JNICALL
Java_com_phonefarm_client_vlm_LocalVlmClient_nativeFreeModel(
    JNIEnv* /* env */, jobject /* thiz */) {
    LOGI("Freeing model resources");
    clearState();
#if PHONEFARM_LLAMA_AVAILABLE
    llama_backend_free();
#endif
}

// ============================================================
// getModelInfo() -> String (JSON)
// ============================================================
extern "C"
JNIEXPORT jstring JNICALL
Java_com_phonefarm_client_vlm_LocalVlmClient_nativeGetModelInfo(
    JNIEnv* env, jobject /* thiz */) {

    if (!g_state.loaded) {
        return env->NewStringUTF("{\"loaded\":false}");
    }

#if PHONEFARM_LLAMA_AVAILABLE
    char buf[512];
    int n_ctx = llama_n_ctx(g_state.ctx);
    int n_embd = llama_model_n_embd(g_state.model);
    int n_vocab = llama_vocab_n_tokens(g_state.vocab);
    snprintf(buf, sizeof(buf),
        "{\"loaded\":true,\"n_ctx\":%d,\"n_embd\":%d,\"n_vocab\":%d,\"gpu_layers\":%d,\"backend\":%d}",
        n_ctx, n_embd, n_vocab, g_state.n_gpu_layers, g_state.gpu_backend);
    return env->NewStringUTF(buf);
#else
    return env->NewStringUTF("{\"loaded\":true,\"n_ctx\":0,\"n_embd\":0,\"n_vocab\":0,\"gpu_layers\":0,\"backend\":0,\"stub\":true}");
#endif
}

// ============================================================
// setNpuDelegate(int backend) -> boolean
// ============================================================
extern "C"
JNIEXPORT jboolean JNICALL
Java_com_phonefarm_client_vlm_LocalVlmClient_nativeSetNpuDelegate(
    JNIEnv* /* env */, jobject /* thiz */,
    jint backend) {

    // Hot-switch GPU backend requires model reload
    // Store preference; will take effect on next loadModel call
    g_state.gpu_backend = backend;
    LOGI("GPU backend preference set to: %d (effective on next load)", backend);

    // For Vulkan: auto-detected at compile time via GGML_VULKAN
    // For NNAPI: would require Android-specific delegate config
    if (backend == 2) {
        LOGI("NNAPI delegate configured (Android Neural Networks API)");
    }
    return JNI_TRUE;
}
