package com.yasminalsham.printbridge.print;

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

import com.yasminalsham.printbridge.model.TailoringReceiptPayload;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class TailoringReceiptRenderer {
    public static final int WIDTH_DOTS = 576;
    private static final int MAX_HEIGHT_DOTS = 5_500;
    private static final int SIDE_MARGIN = 28;
    private static final int CONTENT_WIDTH = WIDTH_DOTS - SIDE_MARGIN * 2;
    private static final TimeZone RIYADH = TimeZone.getTimeZone("Asia/Riyadh");

    private static final String COMPANY_NAME = "ياسمين الشام";
    private static final String LEGAL_NAME = "مؤسسة محمد عوض الدوسري";
    private static final String COMPANY_ADDRESS =
            "الخبر الشمالية شارع الملك مشعل تقاطع 6 الخبر";

    private static final String POLICY_ONE =
            "الطلبات المفصّلة حسب المقاس لا تُسترجع ولا تُستبدل بعد بدء التنفيذ، "
                    + "إلا عند وجود عيب أو مخالفة للمواصفات المتفق عليها.";
    private static final String POLICY_TWO =
            "أي تعديل بعد اعتماد التصميم قد يترتب عليه رسوم إضافية وتأخير في التسليم.";
    private static final String POLICY_THREE =
            "المتجر غير مسؤول عن الفستان في حالة التأخر عن استلام الطلب خلال مدة "
                    + "أقصاها 14 يومًا.";

    public Bitmap render(TailoringReceiptPayload payload) throws PrinterException {
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

        String title = "preliminary".equals(payload.receiptType)
                ? "فاتورة مبدئية"
                : "فاتورة ضريبية مبسطة";
        cursor.paragraph(title, 36, true, Layout.Alignment.ALIGN_CENTER, true, 3);
        cursor.paragraph(
                payload.invoiceCode,
                31,
                true,
                Layout.Alignment.ALIGN_CENTER,
                false,
                7
        );
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

        cursor.paragraph(
                "العميل: " + payload.customerName,
                22,
                true,
                Layout.Alignment.ALIGN_OPPOSITE,
                true,
                3
        );
        cursor.paragraph(
                "رقم الطلب: " + payload.orderNumber,
                22,
                true,
                Layout.Alignment.ALIGN_OPPOSITE,
                true,
                14
        );

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

        cursor.y += 22;
        cursor.rule(false, 3);
        cursor.y += 10;
        cursor.paragraph("سياسات المتجر", 27, true, Layout.Alignment.ALIGN_CENTER, true, 10);
        cursor.paragraph(POLICY_ONE, 20, true, Layout.Alignment.ALIGN_OPPOSITE, true, 11);
        cursor.paragraph(POLICY_TWO, 20, true, Layout.Alignment.ALIGN_OPPOSITE, true, 11);
        cursor.paragraph(POLICY_THREE, 20, true, Layout.Alignment.ALIGN_OPPOSITE, true, 28);

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

        void ensure(int additionalHeight) {
            if (y + additionalHeight >= MAX_HEIGHT_DOTS) overflowed = true;
        }
    }
}
