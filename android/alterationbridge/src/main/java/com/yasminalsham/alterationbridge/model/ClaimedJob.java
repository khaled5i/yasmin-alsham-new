package com.yasminalsham.alterationbridge.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class ClaimedJob {
    public static final String TYPE_SLIP = "alteration_slip";
    public static final String TYPE_TEST_SLIP = "alteration_test_slip";

    public final String id;
    public final String jobToken;
    public final String alterationId;
    public final String jobType;
    public final JSONObject payload;
    public final int attemptCount;
    public final String leaseExpiresAt;

    public ClaimedJob(
            String id,
            String jobToken,
            String alterationId,
            String jobType,
            JSONObject payload,
            int attemptCount,
            String leaseExpiresAt
    ) {
        this.id = id;
        this.jobToken = jobToken;
        this.alterationId = alterationId;
        this.jobType = jobType;
        this.payload = payload;
        this.attemptCount = attemptCount;
        this.leaseExpiresAt = leaseExpiresAt;
    }

    public static ClaimedJob fromJson(JSONObject json) throws JSONException {
        if (json == null) throw new JSONException("Missing print job");
        String id = json.optString("id", "").trim();
        String token = json.optString("job_token", "").trim();
        String type = json.optString("job_type", "").trim();
        if (id.isEmpty()) throw new JSONException("Missing job id");
        if (token.isEmpty()) throw new JSONException("Missing job token");
        if (!TYPE_SLIP.equals(type) && !TYPE_TEST_SLIP.equals(type)) {
            throw new JSONException("Unsupported job type: " + type);
        }

        JSONObject payload = json.optJSONObject("payload");
        if (payload == null) payload = new JSONObject();
        return new ClaimedJob(
                id,
                token,
                json.isNull("alteration_id") ? "" : json.optString("alteration_id", ""),
                type,
                payload,
                Math.max(0, json.optInt("attempt_count", 0)),
                json.optString("lease_expires_at", "")
        );
    }
}
