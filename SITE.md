# Las Cruces Live

Site-specific rules. The shared rules are in [AGENTS.md](AGENTS.md). Read the `README.md` too: it's the operations manual (Notion databases, claim flow, lineup sync, secrets).

## What it is

The who's who of the Las Cruces music scene: local musicians, bands and the venues that host them. A resource for locals and visitors to get to know the acts (genres, who they are) and the rooms worth going to.

**The site is the spotlight. The newsletter is the schedule.** The site never shows days or times. Every "when and where" link goes to the Thursday Live Music issue or https://livelovelascruces.com/live-music, tagged `utm_source=lascruceslive`. Don't add show times or a schedule, even if a design seems to want one.

- Live: https://lascruceslive.com
- Private preview (Charlie only, except `/share/`): https://las-cruces-live-preview.cf2-99b.workers.dev, with Approve / Hide / Edit buttons and `/review/`
- Workers: live site (lascruceslive.com Cloudflare account), `las-cruces-live-preview` and `lc-live-intake` (Live Love Las Cruces account)

## Data

| Data | Source | Edit by hand? |
|---|---|---|
| `src/data/musicians.json`, `src/data/venues.json` | Notion, via `scripts/sync-notion.mjs` | **No**, generated each build |
| `src/data/thisweek.json` | Newest Beehiiv "Live Music" post, via `scripts/sync-lineup.mjs` | **No**, generated each build |
| Sponsor spots | `SPONSORS` in `src/lib/site.js` | Yes |
| Thursday Live Music issue sponsors (homepage + /this-week/ band) | `SPONSORS.liveMusic` in `src/lib/site.js` | Yes |
| Genre sorting rules | `scripts/lib/shape.mjs` | Carefully |

- Builds without `NOTION_TOKEN` / `BEEHIIV_API_KEY` use the saved JSON.
- `/directory.json` lists every act (name, page, genres) and venue (name, page) for the Las Cruces Events calendar, which reads it at build time to show genres next to shows and link here. Names and links only, never dates or times. Built Nov 15, 2026.
- Beehiiv can answer `202` ("still rendering, try again") when asked for an issue's web HTML. `sync-lineup.mjs` waits and retries, and finds the issue by title if the tag filter comes back empty. Check the build log line starting `sync-lineup:` when "Playing this week" is missing.
- A GitHub Action (`thursday-rebuild.yml`) rebuilds after each Thursday issue so "Playing this week" badges update. Keep it.
- Musician listings are free. Venues are where the money is (venue promos, banners, sponsored sections). `Listing Tier` (Free / Premium / Founding) exists in Notion.

## Brand

Gig-poster energy: night sky over the Organ Mountains, New Mexico turquoise, red chile and stage-light gold. Current tokens in `src/styles/global.css`:

| Role | Current token | Value | ACSS role (proposed) |
|---|---|---|---|
| Page background | `--sky` | `#e6f1ee` | `bg-light` |
| Paper / cards | `--paper` | `#f6faf8` | `bg-ultra-light` |
| Night (dark sections, text) | `--night` / `--ink` | `#1d1735` | **base** / `bg-dark` / `text-dark` |
| Muted text | `--muted` | `#4d4866` | `text-dark-muted` |
| Turquoise (links, primary) | `--turq` | `#0a6f6b` | **primary** |
| Red chile | `--chile` | `#b01f2c` | **secondary** |
| Stage gold (badges, pins, focus) | `--gold` | `#f4b63e` | **accent** |
| Cream | `--cream` | `#f5efe2` | neutral light |
| Content width | `--wrap` | `1180px` | ACSS content width |

Fonts: **Big Shoulders Display** (display, condensed gig-poster) and **Public Sans** (text), self-hosted via `@fontsource`.

## Moving to ACSS: checklist

Separate pull requests, in order (details in [agent-docs/acss-workflow.md](agent-docs/acss-workflow.md)):

1. [ ] **Rename colliding tokens:** `--text` → `--lcl-text` (ACSS uses `--text-*`). Check the others for collisions too. No visual change.
2. [ ] Snapshot the homepage into Paper and redesign it. Approve.
3. [ ] Generate `acss/settings.json` from the approved design. Run `scripts/acss-sync.sh`.
4. [ ] Add `reset.css`, ACSS and `acss-bridge.css` to `Layout.astro`. Alias legacy tokens in the bridge.
5. [ ] Convert components one at a time to ACSS tokens.
6. [ ] Shrink `global.css` to only what ACSS doesn't handle.

## Design status

- Homepage: redesigned Nov 22, 2026 (musician first). Mockup: https://claude.ai/artifact/2tvDP5MUwCucceLTAEDNqy
  - "Playing this week" cards, shuffled on every visit so acts get equal time; `/this-week/` shows them all.
  - Acts with Listing Tier "Premium" are always in the homepage lineup, first, labeled "Featured" (the paid spotlight hook).
  - Cards with no photo become a poster of the act's name, colored by genre (`posterColor` in `src/lib/site.js`).
  - Newsletter sponsors sit in a band right under the hero, and their venues lead "Where they play".
