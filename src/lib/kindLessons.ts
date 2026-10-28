import type { AIMessage } from '@/lib/ai/aiClient';
import { EXERCISES_JSON } from '@/lib/program/lessonGuide';
import { REAL_LIFE_JSON, REAL_LIFE_RULE } from '@/lib/tryInRealLife';
import { BLOCK_LABEL, normalizeBlueprint, type BlockType } from '@/lib/lessonBlocks';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, type LessonKind } from '@/lib/lessonKinds';
import { ACCURACY, BLOCK_EXAMPLE, BLOCK_RULES, buildDecisionMessages, levelGuide, type DecisionPromptInput } from '@/lib/decisionLesson';

/**
 * The prompts for the lesson kinds that are not a concept or a decision:
 * a map of a field (survey), a learning path (roadmap) and real cases
 * (case_study). Each asks for the same core fields as every lesson (so the
 * quiz, exercises and review cards keep working) plus its own `blocks`.
 */

export type KindPromptInput = DecisionPromptInput;

interface KindSpec {
  /** One line: who the model is and what it is writing. */
  role: string;
  /** What a good lesson of this kind does. */
  principles: string[];
  /** The explanation field. */
  explanation: string;
  /** How the shared sections are shaped for this kind. */
  quiz: string;
  exercises: string;
  socratic: string;
  reviewCards: string;
  mistakes: string;
  /** The decision_flow / comparison_table etc. often need kind-specific guidance on top of BLOCK_RULES. */
  extraBlockRules?: Partial<Record<BlockType, string>>;
  /** What to put in codeOrExample; empty by default. */
  code?: string;
}

