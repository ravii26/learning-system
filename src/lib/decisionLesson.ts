import type { AIMessage } from '@/lib/ai/aiClient';
import { EXERCISES_JSON } from '@/lib/program/lessonGuide';
import { BLOCK_LABEL, normalizeBlueprint, type BlockType, type LessonBlock } from '@/lib/lessonBlocks';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, type LessonKind } from '@/lib/lessonKinds';

/**
 * The prompts for a "make a decision" lesson: choosing between technologies
 * or approaches (a tech stack, a database, hosting). A lesson asks for the
 * same core fields as any lesson (summary, quiz, reviewCards...) plus
 * `blocks` (see lib/lessonBlocks.ts), which the app draws as a table, charts
 * and a decision tree. The model returns data only, never drawing code.
 *
 * Which blocks to ask for is the lesson's blueprint; a single block can also
 * be rewritten on its own (buildBlockMessages).
 */

export interface DecisionPromptInput {
  topicTitle: string;
  moduleTitle: string;
  area: string;
  learnerLevel: string;
  priorKnowledge: string;
  planBlock: string;
  coursePosition: string;
  weaknesses: string[];
  mistakes: string[];
  /** "October 2026": stamped into the lesson so a reader knows how old its prices and outlook are. */
  today: string;
  /** Which blocks to write; empty or missing means all of them. */
  blueprint?: BlockType[];
}

