# PhoneFarm — llama.cpp NDK CMake build
# Reference: Operit llama/CMakeLists.txt (LGPLv3 — design only, no code copied)
#
# Builds libllama_jni.so (dynamic link to libllama.so)
# Supports: arm64-v8a, armeabi-v7a
# GPU backends: Vulkan (preferred), NNAPI (fallback via llama.cpp built-in)

cmake_minimum_required(VERSION 3.22.1)
project("phonefarm_llama_jni")

# C++17 required by llama.cpp
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ============================================================
# llama.cpp submodule — points to third_party/llama.cpp
# ============================================================
set(LLAMA_DIR ${CMAKE_SOURCE_DIR}/third_party/llama.cpp)

# Only compile llama.cpp if the submodule exists
if(EXISTS "${LLAMA_DIR}/CMakeLists.txt")
    set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "Skip examples")
    set(LLAMA_BUILD_TESTS OFF CACHE BOOL "Skip tests")
    set(LLAMA_BUILD_SERVER OFF CACHE BOOL "Skip server")

    # Vulkan GPU backend (preferred on Android for broad device support)
    option(PHONEFARM_LLAMA_VULKAN "Enable Vulkan acceleration" ON)
    if(PHONEFARM_LLAMA_VULKAN)
        set(GGML_VULKAN ON CACHE BOOL "Enable Vulkan")
    endif()

    # NNAPI fallback on Android 8.1+ (API 27+)
    option(PHONEFARM_LLAMA_NNAPI "Enable NNAPI acceleration" OFF)

    add_subdirectory(${LLAMA_DIR} ${CMAKE_BINARY_DIR}/llama)

    set(LLAMA_TARGET llama)
else()
    message(WARNING "llama.cpp submodule not found at ${LLAMA_DIR}. Building JNI stub only.")
    set(LLAMA_TARGET "")
endif()

# ============================================================
# JNI bridge library
# ============================================================
add_library(llama_jni SHARED
    llama_jni_stub.cpp
)

target_compile_options(llama_jni PRIVATE
    -Wall
    -Wextra
    -Wno-unused-parameter
    -O2
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(llama_jni
    ${log-lib}
    ${android-lib}
)

# Link llama if available
if(TARGET ${LLAMA_TARGET})
    target_link_libraries(llama_jni llama)
    target_compile_definitions(llama_jni PRIVATE PHONEFARM_LLAMA_AVAILABLE=1)
else()
    target_compile_definitions(llama_jni PRIVATE PHONEFARM_LLAMA_AVAILABLE=0)
endif()
