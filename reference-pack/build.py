#!/usr/bin/env python3
"""Build the Yasmin Al-Sham couture reference pack PDF from references.json.

Usage:  python3 build.py
Output: yasmin-alsham-reference-pack.pdf (next to this file)

To add a reference: put images/refs/REF-XX.jpg (+ optional images/results/REF-XX.jpg),
append an entry to references.json, then run this script again.
"""
import html
import json
import os
import subprocess
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

MASTER_TEMPLATE = (
    "Haute couture product photograph, vertical 9:16. Image 1 shows our FABRIC: [FABRIC_DESCRIPTION]. "
    "Image 2 (if attached) is the DESIGN REFERENCE: copy the gown construction from it but ignore the person entirely.\n\n"
    "Recreate the gown on a headless ivory couture dress form mannequin ([ARMS], no head, no face, slim gold stand): "
    "[DESIGN] Match OUR fabric's motifs, colors and density exactly wherever it is used.\n\n"
    "Setting: [SETTING]. Photorealistic, couture-level craftsmanship, sequins and beads catching the light. "
    "Absolutely no people, no model, no face, no skin, no hands, no text, no logo, no watermark."
)

MODEL_INSTRUCTIONS = [
    "Read this ENTIRE file before generating any image. Never generate a dress design without first selecting references from the catalog below.",
    "Ask the user for a photo of the fabric if none is attached. Do not generate without it.",
    "Write [FABRIC_DESCRIPTION] in one sentence: base tulle/lace color, embroidery technique (sequins, beads, 3D petals, corded lace, print), motif shapes and every motif color.",
    "Select exactly 3 references (unless the user asks for another number) whose 'Best for' matches the fabric. The 3 MUST be different silhouettes (e.g. one column/mermaid, one ball gown/A-line, one with cape, overskirt or kaftan) and at least one MUST have modesty 'medium' or 'high'.",
    "For each reference pick [ACCENT_COLOR] from the fabric's own palette (darkest tone for satin, palest tone for chiffon/tulle).",
    "Build each prompt from the MASTER TEMPLATE, word for word. Replace [DESIGN] and [SETTING] with the reference's prompt block, [ARMS] with 'no arms' or 'with full-length display arms' as listed. Do not shorten or 'improve' the template.",
    "Generate each design as a separate image, vertical 9:16. If the user attached the reference image, keep 'Image 2 is the DESIGN REFERENCE'; otherwise remove that sentence.",
    "Check every result: no person or face, headless mannequin, fabric matches the photo. If not, regenerate once with the problem named explicitly in the prompt.",
    "Reply to the user in Arabic: for each image give the reference ID, the Arabic design name and 'inspired by <designer> <season>'. Never write designer names or logos inside the image.",
]


def esc(s):
    return html.escape(str(s))


def img_uri(rel):
    p = os.path.join(HERE, rel)
    return "file://" + p if os.path.exists(p) else ""


def ref_page(r):
    arms = "with full-length display arms" if r.get("arms") else "no arms"
    block = f"[DESIGN] = {r['design']}\n\n[SETTING] = {r['setting']}\n\n[ARMS] = {arms}\n\n[ACCENT_COLOR] = {r['accent']}"
    ref_img = img_uri(f"images/refs/{r['id']}.jpg")
    res_img = img_uri(f"images/results/{r['id']}.jpg")
    res_html = (
        f'<figure><img src="{res_img}"><figcaption>مثال نتيجة · Example result</figcaption></figure>' if res_img else ""
    )
    return f"""
<section class="page ref">
  <header class="ref-head">
    <span class="rid">{esc(r['id'])}</span>
    <h2>{esc(r['name_ar'])}</h2>
    <span class="src">Inspired by {esc(r['designer'])} · {esc(r['season'])} · Look {esc(r['look'])}</span>
  </header>
  <div class="figs">
    <figure><img src="{ref_img}"><figcaption>المرجع (للاستخدام الداخلي) · Reference</figcaption></figure>
    {res_html}
  </div>
  <table class="meta">
    <tr><th>Silhouette</th><td>{esc(r['silhouette'])}</td><th>Neckline</th><td>{esc(r['neckline'])}</td></tr>
    <tr><th>Sleeves</th><td>{esc(r['sleeves'])}</td><th>Modesty</th><td>{esc(r['modesty'])}</td></tr>
    <tr><th>Best for</th><td colspan="3">{esc(r['best_for'])}</td></tr>
    <tr><th>Source</th><td colspan="3" class="ltr">{esc(r['source'])}</td></tr>
  </table>
  <div class="label">PROMPT BLOCK — {esc(r['id'])}</div>
  <pre>{esc(block)}</pre>
</section>"""


