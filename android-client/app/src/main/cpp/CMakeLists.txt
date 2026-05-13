# PhoneFarm — Multi-engine NDK CMake build
# ===========================================================================
# Builds three JNI shared libraries:
#   1. libllama_jni.so   — llama.cpp VLM inference (existing)
#   2. libncnn_yolo.so   — NCNN YOLO object detection (Phase 1 new)
#   3. libmnn_llm.so     — MNN LLM inference (Phase 1 new)
#
# Supported ABIs: arm64-v8a, armeabi-v7a
# GPU backends: Vulkan (preferred), NNAPI, OpenCL
# Optimization: -O2, -fopenmp (multi-threaded inference)
#
# Third-party library locations:
#   third_party/llama.cpp/ — llama.cpp submodule
#   third_party/ncnn/      — NCNN framework (https://github.com/Tencent/ncnn)
#   third_party/mnn/       — MNN framework (https://github.com/alibaba/MNN)
# ===========================================================================

cmake_minimum_required(VERSION 3.22.1)
project("phonefarm_jni")

# C++17 required by all three frameworks
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Position-independent code for shared libraries
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ===========================================================================
# Common Android system libraries
# ===========================================================================

find_library(log-lib log)
find_library(android-lib android)
find_library(jnigraphics-lib jnigraphics)
find_library(vulkan-lib vulkan)
find_library(z-lib z)

# OpenMP (multi-threaded inference)
find_library(omp-lib omp)
if(NOT omp-lib)
    # Older NDK versions
    find_library(omp-lib omp
        PATHS ${ANDROID_NDK}/toolchains/llvm/prebuilt/${ANDROID_HOST_TAG}/lib/clang
        PATH_SUFFIXES lib/linux/${ANDROID_ABI}
    )
endif()

# ============================================================================
# 1. llama.cpp submodule (existing)
# ============================================================================
set(LLAMA_DIR ${CMAKE_SOURCE_DIR}/third_party/llama.cpp)

if(EXISTS "${LLAMA_DIR}/CMakeLists.txt")
    set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "Skip examples")
    set(LLAMA_BUILD_TESTS OFF CACHE BOOL "Skip tests")
    set(LLAMA_BUILD_SERVER OFF CACHE BOOL "Skip server")

    option(PHONEFARM_LLAMA_VULKAN "Enable Vulkan acceleration" ON)
    if(PHONEFARM_LLAMA_VULKAN)
        set(GGML_VULKAN ON CACHE BOOL "Enable Vulkan")
    endif()

    option(PHONEFARM_LLAMA_NNAPI "Enable NNAPI acceleration" OFF)

    add_subdirectory(${LLAMA_DIR} ${CMAKE_BINARY_DIR}/llama)
    set(LLAMA_TARGET llama)
else()
    message(WARNING "llama.cpp submodule not found at ${LLAMA_DIR}. Building JNI stub only.")
    set(LLAMA_TARGET "")
endif()

# ── libllama_jni.so ──
add_library(llama_jni SHARED
    llama_jni_stub.cpp
)

target_compile_options(llama_jni PRIVATE
    -Wall
    -Wextra
    -Wno-unused-parameter
    -O2
)

target_link_libraries(llama_jni
    ${log-lib}
    ${android-lib}
)

if(TARGET ${LLAMA_TARGET})
    target_link_libraries(llama_jni llama)
    target_compile_definitions(llama_jni PRIVATE PHONEFARM_LLAMA_AVAILABLE=1)
else()
    target_compile_definitions(llama_jni PRIVATE PHONEFARM_LLAMA_AVAILABLE=0)
endif()

# ============================================================================
# 2. NCNN YOLO Object Detection
# ============================================================================
set(NCNN_DIR ${CMAKE_SOURCE_DIR}/third_party/ncnn)

