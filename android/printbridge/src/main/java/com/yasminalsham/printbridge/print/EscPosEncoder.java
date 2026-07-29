package com.yasminalsham.printbridge.print;

import android.graphics.Bitmap;
import android.graphics.Color;

import java.io.ByteArrayOutputStream;

public final class EscPosEncoder {
    private static final int RASTER_BAND_HEIGHT = 256;
    private static final int BLACK_THRESHOLD = 205;

    private EscPosEncoder() {
    }

    public static byte[] encodeReceipt(Bitmap bitmap, boolean openCashDrawer)
            throws PrinterException {
        if (bitmap == null || bitmap.getWidth() != TailoringReceiptRenderer.WIDTH_DOTS) {
            throw new PrinterException(
                    "invalid_receipt_bitmap",
                    "عرض صورة الإيصال غير صالح",
                    0
            );
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int bytesPerRow = (width + 7) / 8;
        ByteArrayOutputStream output = new ByteArrayOutputStream(
                bytesPerRow * height + height / RASTER_BAND_HEIGHT * 8 + 32
        );
        write(output, new byte[]{0x1b, 0x40, 0x1b, 0x61, 0x00});
        if (openCashDrawer) write(output, drawerPulseWithoutInitialize());

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
        write(output, new byte[]{0x1b, 0x64, 0x04, 0x1d, 0x56, 0x00});
        return output.toByteArray();
    }

    public static byte[] drawerPulse() {
        ByteArrayOutputStream output = new ByteArrayOutputStream(10);
        write(output, new byte[]{0x1b, 0x40});
        write(output, drawerPulseWithoutInitialize());
        return output.toByteArray();
    }

    private static byte[] drawerPulseWithoutInitialize() {
        return new byte[]{0x1b, 0x70, 0x00, 0x19, (byte) 0xfa};
    }

    private static void write(ByteArrayOutputStream output, byte[] bytes) {
        output.write(bytes, 0, bytes.length);
    }
}
