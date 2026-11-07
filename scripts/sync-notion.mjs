// Pulls musicians and venues from Notion and writes src/data/musicians.json and venues.json.
// Runs before every build (see "build" in package.json).
//
// - Needs NOTION_TOKEN (Cloudflare > Worker > Settings > Build > Variables and secrets).
//   Without it, the build uses the JSON already in src/data/ (handy for local work).
// - Site Status: once that field exists in a database, only "Approved" records go live
//   (the preview build, LIVE_PREVIEW=1, also shows "Submitted" and "In Review").
//   Until the field is added, every named record shows.
// - Private contact info (email, phone) in the Musician Contact List is never read.
// - Venues missing Latitude/Longitude are looked up from their address (US Census geocoder)
//   and, if the fields exist, saved back to Notion so it only happens once.
// - If Notion can't be reached or returns too little, the build stops on purpose,
//   so Cloudflare keeps the last good version of the site online.

import fs from 'node:fs/promises';
import path from 'node:path';
import { slugify, cleanUrl, genresFor, areaFor } from './lib/shape.mjs';

const TOKEN = process.env.NOTION_TOKEN;
const PREVIEW = process.env.LIVE_PREVIEW === '1';
const MUSICIANS_DB = 'b8aa6b26746c4ddf9967e8fd2010d08e';
const CONTACTS_DB = '36454e00081a80b680b1dab51a210a4a';
const VENUES_DB = '59ba83b7e42d4115b54ee3d349c3f697';
const SHOW = PREVIEW ? ['Approved', 'Submitted', 'In Review'] : ['Approved'];
const MIN_MUSICIANS = 20; // safety net: never publish a nearly empty site
const DATA_DIR = path.resolve('src/data');

