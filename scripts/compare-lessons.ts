/**
 * Does a personalised lesson actually differ between learners?
 *
 * Writes the same module for two (or more) learner profiles with the exact
 * prompt the app uses (src/lib/lessonPrompt.ts), writes the first profile a
 * second time as a baseline, and measures how much of each lesson is shared.
 *
 * The baseline matters: a model never writes the same lesson twice, so two
 * lessons for different people will always differ somewhat. The question is
 * whether they differ MORE than two lessons for the same person do.
 *
 * Usage (from the repo root):
 *
 *   npx tsx scripts/compare-lessons.ts                 # call the app's AI (costs credits)
 *   npx tsx scripts/compare-lessons.ts --judge         # also ask a cheap model to compare them
 *   npx tsx scripts/compare-lessons.ts --manual        # free: write prompts to paste into your own chat
 *   npx tsx scripts/compare-lessons.ts --import        # read the replies you pasted back, then compare
 *
 * Options:
 *   --profiles <file>   profiles and module (default scripts/compare-lessons.profiles.json)
 *   --out <dir>         where lessons and the report go (default compare-out/)
 *   --module "<title>"  override the module title from the profiles file
 *   --kind <kind>       override the lesson kind (concept, decision, drill...)
 *   --no-baseline       skip writing the first profile twice (cheaper, harder to read)
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

import { callAIContent, hasAnyAIProviderConfigured, type AIMessage } from '@/lib/ai/aiClient';
import type { AttemptLog } from '@/lib/ai/attempt';
import { costOf, priceFor } from '@/lib/ai/pricing';
import { extractJson, toChatPrompt } from '@/lib/ai/manual';
import { buildLessonMessages } from '@/lib/lessonPrompt';
import { normalizeLesson } from '@/lib/lessonNormalize';
import { lessonKindOf, KIND_BLOCKS } from '@/lib/lessonKinds';
import { normalizeBlueprint } from '@/lib/lessonBlocks';
import { guessArchetype } from '@/lib/program/fieldGuide';

// ---------------------------------------------------------------- inputs

interface Profile {
  id: string;
  label: string;
  learnerLevel: string;
  priorKnowledge: string;
  goal?: string;
  field?: string;
  answers?: Array<{ question: string; answer: string }>;
  knownWeaknesses?: string[];
  recentMistakes?: string[];
  /** Words that only make sense for this learner; counted in each lesson. */
  markers?: string[];
}

interface ModuleSpec {
  topicTitle: string;
  moduleTitle: string;
  area: string;
  kind?: string;
  coursePosition?: string;
}

interface Run {
  /** File-safe name: the profile id, plus "-again" for the baseline. */
  name: string;
  profile: Profile;
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['profiles', 'out', 'module', 'kind'].includes(key)) values[key] = argv[++i] ?? '';
    else flags.add(key);
  }
  return { flags, values };
}

/** Same format the lesson route uses for a learner's plan (see loadPlanContext). */
function planBlockFor(p: Profile): string {
  if (!p.goal) return '';
  const answers = (p.answers ?? []).map((a) => `- ${a.question} → ${a.answer}`).join('\n');
  return `The learner's goal: ${p.goal}${p.field ? ` (plan: ${p.field})` : ''}.${answers ? `\n${answers}` : ''}`;
}

function messagesFor(mod: ModuleSpec, p: Profile): AIMessage[] {
  const kind = lessonKindOf(mod.kind);
  return buildLessonMessages({
    kind,
    moduleTitle: mod.moduleTitle,
    topicTitle: mod.topicTitle,
    area: mod.area,
    learnerLevel: p.learnerLevel,
    priorKnowledge: p.priorKnowledge,
    planBlock: planBlockFor(p),
    coursePosition: mod.coursePosition ?? '',
    weaknesses: (p.knownWeaknesses ?? []).slice(0, 10),
    mistakes: (p.recentMistakes ?? []).slice(0, 10),
    archetype: guessArchetype(`${p.goal ?? ''} ${mod.topicTitle} ${mod.moduleTitle}`),
    blueprint: kind !== 'concept' ? normalizeBlueprint(undefined, KIND_BLOCKS[kind]) : undefined,
  });
}