/** One example per block type. The model sees only the ones in the blueprint. Shared by every lesson kind (see kindLessons.ts). */
export const BLOCK_EXAMPLE: Record<BlockType, string> = {
  steps: `{
      "type": "steps",
      "title": "How to do it, step by step",
      "steps": [
        { "title": "Set up", "instruction": "The exact thing to do first, with names and numbers.", "check": "How you can tell it worked.", "snag": "The most common mistake here, and the fix." },
        { "title": "The core move", "instruction": "The next concrete action.", "check": "What you should see or hear.", "snag": "What usually goes wrong." },
        { "title": "Put it together", "instruction": "Combine the pieces.", "check": "The result that shows you are done.", "snag": "A typical slip." }
      ],
      "note": "Adjust to your own tools and pace."
    }`,
  routine: `{
      "type": "routine",
      "title": "Today's practice session",
      "parts": [
        { "label": "Warm-up", "minutes": 5, "instruction": "A gentle version of the skill.", "target": "A measurable target, e.g. 10 clean reps" },
        { "label": "Main drill", "minutes": 15, "instruction": "The focused repetition, slowly then faster.", "target": "e.g. 20 reps at 60 bpm without a mistake" },
        { "label": "Use it for real", "minutes": 5, "instruction": "Apply it in a real piece, dish, sentence or game.", "target": "One real attempt, recorded or written down" }
      ],
      "note": "Stop if something hurts. Repeat daily; make the target slightly harder each week."
    }`,
  memory_list: `{
      "type": "memory_list",
      "title": "Things to memorise",
      "items": [
        { "term": "Item or term", "meaning": "Its short, correct meaning.", "hook": "A memory aid (mnemonic or picture)." },
        { "term": "Second item", "meaning": "Its short, correct meaning.", "hook": "A memory aid." },
        { "term": "Third item", "meaning": "Its short, correct meaning.", "hook": "" }
      ],
      "note": "Hooks are aids to recall, not facts. Cover the right-hand side and test yourself."
    }`,
  question_patterns: `{
      "type": "question_patterns",
      "title": "How this topic is usually asked",
      "patterns": [
        { "name": "Pattern name", "asked": "What the question typically looks like.", "trap": "The usual wrong turn.", "tip": "How to handle it." },
        { "name": "Another pattern", "asked": "What it typically looks like.", "trap": "The usual trap.", "tip": "How to handle it." }
      ],
      "note": "General patterns, not real past questions. Check the official syllabus and notices."
    }`,
  study_guide: `{
      "type": "study_guide",
      "title": "How to work through it",
      "resource": { "title": "The learner's book, course or video", "kind": "book" },
      "basis": "by_position",
      "before": ["A question to ask before you start.", "What do you already know about this?"],
      "parts": [
        { "label": "First third", "focus": "What to pay attention to here.", "questions": ["A question to answer as you go."] },
        { "label": "Middle third", "focus": "What to pay attention to here.", "questions": ["A question to answer as you go."] },
        { "label": "Last third", "focus": "What to pay attention to here.", "questions": ["A question to answer as you go."] }
      ],
      "after": ["Close it and write what you remember.", "What would you do differently now?"],
      "note": "Split by position because the exact chapters are not known here."
    }`,
  key_ideas: `{
      "type": "key_ideas",
      "title": "Ideas worth knowing",
      "ideas": [
        { "idea": "A surprising or useful idea", "why": "Why it is interesting or useful." },
        { "idea": "A second idea", "why": "Why it matters." },
        { "idea": "A third idea", "why": "Why it is worth knowing." }
      ],
      "wonder": ["An open question to think about.", "What would change if this were different?"],
      "note": "A starting point; follow your curiosity from here."
    }`,
  state_diagram: `{
      "type": "state_diagram",
      "title": "The lifecycle of a <thing>",
      "states": [
        { "id": "draft", "label": "Draft", "detail": "Only the author can see it", "col": 0, "row": 0, "start": true },
        { "id": "review", "label": "In review", "detail": "Waiting for approval", "col": 1, "row": 0, "style": "temporary" },
        { "id": "live", "label": "Live", "detail": "Visible to everyone", "col": 2, "row": 0, "style": "main" },
        { "id": "archived", "label": "Archived", "detail": "Hidden, kept for records", "col": 2, "row": 1, "style": "restricted" }
      ],
      "transitions": [
        { "from": "draft", "to": "review", "label": "submitted" },
        { "from": "review", "to": "draft", "label": "changes requested" },
        { "from": "review", "to": "live", "label": "approved" },
        { "from": "live", "to": "archived", "label": "retired" }
      ],
      "note": "Illustrative lifecycle. Real products differ; check the docs (written <MONTH YEAR>)."
    }`,
  landscape: `{
      "type": "landscape",
      "title": "The main kinds of <field>",
      "categories": [
        {
          "name": "Category name",
          "summary": "What this category is for, in one sentence.",
          "items": [ { "name": "A real, well-known example", "note": "What it is best known for" } ]
        },
        {
          "name": "Another category",
          "summary": "What this one is for, in one sentence.",
          "items": [ { "name": "A real, well-known example", "note": "What it is best known for" } ]
        }
      ],
      "note": "Tools and names change quickly. Check current docs before choosing (written <MONTH YEAR>)."
    }`,
  timeline: `{
      "type": "timeline",
      "title": "A realistic path",
      "phases": [
        {
          "label": "Phase name",
          "duration": "Weeks 1-4",
          "goal": "What you can do by the end of this phase.",
          "milestones": ["An observable thing to build or finish"]
        },
        {
          "label": "Next phase",
          "duration": "Weeks 5-10",
          "goal": "What you can do by the end of this phase.",
          "milestones": ["An observable thing to build or finish"]
        }
      ],
      "note": "Durations assume about 6 hours a week; scale them to your own pace."
    }`,
  case_study: `{
      "type": "case_study",
      "title": "Short name of the case",
      "basis": "documented | illustrative",
      "situation": "What the team faced and the constraints they were under.",
      "choice": "What they decided.",
      "reasons": ["A reason they gave or that clearly applied"],
      "outcome": "What happened afterwards, only what is reliably known.",
      "lesson": "The transferable lesson, in one or two sentences."
    }`,
  comparison_table: `{
      "type": "comparison_table",
      "title": "Short title, e.g. 'Three stacks side by side'",
      "options": ["Real option 1", "Real option 2", "Real option 3"],
      "rows": [
        {
          "criterion": "A criterion that matters for THIS decision, e.g. 'Upgrade and maintenance burden'",
          "cells": [
            { "text": "Short, concrete statement for option 1", "rating": 2 },
            { "text": "Short, concrete statement for option 2", "rating": 3, "best": true },
            { "text": "Short, concrete statement for option 3", "rating": 1 }
          ]
        }
      ],
      "note": "Prices, versions and trends change. Verify before relying on them (written <MONTH YEAR>)."
    }`,
  pros_cons: `{
      "type": "pros_cons",
      "title": "Where each option wins and hurts",
      "items": [
        { "option": "Real option 1", "pros": ["Specific strength"], "cons": ["Specific weakness"] }
      ]
    }`,
  cost_chart: `{
      "type": "cost_chart",
      "title": "Cost as you grow",
      "unit": "USD per month, rough estimate",
      "scenarios": [
        { "label": "Hobby", "assumption": "a few hundred visits a month" },
        { "label": "Startup", "assumption": "about 10k users" },
        { "label": "At scale", "assumption": "about 1M users" }
      ],
      "series": [
        { "option": "Real option 1", "values": [0, 60, 900] },
        { "option": "Real option 2", "values": [6, 40, 350] }
      ],
      "note": "Rough estimates for comparison only. Check each vendor's pricing page (written <MONTH YEAR>)."
    }`,
  matrix_2x2: `{
      "type": "matrix_2x2",
      "title": "Ease of start vs long-term control",
      "xAxis": { "label": "Ease of start", "low": "Harder", "high": "Easier" },
      "yAxis": { "label": "Long-term control", "low": "Less", "high": "More" },
      "points": [
        { "option": "Real option 1", "x": 8, "y": 3 },
        { "option": "Real option 2", "x": 5, "y": 8 }
      ]
    }`,
  decision_flow: `{
      "type": "decision_flow",
      "title": "Which one should you pick?",
      "start": "q1",
      "nodes": [
        { "id": "q1", "question": "A yes/no question about the learner's situation?", "yes": "pick_a", "no": "q2" },
        { "id": "q2", "question": "Another yes/no question?", "yes": "pick_b", "no": "pick_c" },
        { "id": "pick_a", "outcome": "Option 1, because ..." },
        { "id": "pick_b", "outcome": "Option 2, because ..." },
        { "id": "pick_c", "outcome": "Option 3, because ..." }
      ]
    }`,
};

