package com.yasminalsham.printbridge.print;

import java.io.IOException;

public final class PrinterException extends IOException {
    public final String code;
    public final int bytesSent;

    public PrinterException(String code, String message, int bytesSent) {
        super(message);
        this.code = code;
        this.bytesSent = Math.max(0, bytesSent);
    }

    public PrinterException(String code, String message, int bytesSent, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.bytesSent = Math.max(0, bytesSent);
    }
}
