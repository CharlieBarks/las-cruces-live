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
- **🎤 Band Members**: one record per person, linked to their band (see below).

Optional fields the site already understands once you add them:

- **Site Status** (select: Approved, Submitted, In Review, Hidden) on musicians and venues. Blank counts as Approved (the acts listed before the field existed). Submitted and In Review show only on the preview site. Hidden never shows.
- **Listing Tier** (select: Free, Premium, Founding).
- **Latitude** and **Longitude** (numbers) on venues. Leave blank: the build looks the address up and fills them in.

Genres: if the Genres checklist is filled in, it wins. Otherwise the site reads the free-text Genre field
(e.g. "Classic Rock, Country, Blues") and sorts the act into the site's genre pages. Rules: `scripts/lib/shape.mjs`.

## "Playing this week & next"

Before each build, `scripts/sync-lineup.mjs` reads the newest Beehiiv post tagged **Live Music** and matches
act and venue names against the directory. The issue covers two weeks (Thursday to Wednesday; the second week is web-only), and every show keeps the date
from the day heading above it ("Thursday, November 05th"). Musicians get a "Playing this week", "Playing next week"
or "Playing this week & next" badge, venues get a show count, and map pins turn gold. Past shows drop off at
each build, and everything switches off by itself two weeks after the issue date.

If an act in the newsletter doesn't get a badge, its name in the issue doesn't match the directory closely enough
(e.g. "Christopher Smith Escarcega" vs "Christopher Escarcega"). Use the same name in both places.

## Build secrets (Cloudflare > Worker > Settings > Build > Variables and secrets)

- `NOTION_TOKEN`: Notion integration with access to the three databases above.
- `BEEHIIV_API_KEY`: read access to posts.

Without them (working on your own computer) the build uses the JSON files already in `src/data/`.

## Musicians: add, claim and edit (Nov 2026)

Free listings only for musicians, no upgrades. Same setup as the Las Cruces Art Trail.

- **New acts** fill out the Tally form https://tally.so/r/RWdbxl. Its webhook (Tally > form > Integrations >
  Webhooks) points at `https://lc-live-intake.cf2-99b.workers.dev/tally?key=INTAKE_KEY`. Each submission becomes a
  Notion record with **Site Status = Submitted**, plus one **Band Members** record per person typed in
  "Who's in the band?". Answers are matched by question title, so keep titles the same when editing the form.
- **Claim this page** is on every musician page (`/claim/?id=…`). If the email matches one on file (Owner Email,
  Email, Booking Email, Submitter Email or the Musician Contact List), the private edit link goes into Notion
  (**Edit Link**, with **Edit Link Sent** unticked) and Grok Bot emails it. Otherwise it waits in the Review queue.
- **Private edit link**: `https://las-cruces-live-preview.cf2-99b.workers.dev/share/<token>/`. Acts change their
  words, genres, links, main photo, up to 8 more photos and band members. Changes to a live page wait for
  Charlie (Apply / Apply & trust / Discard) unless the act is a **Trusted Editor**.
- **Preview site** (`las-cruces-live-preview.cf2-99b.workers.dev`, Charlie's login only): every page has
  Approve / Hide / Edit buttons; `/review/` lists new acts, claim requests and waiting changes.
- **Band members** live in the **🎤 Band Members** Notion database and show only under their band ("Meet the band").
  Link **Solo Page** when a member also plays solo: their card gets "Also plays solo →" and the solo page lists the band.
- Photos show only when **Image Permission** is ticked on the act.

Where it runs: `workers/intake` (lc-live-intake) and the preview build both live in the Live Love Las Cruces
Cloudflare account, next to the Art Trail. Only the public site is in the lascruceslive.com account.
Intake secrets: NOTION_TOKEN, INTAKE_KEY, PREVIEW_HOOK, LIVE_HOOK, TURNSTILE_SECRET (BEEHIIV_API_KEY optional).

## Venues: claim and edit (Nov 2026)

- **Claim this page** is on every venue page (`/claim/?id=…&kind=venue`). If the email matches **Owner Email** or
  **Email** in 🎵 Live Music Venues, the private edit link goes into Notion and is emailed to them from
  charlie@livelovelascruces.com (Grok Bot gets it to send if that fails). Otherwise it waits in the Review queue.
- Venues edit About, Address, Phone, links, Pinned Posts and photos. Not the name or Listing Tier.
- Same Approve / Hide / Edit buttons, waiting changes and Trusted Editor box as musicians. Blank Site Status = live.

## Sponsors

Sponsor spots (home, map, genre pages, neighborhoods) are set in `SPONSORS` in `src/lib/site.js`.

## Build settings (Cloudflare)

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

## Keys and tokens

Names only. The values live in Cloudflare and are never committed. Added Nov 26, 2026.

**Two Cloudflare accounts.** The public site (`las-cruces-live`) is in the lascruceslive.com account (Cf8). The intake (`lc-live-intake`) and the private preview (`las-cruces-live-preview`) are in the Live Love Las Cruces account (Cf2), next to the Art Trail and the Events Calendar.

| Where | Name | What it's for / what breaks without it |
|---|---|---|
| Each account: Worker > Settings > Builds > API token | Workers Builds token | Lets Cloudflare deploy from GitHub. One per account; every Worker in that account uses it. Without it every build fails before it starts ("build token belongs to a user who has left"). Fix: create a new token there and point each Worker at it. Replaced in both accounts Nov 26, 2026. |
| `las-cruces-live` build variables | `NOTION_TOKEN`, `BEEHIIV_API_KEY` | Pull acts/venues from Notion and the Thursday lineup from Beehiiv. Without them the build uses the saved JSON (stale). |
| `las-cruces-live-preview` build variables | `NOTION_TOKEN`, `INTAKE_KEY`, `LIVE_PREVIEW`, `PREVIEW_SITE_URL` | Preview build: Review queue, share pages, Approve buttons. |
| `lc-live-intake` secrets | `NOTION_TOKEN`, `INTAKE_KEY`, `LIVE_HOOK`, `PREVIEW_HOOK`, `TURNSTILE_SECRET` | Tally sign-ups, claims, comments, edits, emails. `LIVE_HOOK` / `PREVIEW_HOOK` are the deploy hook IDs below. |
| Deploy hook "Approvals" on `las-cruces-live` | = `LIVE_HOOK` | Rebuilds lascruceslive.com (approvals, claims, scheduled rebuilds). If it's ever recreated, update `LIVE_HOOK` on the intake. |
| Deploy hook "Rebuild preview (intake)" on `las-cruces-live-preview` | = `PREVIEW_HOOK` | Rebuilds the preview. Same rule. |
| Tally form webhook | `?key=INTAKE_KEY` in the URL | Changing `INTAKE_KEY` means updating it in the Tally webhook and the preview build too. |
| `wrangler.jsonc` / `workers/intake/wrangler.jsonc` | `GUEST_EMAIL` binding, KV `PHOTOS`, rate limit | Emails from charlie@ (needs Workers Paid and Email Sending on livelovelascruces.com). |

`NOTION_TOKEN` is in three places: rotating it means updating all three. The GitHub Action uses GitHub's built-in token: nothing to manage.
