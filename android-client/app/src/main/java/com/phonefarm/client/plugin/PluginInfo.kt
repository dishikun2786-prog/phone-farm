package com.phonefarm.client.plugin

/**
 * Plugin info data class representing a plugin from the server manifest
 * or local registry.
 */
data class PluginInfo(
    /** Unique plugin identifier (e.g., "deeke-runtime", "douyin-helper"). */
    val pluginId: String,

    /** Human-readable display name (e.g., "DeekeScript Runtime"). */
    val name: String,

    /** Target Android package name (e.g., "com.deeke.autox.v7"). */
    val packageName: String,

    /** Latest available version string (e.g., "2.3.1"). */
    val version: String,

    /** Version code (integer, for package installer comparison). */
    val versionCode: Long,

    /** Download URL for the APK file. */
    val downloadUrl: String,

    /** APK file size in bytes. */
    val sizeBytes: Long,

    /** SHA-256 checksum of the APK file. */
    val sha256: String,

    /** Minimum Android API level required. */
    val minSdk: Int,

    /** Whether this plugin is mandatory for core functionality. */
    val isRequired: Boolean,

    /** Platform category (e.g., "core", "douyin", "wechat", "system"). */
    val category: String,

    /** Release notes / changelog for this version. */
    val changelog: String?,
)
