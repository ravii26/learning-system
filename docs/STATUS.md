# Status: Learning OS

Updated 2026-10-29. Everything described here is committed and merged to `main` (PRs #1–#11). This page says what exists, what has been checked and how, and what is still open. If it disagrees with anything else, this page is the newer one (`LESSON_BLOCKS_PLAN.md` is out of date; `docs/UX_IMPROVEMENTS.md` has the detail of the 2026-10-13 UX batch).

## What exists

### Lesson kinds (11)
concept (the original lesson), decision, survey ("Overview"), roadmap, case_study, drill, memorise, exam_prep, project, resource, explore.
Defined in `src/lib/lessonKinds.ts`. A lesson's kind is saved on its module (`CurriculumItem.kind`) and on the written lesson (`content.kind`).

Kinds are now also set when a goal or plan is created: the roadmap and plan-builder AI return each lesson as `{ title, kind }`. The server keeps a valid label, otherwise falls back to the free keyword guess, otherwise `concept`. Labels are keyed by lesson title so edited or reordered lists keep them (`src/lib/roadmapTopics.ts`, `src/lib/moduleKinds.ts`).

### Lesson sections (15)
comparison_table, pros_cons, cost_chart, matrix_2x2, decision_flow, landscape, timeline, case_study, state_diagram, steps, routine, memory_list, question_patterns, study_guide, key_ideas.
Checked and trimmed in `src/lib/lessonBlocks.ts`; drawn in `src/components/lesson/`. The AI returns data only; nothing draws from AI-written code. No section uses colour for meaning.

Concept lessons may leave "use it when", "where it breaks", "where people go wrong" and the worked example empty when they do not fit the topic; the study room hides empty sections. Prompts ask for a real-life example in the explanation. (A separate "Try it in real life" task card was added and then removed again.)

### Screens
| Screen | Where | What it does |
|---|---|---|
| **Start learning** | `/learn/start` | The main entry point (linked from Today and the primary navigation). What / what for / how big, with a preview of what you will get, then creates it or hands over to the course builder or the plan wizard. Plain topics default to an understanding lesson; format, goal, area and sections are collapsed |
| **All lessons** | `/learn/all` | Every lesson in one list: kind, written or not, "needs regenerating"; change a lesson's kind or sections |
| Learn something new | `/learn/new` | The older series builder, kept for existing links. Accepts a title, reason and lesson kind in the address |
| Plan wizard | `/learn/program` | Unchanged apart from accepting `?goal=` |
| Library | `/library`, `/library/[key]` | Field library pages |
| Add Module | topic page | Kind dropdown with a free suggestion; section checkboxes |
| Study room | topic page | Draws the sections; "Redo this section"; a banner when a lesson's kind was changed after it was written; **Listen** button (below) |
| Collect ideas topics | topic page | "Add a lesson" card |

Navigation is Today, Learn, Review, Notebook, You.

### Listen (read aloud)
`src/components/ReadAloud.tsx` in the study room. Runs the free Kokoro-82M voice in a web worker (`src/lib/tts/kokoro.worker.ts`; WebGPU, WASM fallback), with the browser's built-in voice as a last resort. Skips code, tables and diagrams, highlights the paragraph being read, and has play/pause, skip, voice and speed controls. The position bar is a seekable slider; the voice loads in the background for people who have used Listen before, the model is warmed up during load, and two pieces are prepared ahead so playback has no gaps. Shows one overall download percentage and a separate "preparing" state. Text preparation is in `src/lib/tts/narration.ts`.

### Reliability and accessibility (UX batch, 2026-10-13)
- Notes show "Saved" only after the write succeeds; failures keep the draft and offer Retry; closing an editor flushes pending writes; writes per note are serialized (`src/lib/noteAutosave.ts`).
- Tab-local recovery for notes, unfinished quiz selections, explanations and the current lesson step. Not cross-device; practice-exercise answers are not included.
- Drawers and dialogs trap and restore focus and lock background scroll (`src/lib/useModalFocus.ts`).
- Border defaults are now supplied globally in `globals.css` (see Known problems).
- ESLint is configured (`.eslintrc.json`).

### Manual mode (your own chat instead of the app's AI)
Pasted replies are read by `src/lib/ai/manual.ts`. It handles code fences inside JSON strings and repairs real line breaks and tabs inside text values (which JSON forbids). A complete but unreadable reply now says "formatting error"; only a reply that really stops early says "cut off".

### Server
- `POST /api/generate-lesson` builds the prompt for the module's kind and sections.
- `POST /api/generate-roadmap` and `POST /api/goals` label each lesson with a kind.
- `POST /api/topics/[id]/modules/[moduleId]/block` rewrites one section (your own chat, or the app's AI).
- `PATCH /api/topics/[id]/modules/[moduleId]/kind` changes a lesson's kind or sections. It never edits or deletes a written lesson.
- `GET /api/learning/overview` feeds All lessons.
- The dashboard layout runs its two database lookups in parallel.

### Database
Two additive migrations on `CurriculumItem`: `kind` (text, default `concept`) and `blueprint` (nullable JSON). Nothing since has needed a migration. Migrations run on Vercel through `vercel-build` (`scripts/migrate-deploy.js`).

## What has been checked

Re-run on 2026-10-29 from a clean install (`npm ci`) at the current `main`:

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | no errors |
| ESLint (`next lint`) | no warnings or errors |
| Automated tests | 977 passing, 2 failing, in 81 files (the two failures are in `src/lib/urlSafety.test.ts`; see Known problems) |
| `prisma generate` | completes |
| Prompts | every example in every prompt is itself valid; each kind's prompt keeps the quiz, exercises and review-card fields |
| Section drawing | a render test per section type, no colour classes |
| Diagram layout | 300 random lifecycles: no arrow ever crosses a box |
| Pasted replies | all 12 sample replies in `docs/lesson-test-replies/` load whole |
| Signed-in browser run (2026-10-15) | Today → Start learning, creating a one-lesson topic, importing a deterministic lesson, immediate note close/reopen, simulated offline save and Retry, nested link-dialog focus and Escape, reload recovery of lesson step, explanation draft and quiz selection. Start learning and the Notes drawer at 390px and 1280px, light and dark. Screenshots in `docs/ux-verification/` |

## What has NOT been checked

1. **No real AI run.** Prompts are tested for shape, not for the quality of what a model writes. Case studies, exam patterns and study guides are the likeliest to be wrong. Prices, outlook and "documented" cases must be checked by a person.
2. **Browser coverage is partial.** The 2026-10-15 run covered Start learning and notes. Not browser-tested since: the Listen button (checked by unit tests of the text preparation only; the voice model, WebGPU path and playback were not exercised here), All lessons clicks, Add Module, "Redo this section", the kind and section change flow, and kind labels on goals and plans.
3. Copying a plan from a friend may not carry over the kind and sections (not checked).
4. There is no continuous integration. Nothing runs lint, types, tests, build or migrations automatically on a pull request.

## Known problems

- **`src/lib/urlSafety.test.ts` has 2 failing tests** (found on 2026-10-29):
  - "allows a well-known public domain" needs a real DNS lookup and fails in an environment without outside network access. Probably an environment issue.
  - "unwraps IPv4-mapped IPv6 before checking": Node writes `http://[::ffff:8.8.8.8]/` as the host `[::ffff:808:808]`, with brackets, so `net.isIP` does not recognise it and the code falls through to a DNS lookup that fails. This fails closed (a blocked address stays blocked), but a public IPv4-mapped address is wrongly refused, and the checker's `::ffff:a.b.c.d` pattern does not match the form Node produces. Not fixed yet.
- Border defaults are now supplied by a zero-width rule in `globals.css`, so `border border-line` draws again. The earlier note that borders drew nowhere describes the state before the UX batch. Scoped workarounds (`.lesson-blocks`, `.learn-flow`) may now be redundant and have not been removed.
- A lesson's kind cannot be converted. Changing it keeps the old lesson readable and asks you to regenerate.
- Diagram arrows can cross in dense layouts, and arrows between rows two or more apart are listed as text rather than drawn.
- The keyword suggestion is English only.
- Draft recovery is tab-local, not cross-device.

## Open decisions for you
1. Keep the six tiles on Learn something new, or replace them with Start learning?
2. Add CI (lint, types, tests, build, migrations against a scratch database) on pull requests?
3. Fix the IPv4-mapped IPv6 handling in `urlSafety.ts` (parse the bracketed hex form)?
