package com.phonefarm.client.remote

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Remote file push/pull/delete/list operations.
 *
 * Operates within the app's sandboxed file directories by default.
 * For access to external storage or other app data directories, the
 * device must be rooted or have Shizuku access.
 *
 * File paths are relative to [baseDir] unless they start with "/",
 * in which case they are treated as absolute paths (requires root).
 */
@Singleton
class RemoteFileManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val TAG = "RemoteFileManager"

        /** Maximum size for a single pull operation (10 MB). */
        private const val MAX_PULL_SIZE = 10L * 1024L * 1024L
    }

    /**
     * Base directory for file operations.
     * Relative paths are resolved against this directory.
     */
    private val baseDir: File get() = context.filesDir

    // ---- public API ----

    /**
     * Push (write) content to a file.
     *
     * @param remotePath  Target file path (relative to baseDir, or absolute).
     * @param content     Raw bytes to write.
     * @return [RemoteCommandResult].
     */
    suspend fun push(remotePath: String, content: ByteArray): RemoteCommandResult {
        return try {
            val file = resolveFile(remotePath)
            // Create parent directories if needed.
            file.parentFile?.mkdirs()
            FileOutputStream(file).use { fos ->
                fos.write(content)
                fos.flush()
            }
            RemoteCommandResult.Success(
                "File written: ${file.absolutePath} (${content.size} bytes)"
            )
        } catch (e: SecurityException) {
            RemoteCommandResult.Error("Permission denied: ${e.message}", code = 403)
        } catch (e: Exception) {
            RemoteCommandResult.Error("File push failed: ${e.message}")
        }
    }

    /**
     * Pull (read) content from a file.
     *
     * @param remotePath  Source file path (relative to baseDir, or absolute).
     * @return [RemoteCommandResult.Success] with file bytes, or [RemoteCommandResult.Error].
     */
    suspend fun pull(remotePath: String): RemoteCommandResult {
        return try {
            val file = resolveFile(remotePath)

            if (!file.exists()) {
                return RemoteCommandResult.Error("File not found: $remotePath", code = 404)
            }
            if (!file.isFile) {
                return RemoteCommandResult.Error("Not a file: $remotePath", code = 400)
            }
            if (file.length() > MAX_PULL_SIZE) {
                return RemoteCommandResult.Error(
                    "File too large: ${file.length()} bytes (max $MAX_PULL_SIZE)",
                    code = 413,
                )
            }

            val bytes = file.readBytes()
            RemoteCommandResult.Success(
                output = "File read: ${file.absolutePath} (${bytes.size} bytes)",
                data = bytes,
            )
        } catch (e: SecurityException) {
            RemoteCommandResult.Error("Permission denied: ${e.message}", code = 403)
        } catch (e: Exception) {
            RemoteCommandResult.Error("File pull failed: ${e.message}")
        }
    }

    /**
     * Delete a file or directory (recursive).
     *
     * @param remotePath  Path to delete.
     * @return [RemoteCommandResult].
     */
    suspend fun delete(remotePath: String): RemoteCommandResult {
        return try {
            val file = resolveFile(remotePath)

            if (!file.exists()) {
                return RemoteCommandResult.Error("File not found: $remotePath", code = 404)
            }

            val deleted = if (file.isDirectory) {
                file.deleteRecursively()
            } else {
                file.delete()
            }

            if (deleted) {
                RemoteCommandResult.Success("Deleted: ${file.absolutePath}")
            } else {
                RemoteCommandResult.Error("Failed to delete: $remotePath")
            }
        } catch (e: SecurityException) {
            RemoteCommandResult.Error("Permission denied: ${e.message}", code = 403)
        } catch (e: Exception) {
            RemoteCommandResult.Error("File delete failed: ${e.message}")
        }
    }

    /**
     * List directory contents.
     *
     * @param remotePath  Directory path to list.
     * @return [RemoteCommandResult.Success] with JSON listing, or [RemoteCommandResult.Error].
     */
    suspend fun list(remotePath: String): RemoteCommandResult {
        return try {
            val dir = resolveFile(remotePath)

            if (!dir.exists()) {
                return RemoteCommandResult.Error("Directory not found: $remotePath", code = 404)
            }
            if (!dir.isDirectory) {
                return RemoteCommandResult.Error("Not a directory: $remotePath", code = 400)
            }

            val files = dir.listFiles() ?: emptyArray()

            val listing = org.json.JSONArray()
            for (file in files.sortedBy { it.name }) {
                val entry = org.json.JSONObject().apply {
                    put("name", file.name)
                    put("path", file.absolutePath)
                    put("size", file.length())
                    put("isDirectory", file.isDirectory)
                    put("lastModified", file.lastModified())
                }
                listing.put(entry)
            }

            RemoteCommandResult.Success(
                output = listing.toString(2),
            )
        } catch (e: SecurityException) {
            RemoteCommandResult.Error("Permission denied: ${e.message}", code = 403)
        } catch (e: Exception) {
            RemoteCommandResult.Error("File list failed: ${e.message}")
        }
    }

    /**
     * Get disk usage for the base directory.
     */
    fun getDiskUsageMb(): Long {
        return getDirSize(baseDir) / (1024 * 1024)
    }

    // ---- internal ----

    /**
     * Resolve a path string to a [File].
     * Absolute paths are used directly; relative paths are resolved against [baseDir].
     *
     * Path traversal attempts (e.g., "../../system") are blocked.
     */
    private fun resolveFile(path: String): File {
        val file = if (path.startsWith("/")) {
            File(path)
        } else {
            File(baseDir, path)
        }

        // Prevent path traversal outside the allowed area.
        val canonical = file.canonicalPath
        val baseCanonical = baseDir.canonicalPath

        if (path.startsWith("/")) {
            // Absolute path — allowed only if running with root/Shizuku.
            // For sandboxed operation, reject.
            if (!isRootAvailable()) {
                throw SecurityException(
                    "Absolute paths require root/Shizuku: $path"
                )
            }
        } else {
            // Relative path — must resolve within baseDir.
            if (!canonical.startsWith(baseCanonical + File.separator) &&
                canonical != baseCanonical
            ) {
                throw SecurityException(
                    "Path traversal blocked: $path (resolved to $canonical)"
                )
            }
        }

        return file
    }

    private fun isRootAvailable(): Boolean {
        return try {
            val su = File("/system/bin/su")
            val suXbin = File("/system/xbin/su")
            su.exists() || suXbin.exists()
        } catch (_: Exception) {
            false
        }
    }

    private fun getDirSize(dir: File): Long {
        var size = 0L
        val files = dir.listFiles() ?: return 0L
        for (file in files) {
            size += if (file.isDirectory) {
                getDirSize(file)
            } else {
                file.length()
            }
        }
        return size
    }
}
