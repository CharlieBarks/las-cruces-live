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
import crypto from 'node:crypto';
import sharp from 'sharp';
import { slugify, cleanUrl, genresFor, areaFor } from './lib/shape.mjs';

const TOKEN = process.env.NOTION_TOKEN;
const PREVIEW = process.env.LIVE_PREVIEW === '1';
const MUSICIANS_DB = 'b8aa6b26746c4ddf9967e8fd2010d08e';
const CONTACTS_DB = '36454e00081a80b680b1dab51a210a4a';
const VENUES_DB = '59ba83b7e42d4115b54ee3d349c3f697';
const MEMBERS_DB = 'c7d3f6b775f34477851b55a6a6f7dbe0'; // Band Members (shown only under their band)
const PREVIEW_SITE_URL = (process.env.PREVIEW_SITE_URL || '').replace(/\/+$/, '');
const LIVE_SITE_URL = 'https://lascruceslive.com';
const MEDIA_DIR = path.resolve('public/media');
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
const check = (page, name) => Boolean(p(page, name)?.checkbox);
const email = (page, name) => p(page, name)?.email || '';
const date = (page, name) => p(page, name)?.date?.start?.slice(0, 10) || '';
const files = (page, name) => (p(page, name)?.files || []).map((f) => (f.type === 'external' ? f.external.url : f.file?.url)).filter(Boolean);
const dashless = (id) => String(id || '').replace(/-/g, '');