// ---------------------------------------------------------------- generation

interface Generated {
  lesson: Record<string, unknown>;
  promptTokens: number;
  completionTokens: number;
  costInr: number | null;
  model: string;
}

async function costOfAttempts(attempts: AttemptLog[]): Promise<number | null> {
  let total = 0;
  for (const a of attempts) {
    if (a.provider !== 'aicredits') continue; // Gemini free tier / Groq: not priced here
    const c = costOf(await priceFor(a.model), a.promptTokens ?? null, a.completionTokens ?? null);
    if (c === null) return null;
    total += c;
  }
  return attempts.some((a) => a.provider === 'aicredits') ? total : null;
}

async function generate(messages: AIMessage[], purpose: string, tier: 'content' | 'fast', maxTokens: number) {
  const attempts: AttemptLog[] = [];
  const { content } = await callAIContent(messages, {
    purpose, temperature: 0.35, jsonMode: true, tier, maxTokens,
    onAttempt: (a) => attempts.push(a),
  });
  const ok = attempts.filter((a) => a.ok).at(-1);
  return {
    content,
    // Failed attempts (a reply cut off, then retried on the next model) still cost money.
    promptTokens: attempts.reduce((n, a) => n + (a.promptTokens ?? 0), 0),
    completionTokens: attempts.reduce((n, a) => n + (a.completionTokens ?? 0), 0),
    costInr: await costOfAttempts(attempts),
    model: ok ? `${ok.provider}/${ok.model}` : 'unknown',
  };
}

function parseLesson(raw: string, where: string): Record<string, unknown> {
  const found = extractJson(raw);
  if (!found.ok) throw new Error(`${where}: ${found.problem}`);
  const lesson = normalizeLesson(found.value);
  if (!lesson) throw new Error(`${where}: the reply has no "summary" and "explanation", so it is not a lesson`);
  return lesson;
}

// ---------------------------------------------------------------- comparison

const STOP = new Set(('the a an and or of to in on for is are be it this that with as by at from you your can will not but if then than so we they them their its into when what which who how why use used using more most only also just like one two each any all some has have had was were been do does did there here out up about over such these those very should would could may might must our'.split(' ')));

const words = (t: string) => (t.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
const contentWords = (t: string) => words(t).filter((w) => w.length > 2 && !STOP.has(w));

/** Do the two texts talk about the same things? Word-frequency cosine, 0..1. */
function topicSimilarity(a: string, b: string): number {
  const count = (t: string) => {
    const m = new Map<string, number>();
    for (const w of contentWords(t)) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  if (!ca.size || !cb.size) return ca.size === cb.size ? 1 : 0;
  let dot = 0;
  for (const [w, n] of Array.from(ca)) dot += n * (cb.get(w) ?? 0);
  const norm = (m: Map<string, number>) => Math.sqrt(Array.from(m.values()).reduce((s, n) => s + n * n, 0));
  return dot / (norm(ca) * norm(cb));
}

/** Do they say it in the same words? Jaccard over 3-word runs, 0..1. */
function wordingOverlap(a: string, b: string): number {
  const shingles = (t: string) => {
    const w = words(t);
    const s = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) s.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    return s;
  };
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return sa.size === sb.size ? 1 : 0;
  let inter = 0;
  for (const x of Array.from(sa)) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function allText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(allText).join('\n');
  if (v && typeof v === 'object') return Object.values(v).map(allText).join('\n');
  return '';
}

/** Top-level fields worth comparing one by one, in the order a learner meets them. */
function sectionsOf(lesson: Record<string, unknown>): Map<string, string> {
  const skip = new Set(['title', 'kind']);
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(lesson)) {
    if (skip.has(k)) continue;
    const t = allText(v).trim();
    if (t) out.set(k, t);
  }
  return out;
}

interface Pair {
  a: string;
  b: string;
  topic: number;
  wording: number;
  sections: Array<{ name: string; topic: number; wording: number; lengthA: number; lengthB: number }>;
  quizMatched: number;
  quizTotal: number;
}

function quizQuestions(lesson: Record<string, unknown>): string[] {
  const q = lesson.quiz;
  return Array.isArray(q) ? q.map((x) => allText(x)) : [];
}

