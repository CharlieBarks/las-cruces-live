// Shared rules for turning Notion records and the Thursday newsletter into site data.
// Used by sync-notion.mjs and sync-lineup.mjs.

export function slugify(s = '') {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Notion link fields sometimes hold notes after the address ("... *not added to rss.app").
export function cleanUrl(s) {
  if (!s) return '';
  const m = String(s).match(/https?:\/\/[^\s,]+/);
  if (!m) return '';
  return m[0].replace(/[.)]+$/, '').replace(/^http:\/\//, 'https://');
}

// ---------- Genres ----------
// The site groups genres so each page has enough acts to browse.
export const GENRES = [
  { slug: 'americana', name: 'Americana', re: /americana|roots|bluegrass|banjo|mountain folk/ },
  { slug: 'blues', name: 'Blues', re: /blues|boogie/ },
  { slug: 'country', name: 'Country', re: /country|western swing|fiddle/ },
  { slug: 'jazz', name: 'Jazz', re: /jazz|dixieland|songbook|bolero/ },
  { slug: 'rock', name: 'Rock', re: /rock|tribute/ },
  { slug: 'folk', name: 'Folk', re: /folk|bluegrass/ },
  { slug: 'singer-songwriter', name: 'Singer-songwriter & acoustic', re: /songwriter|acoustic|solo guitar|guitar duo|fingerstyle|piano|pianist|cellist/ },
  { slug: 'soul-rnb', name: 'Soul & R&B', re: /soul|r&b|motown/ },
  { slug: 'funk-disco', name: 'Funk, disco & dance', re: /funk|disco|dance/ },
  { slug: 'pop', name: 'Pop', re: /\bpop|top 40|easy-listening/ },
  { slug: 'latin', name: 'Latin & cumbia', re: /latin|cumbia|son jarocho|afro-caribbean|santana|reggae|\bska\b/ },
  { slug: 'tejano-norteno', name: 'Tejano, norteño & Spanish', re: /tejano|norte|regional mexican|tex-mex|spanish(?! black)/ },
  { slug: 'alternative', name: 'Alternative & indie', re: /alternative|indie|alt rock|emo|dreamy|fusion|electronic/ },
  { slug: 'metal-punk', name: 'Metal & punk', re: /metal|punk|goth/ },
  { slug: 'rockabilly', name: 'Rockabilly', re: /rockabilly/ },
  { slug: 'oldies-variety', name: 'Oldies & variety', re: /oldies|variety|70s|80|90s|1970|classics|multi-genre/ },
  { slug: 'hip-hop-dj', name: 'Hip hop & DJs', re: /hip hop|\bdj\b/ },
];

// Notion "Genres (checklist)" options -> site genre.
const CHECKLIST = {
  Americana: 'americana', Blues: 'blues', Country: 'country', Jazz: 'jazz', Rock: 'rock', Folk: 'folk',
  Pop: 'pop', Soul: 'soul-rnb', 'R&B': 'soul-rnb', Funk: 'funk-disco', Latin: 'latin', Cumbia: 'latin',
  Tejano: 'tejano-norteno', 'Norteño': 'tejano-norteno', Spanish: 'tejano-norteno', DJ: 'hip-hop-dj',
  Alternative: 'alternative', 'Hip Hop': 'hip-hop-dj',
};

// Checklist wins when it's filled in; otherwise read the free-text "Genre" field.
export function genresFor(text = '', checklist = []) {
  const out = new Set();
  for (const c of checklist || []) if (CHECKLIST[c]) out.add(CHECKLIST[c]);
  if (!out.size) {
    const t = (text || '').toLowerCase();
    for (const g of GENRES) if (g.re.test(t)) out.add(g.slug);
  }
  return GENRES.map((g) => g.slug).filter((s) => out.has(s));
}

// ---------- Areas ----------
export function areaFor(address = '') {
  const a = address.toLowerCase();
  if (!a) return 'around';
  if (/hatch/.test(a)) return 'hatch';
  if (/mesilla, nm|avenida de mesilla|calle de guadalupe|san albino|calle de alvarez/.test(a)) return 'mesilla';
  if (/main st|melendres/.test(a)) return 'downtown';
  if (/university ave|espina/.test(a)) return 'university';
  if (/telshor|lohman|northrise/.test(a)) return 'east';
  if (/picacho|via campestre|harrelson/.test(a)) return 'west';
  if (/valley dr|el camino real/.test(a)) return 'north';
  if (/nm-28|new mexico 28|la mesa|anthony|canutillo/.test(a)) return 'south';
  return 'around';
}

// ---------- Thursday lineup matching ----------
const words = (s) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/['’]/g, '').replace(/&/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);

const STOP = new Set(['the', 'band', 'and']);
const core = (name) => words(name).filter((w) => !STOP.has(w));

// Is this act name in this text? Handles "Sax Attitude"/"Saxattitude", "Ghetto Blaster"/"Ghetto Blasters".
function actIn(name, text) {
  const c = core(name);
  const joined = c.join('');
  if (joined.length < 3) return false;
  const w = words(text).filter((x) => !STOP.has(x));
  for (let i = 0; i < w.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(w.length, i + 5); j++) {
      acc += w[j];
      if (acc === joined || acc === joined + 's' || acc + 's' === joined) return true;
      if (acc.length > joined.length + 1) break;
    }
  }
  return false;
}

// Venue names in the newsletter are short ("Game 1", "NM Vintage", "Blue Moon").
const VENUE_ALIASES = { 'grounded lounge': 'grounded-cafe', 'sparkys hatch': 'sparkys-burgers-bbq-and-espresso' };
function venueFor(text, venues) {
  const a = words(text).filter((x) => x !== 'the').join(' ');
  if (!a) return null;
  if (VENUE_ALIASES[a]) return venues.find((v) => v.slug === VENUE_ALIASES[a]) || null;
  return venues.find((v) => {
    const b = words(v.name).filter((x) => x !== 'the').join(' ');
    return b && ((a + ' ').startsWith(b + ' ') || (b + ' ').startsWith(a + ' '));
  }) || null;
}

const stripMd = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[=*_]/g, '').trim();

// lines: the issue's text, one show per line ("Act | Venue | time | extras").
export function matchLineup(text, musicians, venues) {
  const shows = [];
  for (const raw of text.split('\n')) {
    if (!raw.includes('|') || raw.trim().startsWith('#')) continue;
    const parts = raw.split('|').map(stripMd);
    if (parts.length < 2 || !parts[0]) continue;
    const venue = venueFor(parts[1], venues);
    const searchText = [parts[0], ...parts.slice(2)].join(' , ');
    const acts = musicians
      .filter((m) => (core(m.name).length ? actIn(m.name, searchText) : stripMd(parts[0]).toLowerCase() === m.name.toLowerCase()))
      .map((m) => m.slug);
    shows.push({ venue: venue?.slug || null, acts });
  }
  const acts = {};
  const venueMap = {};
  for (const s of shows) {
    for (const a of s.acts) {
      acts[a] ||= [];
      if (s.venue && !acts[a].includes(s.venue)) acts[a].push(s.venue);
    }
    if (s.venue) {
      venueMap[s.venue] ||= { shows: 0, unlisted: 0, acts: [] };
      venueMap[s.venue].shows += 1;
      if (!s.acts.length) venueMap[s.venue].unlisted += 1;
      for (const a of s.acts) if (!venueMap[s.venue].acts.includes(a)) venueMap[s.venue].acts.push(a);
    }
  }
  return { shows: shows.length, acts, venues: venueMap };
}
