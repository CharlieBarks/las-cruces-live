// Reads the latest Thursday Live Music issue from Beehiiv and works out which listed
// musicians and venues are in it. Writes src/data/thisweek.json.
//
// The site only shows WHO and WHERE ("Playing this week & next", "6 shows this week").
// The issue covers two weeks (the second is web-only); each show keeps its date so the
// site can say "this week", "next week" or both.
// Days and times stay in the newsletter.
//
// - Needs BEEHIIV_API_KEY (Cloudflare build secret). Without it, the existing file is kept.
// - Run it after musicians/venues are synced (it matches names against them).
// - If Beehiiv fails, the old file is kept and the build carries on; badges simply
//   switch off by themselves once the issue is more than a week old.

import fs from 'node:fs/promises';
import path from 'node:path';
import { matchLineup } from './lib/shape.mjs';

const KEY = process.env.BEEHIIV_API_KEY;
const PUB = 'pub_30ababf5-8907-4822-935d-a896d2c7f1a6';
const TAG = 'live-music';
const DATA_DIR = path.resolve('src/data');

function htmlToLines(html) {
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .join('\n');
}

async function main() {
  if (!KEY) { console.log('sync-lineup: no BEEHIIV_API_KEY, keeping src/data/thisweek.json'); return; }
  const url = `https://api.beehiiv.com/v2/publications/${PUB}/posts?content_tags[]=${TAG}&status=confirmed&platform=both&order_by=publish_date&direction=desc&limit=1&expand[]=free_web_content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) { console.warn(`sync-lineup: Beehiiv said ${res.status}, keeping the old file`); return; }
  const post = (await res.json())?.data?.[0];
  const html = post?.content?.free?.web;
  if (!post || !html) { console.warn('sync-lineup: no Live Music issue found, keeping the old file'); return; }

  // Only read the listings section, not the sponsor blocks above it.
  let text = htmlToLines(html);
  const start = text.search(/live music this week/i);
  if (start > -1) text = text.slice(start);

  const musicians = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'musicians.json'), 'utf8'));
  const venues = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'venues.json'), 'utf8'));
  const issueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date(post.publish_date * 1000));
  const match = matchLineup(text, musicians, venues, issueDate);
  const out = { issueTitle: post.title, issueUrl: post.web_url, issueDate, ...match };
  await fs.writeFile(path.join(DATA_DIR, 'thisweek.json'), JSON.stringify(out, null, 2));
  console.log(`sync-lineup: ${post.title}: ${match.shows} shows, ${Object.keys(match.acts).length} listed acts, ${Object.keys(match.venues).length} listed venues`);
}

main().catch((err) => { console.warn(`sync-lineup: ${err.message}, keeping the old file`); });
