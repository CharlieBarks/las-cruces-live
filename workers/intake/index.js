// Las Cruces Live intake: turns the Tally musician form into Notion records, handles
// "Claim this page", and saves changes from the editor (Charlie's preview site and each act's
// private edit link). Modeled on the Art Trail intake Worker.
//
// Runs in the Live Love Las Cruces Cloudflare account as lc-live-intake
// (https://lc-live-intake.cf2-99b.workers.dev), next to the Art Trail Workers.
//
//   POST /tally?key=INTAKE_KEY   Tally webhook (form RWdbxl). New act -> Site Status = Submitted.
//   POST /claim                  "Claim this page" from lascruceslive.com/claim/
//   GET  /photo/<key>            Photos copied out of Tally and uploaded in the editor (public)
//
// The Admin entrypoint (bottom) has no web address. Only the las-cruces-live-preview Worker can call
// it, through a service binding, after checking Charlie's Cloudflare Access login or an act's
// private share token.
//
// Secrets: NOTION_TOKEN, INTAKE_KEY, PREVIEW_HOOK (deploy hook id for the preview build),
// LIVE_HOOK (deploy hook id for the lascruceslive.com build), TURNSTILE_SECRET, BEEHIIV_API_KEY (optional).

import { WorkerEntrypoint } from 'cloudflare:workers';

const MUSICIANS_DB = 'b8aa6b26746c4ddf9967e8fd2010d08e';
const MEMBERS_DB = 'c7d3f6b775f34477851b55a6a6f7dbe0';
const TALLY_FORMS = { RWdbxl: 'musician' };

const INTAKE_ORIGIN = 'https://lc-live-intake.cf2-99b.workers.dev';
const PREVIEW_ORIGIN = 'https://las-cruces-live-preview.cf2-99b.workers.dev';
const PUBLIC_ORIGINS = ['https://lascruceslive.com', 'https://www.lascruceslive.com', PREVIEW_ORIGIN];
const TITLE = "Musician's Name";

// ---------- Small helpers ----------
const dashless = (id) => String(id || '').replace(/-/g, '').toLowerCase();
const plain = (v) => (v?.rich_text || v?.title || []).map((t) => t.plain_text).join('');
const fileUrl = (f) => f?.external?.url || f?.file?.url || '';
const chunks = (s) => (String(s).match(/[\s\S]{1,1900}/g) || []).map((c) => ({ type: 'text', text: { content: c } }));
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ''));
class UserError extends Error {}

const P = {
  title: (s) => ({ title: chunks(s || 'Untitled submission') }),
  text: (s) => (s ? { rich_text: chunks(s) } : undefined),
  select: (s) => (s ? { select: { name: s } } : undefined),
  multi: (arr) => (arr && arr.length ? { multi_select: [...new Set(arr)].map((name) => ({ name })) } : undefined),
  check: (b) => ({ checkbox: Boolean(b) }),
  url: (s) => (s ? { url: s } : undefined),
  email: (s) => (isEmail(s) ? { email: String(s).trim() } : undefined),
  phone: (s) => (s ? { phone_number: s } : undefined),
  number: (n) => (typeof n === 'number' && !isNaN(n) ? { number: n } : undefined),
  date: (s) => (s ? { date: { start: s } } : undefined),
  files: (urls, base) => (urls.length ? { files: urls.slice(0, 25).map((u, i) => ({ name: `${base}-${i + 1}`.slice(0, 100), type: 'external', external: { url: u } })) } : undefined),
  relation: (ids) => ({ relation: ids.map((id) => ({ id })) }),
};
const clean = (props) => Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));

async function notion(env, path, body, method = 'POST') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, attempt * 1000)); continue; }
    if (!res.ok) throw new Error(`Notion ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }
}

async function rebuild(hook) {
  if (!hook) return false;
  // Accepts the hook's ID or its whole URL
  const url = /^https:\/\//.test(hook) ? hook.trim() : `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/${hook.trim()}`;
  const res = await fetch(url, { method: 'POST' }).catch(() => null);
  return Boolean(res?.ok);
}

// ---------- Reading the Tally payload ----------
// Tally sends data.fields: [{ key, label, type, value, options }]. Choice answers arrive as option
// ids, so swap them for the option text. Answers are matched by question title (label), so keep the
// titles the same when editing the form (or update musicianProperties below).
export function tallyAnswers(payload) {
  const out = [];
  for (const f of payload?.data?.fields || []) {
    if (f.type === 'CHECKBOXES' && typeof f.value === 'boolean') continue; // one extra true/false per option
    let value = f.value;
    if (Array.isArray(f.options) && Array.isArray(value)) {
      const text = Object.fromEntries(f.options.map((o) => [o.id, o.text]));
      value = value.map((v) => text[v] ?? v);
    }
    out.push({ label: f.label, value });
  }
  return out;
}
const norm = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const getter = (answers) => (label) => answers.find((a) => norm(a.label) === norm(label))?.value;
const asText = (v) => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if (typeof v === 'object') return asText(v.label ?? v.value ?? v.text ?? v.name ?? '');
  return String(v).trim();
};
const list = (v) => (Array.isArray(v) ? v.map(asText) : asText(v) ? [asText(v)] : []);
const isChecked = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? v : Boolean(asText(v)) && !/^(false|no|0)$/i.test(asText(v)));
const fileUrls = (v) => [...new Set(JSON.stringify(v ?? null).match(/https?:\/\/[^"\s\\]+/g) || [])];
const fixUrl = (s, kind) => {
  s = asText(s);
  if (!s) return '';
  if (kind === 'instagram' && /^@?[\w.]+$/.test(s)) return `https://www.instagram.com/${s.replace(/^@/, '')}/`;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
};

// Booking contact as typed (email or link) -> a clean email or https:// link, or '' if it's neither
export function bookingLink(v) {
  const t = asText(v).replace(/^mailto:/i, '').trim();
  if (!t) return '';
  if (isEmail(t)) return t.toLowerCase();
  const u = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : '';
  try { return u && new URL(u).hostname.includes('.') ? u : ''; } catch { return ''; }
}

// "Maria Lopez - lead vocals, rhythm guitar" (also –, —, : or a comma after the name)
export function parseMembers(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim().replace(/^[-*•\d.)\s]+/, '')).filter(Boolean).slice(0, 15).map((line) => {
    const m = line.match(/^(.+?)\s*(?:\s[-–—]\s|:|\s\(|,)\s*(.+?)\)?$/);
    return m ? { name: m[1].trim(), plays: m[2].trim() } : { name: line, plays: '' };
  }).filter((m) => m.name.length <= 80);
}