function comparePair(nameA: string, a: Record<string, unknown>, nameB: string, b: Record<string, unknown>): Pair {
  const sa = sectionsOf(a);
  const sb = sectionsOf(b);
  const names = Array.from(new Set(Array.from(sa.keys()).concat(Array.from(sb.keys()))));
  const sections = names.map((name) => {
    const ta = sa.get(name) ?? '';
    const tb = sb.get(name) ?? '';
    return { name, topic: topicSimilarity(ta, tb), wording: wordingOverlap(ta, tb), lengthA: words(ta).length, lengthB: words(tb).length };
  });
  // A quiz question "matches" when the other lesson asks a question about the same thing.
  const qa = quizQuestions(a);
  const qb = quizQuestions(b);
  const quizMatched = qa.filter((x) => qb.some((y) => topicSimilarity(x, y) >= 0.5)).length;
  return {
    a: nameA, b: nameB,
    topic: topicSimilarity(allText(a), allText(b)),
    wording: wordingOverlap(allText(a), allText(b)),
    sections, quizMatched, quizTotal: qa.length,
  };
}

function markerHits(lesson: Record<string, unknown>, markers: string[]): Array<[string, number]> {
  const text = allText(lesson).toLowerCase();
  const escape = (m: string) => m.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markers
    // Whole words only: "row" must not count "arrow" or "grow".
    .map((m): [string, number] => [m, (text.match(new RegExp(`\\b${escape(m)}\\b`, 'g')) ?? []).length])
    .filter(([, n]) => n > 0);
}

// ---------------------------------------------------------------- judge

const JUDGE_SYSTEM = `You compare two lessons on the same topic, written for two different learners, and say how much of them could have been one shared lesson.
Reply with JSON only:
{
  "sharedPercent": number,            // 0-100: share of the teaching (ideas, explanation, code, quiz) that is the same in substance, ignoring wording
  "sections": [ { "section": string, "verdict": "same" | "reworded" | "personalised" | "different", "note": string } ],
  "personalisedForA": [string],       // concrete things only learner A's lesson has because of who A is
  "personalisedForB": [string],
  "levelDifferences": [string],       // differences explained by beginner vs intermediate etc., not by the person
  "verdict": string                   // two sentences: could a shared base plus a short personal layer replace these?
}`;

function trimLesson(l: Record<string, unknown>, max = 14000): string {
  const s = JSON.stringify(l);
  return s.length > max ? `${s.slice(0, max)}…(cut)` : s;
}

function judgeMessages(pa: Profile, la: Record<string, unknown>, pb: Profile, lb: Record<string, unknown>): AIMessage[] {
  const who = (p: Profile) => `${p.label}; level ${p.learnerLevel}; ${p.priorKnowledge}${p.goal ? ` Goal: ${p.goal}.` : ''}`;
  return [
    { role: 'system', content: JUDGE_SYSTEM },
    { role: 'user', content: `Learner A: ${who(pa)}\nLesson A:\n${trimLesson(la)}\n\nLearner B: ${who(pb)}\nLesson B:\n${trimLesson(lb)}` },
  ];
}

// ---------------------------------------------------------------- report

const pct = (x: number) => `${Math.round(x * 100)}%`;
const inr = (x: number | null) => (x === null ? 'n/a' : `₹${x.toFixed(2)}`);

function verdictLine(cross: Pair, base: Pair | null): string {
  if (!base) return 'No baseline was written, so there is nothing to measure the difference against. Run without --no-baseline.';
  if (base.topic < 0.5) {
    return `Two lessons for the SAME learner were only ${pct(base.topic)} alike, so the model's own randomness is drowning out any personalisation (learners: ${pct(cross.topic)}). Check that both replies are lessons on this module, then run again; this result cannot be trusted.`;
  }
  const gap = base.topic - cross.topic;
  if (gap <= 0.05) {
    return `The two learners' lessons are about as alike as two lessons for the same learner (${pct(cross.topic)} vs ${pct(base.topic)}). Personalisation is barely changing the content: a shared base lesson would lose almost nothing.`;
  }
  if (gap <= 0.15) {
    return `Lessons for different learners are somewhat less alike than re-runs for the same learner (${pct(cross.topic)} vs ${pct(base.topic)}). Most content is shared; the differences fit in a short personal layer. Check the sections table for where they are.`;
  }
  return `Lessons for different learners differ clearly more than re-runs for the same learner (${pct(cross.topic)} vs ${pct(base.topic)}). Personalisation is changing the substance; look at which sections differ before deciding what can be shared.`;
}

