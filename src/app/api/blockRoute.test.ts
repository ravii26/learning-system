import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Rewriting one section of a saved lesson: the learner's own chat (free) or
 * the app's AI. Either way the reply must be the same kind of section, and
 * only that section changes.
 */

const aiCalls: any[][] = [];
let aiReply = '';
vi.mock('@/lib/ai/aiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/aiClient')>()),
  hasAnyAIProviderConfigured: () => true,
  callAIContent: async (...a: any[]) => { aiCalls.push(a); return { content: aiReply, provider: 'test' }; },
}));
const manualLogs: string[] = [];
vi.mock('@/lib/ai/callLog', () => ({
  logManualImport: async (purpose: string) => { manualLogs.push(purpose); },
  logAttempts: async () => {},
  assertWithinDailyBudget: async () => {},
}));
vi.mock('@/lib/rateLimit', () => ({ aiQuotaGate: async () => null, consumeAiQuota: async () => {} }));
vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: 'u1' }) }));

const table = { type: 'comparison_table', title: 'Stacks', options: ['Next.js', 'Rails'], rows: [{ criterion: 'Cost', cells: [{ text: 'spiky' }, { text: 'steady' }] }] };
const flow = { type: 'decision_flow', title: 'Pick', start: 'q', nodes: [{ id: 'q', question: 'SEO?', yes: 'a', no: 'b' }, { id: 'a', outcome: 'Next.js' }, { id: 'b', outcome: 'Rails' }] };
const row: { content: any; found: boolean; updates: any[] } = { content: null, found: true, updates: [] };
vi.mock('@/lib/db', () => ({
  db: {
    generatedLesson: {
      findFirst: async () => (row.found ? { id: 'l1', moduleTitle: 'Choosing a stack', content: row.content } : null),
      update: async ({ data }: any) => { row.updates.push(data.content); row.content = data.content; },
    },
    topic: { findFirst: async () => ({ title: 'Web architecture', contract: { currentLevel: 'beginner' } }) },
  },
}));

const post = (body: unknown) => new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ctx = { params: { id: 't1', moduleId: 'm1' } };
const fence = (v: unknown) => `Here you go:\n\`\`\`json\n${JSON.stringify(v)}\n\`\`\``;
const newFlow = { ...flow, title: 'Better pick' };

beforeEach(() => {
  aiCalls.length = 0;
  aiReply = '';
  manualLogs.length = 0;
  row.found = true;
  row.updates.length = 0;
  row.content = { summary: 'S', explanation: 'E', kind: 'decision', blocks: [table, flow] };
});

describe('rewrite one section', () => {
  it('manual: gives a prompt about that section only, without calling the AI', async () => {
    const { POST } = await import('./topics/[id]/modules/[moduleId]/block/route');
    const d = await (await POST(post({ index: 1, mode: 'manual', step: 'prompt' }), ctx)).json();
    expect(d.prompt).toMatch(/THE SECTION TO WRITE: How-to-decide flowchart/);
    expect(d.prompt).toMatch(/Next\.js, Rails/);
    expect(aiCalls).toHaveLength(0);
  });

  it('manual: a pasted section replaces only that one and is saved', async () => {
    const { POST } = await import('./topics/[id]/modules/[moduleId]/block/route');
    const r = await POST(post({ index: 1, mode: 'manual', step: 'import', reply: fence({ block: newFlow }) }), ctx);
    expect(r.status).toBe(200);
    const saved = row.updates[0];
    expect(saved.blocks[0]).toMatchObject({ type: 'comparison_table', title: 'Stacks' });
    expect(saved.blocks[1]).toMatchObject({ type: 'decision_flow', title: 'Better pick' });
    expect(saved.kind).toBe('decision');
    expect(manualLogs).toEqual(['lesson.block']);
    expect(aiCalls).toHaveLength(0);
  });

  it('a reply that is a different kind of section is refused and nothing changes', async () => {
    const { POST } = await import('./topics/[id]/modules/[moduleId]/block/route');
    const r = await POST(post({ index: 1, mode: 'manual', step: 'import', reply: fence(table) }), ctx);
    expect(r.status).toBe(422);
    expect((await r.json()).problems[0]).toMatch(/decision_flow/);
    expect(row.updates).toHaveLength(0);
  });

  it('the app AI: rewrites the section, accepting the bare block', async () => {
    const { POST } = await import('./topics/[id]/modules/[moduleId]/block/route');
    aiReply = JSON.stringify(newFlow);
    const r = await POST(post({ index: 1 }), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).blocks[1].title).toBe('Better pick');
    expect(aiCalls).toHaveLength(1);
    expect(aiCalls[0][1]).toMatchObject({ purpose: 'lesson.block' });
  });

  it('the app AI: unusable output is a 502 and saves nothing', async () => {
    const { POST } = await import('./topics/[id]/modules/[moduleId]/block/route');
    aiReply = 'not json at all';
    const r = await POST(post({ index: 1 }), ctx);
    expect(r.status).toBe(502);
    expect(row.updates).toHaveLength(0);
  });

  it('refuses a section that does not exist, and a lesson that is not saved yet', async () => {
    const { POST } = await import('./topics/[id]/modules/[moduleId]/block/route');
    expect((await POST(post({ index: 5 }), ctx)).status).toBe(400);
    expect((await POST(post({ index: -1 }), ctx)).status).toBe(400);
    expect((await POST(post({ index: 'x' }), ctx)).status).toBe(400);
    row.found = false;
    expect((await POST(post({ index: 0 }), ctx)).status).toBe(400);
    expect(aiCalls).toHaveLength(0);
  });
});