def build():
    refs = json.load(open(os.path.join(HERE, "references.json"), encoding="utf-8"))
    ids = [r["id"] for r in refs]
    if len(ids) != len(set(ids)):
        sys.exit("Duplicate reference IDs in references.json")

    index_rows = "".join(
        f"<tr><td class='ltr'>{esc(r['id'])}</td><td>{esc(r['name_ar'])}</td><td class='ltr'>{esc(r['silhouette'])}</td>"
        f"<td class='ltr'>{esc(r['modesty'])}</td><td class='ltr'>{esc(r['best_for'])}</td></tr>"
        for r in refs
    )
    steps = "".join(f"<li>{esc(s)}</li>" for s in MODEL_INSTRUCTIONS)

    doc = f"""<!doctype html><html lang="ar"><head><meta charset="utf-8"><style>
@font-face {{ font-family: Tajawal; font-weight: 500; src: url("file://{HERE}/fonts/tajawal-arabic-500-normal.woff2"); unicode-range: U+0600-06FF, U+FB50-FDFF, U+FE70-FEFF; }}
@font-face {{ font-family: Tajawal; font-weight: 800; src: url("file://{HERE}/fonts/tajawal-arabic-800-normal.woff2"); unicode-range: U+0600-06FF, U+FB50-FDFF, U+FE70-FEFF; }}
@page {{ size: A4; margin: 14mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Tajawal, "Helvetica Neue", Arial, sans-serif; color: #24161f; font-size: 10.5pt; margin: 0; }}
.page {{ page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}
.rtl {{ direction: rtl; text-align: right; }}
.ltr {{ direction: ltr; text-align: left; }}
h1 {{ font-size: 30pt; margin: 0 0 6mm; color: #5a1f3c; }}
h2 {{ font-size: 17pt; margin: 0; color: #5a1f3c; }}
h3 {{ font-size: 13pt; color: #5a1f3c; margin: 6mm 0 2mm; }}
.cover {{ display: flex; flex-direction: column; justify-content: center; height: 260mm; text-align: center; }}
.cover .en {{ font-size: 15pt; letter-spacing: .08em; color: #8a6a3a; }}
.cover p {{ font-size: 12pt; line-height: 1.7; }}
.box {{ border: 1.5px solid #c9a35f; border-radius: 4mm; padding: 4mm 6mm; background: #fbf7f0; }}
ol li {{ margin-bottom: 2.2mm; line-height: 1.45; }}
pre {{ white-space: pre-wrap; direction: ltr; text-align: left; font-family: "DejaVu Sans Mono", monospace; font-size: 8.6pt;
       background: #f6f1f4; border: 1px solid #dccbd5; border-radius: 3mm; padding: 3.5mm; line-height: 1.45; margin: 0; }}
.label {{ font-weight: 800; font-size: 9pt; letter-spacing: .06em; color: #8a6a3a; margin: 4mm 0 1.5mm; direction: ltr; }}
table {{ border-collapse: collapse; width: 100%; font-size: 9pt; }}
th, td {{ border: 1px solid #e3d5dc; padding: 1.6mm 2mm; vertical-align: top; }}
th {{ background: #f3e9ee; text-align: left; white-space: nowrap; }}
.index td, .index th {{ font-size: 8.6pt; }}
.ref-head {{ display: flex; align-items: baseline; gap: 4mm; flex-wrap: wrap; border-bottom: 2px solid #c9a35f; padding-bottom: 2mm; margin-bottom: 3mm; }}
.rid {{ font-weight: 800; color: #fff; background: #5a1f3c; padding: 1mm 3mm; border-radius: 2mm; direction: ltr; }}
.src {{ direction: ltr; color: #6b5a63; font-size: 9pt; width: 100%; }}
.figs {{ display: flex; gap: 5mm; justify-content: center; margin-bottom: 3mm; }}
.figs figure {{ margin: 0; text-align: center; }}
.figs img {{ height: 105mm; border-radius: 2mm; border: 1px solid #ddd; }}
figcaption {{ font-size: 8.5pt; color: #6b5a63; margin-top: 1mm; }}
.meta {{ direction: ltr; }}
</style></head><body>

<section class="page cover rtl">
  <div class="en ltr" style="text-align:center">YASMIN AL-SHAM · COUTURE REFERENCE PACK</div>
  <h1 style="text-align:center">ملف مراجع تصاميم الفساتين</h1>
  <p style="text-align:center">{len(refs)} إطلالة مرجعية من عروض الأزياء الراقية، لكل منها صورة وبرومبت جاهز ومثال نتيجة.<br>
  للاستخدام مع نموذج توليد الصور GPT Image 2.5 داخل ChatGPT.<br>
  الإصدار: {date.today().isoformat()}</p>
  <p class="box" style="text-align:center;font-size:9.5pt">صور المراجع مأخوذة من عروض أزياء منشورة ومحمية بحقوق النشر،
  وهي هنا للاستخدام الداخلي كمرجع إلهام فقط. لا تُنشر ولا يُذكر اسم المصمم داخل الصور المولّدة.</p>
</section>

<section class="page">
  <h2 class="ltr">MANDATORY INSTRUCTIONS FOR THE MODEL</h2>
  <div class="box ltr" style="margin-top:3mm"><ol>{steps}</ol></div>
  <h3 class="ltr">MASTER TEMPLATE (use word for word)</h3>
  <pre>{esc(MASTER_TEMPLATE)}</pre>
  <h3 class="rtl">ملخص للمستخدم</h3>
  <div class="rtl" style="line-height:1.7">ارفقي صورة القماش في المحادثة، واطلبي مثلاً: «صمّمي ٣ فساتين من هذا القماش».
  سيختار النموذج ٣ مراجع متنوعة من هذا الملف، ويكتب البرومبت بالقالب أعلاه، ويولّد كل تصميم في صورة مستقلة.
  لدقة أعلى في القصّة: ارفقي أيضاً صورة المرجع المختار من هذا الملف.</div>
</section>

<section class="page">
  <h2 class="ltr">CATALOG INDEX</h2>
  <table class="index" style="margin-top:3mm"><tr><th>ID</th><th>التصميم</th><th>Silhouette</th><th>Modesty</th><th>Best for</th></tr>{index_rows}</table>
</section>

{''.join(ref_page(r) for r in refs)}

<section class="page rtl">
  <h2>طريقة إضافة مرجع جديد</h2>
  <ol style="line-height:1.8">
    <li>احفظي صورة الإطلالة باسم <span class="ltr">images/refs/REF-16.jpg</span> (الرقم التالي في التسلسل).</li>
    <li>(اختياري) احفظي صورة نتيجة ناجحة باسم <span class="ltr">images/results/REF-16.jpg</span>.</li>
    <li>أضيفي عنصراً جديداً في <span class="ltr">references.json</span> بنفس حقول المراجع الموجودة: الاسم، المصمم، الموسم، القصّة، الاحتشام، الأقمشة المناسبة، اللون المساعد، ونص التصميم والخلفية.</li>
    <li>شغّلي <span class="ltr">python3 build.py</span> لإعادة إنشاء ملف PDF، ثم ارفعي النسخة الجديدة إلى ChatGPT مكان القديمة.</li>
  </ol>
  <p>نصيحة: اكتبي نص التصميم بالإنجليزية بنفس أسلوب المراجع الحالية، واستخدمي <span class="ltr">OUR fabric</span> و<span class="ltr">[ACCENT_COLOR]</span> كما هي.</p>
</section>
</body></html>"""

    html_path = os.path.join(HERE, "reference-pack.html")
    pdf_path = os.path.join(HERE, "yasmin-alsham-reference-pack.pdf")
    open(html_path, "w", encoding="utf-8").write(doc)
    subprocess.run(
        [CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
         "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", "file://" + html_path],
        check=True, capture_output=True,
    )
    os.remove(html_path)
    print(f"Built {pdf_path} with {len(refs)} references")


if __name__ == "__main__":
    build()
