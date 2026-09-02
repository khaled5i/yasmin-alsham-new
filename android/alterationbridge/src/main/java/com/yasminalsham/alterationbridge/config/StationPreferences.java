package com.yasminalsham.alterationbridge.config;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;

import com.yasminalsham.alterationbridge.security.DeviceSecretStore;

import java.util.UUID;
import java.util.regex.Pattern;

@SuppressLint("ApplySharedPref") // Pair/unpair must commit station identity atomically.
public final class StationPreferences {
    public static final String PREFS_NAME = "alteration_print_bridge";
    public static final String PREF_PRINTER_IP = "printer_ip";
    public static final String DEFAULT_PRINTER_IP = "192.168.100.105";

    private static final String PREF_STATION_ID = "station_id";
    private static final String PREF_ENABLED = "station_enabled";
    private static final Pattern PRIVATE_IPV4 = Pattern.compile(
            "^(10\\.(?:\\d{1,3}\\.){2}\\d{1,3}|192\\.168\\.(?:\\d{1,3}\\.)\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])\\.(?:\\d{1,3}\\.)\\d{1,3})$"
    );

    private final SharedPreferences preferences;
    private final DeviceSecretStore secretStore;

    public StationPreferences(Context context) {
        Context appContext = context.getApplicationContext();
        preferences = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        secretStore = new DeviceSecretStore(appContext, PREFS_NAME);
    }

    public synchronized void savePairingCode(String pairingCode) throws Exception {
        PairingCredentials credentials = parsePairingCode(pairingCode);
        secretStore.save(credentials.secret);
        if (!preferences.edit()
                .putString(PREF_STATION_ID, credentials.stationId)
                .putBoolean(PREF_ENABLED, true)
                .commit()) {
            secretStore.clear();
            throw new IllegalStateException("Failed to save station pairing");
        }
    }

    public synchronized PairingCredentials getCredentials() {
        String stationId = preferences.getString(PREF_STATION_ID, "");
        if (stationId == null || stationId.isEmpty()) return null;
        try {
            String secret = secretStore.load();
            if (secret.isEmpty()) return null;
            return new PairingCredentials(stationId, secret);
        } catch (Exception error) {
            return null;
        }
    }

    public synchronized void clearPairing() {
        preferences.edit().remove(PREF_STATION_ID).commit();
        secretStore.clear();
    }

    public String getPrinterIp() {
        String ip = preferences.getString(PREF_PRINTER_IP, DEFAULT_PRINTER_IP);
        return isPrivateIpv4(ip) ? ip : DEFAULT_PRINTER_IP;
    }

    public void savePrinterIp(String ip) {
        if (!isPrivateIpv4(ip)) throw new IllegalArgumentException("Invalid printer IP");
        preferences.edit().putString(PREF_PRINTER_IP, ip).apply();
    }

    public boolean isEnabled() {
        return preferences.getBoolean(PREF_ENABLED, true);
    }

    public void setEnabled(boolean enabled) {
        preferences.edit().putBoolean(PREF_ENABLED, enabled).apply();
    }

    public static boolean isPrivateIpv4(String value) {
        if (value == null || !PRIVATE_IPV4.matcher(value).matches()) return false;
        String[] parts = value.split("\\.");
        for (String part : parts) {
            try {
                int number = Integer.parseInt(part);
                if (number < 0 || number > 255) return false;
            } catch (NumberFormatException error) {
                return false;
            }
        }
        return true;
    }

    public static PairingCredentials parsePairingCode(String pairingCode) {
        String value = pairingCode == null ? "" : pairingCode.trim();
        int separator = value.indexOf('.');
        if (separator <= 0 || separator == value.length() - 1) {
            throw new IllegalArgumentException("Pairing code must be station_uuid.secret");
        }

        String stationId = value.substring(0, separator).trim();
        String secret = value.substring(separator + 1).trim();
        try {
            UUID.fromString(stationId);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Invalid station UUID", error);
        }
        if (secret.length() < 16 || secret.length() > 512) {
            throw new IllegalArgumentException("Invalid station secret");
        }
        return new PairingCredentials(stationId, secret);
    }

    public static final class PairingCredentials {
        public final String stationId;
        public final String secret;

        public PairingCredentials(String stationId, String secret) {
            this.stationId = stationId;
            this.secret = secret;
        }
    }
}
