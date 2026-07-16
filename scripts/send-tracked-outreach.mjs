#!/usr/bin/env node
/**
 * Send a tracked outreach email via live admin API.
 * Usage (with Railway env / ADMIN_API_KEY + APP_URL):
 *   node scripts/send-tracked-outreach.mjs \
 *     --to=user@example.com \
 *     --subject="Hello" \
 *     --campaign=sunny_nudge \
 *     --destination=https://www.heirready.com/app \
 *     --cta="Open HeirReady" \
 *     --html-file=./body.html
 *
 * Or pass --text="..." / --html="..."
 */
import fs from 'fs';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const to = arg('to');
const subject = arg('subject');
const campaign = arg('campaign', 'outreach');
const destination = arg('destination');
const ctaLabel = arg('cta', 'Open HeirReady');
const name = arg('name', '');
const htmlFile = arg('html-file');
const textFile = arg('text-file');
let html = arg('html');
let text = arg('text');
if (htmlFile) html = fs.readFileSync(htmlFile, 'utf8');
if (textFile) text = fs.readFileSync(textFile, 'utf8');

const base = (process.env.APP_URL || 'https://www.heirready.com').replace(/\/$/, '');
const key = process.env.ADMIN_API_KEY;
if (!key) {
  console.error('ADMIN_API_KEY required');
  process.exit(1);
}
if (!to || !subject || !destination) {
  console.error('Required: --to --subject --destination');
  process.exit(1);
}

const res = await fetch(`${base}/api/admin/outreach-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Key': key,
  },
  body: JSON.stringify({
    to,
    subject,
    campaign,
    destination,
    ctaLabel,
    name: name || undefined,
    html: html || undefined,
    text: text || undefined,
  }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('FAILED', res.status, data.error || data);
  process.exit(1);
}
console.log('SENT_TRACKED', JSON.stringify(data));
