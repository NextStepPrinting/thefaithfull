const audienceId = '27b646a88d';
const mailchimpUrl = `https://us20.api.mailchimp.com/3.0/lists/${audienceId}/members`;
const turnstileSiteKey = '0x4AAAAAAF8SianXArA1vHcU';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function configured(env) {
  return Boolean(env.MAILCHIMP_API_KEY && env.TURNSTILE_SECRET_KEY);
}

export function onRequestGet({ env }) {
  return json({ siteKey: configured(env) ? turnstileSiteKey : null });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin) return json({ error: 'invalid' }, 403);
  if (!configured(env)) return json({ error: 'unavailable' }, 503);
  if (request.headers.get('Content-Type') !== 'application/json') return json({ error: 'invalid' }, 415);

  let data;
  try {
    const body = await request.text();
    if (body.length > 4096) return json({ error: 'invalid' }, 413);
    data = JSON.parse(body);
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const email = typeof data?.email === 'string' ? data.email.trim() : '';
  const token = data?.token;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'email' }, 400);
  }
  if (typeof token !== 'string' || !token || token.length > 2048 || data.trap) {
    return json({ error: 'verification' }, 400);
  }

  try {
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await verification.json();
    if (!verification.ok || result.success !== true || result.hostname !== url.hostname || result.action !== 'subscribe') {
      return json({ error: 'verification' }, 400);
    }

    // Create pending members only. Existing subscriptions and opt-outs stay intact.
    const response = await fetch(mailchimpUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`site:${env.MAILCHIMP_API_KEY}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_address: email, status: 'pending' }),
      signal: AbortSignal.timeout(8000),
    });
    const member = await response.json();
    if (response.ok && member.status === 'pending') return json({ status: 'pending' });
    if (response.ok && member.status === 'subscribed') return json({ status: 'subscribed' });
    if (response.status === 400 && ['Member Exists', 'Forgotten Email Not Subscribed', 'Member In Compliance State'].includes(member.title)) {
      return json({ status: 'handled' });
    }
    if (response.status === 400 && member.title === 'Invalid Resource') return json({ error: 'email' }, 400);
  } catch {
    // Do not expose upstream errors, credentials, or contact information.
  }
  return json({ error: 'unavailable' }, 502);
}
