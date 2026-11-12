import { STATUSES, todayInZone, validateEvents, validateVenues, seedVenues, venueKey } from '../scripts/events-core.js';

import { pastShowsCsv } from './archive.js';

const $ = id => document.getElementById(id);
let key = '', revision = 0, dirty = false, busy = false, venues = [], savedEvents = [];
const cardsInScheduleOrder = new Set();
const message = value => { $('message').textContent = value; };
const changed = () => { dirty = true; message('Unsaved changes. Select Save schedule to save shows and venues.'); };

async function api(method = 'GET', body) {
  const response = await fetch('/api/events?admin=1', {
    method, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({ error: 'The show manager is not connected yet. Complete the Cloudflare setup in README.md.' }));
  if (!response.ok) throw new Error(result.error || 'Could not connect. Please try again.');
  return result;
}

function option(value, text) {
  const item = document.createElement('option');
  item.value = value; item.textContent = text;
  return item;
}

function populatePicker(card) {
  const picker = card.querySelector('[data-venue-picker]');
  const selected = picker.value;
  picker.replaceChildren(option('', 'Choose a venue'), option('pending', 'Venue to be announced'), option('new', '+ Add New Venue'));
  const sorted = [...venues].sort((a, b) => a.venue.localeCompare(b.venue, 'en', { sensitivity: 'base' }) || a.city.localeCompare(b.city, 'en', { sensitivity: 'base' }));
  for (const venue of sorted) picker.append(option(venue.id, `${venue.venue} — ${venue.city}`));
  // A removed or edited venue must not overwrite the details of an existing show.
  const currentDetails = option('snapshot', 'Current show details');
  currentDetails.hidden = true;
  currentDetails.disabled = true;
  picker.append(currentDetails);
  picker.value = ['new', 'pending'].includes(selected) || venues.some(venue => venue.id === selected) ? selected : 'snapshot';
}

function showCards() {
  return [...cardsInScheduleOrder];
}

function groupShowCards() {
  const today = todayInZone();
  for (const card of showCards()) {
    const date = card.querySelector('[name=date]').value;
    const group = $(date && date < today ? 'past-events' : 'events');
    if (card.parentElement !== group) group.append(card);
  }
}

function refreshPickers() {
  for (const card of showCards()) populatePicker(card);
}

function renderVenues() {
  $('venue-list').replaceChildren();
  $('venue-count').textContent = `${venues.length} saved venue${venues.length === 1 ? '' : 's'}`;
  for (const venue of [...venues].sort((a, b) => a.venue.localeCompare(b.venue, 'en', { sensitivity: 'base' }))) {
    const card = document.createElement('article');
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const [field, title, type] of [['venue', 'Venue name', 'text'], ['city', 'City, state', 'text'], ['map_url', 'Map link (optional)', 'url']]) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input');
      input.type = type; input.value = venue[field]; input.maxLength = 1000; input.required = field !== 'map_url';
      input.addEventListener('input', () => {
        if (field === 'map_url') {
          for (const show of showCards()) {
            const location = Object.fromEntries(['venue', 'city'].map(name => [name, show.querySelector(`[name="${name}"]`).value]));
            if (venueKey(location) === venueKey(venue)) show.querySelector('[name="map_url"]').value = input.value;
          }
        }
        venue[field] = input.value;
        changed();
      });
      input.addEventListener('change', refreshPickers);
      label.append(input); grid.append(label);
    }
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'secondary remove'; remove.textContent = 'Delete saved venue';
    remove.addEventListener('click', () => {
      if (!confirm(`Delete ${venue.venue} from the venue picker? Existing shows will keep their details. Save schedule to apply.`)) return;
      venues = venues.filter(item => item.id !== venue.id);
      renderVenues(); refreshPickers(); changed();
    });
    card.append(grid, remove); $('venue-list').append(card);
  }
}