# Check if NCNN header-only install or full build
set(NCNN_HEADER_DIR "${NCNN_DIR}/src")
if(NOT EXISTS "${NCNN_HEADER_DIR}")
    set(NCNN_HEADER_DIR "${NCNN_DIR}/include/ncnn")
endif()

# Check if prebuilt NCNN libraries exist
if(EXISTS "${NCNN_DIR}/lib/${ANDROID_ABI}/libncnn.a")
    set(NCNN_PREBUILT ON)
    set(NCNN_LIB_DIR "${NCNN_DIR}/lib/${ANDROID_ABI}")
    set(NCNN_INCLUDE_DIR "${NCNN_DIR}/include")
    message(STATUS "NCNN: using prebuilt libraries at ${NCNN_LIB_DIR}")
elseif(EXISTS "${NCNN_DIR}/build/install/lib/libncnn.a")
    set(NCNN_PREBUILT ON)
    set(NCNN_LIB_DIR "${NCNN_DIR}/build/install/lib")
    set(NCNN_INCLUDE_DIR "${NCNN_DIR}/build/install/include")
    message(STATUS "NCNN: using build install at ${NCNN_LIB_DIR}")
elseif(EXISTS "${NCNN_DIR}/CMakeLists.txt")
    set(NCNN_PREBUILT OFF)
    message(STATUS "NCNN: building from source at ${NCNN_DIR}")

    # Build NCNN as a static library
    set(NCNN_BUILD_TOOLS OFF CACHE BOOL "Skip NCNN tools")
    set(NCNN_BUILD_EXAMPLES OFF CACHE BOOL "Skip NCNN examples")
    set(NCNN_BUILD_BENCHMARK OFF CACHE BOOL "Skip NCNN benchmarks")
    set(NCNN_VULKAN ON CACHE BOOL "Enable NCNN Vulkan backend")
    set(NCNN_BUILD_TESTS OFF CACHE BOOL "Skip NCNN tests")
    set(NCNN_DISABLE_RTTI OFF CACHE BOOL "Enable RTTI")
    set(NCNN_DISABLE_EXCEPTION OFF CACHE BOOL "Enable exceptions")

    add_subdirectory(${NCNN_DIR} ${CMAKE_BINARY_DIR}/ncnn)
    set(NCNN_TARGET ncnn)
    set(NCNN_INCLUDE_DIR "${NCNN_DIR}/src")
else()
    message(WARNING "NCNN not found at ${NCNN_DIR}. ncnn_yolo will be a stub library.")
    set(NCNN_PREBUILT OFF)
    set(NCNN_AVAILABLE OFF)
endif()

# ── libncnn_yolo.so ──
add_library(ncnn_yolo SHARED
    ncnn_yolo_jni.cpp
)

target_include_directories(ncnn_yolo PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${NCNN_INCLUDE_DIR}
)

target_compile_options(ncnn_yolo PRIVATE
    -Wall
    -Wextra
    -Wno-unused-parameter
    -O2
)

# OpenMP for multi-threaded inference
if(omp-lib)
    target_compile_options(ncnn_yolo PRIVATE -fopenmp)
    target_link_libraries(ncnn_yolo ${omp-lib})
endif()

target_link_libraries(ncnn_yolo
    ${log-lib}
    ${android-lib}
    ${jnigraphics-lib}
)

# Link NCNN
if(TARGET ncnn)
    target_link_libraries(ncnn_yolo ncnn)
    target_compile_definitions(ncnn_yolo PRIVATE PHONEFARM_NCNN_AVAILABLE=1)
elseif(NCNN_PREBUILT)
    # Link prebuilt ncnn static library
    target_link_libraries(ncnn_yolo
        ${NCNN_LIB_DIR}/libncnn.a
    )
    if(EXISTS "${NCNN_LIB_DIR}/libglslang.a")
        target_link_libraries(ncnn_yolo
            ${NCNN_LIB_DIR}/libglslang.a
            ${NCNN_LIB_DIR}/libOGLCompiler.a
            ${NCNN_LIB_DIR}/libOSDependent.a
            ${NCNN_LIB_DIR}/libSPIRV.a
        )
    endif()
    target_compile_definitions(ncnn_yolo PRIVATE PHONEFARM_NCNN_AVAILABLE=1)
