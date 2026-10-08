#!/usr/bin/env python3
"""Build index.html: one self-contained file (CSS, JS, libraries, demo pack and logo inlined).

    python3 build.py

Inputs: src/index.html, src/base.css, src/app.css, src/app.js, vendor/*.js,
demo/jeremy-legal-demo-pack.zip, assets/logo.png. Output: index.html.
"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def read(p):
    return (ROOT / p).read_text(encoding="utf-8")


def b64(p):
    return base64.b64encode((ROOT / p).read_bytes()).decode("ascii")


def main():
    css = read("src/base.css") + "\n" + read("src/app.css")
    vendor = read("vendor/xlsx.mini.min.js") + "\n;\n" + read("vendor/papaparse.min.js")
    app = read("src/app.js")
    for name, text in (("vendor", vendor), ("app", app)):
        if "</script" in text.lower():
            raise SystemExit(name + " contains </script")
    if "</style" in css.lower():
        raise SystemExit("css contains </style")
    html = read("src/index.html")
    parts = {
        "{{LOGO}}": "data:image/png;base64," + b64("assets/logo.png"),
        "{{CSS}}": css,
        "{{VENDOR}}": vendor,
        "{{DEMO_ZIP_B64}}": b64("demo/jeremy-legal-demo-pack.zip"),
        "{{APP}}": app,
    }
    for k, v in parts.items():
        if k not in html:
            raise SystemExit("missing placeholder " + k)
        html = html.replace(k, v)
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print("index.html", len(html.encode("utf-8")), "bytes")


if __name__ == "__main__":
    main()
