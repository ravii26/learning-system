/**
 * How different kinds of things are actually learned. A plan for spoken
 * English, a plan for guitar and a plan for UPSC should not share one
 * template: each kind has its own building blocks, its own daily practice
 * and its own kind of proof. The AI gets the guide for the goal's kind when
 * it asks clarifying questions and when it drafts the topic list.
 */

export type Archetype = 'language' | 'performance' | 'exam' | 'technical' | 'professional' | 'creative' | 'academic';
export const ARCHETYPES: Archetype[] = ['language', 'performance', 'exam', 'technical', 'professional', 'creative', 'academic'];

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  language: 'Language & communication',
  performance: 'Hands-on skill',
  exam: 'Exam preparation',
  technical: 'Technical subject',
  professional: 'Professional skill',
  creative: 'Creative skill',
  academic: 'Subject knowledge',
};

/**
 * The same four target levels read differently per kind. "Interview-ready"
 * means something for DSA; for cooking or guitar it's "advanced".
 */
export const LEVEL_WORDS: Record<Archetype, Record<'aware' | 'use' | 'build' | 'interview', string>> = {
  language: { aware: 'survival basics', use: 'everyday conversations', build: 'confident at work', interview: 'fluent under pressure' },
  performance: { aware: 'first steps', use: 'comfortable basics', build: 'confident', interview: 'advanced' },
  exam: { aware: 'know the exam', use: 'syllabus covered', build: 'scoring well in mocks', interview: 'exam-ready' },
  technical: { aware: 'know about it', use: 'use it day to day', build: 'build real things with it', interview: 'interview-ready' },
  professional: { aware: 'know the basics', use: 'do it at work', build: 'deliver real results', interview: 'expert' },
  creative: { aware: 'first steps', use: 'making regularly', build: 'finished work you can show', interview: 'advanced' },
  academic: { aware: 'know about it', use: 'understand it well', build: 'apply it', interview: 'expert depth' },
};

export function isArchetype(v: unknown): v is Archetype {
  return typeof v === 'string' && (ARCHETYPES as string[]).includes(v);
}

/**
 * Written from how teachers and syllabi in each area are actually organised
 * (CEFR for languages, official exam syllabi, method books for instruments,
 * pattern lists for DSA). Each guide says what the topics must look like,
 * what must be in the list, and what "kind" to use so the right practice and
 * proof follow.
 */
