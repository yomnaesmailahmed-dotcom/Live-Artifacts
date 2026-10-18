"""Cache-busting for the static site — run before each deploy (no build step needed).

GitHub Pages caches files for ~10 minutes, so right after a deploy a browser can mix
new HTML with old modules. This writes, into every *.dc.html page:
  * an import map that maps each ./js/**/*.js module to ./js/...js?v=<content hash>
    (import maps also apply to imports made inside modules, so module code is untouched)
  * ?v=<hash> on the page's entry <script type="module" src> and on css/app.css

Usage: python scripts/stamp_versions.py
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAP_RE = re.compile(r'<script type="importmap" data-stamped>.*?</script>\n?', re.S)


def short_hash(path: pathlib.Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


def main() -> None:
    modules = sorted(p for p in (ROOT / "js").rglob("*.js"))
    versions = {p.relative_to(ROOT).as_posix(): short_hash(p) for p in modules}
    css = ROOT / "css" / "app.css"
    css_v = short_hash(css) if css.exists() else ""
    imports = {f"./{rel}": f"./{rel}?v={v}" for rel, v in versions.items()}
    tag = '<script type="importmap" data-stamped>' + json.dumps({"imports": imports}, separators=(",", ":")) + "</script>\n"

    for page in sorted(ROOT.glob("*.dc.html")):
        html = page.read_text(encoding="utf-8")
        html = MAP_RE.sub("", html)
        # entry module: <script type="module" src="./js/....js[?v=...]">
        def entry(m):
            rel = m.group(2)
            return f'{m.group(1)}./{rel}?v={versions.get(rel, "")}{m.group(3)}'
        html, n = re.subn(r'(<script type="module" src=")\./(js/[^"?]+)(?:\?v=[^"]*)?(">)', entry, html)
        if n:
            html = html.replace('<script type="module" src="', tag + '<script type="module" src="', 1)
        if css_v:
            html = re.sub(r'href="\./css/app\.css(?:\?v=[^"]*)?"', f'href="./css/app.css?v={css_v}"', html)
        page.write_text(html, encoding="utf-8", newline="\n")
        print(f"stamped {page.name}: entry={'yes' if n else 'no'}, {len(imports)} modules")


if __name__ == "__main__":
    main()
