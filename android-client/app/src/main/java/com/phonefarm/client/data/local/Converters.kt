package com.phonefarm.client.data.local

import androidx.room.TypeConverter
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString

class Converters {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @TypeConverter
    fun fromStringList(value: List<String>?): String? = value?.let { json.encodeToString(it) }

    @TypeConverter
    fun toStringList(value: String?): List<String>? = value?.let { json.decodeFromString(it) }

    @TypeConverter
    fun fromStringMap(value: Map<String, String>?): String? = value?.let { json.encodeToString(it) }

    @TypeConverter
    fun toStringMap(value: String?): Map<String, String>? = value?.let { json.decodeFromString(it) }
}
