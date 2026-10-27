# Project guidance

This is an authorized migration of the client's existing Pearl Jam tribute-band website, not a redesign. Preserve the original copy, design, colors, imagery, section order, external destinations, and mobile behavior unless the user explicitly requests a change. Do not invent unavailable media, signup endpoints, or press-kit contents.

- Work in the existing `/workspace/thefaithfull` checkout. Cloud tasks are already isolated; do not create a Git worktree unless explicitly requested.
- Continue on a dedicated feature branch. Never change production DNS, deploy production, or push to a production branch without user authorization. The migration started from an empty repository without `main`.
- Source is in `public/`. `dist/`, `node_modules/`, and `test-results/` are generated/ignored. Do not edit generated output or commit dependencies.
- Build with `python3 scripts/build.py`; run with `python3 scripts/serve.py`. Static checks: `python3 scripts/check.py`. Full validation: `npm ci` followed by `npm test`; Playwright uses installed Chromium or its own installed browser.
- No frontend framework or runtime npm dependency is needed. Keep changes small and readable. Python 3.10+ powers the standard-library build and local server only; production is static Cloudflare Pages.
- `public/data/events.json` is the event source of truth. Keep dates as ISO strings and preserve ordering; do not add automatic past-event filtering. `render_events()` in `scripts/build.py` owns escaped event markup. A future Google Sheets adapter should reuse this data contract; do not implement it without a request.
- Preserve original image/audio files and provenance in `docs/assets.json`. Use optimized derivative files for thumbnails. Do not regenerate logos or substitute imagery. Font licenses are in `public/assets/fonts/`.
- Keep the established section IDs (`intro`, `about`, `tour-dates`, `album`, `gallery`, `contact`). The original events-to-music down-arrow pointed at nonexistent `#news`; this migration corrects it to `#album`.
- Interactive dialogs must support Escape, keyboard navigation, focus restoration, and reduced motion. Keep normal image/video links and native audio as fallbacks.
- `public/subscribe/` has an explicitly documented missing Mailchimp integration. Never invent an endpoint, expose an API key, return fake success, or silently restore a WordPress dependency. Ask only for the public hosted signup URL or public embed action URL.
- YouTube, SoundCloud, Dropbox, social profiles, and email are external dependencies. Automated browser tests intentionally avoid contacting them. Report external playback/download checks separately from local interaction checks.
- Before reporting completion, run the appropriate checks, inspect responsive layouts (320, 390, 768, 1024, and 1440 pixels), and check Git changes for unintended files. Do not describe the migration as fully feature-complete while mailing-list signup remains unresolved.
- Deployment settings: Cloudflare Pages / framework None / build `python3 scripts/build.py` / output `dist`. Preserve `_headers` and the real `404.html`; no SPA rewrite, PHP, database, or serverless function is required.
