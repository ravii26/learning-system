# Learning OS: what you can learn and how to use it, end to end

Written 2026-10-11 from the code. Not committed. Items marked (unchecked) were read in code but not clicked through in a signed-in browser.

## 1. The app in one picture

Left menu: **Today**, **Learn**, **Review**, **Notebook**, **You**.

- **Learn** is where everything starts. It shows **Now** (max 2 topics you are working on), **Next** (waiting), your goals, and three buttons: **Start learning**, **All lessons**, **Field library**.
- A **topic** is one thing you are learning. A **module** is one lesson inside a topic.
- **Review** is spaced repetition: cards written from your lessons come back when you are about to forget them.
- **Notebook** is free notes. **You** shows progress, skills and friends.

## 2. How many types of learning

Three layers. Do not confuse them.

### A. What the learning is for: 11 purposes (you pick one in Start learning)

| # | Purpose | Lesson kind it makes | Use it for |
|---|---|---|---|
| 1 | Understand something | concept | "How do closures work?" The standard lesson: explanation, example, mistakes |
| 2 | Choose between options | decision | "Postgres vs MongoDB", "which tech stack": table, pros/cons, cost at sizes, 2×2, flowchart |
| 3 | See the whole field | survey (Overview) | "Top 30 businesses", "what is cloud computing": map of a field |
| 4 | Follow a path | roadmap | "Become a data engineer": ordered stages and decisions |
| 5 | Learn from real examples | case_study | "Why startups fail": cases and comparison |
| 6 | Practise a skill | drill | Guitar, typing, SQL queries: steps and a timed session |
| 7 | Memorise it | memorise | Verbs, periodic table, anatomy: memory list with self-test |
| 8 | Prepare for an exam or interview | exam_prep | IELTS, system design interview: syllabus map and question patterns |
| 9 | Build something | project | "Build a URL shortener": milestones and steps |
| 10 | Work through a book, course or video | resource | "Atomic Habits": study guide split into parts |
| 11 | Just explore | explore | Curiosity: key ideas and things to wonder about |

Every kind except the sections above also keeps the same core: a summary, a quiz, exercises and review cards.

### B. How big: 4 sizes

- **One lesson**: one module, created straight away.
- **A series**: several lessons. Opens the course builder.
- **A full plan**: a goal broken into a programme. Opens the plan wizard.
- **Ongoing**: only for practise, explore and understand. No lessons; a daily practice topic, or a collect-ideas topic that opens the notebook.

### C. How the topic behaves: 4 topic modes (set for you from A and B)

- **syllabus**: modules in order, each with a lesson. The normal one.
- **practice**: daily written sessions instead of modules.
- **accretion** ("collect ideas"): a place for notes; has an "Add a lesson" card.
- **reference**: a lookup topic.

### D. The 15 lesson sections (mix and match per lesson)

comparison table, pros and cons, cost chart, 2×2 map, decision flowchart, field map, timeline, case study, lifecycle diagram, steps, practice session, memory list, question patterns, study guide, key ideas.
Each kind has default sections; you can switch some off or on per lesson ("Sections" picker).

**Total to remember: 11 purposes × 4 sizes, giving 11 kinds of lesson drawn from 15 sections.**

## 3. Things you can cover

Technology choices and comparisons; any school or university subject; languages (vocabulary, speaking drills); exams and interviews; instruments, sports, crafts (daily practice); business and career fields; building projects; reading a book or course with a plan; history and science curiosity; recurring revision of facts.

Weak fits (be honest): anything needing live data (prices, news), anything where a wrong fact is costly (medical, legal, tax), and visual or physical skills where you need a teacher. Prices, outlook and case studies written by AI must be checked by you.

## 4. End to end: from nothing to a finished topic

1. **Learn → Start learning.**
   - Type what you want to learn. The app guesses the purpose for free; change it if wrong.
   - Pick the size. A preview says exactly what you will get before anything is created.
   - Press create. One lesson: you land on the topic. Series or plan: you land in the builder with your answers filled in.
2. **Topic goes to Now or Next.** Only 2 can be in Now. A topic needs a "why" and a "next action" to become active.
3. **Open the topic page** (section 5) and study the first module.
4. **Review** each day for cards that are due.
5. **Mark modules finished** and watch the state change (unseen, shaky, known).

## 5. The topic page, in detail

### Top bar
- **Breadcrumb**: back to Learn, and the goal this topic belongs to (if any).
- **Focus timer**: 25-minute timer with pause and reset. Reading with the timer running counts as study time.
- **Tools menu** (the "more" button): **Sources** (saved links and books), **Questions & mistakes** (confusion bank), **Study time** (today, history), **Topic settings** (rename, area, why, delete).
- Title, area badge (click to open settings) and your "why".
- If you leave to a video or doc and come back, a bar asks whether to count the away time.

### What the page shows depends on the topic mode
- **syllabus**: the module bar and the study room (below).
- **practice**: daily sessions instead: "Prepare my first sessions", then Coming up, today's session with each step, "Finish Day N", and Done so far.
- **accretion**: the "This topic collects ideas" card with **Add a lesson**.
- **empty syllabus**: "Where do you want to get to?" with **Build a roadmap** (AI makes modules) or **Add modules yourself**.

### The module bar (stays on screen while you scroll)
- "Module 2 of 8": opens the **Modules** drawer.
- Previous / next arrows.
- A strip of boxes showing the knowledge state of every module.
- **Notes**: your own notes for the current module (shortcut Alt+N).

### The Modules drawer
- List of all modules with state and time.
- **Placement check**: a few minutes of questions; modules you get right start as known.
- **Edit syllabus**: rename, re-time, reorder, remove.
- **Add module**: title plus **lesson kind** (a free suggestion appears from the title) and **sections**.
- Change a module's kind or sections later; a written lesson is never overwritten, you are told it needs regenerating.

### The study room (one module)
Header: module number, minutes, knowledge state, **Mark finished**, title, summary.
Five steps, in order:
1. **Read**: the lesson. Concept lessons show explanation, example, when to use / avoid, pitfalls. Other kinds show their sections. Each section has **Redo this section**. A banner appears if the kind was changed after writing.
2. **Practice**: exercises (if the lesson has them).
3. **Check**: quiz; your score is saved and moves the knowledge state.
4. **Explain it back**: you write the idea in your own words; the app gives a verdict.
5. **Go deeper**: further resources and bookmarking them to Sources.

Side panels (collapsed): **Your progress on this module** (last quiz, explain-it verdict, cards in review, problem log) and **Lesson options** (**Rewrite this lesson** with fresh examples).

### Writing the lesson: two ways
- **App's AI**: opens, writes in seconds, costs AI credit.
- **Use my own ChatGPT/Claude**: the app shows a prompt; you paste it into your chat, then paste the reply back. Free. Ready replies for testing: `docs/lesson-test-replies/`.

### Topic settings
Title, subject area, "why", and a danger zone: delete (it disappears from lists; modules, notes, cards and time are kept and can be restored).

## 6. Other places you will use

- **All lessons** (`/learn/all`): every lesson in one list, written or not, needs regenerating; change kind or sections here.
- **Field library**: ready-made fields (owner only).
- **Goals**: group topics under a goal.
- **Review**: due cards.
- **Notebook**: free notes.

## 7. Not checked yet

No signed-in click-through of any screen above has been done by me. Real AI output quality has not been tested. Run `npx prisma generate` after stopping the dev server, then restart.
