package com.yasminalsham.alterationbridge.print;

import android.net.Network;
import android.os.SystemClock;

import java.io.Closeable;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.SocketChannel;
import java.util.Iterator;
import java.util.concurrent.atomic.AtomicReference;

public final class PrinterTransport {
    public static final int PRINTER_PORT = 9100;
    private static final long CONNECT_TIMEOUT_MS = 3_000;
    private static final long WRITE_TIMEOUT_MS = 25_000;
    private static final int PROGRESS_STEP_BYTES = 8 * 1024;

    private final AtomicReference<Connection> activeConnection = new AtomicReference<>();

    public Connection connect(String printerIp, Network wifiNetwork) throws PrinterException {
        Connection connection = null;
        try {
            connection = openConnection(wifiNetwork);
            activeConnection.set(connection);
            connection.connect(printerIp, PRINTER_PORT, CONNECT_TIMEOUT_MS);
            return connection;
        } catch (PrinterException error) {
            activeConnection.compareAndSet(connection, null);
            closeQuietly(connection);
            throw error;
        } catch (IOException error) {
            activeConnection.compareAndSet(connection, null);
            closeQuietly(connection);
            throw new PrinterException(
                    "printer_connect_failed",
                    "تعذّر الاتصال بالطابعة " + printerIp + ":9100",
                    0,
                    error
            );
        }
    }

    public boolean probe(String printerIp, Network wifiNetwork) {
        Connection connection = null;
        try {
            connection = openConnection(wifiNetwork);
            connection.connect(printerIp, PRINTER_PORT, 1_500);
            return true;
        } catch (Exception ignored) {
            return false;
        } finally {
            closeQuietly(connection);
        }
    }

    public void cancelActive() {
        closeQuietly(activeConnection.getAndSet(null));
    }

    public void release(Connection connection) {
        activeConnection.compareAndSet(connection, null);
        closeQuietly(connection);
    }

    private Connection openConnection(Network wifiNetwork) throws IOException {
        if (wifiNetwork == null) return new Connection(SocketChannel.open());

        SocketChannel boundChannel = SocketChannel.open();
        try {
            wifiNetwork.bindSocket(boundChannel.socket());
            return new Connection(boundChannel);
        } catch (IOException bindError) {
            closeQuietly(boundChannel);
            return new Connection(SocketChannel.open());
        }
    }

    private static void closeQuietly(Closeable closeable) {
        if (closeable == null) return;
        try {
            closeable.close();
        } catch (IOException ignored) {
        }
    }

    public interface ProgressListener {
        void onProgress(int bytesSent);
    }

    public static final class Connection implements Closeable {
        private final SocketChannel channel;
        private final Selector selector;
        private volatile boolean closed;

        Connection(SocketChannel channel) throws IOException {
            this.channel = channel;
            this.selector = Selector.open();
            Socket socket = channel.socket();
            socket.setTcpNoDelay(true);
            socket.setKeepAlive(false);
            socket.setSendBufferSize(16 * 1024);
            channel.configureBlocking(false);
        }

        void connect(String ip, int port, long timeoutMs) throws PrinterException {
            long deadline = SystemClock.elapsedRealtime() + timeoutMs;
            try {
                if (channel.connect(new InetSocketAddress(ip, port))) return;
                channel.register(selector, SelectionKey.OP_CONNECT);
                while (!channel.finishConnect()) {
                    awaitReady(SelectionKey.OP_CONNECT, deadline, "printer_connect_timeout", 0);
                }
            } catch (PrinterException error) {
                throw error;
            } catch (IOException error) {
                throw new PrinterException(
                        "printer_connect_failed",
                        "فشل اتصال TCP بالطابعة",
                        0,
                        error
                );
            }
        }

        public int send(byte[] bytes, ProgressListener listener) throws PrinterException {
            if (bytes == null || bytes.length == 0) return 0;
            int bytesSent = 0;
            int nextProgress = PROGRESS_STEP_BYTES;
            long deadline = SystemClock.elapsedRealtime() + WRITE_TIMEOUT_MS;
            try {
                SelectionKey key = channel.keyFor(selector);
                if (key == null) key = channel.register(selector, SelectionKey.OP_WRITE);
                else key.interestOps(SelectionKey.OP_WRITE);

                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) {
                    int written = channel.write(buffer);
                    if (written > 0) {
                        bytesSent += written;
                        if (listener != null && bytesSent >= nextProgress) {
                            listener.onProgress(bytesSent);
                            nextProgress = bytesSent + PROGRESS_STEP_BYTES;
                        }
                        continue;
                    }
                    awaitReady(
                            SelectionKey.OP_WRITE,
                            deadline,
                            "printer_write_timeout",
                            bytesSent
                    );
                }
                if (listener != null) listener.onProgress(bytesSent);
                return bytesSent;
            } catch (PrinterException error) {
                throw error;
            } catch (IOException error) {
                throw new PrinterException(
                        "printer_write_failed",
                        "انقطع الاتصال أثناء إرسال الفاتورة",
                        bytesSent,
                        error
                );
            }
        }

        private void awaitReady(
                int operation,
                long deadline,
                String timeoutCode,
                int bytesSent
        ) throws IOException {
            while (true) {
                if (closed) {
                    throw new PrinterException(
                            "printer_connection_closed",
                            "أُغلق اتصال الطابعة",
                            bytesSent
                    );
                }
                long remaining = deadline - SystemClock.elapsedRealtime();
                if (remaining <= 0) {
                    throw new PrinterException(
                            timeoutCode,
                            operation == SelectionKey.OP_CONNECT
                                    ? "انتهت مهلة الاتصال بالطابعة"
                                    : "انتهت مهلة إرسال بيانات الطباعة",
                            bytesSent
                    );
                }

                int ready = selector.select(remaining);
                if (ready == 0) continue;
                Iterator<SelectionKey> iterator = selector.selectedKeys().iterator();
                while (iterator.hasNext()) {
                    SelectionKey key = iterator.next();
                    iterator.remove();
                    if (!key.isValid()) continue;
                    if (operation == SelectionKey.OP_CONNECT && key.isConnectable()) return;
                    if (operation == SelectionKey.OP_WRITE && key.isWritable()) return;
                }
            }
        }

        @Override
        public void close() throws IOException {
            closed = true;
            selector.wakeup();
            IOException first = null;
            try {
                channel.close();
            } catch (IOException error) {
                first = error;
            }
            try {
                selector.close();
            } catch (IOException error) {
                if (first == null) first = error;
            }
            if (first != null) throw first;
        }
    }
}
