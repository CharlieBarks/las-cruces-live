export function GET() {
  const preview = process.env.LIVE_PREVIEW === '1';
  const body = preview
    ? 'User-agent: *\nDisallow: /\n'
    : 'User-agent: *\nAllow: /\n\nSitemap: https://lascruceslive.com/sitemap-index.xml\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