export const ARCHETYPE_GUIDE: Record<Archetype, string> = {
  language: `LANGUAGE / COMMUNICATION (spoken English, IELTS speaking, a foreign language, public speaking in a language)
How it is really learned: lots of understandable input (listening, reading) + frequent speaking/writing output + correction, every day, in small doses. Grammar and vocabulary are learned as tools for real situations, not as theory. Fluency grows through repeated timed speaking (4/3/2 retelling, shadowing, speaking on a topic for 1-2 minutes), not through reading about fluency.
The list MUST contain, as separate specific topics:
- Specific grammar points in teaching order (e.g. "Present simple for habits and facts", "Past simple: regular and irregular verbs", "Articles: a, an, the", "Present perfect vs past simple", "Question forms", "Modals for requests and advice", "Conditionals for hypotheticals"). Never one topic called "Grammar".
- Vocabulary by theme and situation (e.g. "Words for describing your job and daily work", "Phrases for agreeing, disagreeing and interrupting politely", "Linking words: however, although, therefore"). Never one topic called "Vocabulary".
- Speaking functions for the learner's situations (e.g. "Introduce yourself in 60-90 seconds", "Describe a past project step by step", "Give and justify an opinion", "Handle a question you don't understand").
- Pronunciation features that matter for the learner's first language when known (e.g. for Hindi/Gujarati speakers: v/w, th, word stress, not adding extra vowels).
- Listening practice and fluency drills (shadowing, timed talks) as "skill" topics.
- For interview/work goals: STAR answers, talking about strengths and weaknesses, explaining your projects, small talk, follow-up questions.
kind: grammar and vocabulary topics = "concept" (taught in lessons with exercises); speaking, listening, pronunciation, fluency and conversation topics = "skill" (daily practice). "build" = a full mock conversation or mock interview recorded and reviewed.`,

  performance: `HANDS-ON / PHYSICAL / PERFORMANCE SKILL (a musical instrument, singing, cooking, drawing basics, a sport, typing, dance, driving, yoga)
How it is really learned: short daily deliberate practice of specific techniques, slowly then faster, with a measurable target; applying techniques in real pieces/dishes/games; feedback by recording yourself or a teacher. Theory only when it helps the next piece.
The list MUST contain:
- Named techniques in the order a teacher would introduce them (guitar: "Open chords C, G, D, Em, Am", "Clean chord changes at 60 bpm", "Down-up strumming patterns", "Barre chords F and Bm"; cooking: "Knife skills: dicing onion, mincing ginger-garlic", "Tempering (tadka)", "Cooking dal to the right consistency").
- Real repertoire at each level: actual songs, dishes, drills, routines, named where there are widely known standard examples (e.g. "Play 'Knockin' on Heaven's Door' (G, D, Am, C)"; "Make a restaurant-style paneer butter masala").
- Measurable milestones inside the summary ("switch between G and C 30 times a minute", "cook a full thali for 4 in 90 minutes").
- Care/setup basics only when essential (tuning, equipment, safety).
kind: techniques and pieces = "skill" (daily practice); only genuinely theoretical topics (music theory, spice chemistry) = "concept"; "build" = a performance/showcase (record a full song, cook a full meal for guests).`,

  exam: `EXAM PREPARATION (UPSC, GATE, CAT, NEET, JEE, IELTS, SAT, bank exams, certifications)
How it is really learned: follow the OFFICIAL syllabus and its weightage; study standard sources; solve previous years' questions (PYQs) topic by topic; take full timed mock tests; analyse mistakes; revise in cycles.
The list MUST contain:
- The actual subjects and sub-topics from the exam's official syllabus, with their real names (UPSC prelims GS: "Indian Polity: Constitution, Parliament, Judiciary", "Modern Indian History: 1857-1947", "Indian Economy: budget, inflation, banking", "Physical Geography", "Environment & Ecology", "Science & Technology", "Current Affairs (last 12-18 months)", plus CSAT: "Reading comprehension", "Basic numeracy", "Logical reasoning"). Never "Subject-Specific Deep Dives".
- Standard sources in the summary where they are well-known (e.g. NCERT class 6-12, Laxmikanth for Polity) — name the book, never a URL.
- PYQ practice per subject, sectional tests, full mock tests, mistake analysis and revision cycles as their own "skill" topics.
- Exam strategy topics: time management in the paper, negative marking strategy, elimination techniques.
importance: follow weightage: high-weightage subjects are "core".
kind: syllabus subjects = "concept"; ONLY numeric/logical problem sets (quant, reasoning, physics numericals) = "algorithm"; writing and speaking tasks, PYQs, mocks, answer writing, revision = "skill".`,

  technical: `TECHNICAL / PROGRAMMING / ENGINEERING (DSA, a programming language, web development, ML, data science, cloud, system design, networking)
How it is really learned: concept → worked example → practise problems/exercises → build something real; for interview goals, solve problems by pattern under time.
The list MUST contain:
- Specific concepts with their real names in dependency order (DSA: "Arrays and strings", "Two pointers", "Sliding window", "Hash maps and sets", "Linked lists", "Stacks and queues", "Binary search", "Recursion and backtracking", "Trees and BST", "Heaps", "Graphs: BFS/DFS", "Dynamic programming: 1-D", "Dynamic programming: 2-D"). Never "Basic Data Structures" or "Advanced Algorithms".
- Tools and practices professionals use (e.g. Git, debugging, testing) when the goal is work.
- 1-2 real projects with a concrete result (e.g. "Build and deploy a URL shortener with auth").
kind: explanatory topics = "concept"; problem-solving topics = "algorithm"; architecture topics = "design"; projects = "build".`,

  professional: `PROFESSIONAL / BUSINESS SKILL (digital marketing, sales, product management, finance and investing, accounting, HR, leadership, project management, Excel)
How it is really learned: core frameworks and vocabulary, the actual tools of the trade, then doing real work with real numbers: campaigns, models, analyses, case studies, with measurable results.
The list MUST contain:
- Named frameworks, channels, methods and metrics (digital marketing: "SEO: keyword research", "On-page SEO", "Google Ads search campaigns", "Meta ads targeting", "Email marketing: list building and sequences", "Funnels and conversion rate", "Google Analytics 4: events and reports", "CAC, LTV, ROAS").
- The actual tools used (Google Analytics, Search Console, Excel/Sheets, Canva) as practical topics.
- Real-work tasks with a measurable output ("Run a ₹1,000 test ad campaign and report CTR and CPC").
kind: frameworks and ideas = "concept"; repeated practical tasks (writing ad copy, cold calls, building models in Excel) = "skill"; 1-2 end-to-end real projects = "build".`,

  creative: `CREATIVE SKILL (writing fiction or content, graphic design, video editing, photography, illustration, music production, UI design)
How it is really learned: craft principles shown in real examples, deliberate exercises on one principle at a time, a steady output habit, and critique of finished work; a portfolio grows over time.
The list MUST contain:
- Specific craft principles and techniques (photography: "Exposure triangle: aperture, shutter, ISO", "Composition: rule of thirds, leading lines", "Natural light at golden hour"; writing: "Hooks and opening lines", "Show, don't tell", "Dialogue that reveals character").
- The main tools, named (Lightroom, Figma, Premiere Pro/DaVinci Resolve, Canva) when the field uses them.
- Regular output exercises with constraints ("one 300-word scene a day", "a 30-day photo challenge").
- Critique and study of great work (analysing 3 examples of X).
- Portfolio pieces.
kind: principles = "concept"; exercises and output habits = "skill"; portfolio pieces = "build".`,

  academic: `ACADEMIC / KNOWLEDGE SUBJECT (history, psychology, economics, physics, biology, philosophy, maths for its own sake, a school or college subject)
How it is really learned: build the core ideas in order, work examples and problems, explain ideas in your own words, connect ideas, test with questions.
The list MUST contain:
- The subject's real chapters/topics with their standard names, in the order a good textbook uses (economics: "Supply and demand", "Elasticity", "Market structures: perfect competition to monopoly", "GDP and how it is measured", "Inflation and monetary policy").
- Problem practice where the subject has it (numericals, derivations, proofs) as "algorithm" topics.
- Applying ideas to real cases (current events, experiments, case studies).
kind: ideas = "concept"; problem-solving = "algorithm"; a research/essay/experiment project = "build".`,
};

