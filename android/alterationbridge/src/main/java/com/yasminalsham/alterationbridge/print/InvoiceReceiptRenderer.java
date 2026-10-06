package com.yasminalsham.alterationbridge.print;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.yasminalsham.alterationbridge.model.InvoiceReceiptPayload;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public final class InvoiceReceiptRenderer {
    public static final int WIDTH_DOTS = 576;
    private static final int MAX_HEIGHT_DOTS = 5_500;
    private static final int SIDE_MARGIN = 28;
    private static final int CONTENT_WIDTH = WIDTH_DOTS - SIDE_MARGIN * 2;
    private static final TimeZone RIYADH = TimeZone.getTimeZone("Asia/Riyadh");

    private static final String COMPANY_NAME = "ياسمين الشام";
    private static final String LEGAL_NAME = "مؤسسة محمد عوض الدوسري";
    /**
     * Alostaz's phase-2 QR (~516 chars) is a dense 89x89 grid. Each module must be a
     * whole number of print dots and at least 4 dots (0.5mm on a 203dpi head);
     * at 3 dots thermal bleed closes the gaps and phones fail to read it.
     */
    private static final int QR_MIN_MODULE_DOTS = 4;
    private static final int QR_TARGET_DOTS = 360;
    /** White quiet zone the QR standard requires around the code, in modules. */
    private static final int QR_QUIET_MODULES = 4;
    /** VAT number shared by every Alostaz branch (embedded in the signed QR too). */
    private static final String SELLER_VAT_NUMBER = "310937466300003";
    private static final String COMPANY_ADDRESS =
            "الخبر الشمالية شارع الملك مشعل تقاطع 6 الخبر";

    /**
     * Women's-section invoices (fittings, alterations, measurements) printed on
     * the workshop printer. Same paper layout as the tailoring station so every
     * invoice in the shop reads the same; the tailoring order policies do not
     * apply here, so the footer is a short thank-you line.
     */
    private static final String FOOTER = "شكرًا لزيارتكم";

    public Bitmap render(InvoiceReceiptPayload payload) throws PrinterException {
        Bitmap full = Bitmap.createBitmap(
                WIDTH_DOTS,
                MAX_HEIGHT_DOTS,
                Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(full);
        canvas.drawColor(Color.WHITE);

        Cursor cursor = new Cursor(canvas);
        cursor.y = 24;
        cursor.paragraph(COMPANY_NAME, 40, true, Layout.Alignment.ALIGN_CENTER, true, 5);
        cursor.paragraph(LEGAL_NAME, 29, true, Layout.Alignment.ALIGN_CENTER, true, 4);
        cursor.paragraph(COMPANY_ADDRESS, 21, false, Layout.Alignment.ALIGN_CENTER, true, 22);

        String title = !payload.documentTitle.isEmpty()
                ? payload.documentTitle
                : "preliminary".equals(payload.receiptType)
                        ? "فاتورة مبدئية"
                        : "فاتورة ضريبية مبسطة";
        cursor.paragraph(title, 36, true, Layout.Alignment.ALIGN_CENTER, true, 3);
        // Cash papers may have no invoice number (not sent to Alostaz).
        if (!payload.invoiceCode.isEmpty()) {
            cursor.paragraph(
                    payload.invoiceCode,
                    31,
                    true,
                    Layout.Alignment.ALIGN_CENTER,
                    false,
                    7
            );
        }
        // Cash papers share the network invoice wording (owner's choice) but never get a QR.
        if (!payload.vatNumber.isEmpty()) {
            String vatNumber = payload.vatNumber.isEmpty()
                    ? SELLER_VAT_NUMBER
                    : payload.vatNumber;
            cursor.paragraph(
                    "الرقم الضريبي: " + vatNumber,
                    21,
                    true,
                    Layout.Alignment.ALIGN_CENTER,
                    true,
                    3
            );
        }
        cursor.paragraph(
                "تاريخ الفاتورة: " + formatReceiptDate(payload.deliveredAt),
                21,
                true,
                Layout.Alignment.ALIGN_CENTER,
                true,
                3
        );
        cursor.paragraph(
                "تاريخ ووقت الطباعة: " + formatPrintTimestamp(),
                21,
                true,
                Layout.Alignment.ALIGN_CENTER,
                true,
                20
        );

        boolean showOrderNumber = !payload.isNewFormat() || payload.showOrderSummary;
        cursor.paragraph(
                "العميل: " + payload.customerName,
                22,
                true,
                Layout.Alignment.ALIGN_OPPOSITE,
                true,
                showOrderNumber ? 3 : 14
        );
        if (showOrderNumber) {
            cursor.paragraph(
                    "رقم الطلب: " + payload.orderNumber,
                    22,
                    true,
                    Layout.Alignment.ALIGN_OPPOSITE,
                    true,
                    14
            );
        }

        if (payload.isNewFormat()) {
            renderPerPaymentBody(cursor, payload);
        } else {
            renderLegacyBody(cursor, payload);
        }

        cursor.y += 22;
        cursor.rule(false, 3);
        cursor.y += 10;
        cursor.paragraph(FOOTER, 24, true, Layout.Alignment.ALIGN_CENTER, true, 28);

        int finalHeight = Math.min(MAX_HEIGHT_DOTS, Math.max(1, cursor.y));
        if (cursor.overflowed || finalHeight >= MAX_HEIGHT_DOTS) {
            full.recycle();
            throw new PrinterException(
                    "receipt_too_long",
                    "الإيصال أطول من الحد الذي تدعمه الطابعة",
                    0
            );
        }

        Bitmap cropped = Bitmap.createBitmap(full, 0, 0, WIDTH_DOTS, finalHeight);
        full.recycle();
        return cropped;
    }

    /**
     * Each paper carries exactly one payment at its full value, matching its
     * Alostaz invoice (network) or a local cash receipt. The order balance is
     * shown separately so it is never confused with the invoice totals.
     */
    private void renderPerPaymentBody(Cursor cursor, InvoiceReceiptPayload payload)
            throws PrinterException {
        double amount = Double.isNaN(payload.invoiceTotal) ? payload.total : payload.invoiceTotal;
        boolean hasAccountingTotals = !Double.isNaN(payload.totalWithoutVat)
                && !Double.isNaN(payload.vatAmount);
        double beforeTax = hasAccountingTotals ? payload.totalWithoutVat : amount / 1.15d;
        double vat = hasAccountingTotals ? payload.vatAmount : amount - beforeTax;

        if (!payload.isOrderSummaryOnly()) {
            cursor.rule(false, 3);
            cursor.y += 10;
            cursor.drawTableHeader();
            cursor.rule(false, 2);
            cursor.drawItem(payload.itemDescription, amount);
            cursor.rule(false, 3);
            cursor.y += 5;

            String method = "cash".equals(payload.receivedPaymentMethod) ? "كاش" : "شبكة";
            cursor.summary("السعر (غير شامل الضريبة)", formatMoney(beforeTax), false);
            cursor.rule(true, 2);
            cursor.summary("الضريبة", formatMoney(vat), false);
            cursor.rule(true, 2);
            cursor.summary(
                    "إجمالي الفاتورة (ر.س)",
                    formatMoney(amount),
                    true
            );
            cursor.rule(true, 2);
            cursor.summary("المدفوع " + method + " (ر.س)", formatMoney(amount), true);
            cursor.rule(true, 2);
        }

        if (payload.showOrderSummary) {
            double paid = Math.max(0, payload.paidAmount);
            double remaining = Math.max(0, payload.total - paid);
            cursor.y += 14;
            cursor.paragraph("ملخص الطلب", 25, true, Layout.Alignment.ALIGN_CENTER, true, 4);
            cursor.rule(false, 2);
            cursor.summary("قيمة الطلب (ر.س)", formatMoney(payload.total), false);
            cursor.rule(true, 2);
            cursor.summary("إجمالي المدفوع للطلب (ر.س)", formatMoney(paid), false);
            cursor.rule(true, 2);
            cursor.summary("المتبقي على الطلب (ر.س)", formatMoney(remaining), false);
            cursor.rule(true, 2);
        }

        if (payload.isTaxInvoice()) {
            cursor.y += 18;
            if (!payload.zatcaQr.isEmpty()) {
                cursor.qrCode(payload.zatcaQr);
            } else {
                cursor.paragraph(
                        "رمز الفاتورة الإلكترونية لم يصل من برنامج المحاسبة بعد — "
                                + "أعيدي طباعة الفاتورة للحصول عليه.",
                        20,
                        true,
                        Layout.Alignment.ALIGN_CENTER,
                        true,
                        6
                );
            }
        }
    }

    private void renderLegacyBody(Cursor cursor, InvoiceReceiptPayload payload) {
        cursor.rule(false, 3);
        cursor.y += 10;
        cursor.drawTableHeader();
        cursor.rule(false, 2);
        cursor.drawItem(payload.itemDescription, payload.total);
        cursor.rule(false, 3);
        cursor.y += 5;

        double total = Math.max(0, payload.total);
        double beforeTax = total / 1.15d;
        double vat = total - beforeTax;
        double paid = payload.paidAmount > 0
                ? payload.paidAmount
                : payload.cashAmount + payload.networkAmount;
        double remaining = Math.max(0, total - Math.max(0, paid));

        cursor.summary("السعر (غير شامل الضريبة)", formatMoney(beforeTax), false);
        cursor.rule(true, 2);
        cursor.summary("الضريبة", formatMoney(vat), false);
        cursor.rule(true, 2);
        cursor.summary("الإجمالي (ر.س)", formatMoney(total), true);
        cursor.rule(true, 2);
        cursor.summary("إجمالي المدفوع (ر.س)", formatMoney(paid), true);
        cursor.rule(true, 2);
        cursor.summary("الباقي (ر.س)", formatMoney(remaining), true);
        cursor.rule(true, 2);
    }

    private static String formatMoney(double value) {
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.US);
        return new DecimalFormat("#,##0.00", symbols).format(Math.max(0, value));
    }

    private static String formatReceiptDate(String value) {
        Date parsed = parseIsoDate(value);
        if (parsed == null) return "";
        SimpleDateFormat output = new SimpleDateFormat("yyyy/M/d", Locale.US);
        output.setTimeZone(RIYADH);
        return output.format(parsed);
    }

    private static String formatPrintTimestamp() {
        SimpleDateFormat output = new SimpleDateFormat("yyyy/MM/dd - HH:mm", Locale.US);
        output.setTimeZone(RIYADH);
        return output.format(new Date());
    }

    private static Date parseIsoDate(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        String[] patterns = new String[]{
                "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
                "yyyy-MM-dd'T'HH:mm:ssXXX",
                "yyyy-MM-dd HH:mm:ssXXX",
                "yyyy-MM-dd"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat parser = new SimpleDateFormat(pattern, Locale.US);
                parser.setLenient(false);
                return parser.parse(value);
            } catch (ParseException ignored) {
            }
        }
        return null;
    }

    private static TextPaint textPaint(float size, boolean bold, Paint.Align align) {
        TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextSize(size);
        paint.setTextAlign(align);
        paint.setTypeface(Typeface.create(
                Typeface.SANS_SERIF,
                bold ? Typeface.BOLD : Typeface.NORMAL
        ));
        return paint;
    }

    private static final class Cursor {
        final Canvas canvas;
        int y;
        boolean overflowed;

        Cursor(Canvas canvas) {
            this.canvas = canvas;
        }

        void paragraph(
                String text,
                float size,
                boolean bold,
                Layout.Alignment alignment,
                boolean rtl,
                int bottomSpacing
        ) {
            TextPaint paint = textPaint(size, bold, Paint.Align.LEFT);
            StaticLayout layout = StaticLayout.Builder
                    .obtain(text == null ? "" : text, 0, text == null ? 0 : text.length(), paint, CONTENT_WIDTH)
                    .setAlignment(alignment)
                    .setIncludePad(false)
                    .setLineSpacing(1, 1.12f)
                    .setTextDirection(rtl ? TextDirectionHeuristics.RTL : TextDirectionHeuristics.LTR)
                    .build();
            ensure(layout.getHeight() + bottomSpacing);
            canvas.save();
            canvas.translate(SIDE_MARGIN, y);
            layout.draw(canvas);
            canvas.restore();
            y += layout.getHeight() + bottomSpacing;
        }

        void drawTableHeader() {
            int rowHeight = 48;
            ensure(rowHeight);
            Paint paint = textPaint(20, true, Paint.Align.CENTER);
            int descriptionCenter = 446;
            int priceCenter = 278;
            int quantityCenter = 174;
            int totalCenter = 70;
            float baseline = y + 31;
            canvas.drawText("البند", descriptionCenter, baseline, paint);
            canvas.drawText("السعر", priceCenter, baseline, paint);
            canvas.drawText("الكمية", quantityCenter, baseline, paint);
            canvas.drawText("المجموع", totalCenter, baseline, paint);
            y += rowHeight;
        }

        void drawItem(String description, double total) {
            int rowHeight = 76;
            ensure(rowHeight);
            TextPaint descriptionPaint = textPaint(20, false, Paint.Align.LEFT);
            StaticLayout layout = StaticLayout.Builder
                    .obtain(description, 0, description.length(), descriptionPaint, 196)
                    .setAlignment(Layout.Alignment.ALIGN_OPPOSITE)
                    .setIncludePad(false)
                    .setMaxLines(2)
                    .setTextDirection(TextDirectionHeuristics.RTL)
                    .build();
            canvas.save();
            canvas.translate(354, y + 10);
            layout.draw(canvas);
            canvas.restore();

            Paint valuePaint = textPaint(19, false, Paint.Align.CENTER);
            float baseline = y + 42;
            String amount = formatMoney(total);
            canvas.drawText(amount, 278, baseline, valuePaint);
            canvas.drawText("1", 174, baseline, valuePaint);
            canvas.drawText(amount, 70, baseline, valuePaint);
            y += rowHeight;
        }

        void summary(String label, String value, boolean bold) {
            int rowHeight = bold ? 54 : 47;
            ensure(rowHeight);
            float size = bold ? 25 : 22;
            Paint labelPaint = textPaint(size, bold, Paint.Align.RIGHT);
            Paint valuePaint = textPaint(size, bold, Paint.Align.LEFT);
            float baseline = y + (bold ? 36 : 32);
            canvas.drawText(label, WIDTH_DOTS - SIDE_MARGIN, baseline, labelPaint);
            canvas.drawText(value, SIDE_MARGIN, baseline, valuePaint);
            y += rowHeight;
        }

        void rule(boolean dashed, float width) {
            ensure(5);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.BLACK);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(width);
            if (dashed) paint.setPathEffect(new DashPathEffect(new float[]{10, 7}, 0));
            canvas.drawLine(SIDE_MARGIN, y + 2, WIDTH_DOTS - SIDE_MARGIN, y + 2, paint);
            y += 5;
        }

        /**
         * Draws the ZATCA QR exactly as Alostaz encoded it. Modules are solid,
         * integer-sized squares (no anti-aliasing) so the thermal raster stays
         * scannable; Alostaz codes print at 4 dots/module (~45mm) plus a 4-module quiet zone.
         */
        void qrCode(String text) throws PrinterException {
            BitMatrix matrix;
            try {
                Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
                hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
                hints.put(EncodeHintType.MARGIN, 0);
                hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
                matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints);
            } catch (WriterException | IllegalArgumentException error) {
                throw new PrinterException(
                        "qr_encode_failed",
                        "تعذّر رسم رمز الفاتورة الإلكترونية",
                        0,
                        error
                );
            }

            int modules = matrix.getWidth();
            // Largest whole-dot module that still fits the paper with its quiet zone.
            int maxModule = Math.max(1, CONTENT_WIDTH / (modules + QR_QUIET_MODULES * 2));
            int moduleSize = Math.min(maxModule,
                    Math.max(QR_MIN_MODULE_DOTS, QR_TARGET_DOTS / modules));
            int size = modules * moduleSize;
            int quiet = QR_QUIET_MODULES * moduleSize;
            ensure(size + quiet * 2);
            y += quiet;
            int left = (WIDTH_DOTS - size) / 2;
            Paint paint = new Paint();
            paint.setAntiAlias(false);
            paint.setColor(Color.BLACK);
            paint.setStyle(Paint.Style.FILL);
            for (int row = 0; row < modules; row++) {
                for (int col = 0; col < modules; col++) {
                    if (!matrix.get(col, row)) continue;
                    int x = left + col * moduleSize;
                    int top = y + row * moduleSize;
                    canvas.drawRect(x, top, x + moduleSize, top + moduleSize, paint);
                }
            }
            y += size + quiet;
        }

        void ensure(int additionalHeight) {
            if (y + additionalHeight >= MAX_HEIGHT_DOTS) overflowed = true;
        }
    }
}
