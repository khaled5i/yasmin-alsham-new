package com.yasminalsham.attendancebridge.network;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import com.yasminalsham.attendancebridge.config.AttendancePreferences;
import com.yasminalsham.attendancebridge.model.AttendanceDeviceConfig;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieManager;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public final class DahuaClient {
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 20_000;
    private static final int MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

    private final Context context;
    private final ConnectivityManager connectivityManager;

    public DahuaClient(Context context) {
        this.context = context.getApplicationContext();
        connectivityManager = (ConnectivityManager) this.context
                .getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    public List<JSONObject> getRecords(
            AttendanceDeviceConfig device,
            long fromUnix,
            long toUnix
    ) throws Exception {
        Session session = openSession(device);
        Object finderId = null;
        ArrayList<JSONObject> records = new ArrayList<>();
        try {
            JSONObject factory = rpc(
                    session,
                    "RecordFinder.factory.create",
                    new JSONObject().put("name", "AccessControlCardRec"),
                    null
            );
            finderId = factory.get("result");

            JSONObject condition = new JSONObject();
            condition.put("CreateTime", new JSONArray().put("<>").put(fromUnix).put(toUnix));
            condition.put(
                    "Orders",
                    new JSONArray().put(
                            new JSONObject().put("Field", "CreateTime").put("Type", "Ascent")
                    )
            );
            rpc(
                    session,
                    "RecordFinder.startFind",
                    new JSONObject().put("condition", condition),
                    finderId
            );
            JSONObject size = rpc(session, "RecordFinder.getQuerySize", null, finderId);
            int total = Math.max(0, size.getJSONObject("params").optInt("count", 0));

            for (int offset = 0; offset < total; offset += 100) {
                int count = Math.min(100, total - offset);
                JSONObject page = rpc(
                        session,
                        "RecordFinder.doSeekFind",
                        new JSONObject().put("count", count).put("offset", offset),
                        finderId
                );
                JSONArray pageRecords = page.optJSONObject("params") == null
                        ? null
                        : page.optJSONObject("params").optJSONArray("records");
                if (pageRecords == null) continue;
                for (int index = 0; index < pageRecords.length(); index++) {
                    JSONObject record = pageRecords.optJSONObject(index);
                    if (record != null) records.add(record);
                }
            }
        } finally {
            if (finderId != null) {
                try {
                    rpc(session, "RecordFinder.stopFind", null, finderId);
                } catch (Exception ignored) {
                }
                try {
                    rpc(session, "RecordFinder.destroy", null, finderId);
                } catch (Exception ignored) {
                }
            }
            closeSession(session);
        }
        return records;
    }

    public List<JSONObject> getUsers(AttendanceDeviceConfig device) throws Exception {
        Session session = openSession(device);
        Object token = null;
        ArrayList<JSONObject> users = new ArrayList<>();
        try {
            JSONObject start = rpc(
                    session,
                    "AccessUser.startFind",
                    new JSONObject().put("Condition", JSONObject.NULL),
                    null
            );
            JSONObject params = start.getJSONObject("params");
            token = params.get("Token");
            int total = Math.max(0, params.optInt("Total", 0));
            if (total > 2000) {
                throw new IOException("The terminal contains more than 2000 users");
            }

            for (int offset = 0; offset < total; offset += 100) {
                int count = Math.min(100, total - offset);
                JSONObject page = rpc(
                        session,
                        "AccessUser.doFind",
                        new JSONObject()
                                .put("Token", token)
                                .put("Offset", offset)
                                .put("Count", count),
                        null
                );
                JSONObject pageParams = page.optJSONObject("params");
                JSONArray info = pageParams == null ? null : pageParams.optJSONArray("Info");
                if (info == null) continue;
                for (int index = 0; index < info.length(); index++) {
                    JSONObject user = info.optJSONObject(index);
                    if (user != null) users.add(user);
                }
            }
        } finally {
            if (token != null) {
                try {
                    rpc(
                            session,
                            "AccessUser.stopFind",
                            new JSONObject().put("Token", token),
                            null
                    );
                } catch (Exception ignored) {
                }
            }
            closeSession(session);
        }
        return users;
    }

    private Session openSession(AttendanceDeviceConfig device) throws Exception {
        String address = AttendancePreferences.normalizeDeviceAddress(device.address);
        CookieManager cookies = new CookieManager();

        JSONObject firstPayload = new JSONObject();
        firstPayload.put("method", "global.login");
        firstPayload.put(
                "params",
                new JSONObject()
                        .put("userName", device.username)
                        .put("password", "")
                        .put("clientType", "Web3.0")
        );
        firstPayload.put("id", 1);
        JSONObject first = postJson(address, "/RPC2_Login", firstPayload, cookies);
        Object sessionId = first.opt("session");
        JSONObject challenge = first.optJSONObject("params");
        if (sessionId == null || sessionId == JSONObject.NULL || challenge == null) {
            throw new IOException("The terminal did not return a login challenge");
        }
        String realm = challenge.optString("realm", "");
        String random = challenge.optString("random", "");
        if (realm.isEmpty() || random.isEmpty()) {
            throw new IOException("The terminal login challenge is incomplete");
        }

        String realmHash = md5Upper(device.username + ":" + realm + ":" + device.password);
        String loginHash = md5Upper(device.username + ":" + random + ":" + realmHash);
        JSONObject secondPayload = new JSONObject();
        secondPayload.put("method", "global.login");
        secondPayload.put(
                "params",
                new JSONObject()
                        .put("userName", device.username)
                        .put("password", loginHash)
                        .put("clientType", "Web3.0")
                        .put("authorityType", challenge.opt("encryption"))
        );
        secondPayload.put("id", 2);
        secondPayload.put("session", sessionId);
        JSONObject second = postJson(address, "/RPC2_Login", secondPayload, cookies);
        if (!truthy(second.opt("result"))) {
            throw new IOException("The terminal rejected the username or password");
        }
        return new Session(address, cookies, sessionId);
    }

    private JSONObject rpc(
            Session session,
            String method,
            JSONObject params,
            Object objectId
    ) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("method", method);
        payload.put("params", params == null ? JSONObject.NULL : params);
        payload.put("id", session.nextId++);
        payload.put("session", session.sessionId);
        if (objectId != null) payload.put("object", objectId);

        JSONObject response = postJson(session.address, "/RPC2", payload, session.cookies);
        if (!truthy(response.opt("result"))) {
            JSONObject error = response.optJSONObject("error");
            String code = error == null ? "unknown" : String.valueOf(error.opt("code"));
            throw new IOException("Dahua RPC " + method + " failed (" + code + ")");
        }
        return response;
    }

    private void closeSession(Session session) {
        try {
            rpc(session, "global.logout", null, null);
        } catch (Exception ignored) {
        }
    }

    private JSONObject postJson(
            String address,
            String path,
            JSONObject payload,
            CookieManager cookies
    ) throws Exception {
        URL url = new URL(address + path);
        URI uri = url.toURI();
        HttpURLConnection connection = openLocalConnection(url);
        try {
            if (connection instanceof HttpsURLConnection) {
                HttpsURLConnection secure = (HttpsURLConnection) connection;
                secure.setSSLSocketFactory(
                        createPinnedLocalSslContext(url.getAuthority()).getSocketFactory()
                );
                String expectedHost = url.getHost();
                HostnameVerifier verifier = (hostname, sslSession) ->
                        expectedHost.equalsIgnoreCase(hostname)
                                && AttendancePreferences.isPrivateIpv4(hostname);
                secure.setHostnameVerifier(verifier);
            }
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            for (Map.Entry<String, List<String>> entry
                    : cookies.get(uri, Collections.emptyMap()).entrySet()) {
                for (String value : entry.getValue()) {
                    connection.addRequestProperty(entry.getKey(), value);
                }
            }

            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }

            int status = connection.getResponseCode();
            cookies.put(uri, connection.getHeaderFields());
            String responseBody = readBody(
                    status >= 200 && status < 300
                            ? connection.getInputStream()
                            : connection.getErrorStream()
            );
            if (status < 200 || status >= 300) {
                throw new IOException("Terminal HTTP request failed (" + status + ")");
            }
            try {
                return new JSONObject(responseBody);
            } catch (JSONException error) {
                throw new IOException("Terminal returned invalid JSON", error);
            }
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection openLocalConnection(URL url) throws IOException {
        if (connectivityManager != null) {
            for (Network network : connectivityManager.getAllNetworks()) {
                NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
                if (capabilities != null
                        && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    return (HttpURLConnection) network.openConnection(url);
                }
            }
        }
        return (HttpURLConnection) url.openConnection();
    }

    @SuppressLint("CustomX509TrustManager")
    private SSLContext createPinnedLocalSslContext(String authority) {
        try {
            SharedPreferences certificatePins = context.getSharedPreferences(
                    "attendance_device_certificate_pins",
                    Context.MODE_PRIVATE
            );
            TrustManager[] trustManagers = new TrustManager[]{new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType)
                        throws CertificateException {
                    throw new CertificateException("Client certificates are not accepted");
                }

                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType)
                        throws CertificateException {
                    if (chain == null || chain.length == 0 || chain[0] == null) {
                        throw new CertificateException("The terminal certificate is missing");
                    }
                    String keyAlgorithm = chain[0].getPublicKey().getAlgorithm();
                    if (!("RSA".equalsIgnoreCase(keyAlgorithm)
                            || "EC".equalsIgnoreCase(keyAlgorithm))) {
                        throw new CertificateException("Unsupported terminal certificate key");
                    }
                    String fingerprint;
                    try {
                        MessageDigest digest = MessageDigest.getInstance("SHA-256");
                        fingerprint = hexLower(digest.digest(chain[0].getEncoded()));
                    } catch (Exception error) {
                        throw new CertificateException(
                                "Could not verify the terminal certificate",
                                error
                        );
                    }

                    synchronized (DahuaClient.class) {
                        String existing = certificatePins.getString(authority, "");
                        if (existing == null || existing.isEmpty()) {
                            if (!certificatePins.edit().putString(authority, fingerprint).commit()) {
                                throw new CertificateException(
                                        "Could not pin the terminal certificate"
                                );
                            }
                        } else if (!MessageDigest.isEqual(
                                existing.getBytes(StandardCharsets.US_ASCII),
                                fingerprint.getBytes(StandardCharsets.US_ASCII)
                        )) {
                            throw new CertificateException(
                                    "The terminal certificate changed; verify the device before reconnecting"
                            );
                        }
                    }
                }

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }};
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, trustManagers, new SecureRandom());
            return context;
        } catch (Exception error) {
            throw new IllegalStateException("Could not initialize LAN TLS", error);
        }
    }

    private static String hexLower(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) result.append(String.format(Locale.US, "%02x", item & 0xff));
        return result.toString();
    }

    private static String md5Upper(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("MD5");
        byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(hash.length * 2);
        for (byte item : hash) result.append(String.format(Locale.US, "%02X", item & 0xff));
        return result.toString();
    }

    private static boolean truthy(Object value) {
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof Number) return ((Number) value).longValue() != 0;
        return value != null && value != JSONObject.NULL && !String.valueOf(value).isEmpty();
    }

    private static String readBody(InputStream input) throws IOException {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = stream.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("Terminal response is too large");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static final class Session {
        final String address;
        final CookieManager cookies;
        final Object sessionId;
        int nextId = 10;

        Session(String address, CookieManager cookies, Object sessionId) {
            this.address = address;
            this.cookies = cookies;
            this.sessionId = sessionId;
        }
    }
}
