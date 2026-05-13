/**
 * PhoneFarm NCNN YOLO JNI Bridge
 *
 * Provides Kotlin-callable native functions for NCNN-based object detection.
 * Links libncnn.a when PHONEFARM_NCNN_AVAILABLE=1.
 *
 * JNI naming: Java_com_phonefarm_client_edge_ncnn_NcnnYoloBridge_<method>
 *
 * Supported backends: CPU (always), Vulkan (when available).
 * Model format: NCNN .param + .bin files (YOLOv8-nano recommended).
 */

#include <jni.h>
#include <android/log.h>
#include <string>
#include <cstring>
#include <vector>
#include <cmath>

#define LOG_TAG "PhoneFarmNCNN"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// ============================================================
// Conditional NCNN includes
// ============================================================
#if PHONEFARM_NCNN_AVAILABLE
#include "net.h"
#include "layer.h"
#include "cpu.h"
#if NCNN_VULKAN
#include "gpu.h"
#endif
#endif

// ============================================================
// YOLO detection result structure (matches Kotlin data class)
// ============================================================
struct DetectionResult {
    std::string label;
    float confidence;
    float x;
    float y;
    float w;
    float h;
};

// ============================================================
// Global model state
// ============================================================
static struct {
#if PHONEFARM_NCNN_AVAILABLE
    ncnn::Net* net = nullptr;
#endif
    bool loaded = false;
    char model_path[1024] = {0};
    char param_path[1024] = {0};

    // YOLO input size
    int input_width = 640;
    int input_height = 640;

    // Detection parameters
    float nms_threshold = 0.45f;
    float conf_threshold = 0.25f;

    // Class names (YOLOv8 COCO + custom UI classes)
    std::vector<std::string> class_names;
} g_yolo;

// ============================================================
// Helper: initialize class names
// ============================================================
static void initClassNames() {
    g_yolo.class_names.clear();
    // COCO classes (indices 0-79)
    g_yolo.class_names = {
        "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
        "boat", "traffic_light", "fire_hydrant", "stop_sign", "parking_meter",
        "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant",
        "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie",
        "suitcase", "frisbee", "skis", "snowboard", "sports_ball", "kite",
        "baseball_bat", "baseball_glove", "skateboard", "surfboard",
        "tennis_racket", "bottle", "wine_glass", "cup", "fork", "knife", "spoon",
        "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot",
        "hot_dog", "pizza", "donut", "cake", "chair", "couch", "potted_plant",
        "bed", "dining_table", "toilet", "tv", "laptop", "mouse", "remote",
        "keyboard", "cell_phone", "microwave", "oven", "toaster", "sink",
        "refrigerator", "book", "clock", "vase", "scissors", "teddy_bear",
        "hair_drier", "toothbrush",
        // PhoneFarm custom UI classes (indices 80+)
        "button", "text_field", "icon", "popup", "dialog", "keyboard",
        "tab_bar", "nav_bar", "search_bar", "checkbox", "toggle", "slider",
        "image", "badge", "notification", "progress_bar", "loading_spinner",
        "menu_item", "card", "list_item", "toolbar", "status_bar"
    };
}

// ============================================================
// Helper: clear model state
// ============================================================
static void clearYoloState() {
#if PHONEFARM_NCNN_AVAILABLE
    if (g_yolo.net) {
        g_yolo.net->clear();
        delete g_yolo.net;
        g_yolo.net = nullptr;
    }
#endif
    g_yolo.loaded = false;
    g_yolo.model_path[0] = '\0';
    g_yolo.param_path[0] = '\0';
}

