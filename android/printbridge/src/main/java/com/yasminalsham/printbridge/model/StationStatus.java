package com.yasminalsham.printbridge.model;

public final class StationStatus {
    public enum Role {
        ACTIVE,
        STANDBY,
        UNPAIRED,
        OFFLINE,
        STOPPED
    }

    public final Role role;
    public final long generation;
    public final String leaseExpiresAt;
    public final String activeStationId;
    public final int pendingCount;
    public final int unknownCount;
    public final String serverTime;
    public final long pollAfterMs;
    public final boolean printerReachable;
    public final String lastError;
    public final long updatedAtMs;

    public StationStatus(
            Role role,
            long generation,
            String leaseExpiresAt,
            String activeStationId,
            int pendingCount,
            int unknownCount,
            String serverTime,
            long pollAfterMs,
            boolean printerReachable,
            String lastError,
            long updatedAtMs
    ) {
        this.role = role;
        this.generation = generation;
        this.leaseExpiresAt = leaseExpiresAt;
        this.activeStationId = activeStationId;
        this.pendingCount = pendingCount;
        this.unknownCount = unknownCount;
        this.serverTime = serverTime;
        this.pollAfterMs = pollAfterMs;
        this.printerReachable = printerReachable;
        this.lastError = lastError;
        this.updatedAtMs = updatedAtMs;
    }

    public static StationStatus initial() {
        return new StationStatus(
                Role.STOPPED,
                0,
                "",
                "",
                0,
                0,
                "",
                5_000,
                false,
                "",
                System.currentTimeMillis()
        );
    }

    public StationStatus withRuntime(Role nextRole, boolean reachable, String error) {
        return new StationStatus(
                nextRole,
                generation,
                leaseExpiresAt,
                activeStationId,
                pendingCount,
                unknownCount,
                serverTime,
                pollAfterMs,
                reachable,
                error == null ? "" : error,
                System.currentTimeMillis()
        );
    }

    public StationStatus withUnknownCount(int count) {
        return new StationStatus(
                role,
                generation,
                leaseExpiresAt,
                activeStationId,
                pendingCount,
                Math.max(0, count),
                serverTime,
                pollAfterMs,
                printerReachable,
                lastError,
                updatedAtMs
        );
    }
}
