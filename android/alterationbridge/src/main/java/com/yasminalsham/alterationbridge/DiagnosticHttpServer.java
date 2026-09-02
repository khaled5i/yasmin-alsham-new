package com.yasminalsham.alterationbridge;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class DiagnosticHttpServer implements AutoCloseable {
    public static final int PORT = 19381;
    private static final int SOCKET_TIMEOUT_MS = 4_000;

    private final HealthProvider healthProvider;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ExecutorService acceptExecutor =
            Executors.newSingleThreadExecutor(runnable -> new Thread(runnable, "station-health"));
    private final ExecutorService connectionExecutor =
            Executors.newFixedThreadPool(2, runnable -> new Thread(runnable, "station-health-client"));
    private volatile ServerSocket serverSocket;

    public DiagnosticHttpServer(HealthProvider healthProvider) {
        this.healthProvider = healthProvider;
    }

    public void start() {
        if (!running.compareAndSet(false, true)) return;
        acceptExecutor.execute(() -> {
            try {
                ServerSocket socket = new ServerSocket();
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT));
                serverSocket = socket;
                while (running.get() && !socket.isClosed()) {
                    Socket client = socket.accept();
                    client.setSoTimeout(SOCKET_TIMEOUT_MS);
                    connectionExecutor.execute(() -> handle(client));
                }
            } catch (IOException ignored) {
            } finally {
                running.set(false);
            }
        });
    }

    @Override
    public void close() {
        running.set(false);
        ServerSocket socket = serverSocket;
        serverSocket = null;
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
        acceptExecutor.shutdownNow();
        connectionExecutor.shutdownNow();
    }

    private void handle(Socket client) {
        String origin = null;
        try (Socket socket = client;
             InputStream input = new BufferedInputStream(socket.getInputStream());
             OutputStream output = new BufferedOutputStream(socket.getOutputStream())) {
            String requestLine = readLine(input, 8_192);
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeJson(output, 400, "Bad Request", null, "{\"ok\":false}");
                return;
            }
            Map<String, String> headers = readHeaders(input);
            origin = headers.get("origin");
            if (!isAllowedOrigin(origin)) {
                writeJson(output, 403, "Forbidden", null,
                        "{\"ok\":false,\"error\":\"origin_not_allowed\"}");
                return;
            }

            String method = parts[0].toUpperCase(Locale.ROOT);
            String path = parts[1];
            if ("OPTIONS".equals(method)) {
                writeResponse(output, 204, "No Content", origin, new byte[0]);
            } else if ("GET".equals(method) && "/health".equals(path)) {
                writeJson(output, 200, "OK", origin, healthProvider.getHealthJson());
            } else if ("POST".equals(method) && "/print".equals(path)) {
                // Version 2 is queue-first. Direct local printing is deliberately disabled
                // so a browser cannot bypass the Active/Standby lease and duplicate jobs.
                writeJson(output, 410, "Gone", origin,
                        "{\"ok\":false,\"error\":\"direct_print_disabled\","
                                + "\"message\":\"Use the cloud print queue\"}");
            } else {
                writeJson(output, 404, "Not Found", origin,
                        "{\"ok\":false,\"error\":\"not_found\"}");
            }
        } catch (IOException ignored) {
        }
    }

    private static boolean isAllowedOrigin(String origin) {
        if (origin == null) return false;
        if (origin.equals("https://www.yasmin-alsham.fashion")
                || origin.equals("https://yasmin-alsham.fashion")
                || origin.equals("https://yasmin-alsham-new.vercel.app")) {
            return true;
        }
        if (origin.matches("^https://yasmin-alsham-new(?:-[a-z0-9-]+)?\\.vercel\\.app$")) {
            return true;
        }
        return origin.matches(
                "^http://(?:localhost|127\\.0\\.0\\.1|192\\.168\\.\\d{1,3}\\.\\d{1,3})"
                        + "(?::\\d+)?$"
        );
    }

    private static Map<String, String> readHeaders(InputStream input) throws IOException {
        Map<String, String> headers = new HashMap<>();
        while (true) {
            String line = readLine(input, 8_192);
            if (line == null || line.isEmpty()) break;
            int colon = line.indexOf(':');
            if (colon <= 0) continue;
            headers.put(
                    line.substring(0, colon).trim().toLowerCase(Locale.ROOT),
                    line.substring(colon + 1).trim()
            );
        }
        return headers;
    }

    private static String readLine(InputStream input, int maxLength) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int previous = -1;
        while (line.size() <= maxLength) {
            int current = input.read();
            if (current == -1) {
                return line.size() == 0
                        ? null
                        : line.toString(StandardCharsets.US_ASCII.name());
            }
            if (previous == '\r' && current == '\n') {
                byte[] bytes = line.toByteArray();
                return new String(
                        bytes,
                        0,
                        Math.max(0, bytes.length - 1),
                        StandardCharsets.US_ASCII
                );
            }
            line.write(current);
            previous = current;
        }
        throw new IOException("Header line too long");
    }

    private static void writeJson(
            OutputStream output,
            int status,
            String statusText,
            String origin,
            String json
    ) throws IOException {
        writeResponse(
                output,
                status,
                statusText,
                origin,
                json.getBytes(StandardCharsets.UTF_8)
        );
    }

    private static void writeResponse(
            OutputStream output,
            int status,
            String statusText,
            String origin,
            byte[] body
    ) throws IOException {
        StringBuilder headers = new StringBuilder()
                .append("HTTP/1.1 ").append(status).append(' ').append(statusText).append("\r\n")
                .append("Connection: close\r\n")
                .append("Cache-Control: no-store\r\n")
                .append("Content-Type: application/json; charset=utf-8\r\n")
                .append("Content-Length: ").append(body.length).append("\r\n")
                .append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
                .append("Access-Control-Allow-Headers: Content-Type, X-Printer-IP\r\n")
                .append("Access-Control-Allow-Private-Network: true\r\n")
                .append("Private-Network-Access-Name: yasmin-alteration-station\r\n")
                .append("Private-Network-Access-ID: 02:19:38:10:05:02\r\n");
        if (origin != null) {
            headers.append("Access-Control-Allow-Origin: ").append(origin).append("\r\n")
                    .append("Vary: Origin\r\n");
        }
        headers.append("\r\n");
        output.write(headers.toString().getBytes(StandardCharsets.US_ASCII));
        output.write(body);
        output.flush();
    }

    public interface HealthProvider {
        String getHealthJson();
    }
}