async function notion(pathname, body, method) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${pathname}`, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, attempt * 1500)); continue; }
    if (!res.ok) throw new Error(`Notion ${res.status} on ${pathname}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Notion kept failing on ${pathname}`);
}

async function queryAll(databaseId, useStatus) {
  // Blank Site Status counts as live: the 179 acts listed before Site Status existed never had one.
  const filter = useStatus ? { or: [...SHOW.map((s) => ({ property: 'Site Status', select: { equals: s } })), { property: 'Site Status', select: { is_empty: true } }] } : undefined;
  const pages = [];
  let cursor;
  do {
    const data = await notion(`databases/${databaseId}/query`, { ...(filter ? { filter } : {}), start_cursor: cursor, page_size: 100 });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const hasProp = async (db, name) => Boolean((await notion(`databases/${db}`)).properties[name]);
const p = (page, name) => page.properties[name];
const text = (page, name) => {
  const x = p(page, name);
  if (!x) return '';
  if (x.type === 'title') return x.title.map((t) => t.plain_text).join('').trim();
  if (x.type === 'rich_text') return x.rich_text.map((t) => t.plain_text).join('').trim();
  if (x.type === 'url') return x.url || '';
  if (x.type === 'phone_number') return x.phone_number || '';
  if (x.type === 'select') return x.select?.name || '';
  if (x.type === 'number') return x.number ?? '';
  return '';
};
const multi = (page, name) => p(page, name)?.multi_select?.map((o) => o.name) || [];
const rel = (page, name) => p(page, name)?.relation?.map((r) => r.id.replace(/-/g, '')) || [];
const num = (page, name) => (typeof p(page, name)?.number === 'number' ? p(page, name).number : null);

// The Census lookup is picky about Mesilla and highway addresses, so try a few spellings.
async function geocode(address) {
  const variants = [
    address,
    address.replace(/\bNM-28\b|New Mexico 28/i, 'State Highway 28'),
    address.replace(/,\s*Mesilla,\s*NM/i, ', Las Cruces, NM'),
    address.replace(/\s*#\s*\w+|\s*Suite\s*#?\s*\w+/i, ''),
    address.replace(/\s*\d{5}\s*$/, ''),
  ];
  for (const a of [...new Set(variants)]) {
    const hit = await geocodeOnce(a);
    if (hit) return hit;
  }
  return null;
}

async function geocodeOnce(address) {
  const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  try {
    const res = await fetch(u);
    if (!res.ok) return null;
    const hit = (await res.json())?.result?.addressMatches?.[0]?.coordinates;
    return hit ? { lat: Number(hit.y.toFixed(6)), lng: Number(hit.x.toFixed(6)) } : null;
  } catch { return null; }
}

async function main() {
  if (!TOKEN) {
    // No Notion access: keep the saved data, but still put venues on the map.
    const file = path.join(DATA_DIR, 'venues.json');
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    let placed = 0;
    for (const v of saved) {
      if ((v.lat && v.lng) || !v.address) continue;
      const g = await geocode(v.address);
      if (g) { v.lat = g.lat; v.lng = g.lng; placed++; }
    }
    await fs.writeFile(file, JSON.stringify(saved, null, 2));
    console.log(`sync-notion: no NOTION_TOKEN, using the data already in src/data/ (placed ${placed} venues on the map)`);
    return;
  }
  const [mStatus, vStatus, vLat] = await Promise.all([
    hasProp(MUSICIANS_DB, 'Site Status'), hasProp(VENUES_DB, 'Site Status'), hasProp(VENUES_DB, 'Latitude'),
  ]);
  const [mPages, cPages, vPages] = await Promise.all([
    queryAll(MUSICIANS_DB, mStatus), queryAll(CONTACTS_DB, false), queryAll(VENUES_DB, vStatus),
  ]);

  // Public links only. Email and phone in the contact list are never read.
  const contacts = new Map(cPages.map((c) => [c.id.replace(/-/g, ''), {
    website: cleanUrl(text(c, 'Website')), facebook: cleanUrl(text(c, 'Facebook')),
    instagram: cleanUrl(text(c, 'Instagram')), youtube: cleanUrl(text(c, 'Youtube')),
  }]));

  const idToSlug = new Map();
  const musicians = mPages.map((m) => {
    const name = text(m, "Musician's Name");
    const id = m.id.replace(/-/g, '');
    const slug = slugify(name);
    idToSlug.set(id, slug);
    const c = rel(m, 'Contact').map((cid) => contacts.get(cid)).find(Boolean) || {};
    let youtube = c.youtube || '';
    let website = cleanUrl(text(m, 'Website')) || c.website || '';
    if (youtube && !/youtube\.com|youtu\.be/.test(youtube)) { website ||= youtube; youtube = ''; }
    return {
      name, slug, notionId: id,
      type: text(m, 'Type'),
      sound: text(m, 'Genre'),
      genres: genresFor(text(m, 'Genre'), multi(m, 'Genres (checklist)')),
      links: {
        website,
        facebook: cleanUrl(text(m, 'Facebook')) || c.facebook || '',
        instagram: cleanUrl(text(m, 'Instagram')) || c.instagram || '',
        youtube,
      },
      _members: rel(m, 'Members'), _memberOf: rel(m, 'Member Of'),
      tier: (text(m, 'Listing Tier') || 'Free').toLowerCase(),
      siteStatus: (mStatus && text(m, 'Site Status')) || 'Approved',
    };
  }).filter((m) => m.name);
  for (const m of musicians) {
    m.members = m._members.map((id) => idToSlug.get(id)).filter(Boolean);
    m.memberOf = m._memberOf.map((id) => idToSlug.get(id)).filter(Boolean);
    delete m._members; delete m._memberOf;
  }

  const venues = [];
  for (const v of vPages) {
    const name = text(v, 'Name');
    if (!name) continue;
    const address = text(v, 'Address');
    let lat = vLat ? num(v, 'Latitude') : null;
    let lng = vLat ? num(v, 'Longitude') : null;
    if ((!lat || !lng) && address) {
      const g = await geocode(address);
      if (g) {
        ({ lat, lng } = g);
        if (vLat) await notion(`pages/${v.id}`, { properties: { Latitude: { number: lat }, Longitude: { number: lng } } }, 'PATCH').catch(() => {});
      } else console.warn(`sync-notion: couldn't place ${name} (${address}) on the map`);
    }
    venues.push({
      name, slug: slugify(name), notionId: v.id.replace(/-/g, ''),
      address, area: areaFor(address), phone: text(v, 'Phone'),
      links: { website: cleanUrl(text(v, 'Website Link')), facebook: cleanUrl(text(v, 'Facebook Link')), instagram: cleanUrl(text(v, 'Instagram Link')) },
      lat, lng,
      tier: (text(v, 'Listing Tier') || 'Free').toLowerCase(),
      siteStatus: (vStatus && text(v, 'Site Status')) || 'Approved',
    });
  }

  if (musicians.length < MIN_MUSICIANS) {
    throw new Error(`Only ${musicians.length} musicians came back from Notion (minimum ${MIN_MUSICIANS}). Stopping so the current site stays up.`);
  }
  // Two records with the same name would collide on one page address.
  for (const list of [musicians, venues]) {
    const seen = new Map();
    for (const r of list) {
      const n = (seen.get(r.slug) || 0) + 1;
      seen.set(r.slug, n);
      if (n > 1) r.slug = `${r.slug}-${n}`;
    }
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'musicians.json'), JSON.stringify(musicians, null, 2));
  await fs.writeFile(path.join(DATA_DIR, 'venues.json'), JSON.stringify(venues, null, 2));
  console.log(`sync-notion: ${musicians.length} musicians, ${venues.length} venues (${venues.filter((v) => v.lat).length} on the map)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
