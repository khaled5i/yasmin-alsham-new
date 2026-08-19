package com.yasminalsham.attendancebridge.network;

import com.yasminalsham.attendancebridge.config.AttendancePreferences;
import com.yasminalsham.attendancebridge.model.AttendanceEvent;
import com.yasminalsham.attendancebridge.model.DeviceUser;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class AttendanceApiClient {
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;

    public ApiResponse send(
            String siteUrl,
            String connectorId,
            String ingestSecret,
            String deviceCode,
            List<AttendanceEvent> events,
            boolean includeUserSnapshot,
            List<DeviceUser> users
    ) throws Exception {
        String normalizedSiteUrl = AttendancePreferences.normalizeSiteUrl(siteUrl);
        JSONObject payload = new JSONObject();
        payload.put("connectorId", connectorId);
        payload.put("deviceCode", deviceCode);
        JSONArray eventArray = new JSONArray();
        for (AttendanceEvent event : events) eventArray.put(event.toJson());
        payload.put("events", eventArray);
        if (includeUserSnapshot) {
            JSONArray userArray = new JSONArray();
            for (DeviceUser user : users) userArray.put(user.toJson());
            payload.put("userSnapshot", true);
            payload.put("users", userArray);
        }

        String body = payload.toString();
        long timestamp = System.currentTimeMillis() / 1000L;
        String signature = hmacSha256Lower(
                ingestSecret,
                timestamp + "." + body
        );

        URL endpoint = new URL(normalizedSiteUrl + "/api/attendance/ingest/");
        HttpURLConnection connection = (HttpURLConnection) endpoint.openConnection();
        try {
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(30_000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("x-attendance-timestamp", String.valueOf(timestamp));
            connection.setRequestProperty("x-attendance-signature", signature);

            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            String responseBody = readBody(
                    status >= 200 && status < 300
                            ? connection.getInputStream()
                            : connection.getErrorStream()
            );
            if (status < 200 || status >= 300) {
                throw new IOException(
                        "Attendance server rejected the batch (HTTP " + status + ")"
                );
            }

            JSONObject response = new JSONObject(responseBody);
            if (!response.optBoolean("ok", false)) {
                throw new IOException("Attendance server did not acknowledge the batch");
            }
            return new ApiResponse(
                    response.optInt("received", 0),
                    response.has("userSnapshotAccepted"),
                    response.optBoolean("userSnapshotAccepted", false)
            );
        } finally {
            connection.disconnect();
        }
    }

    static String hmacSha256Lower(String secret, String message) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(hash.length * 2);
        for (byte item : hash) result.append(String.format(Locale.US, "%02x", item & 0xff));
        return result.toString();
    }

    private static String readBody(InputStream input) throws IOException {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = stream.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("Server response is too large");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    public static final class ApiResponse {
        public final int received;
        public final boolean userSnapshotResponsePresent;
        public final boolean userSnapshotAccepted;

        ApiResponse(
                int received,
                boolean userSnapshotResponsePresent,
                boolean userSnapshotAccepted
        ) {
            this.received = received;
            this.userSnapshotResponsePresent = userSnapshotResponsePresent;
            this.userSnapshotAccepted = userSnapshotAccepted;
        }
    }
}