const SPECS: Record<'survey' | 'roadmap' | 'case_study', KindSpec> = {
  survey: {
    role: 'You are a senior practitioner giving a newcomer an honest MAP of a field: how it is divided, what each part is for, and where to go deeper. It is not a tutorial on one tool.',
    principles: [
      'SPLIT BY PURPOSE. Carve the field into 3 to 6 categories by what each is FOR, not by vendor or fashion. A newcomer should be able to say "I need X, so I look in this category".',
      'USE REAL EXAMPLES. Each category names well-known real examples. Only name things you are sure exist; leave a category thinner rather than invent.',
      'SAY WHAT TO LEARN FIRST. Tell the learner which category or example to start with and why, and what can wait.',
      'BE HONEST ABOUT OVERLAP AND CHANGE. Say where categories blur, and which parts of the map move quickly.',
    ],
    explanation: '150 to 300 words of markdown: how the field is carved up and why, what to read first, and how to use the map. Do not repeat the blocks in prose.',
    quiz: '3 classification questions: each describes a need or a tool and asks which category it belongs to, or which category to look in, and why. Plausible wrong answers.',
    exercises: '2 to 3 tasks of type "solve" or "write": given a need, choose a category and an example and justify it; the model answer gives the reasoning.',
    socratic: 'a scenario where a newcomer is overwhelmed by choice and must decide where to start.',
    reviewCards: '3 to 5 cards of the form "What is <category> for, and when would you look there?". Name the category; never say "this lesson".',
    mistakes: '2 to 4 mistakes newcomers make in this field (learning the trendy tool first, mixing up categories, going deep too early).',
    extraBlockRules: {
      comparison_table: 'In this lesson the columns are the CATEGORIES from the landscape (not products); rows compare what they are for, how hard they are to start, and how fast they change.',
      matrix_2x2: 'Place the CATEGORIES, not individual products.',
    },
  },
  roadmap: {
    role: 'You are a senior mentor laying out a REALISTIC path for someone learning a field. It is not a list of links and it is not a promise of a job.',
    principles: [
      'ORDER BY DEPENDENCY. Each phase should unlock the next; say why the order is what it is.',
      'MAKE EVERY PHASE OBSERVABLE. A goal says what the learner CAN DO, and milestones are things to build, ship or finish, not "understand X".',
      'BE REALISTIC ABOUT TIME. State the pace the durations assume (default about 6 hours a week unless the learner said otherwise). Do not squeeze a year of work into a month.',
      'SAY WHAT TO SKIP. Name what a beginner can safely leave for later.',
      'NO UNCHECKED CLAIMS. Do not promise jobs, salaries or certificates; do not name a course, book or certificate unless you are sure it exists.',
    ],
    explanation: '150 to 300 words of markdown: the shape of the path, the pace it assumes, what is deliberately left out, and how to adjust it if you have more or less time.',
    quiz: '3 questions about the path: which phase comes first and why, what a milestone proves, and what to do when stuck or behind. Plausible wrong answers.',
    exercises: '2 to 3 tasks of type "write" or "do": write your own first four weeks, define a milestone project, adapt the path to a time budget; the model answer shows a good one.',
    socratic: 'a scenario where the learner is two weeks behind plan or has to choose between two phases.',
    reviewCards: '3 to 5 cards about the order and the reason for it ("Why does <phase> come before <phase>?"). Never say "this lesson".',
    mistakes: '2 to 4 mistakes people make following a path (skipping fundamentals, tutorial-hopping, never building anything).',
  },
  case_study: {
    role: 'You are a senior engineer analysing how real teams made technical decisions, so a learner can borrow the reasoning, not copy the answer.',
    principles: [
      'REAL OR LABELLED. Use a case only if it is well documented and you are confident about it; otherwise write an ILLUSTRATIVE scenario and label it so. Never invent figures, quotes, dates or company internals.',
      'SEPARATE FACT FROM READING. Say what the team reported, then (clearly marked as your interpretation) what it suggests.',
      'DRAW A TRANSFERABLE LESSON. Every case ends with a lesson that applies beyond that company, and says when it would NOT apply.',
      'SHOW CONTRAST. Pick cases that differ (different size, constraints or outcome) so the lesson is not one-sided.',
    ],
    explanation: '150 to 300 words of markdown: what the cases have in common, what to look for when reading any case, and the caveat that every case had constraints you may not share.',
    quiz: '3 questions: what constraint drove the choice in a case, what you would do under a changed constraint, and what is NOT safe to conclude from the case. Plausible wrong answers.',
    exercises: '2 to 3 tasks of type "write" or "solve": apply a case\'s reasoning to a new scenario; the model answer states the choice, the reasoning and the risk accepted.',
    socratic: 'a scenario that resembles a case but with one constraint changed, asking whether the same choice still holds.',
    reviewCards: '3 to 5 cards of the form "When does <case reasoning> stop applying?". Never say "this lesson".',
    mistakes: '2 to 4 mistakes people make reading case studies (copying a famous company\'s choice, survivorship bias, ignoring different constraints).',
    extraBlockRules: {
      comparison_table: 'In this lesson the columns are the CASES from the case_study blocks; rows are the constraints, the choice made, and how it turned out.',
    },
  },
};

