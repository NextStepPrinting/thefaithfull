import { validateEvents, validateVenues, seedVenues, decodeSchedule, publicShows } from '../../public/scripts/events-core.js';

// Allowlist public fields so future private fields cannot leak through the API.
function publicEvent({ date, venue, city, notes, map_url, tickets_url, status }) {
  return { date, venue, city, notes, map_url, tickets_url, status };
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  } });
}

async function authorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const token = request.headers.get('Authorization') || '';
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(token), digest(`Bearer ${secret}`)]);
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0;
}

export async function onRequest({ request, env }) {
  const { method } = request;
  if (!['GET', 'PUT'].includes(method)) return json({ error: 'Method not allowed.' }, 405);
  const admin = new URL(request.url).searchParams.get('admin') === '1';
  if ((method === 'PUT' || admin) && !await authorized(request, env.ADMIN_TOKEN)) {
    return json({ error: 'The sign-in key is incorrect or has not been configured.' }, 401);
  }
  if (!env.EVENTS_DB) return json({ error: 'Event storage is not connected. Complete the Cloudflare setup in README.md.' }, 503);
  try {
    if (method === 'GET') {
      const row = await env.EVENTS_DB.prepare('SELECT events, revision FROM schedule WHERE id = 1').first();
      if (!row) return json({ events: null, revision: 0, ...(admin ? { venues: null } : {}) });
      // Only authenticated responses include the catalog, including unpublished venues.
      // Public reads also tolerate the legacy array format without generating venue IDs.
      const stored = JSON.parse(row.events);
      const events = validateEvents(Array.isArray(stored) ? stored : stored.events);
      return json({ events: admin ? events : publicShows(events).map(publicEvent),
        revision: row.revision, ...(admin ? { venues: decodeSchedule(row.events).venues } : {}) });
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed.' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Send JSON.' }, 415);
    if (Number(request.headers.get('Content-Length')) > 1000000) return json({ error: 'Schedule is too large.' }, 413);
    const text = await request.text();
    if (text.length > 1000000) return json({ error: 'Schedule is too large.' }, 413);
    let body, events, venues;
    try {
      body = JSON.parse(text);
      events = validateEvents(body.events);
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('Reload the schedule before saving.');
      if (body.venues !== undefined) venues = validateVenues(body.venues);
    } catch (error) { return json({ error: error.message }, 400); }
    // Older open manager tabs may omit venues. Preserve the stored catalog in that case.
    if (venues === undefined) {
      const current = await env.EVENTS_DB.prepare('SELECT events, revision FROM schedule WHERE id = 1').first();
      venues = current ? decodeSchedule(current.events).venues : seedVenues(events);
    }
    const payload = JSON.stringify({ events, venues });
    if (payload.length > 1000000) return json({ error: 'Schedule is too large.' }, 413);
    // One conditional write saves shows and venues together, including catalog-only edits.
    const statement = body.revision === 0
      ? env.EVENTS_DB.prepare('INSERT OR IGNORE INTO schedule (id, events, revision) VALUES (1, ?, 1)').bind(payload)
      : env.EVENTS_DB.prepare('UPDATE schedule SET events = ?, revision = revision + 1 WHERE id = 1 AND revision = ?').bind(payload, body.revision);
    const result = await statement.run();
    if (!result.meta.changes) return json({ error: 'Someone else updated the schedule. Reload before saving again.' }, 409);
    return json({ revision: body.revision + 1 });
  } catch (error) {
    console.error('Event storage failed:', error.message);
    return json({ error: 'Event storage is unavailable. Check the database binding and schema.' }, 503);
  }
}
