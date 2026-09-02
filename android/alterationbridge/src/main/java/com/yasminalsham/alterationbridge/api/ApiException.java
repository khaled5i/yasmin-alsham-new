package com.yasminalsham.alterationbridge.api;

public final class ApiException extends Exception {
    public final String code;
    public final int httpStatus;
    public final boolean retryable;

    public ApiException(String code, String message, int httpStatus, boolean retryable) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.retryable = retryable;
    }

    public ApiException(String code, String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.code = code;
        this.httpStatus = 0;
        this.retryable = retryable;
    }
}
