package com.yasminalsham.alterationbridge.network;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public final class NetworkMonitor implements AutoCloseable {
    private final ConnectivityManager connectivityManager;
    private final Runnable onChanged;
    private final AtomicBoolean internetAvailable = new AtomicBoolean(false);
    private final AtomicReference<Network> defaultNetwork = new AtomicReference<>();
    private final AtomicReference<Network> wifiNetwork = new AtomicReference<>();
    private volatile boolean defaultRegistered;
    private volatile boolean wifiRegistered;

    private final ConnectivityManager.NetworkCallback defaultCallback =
            new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    defaultNetwork.set(network);
                    notifyChanged();
                }

                @Override
                public void onCapabilitiesChanged(
                        Network network,
                        NetworkCapabilities capabilities
                ) {
                    defaultNetwork.set(network);
                    boolean available =
                            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                                    && capabilities.hasCapability(
                                    NetworkCapabilities.NET_CAPABILITY_VALIDATED
                            );
                    // هذا النداء يتكرر مع كل تغيّر في قوة إشارة Wi-Fi؛ نوقظ المحطة
                    // فقط عند تغيّر حقيقي في حالة الاتصال.
                    if (internetAvailable.getAndSet(available) != available) {
                        notifyChanged();
                    }
                }

                @Override
                public void onLost(Network network) {
                    defaultNetwork.compareAndSet(network, null);
                    internetAvailable.set(false);
                    notifyChanged();
                }
            };

    private final ConnectivityManager.NetworkCallback wifiCallback =
            new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    wifiNetwork.set(network);
                    notifyChanged();
                }

                @Override
                public void onLost(Network network) {
                    wifiNetwork.compareAndSet(network, null);
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
        if ((defaultRegistered || wifiRegistered) || connectivityManager == null) return;
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

    public boolean isInternetAvailable() {
        return internetAvailable.get();
    }

    public boolean hasAnyNetwork() {
        // إن تعذّر تسجيل مراقب الشبكة لا نعرف الحالة، فنحاول الاتصال بدل
        // أن تبقى المحطة «غير متصلة» إلى الأبد.
        if (!defaultRegistered) return true;
        return defaultNetwork.get() != null || wifiNetwork.get() != null;
    }

    public Network getWifiNetwork() {
        return wifiNetwork.get();
    }

    public Network getDefaultNetwork() {
        return defaultNetwork.get();
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
        internetAvailable.set(false);
        defaultNetwork.set(null);
        wifiNetwork.set(null);
    }

    private void notifyChanged() {
        if (onChanged != null) onChanged.run();
    }
}
