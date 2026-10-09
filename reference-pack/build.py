#!/usr/bin/env python3
"""Build the couture reference pack PDF (model-facing) from references.json.

Usage:  python3 build.py
Output: yasmin-alsham-reference-pack.pdf (next to this file)

To add a reference: save images/refs/REF-XXX.jpg (+ optional images/results/REF-XXX.jpg for a
tested result), append an entry to references.json with the same fields, then run this script.
"""
import html
import json
import os
import subprocess
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
FIELDS = ["id", "tier", "name", "designer", "season", "look", "source", "silhouette", "neckline", "sleeves",
          "modesty", "best_for", "accent", "arms", "fabric_usage", "design", "setting"]

MASTER_TEMPLATE = (
    "Haute couture product photograph, vertical 9:16. Image 1 shows our FABRIC: [FABRIC_DESCRIPTION]. "
    "Image 2 (if attached) is the DESIGN REFERENCE: copy the gown construction from it but ignore the person entirely.\n\n"
    "Recreate the gown on a headless ivory couture dress form mannequin ([ARMS], no head, no face, slim gold stand): "
    "[DESIGN] Match OUR fabric's motifs, colors and density exactly wherever it is used.\n\n"
    "Setting: [SETTING]. Photorealistic, couture-level craftsmanship, sequins and beads catching the light. "
    "Absolutely no people, no model, no face, no skin, no hands, no text, no logo, no watermark."
)

RULES = [
    "This file is your design knowledge base. Read the RULES, the MASTER TEMPLATE and the INDEX before generating any dress image. Never invent a dress design that is not built from a reference in this file.",
    "Require a photo of the fabric in the conversation. If none is attached, ask for it and stop.",
    "Write [FABRIC_DESCRIPTION] in one sentence: base tulle/lace color, technique (sequins, beads, 3D petals, feathers, corded lace, print), motif shapes and every motif color.",
    "Select references from the INDEX (default 3 unless the user asks for another number). Rules: (a) every selected reference must have a different silhouette family (column, mermaid, ball gown/A-line, cape/overskirt/kaftan, two-piece/jacket); (b) at least one must have modesty 'medium' or 'high'; (c) prefer tier 'tested' when it fits, but use 'catalog' entries for variety; (d) do not pick two references from the same show unless the user asks; (e) for rich, heavy or costly embroidery prefer fabric_usage 'partial + accent'; for light or all-over fabrics both usages work.",
    "Choose [ACCENT_COLOR] for each reference from the fabric's own palette: the darkest tone for satin/velvet, the palest tone for chiffon/tulle/organza, the base tone for crepe.",
    "Open the reference's page (search for its ID, e.g. REF-042) and copy its PROMPT BLOCK values into the MASTER TEMPLATE word for word: [DESIGN], [SETTING], [ARMS] ('no arms' or 'with full-length display arms'). Do not shorten, paraphrase or 'improve' the template or the design text.",
    "Generate each design as a separate image, vertical 9:16. Keep the sentence about Image 2 only if the user attached the reference photo; otherwise delete it.",
    "Check every result: no person, face or skin; headless mannequin; fabric matches the photo; silhouette matches the reference. If any check fails, regenerate once naming the problem explicitly.",
    "Answer the user in Arabic. For each image give: the reference ID, a short Arabic name of the design, and 'مستوحى من <designer> <season>'. Never put designer names, logos or any text inside the image.",
]


def esc(s):
    return html.escape(str(s))


def uri(rel):
    p = os.path.join(HERE, rel)
    return "file://" + p if os.path.exists(p) else ""


def block(r):
    arms = "with full-length display arms" if r.get("arms") else "no arms"
    return (f"[DESIGN] = {r['design']}\n[SETTING] = {r['setting']}\n[ARMS] = {arms}\n"
            f"[ACCENT_COLOR] = {r['accent']}")


def meta_line(r):
    return (f"{esc(r['id'])} | tier: {esc(r['tier'])} | {esc(r['designer'])}, {esc(r['season'])}, look {esc(r['look'])} | "
            f"silhouette: {esc(r['silhouette'])} | neckline: {esc(r['neckline'])} | sleeves: {esc(r['sleeves'])} | "
            f"modesty: {esc(r['modesty'])} | fabric_usage: {esc(r['fabric_usage'])} | best_for: {esc(r['best_for'])}")


def tested_page(r):
    res = uri(f"images/results/{r['id']}.jpg")
    res_html = f'<figure><img src="{res}"><figcaption>{esc(r["id"])} verified result</figcaption></figure>' if res else ""
    return f"""<section class="page">
  <h2>{esc(r['id'])} — {esc(r['name'])} <span class="tag">TESTED</span></h2>
  <div class="figs"><figure><img src="{uri(f"images/refs/{r['id']}.jpg")}"><figcaption>{esc(r['id'])} reference look</figcaption></figure>{res_html}</div>
  <p class="meta">{meta_line(r)}<br>source: {esc(r['source'])}</p>
  <div class="label">PROMPT BLOCK {esc(r['id'])}</div><pre>{esc(block(r))}</pre>
</section>"""


def catalog_card(r):
    return f"""<div class="card">
  <img src="{uri(f"images/refs/{r['id']}.jpg")}">
  <div class="cbody">
    <div class="ctitle">{esc(r['id'])} — {esc(r['name'])}</div>
    <p class="meta">{meta_line(r)}</p>
    <div class="label">PROMPT BLOCK {esc(r['id'])}</div><pre>{esc(block(r))}</pre>
  </div>
</div>"""


