package com.yasminalsham.printbridge.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class TailoringReceiptPayload {
    public static final String KIND_TAX_INVOICE = "tax_invoice";
    public static final String KIND_CASH_RECEIPT = "cash_receipt";
    public static final String KIND_ORDER_SUMMARY = "order_summary";

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

    /**
     * Paper kind decided by the website. Empty means the legacy layout
     * (jobs queued before invoices were split per payment).
     */
    public final String documentKind;
    public final String documentTitle;
    /** Amount of this paper alone; NaN when the job predates per-payment papers. */
    public final double invoiceTotal;
    /** Alostaz totals for a tax invoice; NaN when absent. */
    public final double totalWithoutVat;
    public final double vatAmount;
    public final String vatNumber;
    /** Signed ZATCA QR text exactly as Alostaz issued it; never generated locally. */
    public final String zatcaQr;
    public final String receivedPaymentMethod;
    public final boolean showOrderSummary;

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
            String deliveredAt,
            String documentKind,
            String documentTitle,
            double invoiceTotal,
            double totalWithoutVat,
            double vatAmount,
            String vatNumber,
            String zatcaQr,
            String receivedPaymentMethod,
            boolean showOrderSummary
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
        this.documentKind = documentKind;
        this.documentTitle = documentTitle;
        this.invoiceTotal = invoiceTotal;
        this.totalWithoutVat = totalWithoutVat;
        this.vatAmount = vatAmount;
        this.vatNumber = vatNumber;
        this.zatcaQr = zatcaQr;
        this.receivedPaymentMethod = receivedPaymentMethod;
        this.showOrderSummary = showOrderSummary;
    }

    public boolean isNewFormat() {
        return !documentKind.isEmpty();
    }

    public boolean isTaxInvoice() {
        return KIND_TAX_INVOICE.equals(documentKind);
    }

    public boolean isOrderSummaryOnly() {
        return KIND_ORDER_SUMMARY.equals(documentKind);
    }

    public static TailoringReceiptPayload fromJson(JSONObject json) throws JSONException {
        if (json == null) throw new JSONException("Missing receipt payload");

        String orderNumber = clean(json.optString("order_number", ""), 80);
        String invoiceCode = clean(json.optString("invoice_code", ""), 120);
        if (orderNumber.isEmpty()) throw new JSONException("Missing order_number");

        String documentKind = clean(json.optString("document_kind", ""), 30);
        if (!documentKind.isEmpty()
                && !KIND_TAX_INVOICE.equals(documentKind)
                && !KIND_CASH_RECEIPT.equals(documentKind)
                && !KIND_ORDER_SUMMARY.equals(documentKind)) {
            throw new JSONException("Unsupported document_kind: " + documentKind);
        }
        // A cash paper is never sent to Alostaz, so it may legitimately carry no
        // invoice number; every other paper must have one.
        if (invoiceCode.isEmpty() && !KIND_CASH_RECEIPT.equals(documentKind)) {
            throw new JSONException("Missing invoice_code");
        }

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
                clean(json.optString("delivered_at", ""), 80),
                documentKind,
                clean(json.optString("document_title", ""), 60),
                optionalAmount(json, "invoice_total"),
                optionalAmount(json, "total_without_vat"),
                optionalAmount(json, "vat_amount"),
                clean(json.optString("vat_number", ""), 20),
                json.isNull("zatca_qr") ? "" : clean(json.optString("zatca_qr", ""), 2000),
                clean(json.optString("received_payment_method", ""), 10),
                json.optBoolean("show_order_summary", true)
        );
    }

    private static double optionalAmount(JSONObject json, String key) {
        if (!json.has(key) || json.isNull(key)) return Double.NaN;
        double value = json.optDouble(key, Double.NaN);
        return Double.isFinite(value) ? Math.max(0, value) : Double.NaN;
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
