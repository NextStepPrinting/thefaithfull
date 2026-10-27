# The Faithfull

A static migration of [thefaithfullpjtribute.com](https://thefaithfullpjtribute.com/), preserving the existing black/red branding, imagery, copy, section order, events, music links, gallery, and booking details. HTML, CSS, and a small JavaScript module replace WordPress and the Kallyas page builder. There are **no production npm dependencies** or server-side application services.

This work lives on `feature/static-site-migration`. No production deployment or DNS changes have been made. The original repository had no commits or `main` branch when the migration began.

## Run locally

Python 3.10+ is sufficient to build and run the website:

```sh
python3 scripts/build.py
python3 scripts/serve.py
```

The local server listens on port 8000. Rebuild after editing source files, then refresh the browser. `scripts/serve.py` supports byte ranges so the MP3 can be played and seeked locally. The build safely replaces only the generated `dist/` directory; do not edit files there.

Optional browser validation uses Node.js 20+ and Playwright:

```sh
npm ci
# If Chromium is not already installed:
npx playwright install chromium
npm test
```

The test runner uses `/usr/bin/chromium` when available, otherwise Playwright's browser. Set `BROWSER_PATH` to use another Chromium executable. Screenshots and results go into ignored `test-results/`. Browser tests start and stop their own local server on port 8765. No forms are submitted and no third-party services are contacted by the automated tests.

For validation without Node.js:

```sh
python3 scripts/build.py
python3 scripts/check.py
```

## Project structure

```text
public/
  index.html              Homepage source; event markup is inserted during build
  subscribe/index.html    Explicit pending-signup page; see limitations below
  404.html                Real not-found page (prevents Pages' default SPA fallback)
  _headers                Cloudflare Pages response/cache headers
  styles/site.css         Local fonts, original layout, responsive breakpoints
  scripts/site.js         Mobile navigation, gallery, video dialog, audio controls
  data/events.json        Event content, separate from presentation
  assets/
    images/               Original downloaded images, logo, and icons
      thumbnails/         Optimized WebP gallery images
    audio/Go.mp3          Original audio recording
    fonts/                Dosis, Playfair Display, original social icons, font licenses
scripts/
  build.py                Standard-library static build and event rendering
  serve.py                Local static server with media byte-range support
  check.py                Built-site asset, anchor, event, and Pages-limit checks
  browser-test.cjs         Responsive and interaction checks
docs/
  assets.json             Downloaded-asset source URLs and SHA-256 checksums
  migration.md            Source inventory, comparison method, and known gaps
dist/                     Generated deployment artifact (ignored)
```

## Cloudflare Pages

Connect the GitHub repository to a Cloudflare Pages project when the client is ready. Use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `python3 scripts/build.py` |
| Build output directory | `dist` |
| Environment variables/secrets | None required for the static site |

The build requires Python 3.10+; Node.js and npm installation are optional for tests and are not needed by the build. Pages may automatically install dev dependencies when it sees `package.json`. To skip that unnecessary install, set its build environment variable `SKIP_DEPENDENCY_INSTALL=true`; the Python build still runs normally.

Use the feature branch for a preview deployment. Select the client's approved production branch only after review and merge; this migration does not create or change that branch. With an initially empty repository, a production base branch must be established by the repository owner before a conventional pull request can target it. Do not point production at the feature branch as a shortcut.

All local URLs are origin-relative and work on a Pages domain or the final custom domain. Do not deploy this artifact under a URL subdirectory. `dist/_headers` and `dist/404.html` are included automatically. No PHP, WordPress API, database, Workers, or Pages Functions are required. No DNS configuration is included. Publish/deploy only after the client approves and the mailing-list gap below is resolved or explicitly accepted.

## Assets

The logo, hero/promotional images, section backgrounds, all 18 gallery originals, favicons, and MP3 were downloaded from the existing site without recompression. Gallery thumbnails use WebP at quality 88, bounded to 800 × 800 pixels; clicking opens the original JPEG in the lightbox. The gallery background reuses the original photograph. Original filenames are retained to make comparison and replacement straightforward.

`docs/assets.json` records provenance and checksums of the downloaded original media. Keep it current if originals change. Dosis and Playfair Display are hosted locally from the official Google Fonts repository and their SIL Open Font Licenses are included. The source site's social-icon font is retained to match its icons. Client-provided photography, branding, recordings, and icon font remain subject to their existing rights; migration does not assign new licenses to them.

Avoid replacing existing media with newly designed or generated substitutes. Add separate optimized derivatives when needed and keep the originals for gallery viewing. A single Pages asset must remain below 25 MiB; the current largest file is the approximately 7 MB MP3.

## Maintaining gigs

Edit **only `public/data/events.json`** to update event content, then rebuild. Each entry has:

```json
{
  "date": "2026-11-20",
  "venue": "Deep End Live",
  "location": "Redondo Beach, CA",
  "url": "https://example.com/tickets"
}
```

Dates use ISO `YYYY-MM-DD`; the build displays `MM.DD.YY` without browser timezone conversions. Ticket URLs must use HTTPS. Array order determines display order. Events are neither filtered nor automatically removed: the two original listings, including the October 17 event, are intentionally preserved. Text is HTML-escaped by `render_events()` in `scripts/build.py`; layout belongs to `.event` in the stylesheet.

Google Sheets is **not implemented**. The four-field data shape and `.event` markup form the boundary for a future data adapter. That adapter can supply the same records to the renderer (or a runtime equivalent) without redesigning the section. No Google credentials, sheet IDs, API keys, or speculative endpoints are included.

## External integrations and remaining limitations

- **YouTube:** the original promotional video ID `61RIRzGXOCA` opens in a modal embed, with the original watch link as a fallback. Video remains hosted by YouTube and is loaded only after a click. Availability, embed permissions, ads, and playback depend on YouTube. External playback could not be verified from this restricted environment; automated tests verify only the embed URL and modal lifecycle.
- **SoundCloud:** the original site has five outgoing track links and a profile/set-list link, not embedded SoundCloud players. These are retained exactly. The separate homepage audio player uses the downloaded local `Go.mp3`. SoundCloud links require that service to remain available.
- **Press kit:** the original Dropbox shared-folder URL is retained. The environment blocked Dropbox, so its contents could not be downloaded or verified. It remains an external dependency; replace the link with local client-provided kit files if supplied later. No replacement kit has been invented.
- **Mailing list — unresolved:** the original `/subscribe/` form uses WordPress `admin-ajax.php`, a dynamic nonce, and a private server-side Mailchimp integration. Its public markup does not disclose a usable hosted signup URL. The static Subscribe page explicitly reports that online signup is unavailable and provides the existing contact email. It does **not** simulate success, collect addresses, or call the old WordPress backend. A public Mailchimp hosted signup URL or public embed action URL is required to restore signup and the original form appearance. Do not put a Mailchimp API key in this repository or frontend code.
- **Email and social links:** booking opens the visitor's mail client; Instagram, Facebook, Twitter, YouTube, SoundCloud, and the original footer credit remain external. No email is sent by this website.
- **Reference inspection:** the live site's HTML, CSS, scripts, and media were retrieved with verified HTTPS. Direct Chromium navigation hit the environment's proxy-certificate trust error. Visual comparison therefore used a local inspection-only copy of the downloaded source at desktop, tablet, and mobile widths, with the local fonts loaded. This establishes a close visual reference, not independent verification of every live third-party service.

See [docs/migration.md](docs/migration.md) for the detailed inventory. The WordPress AJAX subscription is the material functional gap; the migration should not be described as feature-complete until it is resolved or accepted by the client.
