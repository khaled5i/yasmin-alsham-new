package com.yasminalsham.printbridge.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class TailoringReceiptPayload {
    public final String orderId;
    public final String orderNumber;
    public final String invoiceCode;
    public final String invoiceCodeSource;
    public final String receiptType;
    public final String customerName;
    public final String itemDescription;
    public final double total;
    public final double paidAmount;
    public final double cashAmount;
    public final double networkAmount;
    public final String deliveredAt;

    private TailoringReceiptPayload(
            String orderId,
            String orderNumber,
            String invoiceCode,
            String invoiceCodeSource,
            String receiptType,
            String customerName,
            String itemDescription,
            double total,
            double paidAmount,
            double cashAmount,
            double networkAmount,
            String deliveredAt
    ) {
        this.orderId = orderId;
        this.orderNumber = orderNumber;
        this.invoiceCode = invoiceCode;
        this.invoiceCodeSource = invoiceCodeSource;
        this.receiptType = receiptType;
        this.customerName = customerName;
        this.itemDescription = itemDescription;
        this.total = total;
        this.paidAmount = paidAmount;
        this.cashAmount = cashAmount;
        this.networkAmount = networkAmount;
        this.deliveredAt = deliveredAt;
    }

    public static TailoringReceiptPayload fromJson(JSONObject json) throws JSONException {
        if (json == null) throw new JSONException("Missing receipt payload");

        String orderNumber = clean(json.optString("order_number", ""), 80);
        String invoiceCode = clean(json.optString("invoice_code", ""), 120);
        if (orderNumber.isEmpty()) throw new JSONException("Missing order_number");
        if (invoiceCode.isEmpty()) throw new JSONException("Missing invoice_code");

        return new TailoringReceiptPayload(
                clean(json.optString("order_id", ""), 80),
                orderNumber,
                invoiceCode,
                clean(json.optString("invoice_code_source", "local"), 20),
                clean(json.optString("receipt_type", "delivery"), 20),
                defaultText(clean(json.optString("customer_name", ""), 180), "عميل"),
                defaultText(clean(json.optString("item_description", ""), 240), "أجرة تفصيل فستان"),
                finiteNonNegative(json.optDouble("total", 0)),
                finiteNonNegative(json.optDouble("paid_amount", 0)),
                finiteNonNegative(json.optDouble("cash_amount", 0)),
                finiteNonNegative(json.optDouble("network_amount", 0)),
                clean(json.optString("delivered_at", ""), 80)
        );
    }

    private static double finiteNonNegative(double value) {
        return Double.isFinite(value) ? Math.max(0, value) : 0;
    }

    private static String defaultText(String value, String fallback) {
        return value.isEmpty() ? fallback : value;
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "";
        String cleaned = value
                .replace('\u0000', ' ')
                .replaceAll("[\\p{Cc}&&[^\\r\\n\\t]]", "")
                .trim();
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength);
    }
}
