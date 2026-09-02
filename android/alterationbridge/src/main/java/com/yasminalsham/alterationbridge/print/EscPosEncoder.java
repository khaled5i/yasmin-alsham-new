package com.yasminalsham.alterationbridge.print;

import android.graphics.Bitmap;
import android.graphics.Color;

import java.io.ByteArrayOutputStream;
import java.util.List;

public final class EscPosEncoder {
    private static final int RASTER_BAND_HEIGHT = 256;
    private static final int BLACK_THRESHOLD = 205;

    private EscPosEncoder() {
    }

    /**
     * يرمّز أوراق المهمة كلها في دفعة بايتات واحدة، ويفصل بين كل ورقة والتي
     * تليها بتغذية وقطع كامل. الإرسال دفعة واحدة مقصود: الورقة العربية
     * والهندية تخرجان معًا أو لا تخرج أي منهما، فلا يبقى تعديل نصف مطبوع.
     */
    public static byte[] encodeSlips(List<Bitmap> slips) throws PrinterException {
        if (slips == null || slips.isEmpty()) {
            throw new PrinterException(
                    "no_slip_to_print",
                    "لا توجد ورقة صالحة للطباعة",
                    0
            );
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream(64 * 1024);
        write(output, new byte[]{0x1b, 0x40, 0x1b, 0x61, 0x00});
        for (Bitmap slip : slips) {
            writeRaster(output, slip);
            write(output, new byte[]{0x1b, 0x64, 0x04, 0x1d, 0x56, 0x00});
        }
        return output.toByteArray();
    }

    private static void writeRaster(ByteArrayOutputStream output, Bitmap bitmap)
            throws PrinterException {
        if (bitmap == null || bitmap.getWidth() != AlterationSlipRenderer.WIDTH_DOTS) {
            throw new PrinterException(
                    "invalid_slip_bitmap",
                    "عرض صورة ورقة التعديل غير صالح",
                    0
            );
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int bytesPerRow = (width + 7) / 8;
        int[] pixels = new int[width];
        for (int bandTop = 0; bandTop < height; bandTop += RASTER_BAND_HEIGHT) {
            int bandHeight = Math.min(RASTER_BAND_HEIGHT, height - bandTop);
            write(output, new byte[]{
                    0x1d, 0x76, 0x30, 0x00,
                    (byte) (bytesPerRow & 0xff),
                    (byte) ((bytesPerRow >> 8) & 0xff),
                    (byte) (bandHeight & 0xff),
                    (byte) ((bandHeight >> 8) & 0xff)
            });
            byte[] row = new byte[bytesPerRow];
            for (int relativeY = 0; relativeY < bandHeight; relativeY++) {
                bitmap.getPixels(pixels, 0, width, 0, bandTop + relativeY, width, 1);
                java.util.Arrays.fill(row, (byte) 0);
                for (int x = 0; x < width; x++) {
                    int color = pixels[x];
                    int alpha = Color.alpha(color);
                    int luminance = (
                            299 * Color.red(color)
                                    + 587 * Color.green(color)
                                    + 114 * Color.blue(color)
                    ) / 1000;
                    int composited = (luminance * alpha + 255 * (255 - alpha)) / 255;
                    if (composited < BLACK_THRESHOLD) {
                        row[x / 8] |= (byte) (0x80 >> (x % 8));
                    }
                }
                write(output, row);
            }
        }
    }

    private static void write(ByteArrayOutputStream output, byte[] bytes) {
        output.write(bytes, 0, bytes.length);
    }
}
