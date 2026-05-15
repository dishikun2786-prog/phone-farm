package com.phonefarm.client.webrtc

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Shared WebRTC resources — single [EglBase] and [PeerConnectionFactory] for the entire app.
 *
 * WebRTC best practices mandate exactly ONE PeerConnectionFactory and ONE EglBase per process.
 * Both [WebrtcManager] (video streaming) and [P2pConnectionManager] (data-channel P2P) share
 * these resources via this provider.
 *
 * Reference counting ensures the EglBase is only released when ALL consumers have shut down.
 */
@Singleton
class WebrtcSharedResources @Inject constructor(
    @ApplicationContext private val appContext: Context,
) {
    companion object {
        private const val TAG = "WebrtcResources"
    }

    private var eglBase: EglBase? = null
    private var factory: PeerConnectionFactory? = null
    @Volatile private var initialized = false
    private val refCount = AtomicInteger(0)

    @Synchronized
    fun acquire(): PeerConnectionFactory {
        if (refCount.incrementAndGet() == 1) {
            initialize()
        }
        return factory!!
    }

    fun getEglContext(): EglBase.Context {
        if (!initialized) initialize()
        return eglBase!!.eglBaseContext
    }

    @Synchronized
    fun release() {
        if (refCount.decrementAndGet() <= 0) {
            shutdown()
        }
    }

    private fun initialize() {
        if (initialized) return

        val options = PeerConnectionFactory.InitializationOptions.builder(appContext)
            .setFieldTrials("WebRTC-H264HighProfile/Enabled/")
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        val sharedEglBase = EglBase.create()
        eglBase = sharedEglBase
        val eglContext = sharedEglBase.eglBaseContext

        val encoderFactory = org.webrtc.DefaultVideoEncoderFactory(eglContext, true, true)
        val decoderFactory = org.webrtc.DefaultVideoDecoderFactory(eglContext)

        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        initialized = true
        Log.i(TAG, "Shared PeerConnectionFactory initialized (H.264 preferred)")
    }

    private fun shutdown() {
        try {
            factory?.dispose()
            factory = null
            Log.i(TAG, "PeerConnectionFactory disposed")
        } catch (e: Exception) {
            Log.e(TAG, "Error disposing PeerConnectionFactory", e)
        }
        try {
            eglBase?.release()
            eglBase = null
            Log.i(TAG, "EglBase released")
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing EglBase", e)
        }
        initialized = false
    }
}