const GENRES = ['Americana', 'Blues', 'Country', 'Jazz', 'Rock', 'Folk', 'Pop', 'Soul', 'Funk', 'R&B', 'Latin', 'Cumbia', 'Tejano', 'Norteño', 'Spanish', 'DJ', 'Alternative', 'Hip Hop'];

export function musicianProperties(get, meta) {
  const name = asText(get('Act or band name'));
  const kind = asText(get('Solo or band?'));
  const heard = asText(get('How did you hear about Las Cruces Live?'));
  const photo = fileUrls(get('Main photo (optional)'));
  const more = fileUrls(get('More photos (optional)')).slice(0, 8);
  return clean({
    [TITLE]: P.title(name),
    'Site Status': P.select('Submitted'),
    Type: P.select(/band|duo/i.test(kind) ? 'Band' : 'Solo Artist'),
    'Genres (checklist)': P.multi(list(get('Genres (pick up to 3)')).filter((g) => GENRES.includes(g))),
    Genre: P.text(asText(get('Your sound in a few words'))),
    Bio: P.text(asText(get('About you (optional)'))),
    Photo: P.files(photo, 'photo'),
    Gallery: P.files(more, 'gallery'),
    'Photo Credit': P.text(asText(get('Photo credit (optional)'))),
    'Image Permission': P.check(isChecked(get('Photo permission'))),
    Website: P.url(fixUrl(get('Website'))),
    Instagram: P.url(fixUrl(get('Instagram'), 'instagram')),
    Facebook: P.url(fixUrl(get('Facebook'))),
    YouTube: P.url(fixUrl(get('YouTube'))),
    'Song Link': P.url(fixUrl(get('A song people can play (optional)'))),
    'Submitter Name': P.text(asText(get('Your name'))),
    'Submitter Email': P.email(asText(get('Your email'))),
    // Whoever filled out the form owns the page: their edit link goes here.
    'Owner Email': P.email(asText(get('Your email'))),
    Email: P.email(asText(get('Your email'))),
    // Public: shown as the Book button
    'Booking Link': P.text(bookingLink(get('How should people book you? (optional)'))),
    'Newsletter Opt-in': P.check(isChecked(get('Newsletter'))),
    'Heard About Us': P.text(heard),
    'Form Notes': P.text([
      asText(get('Phone (optional)')) && `Phone: ${asText(get('Phone (optional)'))}`,
      asText(get('Anything else? (optional)')) && `Anything else: ${asText(get('Anything else? (optional)'))}`,
    ].filter(Boolean).join('\n')),
    'Submitted On': P.date(meta.date),
    'Tally ID': P.text(meta.id),
  });
}

// Copy uploaded files into KV right away, so photos never depend on Tally's links.
async function stashFiles(answers, env, responseId) {
  if (!env.PHOTOS) return answers;
  let n = 0;
  for (const a of answers) {
    if (!Array.isArray(a.value) || !a.value.some((v) => v && typeof v === 'object' && v.url)) continue;
    a.value = await Promise.all(a.value.map(async (file) => {
      if (!file?.url) return file;
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const type = (res.headers.get('content-type') || file.mimeType || 'image/jpeg').split(';')[0];
        const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
        const key = `form/${String(responseId).replace(/[^\w-]/g, '')}/${++n}.${ext}`;
        await env.PHOTOS.put(key, await res.arrayBuffer(), { metadata: { type } });
        return { name: file.name, url: `${INTAKE_ORIGIN}/photo/${key}` };
      } catch (err) {
        console.error(`photo copy failed (${file.name}): ${err.message}`);
        return file;
      }
    }));
  }
  return answers;
}

export async function handleSubmission(payload, env) {
  const id = String(payload?.data?.responseId || payload?.data?.submissionId || `no-id-${Date.now()}`);
  const when = new Date(payload?.data?.createdAt || Date.now());
  const meta = { id, date: (isNaN(when) ? new Date() : when).toISOString().slice(0, 10) };
  if (!id.startsWith('no-id-')) {
    const dup = await notion(env, `databases/${MUSICIANS_DB}/query`, { filter: { property: 'Tally ID', rich_text: { equals: id } }, page_size: 1 });
    if (dup.results.length) return { status: 'duplicate', id };
  }
  const get = getter(await stashFiles(tallyAnswers(payload), env, id));
  const properties = musicianProperties(get, meta);
  const page = await notion(env, 'pages', { parent: { database_id: MUSICIANS_DB }, properties });
  // Band members typed on the form: one record each, shown only under this band
  const members = properties.Type?.select?.name === 'Band' ? parseMembers(asText(get("Who's in the band?"))) : [];
  for (const [i, m] of members.entries()) {
    await notion(env, 'pages', { parent: { database_id: MEMBERS_DB }, properties: clean({
      Name: P.title(m.name), Plays: P.text(m.plays), Band: P.relation([page.id]), Order: P.number(i + 1), 'Added By': P.text('Tally form'),
    }) }).catch((err) => console.error(`member save failed: ${err.message}`));
  }
  await joinNewsletter(env, properties);
  await rebuild(env.PREVIEW_HOOK);
  const act = asText(get('Act or band name')) || 'Untitled';
  if (!/^test\b/i.test(act)) {
    await tellCharlie(env, `new act to approve: ${act}`, [
      `${act} just filled out the form${asText(get('Your name')) ? ` (${asText(get('Your name'))})` : ''}.`,
      'Its preview page is ready in about 2 minutes. Approve it from the review queue.',
      '', `Notion record: ${notionLink(page.id)}`,
    ]);
  }
  return { status: 'created', id, notion: page.url, members: members.length };
}

const BEEHIIV_PUB = 'pub_30ababf5-8907-4822-935d-a896d2c7f1a6';
async function joinNewsletter(env, properties) {
  const email = properties['Submitter Email']?.email;
  if (!env.BEEHIIV_API_KEY || !email || !properties['Newsletter Opt-in']?.checkbox) return;
  try {
    const res = await fetch(`https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.BEEHIIV_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reactivate_existing: false, send_welcome_email: true, utm_source: 'lascruceslive', utm_medium: 'musician-form' }),
    });
    if (!res.ok) console.warn(`Beehiiv signup failed: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`Beehiiv signup failed: ${err.message}`);
  }
}