/** Guessed from the goal's words before the AI classifies it (and used when the AI is unavailable). */
export function guessArchetype(goal: string): Archetype {
  const g = ` ${goal.toLowerCase()} `;
  if (/\b(upsc|ias|gate|cat|neet|jee|ielts|toefl|gre|gmat|sat|ssc|bank po|ibps|exam|entrance|certification|cfa|ca foundation|clat|board exams?)\b/.test(g)) return 'exam';
  if (/\b(english|hindi|spanish|french|german|japanese|korean|chinese|mandarin|arabic|language|speaking|spoken|fluency|accent|pronunciation|communication|conversation)\b/.test(g)) return 'language';
  if (/\b(guitar|piano|violin|flute|drums|ukulele|tabla|sing|singing|vocals?|cook|cooking|bake|baking|chess|swim|swimming|dance|dancing|yoga|football|cricket|badminton|tennis|typing|drive|driving|gym|workout|calisthenics|sketch|drawing)\b/.test(g)) return 'performance';
  if (/\b(dsa|algorithm|data structures?|programming|coding|python|java|javascript|react|node|web dev|frontend|backend|machine learning|ml|ai|artificial intelligence|data science|sql|devops|cloud|aws|system design|cyber ?security|android|ios|flutter|blockchain)\b/.test(g)) return 'technical';
  if (/\b(marketing|sales|product management|finance|investing|stock|trading|accounting|excel|leadership|management|business|entrepreneur|startup|hr|negotiation|seo)\b/.test(g)) return 'professional';
  if (/\b(writing|write|design|photography|video editing|editing|illustration|animation|music production|content creation|youtube|figma|ui|ux|painting)\b/.test(g)) return 'creative';
  return 'academic';
}