const MORE_SPECS: Record<'drill' | 'memorise' | 'exam_prep' | 'project' | 'resource' | 'explore', KindSpec> = {
  drill: {
    role: 'You are a coach designing ONE focused practice lesson for a skill the learner repeats: an instrument, a language, typing, cooking, a sport or a coding technique.',
    principles: [
      'ONE TECHNIQUE. Teach a single technique or sub-skill, not the whole subject.',
      'BE PRECISE. Say exactly what to do (which finger, how many reps, what tempo, what to say), with numbers.',
      'MAKE IT MEASURABLE. Every drill has a target the learner can check on their own.',
      'DIAGNOSE FAULTS. Say what a typical mistake looks, sounds or feels like and how to fix it.',
      'SAFETY. Mention strain or injury risks where they exist.',
    ],
    explanation: '100 to 250 words of markdown: what this technique is for, what good looks and feels like, and how often to practise it.',
    quiz: '2 or 3 questions that check the learner can spot a fault or pick the right fix. Plausible wrong answers.',
    exercises: '3 to 5 tasks of type "do" or "say" with a measurable success check, plus one "write" task that diagnoses a fault.',
    socratic: 'a scenario where practice has plateaued and the learner must work out why.',
    reviewCards: '3 to 5 cards on the key points of the technique and its usual faults. Never say "this lesson".',
    mistakes: '2 to 4 mistakes learners make practising this (rushing, practising mistakes, skipping the warm-up).',
    extraBlockRules: {},
  },
  memorise: {
    role: 'You are a memory coach helping a learner memorise a defined set of items and keep them.',
    principles: [
      'ONLY CORRECT, CHECKABLE ITEMS. Never invent an item or a fact; leave out anything you are unsure of.',
      'CHUNK AND GROUP. Put related items together and keep each group small enough to hold in mind.',
      'USE HOOKS HONESTLY. A mnemonic or picture is an aid to recall; label it as one and never present it as a fact.',
      'RETRIEVE, DO NOT REREAD. Show how to test yourself from memory and when to review again.',
    ],
    explanation: '100 to 200 words of markdown: how this set is organised, the memory strategy (chunking, hooks, self-testing) and a simple review schedule.',
    quiz: '3 recall questions mixing term to meaning and meaning to term. Plausible wrong answers.',
    exercises: '3 or 4 tasks of type "say" or "write": recall from memory then check, cover and recall, fill the gaps.',
    socratic: 'a scenario about two items that keep getting confused, asking how to tell them apart.',
    reviewCards: '8 to 12 cards, one fact each. The prompt is a recall question that can be answered on its own; the answer is short. Never say "this lesson".',
    mistakes: '2 to 4 mistakes (rereading instead of recalling, memorising without understanding, taking on too many items at once).',
    extraBlockRules: { comparison_table: 'Here the columns are items that are easily CONFUSED, and the rows are how to tell them apart.' },
  },
  exam_prep: {
    role: 'You are an experienced exam and interview coach. You help a learner prepare efficiently and honestly.',
    principles: [
      'KNOW WHAT IS TESTED. Describe the sections or subjects only where you are sure of the real structure; otherwise say what is typical and tell the learner to check the official syllabus.',
      'TEACH THE PATTERNS. Show how questions are usually asked, the usual traps, and how to eliminate or structure an answer.',
      'NO INVENTED SPECIFICS. Never invent past questions, marks, cut-offs, dates or paper names; say "check the official notice".',
      'STRATEGY, NOT ONLY CONTENT. Cover time per question, what to skip, negative marking or follow-up questions where they apply.',
    ],
    explanation: '150 to 300 words of markdown: what the exam or interview tests, how to split your time, and how to use the sections below.',
    quiz: '3 to 5 exam-style questions with the reasoning or elimination that gets to the answer. Plausible wrong answers.',
    exercises: '4 to 6 tasks of type "solve" in the style of the exam, each with a model answer and the reasoning, and at least one that is timed.',
    socratic: 'a scenario under time pressure where the learner must choose what to attempt and what to skip.',
    reviewCards: '3 to 5 cards on rules, facts or traps worth remembering. Never say "this lesson".',
    mistakes: '2 to 4 mistakes candidates make (spending too long on one question, learning facts but not patterns, skipping timed practice).',
    extraBlockRules: {
      landscape: 'Here the categories are the exam SECTIONS or SUBJECTS and the items are the topics inside them. Only state a structure you are sure of; otherwise label it typical.',
      timeline: 'Here it is a REVISION PLAN: phases before the exam, with what to revise or practise in each.',
    },
  },
  project: {
    role: 'You are a mentor guiding a learner through building ONE small, real project, step by step.',
    principles: [
      'DEFINE DONE. Say in one sentence what the finished project does, so the learner knows when to stop.',
      'KEEP IT SMALL. Pick the smallest version that is still real and useful.',
      'ORDER BY BUILD. Every step leaves something that runs or can be checked; include setup.',
      'SHOW THE CHECK. After each step say what the learner should see, and what usually goes wrong.',
      'ONLY REAL TOOLS. Use only tools, libraries and commands you are sure exist, and flag anything version-sensitive.',
    ],
    explanation: '100 to 250 words of markdown: what you will build, what you need first, and what "done" looks like.',
    quiz: '2 or 3 questions about why the steps are in this order and how to isolate a failing step. Plausible wrong answers.',
    exercises: '2 to 4 tasks of type "do": extend the project, each with a success check.',
    socratic: 'a scenario where the project is stuck at one step and the learner must isolate the fault.',
    reviewCards: '3 to 5 cards on the concepts the project uses. Never say "this lesson".',
    mistakes: '2 to 4 mistakes people make building projects (scope creep, skipping the check after each step, copying code they do not understand).',
    code: 'put the key code listing here in a fenced code block if it is short and you are sure it is correct; otherwise leave it as "".',
    extraBlockRules: {
      timeline: 'Here each phase is a MILESTONE: a working checkpoint the learner can run or show.',
      comparison_table: 'Here compare 2 or 3 ways to build it (tools or approaches), only if that choice really matters for this project.',
    },
  },
  resource: {
    role: 'You are a study coach helping a learner get the most out of ONE resource they already have: a book, course, video series or paper.',
    principles: [
      'THE RESOURCE IS THE LEARNER\'S. Its title is in the lesson subject. Do not invent its contents, chapters, claims or quotes.',
      'BE HONEST ABOUT STRUCTURE. If you are not sure of its real chapters, split it by position and say so.',
      'TEACH A METHOD. Ask questions before reading, give a focus for each part, and use recall prompts after.',
      'MAKE IT ACTIVE. The learner should answer questions and write from memory, not just highlight.',
    ],
    explanation: '150 to 300 words of markdown: how to approach this kind of resource, a pace suggestion, and a simple note-taking template.',
    quiz: '3 questions that test whether the learner can apply the method (what to ask before a part, how to recall after it). Plausible wrong answers.',
    exercises: '2 or 3 tasks of type "do" or "write" to do WITH the resource, for example summarise a part in three sentences from memory.',
    socratic: 'a scenario where the learner finished a part but cannot recall it, asking what to change.',
    reviewCards: '3 to 5 cards about the study method. Never say "this lesson".',
    mistakes: '2 to 4 mistakes (reading passively, highlighting instead of recalling, not testing yourself, rushing to finish).',
    extraBlockRules: { timeline: 'Here it is a PACING PLAN: how to spread the resource over days or weeks, with a check-in at each stage.' },
  },
  explore: {
    role: 'You are a curious, accurate guide helping a learner explore a topic for the pleasure of it. There is no exam and no pressure.',
    principles: [
      'LEAD WITH WHAT IS SURPRISING. Start with the idea that makes the topic worth caring about.',
      'STAY ACCURATE. Curiosity does not excuse invented facts; leave out what you are unsure of.',
      'KEEP IT LIGHT. 4 to 6 ideas, a few open questions, and where to look next.',
      'NO QUIZ PRESSURE. Questions are gentle and fun, never tricks.',
    ],
    explanation: '150 to 300 words of markdown as a readable narrative. No jargon dump.',
    quiz: '2 gentle questions that are fun to answer, with no trick options.',
    exercises: '0 to 2 optional tasks of type "write", such as explaining one idea to a friend. An empty list is fine.',
    socratic: 'a "what if" scenario to wonder about, with a thoughtful answer.',
    reviewCards: '2 or 3 cards for the ideas most worth remembering. Never say "this lesson".',
    mistakes: '2 or 3 common misconceptions about the topic and what is actually true.',
    extraBlockRules: {
      timeline: 'Here it is how the idea developed over time; use only well-known, reliable history.',
      case_study: 'Here use ONE example that shows the idea in action; label it illustrative unless it is well documented.',
    },
  },
};

