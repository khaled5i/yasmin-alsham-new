package com.yasminalsham.attendancebridge.network;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;

public final class NetworkMonitor implements AutoCloseable {
    private final ConnectivityManager connectivityManager;
    private final Runnable onChanged;
    private boolean defaultRegistered;
    private boolean wifiRegistered;

    private final ConnectivityManager.NetworkCallback defaultCallback =
            new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    notifyChanged();
                }

                @Override
                public void onCapabilitiesChanged(
                        Network network,
                        NetworkCapabilities capabilities
                ) {
                    notifyChanged();
                }

                @Override
                public void onLost(Network network) {
                    notifyChanged();
                }
            };

    private final ConnectivityManager.NetworkCallback wifiCallback =
            new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    notifyChanged();
                }

                @Override
                public void onLost(Network network) {
                    notifyChanged();
                }
            };

    public NetworkMonitor(Context context, Runnable onChanged) {
        connectivityManager = (ConnectivityManager) context
                .getApplicationContext()
                .getSystemService(Context.CONNECTIVITY_SERVICE);
        this.onChanged = onChanged;
    }

    public synchronized void start() {
        if (connectivityManager == null || defaultRegistered || wifiRegistered) return;
        try {
            connectivityManager.registerDefaultNetworkCallback(defaultCallback);
            defaultRegistered = true;
            NetworkRequest wifiRequest = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .build();
            connectivityManager.registerNetworkCallback(wifiRequest, wifiCallback);
            wifiRegistered = true;
        } catch (RuntimeException error) {
            close();
        }
    }

    @Override
    public synchronized void close() {
        if (connectivityManager != null && defaultRegistered) {
            try {
                connectivityManager.unregisterNetworkCallback(defaultCallback);
            } catch (RuntimeException ignored) {
            }
        }
        if (connectivityManager != null && wifiRegistered) {
            try {
                connectivityManager.unregisterNetworkCallback(wifiCallback);
            } catch (RuntimeException ignored) {
            }
        }
        defaultRegistered = false;
        wifiRegistered = false;
    }

    private void notifyChanged() {
        if (onChanged != null) onChanged.run();
    }
}
