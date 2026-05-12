package com.phonefarm.client.network.reconnect

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Monitors network connectivity via Android ConnectivityManager + NetworkCallback.
 *
 * Tracks:
 * - Network type (WIFI, MOBILE_4G, MOBILE_5G, METERED, VPN, NONE).
 * - Whether the device has internet connectivity.
 *
 * When the network type changes from NONE to any connected type,
 * [ReconnectManager.onNetworkRestored] should be called.
 */
@Singleton
class ConnectionStateMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
    private val reconnectManager: ReconnectManager,
) {

    private val connectivityManager: ConnectivityManager
        get() = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _networkType = MutableStateFlow(NetworkType.NONE)
    val networkType: StateFlow<NetworkType> = _networkType.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {

        override fun onAvailable(network: Network) {
            val caps = connectivityManager.getNetworkCapabilities(network)
            if (caps != null) {
                _networkType.value = classifyNetwork(caps)
                _isConnected.value = true
                // Network came back — notify ReconnectManager to reconnect immediately.
                reconnectManager.onNetworkRestored()
                Log.d("ConnectionStateMonitor", "Network available: ${_networkType.value}")
            }
        }

        override fun onLost(network: Network) {
            // Check if any other network is still available.
            val activeNetwork = connectivityManager.activeNetwork
            if (activeNetwork == null) {
                _networkType.value = NetworkType.NONE
                _isConnected.value = false
                Log.w("ConnectionStateMonitor", "All networks lost")
            } else {
                // Another network is still active; re-classify from that network.
                val caps = connectivityManager.getNetworkCapabilities(activeNetwork)
                if (caps != null) {
                    _networkType.value = classifyNetwork(caps)
                }
            }
        }

        override fun onCapabilitiesChanged(
            network: Network,
            networkCapabilities: NetworkCapabilities,
        ) {
            // Re-evaluate network type (e.g., WiFi -> Mobile handover, 4G -> 5G upgrade).
            _networkType.value = classifyNetwork(networkCapabilities)
        }
    }

    /**
     * Register the NetworkCallback to start monitoring.
     * Also captures the current network state immediately.
     * Should be called from Application.onCreate or service start.
     */
    fun start() {
        // Capture the current state before registering the callback.
        val activeNetwork = connectivityManager.activeNetwork
        if (activeNetwork != null) {
            val caps = connectivityManager.getNetworkCapabilities(activeNetwork)
            if (caps != null) {
                _networkType.value = classifyNetwork(caps)
                _isConnected.value = true
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    /**
     * Unregister the NetworkCallback to stop monitoring.
     */
    fun stop() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: IllegalArgumentException) {
            // Callback was never registered or already unregistered.
        }
    }

    /**
     * Classify the current network from NetworkCapabilities.
     * Detects WiFi, VPN, cellular (with 4G vs 5G distinction), and Ethernet.
     */
    private fun classifyNetwork(caps: NetworkCapabilities): NetworkType {
        // 5G detection: check for NR (New Radio) transport on API 29+.
        val is5g = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q &&
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
            // Bandwidth estimate >= 100 Mbps downstream hints at 5G.
            caps.linkDownstreamBandwidthKbps >= 50_000

        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkType.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> NetworkType.VPN
            is5g -> NetworkType.MOBILE_5G
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) {
                    NetworkType.MOBILE_4G
                } else {
                    NetworkType.METERED
                }
            }
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkType.WIFI
            else -> NetworkType.NONE
        }
    }
}

/**
 * Network type classification.
 */
enum class NetworkType {
    WIFI,
    MOBILE_4G,
    MOBILE_5G,
    METERED,
    VPN,
    NONE,
}
