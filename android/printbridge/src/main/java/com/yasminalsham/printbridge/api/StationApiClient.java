package com.yasminalsham.printbridge.api;

import com.yasminalsham.printbridge.BuildConfig;
import com.yasminalsham.printbridge.config.StationPreferences;
import com.yasminalsham.printbridge.model.ClaimedJob;
import com.yasminalsham.printbridge.model.StationStatus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import javax.net.ssl.HttpsURLConnection;

public final class StationApiClient {
    private static final int CONNECT_TIMEOUT_MS = 4_000;
    private static final int READ_TIMEOUT_MS = 8_000;
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;

    private static final String RPC_HEARTBEAT = "tailoring_station_heartbeat";
    private static final String RPC_CLAIM_JOB = "tailoring_station_claim_job";
    private static final String RPC_BEGIN_SEND = "tailoring_station_begin_send";
    private static final String RPC_COMPLETE_JOB = "tailoring_station_complete_job";
    private static final String RPC_FAIL_JOB = "tailoring_station_fail_job";
    private static final String RPC_RELEASE = "tailoring_station_release";

    private final String baseUrl;
    private final String anonKey;

    public StationApiClient() {
        baseUrl = trimTrailingSlash(BuildConfig.SUPABASE_URL);
        anonKey = BuildConfig.SUPABASE_ANON_KEY == null
                ? ""
                : BuildConfig.SUPABASE_ANON_KEY.trim();
    }

    public boolean isConfigured() {
        return baseUrl.startsWith("https://") && !anonKey.isEmpty();
    }

    public StationStatus heartbeat(
            StationPreferences.PairingCredentials credentials,
            String printerIp,
            boolean printerReachable,
            String lastError
    ) throws ApiException {
        JSONObject params = new JSONObject();
        put(params, "p_station_id", credentials.stationId);
        put(params, "p_station_secret", credentials.secret);
        put(params, "p_app_version", BuildConfig.VERSION_NAME);
        put(params, "p_printer_ip", printerIp);
        put(params, "p_printer_reachable", printerReachable);
        put(params, "p_last_error", emptyToNull(lastError));

        JSONObject response = call(RPC_HEARTBEAT, params);
        requireOk(response);
        String roleValue = response.optString("role", "standby");
        StationStatus.Role role = "active".equalsIgnoreCase(roleValue)
                ? StationStatus.Role.ACTIVE
                : StationStatus.Role.STANDBY;
        long pollAfterMs = response.optLong(
                "poll_after_ms",
                response.optLong("heartbeat_interval_ms", 5_000)
        );
        return new StationStatus(
                role,
                response.optLong("generation", 0),
                response.optString("lease_expires_at", ""),
                response.optString("active_station_id", ""),
                Math.max(0, response.optInt("pending_count", 0)),
                Math.max(0, response.optInt("unknown_count", 0)),
                response.optString("server_time", ""),
                clamp(pollAfterMs, 1_000, 30_000),
                printerReachable,
                lastError == null ? "" : lastError,
                System.currentTimeMillis()
        );
    }

    public ClaimedJob claimJob(
            StationPreferences.PairingCredentials credentials,
            long generation
    ) throws ApiException {
        JSONObject params = authenticatedParams(credentials);
        put(params, "p_generation", generation);
        JSONObject response = call(RPC_CLAIM_JOB, params);
        requireOk(response);
        JSONObject job = response.optJSONObject("job");
        if (job == null || response.isNull("job")) return null;
        try {
            return ClaimedJob.fromJson(job);
        } catch (JSONException error) {
            throw new ApiException(
                    "invalid_job",
                    "Malformed print job returned by server",
                    error,
                    false
            );
        }
    }

    public boolean beginSend(
            StationPreferences.PairingCredentials credentials,
            long generation,
            String jobId,
            String jobToken
    ) throws ApiException {
        JSONObject params = jobParams(credentials, jobId, jobToken);
        put(params, "p_generation", generation);
        JSONObject response = call(RPC_BEGIN_SEND, params);
        requireOk(response);
        return response.optBoolean("accepted", false);
    }

    public boolean completeJob(
            StationPreferences.PairingCredentials credentials,
            String jobId,
            String jobToken
    ) throws ApiException {
        JSONObject response = call(
                RPC_COMPLETE_JOB,
                jobParams(credentials, jobId, jobToken)
        );
        requireOk(response);
        return response.optBoolean("accepted", false);
    }

