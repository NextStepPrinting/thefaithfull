import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/api/events.js';
import { publicShows, todayInZone, validateEvents, safeUrl, validDate } from '../public/scripts/events-core.js';

function assert(value, message = 'Assertion failed') { if (!value) throw new Error(message); }
const show = (overrides = {}) => ({ date: todayInZone(), venue: 'Coach House', city: 'San Juan Capistrano, CA', status: 'confirmed', ...overrides });

test('Pacific date boundaries for the manager and CSV archive', () => {
  assert(todayInZone(new Date('2026-11-23T07:59:59Z')) === '2026-11-22');
  assert(todayInZone(new Date('2026-11-23T08:00:00Z')) === '2026-11-23');
  assert(todayInZone(new Date('2026-07-19T06:59:59Z')) === '2026-07-18');
  const sameDay = show({ date: '2026-11-22' });
  const later = show({ date: '2026-11-24' });
  const events = [later, sameDay, show({ date: '2026-11-21' }), show({ date: '2026-11-24', status: 'draft' })];
  assert(JSON.stringify(publicShows(events, new Date('2026-11-23T07:59:59Z'))) === JSON.stringify([later, sameDay]));
  assert(JSON.stringify(publicShows(events, new Date('2026-11-23T08:00:00Z'))) === JSON.stringify([later]));
});

test('validation rejects executable links and incomplete shows', () => {
  assert(!safeUrl('javascript:alert(1)') && !safeUrl('data:text/html,hello'));
  for (const invalid of [show({ tickets_url: 'javascript:alert(1)' }), show({ city: '' }), show({ date: '2026-02-30' }), show({ status: 'unknown' })]) {
    let failed = false;
    try { validateEvents([invalid]); } catch { failed = true; }
    assert(failed);
  }
  assert(validateEvents([show({ notes: '<img onerror=alert(1)>' })])[0].notes.includes('<img'));
});

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  return { db, prepare(sql) {
    let parameters = [];
    return {
      bind(...values) { parameters = values; return this; },
      async first() { return db.prepare(sql).get(...parameters) || null; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...parameters).changes) } }; }
    };
  } };
}

test('API authorization, database saves, private records, empty schedules, and edit conflicts', async () => {
  const storage = database();
  const env = { EVENTS_DB: storage, ADMIN_TOKEN: 'a'.repeat(64) };
  const request = async (method = 'GET', body, { token = env.ADMIN_TOKEN, admin = false, origin } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const response = await onRequest({ env, request: new Request(`https://test.local/api/events${admin ? '?admin=1' : ''}`, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {})
    }) });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert((await request()).data.events === null);
    assert((await request('PUT', { events: [], revision: 0 }, { token: '' })).status === 401);
    assert((await request('GET', null, { admin: true, token: 'wrong' })).status === 401);
    assert((await request('PUT', { events: [], revision: 0 }, { origin: 'https://evil.local' })).status === 403);
    assert((await request('PUT', { events: [show({ date: 'bad' })], revision: 0 })).status === 400);
    const saved = await request('PUT', { events: [show(), show({ status: 'draft', notes: 'private' }), show({ date: '2000-01-01' })], revision: 0 });
    assert(saved.status === 200 && saved.data.revision === 1);
    assert((await request()).data.events.length === 1);
    assert((await request('GET', null, { admin: true })).data.events.length === 3);
    assert((await request('PUT', { events: [], revision: 0 })).status === 409);
    assert((await request('PUT', { events: [], revision: 1 })).data.revision === 2);
    assert((await request()).data.events.length === 0);
    assert((await request('PUT', { events: [show()], revision: 1 })).status === 409);
    assert((await request('POST')).status === 405);
    const unavailable = await onRequest({ env: {}, request: new Request('https://test.local/api/events') });
    assert(unavailable.status === 503);
  } finally { storage.db.close(); }
});

