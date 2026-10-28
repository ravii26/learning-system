/**
 * "Try it in real life": things to do away from the page. Some subjects are
 * learned by repeating a skill, some by changing what you do day to day
 * (speaking up in meetings, saving a fixed amount, sleeping on a schedule),
 * some by noticing and testing. The lesson writer decides which of these a
 * lesson needs, and leaves the list empty when none fits, so a lesson on a
 * pure idea never gets a made-up chore.
 */
export const REAL_LIFE_TYPES = ['practice', 'habit', 'observe', 'experiment', 'reflect'] as const;
export type RealLifeType = (typeof REAL_LIFE_TYPES)[number];

export const REAL_LIFE_LABEL: Record<RealLifeType, string> = {
  practice: 'Practise',
  habit: 'Change a habit',
  observe: 'Notice',
  experiment: 'Experiment',
  reflect: 'Reflect',
};

export interface RealLifeTry {
  type: RealLifeType;
  task: string;
  how: string;
  when: string;
  check: string;
}

/** The field in the JSON the lesson prompt asks for. */
export const REAL_LIFE_JSON = `"tryInRealLife": [
    {
      "type": "practice | habit | observe | experiment | reflect",
      "task": "One sentence: what to do in real life",
      "how": "Concrete steps, with real quantities, names or situations",
      "when": "When and for how long, e.g. 'Tomorrow's stand-up' or 'every evening for 7 days'",
      "check": "How the learner knows they did it, or what changed"
    }
  ],`;

/** Rules the lesson prompt gives the model about this field. */
export const REAL_LIFE_RULE = `Write "tryInRealLife": 0 to 3 things to do OUTSIDE the lesson, in the learner's own life or work. Choose the type by how this subject is really learned:
- practice: repeat a skill until it is smooth (cook the dish, solve 5 problems, record yourself).
- habit: change something you do every day or week (a fixed saving, a wake-up time, speaking first in a meeting). Give a small, specific starting step and a number of days.
- observe: notice something in real life and write it down (which ads use scarcity, how people pause when they speak).
- experiment: change one thing, compare before and after, and say what to measure.
- reflect: a short question to answer in writing after a real event.
Rules: be concrete (real numbers, real situations, a day or time), small enough to start within 24 hours, and tied to THIS lesson. If nothing real-world fits, return []. Never pad the list: one good task beats three vague ones.`;

export function normalizeRealLife(v: unknown): RealLifeTry[] {
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
  return (Array.isArray(v) ? v : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      type: (REAL_LIFE_TYPES as readonly string[]).includes(text(e.type, 12)) ? (text(e.type, 12) as RealLifeType) : 'practice',
      task: text(e.task, 300),
      how: text(e.how, 1200),
      when: text(e.when, 200),
      check: text(e.check, 400),
    }))
    .filter((e) => e.task && e.how)
    .slice(0, 3);
}