export default {
  // Backup for Grok Bot notifications (see notifyAll)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(notifyAll(env).catch((err) => console.error(`notify failed: ${err.message}`)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/photo/') && env.PHOTOS) {
      const key = decodeURIComponent(url.pathname.slice('/photo/'.length));
      if (!key || key.startsWith('_') || key.includes('..')) return new Response('Not found', { status: 404 });
      const obj = await env.PHOTOS.getWithMetadata(key, 'arrayBuffer');
      if (!obj.value) return new Response('Not found', { status: 404 });
      return new Response(obj.value, { headers: { 'content-type': obj.metadata?.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/claim') return handleClaim(request, env, ctx);
    if (url.pathname === '/notify' && request.method === 'POST' && env.INTAKE_KEY && url.searchParams.get('key') === env.INTAKE_KEY) {
      try {
        if (url.searchParams.get('test') === 'charlie') {
          await sendNotice(env, { to: CHARLIE_INBOX, from: NOTIFY_FROM, subject: 'LC Live: test heads-up', text: `This is what your Las Cruces Live heads-ups look like. You'll get one when a new act signs up, when someone claims a page, and when an act changes their live page.\n\nReview queue: ${REVIEW_URL}` });
          return Response.json({ ok: true, test: 'charlie' });
        }
        if (url.searchParams.get('test')) {
          await sendNotice(env, notifyMessage('preview', 'TEST Notification Check', notionLink('41154e00081a8152987fded7b558a87a'), 'nobody@example.com', `${PREVIEW_ORIGIN}/`, true));
          return Response.json({ ok: true, test: true });
        }
        return Response.json({ ok: true, ...(await notifyAll(env)) });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }
    if (url.pathname !== '/tally' || url.searchParams.get('key') !== env.INTAKE_KEY) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Las Cruces Live intake is running. Tally sends submissions here.', { headers: { 'content-type': 'text/plain' } });
    let payload;
    try { payload = await request.json(); } catch { return Response.json({ status: 'bad-json' }, { status: 400 }); }
    if (!TALLY_FORMS[payload?.data?.formId]) return Response.json({ status: 'ignored', reason: 'not a Las Cruces Live form' });
    console.log(JSON.stringify({ tally: payload?.data?.formId, payload }).slice(0, 20000));
    if (!env.NOTION_TOKEN) {
      console.error('intake: NOTION_TOKEN is missing; the submission is still in Tally');
      return Response.json({ status: 'not-configured' });
    }
    // Reply right away (Tally allows 10 seconds), then copy photos and save to Notion.
    const work = handleSubmission(payload, env).then((r) => console.log(JSON.stringify(r))).catch((err) => console.error(`intake failed: ${err.message}`));
    ctx.waitUntil(work);
    return Response.json({ status: 'accepted' });
  },
};

// ---------- Grok Bot notifications ----------
// Grok Bot sends the musician emails. We email its inbox whenever one is due: a new act's
// private preview link, an edit link (claim or re-send), or "you're live". Runs after every
// preview deploy (POST /notify from the build), right after an edit link is re-sent, and every
// 30 minutes as a backup. The matching checkbox is ticked only after the email goes out, so a
// failed send is retried next time and nobody gets the same email twice.
const GROK_INBOX = 'charlie-p9916j@mail.grokbot.com';
const NOTIFY_FROM = { email: 'notify@livelovelascruces.com', name: 'Las Cruces Live' };
const NOTIFY_KINDS = [
  { kind: 'preview', box: 'Preview Email Sent', link: 'Share Link', to: ['Submitter Email', 'Owner Email'],
    due: (p) => p['Submitted On']?.date?.start && p['Share Link']?.url },
  { kind: 'edit-link', box: 'Edit Link Sent', link: 'Edit Link', to: ['Owner Email'],
    due: (p) => p['Edit Link']?.url && p['Owner Email']?.email },
  { kind: 'live', box: 'Live Email Sent', link: 'Live Link', to: ['Owner Email', 'Submitter Email'],
    due: (p) => p['Live Link']?.url },
];
const notionLink = (id) => `https://www.notion.so/${dashless(id)}`;

function notifyMessage(kind, act, record, to, link, test = false) {
  const what = { preview: 'New act: send the private preview link (Email 1)', 'edit-link': 'Send the private edit link (Email 2)', live: "They're live: send the you're-live email (Email 3)" }[kind];
  const text = [
    test ? 'TEST NOTIFICATION. Do not email anyone. Just confirm you received it.\n' : '',
    `Notification: ${kind}`,
    what,
    `Act: ${act}`,
    `Notion record: ${record}`,
    `Send to: ${to}`,
    `Link to include: ${link}`,
  ].filter(Boolean).join('\n');
  return { to: GROK_INBOX, from: NOTIFY_FROM, subject: `${test ? '[TEST] ' : ''}LC Live ${kind}: ${act}`, text };
}

async function sendNotice(env, msg) {
  if (!env.EMAIL) throw new Error('The EMAIL binding is missing');
  return env.EMAIL.send(msg);
}

// Heads-ups for Charlie when something needs him: a new act, a claim to check, edits waiting.
const CHARLIE_INBOX = 'livelovelascruces@gmail.com';
const REVIEW_URL = `${PREVIEW_ORIGIN}/review/`;
async function tellCharlie(env, subject, lines) {
  try {
    await sendNotice(env, { to: CHARLIE_INBOX, from: NOTIFY_FROM, subject: `LC Live: ${subject}`, text: [...lines, '', `Review queue: ${REVIEW_URL}`].join('\n') });
  } catch (err) {
    console.error(`tellCharlie failed: ${err.message}`);
  }
}

let notifyRunning = null;
async function notifyAll(env) {
  if (notifyRunning) return notifyRunning; // one run at a time per Worker instance
  notifyRunning = (async () => {
    const filter = { or: [
      { and: [{ property: 'Submitted On', date: { is_not_empty: true } }, { property: 'Share Link', url: { is_not_empty: true } }, { property: 'Preview Email Sent', checkbox: { equals: false } }] },
      { and: [{ property: 'Edit Link', url: { is_not_empty: true } }, { property: 'Owner Email', email: { is_not_empty: true } }, { property: 'Edit Link Sent', checkbox: { equals: false } }] },
      { and: [{ property: 'Live Link', url: { is_not_empty: true } }, { property: 'Live Email Sent', checkbox: { equals: false } }] },
    ] };
    const res = await notion(env, `databases/${MUSICIANS_DB}/query`, { filter, page_size: 50 });
    const sent = [], failed = [];
    for (const page of res.results || []) {
      const p = page.properties;
      const act = plain(p[TITLE]);
      if (/^test\b/i.test(act)) continue; // test records never notify
      for (const k of NOTIFY_KINDS) {
        if (p[k.box]?.checkbox || !k.due(p)) continue;
        const to = k.to.map((f) => p[f]?.email).find(Boolean);
        if (!to) continue;
        try {
          await sendNotice(env, notifyMessage(k.kind, act, notionLink(page.id), to, p[k.link].url));
          await notion(env, `pages/${dashless(page.id)}`, { properties: { [k.box]: { checkbox: true } } }, 'PATCH');
          sent.push(`${k.kind}: ${act}`);
        } catch (err) {
          failed.push(`${k.kind}: ${act}: ${err.message}`);
        }
      }
    }
    const out = { sent, failed };
    console.log(JSON.stringify({ notify: out }));
    return out;
  })().finally(() => { notifyRunning = null; });
  return notifyRunning;
}

// ---------- Claim this page ----------
// From lascruceslive.com/claim/?id=<notion id>. If the email matches the one on file (Owner Email,
// Email, Booking Email or the Musician Contact List), the private edit link goes into Notion's
// Edit Link with Edit Link Sent unticked, and we email Grok Bot to send it. Otherwise the claim waits in
// Claim Request for Charlie (Review queue on the preview site). Same answer either way.
const newShareToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const shareUrl = (token) => `${PREVIEW_ORIGIN}/share/${token}/`;

async function onFileEmails(env, page) {
  const out = [page.properties['Owner Email']?.email, page.properties.Email?.email, page.properties['Booking Email']?.email, page.properties['Submitter Email']?.email];
  for (const r of (page.properties.Contact?.relation || []).slice(0, 3)) {
    const c = await notion(env, `pages/${dashless(r.id)}`, undefined, 'GET').catch(() => null);
    out.push(c?.properties?.Email?.email);
  }
  return out.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
}

async function giveEditLink(env, id, page, email, fresh = false) {
  const had = plain(page.properties['Share Token']);
  const token = !had || fresh ? newShareToken() : had;
  const link = shareUrl(token);
  await notion(env, `pages/${id}`, { properties: {
    'Share Token': { rich_text: [{ text: { content: token } }] },
    'Share Link': { url: link },
    'Edit Link': { url: link },
    'Edit Link Sent': { checkbox: false },
    'Owner Email': { email },
    'Claim Request': { rich_text: [] },
  } }, 'PATCH');
  // A new token needs its page built on the preview site first (about 2 minutes). The preview
  // build pings /notify when it's done, so Grok Bot hears about it once the link works.
  // Same token: the page already exists, so tell Grok Bot now.
  if (token !== had) await rebuild(env.PREVIEW_HOOK);
  else await notifyAll(env);
  return link;
}

async function limited(env, key) {
  try { const out = await env.CLAIM_LIMIT?.limit({ key }); return out ? !out.success : false; } catch { return false; }
}

async function handleClaim(request, env, ctx) {
  const origin = request.headers.get('origin') || '';
  const cors = PUBLIC_ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400' } });
  const reply = (body, status = 200) => Response.json(body, { status, headers: cors });
  if (request.method !== 'POST' || !cors['Access-Control-Allow-Origin']) return reply({ ok: false, error: 'Not allowed.' }, 403);
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (await limited(env, `claim:${ip}`)) return reply({ ok: false, error: 'Too many tries. Please wait a minute and try again.' }, 429);
  let b;
  try { b = await request.json(); } catch { return reply({ ok: false, error: 'Bad request.' }, 400); }
  const clip = (v, n) => String(v || '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const name = clip(b.name, 80), email = clip(b.email, 120).toLowerCase(), role = clip(b.role, 80), note = clip(b.note, 500);
  const id = dashless(b.id);
  const done = { ok: true };
  if (b.website) return reply(done); // honeypot
  if (!name || !isEmail(email)) return reply({ ok: false, error: 'Add your name and a working email.' }, 400);
  if (!/^[0-9a-f]{32}$/.test(id)) return reply({ ok: false, error: 'Unknown page.' }, 400);
  if (!(await turnstileOk(env, b.token, ip))) return reply({ ok: false, error: "The spam check didn't go through. Please try again." }, 400);
  if (env.PHOTOS && (await env.PHOTOS.get(`_claimwait/${id}`))) return reply(done); // one claim per page per 10 minutes
  try {
    const page = await notion(env, `pages/${id}`, undefined, 'GET');
    const status = page.properties['Site Status']?.select?.name || 'Approved'; // blank = live
    if (dashless(page.parent?.database_id) !== MUSICIANS_DB || status !== 'Approved') return reply({ ok: false, error: "That page can't be claimed." }, 400);
    await env.PHOTOS?.put(`_claimwait/${id}`, '1', { expirationTtl: 600 });
    if ((await onFileEmails(env, page)).includes(email)) {
      // Matches. If a link is already out, re-send the same one rather than replacing it.
      if (page.properties['Edit Link']?.url && plain(page.properties['Share Token'])) {
        await notion(env, `pages/${id}`, { properties: { 'Edit Link Sent': { checkbox: false } } }, 'PATCH');
        ctx.waitUntil(notifyAll(env).catch((e) => console.error(`notify failed: ${e.message}`)));
      } else {
        await giveEditLink(env, id, page, email);
      }
      console.log(JSON.stringify({ claim: 'matched', id }));
      ctx.waitUntil(tellCharlie(env, `${plain(page.properties[TITLE])} claimed their page`, [
        `${name} <${email}> claimed ${plain(page.properties[TITLE])}. The email matched what's on file, so their private edit link is on its way. Nothing to do.`,
        "If they change their live page, you'll get another email to approve the changes.",
        '', `Notion record: ${notionLink(id)}`,
      ]));
    } else {
      const day = new Date().toISOString().slice(0, 10);
      await env.PHOTOS?.put(`_claim/${id}`, JSON.stringify({ name, email, role, note, at: Date.now() }), { expirationTtl: 60 * 86400 });
      await notion(env, `pages/${id}`, { properties: { 'Claim Request': { rich_text: chunks(`${name} <${email}>${role ? ` · ${role}` : ''} · ${day}${note ? `\n${note}` : ''}`) } } }, 'PATCH');
      ctx.waitUntil(rebuild(env.PREVIEW_HOOK).catch(() => {}));
      console.log(JSON.stringify({ claim: 'to-review', id }));
      ctx.waitUntil(tellCharlie(env, `claim to check: ${plain(page.properties[TITLE])}`, [
        `${name} <${email}>${role ? ` (${role})` : ''} wants to claim ${plain(page.properties[TITLE])}, but that email isn't on file.`,
        note ? `Their note: ${note}` : '',
        'If they check out, tap "Send edit link" on their page in the review queue. Otherwise dismiss it.',
        '', `Notion record: ${notionLink(id)}`,
      ].filter((l, i) => l || i > 1)));
    }
    return reply(done);
  } catch (err) {
    console.error(`claim failed: ${err.message}`);
    return reply({ ok: false, error: 'Something went wrong. Please try again in a minute, or email events@livelovelascruces.com.' }, 502);
  }
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured: rely on the honeypot, the rate limit and review
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(token));
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }).catch(() => null);
  return Boolean((res ? await res.json().catch(() => ({})) : {}).success);
}

// ---------- Editor: fields, photos and band members ----------
// Fields anyone with the private link can change. Everything else stays Charlie's (in Notion).
const EDITABLE = [TITLE, 'Type', 'Genre', 'Genres (checklist)', 'Bio', 'Website', 'Instagram', 'Facebook', 'YouTube', 'Song Link', 'Booking Link', 'Photo Credit', 'Image Permission'];
const MAX_GALLERY = 8;
const MAX_MEMBERS = 15;
const sameToken = (a, b) => {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const readPending = (page) => { try { return JSON.parse(plain(page.properties['Pending Edits']) || 'null'); } catch { return null; } };

async function copyToStore(env, id, bytes, type) {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const key = `edit/${dashless(id)}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.PHOTOS.put(key, bytes, { metadata: { type } });
  return `${INTAKE_ORIGIN}/photo/${key}`;
}

// A property as it can be written back (for the undo log). Notion-hosted photos expire, so copy them.
async function writable(env, id, p) {
  if (!p) return undefined;
  switch (p.type) {
    case 'title': return { title: chunks(plain(p) || 'Untitled') };
    case 'rich_text': return { rich_text: plain(p) ? chunks(plain(p)) : [] };
    case 'select': return { select: p.select ? { name: p.select.name } : null };
    case 'multi_select': return { multi_select: (p.multi_select || []).map((o) => ({ name: o.name })) };
    case 'checkbox': return { checkbox: Boolean(p.checkbox) };
    case 'url': return { url: p.url || null };
    case 'email': return { email: p.email || null };
    case 'files': {
      const files = [];
      for (const [i, f] of (p.files || []).entries()) {
        let u = fileUrl(f);
        if (f.type === 'file' && u) {
          const res = await fetch(u).catch(() => null);
          u = res?.ok ? await copyToStore(env, id, await res.arrayBuffer(), (res.headers.get('content-type') || 'image/jpeg').split(';')[0]) : '';
        }
        if (u) files.push({ name: f.name || `photo-${i + 1}`, type: 'external', external: { url: u } });
      }
      return { files };
    }
  }
  return undefined;
}
async function logChange(env, id, page, props, by) {
  if (!env.PHOTOS) return;
  try {
    const before = {};
    for (const name of Object.keys(props)) { const w = await writable(env, id, page.properties[name]); if (w) before[name] = w; }
    if (!Object.keys(before).length) return;
    const at = Date.now();
    await env.PHOTOS.put(`_log/${dashless(id)}/${String(9e15 - at).padStart(16, '0')}-${crypto.randomUUID().slice(0, 6)}`, JSON.stringify({ at, by, fields: Object.keys(props), before }), { expirationTtl: 365 * 86400 });
  } catch (err) {
    console.warn(`change log failed: ${err.message}`);
  }
}

async function loadMembers(env, page) {
  const ids = (page.properties['Band Members']?.relation || []).map((r) => dashless(r.id));
  const out = [];
  for (const mid of ids.slice(0, 30)) {
    const m = await notion(env, `pages/${mid}`, undefined, 'GET').catch(() => null);
    if (!m || m.properties.Hidden?.checkbox) continue;
    out.push({
      id: mid,
      name: plain(m.properties.Name),
      plays: plain(m.properties.Plays),
      bio: plain(m.properties.Bio),
      photo: fileUrl(m.properties.Photo?.files?.[0]),
      email: m.properties.Email?.email || '',
      solo: dashless(m.properties['Solo Page']?.relation?.[0]?.id),
      order: m.properties.Order?.number ?? 99,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

export class Admin extends WorkerEntrypoint {
  async #load(id, token) {
    if (!/^[0-9a-f]{32}$/.test(dashless(id))) throw new UserError('Unknown listing.');
    const page = await notion(this.env, `pages/${dashless(id)}`, undefined, 'GET');
    if (dashless(page.parent?.database_id) !== MUSICIANS_DB) throw new UserError('That page is not a Las Cruces Live listing.');
    const status = page.properties['Site Status']?.select?.name || 'Approved';
    if (token !== undefined && (!sameToken(token, plain(page.properties['Share Token'])) || status === 'Hidden')) {
      throw new UserError('This private link no longer works. Ask Charlie for a new one.');
    }
    const schema = (await notion(this.env, `databases/${MUSICIANS_DB}`, undefined, 'GET')).properties;
    return { page, schema, owner: token !== undefined, live: status === 'Approved', status };
  }

  async setStatus(id, status, by = '') {
    try {
      if (!['Approved', 'Hidden', 'In Review'].includes(status)) return { ok: false, error: 'Unknown status.' };
      const { page } = await this.#load(id);
      await notion(this.env, `pages/${dashless(id)}`, { properties: { 'Site Status': { select: { name: status } } } }, 'PATCH');
      console.log(JSON.stringify({ admin: 'setStatus', id: dashless(id), name: plain(page.properties[TITLE]), status, by }));
      const live = await rebuild(this.env.LIVE_HOOK);
      const preview = await rebuild(this.env.PREVIEW_HOOK);
      return { ok: true, status, rebuilding: { live, preview } };
    } catch (err) {
      return { ok: false, error: err instanceof UserError ? err.message : "Notion didn't accept the change. Try again in a minute." };
    }
  }

  async getListing(id, token) {
    try {
      const { page, schema, owner, live, status } = await this.#load(id, token);
      const pending = owner ? readPending(page) : null;
      const fields = [];
      for (const name of EDITABLE) {
        const def = schema[name], v = page.properties[name];
        if (!def || !v) continue;
        const t = def.type;
        let value = t === 'title' || t === 'rich_text' ? plain(v) : t === 'select' ? v.select?.name || '' : t === 'multi_select' ? (v.multi_select || []).map((o) => o.name)
          : t === 'checkbox' ? Boolean(v.checkbox) : t === 'url' ? v.url || '' : t === 'email' ? v.email || '' : null;
        if (value === null) continue;
        if (pending?.changes?.fields && name in pending.changes.fields) value = pending.changes.fields[name];
        const options = def[t]?.options?.map((o) => o.name);
        fields.push({ name, type: t, value, ...(options ? { options } : {}) });
      }
      const captions = plain(page.properties['Photo Captions']).split('\n');
      let photo = fileUrl(page.properties.Photo?.files?.[0]);
      let gallery = (page.properties.Gallery?.files || []).map((f, i) => ({ url: fileUrl(f), caption: (captions[i] || '').trim() }));
      let members = await loadMembers(this.env, page);
      if (pending?.changes) {
        if ('photo' in pending.changes) photo = pending.changes.photo;
        if (pending.changes.gallery) gallery = pending.changes.gallery;
        if (pending.changes.members) members = pending.changes.members;
      }
      return {
        ok: true, siteStatus: status, live, pending: Boolean(pending),
        trusted: Boolean(page.properties['Trusted Editor']?.checkbox),
        ...(owner ? {} : { notionUrl: page.url, access: {
          email: page.properties['Owner Email']?.email || '', link: page.properties['Edit Link']?.url || '',
          linkSent: Boolean(page.properties['Edit Link Sent']?.checkbox), trusted: Boolean(page.properties['Trusted Editor']?.checkbox),
        } }),
        fields, photo, gallery, members,
      };
    } catch (err) {
      if (!(err instanceof UserError)) console.error(`getListing failed: ${err.message}`);
      return { ok: false, error: err instanceof UserError ? err.message : "Couldn't load the listing from Notion. Try again in a minute." };
    }
  }

  async storePhoto(id, bytes, type = 'image/jpeg', token) {
    try {
      if (!/^[0-9a-f]{32}$/.test(dashless(id))) return { ok: false, error: 'Unknown listing.' };
      if (token !== undefined) {
        await this.#load(id, token);
        const rl = `rl/${dashless(id)}/${new Date().toISOString().slice(0, 13)}`;
        const n = Number(await this.env.PHOTOS.get(rl)) || 0;
        if (n >= 40) return { ok: false, error: "That's a lot of photos for one hour. Try again a little later." };
        await this.env.PHOTOS.put(rl, String(n + 1), { expirationTtl: 7200 });
      }
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return { ok: false, error: 'Photos must be JPG, PNG or WebP.' };
      if (!bytes || bytes.byteLength > 12 * 1024 * 1024) return { ok: false, error: 'That photo is too big (12 MB max).' };
      return { ok: true, url: await copyToStore(this.env, id, bytes, type) };
    } catch (err) {
      return { ok: false, error: err instanceof UserError ? err.message : "Couldn't save the photo. Try again." };
    }
  }

  // Editor changes -> Notion properties for the act (validated). Members are handled separately.
  async #buildProps(id, page, schema, changes) {
    const props = {};
    const clip = (v, n = 6000) => String(v ?? '').slice(0, n);
    const httpUrl = (v) => {
      const t = clip(v, 1000).trim();
      if (!t) return null;
      const u = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      try { return new URL(u).protocol.startsWith('http') ? u : null; } catch { return null; }
    };
    for (const [name, value] of Object.entries(changes.fields || {})) {
      if (!EDITABLE.includes(name) || !schema[name]) continue;
      const def = schema[name];
      const opts = def[def.type]?.options?.map((o) => o.name) || [];
      switch (def.type) {
        case 'title': props[name] = { title: chunks(clip(value, 120).trim() || 'Untitled') }; break;
        case 'rich_text': {
          if (name === 'Booking Link') {
            const b = bookingLink(value);
            if (value && !b) throw new UserError('The booking contact should be an email address or a web link.');
            props[name] = { rich_text: b ? chunks(b) : [] };
            break;
          }
          props[name] = { rich_text: value ? chunks(clip(value, name === 'Genre' ? 160 : 1500)) : [] };
          break;
        }
        case 'select': props[name] = { select: value && opts.includes(value) ? { name: value } : null }; break;
        case 'multi_select': props[name] = { multi_select: (Array.isArray(value) ? value : []).filter((v) => opts.includes(v)).slice(0, 5).map((v) => ({ name: v })) }; break;
        case 'checkbox': props[name] = { checkbox: Boolean(value) }; break;
        case 'url': {
          const u = httpUrl(value);
          if (value && !u) throw new UserError(`${name} doesn't look like a web address.`);
          props[name] = { url: u };
          break;
        }
        case 'email': {
          const e = clip(value, 200).trim();
          if (e && !isEmail(e)) throw new UserError(`${name} doesn't look like an email address.`);
          props[name] = { email: e || null };
          break;
        }
      }
    }
    const keep = await this.#photoKeeper(id, page);
    const external = (urls, base) => ({ files: urls.filter(Boolean).map((u, i) => ({ name: `${base}-${i + 1}`, type: 'external', external: { url: u } })) });
    if ('photo' in changes) props.Photo = external([await keep(String(changes.photo || ''))], 'photo');
    if (Array.isArray(changes.gallery)) {
      const items = changes.gallery.slice(0, MAX_GALLERY);
      const urls = [];
      for (const it of items) urls.push(await keep(String(it.url || '')));
      props.Gallery = external(urls, 'gallery');
      props['Photo Captions'] = { rich_text: chunks(items.map((it) => clip(it.caption, 200).replace(/\n/g, ' ').trim()).join('\n')) };
    }
    return props;
  }

  // Only our own photo store and the listing's (or its members') existing photos are accepted.
  async #photoKeeper(id, page, extra = []) {
    const base = (u) => String(u).split('?')[0];
    const current = new Map([...(page.properties.Photo?.files || []), ...(page.properties.Gallery?.files || [])].map((x) => [base(fileUrl(x)), fileUrl(x)]));
    for (const u of extra) if (u) current.set(base(u), u);
    return async (u) => {
      if (!u) return '';
      if (u.startsWith(`${INTAKE_ORIGIN}/photo/`)) return u;
      if (!current.has(base(u))) throw new UserError("One of the photos isn't from this listing. Upload it again.");
      if (!/amazonaws\.com|notion\.(so|com)|notion-static/.test(new URL(u).host)) return u;
      const res = await fetch(current.get(base(u)));
      if (!res.ok) throw new UserError("Couldn't copy a photo from Notion. Try again.");
      const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
      return copyToStore(this.env, id, await res.arrayBuffer(), /^image\/(png|webp)$/.test(type) ? type : 'image/jpeg');
    };
  }

  // members: [{ id?, name, plays, bio, photo, email, solo }]. Saves them under the band; members left
  // out are hidden (never deleted), so nothing is lost by mistake.
  async #saveMembers(id, page, members, by) {
    if (!Array.isArray(members)) return 0;
    const existing = await loadMembers(this.env, page);
    const byId = new Map(existing.map((m) => [m.id, m]));
    const keep = await this.#photoKeeper(id, page, existing.map((m) => m.photo));
    const clip = (v, n) => String(v ?? '').replace(CONTROL, '').trim().slice(0, n);
    const kept = new Set();
    let n = 0;
    for (const [i, m] of members.slice(0, MAX_MEMBERS).entries()) {
      const name = clip(m.name, 80);
      if (!name) continue;
      let solo = dashless(m.solo);
      if (solo) {
        const sp = await notion(this.env, `pages/${solo}`, undefined, 'GET').catch(() => null);
        if (!sp || dashless(sp.parent?.database_id) !== MUSICIANS_DB || sp.id.replace(/-/g, '') === dashless(id)) solo = '';
      }
      const photo = await keep(String(m.photo || ''));
      const email = clip(m.email, 200);
      const properties = {
        Name: P.title(name), Plays: { rich_text: m.plays ? chunks(clip(m.plays, 120)) : [] }, Bio: { rich_text: m.bio ? chunks(clip(m.bio, 400)) : [] },
        Photo: { files: photo ? [{ name: 'member', type: 'external', external: { url: photo } }] : [] },
        Email: { email: isEmail(email) ? email : null }, 'Solo Page': P.relation(solo ? [solo] : []), Order: { number: i + 1 }, Hidden: { checkbox: false },
      };
      const mid = dashless(m.id);
      if (mid && byId.has(mid)) {
        await notion(this.env, `pages/${mid}`, { properties }, 'PATCH');
        kept.add(mid);
      } else {
        await notion(this.env, 'pages', { parent: { database_id: MEMBERS_DB }, properties: { ...properties, Band: P.relation([dashless(id)]), 'Added By': P.text(by || 'editor') } });
      }
      n++;
    }
    for (const m of existing) if (!kept.has(m.id)) await notion(this.env, `pages/${m.id}`, { properties: { Hidden: { checkbox: true } } }, 'PATCH');
    return n;
  }

  // changes = { fields: {...}, photo: url, gallery: [{url, caption}], members: [...] }
  // From a private link: a live listing's changes wait in Pending Edits for Charlie, unless the
  // owner is a Trusted Editor. A listing that isn't live yet saves straight away.
  async updateListing(id, changes = {}, by = '', token) {
    try {
      if (JSON.stringify(changes).length > 150000) throw new UserError("That's too much to save at once.");
      const { page, schema, owner, live } = await this.#load(id, token);
      const props = await this.#buildProps(id, page, schema, changes);
      const hasMembers = Array.isArray(changes.members);
      if (!Object.keys(props).length && !hasMembers) return { ok: true, saved: 0 };

      const trusted = owner && live && Boolean(page.properties['Trusted Editor']?.checkbox);
      if (owner && live && !(trusted && !readPending(page))) {
        // Hold the changes for Charlie. Photos are already in our store (copied by #buildProps).
        if ('photo' in changes) changes.photo = props.Photo.files[0]?.external?.url || '';
        if (Array.isArray(changes.gallery)) changes.gallery = props.Gallery.files.map((f, i) => ({ url: f.external.url, caption: String(changes.gallery[i]?.caption || '').slice(0, 200) }));
        if (hasMembers) {
          const keep = await this.#photoKeeper(id, page, (await loadMembers(this.env, page)).map((m) => m.photo));
          for (const m of changes.members) m.photo = await keep(String(m.photo || ''));
        }
        const prev = readPending(page)?.changes || {};
        const merged = {
          fields: { ...(prev.fields || {}), ...Object.fromEntries(Object.entries(changes.fields || {}).filter(([n]) => EDITABLE.includes(n))) },
          ...('photo' in changes ? { photo: changes.photo } : 'photo' in prev ? { photo: prev.photo } : {}),
          ...(changes.gallery || prev.gallery ? { gallery: changes.gallery || prev.gallery } : {}),
          ...(changes.members || prev.members ? { members: changes.members || prev.members } : {}),
        };
        const before = {};
        for (const n of Object.keys(merged.fields)) {
          const v = page.properties[n];
          before[n] = v?.type === 'multi_select' ? v.multi_select.map((o) => o.name).join(', ') : v?.type === 'select' ? v.select?.name || ''
            : v?.type === 'checkbox' ? (v.checkbox ? 'Yes' : 'No') : v?.type === 'url' ? v.url || '' : v?.type === 'email' ? v.email || '' : plain(v);
        }
        const record = { at: new Date().toISOString(), changes: merged, before };
        await notion(this.env, `pages/${dashless(id)}`, { properties: {
          'Pending Edits': { rich_text: chunks(JSON.stringify(record)) },
          'Pending Edits On': { date: { start: record.at.slice(0, 10) } },
        } }, 'PATCH');
        await rebuild(this.env.PREVIEW_HOOK);
        if (!readPending(page)) {
          await tellCharlie(this.env, `edits to approve: ${plain(page.properties[TITLE])}`, [
            `${plain(page.properties[TITLE])} changed their live page: ${[...Object.keys(merged.fields), ...['photo', 'gallery', 'members'].filter((k) => k in merged)].join(', ')}.`,
            'Approve or discard the changes from the review queue (about 2 minutes from now).',
            '', `Notion record: ${notionLink(id)}`,
          ]);
        }
        return { ok: true, pending: true };
      }

      if (Object.keys(props).length) {
        await logChange(this.env, id, page, props, owner ? `owner link${trusted ? ' (trusted)' : ''}` : by);
        await notion(this.env, `pages/${dashless(id)}`, { properties: props }, 'PATCH');
      }
      const members = hasMembers ? await this.#saveMembers(id, page, changes.members, owner ? 'owner link' : by) : null;
      console.log(JSON.stringify({ admin: 'updateListing', id: dashless(id), fields: Object.keys(props), members, by: owner ? 'owner link' : by }));
      await rebuild(this.env.PREVIEW_HOOK);
      if (live) await rebuild(this.env.LIVE_HOOK);
      return { ok: true, saved: Object.keys(props).length + (members || 0), live };
    } catch (err) {
      if (!(err instanceof UserError)) console.error(`updateListing failed: ${err.message}`);
      return { ok: false, error: err instanceof UserError ? err.message : "Notion didn't accept the change. Try again in a minute." };
    }
  }

  // Charlie's Apply / Discard for an owner's changes to a live listing. trust: also tick Trusted Editor.
  async resolvePending(id, apply, by = '', trust = false) {
    try {
      const { page, schema, live } = await this.#load(id);
      const pending = readPending(page);
      if (!pending) return { ok: true, nothing: true };
      let props = {};
      if (apply) {
        props = await this.#buildProps(id, page, schema, pending.changes || {});
        await logChange(this.env, id, page, props, `${by} (applied owner edit)`);
      }
      await notion(this.env, `pages/${dashless(id)}`, { properties: {
        ...props, 'Pending Edits': { rich_text: [] }, 'Pending Edits On': { date: null },
        ...(apply && trust ? { 'Trusted Editor': { checkbox: true } } : {}),
      } }, 'PATCH');
      if (apply && pending.changes?.members) await this.#saveMembers(id, page, pending.changes.members, 'owner link');
      console.log(JSON.stringify({ admin: apply ? 'applyPending' : 'discardPending', id: dashless(id), by }));
      await rebuild(this.env.PREVIEW_HOOK);
      if (apply && live) await rebuild(this.env.LIVE_HOOK);
      return { ok: true, applied: apply, trusted: Boolean(apply && trust) };
    } catch (err) {
      console.error(`resolvePending failed: ${err.message}`);
      return { ok: false, error: err instanceof UserError ? err.message : "Notion didn't accept the change. Try again in a minute." };
    }
  }

  // Send the edit link: to whoever asked (claim request), else the owner or the email on file.
  async sendEditLink(id, by = '', fresh = false) {
    try {
      const { page } = await this.#load(id);
      const pid = dashless(id);
      const claim = JSON.parse((await this.env.PHOTOS.get(`_claim/${pid}`)) || 'null');
      const email = claim?.email || page.properties['Owner Email']?.email || (await onFileEmails(this.env, page))[0] || '';
      if (!email) return { ok: false, error: 'No email on file. Add Owner Email in Notion first.' };
      const link = await giveEditLink(this.env, pid, page, email, fresh);
      await this.env.PHOTOS.delete(`_claim/${pid}`);
      console.log(JSON.stringify({ admin: 'sendEditLink', id: pid, email, fresh, by }));
      if (claim) await rebuild(this.env.PREVIEW_HOOK);
      return { ok: true, email, link };
    } catch (err) {
      return { ok: false, error: err instanceof UserError ? err.message : "Notion didn't accept the change. Try again in a minute." };
    }
  }

  async dismissClaim(id, by = '') {
    try {
      await this.#load(id);
      const pid = dashless(id);
      await this.env.PHOTOS.delete(`_claim/${pid}`);
      await notion(this.env, `pages/${pid}`, { properties: { 'Claim Request': { rich_text: [] } } }, 'PATCH');
      console.log(JSON.stringify({ admin: 'dismissClaim', id: pid, by }));
      await rebuild(this.env.PREVIEW_HOOK);
      return { ok: true };
    } catch {
      return { ok: false, error: "Notion didn't accept the change. Try again in a minute." };
    }
  }

  // Turns the edit link off right away (new secret nobody has) and un-trusts the owner.
  async revokeEditLink(id, by = '') {
    try {
      await this.#load(id);
      const pid = dashless(id);
      const token = newShareToken();
      await notion(this.env, `pages/${pid}`, { properties: {
        'Share Token': { rich_text: [{ text: { content: token } }] }, 'Share Link': { url: shareUrl(token) },
        'Edit Link': { url: null }, 'Trusted Editor': { checkbox: false },
      } }, 'PATCH');
      console.log(JSON.stringify({ admin: 'revokeEditLink', id: pid, by }));
      await rebuild(this.env.PREVIEW_HOOK);
      return { ok: true };
    } catch {
      return { ok: false, error: "Notion didn't accept the change. Try again in a minute." };
    }
  }

  async undoLast(id, by = '') {
    try {
      const { live } = await this.#load(id);
      const pid = dashless(id);
      const { keys } = await this.env.PHOTOS.list({ prefix: `_log/${pid}/`, limit: 1 });
      if (!keys.length) return { ok: false, error: 'No saved changes to undo.' };
      const entry = JSON.parse((await this.env.PHOTOS.get(keys[0].name)) || 'null');
      if (!entry?.before) return { ok: false, error: "That change can't be undone." };
      await notion(this.env, `pages/${pid}`, { properties: entry.before }, 'PATCH');
      await this.env.PHOTOS.delete(keys[0].name);
      console.log(JSON.stringify({ admin: 'undoLast', id: pid, fields: Object.keys(entry.before), by }));
      await rebuild(this.env.PREVIEW_HOOK);
      if (live) await rebuild(this.env.LIVE_HOOK);
      return { ok: true, undid: Object.keys(entry.before), from: entry.by, at: entry.at };
    } catch {
      return { ok: false, error: "Notion didn't accept the change. Try again in a minute." };
    }
  }

  async changeLog(id) {
    try {
      await this.#load(id);
      const { keys } = await this.env.PHOTOS.list({ prefix: `_log/${dashless(id)}/`, limit: 5 });
      const items = [];
      for (const k of keys) { const e = JSON.parse((await this.env.PHOTOS.get(k.name)) || 'null'); if (e) items.push({ at: e.at, by: e.by, fields: e.fields }); }
      return { ok: true, items };
    } catch {
      return { ok: false, error: "Couldn't read the change log." };
    }
  }
}