def build():
    refs = json.load(open(os.path.join(HERE, "references.json"), encoding="utf-8"))
    ids = [r["id"] for r in refs]
    if len(ids) != len(set(ids)):
        sys.exit("Duplicate reference IDs in references.json")
    for r in refs:
        missing = [f for f in FIELDS if f not in r]
        if missing:
            sys.exit(f"{r.get('id')} is missing fields: {missing}")
        if not os.path.exists(os.path.join(HERE, f"images/refs/{r['id']}.jpg")):
            sys.exit(f"Missing image images/refs/{r['id']}.jpg")

    tested = [r for r in refs if r["tier"] == "tested"]
    catalog = [r for r in refs if r["tier"] != "tested"]
    rules = "".join(f"<li>{esc(s)}</li>" for s in RULES)
    index_rows = "".join(
        f"<tr><td>{esc(r['id'])}</td><td>{esc(r['tier'])}</td><td>{esc(r['silhouette'])}</td><td>{esc(r['neckline'])}</td>"
        f"<td>{esc(r['sleeves'])}</td><td>{esc(r['modesty'])}</td><td>{esc(r['fabric_usage'])}</td>"
        f"<td>{esc(r['designer'])} {esc(r['season'].replace('Couture ', ''))}</td></tr>"
        for r in refs
    )
    cards = "".join(
        f'<section class="page grid">{"".join(catalog_card(r) for r in catalog[i:i + 3])}</section>'
        for i in range(0, len(catalog), 3)
    )

    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face {{ font-family: Tajawal; font-weight: 500; src: url("file://{HERE}/fonts/tajawal-arabic-500-normal.woff2"); unicode-range: U+0600-06FF, U+FB50-FDFF, U+FE70-FEFF; }}
@page {{ size: A4; margin: 11mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Tajawal, "DejaVu Sans", Arial, sans-serif; color: #111; font-size: 9pt; margin: 0; }}
.page {{ page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}
h1 {{ font-size: 15pt; margin: 0 0 2mm; }}
h2 {{ font-size: 12pt; margin: 0 0 2mm; }}
h3 {{ font-size: 10.5pt; margin: 4mm 0 1.5mm; }}
ol li {{ margin-bottom: 1.6mm; line-height: 1.4; }}
pre {{ white-space: pre-wrap; font-family: "DejaVu Sans Mono", monospace; font-size: 7.6pt; background: #f4f4f4;
       border: 1px solid #ccc; padding: 2mm; margin: 0; line-height: 1.35; }}
.label {{ font-weight: bold; font-size: 7.5pt; margin: 1.5mm 0 .8mm; }}
.meta {{ font-size: 7.6pt; line-height: 1.35; margin: 1mm 0; color: #333; }}
.tag {{ font-size: 8pt; background: #111; color: #fff; padding: .5mm 2mm; }}
table {{ border-collapse: collapse; width: 100%; font-size: 6.9pt; }}
th, td {{ border: 1px solid #ccc; padding: .6mm 1.2mm; text-align: left; }}
th {{ background: #eee; }}
tr {{ page-break-inside: avoid; }}
.figs {{ display: flex; gap: 4mm; }}
.figs figure {{ margin: 0; }}
.figs img {{ height: 120mm; }}
figcaption {{ font-size: 7pt; color: #555; }}
.grid .card {{ display: flex; gap: 3mm; height: 89mm; border-bottom: 1px solid #ccc; padding: 1.5mm 0; overflow: hidden; }}
.card img {{ height: 85mm; width: 57mm; object-fit: cover; object-position: top; flex: none; }}
.cbody {{ flex: 1; min-width: 0; }}
.ctitle {{ font-weight: bold; font-size: 9pt; }}
</style></head><body>

<section class="page">
  <h1>COUTURE DRESS REFERENCE PACK — SYSTEM FILE FOR THE IMAGE MODEL</h1>
  <p class="meta">Owner: Yasmin Al-Sham fabrics. Version {date.today().isoformat()}. {len(refs)} references ({len(tested)} tested, {len(catalog)} catalog). Reference photos are runway looks used only as internal design references.</p>
  <h3>RULES (mandatory, in order)</h3><ol>{rules}</ol>
  <h3>MASTER TEMPLATE (use word for word)</h3><pre>{esc(MASTER_TEMPLATE)}</pre>
  <h3>FIELD MEANINGS</h3>
  <p class="meta">tier: 'tested' = prompt verified with real results (example image on its page); 'catalog' = described from the runway photo, not yet tested.
  fabric_usage: 'full' = the whole gown is made of the client fabric; 'partial + accent' = client fabric on key parts plus a solid [ACCENT_COLOR] material.
  modesty: low / medium / high (high = covered shoulders and arms or kaftan/cape coverage). arms: whether the mannequin needs display arms (sleeved designs).</p>
</section>

<section class="page">
  <h2>INDEX — all references</h2>
  <table><tr><th>ID</th><th>tier</th><th>silhouette</th><th>neckline</th><th>sleeves</th><th>modesty</th><th>fabric_usage</th><th>source</th></tr>{index_rows}</table>
</section>

{''.join(tested_page(r) for r in tested)}
{cards}
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
    print(f"Built {pdf_path}: {len(refs)} references ({len(tested)} tested, {len(catalog)} catalog)")


if __name__ == "__main__":
    build()