// ============================================================
// nativeInit(String modelPath, String paramPath) -> boolean
// ============================================================
extern "C"
JNIEXPORT jboolean JNICALL
Java_com_phonefarm_client_edge_ncnn_NcnnYoloBridge_nativeInit(
    JNIEnv* env, jclass /* clazz */,
    jstring model_path, jstring param_path) {

    clearYoloState();

    const char* mp = env->GetStringUTFChars(model_path, nullptr);
    const char* pp = env->GetStringUTFChars(param_path, nullptr);

    strncpy(g_yolo.model_path, mp, sizeof(g_yolo.model_path) - 1);
    strncpy(g_yolo.param_path, pp, sizeof(g_yolo.param_path) - 1);

    env->ReleaseStringUTFChars(model_path, mp);
    env->ReleaseStringUTFChars(param_path, pp);

    LOGI("Initializing NCNN YOLO model:");
    LOGI("  Model:  %s", g_yolo.model_path);
    LOGI("  Params: %s", g_yolo.param_path);

#if PHONEFARM_NCNN_AVAILABLE
    // Initialize class names
    initClassNames();

    // Create NCNN net
    g_yolo.net = new ncnn::Net();
    if (!g_yolo.net) {
        LOGE("Failed to allocate NCNN Net");
        return JNI_FALSE;
    }

    // Configure Vulkan backend if available
#if NCNN_VULKAN
    int cpu_count = ncnn::get_cpu_count();
    LOGI("CPU count: %d", cpu_count);

    g_yolo.net->opt.use_vulkan_compute = true;
    g_yolo.net->opt.use_fp16_packed = true;
    g_yolo.net->opt.use_fp16_storage = true;
    g_yolo.net->opt.use_fp16_arithmetic = true;
    g_yolo.net->opt.num_threads = cpu_count;

    LOGI("Vulkan compute enabled for NCNN (fp16)");
#else
    g_yolo.net->opt.use_vulkan_compute = false;
    g_yolo.net->opt.num_threads = ncnn::get_cpu_count();
    LOGI("Vulkan not available, using CPU only");
#endif

    // Load model
    int ret_param = g_yolo.net->load_param(g_yolo.param_path);
    if (ret_param != 0) {
        LOGE("Failed to load param file: %s (error %d)", g_yolo.param_path, ret_param);
        delete g_yolo.net;
        g_yolo.net = nullptr;
        return JNI_FALSE;
    }

    int ret_model = g_yolo.net->load_model(g_yolo.model_path);
    if (ret_model != 0) {
        LOGE("Failed to load model file: %s (error %d)", g_yolo.model_path, ret_model);
        g_yolo.net->clear();
        delete g_yolo.net;
        g_yolo.net = nullptr;
        return JNI_FALSE;
    }

    g_yolo.loaded = true;
    LOGI("NCNN YOLO model loaded successfully");
    return JNI_TRUE;
#else
    LOGE("NCNN not linked (PHONEFARM_NCNN_AVAILABLE=0). Stub.");
    g_yolo.loaded = true; // Pretend loaded for testing
    initClassNames();
    return JNI_TRUE;
#endif
}

