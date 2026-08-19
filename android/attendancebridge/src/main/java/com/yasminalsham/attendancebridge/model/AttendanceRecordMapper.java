package com.yasminalsham.attendancebridge.model;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class AttendanceRecordMapper {
    private AttendanceRecordMapper() {
    }

    public static AttendanceEvent toEvent(String deviceCode, JSONObject record) {
        Object createdValue = first(record, "CreateTime");
        Object userIdValue = first(record, "UserID", "UserId");
        Long created = asLong(createdValue);
        String userId = cleanText(userIdValue, 100);
        if (created == null || created <= 0 || userId == null) return null;

        Object methodValue = first(record, "Method");
        Object statusValue = first(record, "Status");
        Object attendanceStateValue = first(record, "AttendanceState");
        Object recordIdValue = first(record, "RecNo", "RecordID", "RecordId");
        String name = cleanText(first(record, "CardName", "UserName", "Name"), 160);

        return new AttendanceEvent(
                eventKeyForValues(
                        deviceCode,
                        created,
                        userIdValue,
                        methodValue,
                        statusValue,
                        attendanceStateValue,
                        recordIdValue
                ),
                deviceCode,
                userId,
                name,
                formatUtc(created),
                boundedSmallInt(methodValue),
                boundedSmallInt(attendanceStateValue),
                successful(statusValue)
        );
    }

    public static DeviceUser toDeviceUser(JSONObject record) {
        String userId = cleanText(first(record, "UserID", "UserId"), 100);
        if (userId == null) return null;
        return new DeviceUser(
                userId,
                cleanText(first(record, "UserName", "Name"), 160),
                cleanText(first(record, "UserType"), 80),
                cleanText(first(record, "UserStatus"), 80)
        );
    }

    private static Object first(JSONObject json, String... names) {
        for (String name : names) {
            if (json.has(name) && !json.isNull(name)) return json.opt(name);
        }
        return null;
    }

    private static String cleanText(Object value, int maxLength) {
        if (value == null || value == JSONObject.NULL) return null;
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) return null;
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }

    private static Long asLong(Object value) {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value == null || value == JSONObject.NULL) return null;
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private static Integer boundedSmallInt(Object value) {
        Long number = asLong(value);
        if (number == null || number < 0 || number > 32767) return null;
        return number.intValue();
    }

    private static boolean successful(Object value) {
        if (value == null || value == JSONObject.NULL) return true;
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof Number) return ((Number) value).longValue() != 0;
        String text = String.valueOf(value).trim();
        if ("true".equalsIgnoreCase(text)) return true;
        if ("false".equalsIgnoreCase(text)) return false;
        try {
            return Long.parseLong(text) != 0;
        } catch (NumberFormatException ignored) {
            return true;
        }
    }

    private static String canonicalValue(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        if (value instanceof Boolean) return (Boolean) value ? "True" : "False";
        return String.valueOf(value);
    }

    static String eventKeyForValues(
            String deviceCode,
            long created,
            Object userId,
            Object method,
            Object status,
            Object attendanceState,
            Object recordId
    ) {
        String canonical = deviceCode
                + "|" + created
                + "|" + canonicalValue(userId)
                + "|" + canonicalValue(method)
                + "|" + canonicalValue(status)
                + "|" + canonicalValue(attendanceState)
                + "|" + canonicalValue(recordId);
        return sha256Lower(canonical);
    }

    private static String formatUtc(long unixSeconds) {
        SimpleDateFormat format = new SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US
        );
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(unixSeconds * 1000L));
    }

    private static String sha256Lower(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(hash.length * 2);
            for (byte item : hash) result.append(String.format(Locale.US, "%02x", item & 0xff));
            return result.toString();
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }
}
