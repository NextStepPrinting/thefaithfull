export const TIME_ZONE = 'America/Los_Angeles';
export const STATUSES = ['confirmed', 'hidden', 'cancelled', 'draft', 'private'];

export function todayInZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function publicShows(events, now = new Date()) {
  const today = todayInZone(now);
  return events.filter(show => show.status === 'confirmed' && show.date >= today);
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function validateEvents(events) {
  if (!Array.isArray(events) || events.length > 200) throw new Error('Use a list of at most 200 shows.');
  return events.map((event, index) => {
    const fail = message => { throw new Error(`Show ${index + 1}: ${message}`); };
    if (!event || typeof event !== 'object') fail('invalid show.');
    if (!validDate(event.date)) fail('use a valid date in YYYY-MM-DD format.');
    const result = { date: event.date };
    for (const key of ['venue', 'city', 'notes', 'internal_notes', 'map_url', 'tickets_url', 'status']) {
      if (event[key] !== undefined && typeof event[key] !== 'string') fail(`${key} must be text.`);
      result[key] = (event[key] || '').trim();
      if (result[key].length > (['notes', 'internal_notes'].includes(key) ? 2000 : 1000)) fail(`${key} is too long.`);
    }
    if (!result.city) fail('city is required.');
    result.status ||= 'confirmed';
    if (!STATUSES.includes(result.status)) fail('choose a valid status.');
    for (const key of ['map_url', 'tickets_url']) {
      if (result[key] && !safeUrl(result[key])) fail(`${key} must start with https:// or http://.`);
    }
    if (result.tickets_url && new URL(result.tickets_url).protocol !== 'https:') fail('ticket links must use HTTPS.');
    return result;
  });
}

// Venue records are independent of show snapshots; deleting one never edits a show.
export function venueKey(venue) {
  return JSON.stringify([venue.venue.trim().toLowerCase(), venue.city.trim().toLowerCase()]);
}

export function validateVenues(venues) {
  if (!Array.isArray(venues) || venues.length > 500) throw new Error('Use a list of at most 500 venues.');
  const ids = new Set(), locations = new Set();
  return venues.map(venue => {
    if (!venue || typeof venue !== 'object' || typeof venue.id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(venue.id) || ids.has(venue.id)) throw new Error('Invalid or duplicate venue ID.');
    const result = { id: venue.id };
    for (const field of ['venue', 'city', 'map_url']) {
      if (typeof venue[field] !== 'string' || venue[field].length > 1000) throw new Error('Venue details must be text of at most 1000 characters.');
      result[field] = venue[field].trim();
    }
    if (!result.venue || !result.city) throw new Error('Each saved venue needs a name and city.');
    if (result.map_url && !safeUrl(result.map_url)) throw new Error('Venue map links must start with https:// or http://.');
    const location = venueKey(result);
    if (locations.has(location)) throw new Error('A venue with that name and city already exists.');
    ids.add(result.id); locations.add(location);
    return result;
  }).sort((a, b) => a.venue.localeCompare(b.venue, 'en', { sensitivity: 'base' }) || a.city.localeCompare(b.city, 'en', { sensitivity: 'base' }));
}

export function seedVenues(events) {
  const unique = new Map();
  for (const event of events) {
    if (!event.venue) continue;
    const location = venueKey(event);
    if (!unique.has(location)) unique.set(location, {
      id: crypto.randomUUID(), venue: event.venue, city: event.city, map_url: event.map_url || ''
    });
  }
  return validateVenues([...unique.values()]);
}

export function decodeSchedule(text) {
  const stored = JSON.parse(text);
  const events = validateEvents(Array.isArray(stored) ? stored : stored.events);
  return { events, venues: Array.isArray(stored) ? seedVenues(events) : validateVenues(stored.venues) };
}