- Featured venues = Listing Tier "Featured" in Notion or on `SPONSORS.liveMusic` (`isFeaturedVenue`). They're listed first with a gold highlight, get a "Featured venue" badge on their page, and a halo and name label on the map. The sponsor band also shows on /venues/ and /map/.
- Musician pages without a photo show the name poster with "Is this you? Add a photo" (`Poster.astro`).
- **Venue cards** (Nov 22, 2026, `VenueCard.astro`): same family as the act cards. Photo on top (Notion **Photo** in Live Music Venues), else a name card colored by neighborhood. Gold "Live music this week" tag from the Thursday issue (never days or times). Sponsor venues (`isFeaturedVenue`) get a gold frame, a "Sponsor" label and, as wide cards, their **Card Line** from Notion. Homepage "Where they play": sponsor cards first, then 8 venue cards shuffled on every visit (venues with shows first). /venues/: sponsor cards at the top, then every venue as a card by neighborhood. In each neighborhood: sponsors, then claimed venues, then the rest (Nov 25, 2026).
- **Musicians page** (Nov 22, 2026, `src/pages/musicians/index.astro`): every act as an `ActCard`, 12 at a time with "Show more" (all cards stay in the HTML so every profile link is crawlable). Order (Nov 25, 2026): claimed acts always on top, even after the shuffle (playing this week/next first, then with a photo, then the rest), then unclaimed acts (playing first); local before regional/touring; Featured first; shuffled within each group on every visit. Playing cards link "See when & where" to the latest Thursday issue (`issueLink`); unclaimed cards get "Is this you? Claim it free". "Claimed" = Notion Owner Email set (public yes/no flag from `sync-notion.mjs`, never the email), or the act has a photo or bio.
- **Venue claims** (Nov 25, 2026): every venue page has "Run this venue? Claim this page" (`/claim/?id=…&kind=venue`), same flow as musicians: matching email (Owner Email or Email in Live Music Venues) gets the private edit link, otherwise it waits in the Review queue. The edit-link email goes straight from charlie@ (`sendVenueEditLink`, GUEST_EMAIL, Grok Bot as backup), since Grok Bot's emails are written for musicians. Venues can edit About, Address (clears the map pin so it's looked up again), Phone, Website/Facebook/Instagram, Pinned Posts, main photo and up to 8 more photos. They can't change their name (must match the newsletter) or Listing Tier. First edits to a live page wait for Charlie, like musicians. When a claim gives a live page a new Owner Email (matched claim or "Send edit link"), `giveEditLink` also rebuilds lascruceslive.com, so the button flips to "Edit this page" in a couple of minutes (Nov 26, 2026: Madelyn's Mesilla kept showing "Claim this page" overnight because only the preview rebuilt). `VenuePage.astro` is the page, used by `/venues/<slug>/` and `/share/<token>/`. "Claimed" venue = Owner Email set. **Hours & notices** (Nov 25, 2026): Notion **Hours** (one line per day, 24-hour: `Mon 11:00-21:00`, `Tue closed`; parsed by `parseHours()` in `src/lib/site.js`, shown grouped like "Mon–Thu 11 am – 9 pm" and in the MusicVenue schema), **Hours Note**, and a **Notice** banner with **Notice Until** (hidden after that day at build and in the browser). Venues set all four in their editor (day-by-day pickers, no typing the format). **Closures from the newsletter:** a line under a day in the Thursday issue like `Blue Moon | CLOSED – Private event` (reason optional) becomes a "Closed Thursday, November 26 for private event." banner on that venue's page until the day passes (`matchLineup` in `scripts/lib/shape.mjs` → `closures` in thisweek.json → `venueClosures()`). It never counts as a show. This is the main way closures get on the site: venues rarely edit their own page.
- The map no longer lists venues without a pin ("Not on the map yet" removed Nov 22, 2026: those are occasional presenters or play at other venues).
- **Comments** (Nov 22, 2026, `Comments.astro`): "What's it like seeing … live?" on musician pages and "What's your favorite night at …?" on venue pages. Saved by the intake Worker (`POST /comment`, Turnstile + honeypot + rate limit) to the Notion database **💬 Las Cruces Live Comments** as Submitted, Charlie gets a heads-up email, and they show only after he approves them in the Review queue (`/api/comment` on the preview Worker). Email is required (private, never shown) and can sign them up for the newsletter. When Charlie approves a comment, the commenter gets one "Your comment is up" email from charlie@livelovelascruces.com (`thankCommenter` in the intake: link to the page, newsletter unless they ticked it, events calendar, Art Trail). It goes out through the `GUEST_EMAIL` binding (Cloudflare Email Sending, needs Workers Paid); if that fails, the email is handed to Grok Bot's inbox to send. Notion's **Thank-you Sent** box makes sure it's sent once.

