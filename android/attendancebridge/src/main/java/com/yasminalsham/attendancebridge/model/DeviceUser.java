package com.yasminalsham.attendancebridge.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class DeviceUser {
    public final String deviceUserId;
    public final String displayName;
    public final String userType;
    public final String userStatus;

    public DeviceUser(
            String deviceUserId,
            String displayName,
            String userType,
            String userStatus
    ) {
        this.deviceUserId = deviceUserId;
        this.displayName = displayName;
        this.userType = userType;
        this.userStatus = userStatus;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("deviceUserId", deviceUserId);
        json.put("displayName", displayName == null ? JSONObject.NULL : displayName);
        json.put("userType", userType == null ? JSONObject.NULL : userType);
        json.put("userStatus", userStatus == null ? JSONObject.NULL : userStatus);
        return json;
    }
}
