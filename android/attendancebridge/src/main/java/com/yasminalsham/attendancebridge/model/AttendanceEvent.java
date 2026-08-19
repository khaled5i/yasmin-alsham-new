package com.yasminalsham.attendancebridge.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class AttendanceEvent {
    public final String eventKey;
    public final String deviceCode;
    public final String deviceUserId;
    public final String personName;
    public final String occurredAt;
    public final Integer verificationMethod;
    public final Integer attendanceState;
    public final boolean wasSuccessful;

    public AttendanceEvent(
            String eventKey,
            String deviceCode,
            String deviceUserId,
            String personName,
            String occurredAt,
            Integer verificationMethod,
            Integer attendanceState,
            boolean wasSuccessful
    ) {
        this.eventKey = eventKey;
        this.deviceCode = deviceCode;
        this.deviceUserId = deviceUserId;
        this.personName = personName;
        this.occurredAt = occurredAt;
        this.verificationMethod = verificationMethod;
        this.attendanceState = attendanceState;
        this.wasSuccessful = wasSuccessful;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("eventKey", eventKey);
        json.put("deviceUserId", deviceUserId);
        json.put("personName", personName == null ? JSONObject.NULL : personName);
        json.put("occurredAt", occurredAt);
        json.put(
                "verificationMethod",
                verificationMethod == null ? JSONObject.NULL : verificationMethod
        );
        json.put(
                "attendanceState",
                attendanceState == null ? JSONObject.NULL : attendanceState
        );
        json.put("wasSuccessful", wasSuccessful);
        return json;
    }
}
