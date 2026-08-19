package com.yasminalsham.attendancebridge.config;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;

import com.yasminalsham.attendancebridge.model.AttendanceDeviceConfig;
import com.yasminalsham.attendancebridge.security.SecretStore;

import java.net.URI;
import java.util.Locale;
import java.util.UUID;

@SuppressLint("ApplySharedPref")
public final class AttendancePreferences {
    public static final String ENTRY_CODE = "workshop-entry";
    public static final String EXIT_CODE = "workshop-exit";
    public static final String DEFAULT_SITE_URL = "https://www.yasmin-alsham.fashion";
    public static final String DEFAULT_ENTRY_ADDRESS = "https://192.168.100.30";
    public static final String DEFAULT_EXIT_ADDRESS = "https://192.168.100.29";

    private static final String PREFS_NAME = "attendance_bridge";
    private static final String PREF_ENABLED = "enabled";
    private static final String PREF_SITE_URL = "site_url";
    private static final String PREF_CONNECTOR_ID = "connector_id";
    private static final String PREF_ENTRY_ADDRESS = "entry_address";
    private static final String PREF_ENTRY_USERNAME = "entry_username";
    private static final String PREF_EXIT_ADDRESS = "exit_address";
    private static final String PREF_EXIT_USERNAME = "exit_username";

    private static final String SECRET_INGEST = "ingest";
    private static final String SECRET_ENTRY_PASSWORD = "entry_password";
    private static final String SECRET_EXIT_PASSWORD = "exit_password";

    private final SharedPreferences preferences;
    private final SecretStore secretStore;

    public AttendancePreferences(Context context) {
        Context appContext = context.getApplicationContext();
        preferences = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        secretStore = new SecretStore(appContext);
    }

    public synchronized void saveConfiguration(
            String siteUrl,
            String ingestSecret,
            String entryAddress,
            String entryUsername,
            String entryPassword,
            String exitAddress,
            String exitUsername,
            String exitPassword
    ) throws Exception {
        String normalizedSiteUrl = normalizeSiteUrl(siteUrl);
        String normalizedEntryAddress = normalizeDeviceAddress(entryAddress);
        String normalizedExitAddress = normalizeDeviceAddress(exitAddress);
        String normalizedEntryUsername = validateUsername(entryUsername);
        String normalizedExitUsername = validateUsername(exitUsername);

        String currentIngestSecret = loadSecret(SECRET_INGEST);
        String currentEntryPassword = loadSecret(SECRET_ENTRY_PASSWORD);
        String currentExitPassword = loadSecret(SECRET_EXIT_PASSWORD);

        String nextIngestSecret = chooseSecret(ingestSecret, currentIngestSecret, 32, 512, "ingest");
        String nextEntryPassword = chooseSecret(entryPassword, currentEntryPassword, 1, 512, "entry");
        String nextExitPassword = chooseSecret(exitPassword, currentExitPassword, 1, 512, "exit");

        secretStore.save(SECRET_INGEST, nextIngestSecret);
        secretStore.save(SECRET_ENTRY_PASSWORD, nextEntryPassword);
        secretStore.save(SECRET_EXIT_PASSWORD, nextExitPassword);

        boolean saved = preferences.edit()
                .putString(PREF_SITE_URL, normalizedSiteUrl)
                .putString(PREF_ENTRY_ADDRESS, normalizedEntryAddress)
                .putString(PREF_ENTRY_USERNAME, normalizedEntryUsername)
                .putString(PREF_EXIT_ADDRESS, normalizedExitAddress)
                .putString(PREF_EXIT_USERNAME, normalizedExitUsername)
                .putString(PREF_CONNECTOR_ID, getOrCreateConnectorId())
                .commit();
        if (!saved) throw new IllegalStateException("Could not save attendance settings");
    }

    public boolean hasCompleteConfiguration() {
        try {
            return !getSiteUrl().isEmpty()
                    && !getConnectorId().isEmpty()
                    && !getIngestSecret().isEmpty()
                    && !getEntryDevice().password.isEmpty()
                    && !getExitDevice().password.isEmpty();
        } catch (RuntimeException error) {
            return false;
        }
    }

    public AttendanceDeviceConfig getEntryDevice() {
        return new AttendanceDeviceConfig(
                ENTRY_CODE,
                "جهاز الدخول",
                getEntryAddress(),
                getEntryUsername(),
                loadSecret(SECRET_ENTRY_PASSWORD)
        );
    }

    public AttendanceDeviceConfig getExitDevice() {
        return new AttendanceDeviceConfig(
                EXIT_CODE,
                "جهاز الخروج",
                getExitAddress(),
                getExitUsername(),
                loadSecret(SECRET_EXIT_PASSWORD)
        );
    }

