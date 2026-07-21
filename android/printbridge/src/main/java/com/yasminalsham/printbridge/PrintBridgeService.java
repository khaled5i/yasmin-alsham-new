package com.yasminalsham.printbridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
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
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

public final class PrintBridgeService extends Service {
    private static final String TAG = "YasminPrintBridge";
    public static final String ACTION_START = "com.yasminalsham.printbridge.START";
    public static final String ACTION_STOP = "com.yasminalsham.printbridge.STOP";
    public static final String ACTION_TEST = "com.yasminalsham.printbridge.TEST";
    public static final String ACTION_RESULT = "com.yasminalsham.printbridge.RESULT";
    public static final String EXTRA_SUCCESS = "success";
    public static final String EXTRA_MESSAGE = "message";
    public static final String PREFS_NAME = "print_bridge";
    public static final String PREF_PRINTER_IP = "printer_ip";
    public static final String DEFAULT_PRINTER_IP = "192.168.100.105";

    private static final int BRIDGE_PORT = 19281;
    private static final int PRINTER_PORT = 9100;
    private static final int MAX_PRINT_BYTES = 512 * 1024;
    private static final int SOCKET_TIMEOUT_MS = 8_000;
    private static final int NOTIFICATION_ID = 19281;
    private static final String CHANNEL_ID = "yasmin_print_bridge";
    private static final Pattern PRIVATE_IPV4 = Pattern.compile(
            "^(10\\.(?:\\d{1,3}\\.){2}\\d{1,3}|192\\.168\\.(?:\\d{1,3}\\.)\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])\\.(?:\\d{1,3}\\.)\\d{1,3})$"
    );

    private static volatile boolean running;

    private final AtomicBoolean serverStarted = new AtomicBoolean(false);
    private final ExecutorService acceptExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService connectionExecutor = Executors.newFixedThreadPool(4);
    private final ExecutorService printerExecutor = Executors.newSingleThreadExecutor();
    private ServerSocket serverSocket;

    public static boolean isRunning() {
        return running;
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

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            stopBridge();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification("خدمة الطباعة جاهزة"));
        running = true;
        startHttpServer();

