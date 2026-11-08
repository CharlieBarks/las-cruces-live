# Live Love Las Cruces: Agent Guide

Entry point for any AI agent (Claude Code, Cursor, Codex) working on a Live Love Las Cruces website.
This file is the same in every LLLC site repo. What's specific to this site lives in [SITE.md](SITE.md). Read both before doing anything.

Adapted from Kevin Geary's free training files ([gearyco-agentic-web-design](https://github.com/kevingeary/gearyco-agentic-web-design), MIT, and [gearyco-agentic-toolkit-for-etch](https://github.com/kevingeary/gearyco-agentic-toolkit-for-etch)), rebuilt for Astro on Cloudflare instead of Etch. See [CREDITS.md](CREDITS.md).

## The LLLC sites

| Site | Repo | What it is |
|---|---|---|
| Las Cruces Art Trail | `CharlieBarks/art-trail` | Galleries, museums and artists of Las Cruces and Mesilla |
| Las Cruces Live | `CharlieBarks/las-cruces-live` | Local musicians, bands and the venues that host them |
| Las Cruces Events | `CharlieBarks/lc-events-calendar` | The community events calendar (replacing CitySpark) |

All three are Astro, hosted on Cloudflare, deploy on every push to `main`, and share the same listing system: Notion or feeds as the source, private edit links, a Review queue, and Trusted Editors.

## Stack

- **Paper** (https://paper.design): design, connected through its MCP. Design before code.
- **Automatic.css (ACSS)**: design system and CSS framework. Configured in a WordPress "control panel" install and exported to each site. See [agent-docs/acss-workflow.md](agent-docs/acss-workflow.md).
- **Astro**: site framework. See [agent-docs/astro.md](agent-docs/astro.md).
- **Cloudflare**: hosting, Workers, KV, D1.
- **Notion**: where listings are edited.

## Workflow

Work in this order. Don't skip ahead.

1. **Discovery** (new sites or big new sections only): [agent-docs/discovery.md](agent-docs/discovery.md). Brief goes in `discovery/brief.md`.
2. **Content model**: before building a page, propose what is *content* (Notion/data) and what is a *component*. Rule: if it repeats, is reused across pages, or is edited by someone who isn't building the site, it's content. One-off marketing copy is a component prop. Wait for Charlie to approve.
3. **Design in Paper**: [agent-docs/paper.md](agent-docs/paper.md). Homepage first. Wait for approval.
4. **ACSS settings from the design**: [agent-docs/acss-workflow.md](agent-docs/acss-workflow.md).
5. **Build one page, then stop.** Build the layout and the approved page, then ask Charlie to check before building the rest.
6. **Remaining pages**: design in Paper, approve, build. Reuse components and their variants.
7. **SEO and performance pass**: titles, meta descriptions, schema, share images, PageSpeed (targets in [agent-docs/astro.md](agent-docs/astro.md)).

Small fixes and content changes skip steps 1 to 4.

## Hard rules

- **Never break what works.** These sites are live. The claim/edit/trust system, Notion sync, Workers, analytics, feeds and preview sites must keep working after every change. If a change touches them, say so before making it.
- **Work on a branch, not `main`.** Pushing to `main` publishes to the live site. Open a pull request and let Charlie merge.
- **Smallest change that does the job.** Don't refactor what you weren't asked to touch.
- **Never delete content or files** unless Charlie explicitly asks.
- **Never commit secrets.** Tokens live in Cloudflare build settings and Worker secrets.
- **No Tailwind, no new CSS frameworks, no new dependencies** without asking.
- **One site at a time.** Don't copy class names, copy or design choices from another LLLC site unless asked. Shared rules live here; site choices live in `SITE.md`.
- **Plain-language summaries.** Charlie is not a developer. When you finish, say what changed and what he should check, in a few lines. No code walkthroughs unless he asks.

## Context docs: read when relevant

| Doing this | Read |
|---|---|
| Any copy (headlines, page text, CTAs, meta) | [agent-docs/brand-voice.md](agent-docs/brand-voice.md), then [agent-docs/copywriting.md](agent-docs/copywriting.md) |
| Any visual design or review | [agent-docs/design.md](agent-docs/design.md) |
| Designing in Paper | [agent-docs/paper.md](agent-docs/paper.md) |
| Any markup | [agent-docs/html.md](agent-docs/html.md) |
| Any CSS | [agent-docs/acss.md](agent-docs/acss.md) and the matching file in `agent-docs/acss/`, then [agent-docs/css.md](agent-docs/css.md) and [agent-docs/reset.md](agent-docs/reset.md) |
| ACSS settings, regenerating, fonts | [agent-docs/acss-workflow.md](agent-docs/acss-workflow.md) |
| Components, pages, data, builds, deploys | [agent-docs/astro.md](agent-docs/astro.md) |
| New site or major section | [agent-docs/discovery.md](agent-docs/discovery.md) |

## Keep improving these files

When Charlie corrects you, or you learn something that would have saved time (a gotcha, a naming rule, a setting), add it to the right doc in the same pull request. Shared lessons go in `agent-docs/`; site-specific ones go in `SITE.md`. Tell Charlie which file you updated, so he can copy shared changes to the other two sites.