test('venue catalog migrates legacy shows, stays private, survives show deletion, and supports independent cleanup', async () => {
  const storage = database();
  const env = { EVENTS_DB: storage, ADMIN_TOKEN: 'v'.repeat(64) };
  const events = [show({ date: '2020-01-01' }), show({ status: 'draft', venue: 'Private Venue' }), show()];
  storage.db.prepare('INSERT INTO schedule (id, events, revision) VALUES (1, ?, 7)').run(JSON.stringify(events));
  const request = async (method = 'GET', body, admin = true, token = env.ADMIN_TOKEN) => {
    const response = await onRequest({ env, request: new Request(`https://test.local/api/events${admin ? '?admin=1' : ''}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const loaded = (await request()).data;
    assert(loaded.revision === 7 && loaded.events.length === 3);
    assert(loaded.venues.length === 2, 'Seed venues from past and draft shows, deduplicating by name/city');
    const publicResult = (await request('GET', null, false)).data;
    assert(!('venues' in publicResult) && !JSON.stringify(publicResult).includes('Private Venue'));
    assert((await request('GET', null, true, 'wrong')).status === 401);
    assert((await request('PUT', { events, venues: loaded.venues, revision: 7 })).status === 200);
    const persisted = (await request()).data;
    assert(persisted.venues[0].id === loaded.venues[0].id, 'IDs persist after the first save');
    // Legacy clients that omit the new property must preserve the saved catalog.
    assert((await request('PUT', { events: [], revision: 8 })).status === 200);
    assert((await request()).data.venues.length === 2, 'Deleting every show retains venues');
    const venue = persisted.venues[0];
    const edited = { ...venue, venue: 'Renamed Venue', map_url: 'https://example.com/map' };
    assert((await request('PUT', { events, venues: [edited], revision: 9 })).status === 200);
    const afterEdit = (await request()).data;
    assert(afterEdit.events[0].venue === 'Coach House', 'Editing a venue does not rewrite old shows');
    assert(afterEdit.venues[0].venue === 'Renamed Venue');
    assert((await request('PUT', { events: [], venues: [], revision: 9 })).status === 409, 'Stale venue saves conflict');
    assert((await request('PUT', { events, venues: [], revision: 10 })).status === 200);
    assert((await request()).data.venues.length === 0, 'Deleted venues do not reseed from old shows');
    assert((await request('PUT', { events, revision: 11 })).status === 200);
    assert((await request()).data.venues.length === 0, 'Legacy clients also preserve catalog deletions');
    for (const venues of [null, [{ ...venue, map_url: 'javascript:alert(1)' }], [venue, venue], [{ ...venue, city: '' }],
      [venue, { ...venue, id: 'different-id', venue: ' COACH HOUSE ' }]]) {
      assert((await request('PUT', { events, venues, revision: 12 })).status === 400, 'Invalid venues rejected');
      assert((await request()).data.revision === 12, 'Invalid data leaves stored schedule intact');
    }
  } finally { storage.db.close(); }
});


test('A show can be saved without a venue and does not create an invented venue', async () => {
  const storage = database();
  const env = { EVENTS_DB: storage, ADMIN_TOKEN: 'h'.repeat(64) };
  try {
    const response = await onRequest({ env, request: new Request('https://test.local/api/events', {
      method: 'PUT', headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 0, events: [show({ venue: '', city: 'Long Beach, CA', date: '2027-02-20' })] })
    }) });
    assert(response.status === 200);
    const result = await onRequest({ env, request: new Request('https://test.local/api/events?admin=1', { headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` } }) });
    const data = await result.json();
    assert(data.events[0].venue === '' && data.venues.length === 0);
  } finally { storage.db.close(); }
});

test('private booking notes persist only in authenticated reads, including for confirmed shows', async () => {
  const storage = database();
  const env = { EVENTS_DB: storage, ADMIN_TOKEN: 'p'.repeat(64) };
  const root = 'https://test.local/api/events';
  const auth = { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
  const request = (url, options) => onRequest({ env, request: new Request(url, options) });
  try {
    const save = await request(root, { method: 'PUT', headers: auth, body: JSON.stringify({ revision: 0,
      events: [show({ notes: 'Public details', internal_notes: 'Private booking test value' })] }) });
    assert(save.status === 200);
    const publicResponse = await request(root);
    const { events } = await publicResponse.json();
    assert(events[0].notes === 'Public details');
    assert(!Object.hasOwn(events[0], 'internal_notes'));
    assert((await request(`${root}?admin=1`)).status === 401);
    const privateResponse = await request(`${root}?admin=1`, { headers: auth });
    assert(privateResponse.headers.get('Cache-Control') === 'no-store');
    assert((await privateResponse.json()).events[0].internal_notes === 'Private booking test value');
  } finally { storage.db.close(); }
});

test('CSV export includes saved past shows, escapes spreadsheet formulas and omits today and future shows', async () => {
  const { pastShowsCsv } = await import('../public/admin/archive.js');
  const now = new Date('2027-03-01T08:00:00Z');
  const csv = pastShowsCsv([
    show({ date: '2027-02-20', internal_notes: ' =HYPERLINK("https://example.test")' }),
    show({ date: '2027-03-01', venue: 'Today test venue' }),
    show({ date: '2027-03-02', venue: 'Future test venue' })
  ], now);
  assert(csv.includes('Private booking notes'));
  assert(csv.includes('2027-02-20') && !csv.includes('Today test venue') && !csv.includes('Future test venue'));
  assert(csv.includes(`' =HYPERLINK(""https://example.test"")`));
  assert(pastShowsCsv([], now) === '');
});
