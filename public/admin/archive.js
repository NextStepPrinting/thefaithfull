import { todayInZone } from '../scripts/events-core.js';

const columns = [
  ['date', 'Show date'], ['venue', 'Venue'], ['city', 'City'], ['status', 'Status'],
  ['map_url', 'Map link'], ['tickets_url', 'Ticket link'],
  ['notes', 'Public show details'], ['internal_notes', 'Private booking notes']
];

function cell(value = '') {
  // Treat formula-looking values as text when opened in a spreadsheet.
  const literal = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${literal.replaceAll('"', '""')}"`;
}

export function pastShowsCsv(events, now = new Date()) {
  const cutoff = todayInZone(now);
  const past = events.filter(event => event.date < cutoff).sort((a, b) => b.date.localeCompare(a.date));
  if (!past.length) return '';
  return '\uFEFF' + [columns.map(([, title]) => cell(title)).join(','),
    ...past.map(event => columns.map(([key]) => cell(event[key])).join(','))].join('\r\n') + '\r\n';
}