function pairTable(p: Pair): string {
  const rows = p.sections
    .sort((x, y) => x.topic - y.topic)
    .map((s) => `| ${s.name} | ${pct(s.topic)} | ${pct(s.wording)} | ${s.lengthA} / ${s.lengthB} |`)
    .join('\n');
  return `| Section | Same topics | Same wording | Words (${p.a} / ${p.b}) |\n|---|---|---|---|\n${rows}`;
}

// ---------------------------------------------------------------- main

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const profilesPath = values.profiles || 'scripts/compare-lessons.profiles.json';
  const outDir = values.out || 'compare-out';
  const spec = JSON.parse(fs.readFileSync(profilesPath, 'utf8')) as { module: ModuleSpec; profiles: Profile[] };
  const mod: ModuleSpec = { ...spec.module, ...(values.module ? { moduleTitle: values.module } : {}), ...(values.kind ? { kind: values.kind } : {}) };
  if (spec.profiles.length < 2) throw new Error('Give at least two profiles.');

  const runs: Run[] = spec.profiles.map((p) => ({ name: p.id, profile: p }));
  if (!flags.has('no-baseline')) runs.push({ name: `${spec.profiles[0].id}-again`, profile: spec.profiles[0] });

  fs.mkdirSync(outDir, { recursive: true });
  const file = (n: string) => path.join(outDir, n);

  // Free path, step 1: write prompts for the learner's own chat.
  if (flags.has('manual')) {
    for (const r of runs) {
      fs.writeFileSync(file(`prompt-${r.name}.txt`), toChatPrompt(messagesFor(mod, r.profile)));
    }
    console.log(`Wrote ${runs.length} prompts to ${outDir}/.`);
    console.log('For each prompt-<name>.txt: open a NEW chat, paste it, and save the whole reply as reply-<name>.txt in the same folder.');
    console.log('Use a fresh chat for every prompt, including the "-again" one, or the baseline means nothing.');
    console.log('Then run:  npx tsx scripts/compare-lessons.ts --import');
    return;
  }

  const results = new Map<string, Generated>();

  if (flags.has('import')) {
    for (const r of runs) {
      const p = file(`reply-${r.name}.txt`);
      if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Run with --manual first, then save each reply there.`);
      const lesson = parseLesson(fs.readFileSync(p, 'utf8'), p);
      results.set(r.name, { lesson, promptTokens: 0, completionTokens: 0, costInr: 0, model: 'your own chat' });
    }
  } else {
    if (!hasAnyAIProviderConfigured()) {
      throw new Error('No AI key found (AICREDITS_API_KEY, GEMINI_API_KEY or GROQ_API_KEY in .env). Use --manual for the free path.');
    }
    console.log(`Writing ${runs.length} lessons for "${mod.moduleTitle}"...`);
    const done = await Promise.all(runs.map(async (r) => {
      const g = await generate(messagesFor(mod, r.profile), 'compare.lesson', 'content', 9000);
      return [r.name, { ...g, lesson: parseLesson(g.content, r.name) }] as const;
    }));
    for (const [name, g] of done) results.set(name, g);
  }

  for (const [name, g] of Array.from(results)) fs.writeFileSync(file(`lesson-${name}.json`), JSON.stringify(g.lesson, null, 2));

  const [first, second] = spec.profiles;
  const cross: Pair[] = [];
  for (let i = 0; i < spec.profiles.length; i++) {
    for (let j = i + 1; j < spec.profiles.length; j++) {
      const a = spec.profiles[i].id;
      const b = spec.profiles[j].id;
      cross.push(comparePair(a, results.get(a)!.lesson, b, results.get(b)!.lesson));
    }
  }
  const againName = `${first.id}-again`;
  const base = results.has(againName) ? comparePair(first.id, results.get(first.id)!.lesson, againName, results.get(againName)!.lesson) : null;

  // Optional: a cheap model reads both lessons and says what is shared.
  let judge: { text: string; costInr: number | null } | null = null;
  if (flags.has('judge')) {
    if (!hasAnyAIProviderConfigured()) {
      console.warn('--judge needs an AI key; skipped.');
    } else {
      const g = await generate(judgeMessages(first, results.get(first.id)!.lesson, second, results.get(second.id)!.lesson), 'compare.judge', 'fast', 2000);
      const found = extractJson(g.content);
      judge = { text: found.ok ? JSON.stringify(found.value, null, 2) : g.content, costInr: g.costInr };
    }
  }

  const headline = cross[0];
  const lines: string[] = [];
  lines.push(`# Lesson comparison: ${mod.moduleTitle}`, '');
  lines.push(`Topic: ${mod.topicTitle} · kind: ${lessonKindOf(mod.kind)} · written ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '');
  lines.push('## Verdict', '', verdictLine(headline, base), '');
  lines.push('## Overall', '');
  lines.push('| Pair | Same topics | Same wording | Quiz questions also asked in the other |', '|---|---|---|---|');
  for (const p of cross) lines.push(`| ${p.a} vs ${p.b} | ${pct(p.topic)} | ${pct(p.wording)} | ${p.quizMatched} of ${p.quizTotal} |`);
  if (base) lines.push(`| ${base.a} vs ${base.b} (same learner, baseline) | ${pct(base.topic)} | ${pct(base.wording)} | ${base.quizMatched} of ${base.quizTotal} |`);
  lines.push('', '"Same topics" compares which words each lesson uses (does it cover the same ground). "Same wording" counts identical three-word runs; it is low even for re-runs, so read it against the baseline.', '');
  lines.push(`## Section by section: ${headline.a} vs ${headline.b}`, '', 'Least alike first. These are the sections a personal layer would have to cover.', '', pairTable(headline), '');
  if (base) lines.push(`## Section by section: baseline (${base.a} written twice)`, '', pairTable(base), '');

  lines.push('## Did each lesson use its own learner\'s situation?', '');
  lines.push('Counts of each profile\'s marker words in each lesson.', '');
  lines.push(`| Lesson | ${spec.profiles.map((p) => `${p.id} markers`).join(' | ')} |`, `|---|${spec.profiles.map(() => '---').join('|')}|`);
  for (const r of runs) {
    const l = results.get(r.name)!.lesson;
    const cells = spec.profiles.map((p) => markerHits(l, p.markers ?? []).map(([m, n]) => `${m} ×${n}`).join(', ') || '—');
    lines.push(`| ${r.name} | ${cells.join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Cost', '', '| Lesson | Model | Tokens in → out | Cost |', '|---|---|---|---|');
  let total = 0;
  let known = true;
  for (const r of runs) {
    const g = results.get(r.name)!;
    const tokens = g.promptTokens || g.completionTokens ? `${g.promptTokens.toLocaleString()} → ${g.completionTokens.toLocaleString()}` : '—';
    lines.push(`| ${r.name} | ${g.model} | ${tokens} | ${inr(g.costInr)} |`);
    if (g.costInr === null) known = false;
    else total += g.costInr;
  }
  if (judge) {
    lines.push(`| judge | fast tier | | ${inr(judge.costInr)} |`);
    if (judge.costInr === null) known = false;
    else total += judge.costInr;
  }
  lines.push('', `Total: ${known ? inr(total) : `${inr(total)} plus calls that could not be priced`}.`, '');

  if (judge) lines.push(`## What the judge model said (${first.id} vs ${second.id})`, '', '```json', judge.text, '```', '');

  lines.push('## Files', '', ...runs.map((r) => `- \`lesson-${r.name}.json\``), '');

  const report = lines.join('\n');
  fs.writeFileSync(file('report.md'), report);
  console.log(`\n${verdictLine(headline, base)}\n`);
  for (const p of cross) console.log(`${p.a} vs ${p.b}: same topics ${pct(p.topic)}, same wording ${pct(p.wording)}`);
  if (base) console.log(`${base.a} vs ${base.b} (baseline): same topics ${pct(base.topic)}, same wording ${pct(base.wording)}`);
  console.log(`\nFull report: ${file('report.md')}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
