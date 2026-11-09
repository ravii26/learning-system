import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The reminder job is closed without its secret and sends at most once a day. */

const sendNotification = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));
vi.mock('@/lib/focusData', async (original) => ({ ...(await original<typeof import('@/lib/focusData')>()), loadFocus: async () => [] }));

const state: { devices: any[]; sentDay: string | null; dueCards: number; deleted: string[] } = { devices: [], sentDay: null, dueCards: 3, deleted: [] };

vi.mock('@/lib/db', () => ({
  db: {
    pushSubscription: {
      findMany: async () => state.devices,
      deleteMany: async ({ where }: any) => { state.deleted.push(where.id); },
    },
    user: {
      findMany: async () => [{ id: 'u1', reminderSentDay: state.sentDay }],
      update: async ({ data }: any) => { state.sentDay = data.reminderSentDay; },
    },
    concept: { count: async () => state.dueCards },
    reviewLog: { findMany: async () => [] },
  },
}));

const call = (auth?: string) => new Request('http://x/api/cron/reminders', auth ? { headers: { authorization: auth } } : undefined);
const load = () => import('./cron/reminders/route');

beforeEach(() => {
  sendNotification.mockClear();
  state.devices = [{ id: 'd1', userId: 'u1', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'k', auth: 'a', tz: 0 }];
  state.sentDay = null;
  state.dueCards = 3;
  state.deleted = [];
  process.env.CRON_SECRET = 'secret';
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_SUBJECT = 'https://example.test';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

describe('GET /api/cron/reminders', () => {
  it('does not exist when no secret is set', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await load();
    expect((await GET(call('Bearer anything'))).status).toBe(404);
  });

  it('refuses the wrong secret', async () => {
    const { GET } = await load();
    expect((await GET(call('Bearer nope'))).status).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends the reminder once, and a retry the same day does nothing', async () => {
    const { GET } = await load();
    expect(await (await GET(call('Bearer secret'))).json()).toEqual({ sent: 1, skipped: 0 });
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string).body).toContain('3 cards');
    expect(await (await GET(call('Bearer secret'))).json()).toEqual({ sent: 0, skipped: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when there is nothing to do', async () => {
    state.dueCards = 0;
    const { GET } = await load();
    expect(await (await GET(call('Bearer secret'))).json()).toEqual({ sent: 0, skipped: 1 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('forgets a device the browser says is gone', async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const { GET } = await load();
    await GET(call('Bearer secret'));
    expect(state.deleted).toEqual(['d1']);
    expect(state.sentDay).toBeNull();
  });
});
