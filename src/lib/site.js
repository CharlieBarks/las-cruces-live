import musiciansRaw from '../data/musicians.json';
import venuesRaw from '../data/venues.json';
import thisweekRaw from '../data/thisweek.json';
import { GENRES } from '../../scripts/lib/shape.mjs';

export const SITE = {
  name: 'Las Cruces Live',
  url: 'https://lascruceslive.com',
  publisher: 'Live Love Las Cruces',
  publisherUrl: 'https://livelovelascruces.com',
  liveMusicUrl: 'https://livelovelascruces.com/live-music',
  subscribeUrl: 'https://livelovelascruces.com/subscribe',
  eventsUrl: 'https://events.livelovelascruces.com/',
  subscribers: '10,000+',
  contactEmail: 'events@livelovelascruces.com',
};

// Every link back to the newsletter is tagged so Beehiiv shows what this site sends.
export function utm(url, content) {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'lascruceslive');
  u.searchParams.set('utm_medium', 'referral');
  u.searchParams.set('utm_campaign', 'directory');
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}

// Outgoing links to an act's or venue's own website, socials, song and booking page. Tagged so
// they can see in their own analytics how many visitors Las Cruces Live sends them (a good
// talking point for sponsors). Email and phone links are left alone.
export function out(url, content) {
  if (!/^https?:\/\//i.test(url || '')) return url;
  try {
    const u = new URL(url);
    if (u.searchParams.has('utm_source')) return url;
    u.searchParams.set('utm_source', 'lascruceslive');
    u.searchParams.set('utm_medium', 'referral');
    u.searchParams.set('utm_campaign', 'profile');
    if (content) u.searchParams.set('utm_content', content);
    return u.toString();
  } catch {
    return url;
  }
}

// Section sponsors. One per spot. Leave empty until sold.
// e.g. blues: { name: 'Blue Moon Bar & Grill', url: 'https://www.bluemoonnm.com/', venue: 'blue-moon-bar-and-grill' }
export const SPONSORS = {
  // Thursday Live Music issue sponsors. Shown front and center on the homepage and the
  // "Playing this week" page, and listed first under "Where they play".
  // name, venue (slug on this site), url (their own site, optional), logo (optional, path under /public)
  liveMusic: [
    { name: 'Madelyn’s Mesilla', venue: 'madelyns-mesilla' },
    { name: 'Rio Grande Winery', venue: 'rio-grande-winery', url: 'https://www.riograndewinery.com/' },
  ],
  home: null,
  map: null,
  genres: {},
  areas: {},
};

export const AREAS = {
  mesilla: { name: 'Old Mesilla', blurb: 'Plaza patios, wine bars and the busiest weekend stages in the valley.' },
  downtown: { name: 'Downtown & Main Street', blurb: 'Coffee-house sets, cantinas and the Rio Grande Theatre, all a short walk apart.' },
  west: { name: 'Picacho & the West Side', blurb: 'Brewery stages and big Saturday-night bands along Picacho Avenue.' },
  east: { name: 'East Side', blurb: 'Brewpubs and sports bars with regular weekend music.' },
  university: { name: 'University & South Espina', blurb: 'NMSU recitals, the Pan Am Center and late-night bars near campus.' },
  north: { name: 'North Valley', blurb: 'Roadhouse music out among the pecan orchards.' },
  south: { name: 'South Valley wine country', blurb: 'Winery afternoons and dance halls down Highway 28.' },
  hatch: { name: 'Hatch', blurb: 'Worth the drive up the river for chile and a Saturday set.' },
  around: { name: 'Around the valley', blurb: 'Presenters, pop-ups and places that move around.' },
};

export const PREVIEW = process.env.LIVE_PREVIEW === '1';
// The private preview site: Approve buttons, the Review queue and private edit links
export const PREVIEW_URL = 'https://las-cruces-live-preview.cf2-99b.workers.dev';
export const INTAKE_URL = 'https://lc-live-intake.cf2-99b.workers.dev';
export const FORM_URL = 'https://tally.so/r/RWdbxl';
export const TURNSTILE_SITEKEY = '0x4AAAAAAF3l-lKGwLZNR-iU';

const live = (r) => !r.siteStatus || r.siteStatus === 'Approved' || process.env.LIVE_PREVIEW === '1';
// Local acts first, then regional, then touring; A to Z within each
const BASE_RANK = { regional: 1, touring: 2 };
export const musicians = musiciansRaw.filter((m) => live(m) && m.name)
  .sort((a, b) => (BASE_RANK[a.homeBase] || 0) - (BASE_RANK[b.homeBase] || 0) || a.name.localeCompare(b.name));
export const venues = venuesRaw.filter((v) => live(v) && v.name).sort((a, b) => a.name.localeCompare(b.name));
// Featured venues: Listing Tier "Featured" in Notion, or on the Live Music sponsor list (SPONSORS.liveMusic).
// Listed first with a gold highlight, a "Featured venue" badge on their page, a halo and name label on the map.
export const isFeaturedVenue = (v) => ['featured', 'sponsor'].includes((v?.tier || '').toLowerCase()) || (SPONSORS.liveMusic || []).some((s) => s.venue === v?.slug);
// Newsletter sponsors (SPONSORS.liveMusic): "Proud sponsor of Live Love Las Cruces" on their page
export const isSponsorVenue = (v) => (SPONSORS.liveMusic || []).some((s) => s.venue === v?.slug);
export const featuredVenueFirst = (list) => [...list].sort((a, b) => Number(isFeaturedVenue(b)) - Number(isFeaturedVenue(a)));
export const musicianBySlug = (s) => musicians.find((m) => m.slug === s);
export const venueBySlug = (s) => venues.find((v) => v.slug === s);

// ---------- This week & next (from the latest Thursday issue) ----------
// The issue covers two weeks, Thursday to Wednesday: the first in the email, the second
// web-only. Each show carries its date, so the site can say "this week", "next week" or both.
// On the site, weeks count from the day of the build, not the issue date: "this week" is
// the next 7 days and "next week" the 7 after, so a Tuesday visitor doesn't see this
// Thursday's shows called "next week". The site rebuilds daily, and past shows drop off.
// Old snapshots without dates count as this week. Everything switches off two weeks out,
// so the site never advertises old shows.
const DAY = 864e5;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
const daysOld = (Date.parse(today) - Date.parse(thisweekRaw.issueDate || '1970-01-01')) / DAY;
export const THIS_WEEK_CURRENT = process.env.LIVE_IGNORE_STALE === '1' || daysOld < (thisweekRaw.list ? 14 : 8);
const weekStart = process.env.LIVE_IGNORE_STALE === '1'
  ? Date.parse(thisweekRaw.issueDate || '1970-01-01') + Math.max(0, Math.floor(daysOld / 7)) * 7 * DAY
  : Date.parse(today);
const weekOf = (date) => {
  if (!date) return 0;
  if (Date.parse(date) < Date.parse(today) && process.env.LIVE_IGNORE_STALE !== '1') return -1;
  const d = Math.floor((Date.parse(date) - weekStart) / DAY);
  return d < 0 ? -1 : d < 7 ? 0 : d < 14 ? 1 : -1;
};
function buildWeek() {
  if (!THIS_WEEK_CURRENT) return { ...thisweekRaw, shows: 0, acts: {}, venues: {}, weeks: [] };
  if (!thisweekRaw.list) {
    const acts = Object.fromEntries(Object.entries(thisweekRaw.acts).map(([k, v]) => [k, { venues: v, weeks: [0] }]));
    const venues = Object.fromEntries(Object.entries(thisweekRaw.venues).map(([k, v]) => [k, { ...v, weeks: [0] }]));
    return { ...thisweekRaw, acts, venues, weeks: thisweekRaw.shows ? [0] : [] };
  }
  const acts = {};
  const venues = {};
  const weeks = new Set();
  let shows = 0;
  for (const s of thisweekRaw.list) {
    const w = weekOf(s.date);
    if (w < 0) continue;
    shows += 1;
    weeks.add(w);
    for (const a of s.acts) {
      acts[a] ||= { venues: [], weeks: [] };
      if (s.venue && !acts[a].venues.includes(s.venue)) acts[a].venues.push(s.venue);
      if (!acts[a].weeks.includes(w)) acts[a].weeks.push(w);
    }
    if (s.venue) {
      const v = (venues[s.venue] ||= { shows: 0, unlisted: 0, acts: [], others: [], weeks: [], byWeek: [{ acts: [], others: [] }, { acts: [], others: [] }] });
      v.shows += 1;
      if (!s.acts.length) v.unlisted += 1;
      // Performers without a page here, by the name printed in the issue
      if (!s.acts.length && s.name && !v.others.some((n) => n.toLowerCase() === s.name.toLowerCase())) v.others.push(s.name);
      // The same, split into this week (0) and next week (1)
      const bw = v.byWeek[w];
      for (const a of s.acts) if (!bw.acts.includes(a)) bw.acts.push(a);
      if (!s.acts.length && s.name && !bw.others.some((n) => n.toLowerCase() === s.name.toLowerCase())) bw.others.push(s.name);
      for (const a of s.acts) if (!v.acts.includes(a)) v.acts.push(a);
      if (!v.weeks.includes(w)) v.weeks.push(w);
    }
  }
  return { ...thisweekRaw, shows, acts, venues, weeks: [...weeks] };
}
export const thisWeek = buildWeek();
export const issueLink = (content) => utm(thisWeek.issueUrl || SITE.liveMusicUrl, content);
export const subscribeLink = (content) => utm(SITE.subscribeUrl, content);

// "this week", "next week" or "this week and next"
export function whenText(weeks = [], short = false) {
  const a = weeks.includes(0);
  const b = weeks.includes(1);
  if (a && b) return short ? 'this week & next' : 'this week and next';
  if (b) return 'next week';
  return 'this week';
}
export const WHEN = whenText(thisWeek.weeks);
export const groupWhen = (acts, short = false) => whenText([...new Set(acts.flatMap((m) => thisWeek.acts[m.slug]?.weeks || []))], short);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const lineupTitle = (w = WHEN_SHORT) => (w === 'this week' ? "This week's lineup" : w === 'next week' ? "Next week's lineup" : 'This week & next');
export const WHEN_SHORT = whenText(thisWeek.weeks, true);

export const isPlaying = (m) => Boolean(thisWeek.acts[m.slug]);
export const playingVenues = (m) => (thisWeek.acts[m.slug]?.venues || []).map(venueBySlug).filter(Boolean);
export const playingWhen = (m, short = false) => whenText(thisWeek.acts[m.slug]?.weeks, short);
export const playingLabel = (m) => `Playing ${playingWhen(m, true)}`;
export const venueWeek = (v) => thisWeek.venues[v.slug] || { shows: 0, unlisted: 0, acts: [], others: [], weeks: [] };
export const playingActs = musicians.filter(isPlaying);

// Paid spotlight hook: acts with Listing Tier "Premium" in Notion always make the homepage
// lineup, go first and carry a "Featured" label. Nobody is Premium yet, so nothing changes until then.
export const isFeatured = (m) => m.tier === 'premium';
// Cards with no photo are colored by the act's main sound
const POSTER = {
  americana: 'chile', country: 'chile', folk: 'chile', 'singer-songwriter': 'chile',
  blues: 'plum', 'soul-rnb': 'plum', 'funk-disco': 'plum',
  jazz: 'turq',
  'tejano-norteno': 'gold', latin: 'gold',
  pop: 'sea', 'oldies-variety': 'sea',
};
export const posterColor = (m) => POSTER[m.genres[0]] || 'night';

// ---------- Genres ----------
export const genres = GENRES.map((g) => ({
  slug: g.slug,
  name: g.name,
  acts: musicians.filter((m) => m.genres.includes(g.slug)),
})).filter((g) => g.acts.length);
export const genreBySlug = (s) => genres.find((g) => g.slug === s);
export const genreName = (s) => GENRES.find((g) => g.slug === s)?.name || s;

// "Regional act" / "Touring act" for acts not based in Las Cruces; empty for local acts
export const baseLabel = (m) => (m.homeBase === 'regional' ? 'Regional act' : m.homeBase === 'touring' ? 'Touring act' : '');
export const typeLabel = (m) => (m.type === 'Band' ? 'Band' : m.type === 'Solo Artist' ? 'Solo artist' : '');

export function mapsLink(v) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${v.name}, ${v.address}`)}`;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// Schema helpers (Nov 25, 2026): Google wants full image URLs and addresses split into parts.
const absUrl = (u) => (/^https?:/.test(u) ? u : `${SITE.url}${u.startsWith('/') ? '' : '/'}${u}`);
// "402 S Melendres St, Las Cruces, NM 88005" -> street, city, state, ZIP. Anything that doesn't fit
// that shape stays as one line, as before.
function postalAddress(a) {
  const m = String(a).match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\.?\s*(\d{5})?\s*(?:,\s*(?:USA|US|United States))?$/i);
  if (!m) return a;
  return { '@type': 'PostalAddress', streetAddress: m[1].trim(), addressLocality: m[2].trim(), addressRegion: m[3].toUpperCase(),
    ...(m[4] ? { postalCode: m[4] } : {}), addressCountry: 'US' };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE.url}${it.path}` })),
  };
}

export function musicianJsonLd(m) {
  const sameAs = Object.values(m.links).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': m.type === 'Solo Artist' ? 'Person' : 'MusicGroup',
    name: m.name,
    url: `${SITE.url}/musicians/${m.slug}/`,
    ...(m.genres.length ? { genre: m.genres.map(genreName) } : {}),
    ...(m.bio ? { description: m.bio.replace(/\s+/g, ' ').trim().slice(0, 500) } : {}),
    ...(m.photo ? { image: absUrl(m.photo) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(m.type === 'Solo Artist' ? { jobTitle: 'Musician', homeLocation: { '@type': 'Place', name: 'Las Cruces, NM' } } : { foundingLocation: { '@type': 'Place', name: 'Las Cruces, NM' } }),
  };
}

// Venue opening hours. Notion "Hours" holds one line per day, 24-hour clock: "Mon 11:00-21:00" or
// "Tue closed" (days Mon to Sun; a close earlier than the open means past midnight). Unknown days are
// left out. These are the venue's business hours, never show times (those stay in the newsletter).
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
export function parseHours(text = '') {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:(closed)|(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2}))$/i);
    if (!m) continue;
    const day = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
    if (out.some((d) => d.day === day)) continue;
    const t = (h, mi) => `${String(Number(h) % 24).padStart(2, '0')}:${mi}`;
    out.push(m[2] ? { day, closed: true } : { day, open: t(m[3], m[4]), close: t(m[5], m[6]) });
  }
  return out.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
}
// "21:00" -> "9 pm", "11:30" -> "11:30 am", "00:00" -> "midnight", "12:00" -> "noon"
function clock(hm) {
  const [h, mi] = hm.split(':').map(Number);
  if (h === 0 && mi === 0) return 'midnight';
  if (h === 12 && mi === 0) return 'noon';
  return `${h % 12 || 12}${mi ? `:${String(mi).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
// Rows for the venue page, with neighbouring days that share hours folded together: "Mon–Thu", "11 am – 9 pm"
export function hoursRows(text) {
  const days = parseHours(text);
  const rows = [];
  for (const d of days) {
    const when = d.closed ? 'Closed' : `${clock(d.open)} – ${clock(d.close)}`;
    const last = rows[rows.length - 1];
    if (last && last.when === when && DAYS.indexOf(d.day) === DAYS.indexOf(last.to) + 1) last.to = d.day;
    else rows.push({ from: d.day, to: d.day, when });
  }
  return rows.map((r) => ({ days: r.from === r.to ? r.from : `${r.from}–${r.to}`, when: r.when }));
}

export function venueJsonLd(v) {
  const sameAs = Object.values(v.links).filter(Boolean);
  const hours = parseHours(v.hours).filter((d) => !d.closed);
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicVenue',
    name: v.name,
    url: `${SITE.url}/venues/${v.slug}/`,
    ...(v.address ? { address: postalAddress(v.address) } : {}),
    ...(v.photo ? { image: absUrl(v.photo) } : {}),
    ...(v.lat ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}),
    ...(v.phone ? { telephone: v.phone } : {}),
    ...(hours.length ? { openingHoursSpecification: hours.map((d) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${DAY_NAMES[d.day]}`, opens: d.open, closes: d.close })) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

// A song link as an embedded player where the service allows it (Bandcamp needs its own embed code,
// so it stays a "Listen" button).
export function songEmbed(url = '') {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`, height: 0 };
    if (host === 'youtube.com') {
      const v = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1];
      return v ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${v}`, height: 0 } : null;
    }
    if (host === 'open.spotify.com') {
      const m = u.pathname.match(/\/(track|album|artist|playlist|episode)\/(\w+)/);
      return m ? { kind: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' ? 152 : 352 } : null;
    }
    if (host === 'soundcloud.com') return { kind: 'soundcloud', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%230a6f6b&visual=false`, height: 166 };
  } catch {}
  return null;
}
export const songService = (url = '') => (/spotify/.test(url) ? 'Spotify' : /youtu/.test(url) ? 'YouTube' : /soundcloud/.test(url) ? 'SoundCloud' : /bandcamp/.test(url) ? 'Bandcamp' : 'the music');
