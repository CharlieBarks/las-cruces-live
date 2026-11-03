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

// Section sponsors. One per spot. Leave empty until sold.
// e.g. blues: { name: 'Blue Moon Bar & Grill', url: 'https://www.bluemoonnm.com/', venue: 'blue-moon-bar-and-grill' }
export const SPONSORS = {
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

const live = (r) => !r.siteStatus || r.siteStatus === 'Approved' || process.env.LIVE_PREVIEW === '1';
export const musicians = musiciansRaw.filter((m) => live(m) && m.name).sort((a, b) => a.name.localeCompare(b.name));
export const venues = venuesRaw.filter((v) => live(v) && v.name).sort((a, b) => a.name.localeCompare(b.name));
export const musicianBySlug = (s) => musicians.find((m) => m.slug === s);
export const venueBySlug = (s) => venues.find((v) => v.slug === s);

// ---------- This week (from the latest Thursday issue) ----------
// Badges only show while the issue is current, so the site never advertises last week's shows.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
const daysOld = (Date.parse(today) - Date.parse(thisweekRaw.issueDate || '1970-01-01')) / 864e5;
export const THIS_WEEK_CURRENT = process.env.LIVE_IGNORE_STALE === '1' || daysOld <= 7;
export const thisWeek = THIS_WEEK_CURRENT ? thisweekRaw : { ...thisweekRaw, shows: 0, acts: {}, venues: {} };
export const issueLink = (content) => utm(thisWeek.issueUrl || SITE.liveMusicUrl, content);
export const subscribeLink = (content) => utm(SITE.subscribeUrl, content);

export const isPlaying = (m) => Boolean(thisWeek.acts[m.slug]);
export const playingVenues = (m) => (thisWeek.acts[m.slug] || []).map(venueBySlug).filter(Boolean);
export const venueWeek = (v) => thisWeek.venues[v.slug] || { shows: 0, unlisted: 0, acts: [] };
export const playingActs = musicians.filter(isPlaying);

// ---------- Genres ----------
export const genres = GENRES.map((g) => ({
  slug: g.slug,
  name: g.name,
  acts: musicians.filter((m) => m.genres.includes(g.slug)),
})).filter((g) => g.acts.length);
export const genreBySlug = (s) => genres.find((g) => g.slug === s);
export const genreName = (s) => GENRES.find((g) => g.slug === s)?.name || s;

export const typeLabel = (m) => (m.type === 'Band' ? 'Band' : m.type === 'Solo Artist' ? 'Solo artist' : '');

export function mapsLink(v) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${v.name}, ${v.address}`)}`;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function musicianJsonLd(m) {
  const sameAs = Object.values(m.links).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': m.type === 'Solo Artist' ? 'Person' : 'MusicGroup',
    name: m.name,
    url: `${SITE.url}/musicians/${m.slug}/`,
    ...(m.type !== 'Solo Artist' && m.genres.length ? { genre: m.genres.map(genreName) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(m.type === 'Solo Artist' ? { jobTitle: 'Musician', homeLocation: { '@type': 'Place', name: 'Las Cruces, NM' } } : { foundingLocation: { '@type': 'Place', name: 'Las Cruces, NM' } }),
  };
}

export function venueJsonLd(v) {
  const sameAs = Object.values(v.links).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicVenue',
    name: v.name,
    url: `${SITE.url}/venues/${v.slug}/`,
    ...(v.address ? { address: v.address } : {}),
    ...(v.lat ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}),
    ...(v.phone ? { telephone: v.phone } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