/** Rules for writing each block type well. */
export const BLOCK_RULES: Record<BlockType, string> = {
  steps:
    'steps: 3 to 10 steps in the order a beginner would really do them, setup included. Every instruction is concrete (names, numbers, exact actions). "check" says how to tell the step worked; "snag" names the most common mistake and its fix. Mention only tools and commands you are sure exist, and flag anything version-sensitive.',
  routine:
    'routine: ONE session of 2 to 5 parts whose minutes add up to the session length (about 20 to 30 unless the learner said otherwise), in the order warm-up, main drill, use it for real. Every part has a measurable target (reps, tempo, time, accuracy). Include a safety note where the skill can hurt.',
  memory_list:
    'memory_list: 8 to 20 items worth memorising, each with a short, CORRECT meaning. "hook" is a memory aid (mnemonic, picture, pattern): it is an aid, never a fact. Never invent items or facts; leave out anything you are unsure of. Group related items by putting them next to each other.',
  question_patterns:
    'question_patterns: 3 to 6 ways this topic is typically asked: the pattern, what it looks like, the usual trap, one tip. Describe patterns in general terms. Do NOT invent past questions, marks, cut-offs, dates or paper names; tell the learner to check the official syllabus and notices.',
  study_guide:
    'study_guide: the learner\'s own resource is named in the lesson subject; set resource.title to it. Set basis "real_structure" ONLY if you are confident of its actual chapters or sections. Otherwise use "by_position" and split it by position (opening, middle, end) WITHOUT naming chapters. Give 2 or 3 "before" questions, 3 to 6 parts with a focus and 2 or 3 questions each, and 2 or 3 "after" recall prompts. Do not state what the resource claims unless you are certain.',
  key_ideas:
    'key_ideas: 4 to 6 ideas that make the topic interesting. Each "why" says what is surprising or useful about it. Add 2 or 3 open "wonder" questions. Keep it accurate and inviting, with no exam tone and no invented facts.',
  state_diagram:
    'state_diagram: ONLY for something that really has a lifecycle (states and what moves it between them), such as an account, order, deployment or request. 3 to 8 states placed on a grid (col 0 to 3, row 0 to 2; one state per cell). Put states that connect next to each other, in the same row or in neighbouring rows, because arrows between rows two or more apart cannot be drawn. Every state must have at least one transition. Each transition label says what TRIGGERS the move ("card fixed", "30 days pass"), never just "goes to". Set "start": true on the state where things begin; use style "main" for the normal healthy state, "temporary" for a state you only pass through, "restricted" for a blocked or end state, otherwise leave style out. Describe only lifecycles you are confident about; if illustrative, say so in the note.',
  landscape:
    'landscape: 3 to 6 categories that split the field by what each is FOR (not by vendor). Each has a one-sentence purpose and 2 to 5 real, well-known examples with a short note. Categories should not overlap much; say so in a category summary if they do. Only name examples you are sure exist.',
  timeline:
    'timeline: 3 to 6 phases in dependency order. Each has a duration at a stated pace, a goal phrased as what the learner CAN DO, and 1 to 4 observable milestones (build, ship or finish something). Be realistic; do not promise jobs or salaries; name no course or certificate you are not sure exists.',
  case_study:
    'case_study: each block is ONE case (a lesson has 2 to 3 of them, each a different case). Use basis "documented" ONLY for a well-known public case you are confident about (an engineering blog post, a published post-mortem); otherwise use "illustrative" and make the scenario plausible but clearly generic. Never invent figures, quotes, dates or company internals. Separate what the team reported from your interpretation. Each ends with a transferable lesson.',
  comparison_table:
    'comparison_table: 5 to 8 rows. Cells are short (under 25 words). Ratings are RELATIVE between the options in this table (1 = weakest, 3 = strongest on that criterion). "best" only where one option clearly leads, at most one per row.',
  pros_cons: 'pros_cons: every option gets at least one real pro and one real con.',
  cost_chart:
    'cost_chart: 2 to 4 scenarios (hobby / startup / at scale) each with the assumption behind it, one value per scenario per option, all in ONE unit. Values are ROUGH ESTIMATES: round them (1 or 2 significant figures), never present them as quotes, and make the relative sizes honest (what scales with usage, what is flat). If you cannot estimate an option\'s cost at all, leave that option out.',
  matrix_2x2:
    'matrix_2x2: pick the two axes that separate THESE options best (for example ease of start vs long-term control, or cost vs flexibility). Place each option 0 to 10 on each axis, relative to the others; spread them out, do not cluster them.',
  decision_flow:
    'decision_flow: 3 to 5 questions about the learner\'s situation. Every question has both a yes and a no that lead to an existing id; no loops; every path ends in an outcome.',
};

