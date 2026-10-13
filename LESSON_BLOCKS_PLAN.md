> **Superseded.** This was the plan at the start. It is out of date: see `docs/STATUS.md` (what exists and what is checked) and `docs/LEARNING_FLOW_DESIGN.md` (the current design).

# Lesson blocks plan

Goal: a topic like "Choosing a tech stack" gets a lesson shaped for *deciding* (comparison table, cost chart, 2x2, flowchart), not the one fixed concept template. Written 2026-10-08 after reading the code. Nothing here is built yet.

## What the code does today (verified)

| Area | Fact | File |
|---|---|---|
| Lesson shape | One fixed JSON contract (summary, objectives, explanation, codeOrExample, quiz, exercises, reviewCards...). Always the same sections. | `src/app/api/generate-lesson/route.ts` |
| Storage | `GeneratedLesson.content` is a **Json column**, unique per (topicId, moduleId). No DB migration is needed to add fields. | `prisma/schema.prisma` |
| "Several lessons per topic" | Already exists: each curriculum module is one lesson. | same |
| Validation | `normalizeLesson` fixes/drops bad fields; returns null if summary or explanation is missing. It spreads `...l`, so unknown fields survive. | `src/lib/lessonNormalize.ts` |
| Rendering | `ModuleStudyRoom` hard-codes the sections (objectives, explanation, codeOrExample, useWhen/avoidWhen, pitfalls) in a Read tab, plus Practice, Check, Explain it back, Go deeper tabs. | `src/app/(dashboard)/topics/[id]/ModuleStudyRoom.tsx` |
| Markdown | Headings, lists, code, bold, links only. **No tables.** | `src/lib/markdown.ts` |
| Charts | One component only: `Sparkline` (plain SVG). No chart library. | `src/components/ui/Sparkline.tsx` |
| Teaching style per subject | **Already exists**: 7 archetypes (language, performance, exam, technical, professional, creative, academic) and `LESSON_GUIDE[archetype]`. It changes the *prompt text* only, not the output shape. For a standalone topic the archetype is guessed from keywords; "tech stack" would likely fall to `academic`. | `src/lib/program/fieldGuide.ts`, `lessonGuide.ts` |
| Add-topic page | "Learn something new" already asks "What kind of learning is it?" with Course / Practice / **Collect ideas**. Collect ideas (`accretion`) sends you to `/notes` and creates no lessons. This is very likely the notes-only dead end you hit. | `src/app/(dashboard)/learn/new/page.tsx` |
| Other consumers of lesson JSON | quiz, practice and review-cards routes read/extend `content` (they spread existing fields). | `src/app/api/topics/[id]/modules/[moduleId]/*` |

## Three things already in the app that this must not duplicate

The app already has: topic **mode** (syllabus / practice / accretion), program **shape** (course / reading / practice / exploration / project) and subject **archetype** (7). Adding a fourth taxonomy carelessly makes it worse. Decision: the new field is a **lesson kind**, set per lesson (module), narrow in meaning ("what you must be able to do after this lesson"), and **does not replace or merge** the other three. Archetype keeps deciding teaching style. Lesson kind decides which sections exist.

## Design