    public String getSiteUrl() {
        return preferences.getString(PREF_SITE_URL, DEFAULT_SITE_URL);
    }

    public String getEntryAddress() {
        return preferences.getString(PREF_ENTRY_ADDRESS, DEFAULT_ENTRY_ADDRESS);
    }

    public String getExitAddress() {
        return preferences.getString(PREF_EXIT_ADDRESS, DEFAULT_EXIT_ADDRESS);
    }

    public String getEntryUsername() {
        return preferences.getString(PREF_ENTRY_USERNAME, "admin");
    }

    public String getExitUsername() {
        return preferences.getString(PREF_EXIT_USERNAME, "admin");
    }

    public String getConnectorId() {
        String connectorId = preferences.getString(PREF_CONNECTOR_ID, "");
        return connectorId == null ? "" : connectorId;
    }

    public synchronized String getOrCreateConnectorId() {
        String existing = getConnectorId();
        if (!existing.isEmpty()) return existing;
        String generated = "yasmin-android-"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        if (!preferences.edit().putString(PREF_CONNECTOR_ID, generated).commit()) {
            throw new IllegalStateException("Could not save connector identity");
        }
        return generated;
    }

    public String getIngestSecret() {
        return loadSecret(SECRET_INGEST);
    }

    public boolean isEnabled() {
        return preferences.getBoolean(PREF_ENABLED, false);
    }

    public void setEnabled(boolean enabled) {
        preferences.edit().putBoolean(PREF_ENABLED, enabled).commit();
    }

    public int getPollIntervalSeconds() {
        return 60;
    }

    public int getOverlapSeconds() {
        return 120;
    }

    public int getInitialLookbackSeconds() {
        return 72 * 60 * 60;
    }

    public int getUserSyncIntervalSeconds() {
        return 60 * 60;
    }

    private String loadSecret(String name) {
        try {
            return secretStore.load(name);
        } catch (Exception error) {
            return "";
        }
    }

    private static String chooseSecret(
            String candidate,
            String existing,
            int minLength,
            int maxLength,
            String field
    ) {
        String value = candidate == null ? "" : candidate.trim();
        if (value.isEmpty()) value = existing == null ? "" : existing;
        if (value.length() < minLength || value.length() > maxLength) {
            throw new IllegalArgumentException("Invalid " + field + " secret");
        }
        return value;
    }

    private static String validateUsername(String value) {
        String username = value == null ? "" : value.trim();
        if (username.isEmpty() || username.length() > 100
                || username.contains("\n") || username.contains("\r")) {
            throw new IllegalArgumentException("Invalid device username");
        }
        return username;
    }

    public static String normalizeSiteUrl(String value) {
        try {
            URI uri = new URI(value == null ? "" : value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null) {
                throw new IllegalArgumentException("Site URL must use HTTPS");
            }
            String path = uri.getPath();
            String suffix = (path == null || path.isEmpty() || "/".equals(path)) ? "" : path;
            String port = uri.getPort() < 0 ? "" : ":" + uri.getPort();
            return "https://" + uri.getHost().toLowerCase(Locale.US) + port + suffix;
        } catch (Exception error) {
            throw new IllegalArgumentException("Invalid site URL", error);
        }
    }

    public static String normalizeDeviceAddress(String value) {
        try {
            URI uri = new URI(value == null ? "" : value.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
            String path = uri.getPath();
            if (!("http".equals(scheme) || "https".equals(scheme))
                    || !isPrivateIpv4(uri.getHost())
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null
                    || !(path == null || path.isEmpty() || "/".equals(path))) {
                throw new IllegalArgumentException("Device must use a private IPv4 address");
            }
            String port = uri.getPort() < 0 ? "" : ":" + uri.getPort();
            return scheme + "://" + uri.getHost() + port;
        } catch (Exception error) {
            throw new IllegalArgumentException("Invalid device address", error);
        }
    }

    public static boolean isPrivateIpv4(String value) {
        if (value == null) return false;
        String[] parts = value.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] numbers = new int[4];
        for (int index = 0; index < parts.length; index++) {
            try {
                numbers[index] = Integer.parseInt(parts[index]);
            } catch (NumberFormatException error) {
                return false;
            }
            if (numbers[index] < 0 || numbers[index] > 255) return false;
        }
        return numbers[0] == 10
                || (numbers[0] == 172 && numbers[1] >= 16 && numbers[1] <= 31)
                || (numbers[0] == 192 && numbers[1] == 168);
    }
}