const LEVEL_GUIDE: Array<[RegExp, string]> = [
  [/^beginner|^novice/i, 'The learner is a BEGINNER. In the explanation, define each criterion in one plain sentence before using it, avoid jargon, keep to 3 options and about 5 to 6 criteria, and prefer the safest sensible default over exotic choices.'],
  [/^intermediate/i, 'The learner is INTERMEDIATE. Skip definitions of basic terms, spend the words on trade-offs and what changes as a project grows, and use 6 to 7 criteria.'],
  [/^(advanced|expert|senior)/i, 'The learner is ADVANCED. Assume the fundamentals. Cover failure modes, operational reality, migration and exit costs and second-order effects, with 7 to 8 criteria, and keep the explanation short.'],
];

export function levelGuide(level: string): string {
  return LEVEL_GUIDE.find(([re]) => re.test(level.trim()))?.[1] ?? LEVEL_GUIDE[0][1];
}

export const ACCURACY = (today: string) => `
Prices, versions, market share and trends change, and your knowledge has a cutoff.
- NEVER state an exact price, benchmark, market-share percentage, star count or release date unless you are certain it is current. Use relative terms (low / medium / high), orders of magnitude and what the cost scales with. The ONLY place numbers about money are allowed is a cost_chart, as rounded rough estimates.
- Do not invent products, features, case studies or statistics. If unsure whether something exists or still works that way, leave it out.
- Every note on a table or chart must tell the reader to verify prices and outlook, and say it was written ${today}.
- No marketing language ("powerful", "robust", "modern", "blazing fast", "industry standard") unless immediately backed by a concrete fact.`.trim();

