package com.phonefarm.client.bridge

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `storages` global factory.
 *
 * Provides persistent key-value storage to Rhino scripts, backed by
 * Android SharedPreferences:
 *   var store = storages.create("my_script_data");
 *   store.put("key", "value");
 *   var val = store.get("key", "default");
 *   store.remove("key");
 *   store.clear();
 *
 * Each named storage maps to a separate SharedPreferences file prefixed with "phonefarm_store_".
 */
@Singleton
class JsStorages @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val stores = mutableMapOf<String, NamedStorage>()

    /**
     * TODO: Create or retrieve a NamedStorage for the given [name].
     * Name is used as part of the SharedPreferences file key.
     */
    fun create(name: String): NamedStorage {
        return stores.getOrPut(name) {
            NamedStorage(context, name)
        }
    }

    /**
     * TODO: Remove the named storage entirely (delete its SharedPreferences file).
     */
    fun remove(name: String): Boolean {
        val store = stores.remove(name)
        if (store != null) {
            store.clear()
        }
        val prefs = context.getSharedPreferences(
            "phonefarm_store_$name",
            Context.MODE_PRIVATE,
        )
        return prefs.edit().clear().commit()
    }

    /**
     * TODO: Return a list of all currently registered storage names.
     */
    fun list(): List<String> = stores.keys.toList()

    /**
     * Wrapper around SharedPreferences that presents a JS-friendly API.
     *
     * Methods:
     *   get(key, defaultValue) — returns stored value or default (String).
     *   put(key, value) — stores a string value.
     *   remove(key) — removes a specific key.
     *   contains(key) — checks if key exists.
     *   clear() — removes all keys in this storage.
     */
    class NamedStorage(context: Context, name: String) {

        private val prefs = context.getSharedPreferences(
            "phonefarm_store_$name",
            Context.MODE_PRIVATE,
        )

        /**
         * TODO: Get the value for [key], returning [defaultValue] if not present.
         */
        fun get(key: String, defaultValue: String? = null): String? {
            return prefs.getString(key, defaultValue)
        }

        /**
         * TODO: Store [value] under [key].
         */
        fun put(key: String, value: String) {
            prefs.edit().putString(key, value).apply()
        }

        /**
         * TODO: Get a boolean value.
         */
        fun getBoolean(key: String, defaultValue: Boolean = false): Boolean {
            return prefs.getBoolean(key, defaultValue)
        }

        /**
         * TODO: Store a boolean value.
         */
        fun putBoolean(key: String, value: Boolean) {
            prefs.edit().putBoolean(key, value).apply()
        }

        /**
         * TODO: Get an integer value.
         */
        fun getInt(key: String, defaultValue: Int = 0): Int {
            return prefs.getInt(key, defaultValue)
        }

        /**
         * TODO: Store an integer value.
         */
        fun putInt(key: String, value: Int) {
            prefs.edit().putInt(key, value).apply()
        }

        /**
         * TODO: Remove the given key.
         */
        fun remove(key: String) {
            prefs.edit().remove(key).apply()
        }

        /**
         * TODO: Check whether [key] exists in this storage.
         */
        fun contains(key: String): Boolean {
            return prefs.contains(key)
        }

        /**
         * TODO: Remove all keys from this storage.
         */
        fun clear() {
            prefs.edit().clear().apply()
        }

        /**
         * TODO: Return all keys in this storage as a list.
         */
        fun keys(): List<String> {
            return prefs.all.keys.toList()
        }
    }
}