// Every photo is downloaded at build time and resized (phone photos can be 10 MB), so pages load
// fast and never depend on Notion's expiring links. `size` is the longest side in pixels.
async function keepPhoto(src, dest, size = 1600) {
  if (!src) return '';
  try {
    const res = await fetch(src, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = await sharp(Buffer.from(await res.arrayBuffer())).rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    const file = path.join(MEDIA_DIR, `${dest}.jpg`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, out);
    return `/media/${dest}.jpg`;
  } catch (err) {
    console.warn(`sync-notion: couldn't save a photo for ${dest}: ${err.message}`);
    return '';
  }
}

// Booking contact (email or link) -> where the Book button goes
function bookingHref(v = '') {
  const t = v.trim().replace(/^mailto:/i, '');
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return `mailto:${t}?subject=${encodeURIComponent('Booking inquiry (found you on Las Cruces Live)')}`;
  return cleanUrl(t);
}

// What an act changed on their live page, summarized for the Review queue (preview only)
function pendingSummary(raw) {
  if (!raw) return null;
  try {
    const { at, changes = {}, before = {} } = JSON.parse(raw);
    const show = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? ''));
    return {
      at: at || '',
      fields: Object.entries(changes.fields || {}).map(([name, v]) => ({ name, before: show(before[name]).slice(0, 400), after: show(v).slice(0, 400) })).filter((f) => f.before !== f.after),
      photo: 'photo' in changes ? changes.photo || '(removed)' : null,
      gallery: changes.gallery ? changes.gallery.length : null,
      members: changes.members ? changes.members.map((m) => [m.name, m.plays].filter(Boolean).join(' - ')) : null,
    };
  } catch {
    return { at: '', fields: [], unreadable: true };
  }
}

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
  const [mPages, cPages, vPages, bPages] = await Promise.all([
    queryAll(MUSICIANS_DB, mStatus), queryAll(CONTACTS_DB, false), queryAll(VENUES_DB, vStatus),
    queryAll(MEMBERS_DB, false).catch((err) => { console.warn(`sync-notion: couldn't read Band Members (${err.message}). Share the database with the Notion integration.`); return []; }),
  ]);

  // Public links only. Email and phone in the contact list are never read.
  const contacts = new Map(cPages.map((c) => [c.id.replace(/-/g, ''), {
    website: cleanUrl(text(c, 'Website')), facebook: cleanUrl(text(c, 'Facebook')),
    instagram: cleanUrl(text(c, 'Instagram')), youtube: cleanUrl(text(c, 'Youtube')),
  }]));

  const idToSlug = new Map();
  const musicians = [];
  for (const m of mPages) {
    const name = text(m, "Musician's Name");
    if (!name) continue;
    const id = dashless(m.id);
    const slug = slugify(name);
    idToSlug.set(id, slug);
    const c = rel(m, 'Contact').map((cid) => contacts.get(cid)).find(Boolean) || {};
    let youtube = cleanUrl(text(m, 'YouTube')) || c.youtube || '';
    let website = cleanUrl(text(m, 'Website')) || c.website || '';
    if (youtube && !/youtube\.com|youtu\.be/.test(youtube)) { website ||= youtube; youtube = ''; }
    // Photos show only with permission (ticked on the form, in the editor or in Notion)
    const photosOk = check(m, 'Image Permission');
    const captions = text(m, 'Photo Captions').split('\n');
    const photo = photosOk ? await keepPhoto(files(m, 'Photo')[0], `${slug}/photo`, 1800) : '';
    const thumb = photo ? await keepPhoto(files(m, 'Photo')[0], `${slug}/thumb`, 240) : '';
    const gallery = [];
    if (photosOk) {
      for (const [i, src] of files(m, 'Gallery').slice(0, 8).entries()) {
        const kept = await keepPhoto(src, `${slug}/gallery-${i + 1}`);
        if (kept) gallery.push({ src: kept, caption: (captions[i] || '').trim() });
      }
    }
    const status = (mStatus && text(m, 'Site Status')) || 'Approved';
    musicians.push({
      name, slug, notionId: id,
      type: text(m, 'Type'),
      sound: text(m, 'Genre'),
      genres: genresFor(text(m, 'Genre'), multi(m, 'Genres (checklist)')),
      bio: text(m, 'Bio'),
      photo, thumb, photoCredit: photo ? text(m, 'Photo Credit') : '',
      gallery,
      song: cleanUrl(text(m, 'Song Link')),
      booking: bookingHref(text(m, 'Booking Link')),
      links: {
        website,
        facebook: cleanUrl(text(m, 'Facebook')) || c.facebook || '',
        instagram: cleanUrl(text(m, 'Instagram')) || c.instagram || '',
        youtube,
      },
      _photosOk: photosOk, _members: rel(m, 'Members'), _memberOf: rel(m, 'Member Of'), _bandMembers: rel(m, 'Band Members'),
      tier: (text(m, 'Listing Tier') || 'Free').toLowerCase(),
      siteStatus: status,
      ...(PREVIEW ? {
        // Preview site only: the Review queue, Approve buttons and private edit links
        shareToken: text(m, 'Share Token'), savedShareToken: text(m, 'Share Token'), savedShareLink: text(m, 'Share Link'),
        savedPreviewLink: text(m, 'Preview Link'), savedLiveLink: text(m, 'Live Link'),
        fromForm: Boolean(date(m, 'Submitted On')), submittedOn: date(m, 'Submitted On'),
        submitter: [text(m, 'Submitter Name'), email(m, 'Submitter Email')].filter(Boolean).join(' · '),
        formNotes: text(m, 'Form Notes'), claimRequest: text(m, 'Claim Request'),
        claimed: Boolean(email(m, 'Owner Email')), ownerEmail: email(m, 'Owner Email'),
        pendingEdits: pendingSummary(text(m, 'Pending Edits')),
        hasPhotoWithoutPermission: !photosOk && (files(m, 'Photo').length > 0 || files(m, 'Gallery').length > 0),
      } : {}),
    });
  }

  // Band members: shown only under their band. A member who also plays solo links to that page.
  const membersByBand = new Map();
  const alsoIn = new Map();
  for (const b of bPages) {
    if (check(b, 'Hidden')) continue;
    const name = text(b, 'Name');
    const band = rel(b, 'Band')[0];
    if (!name || !band) continue;
    const solo = rel(b, 'Solo Page')[0];
    const bandSlug = idToSlug.get(band);
    const soloSlug = idToSlug.get(solo) || '';
    const list = membersByBand.get(band) || [];
    list.push({ _id: dashless(b.id), _src: files(b, 'Photo')[0], name, plays: text(b, 'Plays'), bio: text(b, 'Bio'), solo: soloSlug, order: num(b, 'Order') ?? 99 });
    membersByBand.set(band, list);
    if (soloSlug && bandSlug) alsoIn.set(soloSlug, [...new Set([...(alsoIn.get(soloSlug) || []), bandSlug])]);
  }
  for (const m of musicians) {
    const list = (membersByBand.get(m.notionId) || []).sort((a, b) => a.order - b.order);
    const photosOk = m._photosOk;
    m.bandMembers = [];
    for (const x of list) {
      m.bandMembers.push({ name: x.name, plays: x.plays, bio: x.bio, solo: x.solo, photo: photosOk ? await keepPhoto(x._src, `${m.slug}/member-${x._id}`, 400) : '' });
    }
    // Older links (Members / Member Of between two musician records) still work
    m.members = m._members.map((id) => idToSlug.get(id)).filter(Boolean);
    m.memberOf = [...new Set([...m._memberOf.map((id) => idToSlug.get(id)).filter(Boolean), ...(alsoIn.get(m.slug) || [])])];
    delete m._members; delete m._memberOf; delete m._bandMembers; delete m._photosOk;
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
  // Private share links (preview site only): every act not yet approved gets a secret token so
  // Charlie can send them their page to check and edit before it goes live. Acts that came in
  // through the form or claimed their page keep the link after approval: it's their edit link.
  if (PREVIEW) {
    for (const m of musicians) {
      if (m.siteStatus === 'Approved' && !m.fromForm && !m.claimed && !m.shareToken) continue;
      if (!m.shareToken) m.shareToken = crypto.randomBytes(12).toString('base64url');
    }
    if (PREVIEW_SITE_URL) await writePreviewLinks(musicians);
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'musicians.json'), JSON.stringify(musicians, null, 2));
  await fs.writeFile(path.join(DATA_DIR, 'venues.json'), JSON.stringify(venues, null, 2));
  console.log(`sync-notion: ${musicians.length} musicians, ${venues.length} venues (${venues.filter((v) => v.lat).length} on the map)`);
}

