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

import com.yasminalsham.alterationbridge.model.AlterationSlipPayload;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * يرسم ورقة التعديل بعرض 80mm.
 *
 * كل طلب طباعة يُنتج ورقتين مستقلتين: العربية ثم الهندية. النص يُرسم على Canvas
 * ثم يُرسل كصورة نقطية، وهذا وحده ما يجعل الحروف العربية والديوَناغَري تخرج
 * صحيحة على طابعة حرارية لا تملك خطوطًا لأي منهما.
 */
public final class AlterationSlipRenderer {
    public static final int WIDTH_DOTS = 576;
    private static final int MAX_HEIGHT_DOTS = 5_500;
    private static final int SIDE_MARGIN = 28;
    private static final int CONTENT_WIDTH = WIDTH_DOTS - SIDE_MARGIN * 2;
    private static final TimeZone RIYADH = TimeZone.getTimeZone("Asia/Riyadh");

    private static final String LABEL_CLIENT_AR = "العميلة";
    private static final String LABEL_DUE_AR = "موعد التسليم";
    private static final String LABEL_PRINTED_AR = "طُبعت";

    private static final String LABEL_CLIENT_HI = "ग्राहक";
    private static final String LABEL_DUE_HI = "डिलीवरी";
    private static final String LABEL_PRINTED_HI = "प्रिंट";

    /**
     * يعيد ورقة واحدة أو ورقتين بالترتيب: العربية أولًا ثم الهندية.
     * المستدعي مسؤول عن استدعاء recycle على كل صورة بعد الترميز.
     */
    public List<Bitmap> render(AlterationSlipPayload payload) throws PrinterException {
        List<Bitmap> slips = new ArrayList<>(2);
        try {
            slips.add(renderSlip(payload, false));
            if (payload.hasHindiSlip()) slips.add(renderSlip(payload, true));
        } catch (PrinterException | RuntimeException error) {
            for (Bitmap slip : slips) slip.recycle();
            throw error;
        }
        return slips;
    }

    private Bitmap renderSlip(AlterationSlipPayload payload, boolean hindi)
            throws PrinterException {
        Bitmap full = Bitmap.createBitmap(
                WIDTH_DOTS,
                MAX_HEIGHT_DOTS,
                Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(full);
        canvas.drawColor(Color.WHITE);

        // العربية RTL والهندية LTR؛ الاتجاه يحكم المحاذاة وترتيب الحروف معًا.
        boolean rtl = !hindi;
        Layout.Alignment start = Layout.Alignment.ALIGN_OPPOSITE;

        Cursor cursor = new Cursor(canvas);
        cursor.y = 26;

        // العنوان ورقم التعديل أعلى كل ورقة، وهما ما يميّزها من مسافة.
        cursor.paragraph(
                hindi ? payload.titleHi : payload.titleAr,
                40,
                true,
                Layout.Alignment.ALIGN_CENTER,
                rtl,
                6
        );
        if (!payload.alterationNumber.isEmpty()) {
            cursor.paragraph(
                    payload.alterationNumber,
                    32,
                    true,
                    Layout.Alignment.ALIGN_CENTER,
                    false,
                    14
            );
        }

        cursor.rule(false, 3);
        cursor.y += 12;

        if (!payload.clientName.isEmpty()) {
            cursor.paragraph(
                    (hindi ? LABEL_CLIENT_HI : LABEL_CLIENT_AR) + ": " + payload.clientName,
                    25,
                    true,
                    start,
                    rtl,
                    6
            );
        }
        if (!payload.dueDate.isEmpty()) {
            cursor.paragraph(
                    (hindi ? LABEL_DUE_HI : LABEL_DUE_AR) + ": " + payload.dueDate,
                    25,
                    true,
                    start,
                    rtl,
                    6
            );
        }

        cursor.y += 6;
        cursor.rule(true, 2);
        cursor.y += 16;

        // المحتوى بحجم أكبر من المعتاد: تُقرأ الورقة على طاولة الخياطة.
        cursor.paragraph(
                hindi ? payload.contentHi : payload.contentAr,
                30,
                false,
                start,
                rtl,
                22
        );

        cursor.rule(false, 3);
        cursor.y += 8;
        cursor.paragraph(
                (hindi ? LABEL_PRINTED_HI : LABEL_PRINTED_AR) + ": " + formatPrintTimestamp(),
                19,
                false,
                Layout.Alignment.ALIGN_CENTER,
                rtl,
                30
        );

        int finalHeight = Math.min(MAX_HEIGHT_DOTS, Math.max(1, cursor.y));
        if (cursor.overflowed || finalHeight >= MAX_HEIGHT_DOTS) {
            full.recycle();
            throw new PrinterException(
                    "slip_too_long",
                    "محتوى التعديل أطول من الحد الذي تدعمه الطابعة",
                    0
            );
        }

        Bitmap cropped = Bitmap.createBitmap(full, 0, 0, WIDTH_DOTS, finalHeight);
        full.recycle();
        return cropped;
    }

    private static String formatPrintTimestamp() {
        SimpleDateFormat output = new SimpleDateFormat("yyyy/MM/dd - HH:mm", Locale.US);
        output.setTimeZone(RIYADH);
        return output.format(new Date());
    }

    private static TextPaint textPaint(float size, boolean bold) {
        TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextSize(size);
        paint.setTextAlign(Paint.Align.LEFT);
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
            String value = text == null ? "" : text;
            if (value.isEmpty()) return;

            TextPaint paint = textPaint(size, bold);
            StaticLayout layout = StaticLayout.Builder
                    .obtain(value, 0, value.length(), paint, CONTENT_WIDTH)
                    .setAlignment(alignment)
                    .setIncludePad(false)
                    .setLineSpacing(1, 1.18f)
                    .setTextDirection(rtl ? TextDirectionHeuristics.RTL : TextDirectionHeuristics.LTR)
                    .build();
            ensure(layout.getHeight() + bottomSpacing);
            canvas.save();
            canvas.translate(SIDE_MARGIN, y);
            layout.draw(canvas);
            canvas.restore();
            y += layout.getHeight() + bottomSpacing;
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
