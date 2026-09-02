package com.yasminalsham.alterationbridge.data;

import com.yasminalsham.alterationbridge.model.ClaimedJob;

import org.json.JSONException;
import org.json.JSONObject;

public final class LocalPrintJob {
    public final String jobId;
    public final String jobToken;
    public final String jobType;
    public final String payloadJson;
    public final LocalJobState state;
    public final int bytesSent;
    public final String lastError;
    public final long updatedAtMs;

    public LocalPrintJob(
            String jobId,
            String jobToken,
            String jobType,
            String payloadJson,
            LocalJobState state,
            int bytesSent,
            String lastError,
            long updatedAtMs
    ) {
        this.jobId = jobId;
        this.jobToken = jobToken;
        this.jobType = jobType;
        this.payloadJson = payloadJson;
        this.state = state;
        this.bytesSent = bytesSent;
        this.lastError = lastError;
        this.updatedAtMs = updatedAtMs;
    }

    public ClaimedJob toClaimedJob() throws JSONException {
        return new ClaimedJob(
                jobId,
                jobToken,
                "",
                jobType,
                new JSONObject(payloadJson),
                0,
                ""
        );
    }
}
