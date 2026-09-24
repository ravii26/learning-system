import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/db', () => ({ db: { captureItem: { create: (...args: unknown[]) => create(...args) } } }));

import { POST } from './route';

const req = (body: unknown, auth?: string) =>
  new Request('http://localhost/api/capture-hook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/capture-hook', () => {
  const original = process.env.CAPTURE_TOKEN;

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: 'cap-1', createdAt: new Date() });
    process.env.CAPTURE_TOKEN = 'secret-token';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CAPTURE_TOKEN;
    else process.env.CAPTURE_TOKEN = original;
  });

  it('is disabled (404) when CAPTURE_TOKEN is not configured', async () => {
    delete process.env.CAPTURE_TOKEN;
    const res = await POST(req({ text: 'x' }, 'Bearer anything'));
    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong token with 401', async () => {
    expect((await POST(req({ text: 'x' }))).status).toBe(401);
    expect((await POST(req({ text: 'x' }, 'Bearer wrong'))).status).toBe(401);
    expect((await POST(req({ text: 'x' }, 'secret-token'))).status).toBe(401); // no "Bearer " prefix
    expect(create).not.toHaveBeenCalled();
  });

  it('captures a thought with a valid token', async () => {
    const res = await POST(req({ text: 'margin of safety' }, 'Bearer secret-token'));
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data).toMatchObject({ rawText: 'margin of safety', url: null, sourceType: 'thought', tags: ['mobile'] });
  });

  it('treats a bare URL sent as text (typical share sheet) as the URL', async () => {
    await POST(req({ text: 'https://example.com/a' }, 'Bearer secret-token'));
    expect(create.mock.calls[0][0].data).toMatchObject({ url: 'https://example.com/a', rawText: null, sourceType: 'article' });
  });

  it('rejects non-http URLs and empty payloads', async () => {
    expect((await POST(req({ url: 'javascript:alert(1)' }, 'Bearer secret-token'))).status).toBe(400);
    expect((await POST(req({}, 'Bearer secret-token'))).status).toBe(400);
    expect((await POST(req('not json', 'Bearer secret-token'))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('caps very long input', async () => {
    await POST(req({ text: 'a'.repeat(10000) }, 'Bearer secret-token'));
    expect(create.mock.calls[0][0].data.rawText.length).toBe(5000);
  });
});
