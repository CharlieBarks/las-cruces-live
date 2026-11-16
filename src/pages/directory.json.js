// /directory.json: the acts and venues on this site, for the Las Cruces Events calendar
// (events.livelovelascruces.com). The calendar reads it at build time to show an act's genres
// next to its shows and to link to their page here. Names and links only: no dates, no times,
// nothing that isn't already public on the site.
import { SITE, musicians, venues, genreName } from '../lib/site.js';

export function GET() {
  const body = {
    site: SITE.url,
    musicians: musicians.map((m) => ({
      name: m.name,
      url: `${SITE.url}/musicians/${m.slug}/`,
      genres: m.genres.map(genreName),
    })),
    venues: venues.map((v) => ({ name: v.name, url: `${SITE.url}/venues/${v.slug}/` })),
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