export function buildDecisionMessages(p: DecisionPromptInput): AIMessage[] {
  const chosen = normalizeBlueprint(p.blueprint, KIND_BLOCKS.decision);
  const blueprint: readonly BlockType[] = chosen.length ? chosen : KIND_DEFAULT_BLOCKS.decision;
  const blocksJson = `"blocks": [\n    ${blueprint.map((t) => BLOCK_EXAMPLE[t]).join(',\n    ')}\n  ],`;

  const system = `
You are a senior engineer advising someone who has to make a real choice. You are writing ONE lesson that teaches how to make and defend a decision. It is not a tutorial on one tool and it is not a product brochure.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LESSON CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Subject: "${p.topicTitle || 'Unknown subject'}"
Decision this lesson covers: "${p.moduleTitle}"
Category: "${p.area}"
Learner level: "${p.learnerLevel}"
Prior knowledge: ${p.priorKnowledge || 'None provided.'}
Known weaknesses: ${p.weaknesses.length ? p.weaknesses.join('; ') : 'None provided.'}
Recent mistakes: ${p.mistakes.length ? p.mistakes.join('; ') : 'None provided.'}
Today: ${p.today}

${p.planBlock ? `Who this is for:\n${p.planBlock}\n` : ''}Course position: ${p.coursePosition || 'Standalone lesson.'}

${levelGuide(p.learnerLevel)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT A GOOD DECISION LESSON DOES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NAME REAL OPTIONS. Choose 3 (2 if the choice is genuinely binary, at most 5) options people actually choose between for "${p.moduleTitle}". Use real product, framework or approach names, never categories like "a modern framework". Use the SAME option names in every block.
2. PICK CRITERIA THAT MATTER HERE, from: learning curve, performance, scalability limits, ecosystem and libraries, hiring pool, maintenance and upgrade burden, vendor lock-in, cost (including hidden costs), security track record, tooling, and long-term outlook. Skip the ones that don't apply.
3. BE CONDITIONAL, NOT VAGUE. Never end with "it depends" alone. Say what it depends on and what to pick under each condition.
4. BE HONEST ABOUT DOWNSIDES. Every option gets real cons. No option wins everything.
5. USE THE LEARNER'S SITUATION for examples and questions when it is known.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCURACY RULES (the most important part)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${ACCURACY(p.today)}
- In recommendedResources prefer OFFICIAL sources: each option's pricing page, documentation and release notes, so the reader can check the facts. Use "type": "docs" for them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- explanation: 150 to 350 words of markdown. Frame the decision, say which constraints to settle first (team skills, budget, scale, deadline), and how to read what follows. Do NOT repeat the blocks' content in prose.
- blocks: exactly these, in this order: ${blueprint.map((t) => `${t} (${BLOCK_LABEL[t]})`).join(', ')}.
${blueprint.map((t) => `  • ${BLOCK_RULES[t]}`).join('\n')}
- commonMistakes: 2 to 4 specific mistakes people make when making THIS kind of choice (choosing by hype, ignoring team skills, ignoring exit cost).
- quiz: 3 scenario questions. Each gives a concrete situation with constraints and asks which option fits and why. Wrong answers must be plausible. One question must be about a hidden cost or lock-in trap. Do not put the correct answer at the same index every time.
- exercises: 2 to 3 tasks of type "solve" or "write": give a scenario, ask for a decision and reasoning; the model answer states the choice, the reasoning and the main risk accepted.
- socraticChallenge: a scenario where two constraints conflict (for example cheapest now vs easiest to leave later).
- reviewCards: 3 to 5 decision rules worth remembering in a month, each answerable on its own ("When does X beat Y, and why?"). Name the options; never say "this lesson".
- codeOrExample: leave as "" unless a very short config or snippet genuinely helps the decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSON CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return VALID JSON ONLY. No markdown fences, no commentary. Use exactly this structure:

{
  "title": "Exact lesson title",
  "summary": "One sentence: what the learner will be able to decide and defend after this lesson.",
  "learningObjectives": ["Specific capability", "Specific capability"],
  "keyTakeaways": ["Specific decision rule", "Specific trade-off to remember"],
  "explanation": "Markdown, 150-350 words.",
  ${blocksJson}
  "codeOrExample": "",
  "commonMistakes": ["Specific mistake and how to avoid it"],
  "quiz": [
    { "question": "Scenario question", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "Why, and what reasoning to use." }
  ],
  "recommendedResources": [
    { "title": "Official pricing or docs page for an option", "type": "docs", "searchQuery": "search query to find it", "whyRecommended": "One sentence." }
  ],
  "socraticChallenge": { "scenario": "...", "question": "...", "idealAnswer": "..." },
  ${EXERCISES_JSON}
  "reviewCards": [ { "concept": "Short name", "prompt": "Standalone question", "answer": "Short, checkable answer" } ],
  "estimatedDifficulty": "beginner | intermediate | advanced",
  "prerequisites": ["Only genuinely necessary prerequisite"]
}
`.trim();

  const user = `
Create the decision lesson for:

Subject: "${p.topicTitle || 'Unknown subject'}"
Decision: "${p.moduleTitle}"
Category: "${p.area}"
Learner level: "${p.learnerLevel}"

Compare real options for this decision, say when to pick each, and be honest about uncertainty in prices and outlook. Do not write a generic introduction to "${p.topicTitle || 'the subject'}".
`.trim();

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export interface BlockRedoInput {
  topicTitle: string;
  moduleTitle: string;
  learnerLevel: string;
  today: string;
  /** The section to rewrite, as it is now. */
  current: LessonBlock;
  /** The lesson's other sections, so the rewrite keeps the same options and does not repeat them. */
  others: LessonBlock[];
  /** Defaults to a decision lesson. */
  kind?: LessonKind;
}

const KIND_ABOUT: Partial<Record<LessonKind, string>> = {
  decision: 'a technology decision',
  survey: 'a map of a field',
  roadmap: 'a learning path',
  case_study: 'real-world case studies',
  drill: 'practising a skill',
  memorise: 'memorising a set of items',
  exam_prep: 'preparing for an exam or interview',
  project: 'building a small project',
  resource: 'working through a book, course or video',
  explore: 'exploring a topic out of curiosity',
};

/** Names of the options a lesson compares, taken from whichever of its blocks lists them. */
export function optionsOf(blocks: LessonBlock[]): string[] {
  for (const b of blocks) {
    if (b.type === 'comparison_table') return b.options;
    if (b.type === 'pros_cons') return b.items.map((i) => i.option);
    if (b.type === 'cost_chart') return b.series.map((s) => s.option);
    if (b.type === 'matrix_2x2') return b.points.map((p) => p.option);
  }
  return [];
}

/** Rewrites ONE section of a decision lesson. The reply is just that block. */
export function buildBlockMessages(p: BlockRedoInput): AIMessage[] {
  const type = p.current.type;
  const options = optionsOf([p.current, ...p.others]);
  const system = `
You are a senior engineer rewriting ONE section of a lesson about ${KIND_ABOUT[p.kind ?? 'decision'] ?? 'a technology decision'}. Return VALID JSON only: a single object, the new section. No markdown fences, no commentary.

Subject: "${p.topicTitle}"
Decision: "${p.moduleTitle}"
Learner level: "${p.learnerLevel}"
Today: ${p.today}
${options.length ? `The lesson compares: ${options.join(', ')}. Keep exactly these options and these names.` : ''}

${levelGuide(p.learnerLevel)}

ACCURACY RULES
${ACCURACY(p.today)}

THE SECTION TO WRITE: ${BLOCK_LABEL[type]}
${BLOCK_RULES[type]}

Required shape (replace the example content):
${BLOCK_EXAMPLE[type]}
`.trim();

  const user = `
The current version of this section, which the learner wants rewritten, better and more accurate, not just reworded:
${JSON.stringify(p.current)}

Do not repeat what the lesson's other sections already say (${p.others.map((b) => BLOCK_LABEL[b.type]).join(', ') || 'none'}). Return only the new "${type}" object.
`.trim();

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
