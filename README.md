# Las Cruces Live

The who's who of the Las Cruces music scene: local musicians, bands and the venues that host them.
A Live Love Las Cruces project. Live at https://lascruceslive.com.
Built with [Astro](https://astro.build), hosted on Cloudflare, same setup as the Las Cruces Art Trail.

**The site is the spotlight. The newsletter is the schedule.** The site never shows days or times.
Every "when and where" link goes to the Thursday Live Music issue or https://livelovelascruces.com/live-music,
tagged `utm_source=lascruceslive` so Beehiiv shows what the site sends.

## How updates go live

Every change pushed to `main` is rebuilt and published by Cloudflare automatically (about 1–2 minutes).

## Where to edit

**Musicians and venues live in Notion:**

- **Las Cruces Musicians & Genres**: name, Type (Band / Solo Artist), Genre (the sound, in their words), Genres (checklist), Members / Member Of.
- **Musician Contact List**: only the public links (Website, Facebook, Instagram, Youtube) are used. Email and phone are never read.
- **Live Music Venues**: Name, Address, Phone, Website/Facebook/Instagram Link.

Optional fields the site already understands once you add them:

- **Site Status** (select: Approved, Submitted, In Review, Hidden) on musicians and venues. Until it exists, every named record shows. Once it exists, only Approved goes live.
- **Listing Tier** (select: Free, Premium, Founding).
- **Latitude** and **Longitude** (numbers) on venues. Leave blank: the build looks the address up and fills them in.

Genres: if the Genres checklist is filled in, it wins. Otherwise the site reads the free-text Genre field
(e.g. "Classic Rock, Country, Blues") and sorts the act into the site's genre pages. Rules: `scripts/lib/shape.mjs`.

## "Playing this week"

Before each build, `scripts/sync-lineup.mjs` reads the newest Beehiiv post tagged **Live Music** and matches
act and venue names against the directory. Musicians get a "Playing this week" badge, venues get a show count,
and map pins turn gold. Badges switch off by themselves when the issue is more than 7 days old.

If an act in the newsletter doesn't get a badge, its name in the issue doesn't match the directory closely enough
(e.g. "Christopher Smith Escarcega" vs "Christopher Escarcega"). Use the same name in both places.

## Build secrets (Cloudflare > Worker > Settings > Build > Variables and secrets)

- `NOTION_TOKEN`: Notion integration with access to the three databases above.
- `BEEHIIV_API_KEY`: read access to posts.

Without them (working on your own computer) the build uses the JSON files already in `src/data/`.

## Sponsors

Sponsor spots (home, map, genre pages, neighborhoods) are set in `SPONSORS` in `src/lib/site.js`.

## Build settings (Cloudflare)

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
