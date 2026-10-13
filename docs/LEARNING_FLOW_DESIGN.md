# Learning flow design

Status: written 2026-10-10. Nothing here is committed. See `docs/STATUS.md` for what is built and what is checked.

## The problem

The app grew four overlapping ways to say "what kind of learning is this":

| Vocabulary | Where | What it decides |
|---|---|---|
| Topic **mode** (syllabus, practice, accretion, reference) | `Topic.mode` | How a topic behaves and is measured |
| Program **shape** (course, reading, practice, exploration, project) | `src/lib/program/types.ts` | The kind of item in a learning plan |
| Subject **archetype** (language, exam, technical, ...) | `src/lib/program/fieldGuide.ts` | How a lesson teaches (the wording of the prompt) |
| Lesson **kind** (concept, decision, survey, ...) | `CurriculumItem.kind` | Which sections a lesson has |

and many ways in: Learn something new, the program wizard, the roadmap wizard, Learn Now, Goals, Explore, Library.

Two things were missing:

1. **Intents.** Nothing covered practising a skill, memorising, exam or interview prep, building a project, working through a book or course, or just exploring.
2. **Scale and oversight.** A kind only described one lesson. There was no single place to see what you are learning, and no way to change a lesson's kind or sections afterwards.

## Principle

The learner answers three plain questions. The app maps the answers onto the machinery that already exists. Nobody has to know the four vocabularies.

1. **What do you want to learn?** Free text.
2. **What for?** One of eleven intents.
3. **How big?** One lesson, a short series, a full plan, or ongoing.

Before anything is created the app shows **what you will get**: how many lessons, which sections, roughly how long.

## Intents (what for)

| Intent | Lesson kind | Ongoing means |
|---|---|---|
| Understand it | concept | collect ideas (notes) |
| Choose between options | decision | n/a |
| See the whole field | survey | n/a |
| Follow a path | roadmap | n/a |
| Learn from real examples | case_study | n/a |
| Practise a skill | drill | daily practice topic (existing practice mode) |
| Memorise it | memorise | n/a |
| Prepare for an exam or interview | exam_prep | n/a |
| Build something | project | n/a |
| Work through a book, course or video | resource | n/a |
| Just explore | explore | collect ideas (notes) |

## Sizes (how big)

| Size | What gets created |
|---|---|
| One lesson | A topic with one lesson of the intent's kind |
| A short series | The existing Course builder, pre-filled, with every lesson set to the intent's kind |
| A full plan | The existing Learning Program wizard, pre-filled with the goal |
| Ongoing | Only for practise and the open-ended intents: a daily practice topic, or a collect-ideas topic |

## New lesson kinds and the sections they use

| Kind | Default sections | Optional |
|---|---|---|
| drill | steps (how to do it), routine (today's session) | |
| memorise | memory list | comparison table |
| exam_prep | map of the syllabus, question patterns | learning path (revision plan) |
| project | steps, learning path (milestones) | comparison table |
| resource | study guide | learning path (pacing) |
| explore | key ideas | learning path, case study |

Six new section types: `steps`, `routine`, `memory_list`, `question_patterns`, `study_guide`, `key_ideas`. All follow the existing rules: the AI returns data, our code validates and draws it, no colour carries meaning.

Honesty rules specific to the new kinds:
- **resource**: the model must not invent chapters of a book or course. The study guide says whether its parts are the resource's real structure or just positions ("first third"), and is labelled accordingly.
- **exam_prep**: no invented past questions, marks or dates; question patterns describe how things are typically asked.
- **memorise**: items must be correct and checkable; mnemonics are labelled as aids.

## Managing what you are learning

A new page, **All lessons**, lists every lesson across every topic:
- kind, size, done or not, written or not
- **Needs regenerating** when its kind was changed after it was written
- change kind or sections (this never deletes a written lesson; the study room offers to regenerate)
- open the lesson

Changing a kind does not convert old content. The old lesson stays readable until you regenerate, and the study room says so.

## What stays as it is
- Existing topics, lessons and review cards are untouched.
- The six tiles on Learn something new stay for now.
- No existing database column changes. `CurriculumItem.kind` is already free text, so new kinds need no migration.

## Out of scope
- Rewriting the program wizard.
- An AI suggestion for the intent (the keyword guess stays).
- A real-model quality review of each kind (needs approval to spend credits).