else()
    target_compile_definitions(ncnn_yolo PRIVATE PHONEFARM_NCNN_AVAILABLE=0)
endif()

# Vulkan support for NCNN
if(PHONEFARM_LLAMA_VULKAN AND vulkan-lib)
    target_link_libraries(ncnn_yolo ${vulkan-lib})
endif()

# ============================================================================
# 3. MNN LLM Inference
# ============================================================================
set(MNN_DIR ${CMAKE_SOURCE_DIR}/third_party/mnn)

# Check for prebuilt or source MNN
if(EXISTS "${MNN_DIR}/lib/${ANDROID_ABI}/libMNN.a")
    set(MNN_PREBUILT ON)
    set(MNN_LIB_DIR "${MNN_DIR}/lib/${ANDROID_ABI}")
    set(MNN_INCLUDE_DIR "${MNN_DIR}/include")
    message(STATUS "MNN: using prebuilt libraries at ${MNN_LIB_DIR}")
elseif(EXISTS "${MNN_DIR}/build/libMNN.a")
    set(MNN_PREBUILT ON)
    set(MNN_LIB_DIR "${MNN_DIR}/build")
    set(MNN_INCLUDE_DIR "${MNN_DIR}/include")
    message(STATUS "MNN: using build output at ${MNN_LIB_DIR}")
elseif(EXISTS "${MNN_DIR}/CMakeLists.txt")
    set(MNN_PREBUILT OFF)
    message(STATUS "MNN: building from source at ${MNN_DIR}")

    # MNN build configuration
    set(MNN_BUILD_SHARED_LIBS OFF CACHE BOOL "Build MNN as static")
    set(MNN_BUILD_CONVERTER OFF CACHE BOOL "Skip MNN converter")
    set(MNN_BUILD_TRAIN OFF CACHE BOOL "Skip MNN training")
    set(MNN_BUILD_DEMO OFF CACHE BOOL "Skip MNN demos")
    set(MNN_BUILD_TOOLS OFF CACHE BOOL "Skip MNN tools")
    set(MNN_BUILD_QUANTOOLS OFF CACHE BOOL "Skip quantization tools")
    set(MNN_BUILD_BENCHMARK OFF CACHE BOOL "Skip benchmark")
    set(MNN_BUILD_TEST OFF CACHE BOOL "Skip tests")
    set(MNN_VULKAN ON CACHE BOOL "Enable MNN Vulkan backend")
    set(MNN_OPENMP ON CACHE BOOL "Enable OpenMP")
    set(MNN_OPENCL OFF CACHE BOOL "Disable OpenCL (use Vulkan)")
    set(MNN_ARM82 OFF CACHE BOOL "Disable ARMv8.2 (compatibility)")
    set(MNN_SUPPORT_BF16 OFF CACHE BOOL "Disable BF16")
    set(MNN_BUILD_MINI OFF CACHE BOOL "Full build (not mini)")

    add_subdirectory(${MNN_DIR} ${CMAKE_BINARY_DIR}/mnn)
    set(MNN_TARGET MNN)
    set(MNN_INCLUDE_DIR "${MNN_DIR}/include")
else()
    message(WARNING "MNN not found at ${MNN_DIR}. mnn_llm will be a stub library.")
    set(MNN_PREBUILT OFF)
    set(MNN_AVAILABLE OFF)
endif()

# MNN expression library (for LLM support)
if(TARGET MNN)
    if(EXISTS "${MNN_DIR}/express/CMakeLists.txt")
        add_subdirectory(${MNN_DIR}/express ${CMAKE_BINARY_DIR}/mnn_express)
        set(MNN_EXPRESS_TARGET MNN_Express)
    endif()
