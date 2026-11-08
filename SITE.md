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
| Genre sorting rules | `scripts/lib/shape.mjs` | Carefully |

- Builds without `NOTION_TOKEN` / `BEEHIIV_API_KEY` use the saved JSON.
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

- Homepage: not started in Paper.

## Site-specific rules

- No dates or times on the site (see above).
- Never rewrite an act's own description ("Genre" is the sound in their words).
- Email and phone fields in Notion are never read or shown.
- Band members show only under their band; link solo pages when a member also plays solo.
- Act names must match the newsletter's names for the "Playing this week" badges to work.
