// Runs after the preview site deploys (see the "Preview site" build in Cloudflare). Tells the
// intake Worker to email Grok Bot about any preview links, edit links or "you're live" emails that
// are now due. It runs after the deploy so every link already works when Grok Bot sends it.
// Never fails the build: if this misses, the intake Worker's 30-minute backup run catches it.
const key = process.env.INTAKE_KEY;
if (!key) {
  console.log('notify-grok: INTAKE_KEY not set, skipping');
} else {
  try {
    const res = await fetch(`https://lc-live-intake.cf2-99b.workers.dev/notify?key=${encodeURIComponent(key)}`, { method: 'POST', signal: AbortSignal.timeout(60000) });
    console.log(`notify-grok: ${res.status} ${(await res.text()).slice(0, 500)}`);
  } catch (err) {
    console.log(`notify-grok: ${err.message}`);
  }
}
