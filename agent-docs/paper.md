# Designing in Paper

Paper (https://paper.design) is a design canvas built on HTML and CSS. The agent designs in it through Paper's MCP; Charlie reviews, comments and approves there. Design happens here, before any code, because iterating on a design is cheap and iterating on code is not.

## Setup check

Before designing, confirm the Paper MCP is connected (list its tools). If it isn't, stop and tell Charlie: the Paper desktop app must be open and the MCP enabled in Claude Code.

## One Paper file per site

- File name: the site name ("Las Cruces Art Trail", "Las Cruces Live", "Las Cruces Events").
- One artboard per page, named after the route: `home`, `musicians/[slug]`, `event/[slug]`.
- Design **desktop and mobile** for every page. Mobile is where most visitors are.
- Existing pages: use Paper Snapshot to bring the live page into the canvas as a starting point instead of redrawing it.

## Design so it maps to ACSS

The design must translate into ACSS tokens, not pixel values. While designing:

- **Spacing:** stick to a consistent scale (the 4pt base in [design.md](design.md)). Every gap should map to one of ACSS `--space-xs` to `--space-xxl` or a section space.
- **Type:** a real scale with clear steps (h1 to h4, body, small). About three sizes per section; avoid many near-identical sizes.
- **Color:** use the site's named roles from `SITE.md` (primary, secondary, accent, base, neutral, backgrounds). No one-off colors.
- **Radius and borders:** a single radius scale.
- **Fonts:** only fonts the site can self-host as WOFF2 (rules in [acss-workflow.md](acss-workflow.md#fonts)).
- **Real content:** use real listing data from `src/data/` or Notion, not lorem ipsum. Real names expose real layout problems (long band names, missing photos).

## Brand rules apply

Run every design through [design.md](design.md) (the AI slop test and absolute bans) and [brand-voice.md](brand-voice.md). Designs carry the voice too: headlines and CTAs should be real copy.

## Iterating

- Charlie leaves comments on the canvas ("add a photo here", "this feels cramped"). When asked to "check the comments", read them, make each change, and reply to or resolve each comment.
- Offer 2 or 3 directions only when Charlie asks for options. Otherwise make one strong, committed design.
- Paper can generate images. Generated images are fine for decoration and placeholders; never present a generated image as a real local person, place or event.

## Approval gate

A page isn't approved until Charlie says so. When he approves:

1. Note the approval and date in `SITE.md` under "Design status".
2. If it's the first approved design for the site (or the brand changed), generate the ACSS settings from it: [acss-workflow.md](acss-workflow.md).
3. Then build it: [astro.md](astro.md).

## Handing designs to code

Paper can export code, but **don't paste Paper's exported CSS into the site.** Read the design for structure, hierarchy and relationships, then rebuild it with Astro components, BEM classes and ACSS tokens. Semblance over pixel-perfection (see [acss.md](acss.md)): nearest token, not exact pixels.