export function buildKindMessages(kind: LessonKind, p: KindPromptInput): AIMessage[] {
  if (kind === 'decision' || kind === 'concept') return buildDecisionMessages(p);

  const spec = ({ ...SPECS, ...MORE_SPECS } as Record<Exclude<LessonKind, 'concept' | 'decision'>, KindSpec>)[kind];
  const chosen = normalizeBlueprint(p.blueprint, KIND_BLOCKS[kind]);
  const blueprint: readonly BlockType[] = chosen.length ? chosen : KIND_DEFAULT_BLOCKS[kind];
  const blocksJson = `"blocks": [\n    ${blueprint.map((t) => BLOCK_EXAMPLE[t]).join(',\n    ')}\n  ],`;

  const system = `
${spec.role}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LESSON CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Subject: "${p.topicTitle || 'Unknown subject'}"
This lesson: "${p.moduleTitle}"
Category: "${p.area}"
Learner level: "${p.learnerLevel}"
Prior knowledge: ${p.priorKnowledge || 'None provided.'}
Known weaknesses: ${p.weaknesses.length ? p.weaknesses.join('; ') : 'None provided.'}
Recent mistakes: ${p.mistakes.length ? p.mistakes.join('; ') : 'None provided.'}
Today: ${p.today}

${p.planBlock ? `Who this is for:\n${p.planBlock}\n` : ''}Course position: ${p.coursePosition || 'Standalone lesson.'}

${levelGuide(p.learnerLevel)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT A GOOD LESSON OF THIS KIND DOES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${spec.principles.map((x, i) => `${i + 1}. ${x}`).join('\n')}
${p.planBlock ? `${spec.principles.length + 1}. USE THE LEARNER'S SITUATION for examples and questions.` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCURACY RULES (the most important part)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${ACCURACY(p.today)}
- In recommendedResources prefer OFFICIAL sources (documentation, project sites, published engineering write-ups) the reader can check. Use "type": "docs" for them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- explanation: ${spec.explanation}
- blocks: exactly these, in this order: ${blueprint.map((t) => `${t} (${BLOCK_LABEL[t]})`).join(', ')}.
${blueprint.map((t) => `  • ${BLOCK_RULES[t]}${spec.extraBlockRules?.[t] ? ` ${spec.extraBlockRules[t]}` : ''}`).join('\n')}
- commonMistakes: ${spec.mistakes}
- quiz: ${spec.quiz} Do not put the correct answer at the same index every time.
- exercises: ${spec.exercises}
- tryInRealLife: ${REAL_LIFE_RULE}
- socraticChallenge: ${spec.socratic}
- reviewCards: ${spec.reviewCards}
- codeOrExample: ${spec.code ?? 'leave as "".'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSON CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return VALID JSON ONLY. No markdown fences, no commentary. Use exactly this structure:

{
  "title": "Exact lesson title",
  "summary": "One sentence: what the learner will be able to do after this lesson.",
  "learningObjectives": ["Specific capability", "Specific capability"],
  "keyTakeaways": ["Specific takeaway", "Specific takeaway"],
  "explanation": "Markdown.",
  ${blocksJson}
  "codeOrExample": "${spec.code ? 'Code if short and correct, else empty.' : ''}",
  "commonMistakes": ["Specific mistake and how to avoid it"],
  "quiz": [
    { "question": "Question", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "Why, and what reasoning to use." }
  ],
  "recommendedResources": [
    { "title": "Official docs or a published write-up", "type": "docs", "searchQuery": "search query to find it", "whyRecommended": "One sentence." }
  ],
  "socraticChallenge": { "scenario": "...", "question": "...", "idealAnswer": "..." },
  ${EXERCISES_JSON}
  ${REAL_LIFE_JSON}
  "reviewCards": [ { "concept": "Short name", "prompt": "Standalone question", "answer": "Short, checkable answer" } ],
  "estimatedDifficulty": "beginner | intermediate | advanced",
  "prerequisites": ["Only genuinely necessary prerequisite"]
}
`.trim();

  const user = `
Create the lesson for:

Subject: "${p.topicTitle || 'Unknown subject'}"
This lesson: "${p.moduleTitle}"
Category: "${p.area}"
Learner level: "${p.learnerLevel}"

Stay on "${p.moduleTitle}"; do not write a generic introduction to "${p.topicTitle || 'the subject'}".
`.trim();

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
