# ============================================================================
# PhoneFarm R8/ProGuard Rules — Comprehensive
# ============================================================================

# === General ===
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# === Kotlin ===
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-keep class kotlinx.coroutines.** { *; }
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-dontwarn kotlinx.coroutines.**

# === Kotlin Serialization ===
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.phonefarm.**$$serializer { *; }
-keepclassmembers class com.phonefarm.** {
    *** Companion;
}
-keepclasseswithmembers class com.phonefarm.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# === Compose ===
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**
-keep class androidx.compose.ui.** { *; }

# === Material 3 ===
-keep class androidx.compose.material3.** { *; }
-dontwarn androidx.compose.material3.**

# === Lifecycle + ViewModel ===
-keep class * extends androidx.lifecycle.ViewModel { *; }
-keep class * extends androidx.lifecycle.AndroidViewModel { *; }
-keep class androidx.lifecycle.** { *; }

# === Navigation ===
-keep class androidx.navigation.** { *; }
-keep class * extends androidx.navigation.Navigator

# === Hilt / Dagger ===
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }
-keep,allowobfuscation,allowshrinking class dagger.hilt.android.lifecycle.HiltViewModel
-keep @dagger.Module class *
-keep @dagger.hilt.InstallIn class *
-keep @dagger.hilt.android.HiltAndroidApp class *
-keep @dagger.hilt.android.AndroidEntryPoint class *
-dontwarn dagger.hilt.**

# === Room ===
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }
-keep class * extends androidx.room.migration.Migration { *; }
-dontwarn androidx.room.paging.**

# === OkHttp ===
-keep class okhttp3.** { *; }
-keep class okhttp3.internal.** { *; }
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okio.** { *; }

# === Retrofit / Gson ===
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * { @retrofit2.http.* <methods>; }
-keep class com.google.gson.** { *; }
-keepclassmembers,allowobfuscation class * { @com.google.gson.annotations.SerializedName <fields>; }
-keepclassmembers class * {
    @com.google.gson.annotations.Expose <fields>;
}

# === Rhino JS Engine (critical — reflection-heavy) ===
-keep class org.mozilla.javascript.** { *; }
-keepclassmembers class org.mozilla.javascript.** {
    public *;
    protected *;
}
-keepclassmembers class org.mozilla.javascript.ScriptableObject { *; }
-keepclassmembers class org.mozilla.javascript.Context { *; }
-keepclassmembers class org.mozilla.javascript.ScriptRuntime { *; }
-keepclassmembers class org.mozilla.javascript.NativeJavaObject { *; }
-keepclassmembers class org.mozilla.javascript.WrapFactory { *; }
-dontwarn org.mozilla.javascript.**
-dontnote org.mozilla.javascript.**

# === Protobuf ===
-keep class com.google.protobuf.** { *; }
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class * extends com.google.protobuf.GeneratedMessageLite$Builder { *; }
-dontwarn com.google.protobuf.**

# === Shizuku ===
-keep class rikka.shizuku.** { *; }
-dontwarn rikka.shizuku.**

# === Security (EncryptedSharedPreferences) ===
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# === ML Kit OCR ===
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
-keep class com.google.android.gms.vision.** { *; }

# === Coil Image Loading ===
-keep class coil.** { *; }
-dontwarn coil.**

# === WorkManager ===
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker { *; }
-dontwarn androidx.work.**

# === CameraX ===
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ============================================================================
# PhoneFarm Application — KEEP ALL internal classes
# ============================================================================

# Data entities (Room)
-keep class com.phonefarm.client.data.local.entity.** { *; }
-keepclassmembers class com.phonefarm.client.data.local.entity.** { *; }

# Data DAOs
-keep interface com.phonefarm.client.data.local.dao.** { *; }
-keep class com.phonefarm.client.data.local.dao.**_Impl { *; }

# Repositories
-keep class com.phonefarm.client.data.repository.** { *; }

# Models
-keep class com.phonefarm.client.model.** { *; }

# Network — WebSocket messages (sealed class hierarchy — CRITICAL)
-keep class com.phonefarm.client.network.WebSocketMessage { *; }
-keep class com.phonefarm.client.network.WebSocketMessage$** { *; }
-keep class com.phonefarm.client.network.** { *; }

# Network security
-keep class com.phonefarm.client.network.security.** { *; }
-keep class com.phonefarm.client.network.reconnect.** { *; }
-keep class com.phonefarm.client.network.transport.** { *; }
-keep class com.phonefarm.client.network.codec.** { *; }

# Bridge layer (Rhino JS API — CRITICAL)
-keep class com.phonefarm.client.bridge.** { *; }
-keepclassmembers class com.phonefarm.client.bridge.** {
    public *;
    @org.mozilla.javascript.annotations.JSFunction <methods>;
    @org.mozilla.javascript.annotations.JSGetter <methods>;
    @org.mozilla.javascript.annotations.JSSetter <methods>;
}

# VLM (sealed class hierarchy — CRITICAL)
-keep class com.phonefarm.client.vlm.VLMAction { *; }
-keep class com.phonefarm.client.vlm.VLMAction$** { *; }
-keep class com.phonefarm.client.vlm.** { *; }
-keep class com.phonefarm.client.vlm.adapters.** { *; }

# Engine
-keep class com.phonefarm.client.engine.** { *; }

# Service (AccessibilityService + ForegroundService — CRITICAL)
-keep class com.phonefarm.client.service.PhoneFarmAccessibilityService { *; }
-keep class com.phonefarm.client.service.BridgeForegroundService { *; }
-keep class com.phonefarm.client.service.** { *; }

# Floating window
-keep class com.phonefarm.client.floating.** { *; }

# UI Screens + Components
-keep class com.phonefarm.client.ui.screens.** { *; }
-keep class com.phonefarm.client.ui.components.** { *; }
-keep class com.phonefarm.client.ui.theme.** { *; }
-keep class com.phonefarm.client.ui.navigation.** { *; }

# Activation
-keep class com.phonefarm.client.activation.** { *; }

# Account
-keep class com.phonefarm.client.account.** { *; }

# Permissions
-keep class com.phonefarm.client.permissions.** { *; }

# Plugin
-keep class com.phonefarm.client.plugin.** { *; }

# Remote commands
-keep class com.phonefarm.client.remote.** { *; }

# Scrcpy screen encoding
-keep class com.phonefarm.client.scrcpy.** { *; }

# APK update
-keep class com.phonefarm.client.update.** { *; }

# Crash reporting
-keep class com.phonefarm.client.crash.** { *; }

# Hardening / brand compat
-keep class com.phonefarm.client.hardening.** { *; }
-keep class com.phonefarm.client.hardening.brandcompat.** { *; }

# Maintenance
-keep class com.phonefarm.client.maintenance.** { *; }

# Privilege escalation
-keep class com.phonefarm.client.privilege.** { *; }

# DI module
-keep class com.phonefarm.client.di.** { *; }

# Debug
-keep class com.phonefarm.client.debug.** { *; }

# ============================================================================
# Generic Android / Java safety
# ============================================================================

# Parcelable
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Enum values()
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Android Resources
-keep class **.R { *; }
-keep class **.R$* { *; }
-keepclassmembers class **.R$* { public static <fields>; }

# ============================================================================
# Strip unnecessary logging in release
# ============================================================================
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}

# ============================================================================
# Merge similar classes to reduce DEX count
# ============================================================================
-mergeinterfacesaggressively
# -repackageclasses removed — breaks AndroidManifest component class references
-allowaccessmodification
