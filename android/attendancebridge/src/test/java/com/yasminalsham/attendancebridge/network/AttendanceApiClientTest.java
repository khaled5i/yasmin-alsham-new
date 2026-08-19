package com.yasminalsham.attendancebridge.network;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public final class AttendanceApiClientTest {
    @Test
    public void hmacMatchesTheServerSha256Contract() throws Exception {
        assertEquals(
                "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
                AttendanceApiClient.hmacSha256Lower(
                        "key",
                        "The quick brown fox jumps over the lazy dog"
                )
        );
    }
}