    public FailResult failJob(
            StationPreferences.PairingCredentials credentials,
            String jobId,
            String jobToken,
            int bytesSent,
            String errorCode,
            String errorMessage
    ) throws ApiException {
        JSONObject params = jobParams(credentials, jobId, jobToken);
        put(params, "p_bytes_sent", Math.max(0, bytesSent));
        put(params, "p_error_code", truncate(errorCode, 80));
        put(params, "p_error_message", truncate(errorMessage, 500));
        JSONObject response = call(RPC_FAIL_JOB, params);
        requireOk(response);
        return new FailResult(
                response.optBoolean("accepted", true),
                response.optString("status", ""),
                response.optString(
                        "retry_at",
                        response.optString("next_attempt_at", "")
                )
        );
    }

    public void release(
            StationPreferences.PairingCredentials credentials,
            long generation
    ) throws ApiException {
        JSONObject params = authenticatedParams(credentials);
        put(params, "p_generation", generation);
        JSONObject response = call(RPC_RELEASE, params);
        requireOk(response);
    }

    private JSONObject authenticatedParams(
            StationPreferences.PairingCredentials credentials
    ) throws ApiException {
        JSONObject params = new JSONObject();
        put(params, "p_station_id", credentials.stationId);
        put(params, "p_station_secret", credentials.secret);
        return params;
    }

    private JSONObject jobParams(
            StationPreferences.PairingCredentials credentials,
            String jobId,
            String jobToken
    ) throws ApiException {
        JSONObject params = authenticatedParams(credentials);
        put(params, "p_job_id", jobId);
        put(params, "p_job_token", jobToken);
        return params;
    }

    private JSONObject call(String rpcName, JSONObject params) throws ApiException {
        if (!isConfigured()) {
            throw new ApiException(
                    "api_not_configured",
                    "Supabase station API is not configured in this build",
                    0,
                    false
            );
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl + "/rest/v1/rpc/" + rpcName);
            connection = (HttpURLConnection) url.openConnection();
            if (!(connection instanceof HttpsURLConnection)) {
                throw new ApiException(
                        "https_required",
                        "Station API must use HTTPS",
                        0,
                        false
                );
            }

            byte[] requestBody = params.toString().getBytes(StandardCharsets.UTF_8);
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(requestBody.length);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("apikey", anonKey);
            connection.setRequestProperty("Authorization", "Bearer " + anonKey);

            try (OutputStream output = connection.getOutputStream()) {
                output.write(requestBody);
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String body = stream == null ? "" : readLimited(stream);
            if (status < 200 || status >= 300) {
                throw new ApiException(
                        "http_" + status,
                        extractErrorMessage(body, "Station API returned HTTP " + status),
                        status,
                        status == 408 || status == 429 || status >= 500
                );
            }
            return parseObject(body);
        } catch (ApiException error) {
            throw error;
        } catch (IOException error) {
            throw new ApiException(
                    "network_error",
                    "Unable to reach station API",
                    error,
                    true
            );
        } catch (JSONException error) {
            throw new ApiException(
                    "invalid_response",
                    "Station API returned invalid JSON",
                    error,
                    true
            );
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static JSONObject parseObject(String body) throws JSONException {
        Object value = new JSONTokener(body).nextValue();
        if (value instanceof JSONObject) return (JSONObject) value;
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            if (array.length() > 0 && array.opt(0) instanceof JSONObject) {
                return array.getJSONObject(0);
            }
        }
        throw new JSONException("Expected JSON object");
    }

    private static void requireOk(JSONObject response) throws ApiException {
        if (response.optBoolean("ok", false)) return;
        String reason = response.optString(
                "reason",
                response.optString("error", "Station RPC rejected the request")
        );
        throw new ApiException("rpc_rejected", truncate(reason, 500), 200, false);
    }

    private static String readLimited(InputStream input) throws IOException {
        try (InputStream source = input;
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4_096];
            int total = 0;
            while (true) {
                int read = source.read(buffer);
                if (read == -1) break;
                total += read;
                if (total > MAX_RESPONSE_BYTES) {
                    throw new IOException("Station API response too large");
                }
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String extractErrorMessage(String body, String fallback) {
        try {
            JSONObject json = parseObject(body);
            return truncate(json.optString(
                    "message",
                    json.optString("error", fallback)
            ), 500);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static void put(JSONObject json, String key, Object value) throws ApiException {
        try {
            json.put(key, value == null ? JSONObject.NULL : value);
        } catch (JSONException error) {
            throw new ApiException("json_error", "Unable to build station request", error, false);
        }
    }

    private static Object emptyToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : truncate(value, 500);
    }

    private static String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    private static long clamp(long value, long minimum, long maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value;
        return value.substring(0, maxLength);
    }

    public static final class FailResult {
        public final boolean accepted;
        public final String status;
        public final String retryAt;

        public FailResult(boolean accepted, String status, String retryAt) {
            this.accepted = accepted;
            this.status = status;
            this.retryAt = retryAt;
        }
    }
}
