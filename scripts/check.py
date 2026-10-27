"""Check every local HTML/CSS reference in the generated deployment artifact."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "dist"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.ids = set()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, f"Duplicate id: {self.path}: {attrs['id']}"
            self.ids.add(attrs["id"])
        for key in ("src", "href"):
            if attrs.get(key):
                self.links.append(attrs[key])


def main():
    assert SITE.is_dir(), "Build first: python3 scripts/build.py"
    pages = {}
    for path in SITE.rglob("*.html"):
        page = Page(path)
        page.feed(path.read_text())
        pages[path.resolve()] = page
    references = [(page.path, link) for page in pages.values() for link in page.links]
    for path in SITE.rglob("*.css"):
        references.extend((path, link) for link in re.findall(r"url\(['\"]?([^)'\"]+)", path.read_text()))
    checked = 0
    for origin, link in references:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = SITE / unquote(url.path.lstrip("/")) if url.path.startswith("/") else origin.parent / unquote(url.path) if url.path else origin
        if target.is_dir():
            target /= "index.html"
        assert target.is_file(), f"Missing local target: {origin.relative_to(SITE)} → {link}"
        if url.fragment and target.suffix == ".html":
            assert url.fragment in pages[target.resolve()].ids, f"Missing anchor: {link}"
        checked += 1
    html = (SITE / "index.html").read_text()
    events = json.loads((SITE / "data/events.json").read_text())
    assert html.count('class="event"') == len(events)
    assert html.count('data-photo>') == 18
    assert '<!-- EVENTS -->' not in html
    for path in [*SITE.rglob('*.html'), *SITE.rglob('*.css'), *SITE.rglob('*.js')]:
        assert 'wp-content/' not in path.read_text() and 'wp-admin/' not in path.read_text(), f"WordPress dependency: {path}"
    assert (SITE / "404.html").is_file(), "Cloudflare Pages needs the real 404 page to avoid SPA fallback"
    assert all(p.stat().st_size <= 25 * 1024 * 1024 for p in SITE.rglob('*') if p.is_file()), "Cloudflare Pages per-file limit exceeded"
    print(f"PASS: {len(pages)} HTML pages, {checked} local references, 18 gallery photos, {len(events)} events; no WordPress resource dependencies.")


if __name__ == '__main__':
    main()
