package com.yasminalsham.alterationbridge.model;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * نصوص ورقة التعديل كما أرسلها الموقع. المحطة لا تعرف أنواع التعديلات ولا
 * تترجم شيئًا؛ العناوين والمحتوى تصل جاهزة، فتُطبع كما هي.
 * غياب النص الهندي يعني ألا تُطبع الورقة الثانية.
 */
public final class AlterationSlipPayload {
    public final String alterationNumber;
    public final String titleAr;
    public final String titleHi;
    public final String clientName;
    public final String dueDate;
    public final String contentAr;
    public final String contentHi;

    private AlterationSlipPayload(
            String alterationNumber,
            String titleAr,
            String titleHi,
            String clientName,
            String dueDate,
            String contentAr,
            String contentHi
    ) {
        this.alterationNumber = alterationNumber;
        this.titleAr = titleAr;
        this.titleHi = titleHi;
        this.clientName = clientName;
        this.dueDate = dueDate;
        this.contentAr = contentAr;
        this.contentHi = contentHi;
    }

    public static AlterationSlipPayload fromJson(JSONObject json) throws JSONException {
        if (json == null) throw new JSONException("Missing slip payload");

        String titleAr = clean(json.optString("title_ar", ""), 120);
        String contentAr = clean(json.optString("content_ar", ""), 4000);
        if (titleAr.isEmpty()) throw new JSONException("Missing title_ar");
        if (contentAr.isEmpty()) throw new JSONException("Missing content_ar");

        return new AlterationSlipPayload(
                clean(json.optString("alteration_number", ""), 80),
                titleAr,
                clean(json.optString("title_hi", ""), 120),
                clean(json.optString("client_name", ""), 180),
                clean(json.optString("due_date", ""), 40),
                contentAr,
                clean(json.optString("content_hi", ""), 4000)
        );
    }

    /** الورقة الهندية اختيارية؛ تُطبع فقط عندما يصل عنوانها ومحتواها معًا. */
    public boolean hasHindiSlip() {
        return !titleHi.isEmpty() && !contentHi.isEmpty();
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