// Puts each act's preview address (and share link, and Live Link once approved) into Notion so
// Charlie can click straight to it and Grok Bot knows when to send the "you're live" email.
// Only touches records whose links changed. Problems here never stop the build.
async function writePreviewLinks(musicians) {
  let done = 0;
  for (const m of musicians) {
    const previewLink = `${PREVIEW_SITE_URL}/musicians/${m.slug}/`;
    const shareLink = m.shareToken ? `${PREVIEW_SITE_URL}/share/${m.shareToken}/` : '';
    const liveLink = m.siteStatus === 'Approved' && m.fromForm ? `${LIVE_SITE_URL}/musicians/${m.slug}/` : '';
    const properties = {};
    if (m.savedPreviewLink !== previewLink) properties['Preview Link'] = { url: previewLink };
    if (m.shareToken && (m.shareToken !== m.savedShareToken || m.savedShareLink !== shareLink)) {
      properties['Share Token'] = { rich_text: [{ text: { content: m.shareToken } }] };
      properties['Share Link'] = { url: shareLink };
    }
    if (liveLink && m.savedLiveLink !== liveLink) properties['Live Link'] = { url: liveLink };
    if (!Object.keys(properties).length) continue;
    try {
      await notion(`pages/${m.notionId}`, { properties }, 'PATCH');
      done++;
    } catch (err) {
      console.warn(`  ! Couldn't write links for ${m.name}: ${err.message}`);
    }
  }
  console.log(`sync-notion: updated links on ${done} Notion record${done === 1 ? '' : 's'}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
