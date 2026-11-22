"""Build the static site using only Python's standard library."""
import json
import shutil
from datetime import date, datetime
from hashlib import sha256
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent


def upcoming_events(events):
    today = datetime.now(ZoneInfo("America/Los_Angeles")).date()
    return [event for event in events if date.fromisoformat(event["date"]) >= today]


def render_events(events):
    rows = []
    for event in events:
        when = date.fromisoformat(event["date"])
        if urlsplit(event["url"]).scheme != "https":
            raise ValueError("Ticket links must use HTTPS")
        rows.append(
            '<article class="event">'
            f'<time datetime="{when.isoformat()}">{when:%m.%d.%y}</time>'
            f'<h3>{escape(event["venue"])}</h3>'
            f'<p>{escape(event["location"])}</p>'
            f'<a class="ticket" href="{escape(event["url"], quote=True)}" '
            'target="_blank" rel="noopener noreferrer">Info &amp; Tickets</a>'
            '</article>'
        )
    return "\n".join(rows)


def main():
    source = ROOT / "public"
    events = json.loads((source / "data/events.json").read_text(encoding="utf-8"))
    markup = render_events(upcoming_events(events)) or "<p>More shows coming soon.</p>"
    output = ROOT / "dist"
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(source, output)
    stylesheet = output / "styles/site.css"
    version = sha256(stylesheet.read_bytes()).hexdigest()[:12]
    versioned_stylesheet = stylesheet.with_name(f"site.{version}.css")
    shutil.copyfile(stylesheet, versioned_stylesheet)
    page = output / "index.html"
    html = page.read_text(encoding="utf-8")
    assert html.count("<!-- EVENTS -->") == 1
    page.write_text(html.replace("<!-- EVENTS -->", markup), encoding="utf-8")
    for page in output.rglob("*.html"):
        html = page.read_text(encoding="utf-8")
        if 'href="/styles/site.css"' in html:
            page.write_text(
                html.replace('href="/styles/site.css"', f'href="/styles/{versioned_stylesheet.name}"'),
                encoding="utf-8",
            )
    print(f"Built dist/: {len(events)} events; no third-party build dependencies.")


if __name__ == "__main__":
    main()
