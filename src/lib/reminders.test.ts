import { describe, expect, it } from 'vitest';
import { isPushEndpoint, reminderMessage } from './reminders';

describe('reminderMessage', () => {
  it('combines cards and the next thing', () => {
    expect(reminderMessage({ cards: 6, minutes: 4, next: 'Binary search' })?.body).toBe('6 cards, about 4 min. Then: Binary search');
  });

  it('handles one card', () => {
    expect(reminderMessage({ cards: 1, minutes: 1, next: null })?.body).toBe('1 card, about 1 min');
  });

  it('works with no cards due', () => {
    expect(reminderMessage({ cards: 0, minutes: 1, next: 'Binary search' })?.body).toBe('Next up: Binary search');
  });

  it('sends nothing when there is nothing to do', () => {
    expect(reminderMessage({ cards: 0, minutes: 1, next: null })).toBeNull();
  });
});

describe('isPushEndpoint', () => {
  it.each(['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://db5p.notify.windows.com/w/?token=x'])('accepts %s', (url) => {
    expect(isPushEndpoint(url)).toBe(true);
  });

  it.each(['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://fcm.googleapis.com.evil.test/x', 'not a url', 42])('refuses %s', (url) => {
    expect(isPushEndpoint(url)).toBe(false);
  });
});