        if (ACTION_TEST.equals(action)) {
            printerExecutor.execute(this::printTestPage);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        closeServerSocket();
        acceptExecutor.shutdownNow();
        connectionExecutor.shutdownNow();
        printerExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startHttpServer() {
        if (!serverStarted.compareAndSet(false, true)) return;

        acceptExecutor.execute(() -> {
            try {
                ServerSocket socket = new ServerSocket();
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), BRIDGE_PORT));
                serverSocket = socket;
                Log.i(TAG, "Local bridge listening on 127.0.0.1:" + BRIDGE_PORT);

                while (!socket.isClosed() && !Thread.currentThread().isInterrupted()) {
                    Socket client = socket.accept();
                    client.setSoTimeout(SOCKET_TIMEOUT_MS);
                    connectionExecutor.execute(() -> handleClient(client));
                }
            } catch (IOException error) {
                if (running) {
                    Log.e(TAG, "Failed to start local bridge", error);
                    updateNotification("تعذّر تشغيل الجسر المحلي");
                }
            } finally {
                serverStarted.set(false);
            }
        });
    }

    private void handleClient(Socket client) {
        String origin = null;
        try (Socket socket = client;
             InputStream rawInput = new BufferedInputStream(socket.getInputStream());
             OutputStream output = new BufferedOutputStream(socket.getOutputStream())) {

            String requestLine = readLine(rawInput, 8_192);
            if (requestLine == null || requestLine.isEmpty()) return;

            String[] requestParts = requestLine.split(" ");
            if (requestParts.length < 2) {
                writeJson(output, 400, "Bad Request", origin, "{\"ok\":false,\"error\":\"bad_request\"}");
                return;
            }

            String method = requestParts[0].toUpperCase(Locale.ROOT);
            String path = requestParts[1];
            Map<String, String> headers = readHeaders(rawInput);
            origin = headers.get("origin");

            if (!isAllowedOrigin(origin)) {
                writeJson(output, 403, "Forbidden", null, "{\"ok\":false,\"error\":\"origin_not_allowed\"}");
                return;
            }

            if ("OPTIONS".equals(method)) {
                writeEmpty(output, 204, "No Content", origin);
                return;
            }

            if ("GET".equals(method) && "/health".equals(path)) {
                String ip = getPrinterIp();
                writeJson(output, 200, "OK", origin,
                        "{\"ok\":true,\"service\":\"yasmin-print-bridge\",\"version\":\"1.0.0\",\"printerIp\":\"" + ip + "\",\"printerPort\":9100}");
                return;
            }

            if (!"POST".equals(method) || !"/print".equals(path)) {
                writeJson(output, 404, "Not Found", origin, "{\"ok\":false,\"error\":\"not_found\"}");
                return;
            }

            int contentLength = parseContentLength(headers.get("content-length"));
            if (contentLength <= 0 || contentLength > MAX_PRINT_BYTES) {
                writeJson(output, 413, "Payload Too Large", origin, "{\"ok\":false,\"error\":\"invalid_print_size\"}");
                return;
            }

            byte[] printData = readExactly(rawInput, contentLength);
            String requestedIp = headers.get("x-printer-ip");
            String printerIp = isPrivateIpv4(requestedIp) ? requestedIp : getPrinterIp();
            Log.i(TAG, "Print request accepted: bytes=" + printData.length + ", printer=" + printerIp + ":" + PRINTER_PORT);

            Future<?> printTask = printerExecutor.submit(() -> {
                try {
                    sendToPrinter(printerIp, printData);
                } catch (IOException error) {
                    throw new PrintRuntimeException(error);
                }
            });

            try {
                printTask.get(20, TimeUnit.SECONDS);
                Log.i(TAG, "Print request completed: bytes=" + printData.length);
                updateNotification("تمت طباعة آخر إيصال");
                writeJson(output, 200, "OK", origin,
                        "{\"ok\":true,\"bytes\":" + printData.length + ",\"printerIp\":\"" + printerIp + "\"}");
            } catch (Exception error) {
                printTask.cancel(true);
                Log.e(TAG, "Print request failed", error);
                updateNotification("تعذّر الوصول إلى الطابعة");
                writeJson(output, 502, "Bad Gateway", origin,
                        "{\"ok\":false,\"error\":\"printer_unreachable\"}");
            }
        } catch (Exception error) {
            // The browser may close a probe connection before sending a full HTTP request.
            Log.w(TAG, "Local HTTP connection closed before completion", error);
        }
    }

    private void sendToPrinter(String printerIp, byte[] bytes) throws IOException {
        if (!isPrivateIpv4(printerIp)) throw new IOException("Invalid printer IP");

        try (Socket printer = new Socket()) {
            printer.setTcpNoDelay(true);
            printer.setSendBufferSize(64 * 1024);
            printer.connect(new InetSocketAddress(printerIp, PRINTER_PORT), SOCKET_TIMEOUT_MS);
            printer.setSoTimeout(SOCKET_TIMEOUT_MS);
            OutputStream output = printer.getOutputStream();
            output.write(bytes);
            output.flush();
            try {
                Thread.sleep(180);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void printTestPage() {
        String printerIp = getPrinterIp();
        byte[] text = ("YASMIN PRINT BRIDGE\r\n"
                + "TCP 9100 CONNECTED\r\n"
                + printerIp + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
        byte[] prefix = new byte[]{0x1b, 0x40, 0x1b, 0x61, 0x01};
        byte[] suffix = new byte[]{0x1b, 0x64, 0x04, 0x1d, 0x56, 0x00};
        byte[] job = new byte[prefix.length + text.length + suffix.length];
        System.arraycopy(prefix, 0, job, 0, prefix.length);
        System.arraycopy(text, 0, job, prefix.length, text.length);
        System.arraycopy(suffix, 0, job, prefix.length + text.length, suffix.length);

        try {
            sendToPrinter(printerIp, job);
            Log.i(TAG, "Printer test completed: " + printerIp + ":" + PRINTER_PORT);
            sendResult(true, "تمت طباعة ورقة الاختبار بنجاح");
            updateNotification("الخدمة جاهزة والطابعة متصلة");
        } catch (IOException error) {
            Log.e(TAG, "Printer test failed", error);
            sendResult(false, "تعذّر الاتصال بالطابعة " + printerIp + ":9100");
            updateNotification("تعذّر الاتصال بالطابعة");
        }
    }

    private void sendResult(boolean success, String message) {
        Intent result = new Intent(ACTION_RESULT);
        result.setPackage(getPackageName());
        result.putExtra(EXTRA_SUCCESS, success);
        result.putExtra(EXTRA_MESSAGE, message);
        sendBroadcast(result);
    }

    private String getPrinterIp() {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String ip = preferences.getString(PREF_PRINTER_IP, DEFAULT_PRINTER_IP);
        return isPrivateIpv4(ip) ? ip : DEFAULT_PRINTER_IP;
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
        return origin.matches("^http://(?:localhost|127\\.0\\.0\\.1|192\\.168\\.\\d{1,3}\\.\\d{1,3})(?::\\d+)?$");
    }

    private static Map<String, String> readHeaders(InputStream input) throws IOException {
        Map<String, String> headers = new HashMap<>();
        while (true) {
            String line = readLine(input, 8_192);
            if (line == null || line.isEmpty()) break;
            int colon = line.indexOf(':');
            if (colon <= 0) continue;
            String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(colon + 1).trim();
            headers.put(name, value);
        }
        return headers;
    }

    private static String readLine(InputStream input, int maxLength) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int previous = -1;
        while (line.size() <= maxLength) {
            int current = input.read();
            if (current == -1) return line.size() == 0 ? null : line.toString(StandardCharsets.US_ASCII.name());
            if (previous == '\r' && current == '\n') {
                byte[] bytes = line.toByteArray();
                return new String(bytes, 0, Math.max(0, bytes.length - 1), StandardCharsets.US_ASCII);
            }
            line.write(current);
            previous = current;
        }
        throw new IOException("HTTP header line too long");
    }

    private static int parseContentLength(String value) {
        if (value == null) return -1;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            return -1;
        }
    }

    private static byte[] readExactly(InputStream input, int length) throws IOException {
        byte[] bytes = new byte[length];
        int offset = 0;
        while (offset < length) {
            int read = input.read(bytes, offset, length - offset);
            if (read == -1) throw new EOFException("Unexpected end of print request");
            offset += read;
        }
        return bytes;
    }

    private static void writeEmpty(OutputStream output, int status, String statusText, String origin) throws IOException {
        writeResponse(output, status, statusText, origin, "text/plain; charset=utf-8", new byte[0]);
    }

    private static void writeJson(OutputStream output, int status, String statusText, String origin, String json) throws IOException {
        writeResponse(output, status, statusText, origin, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8));
    }

    private static void writeResponse(
            OutputStream output,
            int status,
            String statusText,
            String origin,
            String contentType,
            byte[] body
    ) throws IOException {
        StringBuilder headers = new StringBuilder();
        headers.append("HTTP/1.1 ").append(status).append(' ').append(statusText).append("\r\n")
                .append("Connection: close\r\n")
                .append("Cache-Control: no-store\r\n")
                .append("Content-Type: ").append(contentType).append("\r\n")
                .append("Content-Length: ").append(body.length).append("\r\n")
                .append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
                .append("Access-Control-Allow-Headers: Content-Type, X-Printer-IP\r\n")
                .append("Access-Control-Allow-Private-Network: true\r\n")
                .append("Private-Network-Access-Name: yasmin-print-bridge\r\n")
                .append("Private-Network-Access-ID: 02:19:28:10:05:01\r\n");
        if (origin != null) {
            headers.append("Access-Control-Allow-Origin: ").append(origin).append("\r\n")
                    .append("Vary: Origin\r\n");
        }
        headers.append("\r\n");
        output.write(headers.toString().getBytes(StandardCharsets.US_ASCII));
        output.write(body);
        output.flush();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("تحافظ على اتصال تطبيق Chrome بالطابعة الحرارية");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_printer)
                .setContentTitle("جسر طباعة ياسمين الشام")
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void stopBridge() {
        running = false;
        closeServerSocket();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void closeServerSocket() {
        ServerSocket socket = serverSocket;
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
        }
        serverSocket = null;
    }

    private static final class PrintRuntimeException extends RuntimeException {
        PrintRuntimeException(Throwable cause) {
            super(cause);
        }
    }
}
