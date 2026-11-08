# ACSS workflow: settings in, stylesheet out

ACSS is a WordPress plugin. Our sites are Astro. So a WordPress install acts as the **ACSS control panel**: settings go in, ACSS generates the stylesheet, and the stylesheet is copied into the site. Visitors never touch WordPress.

## The control panel: Barks.co

- **Barks.co** is the control panel: an empty placeholder WordPress site (noindex, no visitors) with **ACSS 4 or newer** installed and licensed. The `wp acss` commands don't exist in ACSS 3.x. It's hosted on a Vultr server managed with **RunCloud**, which has WP-CLI pre-installed.
- Claude Code on Charlie's Mac reaches it over **SSH** and runs `wp acss ...` there. `scripts/acss-sync.sh` does this for you.
- Importing settings restyles Barks.co. That's fine: nobody uses it. **Never use any other live WordPress site as the control panel.** Importing replaces that site's whole design for its visitors.
- Fallback if the server is ever unavailable: a LocalWP install on the Mac with ACSS (set `ACSS_SSH=` empty and `ACSS_WP_PATH` to the local WordPress folder).

### One-time setup (on Charlie's Mac, with Claude Code's help)

1. **Make an SSH key** for this connection (Claude Code can run `ssh-keygen -t ed25519 -f ~/.ssh/barks_acss` and show Charlie the public key).
2. **Add the public key in RunCloud:** Servers → the Barks.co server → SSH Keys → add it for the system user that owns the Barks.co web app (often `runcloud`). Charlie does this step in the RunCloud dashboard.
3. **Find the web app folder.** RunCloud web apps live at `/home/<system user>/webapps/<web app name>`. The name is shown in RunCloud's Web Applications list.
4. **Create the SSH alias** in `~/.ssh/config`:
   ```
   Host barks-acss
     HostName <server IP from RunCloud or Vultr>
     User <system user>
     IdentityFile ~/.ssh/barks_acss
   ```
5. **Create `~/.lllc-acss`** (shared by all three site repos):
   ```bash
   ACSS_SSH=barks-acss
   ACSS_WP_PATH=/home/<system user>/webapps/<web app name>
   ```
6. **Test:** `scripts/acss-sync.sh --status` should say "Connected. ACSS is responding."

**Never commit** the server IP, user, key or these two files. Two of the site repos are public.

If `wp` isn't found over SSH, find its location on the server (`which wp` in a RunCloud SSH session) and use the full path in the script, then note it here.

If the test says `'acss' is not a registered wp command`, the SSH connection is fine but ACSS is older than version 4. Update the plugin on the control panel, then run the test again. WordPress may not offer the update on its own; the plugin can be installed from the ACSS account.

## Files in each site repo

| File | What it is |
|---|---|
| `acss/settings.json` | This site's ACSS settings. **The source of truth.** Committed. |
| `src/styles/acss/*.css` | The generated stylesheet(s). Committed. Never edit by hand: regenerate. |
| `src/styles/acss-bridge.css` | Small file of our own: legacy token aliases during migration, plus any proven gaps (see widths note). |
| `scripts/acss-sync.sh` | Imports the settings, regenerates and copies the CSS. |

## Commands (WP-CLI)

```bash
wp acss status                                   # is ACSS installed and licensed?
wp acss settings export --file=backup.json       # save current settings
wp acss settings import acss/settings.json --yes # replace ALL settings with this file (no automatic backup)
wp acss settings get <key>                       # read one setting
wp acss settings set <key> <value>               # change one setting (regenerates CSS)
wp acss settings list --search=<text>            # find setting names
wp acss css regenerate                           # rebuild the stylesheets
```

Always export a backup before an import. The control panel holds one site's settings at a time, and the repo's `acss/settings.json` is the copy that matters.

## Creating settings from a Paper design

When a site's first design is approved (or its brand changes):

1. Read the approved Paper design: colors, fonts, type sizes, spacing rhythm, radius.
2. Start from `agent-docs/acss/example-json.md` (a complete ACSS settings file) for the structure and key names. **Never invent keys.** If unsure a key exists, check with `wp acss settings list --search=`.
3. Map the design's color roles from `SITE.md` to ACSS roles (primary, secondary, tertiary, accent, base, neutral) and the light/dark background roles. ACSS generates shades from these.
4. Set fonts, base text and heading sizes, spacing base, and radius to match the design.
5. Write `acss/settings.json`, run the sync script, and check the result in the browser before building pages.

Small changes later ("primary a little darker") use `wp acss settings set`, then export back to `acss/settings.json` so the repo stays the source of truth.

## Fonts

Kevin's rules from the video, adopted here:

- **Website fonts are WOFF2 only.** Never add TTF, OTF, WOFF or EOT files or `@font-face` sources for the browser. Agents tend to produce every format; don't. Every current browser supports WOFF2, and it's the smallest.
- **File names and paths all lowercase**, everywhere: the files, the `@font-face` URLs and the ACSS font settings. A case mismatch means the font silently fails to load.

How that applies on our sites:

- **Self-hosted files** go in `public/fonts/`, Latin subset only unless a page needs more, named like `bricolage-grotesque-800.woff2`. ACSS font settings point at `/fonts/<name>.woff2`.
- **`@fontsource-variable/*` packages** (what the sites use now) already serve WOFF2 only. Keep them. Don't switch to the non-variable `@fontsource/*` CSS for the browser: it adds WOFF fallbacks.
- **Exception: share images.** `src/lib/og.js` draws share images with Satori, which can't read WOFF2. It loads `.woff` files from the non-variable `@fontsource/*` packages at build time. Those files never reach visitors, so leave them alone.
- After changing fonts, re-import and regenerate, then confirm the right font actually renders (check computed styles and the network tab: only `.woff2` requests).

## Keeping the stylesheet lean

ACSS can output much more than we use. Before the first export, turn off features and utility-class groups the site doesn't need in the ACSS dashboard (or via `settings set`), and note what was turned off in `SITE.md`. Check the stylesheet size after each regenerate and report it. PageSpeed targets are in [astro.md](astro.md).

## Load order on the site

In the main layout, in this order:

1. `src/styles/reset.css` (in `@layer reset`; see [reset.md](reset.md))
2. `src/styles/acss/*.css` (generated)
3. `src/styles/acss-bridge.css`
4. `src/styles/global.css` (shrinks over time as ACSS takes over)
5. Component `<style>` blocks (Astro scopes these automatically)

## Moving an existing site onto ACSS

Each site's `SITE.md` has its own migration list. The order is always:

1. **Rename colliding tokens first.** Any legacy CSS variable whose name ACSS also uses (`--accent`, `--accent-dark`, `--radius`, anything starting `--primary`, `--secondary`, `--base`, `--neutral`, `--text-`, `--space-`, `--bg-`, `--width-`) gets a site prefix across the whole codebase (`--accent` becomes `--at-accent`). Do this in its own pull request, with no visual change, before ACSS is loaded. Otherwise the old values override ACSS without any error.
2. Add `reset.css`, the generated ACSS files and `acss-bridge.css` to the layout. Alias the remaining legacy tokens to ACSS tokens in the bridge. Check nothing looks broken.
3. Convert one component at a time from legacy tokens and pixel values to ACSS tokens. Delete each alias when nothing uses it.
4. Remove from `global.css` whatever ACSS now handles (heading sizes, buttons, section spacing, links).

## Licensing

Each site using ACSS output counts toward Charlie's ACSS license site count. Don't add ACSS to a new site without checking with him.