// ============================================================
// Helper: YOLO detection post-processing
// ============================================================
#if PHONEFARM_NCNN_AVAILABLE
static std::vector<DetectionResult> yoloPostProcess(
    const ncnn::Mat& output,
    int img_w, int img_h,
    float threshold) {

    std::vector<DetectionResult> results;

    // YOLOv8 output format: [batch, 84, 8400] for 80-class model
    // Or [batch, (4+num_classes), num_boxes]
    // Each detection: [x_center, y_center, width, height, class_0_conf, ..., class_N_conf]

    int num_classes = (int)g_yolo.class_names.size();
    int num_boxes = output.h;       // Number of candidate boxes
    int num_features = output.w;    // 4 (bbox) + num_classes (scores)

    if (num_features < 5) {
        LOGE("Unexpected output dimensions: w=%d, h=%d (expected 4+classes, num_boxes)",
             output.w, output.h);
        return results;
    }

    // Scale factors
    float scale_x = (float)img_w / g_yolo.input_width;
    float scale_y = (float)img_h / g_yolo.input_height;

    for (int i = 0; i < num_boxes; i++) {
        const float* row = output.row(i);

        // Find max class confidence
        float max_conf = 0.0f;
        int max_class = 0;
        for (int c = 0; c < num_classes && (4 + c) < num_features; c++) {
            float conf = row[4 + c];
            if (conf > max_conf) {
                max_conf = conf;
                max_class = c;
            }
        }

        // Filter by confidence threshold
        if (max_conf < threshold) continue;

        // Extract bounding box (YOLOv8 format: cx, cy, w, h normalized)
        float cx = row[0];
        float cy = row[1];
        float bw = row[2];
        float bh = row[3];

        // Convert to pixel coordinates
        float x1 = (cx - bw / 2.0f) * scale_x;
        float y1 = (cy - bh / 2.0f) * scale_y;
        float x2 = (cx + bw / 2.0f) * scale_x;
        float y2 = (cy + bh / 2.0f) * scale_y;

        // Clamp to image bounds
        x1 = std::max(0.0f, std::min(x1, (float)img_w));
        y1 = std::max(0.0f, std::min(y1, (float)img_h));
        x2 = std::max(0.0f, std::min(x2, (float)img_w));
        y2 = std::max(0.0f, std::min(y2, (float)img_h));

        float w = x2 - x1;
        float h = y2 - y1;

        // Skip invalid boxes
        if (w <= 0 || h <= 0) continue;

        // Get class label
        std::string label;
        if (max_class >= 0 && max_class < (int)g_yolo.class_names.size()) {
            label = g_yolo.class_names[max_class];
        } else {
            label = "object_" + std::to_string(max_class);
        }

        results.push_back({label, max_conf, x1, y1, w, h});
    }

    // Simple NMS (Non-Maximum Suppression)
    // Sort by confidence descending
    std::sort(results.begin(), results.end(),
        [](const DetectionResult& a, const DetectionResult& b) {
            return a.confidence > b.confidence;
        });

    std::vector<DetectionResult> nms_results;
    std::vector<bool> suppressed(results.size(), false);

    for (size_t i = 0; i < results.size(); i++) {
        if (suppressed[i]) continue;

        nms_results.push_back(results[i]);

        for (size_t j = i + 1; j < results.size(); j++) {
            if (suppressed[j]) continue;

            // Calculate IoU
            float ix1 = std::max(results[i].x, results[j].x);
            float iy1 = std::max(results[i].y, results[j].y);
            float ix2 = std::min(results[i].x + results[i].w, results[j].x + results[j].w);
            float iy2 = std::min(results[i].y + results[i].h, results[j].y + results[j].h);

            float inter_area = std::max(0.0f, ix2 - ix1) * std::max(0.0f, iy2 - iy1);
            float area_i = results[i].w * results[i].h;
            float area_j = results[j].w * results[j].h;
            float union_area = area_i + area_j - inter_area;

            if (union_area > 0 && inter_area / union_area > g_yolo.nms_threshold) {
                suppressed[j] = true;
            }
        }
    }

    return nms_results;
}
#endif