endif()

# ── libmnn_llm.so ──
add_library(mnn_llm SHARED
    mnn_llm_jni.cpp
)

target_include_directories(mnn_llm PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${MNN_INCLUDE_DIR}
    ${MNN_DIR}  # For expression module headers
)

target_compile_options(mnn_llm PRIVATE
    -Wall
    -Wextra
    -Wno-unused-parameter
    -O2
)

# OpenMP
if(omp-lib)
    target_compile_options(mnn_llm PRIVATE -fopenmp)
    target_link_libraries(mnn_llm ${omp-lib})
endif()

target_link_libraries(mnn_llm
    ${log-lib}
    ${android-lib}
    ${z-lib}
)

# Link MNN
if(TARGET MNN)
    target_link_libraries(mnn_llm MNN)
    if(TARGET MNN_Express)
        target_link_libraries(mnn_llm MNN_Express)
    endif()
    target_compile_definitions(mnn_llm PRIVATE PHONEFARM_MNN_AVAILABLE=1)
elseif(MNN_PREBUILT)
    target_link_libraries(mnn_llm
        ${MNN_LIB_DIR}/libMNN.a
    )
    if(EXISTS "${MNN_LIB_DIR}/libMNN_Express.a")
        target_link_libraries(mnn_llm
            ${MNN_LIB_DIR}/libMNN_Express.a
        )
    endif()
    target_compile_definitions(mnn_llm PRIVATE PHONEFARM_MNN_AVAILABLE=1)
else()
    target_compile_definitions(mnn_llm PRIVATE PHONEFARM_MNN_AVAILABLE=0)
endif()

# Vulkan support for MNN
if(PHONEFARM_LLAMA_VULKAN AND vulkan-lib)
    target_link_libraries(mnn_llm ${vulkan-lib})
endif()

# ============================================================================
# Platform-specific optimizations
# ============================================================================

# ARM NEON (auto-enabled by NDK for arm64-v8a and armeabi-v7a with neon)
if(${ANDROID_ABI} MATCHES "armeabi-v7a")
    # For 32-bit ARM, NEON might not be enabled automatically
    target_compile_options(llama_jni PRIVATE -mfpu=neon)
    target_compile_options(ncnn_yolo PRIVATE -mfpu=neon)
    target_compile_options(mnn_llm PRIVATE -mfpu=neon)
endif()

# Linker flags
set_target_properties(llama_jni ncnn_yolo mnn_llm PROPERTIES
    LINKER_LANGUAGE CXX
)

# Strip debug symbols in release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release" OR CMAKE_BUILD_TYPE STREQUAL "MinSizeRel")
    set_target_properties(llama_jni ncnn_yolo mnn_llm PROPERTIES
        LINK_FLAGS "-s -Wl,--gc-sections"
    )
endif()

# ============================================================================
# Summary
# ============================================================================

message(STATUS "")
message(STATUS "PhoneFarm NDK Build Configuration:")
message(STATUS "  Target ABI:        ${ANDROID_ABI}")
message(STATUS "  Build type:        ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ Standard:      C++${CMAKE_CXX_STANDARD}")
message(STATUS "  llama.cpp:         ${LLAMA_TARGET} (Vulkan: ${PHONEFARM_LLAMA_VULKAN})")
message(STATUS "  ncnn_yolo:         ${NCNN_PREBUILT} (Vulkan: ${PHONEFARM_LLAMA_VULKAN})")
message(STATUS "  mnn_llm:           ${MNN_PREBUILT} (Vulkan: ${PHONEFARM_LLAMA_VULKAN})")
message(STATUS "  OpenMP:            ${omp-lib}")
message(STATUS "  Vulkan:            ${vulkan-lib}")
message(STATUS "  jnigraphics:       ${jnigraphics-lib}")
message(STATUS "")
