# Status: learning flow and lesson kinds

Updated 2026-10-10. **Nothing is committed or pushed.** This page says what exists, what has been checked and how, and what is still open. If it disagrees with anything else, this page is the newer one (`LESSON_BLOCKS_PLAN.md` is out of date).

## What exists

### Lesson kinds (11)
concept (the original lesson), decision, survey ("Overview"), roadmap, case_study, drill, memorise, exam_prep, project, resource, explore.
Defined in `src/lib/lessonKinds.ts`. A lesson's kind is saved on its module (`CurriculumItem.kind`) and on the written lesson (`content.kind`).

### Lesson sections (15)
comparison_table, pros_cons, cost_chart, matrix_2x2, decision_flow, landscape, timeline, case_study, state_diagram, steps, routine, memory_list, question_patterns, study_guide, key_ideas.
Checked and trimmed in `src/lib/lessonBlocks.ts`; drawn in `src/components/lesson/`. The AI returns data only; nothing draws from AI-written code. No section uses colour for meaning.

### Screens
| Screen | Where | What it does |
|---|---|---|
| **Start learning** | `/learn/start` | What / what for / how big, with a preview of what you will get, then creates it or hands over to the course builder or the plan wizard |
| **All lessons** | `/learn/all` | Every lesson in one list: kind, written or not, "needs regenerating"; change a lesson's kind or sections |
| Learn something new | `/learn/new` | The older picker, kept. Accepts a title, reason and lesson kind in the address |
| Plan wizard | `/learn/program` | Unchanged apart from accepting `?goal=` |
| Add Module | topic page | Kind dropdown with a free suggestion; section checkboxes |
| Study room | topic page | Draws the sections; "Redo this section"; a banner when a lesson's kind was changed after it was written |
| Collect ideas topics | topic page | "Add a lesson" card |

### Server
- `POST /api/generate-lesson` builds the prompt for the module's kind and sections.
- `POST /api/topics/[id]/modules/[moduleId]/block` rewrites one section (your own chat, or the app's AI).
- `PATCH /api/topics/[id]/modules/[moduleId]/kind` changes a lesson's kind or sections. It never edits or deletes a written lesson.
- `GET /api/learning/overview` feeds All lessons.

### Database
Two additive migrations on `CurriculumItem`: `kind` (text, default `concept`) and `blueprint` (nullable JSON). Applied to the **local** database, with backups taken first (`C:\Users\Ravindra\backups\learning-os-pre-lesson-kind-*.dump`, `...-pre-blueprint-*.dump`). They run on Vercel when pushed. The new kinds needed no migration.

## What has been checked

| Check | Result |
|---|---|
| Automated tests | 949 passing in 77 files |
| TypeScript | no errors in the code |
| Prompts | every example in every prompt is itself valid; each kind's prompt keeps the quiz, exercises and review-card fields |
| Section drawing | a render test per section type, no colour classes |
| Diagram layout | 300 random lifecycles: no arrow ever crosses a box |
| Pasted replies | all 12 sample replies in `docs/lesson-test-replies/` load whole |
| **Seen in a browser** | Start learning (light, dark, phone width), All lessons, all six new section types and the lifecycle diagram, drawn with the app's real stylesheet from static files |

## What has NOT been checked

1. **No signed-in screen has been used.** I cannot sign in. The study room, the module list, Add Module and the plan page changes are checked by tests and type-checking only. The Start and All lessons pages were seen only as static renders, so clicks, saving and redirects are untested in a browser.
2. **No real AI run.** Prompts are tested for shape, not for the quality of what a model writes. Case studies, exam patterns and study guides are the likeliest to be wrong. Prices, outlook and "documented" cases must be checked by a person.
3. **`prisma generate` has not completed**, because the running dev server holds a file open. Stop the server, run `npx prisma generate`, restart.
4. Copying a plan from a friend may not carry over the kind and sections (not checked).

## Known problems

- **Borders do not draw anywhere in the app** (existing issue, found while checking). Tailwind's preflight is off, and it is what gives `border border-line` a border style, so about 166 existing class names render no border. Confirmed against the running dev server. The new screens work around it with a scoped rule in `globals.css` (`.lesson-blocks`, `.learn-flow`). A one-line global fix would change the look of every existing screen, so it has not been made.
- A lesson's kind cannot be converted. Changing it keeps the old lesson readable and asks you to regenerate.
- Diagram arrows can cross in dense layouts, and arrows between rows two or more apart are listed as text rather than drawn.
- The keyword suggestion is English only.

## Open decisions for you
1. Fix the border issue app-wide? (Recommended, but it touches every screen.)
2. Keep the six tiles on Learn something new, or replace them with Start learning?
3. Commit when you are ready. I will not commit or push without your yes.
