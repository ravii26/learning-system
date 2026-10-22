# Ready-made replies for testing

Each file is a complete lesson reply, the same JSON an AI would return. Use them to test every lesson kind without any AI call:

1. Create a topic of the matching kind (Learn → Start learning, or Add Module with the kind dropdown).
2. Open the lesson. Use "Use my own ChatGPT/Claude" mode, so the app shows the paste panel.
3. Open the file, copy everything, paste it into the panel and import.

| File | Create it as | What it shows |
|---|---|---|
| `decision.json` | Choose between options | Table, pros and cons, cost chart, 2×2, flowchart |
| `survey.json` | See the whole field | Map of the field, category table, 2×2 |
| `survey_with_diagram.json` | See the whole field, tick "Lifecycle diagram" | The subscription lifecycle diagram |
| `roadmap.json` | Follow a path | Learning path and a flowchart |
| `case_study.json` | Learn from real examples | Two illustrative cases and a comparison |
| `drill.json` | Practise a skill | Steps and a timed practice session |
| `memorise.json` | Memorise it | The memory list with the self-test toggle (10 review cards) |
| `exam_prep.json` | Prepare for an exam or interview | Syllabus map and question patterns |
| `project.json` | Build something | Milestones, steps and a code listing |
| `resource.json` | Work through a book, course or video | A study guide split by position |
| `explore.json` | Just explore | Key ideas and questions to wonder about |

The numbers, cases and facts in these files are **sample data** for checking layout. They say so on screen where it matters. Do not rely on them.

A test (`src/components/lesson/StateDiagram.test.tsx`) loads every `.json` file in this folder and checks that nothing is dropped, so a new sample is checked automatically.
