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
/** The kind the module was created with (CurriculumItem.kind); null = no such row. */
const storedKind: { value: string | null; blueprint: unknown } = { value: null, blueprint: null };
vi.mock('@/lib/db', () => {
  const db: any = {
    topic: { findFirst: async () => ({ id: 't1', title: 'Guitar practice', why: null, contract: { currentLevel: 'Beginner' } }) },
    curriculumItem: { findMany: async () => [], findFirst: async () => (storedKind.value ? { kind: storedKind.value, blueprint: storedKind.blueprint } : null) },
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
  storedKind.value = null;
  storedKind.blueprint = null;
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
  it('a concept lesson is saved without a kind, exactly as before kinds existed', async () => {
    const { POST } = await import('./generate-lesson/route');
    const lesson = { title: 'T', summary: 'S', explanation: 'E', kind: 'decision' };
    await POST(post({ ...body, step: 'import', reply: fence(lesson) }));
    expect(saved.lessons[0].content.kind).toBeUndefined();
  });

  describe('decision kind', () => {
    const decisionBody = { ...body, moduleTitle: 'Choosing a tech stack', topicTitle: 'Web architecture', kind: 'decision' };
    const decisionLesson = {
      title: 'Choosing a tech stack',
      summary: 'Pick a stack and defend it.',
      explanation: 'Settle constraints first.',
      blocks: [
        { type: 'comparison_table', options: ['Next.js', 'Rails'], rows: [{ criterion: 'Cost', cells: [{ text: 'spiky', rating: 1 }, { text: 'steady', rating: 3, best: true }] }] },
        { type: 'pros_cons', items: [{ option: 'Rails', pros: ['Few parts'], cons: ['You run it'] }] },
        { type: 'decision_flow', start: 'q', nodes: [{ id: 'q', question: 'SEO?', yes: 'a', no: 'b' }, { id: 'a', outcome: 'Next.js' }, { id: 'b', outcome: 'Rails' }] },
        { type: 'made_up', foo: 1 },
      ],
      quiz: [],
    };

    it('asks for the decision sections, not the concept ones, without calling paid AI', async () => {
      const { POST } = await import('./generate-lesson/route');
      const d = await (await POST(post({ ...decisionBody, step: 'prompt' }))).json();
      expect(d.prompt).toMatch(/comparison_table/);
      expect(d.prompt).toMatch(/decision_flow/);
      expect(d.prompt).toMatch(/NEVER state an exact price/);
      expect(d.prompt).toMatch(/Choosing a tech stack/);
      expect(aiCalls).toHaveLength(0);
    });

    it('a concept request still gets the concept prompt', async () => {
      const { POST } = await import('./generate-lesson/route');
      const d = await (await POST(post({ ...body, step: 'prompt' }))).json();
      expect(d.prompt).not.toMatch(/comparison_table/);
    });

    it('saves drawable blocks and the kind, and drops a block type it does not know', async () => {
      const { POST } = await import('./generate-lesson/route');
      const r = await POST(post({ ...decisionBody, step: 'import', reply: fence(decisionLesson) }));
      expect(r.status).toBe(200);
      const content = saved.lessons[0].content;
      expect(content.kind).toBe('decision');
      expect(content.blocks.map((b: any) => b.type)).toEqual(['comparison_table', 'pros_cons', 'decision_flow']);
      expect(aiCalls).toHaveLength(0);
    });

    it('uses the kind the module was created with when the request does not say', async () => {
      const { POST } = await import('./generate-lesson/route');
      storedKind.value = 'decision';
      const { kind: _omit, ...noKind } = decisionBody;
      const d = await (await POST(post({ ...noKind, step: 'prompt' }))).json();
      expect(d.prompt).toMatch(/comparison_table/);
      await POST(post({ ...noKind, step: 'import', reply: fence(decisionLesson) }));
      expect(saved.lessons[0].content.kind).toBe('decision');
    });

    it('asks only for the sections in the module blueprint', async () => {
      const { POST } = await import('./generate-lesson/route');
      storedKind.value = 'decision';
      storedKind.blueprint = ['comparison_table', 'matrix_2x2'];
      const { kind: _omit, ...noKind } = decisionBody;
      const d = await (await POST(post({ ...noKind, step: 'prompt' }))).json();
      expect(d.prompt).toMatch(/"type": "comparison_table"/);
      expect(d.prompt).toMatch(/"type": "matrix_2x2"/);
      expect(d.prompt).not.toMatch(/"type": "cost_chart"/);
      expect(d.prompt).not.toMatch(/"type": "decision_flow"/);
    });

    it('a module stored as concept stays concept', async () => {
      const { POST } = await import('./generate-lesson/route');
      storedKind.value = 'concept';
      const { kind: _omit, ...noKind } = decisionBody;
      const d = await (await POST(post({ ...noKind, step: 'prompt' }))).json();
      expect(d.prompt).not.toMatch(/comparison_table/);
    });

    it('an unknown kind falls back to a concept lesson', async () => {
      const { POST } = await import('./generate-lesson/route');
      const d = await (await POST(post({ ...decisionBody, kind: 'banana', step: 'prompt' }))).json();
      expect(d.prompt).not.toMatch(/comparison_table/);
    });
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
