package com.phonefarm.client.bridge

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `files` global object.
 *
 * Provides file I/O methods to Rhino scripts:
 *   files.read(path), files.write(path, content), files.exists(path),
 *   files.ensureDir(path), files.delete(path), files.listDir(path),
 *   files.copy(src, dst), files.move(src, dst), files.getSize(path)
 *
 * Paths are resolved relative to the app's internal storage directory unless
 * they start with "/sdcard" or "/storage".
 */
@Singleton
class JsFiles @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val baseDir: File
        get() = context.filesDir

    /**
     * TODO: Resolve a path: absolute paths returned as-is; relative paths resolved against baseDir.
     */
    private fun resolve(path: String): File {
        return if (path.startsWith("/")) {
            File(path)
        } else {
            File(baseDir, path)
        }
    }

    /**
     * TODO: Read the entire contents of a file as a UTF-8 string.
     * Returns an empty string if the file does not exist.
     */
    fun read(path: String): String {
        val file = resolve(path)
        return if (file.exists()) {
            file.readText(Charsets.UTF_8)
        } else {
            ""
        }
    }

    /**
     * TODO: Write [content] to a file, creating parent directories if needed.
     * Returns true on success.
     */
    fun write(path: String, content: String): Boolean {
        return try {
            val file = resolve(path)
            file.parentFile?.mkdirs()
            file.writeText(content, Charsets.UTF_8)
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * TODO: Check whether the given path exists.
     */
    fun exists(path: String): Boolean {
        return resolve(path).exists()
    }

    /**
     * TODO: Ensure the directory at [path] exists, creating it and all parent directories.
     * Returns true if the directory exists after the call.
     */
    fun ensureDir(path: String): Boolean {
        val dir = resolve(path)
        return if (dir.exists()) {
            dir.isDirectory
        } else {
            dir.mkdirs()
        }
    }

    /**
     * TODO: Delete the file or directory at [path].
     * For directories, recursively delete all contents first.
     * Returns true on success.
     */
    fun delete(path: String): Boolean {
        val file = resolve(path)
        return if (file.isDirectory) {
            file.deleteRecursively()
        } else {
            file.delete()
        }
    }

    /**
     * TODO: List all file names in the directory at [path].
     * Returns an empty list if the path does not exist or is not a directory.
     */
    fun listDir(path: String): List<String> {
        val dir = resolve(path)
        return if (dir.exists() && dir.isDirectory) {
            dir.list()?.toList() ?: emptyList()
        } else {
            emptyList()
        }
    }

    /**
     * TODO: Copy a file from [src] to [dst], creating parent directories as needed.
     */
    fun copy(src: String, dst: String): Boolean {
        return try {
            val srcFile = resolve(src)
            val dstFile = resolve(dst)
            dstFile.parentFile?.mkdirs()
            srcFile.copyTo(dstFile, overwrite = true)
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * TODO: Move/rename a file from [src] to [dst].
     */
    fun move(src: String, dst: String): Boolean {
        return try {
            val srcFile = resolve(src)
            val dstFile = resolve(dst)
            dstFile.parentFile?.mkdirs()
            srcFile.renameTo(dstFile)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * TODO: Get the file size in bytes, or -1 if it does not exist.
     */
    fun getSize(path: String): Long {
        val file = resolve(path)
        return if (file.exists()) file.length() else -1L
    }

    /**
     * TODO: Return the absolute path to the app's scripts directory.
     */
    fun getScriptsDir(): String {
        val dir = File(baseDir, "scripts").apply { mkdirs() }
        return dir.absolutePath
    }

    /**
     * TODO: Return the absolute path to the app's data directory (screenshots, logs, etc.).
     */
    fun getDataDir(): String {
        val dir = File(baseDir, "data").apply { mkdirs() }
        return dir.absolutePath
    }
}
