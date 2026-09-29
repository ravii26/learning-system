import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Use my own ChatGPT/Claude": every route hands out a prompt and imports a
 * pasted reply through its normal checks and save, and never calls the
 * paid AI on the way.
 */

const aiCalls: unknown[] = [];
vi.mock('@/lib/ai/aiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/aiClient')>()),
  callAIContent: async (...a: unknown[]) => { aiCalls.push(a); throw new Error('the paid AI must not be called in copy-paste mode'); },
}));
const manualLogs: string[] = [];
vi.mock('@/lib/ai/callLog', () => ({
  logManualImport: async (purpose: string) => { manualLogs.push(purpose); },
  logAttempts: async () => {},
  assertWithinDailyBudget: async () => {},
}));
vi.mock('@/lib/rateLimit', () => ({ aiQuotaGate: async () => new Response('over quota', { status: 429 }), consumeAiQuota: async () => {} }));
vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: 'u1' }) }));

const saved: { lessons: any[]; sessions: any[] } = { lessons: [], sessions: [] };
vi.mock('@/lib/db', () => {
  const db: any = {
    topic: { findFirst: async () => ({ id: 't1', title: 'Guitar practice', why: null, contract: { currentLevel: 'Beginner' } }) },
    curriculumItem: { findMany: async () => [] },
    moduleAttempt: { findMany: async () => [] },
    confusion: { findMany: async () => [] },
    mistake: { findMany: async () => [] },
    programItem: { findFirst: async () => null },
    generatedLesson: {
      findFirst: async () => null,
      upsert: async ({ create }: any) => { saved.lessons.push(create); return create; },
    },
    practiceSession: {
      count: async () => 0,
      findFirst: async () => null,
      findMany: async () => saved.sessions,
      createMany: async ({ data }: any) => { saved.sessions.push(...data); return { count: data.length }; },
    },
  };
  return { db };
});

const post = (body: unknown) => new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fence = (v: unknown) => `Sure! Here it is:\n\`\`\`json\n${JSON.stringify(v)}\n\`\`\`\nHope this helps.`;

beforeEach(() => {
  aiCalls.length = 0;
  manualLogs.length = 0;
  saved.lessons.length = 0;
  saved.sessions.length = 0;
});

describe('plan questions', () => {
  it('gives the prompt, then imports the pasted questions, even when over quota', async () => {
    const { POST } = await import('./programs/questions/route');
    const p = await (await POST(post({ goal: 'Learn guitar', mode: 'manual' }))).json();
    expect(p.prompt).toMatch(/Learn guitar/);
    const reply = fence({ archetype: 'performance', fieldTitle: 'Guitar', questions: [{ id: 'style', question: 'What style?', options: ['Strumming', 'Fingerstyle'] }] });
    const r = await POST(post({ goal: 'Learn guitar', mode: 'manual', step: 'import', reply }));
    expect(r.status).toBe(200);
    expect((await r.json()).questions).toHaveLength(1);
    expect(manualLogs).toEqual(['plan.questions']);
    expect(aiCalls).toHaveLength(0);
  });
  it('a reply without usable questions: 422 with a fix message', async () => {
    const { POST } = await import('./programs/questions/route');
    const r = await POST(post({ goal: 'Learn guitar', mode: 'manual', step: 'import', reply: 'Sorry, I cannot help.' }));
    expect(r.status).toBe(422);
    expect((await r.json()).fixPrompt).toMatch(/COMPLETE JSON/);
  });
});

describe('lesson', () => {
  const body = { topicId: 't1', moduleId: 'c:chords', moduleTitle: 'Open chords', topicTitle: 'Guitar', mode: 'manual' };
  it('gives the lesson prompt without any AI key or quota', async () => {
    const { POST } = await import('./generate-lesson/route');
    const d = await (await POST(post({ ...body, step: 'prompt' }))).json();
    expect(d.prompt).toMatch(/Open chords/);
    expect(d.prompt).toMatch(/"exercises"/);
    expect(aiCalls).toHaveLength(0);
  });
  it('imports a pasted lesson through the normal checks and saves it', async () => {
    const { POST } = await import('./generate-lesson/route');
    const lesson = { title: 'Open chords', summary: 'Play C, G and D cleanly.', explanation: 'Put finger 3 on...', quiz: [], exercises: [{ type: 'do', instruction: 'Play', prompt: 'C to G ten times', answer: 'No buzzing' }] };
    const r = await POST(post({ ...body, step: 'import', reply: fence(lesson) }));
    expect(r.status).toBe(200);
    expect((await r.json()).exercises).toHaveLength(1);
    expect(saved.lessons).toHaveLength(1);
    expect(saved.lessons[0].provider).toBe('manual');
    expect(manualLogs).toEqual(['lesson']);
    expect(aiCalls).toHaveLength(0);
  });
  it('a lesson missing its teaching text is refused and nothing is saved', async () => {
    const { POST } = await import('./generate-lesson/route');
    const r = await POST(post({ ...body, step: 'import', reply: fence({ title: 'x' }) }));
    expect(r.status).toBe(422);
    expect(saved.lessons).toHaveLength(0);
  });
});

describe('practice days', () => {
  const day = (title: string) => ({ title, focus: 'main', minutes: 20, goal: 'g', successCheck: 's', steps: [{ kind: 'drill', title: 'Drill', minutes: 20, instructions: 'Switch G to C 20 times', items: [] }] });
  it('imports pasted days starting from day 1', async () => {
    const { POST } = await import('./topics/[id]/sessions/route');
    const params = { params: { id: 't1' } };
    const p = await (await POST(post({ mode: 'manual' }), params)).json();
    expect(p).toMatchObject({ fromDay: 1 });
    const r = await POST(post({ mode: 'manual', step: 'import', reply: fence({ sessions: [day('A'), day('B'), day('C')] }) }), params);
    expect(r.status).toBe(200);
    expect(saved.sessions.map((s) => s.day)).toEqual([1, 2, 3]);
    expect(manualLogs).toEqual(['practice.sessions']);
    expect(aiCalls).toHaveLength(0);
  });
  it('a cut-off reply is refused with the reason and a fix message', async () => {
    const { POST } = await import('./topics/[id]/sessions/route');
    const r = await POST(post({ mode: 'manual', step: 'import', reply: '```json\n{"sessions":[{"title":"A"' }), { params: { id: 't1' } });
    expect(r.status).toBe(422);
    const d = await r.json();
    expect(d.problems[0]).toMatch(/cut off|No usable/);
    expect(saved.sessions).toHaveLength(0);
  });
});
