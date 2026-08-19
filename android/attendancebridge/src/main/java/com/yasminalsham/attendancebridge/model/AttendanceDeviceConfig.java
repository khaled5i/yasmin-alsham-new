package com.yasminalsham.attendancebridge.model;

public final class AttendanceDeviceConfig {
    public final String code;
    public final String name;
    public final String address;
    public final String username;
    public final String password;

    public AttendanceDeviceConfig(
            String code,
            String name,
            String address,
            String username,
            String password
    ) {
        this.code = code;
        this.name = name;
        this.address = address;
        this.username = username;
        this.password = password;
    }
}
