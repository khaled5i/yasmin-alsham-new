package com.yasminalsham.printbridge.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class ClaimedJob {
    public static final String TYPE_RECEIPT = "tailoring_order_receipt";
    public static final String TYPE_TEST_RECEIPT = "tailoring_test_receipt";
    public static final String TYPE_CASH_DRAWER = "tailoring_cash_drawer_open";

    public final String id;
    public final String jobToken;
    public final String incomeId;
    public final String jobType;
    public final JSONObject payload;
    public final boolean openCashDrawer;
    public final int attemptCount;
    public final String leaseExpiresAt;

    public ClaimedJob(
            String id,
            String jobToken,
            String incomeId,
            String jobType,
            JSONObject payload,
            boolean openCashDrawer,
            int attemptCount,
            String leaseExpiresAt
    ) {
        this.id = id;
        this.jobToken = jobToken;
        this.incomeId = incomeId;
        this.jobType = jobType;
        this.payload = payload;
        this.openCashDrawer = openCashDrawer;
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
        if (!TYPE_RECEIPT.equals(type)
                && !TYPE_TEST_RECEIPT.equals(type)
                && !TYPE_CASH_DRAWER.equals(type)) {
            throw new JSONException("Unsupported job type: " + type);
        }

        JSONObject payload = json.optJSONObject("payload");
        if (payload == null) payload = new JSONObject();
        return new ClaimedJob(
                id,
                token,
                json.isNull("income_id") ? "" : json.optString("income_id", ""),
                type,
                payload,
                json.optBoolean("open_cash_drawer", false),
                Math.max(0, json.optInt("attempt_count", 0)),
                json.optString("lease_expires_at", "")
        );
    }
}
