# -*- coding: utf-8 -*-
"""Inline the whole story into one HTML file.

Two reasons this exists:
  * the Webflow embed and any Artifact/preview host runs under a strict CSP that
    blocks fetch() and same-folder assets, so the data and images have to travel
    inside the document;
  * a single file is what you hand someone to look at.

    python build_standalone.py                -> dist/dl2026-story.html
"""
import base64, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
os.makedirs(DIST, exist_ok=True)

html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
css = open(os.path.join(HERE, "styles.css"), encoding="utf-8").read()
js = open(os.path.join(HERE, "story.js"), encoding="utf-8").read()
data = open(os.path.join(HERE, "data", "story-data.json"), encoding="utf-8").read()

# ---- stylesheet -----------------------------------------------------------
html = html.replace('<link rel="stylesheet" href="styles.css">',
                    "<style>\n" + css + "\n</style>")

# ---- images ---------------------------------------------------------------
def inline_img(match):
    src = match.group(1)
    path = os.path.join(HERE, src.replace("/", os.sep))
    with open(path, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode("ascii")
    return 'src="data:image/png;base64,' + b64 + '"'

html, n_img = re.subn(r'src="(assets/[^"]+)"', inline_img, html)

# ---- data + script --------------------------------------------------------
html = html.replace(
    '<script src="story.js"></script>',
    '<script type="application/json" id="story-data">' + data + "</script>\n"
    "<script>\n" + js + "\n</script>")

out = os.path.join(DIST, "dl2026-story.html")
with open(out, "w", encoding="utf-8") as fh:
    fh.write(html)

print("wrote %s  (%.1f MB, %d images inlined)" % (out, os.path.getsize(out) / 1e6, n_img))
