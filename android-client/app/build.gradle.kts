plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.phonefarm.client"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.phonefarm.client"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        vectorDrawables {
            useSupportLibrary = true
        }

        // Room schema export
        ksp {
            arg("room.schemaLocation", "$projectDir/schemas")
        }

        // NDK ABI filters — arm64 only for llama.cpp (armeabi-v7a optional)
        ndk {
            abiFilters += listOf("arm64-v8a")
        }
    }

    // =========================================================================
    // NDK / CMake configuration for llama.cpp JNI
    // =========================================================================
    externalNativeBuild {
        cmake {
            path("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:8443/api/v1\"")
            buildConfigField("String", "WS_URL", "\"ws://10.0.2.2:8443/ws/device\"")
            // Debug NDK flags
            externalNativeBuild {
                cmake {
                    arguments += "-DCMAKE_BUILD_TYPE=Debug"
                }
            }
        }
        create("staging") {
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            isMinifyEnabled = true
            isShrinkResources = true
            buildConfigField("String", "API_BASE_URL", "\"https://phone.openedskill.com/api/v1\"")
            buildConfigField("String", "WS_URL", "\"wss://phone.openedskill.com/ws/device\"")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "API_BASE_URL", "\"https://phone.openedskill.com/api/v1\"")
            buildConfigField("String", "WS_URL", "\"wss://phone.openedskill.com/ws/device\"")
            // Release NDK flags
            externalNativeBuild {
                cmake {
                    arguments += "-DCMAKE_BUILD_TYPE=MinSizeRel"
                }
            }
        }
    }

    // =========================================================================
    // Signing configurations
    // =========================================================================
    signingConfigs {
        create("release") {
            // Uses environment variables or local.properties for CI safety
            // Expected: KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
            val ksPath = System.getenv("PHONEFARM_KEYSTORE_PATH")
                ?: project.findProperty("PHONEFARM_KEYSTORE_PATH") as? String ?: ""
            if (ksPath.isNotEmpty() && file(ksPath).exists()) {
                storeFile = file(ksPath)
                storePassword = System.getenv("PHONEFARM_KEYSTORE_PASSWORD")
                    ?: project.findProperty("PHONEFARM_KEYSTORE_PASSWORD") as? String ?: ""
                keyAlias = System.getenv("PHONEFARM_KEY_ALIAS")
                    ?: project.findProperty("PHONEFARM_KEY_ALIAS") as? String ?: ""
                keyPassword = System.getenv("PHONEFARM_KEY_PASSWORD")
                    ?: project.findProperty("PHONEFARM_KEY_PASSWORD") as? String ?: ""
            }
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/DEPENDENCIES"
        }
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    // Compose
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.compose.animation)
    debugImplementation(libs.compose.ui.tooling)

    // Lifecycle + ViewModel
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.ktx)

    // Navigation
    implementation(libs.navigation.compose)

    // Hilt DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Room
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // Network
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)

    // Coroutines
    implementation(libs.coroutines.core)
    implementation(libs.coroutines.android)

    // Rhino JS Engine
    implementation(libs.rhino)

    // DataStore
    implementation(libs.datastore.preferences)

    // Coil
    implementation(libs.coil.compose)

    // WorkManager
    implementation(libs.work.runtime.ktx)
    implementation(libs.hilt.work)

    // Kotlin Serialization
    implementation(libs.kotlinx.serialization.json)

    // Shizuku
    implementation(libs.shizuku.api)

    // Security
    implementation(libs.security.crypto)

    // ExifInterface
    implementation(libs.exifinterface)

    // ML Kit OCR — dual-channel UI tree (Phase O2)
    implementation("com.google.mlkit:text-recognition-chinese:16.0.1")
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")

    // TFLite — YOLO-nano UI detection
    implementation("org.tensorflow:tensorflow-lite:2.16.1")
    implementation("org.tensorflow:tensorflow-lite-support:0.4.4")

    // CameraX — for screenshot alternative
    implementation("androidx.camera:camera-core:1.4.1")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")

    // Testing
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.coroutines.test)
}
