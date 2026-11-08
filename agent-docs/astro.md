# Astro conventions

Replaces Kevin's `etch.md`. Etch decides component architecture for you; Astro doesn't, so these rules make the decisions instead. Follow them so every LLLC site is built the same way and Charlie isn't stuck "in the land of prompting."

## Project shape

```
src/
  layouts/      Layout.astro: head, header, footer, loads the stylesheets
  pages/        one file per route; [slug].astro for listings
  components/   reusable pieces, PascalCase.astro
  lib/          shared JS (site settings, data shaping, dates)
  data/         JSON the pages read (see SITE.md for which files are generated)
  styles/       reset.css, acss/, acss-bridge.css, global.css
scripts/        build-time scripts (Notion sync and so on)
workers/        Cloudflare Workers (intake, preview, live APIs)
public/         static files served as-is
```

Don't invent new top-level folders.

## Components

- **One component per job, reused everywhere.** Before creating a component, check `src/components/` for one that already does it.
- **Variants through props, not copies.** A `SectionIntro` with `layout="stacked" | "split" | "centered"` beats three intro components. Expose the variant as a `data-` attribute on the root element and style it with `.block[data-layout="split"]` (see [css.md](css.md)).
- **Content through props or data.** Never hardcode listing content in a component.
- **Styles live in the component's `<style>` block**, BEM-named, using ACSS tokens. Global CSS is for genuinely global rules only.
- **Small client scripts only.** Ship JavaScript only for real interactivity (filters, menus, maps). No UI frameworks without asking.

## Data

- Listings come from Notion or feeds through `scripts/` at build time, written to `src/data/`. `SITE.md` says which data files are **generated** (never hand-edit) and which are **hand-edited** (safe to change).
- If Notion or a feed can't be reached, the build must stop so the last good version stays live. Don't remove those guards.
- Page and component code reads data through `src/lib/` helpers, not by reaching into JSON shapes all over the place.

## Branches, previews, deploys

- Work on a branch. Push the branch, open a pull request, and give Charlie the preview link if the site has one (see `SITE.md`).
- `main` deploys to the live site automatically on every push (about 1 to 2 minutes).
- Before opening a pull request: `npm run build` must pass locally. Use the offline/no-token mode in `SITE.md` if you don't have the secrets.

## Checking your work

After building a page:

1. Run the dev server and look at it at mobile (375px) and desktop (1280px+) widths. Take screenshots if you can.
2. Compare with the approved Paper design: hierarchy, rhythm and color relationships, not exact pixels.
3. Keyboard-tab through it: visible focus, logical order, nothing unreachable.
4. Check for raw hex colors or pixel spacing you added. Replace them with tokens.

## SEO basics (every page)

- One `h1`. Unique `<title>` and meta description that match the page's promise.
- Canonical URL, share image (`/og/...`), and schema.org data where it applies (Event, LocalBusiness/MusicVenue, Person/MusicGroup, ArtGallery/Museum).
- Descriptive link text. Alt text on every meaningful image.

## Performance targets

After deploy, run PageSpeed Insights (https://pagespeed.web.dev) on the homepage and one listing page:

- Mobile Performance 95+, Accessibility 100, Best Practices 100, SEO 100.
- Images: compressed, correctly sized, lazy-loaded below the fold, with width and height set.
- Report the scores in the pull request. If a change drops a score, fix it before asking to merge.
