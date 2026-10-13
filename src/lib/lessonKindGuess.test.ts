import { describe, it, expect } from 'vitest';
import { guessLessonKind, type LessonKind } from './lessonKinds';

/**
 * The free title-based suggestion. A wrong guess is a small surprise and a
 * missed one costs a click, so the lists lean towards NOT matching: the
 * "concept" cases below must stay concept.
 */
const CASES: Record<LessonKind, string[]> = {
  decision: [
    'Choosing a tech stack',
    'Postgres vs MongoDB',
    'REST versus GraphQL',
    'Difference between SQL and NoSQL',
    'Compare AWS and Vercel hosting',
    'Pros and cons of microservices',
    'Should I learn Rust?',
    'Should we use microservices',
    'React or Vue?',
    'Is Kubernetes worth it',
    'Worth learning Go in 2026',
    'Which database should I use',
    'Which framework to use for a dashboard',
    'What database for a small shop',
    'Next.js better than Rails for a startup',
    'Best language to learn first',
    'The right stack for a solo founder',
    'Moving from Heroku to AWS',
    'Migrating from MySQL to Postgres',
    'Decide between buying and building',
    'Alternatives to Redis',
  ],
  case_study: [
    'Case study: how Discord migrated to Cassandra',
    'Postmortem of a failed launch',
    'Post-mortem: the cache stampede',
    'How Slack handled outages',
    'How Netflix scaled streaming',
    'Why Quibi failed',
    'Why Amazon won the cloud',
    'Lessons learned from the 2021 outage',
    'Lessons from a failed rewrite',
    'What went wrong at Knight Capital',
    'Incident review: the DNS outage',
    'The rise of Stripe',
    'Success stories from small SaaS teams',
    'Real-world examples of event sourcing',
    'Teardown of a checkout flow',
    'Anatomy of a data breach',
  ],
  roadmap: [
    'Backend developer roadmap',
    'Learning path for data engineers',
    'Study plan for the AWS exam',
    'How to become a data engineer',
    'Become a full-stack developer',
    'Career path for designers',
    '12 week plan to learn SQL',
    '30-day challenge: write every day',
    'Beginner to advanced React',
    'Zero to hired: a frontend path',
    'The best way to learn guitar',
    'Learn Python in 30 days',
    'Where to start with machine learning',
    'What to learn after JavaScript',
  ],
  survey: [
    'Types of databases',
    'The cloud ecosystem',
    'Overview of machine learning',
    'Kinds of caching',
    'Top 30 business',
    'Top 10 programming languages',
    'Best 5 frameworks for the web',
    '30 business ideas to start',
    '7 types of testing',
    'List of cloud providers',
    'Glossary of networking terms',
    'Different approaches to authentication',
    'Main categories of AI tools',
    'The state of frontend tooling',
    'Tools for data analysis',
    'Libraries for machine learning',
    'The big picture of DevOps',
    'What is out there for hosting',
  ],
  drill: [
    'Practice chord changes on guitar',
    'Speaking practice for interviews',
    'Daily typing practice',
    'Drills for the forehand',
    'Warm-up routine for singers',
  ],
  memorise: [
    'Memorise the Spanish irregular verbs',
    'Mnemonics for the cranial nerves',
    'Business vocabulary for meetings',
    'Flashcards for the periodic table',
    'SQL cheat sheet',
    'Learn the times tables by heart',
  ],
  exam_prep: [
    'UPSC prelims strategy',
    'IELTS speaking tips',
    'Prepare for the AWS certified architect exam',
    'System design interview prep',
    'Mock interview practice',
    'Cracking the coding interview',
    'GATE exam syllabus',
    'Previous year questions on polity',
  ],
  project: [
    'Build a URL shortener',
    'Creating a REST API from scratch with Express',
    'Make a Discord bot',
    'Let us build a chat app',
    'Capstone project: a budget tracker',
    'Step-by-step guide to a personal website',
    'Code a calculator in Python',
  ],
  resource: [
    'Reading the book Atomic Habits',
    'Notes from the CS50 course',
    'Working through a Rust textbook',
    'Study guide for the Fast.ai course',
    'Chapter 4 of Designing Data-Intensive Applications',
    'Summary of the Dune book',
  ],
  explore: [
    'Just exploring black holes',
    'Fun facts about the ocean',
    'Out of curiosity: how bees see',
    'The story behind the QWERTY keyboard',
    'Why do cats purr',
  ],
  concept: [
    'Stacks and queues',
    'Binary search',
    'Closures in JavaScript',
    'Past perfect tense',
    'Investing basics',
    'Which of these is a prime number',
    'Introduction to Python',
    'How hash maps work',
    'How does DNS work',
    'What is a database',
    'Top-down parsing',
    'Best practices for REST',
    'Becoming fluent in English',
    'Compound interest',
    'Sorting algorithms',
    'Recursion',
    'Normalization in SQL',
    'The CAP theorem',
    'Tool use in agents',
    'Present simple for habits',
    'Dependency injection',
    'Best practices for REST',
    'Logic gates',
    'Formulas in Excel',
    'Process scheduling',
    'Routine in programming',
    'Book design principles',
    'Making decisions under uncertainty',
    'Test-driven development',
    'The SAT solver problem',
    'Course correction in agile',
    'Interview with a database',
    'Exam scheduling algorithm',
  ],
};

describe('guessLessonKind', () => {
  for (const [kind, titles] of Object.entries(CASES) as Array<[LessonKind, string[]]>) {
    for (const t of titles) {
      it(`"${t}" -> ${kind}`, () => {
        expect(guessLessonKind(t)).toBe(kind);
      });
    }
  }

  it('a title that compares things stays a decision even if it mentions a roadmap or a case', () => {
    expect(guessLessonKind('Postgres vs MongoDB roadmap')).toBe('decision');
    expect(guessLessonKind('Choosing a stack: a case study')).toBe('decision');
  });

  it('a case study beats a path when it names one', () => {
    expect(guessLessonKind('Case study: the path to profitability')).toBe('case_study');
  });

  it('ignores case and surrounding noise, and copes with empty text', () => {
    expect(guessLessonKind('  TOP 30 BUSINESS!!  ')).toBe('survey');
    expect(guessLessonKind('POSTGRES VS MONGODB')).toBe('decision');
    expect(guessLessonKind('')).toBe('concept');
  });
});
