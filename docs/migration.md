# Migration inventory and review notes

Reference: `https://thefaithfullpjtribute.com/`, inspected October 26, 2026 (client timezone). Source files and inspection screenshots are temporary working artifacts outside the deployment directory; they are not shipped as a legacy WordPress implementation.

## Preserved inventory

| Area | Source content / behavior | Static implementation |
| --- | --- | --- |
| Navigation | Home, About, Events, Music, Gallery, Contact & Press Kit; Subscribe opens a separate page | Same labels, anchors, and Subscribe page; mobile full-screen overlay with social links |
| Intro | Grayscale band/heartbeat hero; right-aligned desktop logo, centered mobile logo; “Go” audio; down arrow | Original hero and logo files; local MP3 and compact controls; native audio without JavaScript |
| About | Promo-video image and YouTube lightbox; five paragraphs about Pearl Jam's community and the tribute show | Original image, video ID, and text; same narrow centered content and vertical divider |
| Events | LIVE EVENTS; 10.17.26 Whisky a Go Go / Interstate Love Band, Hollywood; 11.20.26 Deep End Live, Redondo Beach; ticket links | Exact records and destinations in separate JSON; desktop columns, stacked mobile layout |
| Music | Bass-player background; square singer photo; Alive, Nothingman, Go, FAITHFULL, JEREMY; SoundCloud and complete set-list links | Original files and outgoing links; no fabricated embedded players |
| Gallery | Purple-lit singer background; 18 square thumbnails; full-size lightbox | Same images/order/crops, 6 columns desktop, 2 tablet, 1 narrow mobile; local WebP thumbnails with original JPEG lightbox |
| Contact | CLICK HERE TO BOOK US!, booking email, Download Press Kit, 5 social icons | Same destinations, original branding font and icons |
| Footer | © 2023 THE FAITHFULL; ALL RIGHTS RESERVED; POWERED BY ZENDO | Original year, wording, and credit destination retained (including its very dark original text color) |
| Subscribe | JOIN OUR MAILING LIST and email form, submitted through WordPress to Mailchimp | Known gap: unavailable notice until client provides public signup URL; no fake form |

## Small functional corrections

- The source's events-to-music arrow linked to `#news`, which does not exist. It now links to the actual music section `#album`.
- Booking removes an erroneous encoded leading space in the original `mailto:` URL.
- Mobile-menu social links use the real footer destinations; the source menu's social links were `#` placeholders.
- Dialog controls and mobile navigation have accessible labels, keyboard support, and visible focus. Audio does not autoplay.
- Original gallery CSS/JavaScript had resize-dependent layout artifacts. CSS Grid preserves the documented responsive column counts without requiring page-builder relayout code.

## Comparison method

Downloaded original HTML, theme/layout CSS, frontend scripts, and required media using TLS-verified `curl`. A local reference copy was rendered in Chromium with offsite requests blocked. Original WordPress code was used **only for inspection**, not included in the new site. Dosis and Playfair Display were supplied locally because Google Fonts requests were restricted in the environment.

Compared reference and migration at 1440 × 1000, 768 × 844, and 390 × 844. Corrected logo alignment, text widths, event-button styling, gallery cell/gutter sizes, heading spacing, and responsive padding. At 1440 × 1000 the six section heights match the reference (intro 1000 px, about approximately 1250 px, then four 1000 px sections). This is a visual comparison of the retrieved reference, not a claim of pixel identity across browsers or independently verified external integrations.

The existing theme's sticky-header behavior was not independently established: the reference inspection copy did not keep the header fixed when scrolling. The migration preserves the observed top-of-page navigation and back-to-top control. Recheck against the live site in an unrestricted trusted browser before final client sign-off.

## Validation scope

- Static build produces a standalone Pages artifact and retains Cloudflare's `_headers` configuration and a proper 404 page.
- Local checker follows HTML links, fragments, images, scripts, stylesheets, and CSS font/background URLs, and checks the 25 MiB single-asset limit.
- Browser suite checks 320, 390, 768, 1024, and 1440 px widths for horizontal overflow, image decoding, font availability, event markup, navigation, gallery layout/lightbox, and console/runtime errors.
- Real MP3 playback, duration, pause, mute, and seeking are checked against the local server with byte-range support.
- YouTube dialog creation/removal and the exact embed URL are tested with external traffic isolated. This does not validate YouTube playback or embedding permissions.
- The original site's Dropbox, SoundCloud, social destinations, ticket providers, and subscription backend are not declared working merely because their URLs are preserved. External checks were restricted by the environment's network policy.
- No subscription requests, bookings, social posts, ticket purchases, production deployments, or DNS changes are performed.

## Outstanding before complete functional sign-off

1. Obtain a **public Mailchimp signup URL or embed action URL**. Restore the original-looking form only once it can submit to the actual provider. Never embed a private API key in static code.
2. Verify YouTube playback, the five SoundCloud tracks/profile, ticket destinations, social links, and Dropbox access in a trusted browser. A copy of the actual press kit can be hosted locally if the client supplies it; otherwise Dropbox remains the preserved dependency.
3. Client visual/content review on a Cloudflare Pages preview, including live-source scrolling/header behavior. GitHub must have an approved production base branch before opening a conventional PR or configuring a production deployment.
