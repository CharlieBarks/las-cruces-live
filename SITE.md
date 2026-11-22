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
- **Venue cards** (Nov 22, 2026, `VenueCard.astro`): same family as the act cards. Photo on top (Notion **Photo** in Live Music Venues), else a name card colored by neighborhood. Gold "Live music this week" tag from the Thursday issue (never days or times). Sponsor venues (`isFeaturedVenue`) get a gold frame, a "Sponsor" label and, as wide cards, their **Card Line** from Notion. Homepage "Where they play": sponsor cards first, then 8 venue cards shuffled on every visit (venues with shows first). /venues/: sponsor cards at the top, then every venue as a card by neighborhood.
- The map no longer lists venues without a pin ("Not on the map yet" removed Nov 22, 2026: those are occasional presenters or play at other venues).
- **Comments** (Nov 22, 2026, `Comments.astro`): "What's it like seeing … live?" on musician pages and "What's your favorite night at …?" on venue pages. Saved by the intake Worker (`POST /comment`, Turnstile + honeypot + rate limit) to the Notion database **💬 Las Cruces Live Comments** as Submitted, Charlie gets a heads-up email, and they show only after he approves them in the Review queue (`/api/comment` on the preview Worker). Optional email is private and can sign them up for the newsletter.

## Site-specific rules

- No dates or times on the site (see above).
- Never rewrite an act's own description ("Genre" is the sound in their words).
- Email and phone fields in Notion are never read or shown.
- Band members show only under their band; link solo pages when a member also plays solo.
- **Home Base** (Notion: Local / Regional / Touring; blank = Local). Non-local acts get a "Regional act" / "Touring act" tag on their page, cards and list rows, are described as playing "Las Cruces and the region", and list after local acts. No home town is shown.
- Act names must match the newsletter's names for the "Playing this week" badges to work.
