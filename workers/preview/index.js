// Runs in front of the private preview site (las-cruces-live-preview.cf2-99b.workers.dev).
// Everything is served straight from the built files, except /api/*:
//   POST /api/status   Approve / Hide buttons
//   POST /api/owner    Claim this page: send / turn off edit link, dismiss a claim, undo, change log
//   GET  /api/listing  visual editor: load a listing fresh from Notion
//   POST /api/listing  visual editor: save changes
//   POST /api/photo    visual editor: upload a photo
// Each request must carry Charlie's Cloudflare Access login; it is checked here, then passed to
// the intake Worker's Admin entrypoint, which talks to Notion and rebuilds the sites.
//
// Configured in wrangler.jsonc under env.preview (the live site doesn't run this file).
// Copied from the Art Trail's preview Worker; only the Access application (AUD) differs.

const TEAM = 'https://quiet-recipe-3d16.cloudflareaccess.com';
// "Las Cruces Live preview" Access application (the one that locks the whole preview site).
const AUD = 'ebe939ac10d620e9818adb35663042368d74a35a15c63e0b6542745f54b531da';
const ALLOWED = ['cjbarks@gmail.com'];

const API = ['/api/status', '/api/listing', '/api/photo', '/api/pending', '/api/owner'];
// Claim this page tools (POST /api/owner { id, action }): Admin entrypoint methods taking (id, by)
const OWNER_ACTIONS = ['sendEditLink', 'dismissClaim', 'revokeEditLink', 'undoLast', 'changeLog'];
// Musicians and bands editing their own listing from their private share link. These paths are
// open to the public in Cloudflare Access (like /share), so each request must carry the listing's
// share token, which the intake Worker checks against Notion.
const SHARE_API = ['/share-api/listing', '/share-api/photo'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (SHARE_API.includes(url.pathname)) return shareApi(request, env, url);
    if (!API.includes(url.pathname)) return env.ASSETS.fetch(request);

    const isGet = request.method === 'GET';
    if (!isGet && request.method !== 'POST') return Response.json({ ok: false, error: 'Not allowed.' }, { status: 405 });
    if (!isGet && request.headers.get('origin') !== url.origin) return Response.json({ ok: false, error: 'Wrong site.' }, { status: 403 });
    const email = await accessEmail(request);
    if (!email) return Response.json({ ok: false, error: 'Your preview login expired. Reload the page and log in again.' }, { status: 401 });

    try {
      let result;
      if (url.pathname === '/api/listing' && isGet) {
        result = await env.INTAKE.getListing(url.searchParams.get('id'));
      } else if (url.pathname === '/api/photo' && !isGet) {
        const type = (request.headers.get('content-type') || '').split(';')[0];
        result = await env.INTAKE.storePhoto(url.searchParams.get('id'), await request.arrayBuffer(), type);
      } else if (!isGet) {
        let body;
        try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 }); }
        if (url.pathname === '/api/owner' && !OWNER_ACTIONS.includes(body.action)) return Response.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
        result = url.pathname === '/api/status' ? await env.INTAKE.setStatus(body.id, body.status, email)
          : url.pathname === '/api/pending' ? await env.INTAKE.resolvePending(body.id, Boolean(body.apply), email, Boolean(body.trust))
          : url.pathname === '/api/owner' ? (body.action === 'changeLog' ? await env.INTAKE.changeLog(body.id)
            : body.action === 'sendEditLink' ? await env.INTAKE.sendEditLink(body.id, email, Boolean(body.fresh))
            : await env.INTAKE[body.action](body.id, email))
          : await env.INTAKE.updateListing(body.id, body.changes, email);
      } else {
        return Response.json({ ok: false, error: 'Not allowed.' }, { status: 405 });
      }
      return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'cache-control': 'no-store' } });
    } catch (err) {
      console.error(`${url.pathname} failed: ${err.message}`);
      return Response.json({ ok: false, error: 'Something went wrong talking to Notion. Try again in a minute.' }, { status: 502 });
    }
  },
};

async function shareApi(request, env, url) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  const id = url.searchParams.get('id') || '';
  const token = url.searchParams.get('token') || '';
  if (!/^[0-9a-f]{32}$/.test(id) || !/^[\w-]{8,64}$/.test(token)) return json({ ok: false, error: 'This private link isn\'t complete. Use the link from Charlie\'s email.' }, 400);
  const isGet = request.method === 'GET';
  if (!isGet && request.method !== 'POST') return json({ ok: false, error: 'Not allowed.' }, 405);
  if (!isGet && request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'Wrong site.' }, 403);
  const size = Number(request.headers.get('content-length') || 0);
  try {
    let result;
    if (isGet && url.pathname === '/share-api/listing') {
      result = await env.INTAKE.getListing(id, token);
    } else if (!isGet && url.pathname === '/share-api/photo') {
      if (size > 13 * 1024 * 1024) return json({ ok: false, error: 'That photo is too big (12 MB max).' }, 413);
      const type = (request.headers.get('content-type') || '').split(';')[0];
      result = await env.INTAKE.storePhoto(id, await request.arrayBuffer(), type, token);
    } else if (!isGet && url.pathname === '/share-api/listing') {
      if (size > 200000) return json({ ok: false, error: 'That\'s too much to save at once.' }, 413);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
      result = await env.INTAKE.updateListing(id, body.changes || {}, 'owner link', token);
    } else {
      return json({ ok: false, error: 'Not allowed.' }, 405);
    }
    return json(result, result.ok ? 200 : 400);
  } catch (err) {
    console.error(`${url.pathname} failed: ${err.message}`);
    return json({ ok: false, error: 'Something went wrong. Try again in a minute.' }, 502);
  }
}

// Checks the Cf-Access-Jwt-Assertion header that Cloudflare Access adds to every request
// it lets through, and returns the signed-in email if it's valid and allowed.
let certs = { keys: [], at: 0 };
async function accessEmail(request) {
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (!jwt) return '';
  const [h, p, s] = jwt.split('.');
  if (!s) return '';
  try {
    const header = JSON.parse(b64text(h));
    const claims = JSON.parse(b64text(p));
    if (claims.iss !== TEAM) return '';
    if (![].concat(claims.aud).includes(AUD)) return '';
    if (!claims.exp || claims.exp * 1000 < Date.now()) return '';
    const email = String(claims.email || '').toLowerCase();
    if (!ALLOWED.includes(email)) return '';
    if (Date.now() - certs.at > 3600_000 || !certs.keys.some((k) => k.kid === header.kid)) {
      certs = { keys: (await (await fetch(`${TEAM}/cdn-cgi/access/certs`)).json()).keys || [], at: Date.now() };
    }
    const jwk = certs.keys.find((k) => k.kid === header.kid);
    if (!jwk) return '';
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64bytes(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? email : '';
  } catch {
    return '';
  }
}

function b64bytes(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64text(str) {
  return new TextDecoder().decode(b64bytes(str));
}
