/** The daily reminder: what it says, and which push services it may reach. Client-safe. */

export interface ReminderMessage {
  title: string;
  body: string;
}

export function reminderMessage(input: { cards: number; minutes: number; next: string | null }): ReminderMessage | null {
  const title = 'Today’s list';
  const cards = input.cards > 0 ? `${input.cards} card${input.cards === 1 ? '' : 's'}, about ${input.minutes} min` : null;
  if (cards && input.next) return { title, body: `${cards}. Then: ${input.next}` };
  if (cards) return { title, body: cards };
  if (input.next) return { title, body: `Next up: ${input.next}` };
  return null;
}

// The server sends to whatever address a browser reports, so only real
// browser push services are accepted; anything else could point it at
// something internal.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}