function addShow(event = { date: todayInZone(), status: 'draft' }) {
  const card = document.createElement('article');
  const grid = document.createElement('div'); grid.className = 'grid';
  const pickerLabel = document.createElement('label'); pickerLabel.className = 'full'; pickerLabel.textContent = 'Location';
  const picker = document.createElement('select'); picker.dataset.venuePicker = ''; picker.required = true;
  pickerLabel.append(picker); grid.append(pickerLabel);
  for (const [name, title, type, required] of [
    ['date', 'Show date', 'date', true], ['status', 'Visibility', 'select', true],
    ['venue', 'Venue / event name (optional)', 'text', false], ['city', 'City, state', 'text', true],
    ['map_url', 'Map link (optional)', 'url', false], ['tickets_url', 'Tickets / venue link (optional)', 'url', false],
    ['notes', 'Public show details (optional)', 'textarea', false],
    ['internal_notes', 'Private booking notes (manager only)', 'textarea', false]
  ]) {
    const label = document.createElement('label'); label.textContent = title;
    if (type === 'textarea') label.className = 'full';
    const input = document.createElement(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
    input.name = name;
    if (input.tagName === 'INPUT') input.type = type;
    if (type === 'select') for (const status of STATUSES) input.append(option(status, status[0].toUpperCase() + status.slice(1)));
    input.required = required;
    if (type !== 'select') input.maxLength = type === 'textarea' ? 2000 : 1000;
    input.value = event[name] || '';
    input.addEventListener('input', () => {
      if (['venue', 'city', 'map_url'].includes(name) && picker.value !== 'new') picker.value = 'snapshot';
      changed();
    });
    label.append(input); grid.append(label);
  }
  picker.addEventListener('change', () => {
    const selected = venues.find(venue => venue.id === picker.value);
    if (picker.value === 'pending') {
      card.querySelector('[name=venue]').value = '';
      card.querySelector('[name=map_url]').value = '';
    }
    if (selected || picker.value === 'new') {
      for (const field of ['venue', 'city', 'map_url']) card.querySelector(`[name="${field}"]`).value = selected?.[field] || '';
    }
    changed();
    if (picker.value === 'new') card.querySelector('[name="venue"]').focus();
  });
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'secondary remove'; remove.textContent = 'Remove show';
  remove.addEventListener('click', () => {
    if (!confirm('Remove this show? Its saved venue will stay available. The change takes effect when you save the schedule.')) return;
    cardsInScheduleOrder.delete(card);
    card.remove(); changed();
  });
  card.append(grid, remove); $('events').append(card);
  cardsInScheduleOrder.add(card);
  populatePicker(card);
  const match = event.venue && venues.find(venue => venueKey(venue) === venueKey(event) && venue.map_url === (event.map_url || ''));
  picker.value = match ? match.id : event.venue ? 'snapshot' : event.city ? 'pending' : '';
  return card;
}

async function load() {
  const result = await api();
  let events = result.events;
  if (events === null) {
    const response = await fetch('/data/events.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the starting schedule.');
    events = (await response.json()).map(({ date, venue, location, url }) => ({
      date, venue, city: location, tickets_url: url, status: 'confirmed',
    }));
  }
  events = validateEvents(events);
  savedEvents = result.events === null ? [] : events;
  venues = result.venues === null ? seedVenues(events) : validateVenues(result.venues);
  revision = result.revision;
  $('events').replaceChildren();
  $('past-events').replaceChildren();
  $('past-shows').open = false;
  cardsInScheduleOrder.clear();
  events.forEach(addShow);
  groupShowCards();
  renderVenues(); dirty = false;
  $('login-panel').hidden = true; $('manager').hidden = false;
  message(result.events === null ? 'Starting schedule loaded. Save it to activate the show manager.' : 'Saved schedule and venues loaded.');
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('button, input, textarea, select').forEach(element => { element.disabled = value; });
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); key = $('key').value.trim();
  setBusy(true); message('Signing in…');
  try { await load(); $('key').value = ''; }
  catch (error) { key = ''; message(error.message); }
  finally { setBusy(false); }
});
$('add').addEventListener('click', () => {
  const card = addShow(); changed(); card.querySelector('select').focus();
});
$('save').addEventListener('click', async () => {
  if (busy) return;
  for (const field of $('manager').querySelectorAll('input, textarea, select')) {
    if (!field.checkValidity()) {
      const details = field.closest('details'); if (details) details.open = true;
      field.reportValidity(); return;
    }
  }
  try {
    const cards = showCards();
    const events = validateEvents(cards.map(card => Object.fromEntries(
      [...card.querySelectorAll('[name]')].map(field => [field.name, field.value])
    )));
    const nextVenues = validateVenues(venues);
    cards.forEach((card, index) => {
      if (card.querySelector('[data-venue-picker]').value !== 'new' || !events[index].venue) return;
      const event = events[index];
      if (!nextVenues.some(venue => venueKey(venue) === venueKey(event))) nextVenues.push({
        id: crypto.randomUUID(), venue: event.venue, city: event.city, map_url: event.map_url
      });
    });
    const catalog = validateVenues(nextVenues);
    if (!events.some(event => event.status === 'confirmed' && event.date >= todayInZone()) &&
      !confirm('This schedule has no upcoming confirmed shows. Save it anyway?')) return;
    setBusy(true); message('Saving…');
    const result = await api('PUT', { events, venues: catalog, revision });
    revision = result.revision; venues = catalog; savedEvents = events;
    // Keep newly saved venues from being added again if they are later removed from the catalog.
    for (const card of cards) {
      const picker = card.querySelector('[data-venue-picker]');
      const event = events[cards.indexOf(card)];
      const match = venues.find(venue => venueKey(venue) === venueKey(event));
      populatePicker(card);
      if (picker.value === 'new') picker.value = match?.id || 'snapshot';
    }
    groupShowCards();
    renderVenues(); dirty = false;
    message('Schedule and venues saved. Your shows are ready on the website.');
  } catch (error) { message(error.message); }
  finally { setBusy(false); }
});
$('download-past').addEventListener('click', () => {
  const csv = pastShowsCsv(savedEvents);
  if (!csv) { message('There are no saved past shows to download yet.'); return; }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const download = Object.assign(document.createElement('a'), {
    href: url, download: `the-faithfull-past-shows-${todayInZone()}.csv`
  });
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  message('Past shows downloaded. The file includes private booking notes.');
});
$('reload').addEventListener('click', async () => {
  if (dirty && !confirm('Discard your unsaved show and venue edits and reload?')) return;
  setBusy(true);
  try { await load(); } catch (error) { message(error.message); }
  finally { setBusy(false); }
});
$('logout').addEventListener('click', () => {
  if (dirty && !confirm('Sign out and discard your unsaved edits?')) return;
  key = ''; revision = 0; dirty = false; venues = []; savedEvents = [];
  cardsInScheduleOrder.clear();
  $('events').replaceChildren(); $('past-events').replaceChildren(); $('venue-list').replaceChildren(); $('venue-count').textContent = ''; $('key').value = '';
  $('manager').hidden = true; $('login-panel').hidden = false;
  message('Signed out.'); $('key').focus();
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
