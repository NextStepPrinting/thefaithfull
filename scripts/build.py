"""Build the static site using only Python's standard library."""
import json
import shutil
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent


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
    events = json.loads((source / "data/events.json").read_text())
    markup = render_events(events)
    output = ROOT / "dist"
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(source, output)
    page = output / "index.html"
    html = page.read_text()
    assert html.count("<!-- EVENTS -->") == 1
    page.write_text(html.replace("<!-- EVENTS -->", markup))
    print(f"Built dist/: {len(events)} events; no third-party build dependencies.")


if __name__ == "__main__":
    main()
