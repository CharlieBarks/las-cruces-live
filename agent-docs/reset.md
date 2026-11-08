# CSS reset

Replaces Kevin's `etch-css-reset.md`. Etch ships a reset; Astro doesn't, so each site loads its own: `src/styles/reset.css`. It is adapted from Etch's reset (minus the WordPress and Gutenberg helpers) so Kevin's CSS rules still hold.

## Cascade layer

The whole reset is inside `@layer reset { ... }`.

- **Unlayered CSS always beats layered CSS**, whatever the specificity. ACSS output and our own styles override the reset automatically.
- **Never use `!important` to beat the reset.** Write a normal rule.

## What the reset already handles: don't re-declare

- `box-sizing: border-box` on everything.
- `margin: 0` on everything. **All default margins are gone: add spacing on purpose** (prefer `gap`).
- No text-size inflation on mobile; `scrollbar-gutter: stable`.
- `body` is a flex column, at least full screen height; `main` grows, so the footer sits at the bottom.
- Lists with a class or `role="list"` have no bullets or padding. To keep bullets on a classed list, add the class `list`.
- `img, picture, video, canvas, svg` and standalone links (not inside text) are `display: block; max-inline-size: 100%; height: auto`. Override intentionally if you need inline.
- Form controls inherit fonts. `button` has no background, no border, pointer cursor, `currentColor`.
- `textarea` without `rows` is at least 10em tall.
- Headings and paragraphs break long words instead of overflowing.
- `.screen-reader-text` (visually hidden, reachable by screen readers and on focus).

## Check on first ACSS build

ACSS may include some base styles of its own. On the first build with ACSS, note any overlap here. Keep the reset anyway: being layered, it can't fight ACSS.

## Migrating an existing site

The Art Trail, LC Live and events sites each have a few reset rules at the top of `global.css`. When adding `reset.css`, remove only those duplicated lines from `global.css`, and check nothing visibly changes (especially margins, which the old resets didn't zero everywhere).
