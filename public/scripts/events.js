import { publicShows, todayInZone, validateEvents } from './events-core.js';

const list = document.querySelector('#events-list');
const emptyMessage = 'More shows coming soon.';
let loading = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(url, label, className) {
  const anchor = element('a', label, className);
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

function showCard(show) {
  const card = element('article', '', 'event');
  const [year, month, day] = show.date.split('-');
  const date = element('time', `${month}.${day}.${year.slice(-2)}`);
  date.dateTime = show.date;
  const actions = element('div', '', 'event-links');
  if (show.tickets_url) actions.append(link(show.tickets_url, 'Info & Tickets', 'ticket'));
  const city = element('p', show.map_url ? '' : show.city);
  if (show.map_url) {
    const directions = link(show.map_url, show.city, 'event-map-link');
    directions.setAttribute('aria-label', `${show.city} — directions (opens in a new tab)`);
    const arrow = element('span', ' ↗');
    arrow.setAttribute('aria-hidden', 'true');
    directions.append(arrow);
    city.append(directions);
  }
  card.append(date, element('h3', show.venue || 'Venue to be announced'),
    city, actions);
  if (show.notes) card.append(element('p', show.notes, 'event-notes'));
  return card;
}

async function loadSchedule() {
  for (const time of list.querySelectorAll('.event time')) {
    if (time.dateTime < todayInZone()) time.closest('.event').remove();
  }
  if (!list.children.length) list.append(element('p', emptyMessage));
  if (loading) return;
  loading = true;
  try {
    const response = await fetch('/api/events', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return;
    const { events } = await response.json();
    if (events === null) return;
    const cards = publicShows(validateEvents(events)).map(showCard);
    list.replaceChildren(...(
      cards.length ? cards : [element('p', emptyMessage)]
    ));
  } catch {
    // Keep the build-time schedule if the live schedule is unavailable.
  } finally {
    loading = false;
  }
}

loadSchedule();
setInterval(loadSchedule, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadSchedule(); });
