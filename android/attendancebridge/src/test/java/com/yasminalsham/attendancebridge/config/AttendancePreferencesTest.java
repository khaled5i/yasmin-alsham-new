package com.yasminalsham.attendancebridge.config;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public final class AttendancePreferencesTest {
    @Test
    public void acceptsOnlyPrivateDeviceAddresses() {
        assertEquals(
                "https://192.168.100.30",
                AttendancePreferences.normalizeDeviceAddress("https://192.168.100.30/")
        );
        assertEquals(
                "http://10.2.3.4:8080",
                AttendancePreferences.normalizeDeviceAddress("http://10.2.3.4:8080")
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> AttendancePreferences.normalizeDeviceAddress("https://example.com")
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> AttendancePreferences.normalizeDeviceAddress("https://192.168.100.30/RPC2")
        );
    }

    @Test
    public void requiresHttpsForTheHostedSite() {
        assertEquals(
                "https://www.yasmin-alsham.fashion",
                AttendancePreferences.normalizeSiteUrl("https://www.yasmin-alsham.fashion/")
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> AttendancePreferences.normalizeSiteUrl("http://www.yasmin-alsham.fashion")
        );
    }

    @Test
    public void recognizesRfc1918Ipv4Ranges() {
        assertTrue(AttendancePreferences.isPrivateIpv4("10.0.0.2"));
        assertTrue(AttendancePreferences.isPrivateIpv4("172.31.255.254"));
        assertTrue(AttendancePreferences.isPrivateIpv4("192.168.100.29"));
        assertFalse(AttendancePreferences.isPrivateIpv4("172.32.0.1"));
        assertFalse(AttendancePreferences.isPrivateIpv4("8.8.8.8"));
        assertFalse(AttendancePreferences.isPrivateIpv4("192.168.100.999"));
    }
}