- **Crowd photos** (Nov 22, 2026, `CrowdPhotos.astro`): "From the crowd" on musician and venue pages. Up to 3 photos per upload, redrawn in the browser at 2000px (drops phone location data), sent to the intake (`POST /crowd`, Turnstile + honeypot + rate limit), stored in the PHOTOS KV under `crowd/` and saved to **📸 Las Cruces Live Crowd Photos** as Submitted. Charlie gets a heads-up and approves or hides them in the Review queue (same `/api/comment` call). Approved photos are downloaded at build (`media/crowd/`). The uploader gets the same thank-you email as comments ("Your photos are up").
- **Page owners hear about it** (Nov 22, 2026, `notifyPageOwner` in the intake): when Charlie approves a comment or crowd photos, the act (Owner Email, else Submitter Email) or venue (Email in Live Music Venues) gets one email from charlie@: "… got a new comment" / "New crowd photos of …", with the quote, the link, a "Claim this page" nudge for unclaimed acts and the Events Calendar. Same GUEST_EMAIL route with Grok Bot as backup. Notion **Owner Notified** makes sure it's sent once. No email on file = skipped.
- **Pinned posts** (Nov 22, 2026, `PinnedPosts.astro`): Notion **Pinned Posts** (musicians and venues), up to 3 public Instagram or Facebook post links, one per line. Acts can edit it from their private edit link. Shown with Instagram's and Facebook's own embeds, loaded only when scrolled into view. No Meta app needed.
- **Outgoing links are tagged** (Nov 22, 2026): every link to an act's or venue's own website, socials, song or booking page goes through `out()` in `src/lib/site.js` (`utm_source=lascruceslive&utm_medium=referral&utm_campaign=profile&utm_content=<slug>`), so they can see in their own analytics what this site sends them. Links back to the newsletter keep using `utm()`.
- **Facebook share images** (Nov 24, 2026, `keepShareCard` in `scripts/sync-notion.mjs`): every act and venue with a photo gets a 1200x630 share card at build (`media/<slug>/share.jpg`, venues `media/venues/<slug>/share.jpg`): the whole photo centered over a blurred copy, never cropped, with the Las Cruces Live wordmark cut from `og-default.png` in the corner. `Layout.astro` takes `image`/`imageAlt`; no photo = `og-default.png`. Facebook caches previews: use the Sharing Debugger's "Scrape Again" after a photo changes.
- **Traffic report** (Nov 22, 2026): `Track.astro` counts page views and clicks (Book, Song, Website, Instagram, Facebook, Directions, Calls, Newsletter) on lascruceslive.com only. No cookies, nothing personal. Hits go to the shared `lllc-analytics` database through the Art Trail's live Worker (`https://lascrucesarttrail.com/api/hit`) as site `live`. Report: `https://lascrucesarttrail.com/api/stats/?key=STATS_KEY&site=live`. Open any page once with `?notrack` to stop counting your own visits.

## Site-specific rules

- **Before opening a PR that touches `workers/` or `scripts/`**, check for missing names: `npx eslint@8 --no-eslintrc --env es2022,worker,node --parser-options=ecmaVersion:2023,sourceType:module --rule 'no-undef:error' workers/intake/index.js workers/preview/index.js scripts/*.mjs scripts/lib/*.mjs`. A plain build doesn't catch them in the Workers (Nov 22, 2026: the crowd photo upload shipped without its handler and failed with "Failed to fetch").

- **`btn-line` on a dark background needs light text.** It defaults to `--ink`, so on `--night` it's invisible until hover. Use `.on-night` on the section, or set the color in that component (the editor does). Nov 24, 2026: "Add a band member" only showed on hover.
- **Every Site Status select in Notion needs all four options (Approved, Submitted, In Review, Hidden).** The preview build asks Notion for Submitted and In Review records, and Notion rejects a filter on an option that doesn't exist, which fails the whole preview build. Nov 25, 2026: the venues database got Site Status without "Submitted" and the Review queue stopped updating. The live build only asks for Approved, so it kept working.
- **A new act can go live without photos.** If the live build log shows `couldn't save a photo … HTTP 403` for intake `/photo/` links, the request was blocked before reaching `lc-live-intake`; retrying the build fixed it (Nov 24, 2026, Rebel Creek Radio).

- **Schema (Nov 25, 2026):** musician pages: Person / MusicGroup with genres (solo artists too), bio as description, photo; venue pages: MusicVenue with the address split into street, city, state and ZIP (`postalAddress()` in `src/lib/site.js`; an address that doesn't fit "street, city, NM 88005" stays one line) and photo; both get breadcrumbs (Home › Musicians/Venues › name). No Event schema here: shows have no dates on this site, and the Las Cruces Events calendar is the one page per show for Google (it names Las Cruces Live acts as performers and links here).
- No show dates or times on the site (see above). A venue's opening hours and a closure notice are fine (Charlie, Nov 25, 2026): they're business info, not the schedule.
- Never rewrite an act's own description ("Genre" is the sound in their words).
- Email and phone fields in Notion are never read or shown.
- Band members show only under their band; link solo pages when a member also plays solo.
- **Home Base** (Notion: Local / Regional / Touring; blank = Local). Non-local acts get a "Regional act" / "Touring act" tag on their page, cards and list rows, are described as playing "Las Cruces and the region", and list after local acts. No home town is shown.
- Act names must match the newsletter's names for the "Playing this week" badges to work.
