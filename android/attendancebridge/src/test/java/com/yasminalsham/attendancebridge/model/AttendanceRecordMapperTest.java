package com.yasminalsham.attendancebridge.model;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public final class AttendanceRecordMapperTest {
    @Test
    public void eventKeyMatchesTheExistingWindowsConnectorContract() {
        assertEquals(
                "bfc185df9e69454e1406c37f340cc93b7a260e51ee033948708336eaf56b76c7",
                AttendanceRecordMapper.eventKeyForValues(
                        "workshop-entry",
                        1724052000L,
                        "17",
                        4,
                        1,
                        0,
                        9281
                )
        );
    }
}