// ============================================================
// nativeDetect(byte[] frameData, int width, int height, float threshold) -> DetectionResult[]
// ============================================================
extern "C"
JNIEXPORT jobjectArray JNICALL
Java_com_phonefarm_client_edge_ncnn_NcnnYoloBridge_nativeDetect(
    JNIEnv* env, jclass /* clazz */,
    jbyteArray frame_data, jint width, jint height, jfloat threshold) {

    if (!g_yolo.loaded) {
        LOGE("Model not loaded — cannot detect");
        return nullptr;
    }

    // ============================================================
    // Create Java DetectionResult object
    // ============================================================
    jclass detClass = env->FindClass(
        "com/phonefarm/client/edge/ncnn/NcnnYoloBridge$DetectedObject");
    if (!detClass) {
        LOGE("Failed to find DetectedObject class");
        return nullptr;
    }

    jmethodID detCtor = env->GetMethodID(detClass, "<init>",
        "(Ljava/lang/String;FFFFF)V");
    if (!detCtor) {
        LOGE("Failed to find DetectedObject constructor");
        return nullptr;
    }

#if PHONEFARM_NCNN_AVAILABLE
    // Get input data
    jsize data_len = env->GetArrayLength(frame_data);
    jbyte* data = env->GetByteArrayElements(frame_data, nullptr);
    if (!data) {
        LOGE("Failed to get frame data");
        return nullptr;
    }

    // Convert RGBA to NCNN Mat (BGR format, normalized)
    ncnn::Mat in = ncnn::Mat::from_pixels(
        reinterpret_cast<const unsigned char*>(data),
        ncnn::Mat::PIXEL_RGBA2BGR, width, height);

    env->ReleaseByteArrayElements(frame_data, data, JNI_ABORT);

    // Resize to model input size
    ncnn::Mat in_resized;
    ncnn::resize_bilinear(in, in_resized, g_yolo.input_width, g_yolo.input_height);

    // Normalize: (pixel / 255.0 - mean) / std  (YOLOv8 default mean=0, std=1/255)
    const float mean_vals[3] = {0.0f, 0.0f, 0.0f};
    const float norm_vals[3] = {1.0f / 255.0f, 1.0f / 255.0f, 1.0f / 255.0f};
    in_resized.substract_mean_normalize(mean_vals, norm_vals);

    // Run inference
    ncnn::Extractor ex = g_yolo.net->create_extractor();
    ex.set_light_mode(true);
    ex.set_num_threads(4);

    int ret = ex.input("images", in_resized);
    if (ret != 0) {
        LOGE("Failed to set input 'images': error %d", ret);
        return nullptr;
    }

    ncnn::Mat output;
    ret = ex.extract("output0", output);
    if (ret != 0) {
        LOGE("Failed to extract output 'output0': error %d", ret);
        return nullptr;
    }

    // Post-process detections
    std::vector<DetectionResult> detections = yoloPostProcess(
        output, width, height, threshold);

    LOGI("NCNN detection: %zu objects found", detections.size());

    // Build Java array
    jobjectArray result = env->NewObjectArray(
        (jsize)detections.size(), detClass, nullptr);

    for (size_t i = 0; i < detections.size(); i++) {
        const auto& d = detections[i];
        jstring label = env->NewStringUTF(d.label.c_str());
        jobject obj = env->NewObject(detClass, detCtor,
            label, d.confidence, d.x, d.y, d.w, d.h);
        env->SetObjectArrayElement(result, (jsize)i, obj);
        env->DeleteLocalRef(label);
        env->DeleteLocalRef(obj);
    }

    return result;
#else
    // Stub: return empty array
    LOGD("NCNN stub: returning empty detection list");
    return env->NewObjectArray(0, detClass, nullptr);
#endif
}

// ============================================================
// nativeRelease() -> void
// ============================================================
extern "C"
JNIEXPORT void JNICALL
Java_com_phonefarm_client_edge_ncnn_NcnnYoloBridge_nativeRelease(
    JNIEnv* /* env */, jclass /* clazz */) {

    LOGI("Releasing NCNN YOLO model resources");
    clearYoloState();
}

// ============================================================
// JNI_OnLoad — library initialization
// ============================================================
jint JNI_OnLoad(JavaVM* vm, void* /* reserved */) {
    LOGI("libncnn_yolo.so loaded — PhoneFarm NCNN YOLO JNI bridge");
#if PHONEFARM_NCNN_AVAILABLE
    LOGI("NCNN version: %s", ncnn::get_ncnn_version().c_str());
#else
    LOGI("NCNN stub mode (PHONEFARM_NCNN_AVAILABLE=0)");
#endif
    return JNI_VERSION_1_6;
}