### Lesson kind (new, per lesson, code-owned)
Stored inside `GeneratedLesson.content.kind`. Starting set: `concept` (today's behaviour, the default for every existing lesson), `decision` (compare and choose), `survey` (map a field). Later: `roadmap`, `case-study`, `skill-drill`.

### Blocks (new, additive)
Lesson content gains an optional `blocks: Block[]`. Legacy fields stay. A lesson with no `blocks` renders exactly as today. Block types, each with its own validator:

- v1: `comparison_table`, `pros_cons`, `decision_flow`
- v2: `cost_chart` (bars), `matrix_2x2`, `trend_note` (qualitative, with "verify as of")
- later: `case_study`, `timeline`, `checklist`

Core fields stay on every lesson regardless of kind: `summary`, `quiz`, `reviewCards`. Reason: the review/evidence pipeline reads them.

### Who decides what
- **You:** the topic, why, level, which kind, whether a generated block is good enough, which blocks to redo.
- **Code (fixed):** the list of kinds, each kind's default blocks, each block's shape and validator, the visuals and colours, spaced-repetition timing.
- **AI:** the *content inside* each block (table cells, costs, flow questions, quiz). Optional later: a suggestion for which kind fits a title.
- **AI never:** invents block types, writes drawing code, or marks anything done. It returns data; our components draw it.

### Visuals: no library
Table = HTML table. Cost bars = SVG/CSS like `Sparkline`. 2x2 = SVG. Flowchart = SVG from a list of `{question, yes, no}` nodes. Colour follows the approved rule (colour = knowledge state only), so pros/cons use +/- signs and ratings use dots/ticks, not red/green. Mockup: see the earlier chat.

## Phases

Each phase ships on its own and leaves the app working.

### Phase 1: Blocks foundation (no AI, no cost)
1. `src/lib/lessonBlocks.ts`: block types, `normalizeBlocks()`, limits (max rows/cols/nodes).
2. Components for `comparison_table`, `pros_cons`, `decision_flow` under `src/components/lesson/`, using existing tokens.
3. `normalizeLesson` accepts `kind` and `blocks` (drop invalid blocks, keep the rest).
4. `ModuleStudyRoom` Read tab renders `blocks` when present, in order, after the summary.
5. Tests with hand-written fixtures. Verify in the browser with a seeded lesson. **No AI call.**

### Phase 2: `decision` kind generation
1. `src/lib/lessonKinds.ts`: kind registry (label, default blocks, prompt guide).
2. `generate-lesson`: if `kind === 'decision'`, use a decision prompt and JSON contract (summary, blocks, quiz, reviewCards, resources). Archetype guide still applies.
3. Add pricing/outlook rule to the prompt: no invented numbers, ranges only, "verify as of" note, official pricing page as the resource.
4. Test through **manual mode** (you paste a chat reply) first: free. Any real AI test needs a rupee estimate and your yes first.

### Phase 3: Choosing the kind (fixes the notes-only problem)
1. Learn-new page: add "Understand", "Make a decision", "Survey a field" alongside Course / Practice / Collect ideas (exact labels to settle with you).
2. "Collect ideas" topics get a "Turn into lessons" action instead of being notes-only.
3. A way to add a lesson of a chosen kind inside an existing topic.
4. Free keyword guess for a suggested kind (like `guessArchetype`); no AI call.

### Phase 4: More blocks and control
`cost_chart`, `matrix_2x2`, per-block "redo this section", block on/off before generating, level-aware depth.

### Phase 5: More kinds
`survey`, `roadmap`, `case-study`, then drills.

## Risks and open points
- **Staleness/accuracy:** pricing and "future" claims go stale and models can be wrong. Mitigated by ranges, a visible "verify as of", and official-source links. Not eliminated.
- **Taxonomy sprawl:** mode, shape, archetype and now kind. Keep kind lesson-level and small.
- **Friends sharing / plan copy** (`planCopy.ts`) may copy lessons: not yet checked against `blocks`. Check in Phase 1.
- **Fallback lesson objects** in `generate-lesson` (provider unavailable, invalid JSON) have no `blocks`: they must keep rendering. Covered by "no blocks = legacy render".
- **Token budget:** `maxTokens: 9000` today; a block-heavy lesson may need prompt trimming rather than a bigger limit.
- **Dev-server caution:** never touch `.next` while your dev server runs; use `NEXT_DIST_DIR` for builds (from your notes).

## Decisions needed from you before Phase 1
1. Kind list for v1: `concept`, `decision`, `survey`: agreed?
2. Starting blocks for Phase 1: table, pros/cons, flowchart: agreed? (cost chart and 2x2 follow in Phase 4.)
3. OK to leave existing lessons untouched (they read as `concept`)?
4. Confirm that the notes-only dead end you hit was "Collect ideas".
