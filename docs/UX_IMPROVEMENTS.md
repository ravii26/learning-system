# First UX improvement batch — 2026-10-13

Implemented locally, not committed or deployed.

- Today and primary navigation now lead to Start learning. The older route remains the series builder and supports existing links.
- Plain topics default to an understanding lesson. All formats remain available under Change format; goal, area, and section customization are collapsed.
- Notes show Saved only after the save promise succeeds. Failed writes retain their draft and offer Retry. Closing an editor flushes its pending write. Writes for the same note are serialized, including across drawer reopenings.
- Notes, unfinished quiz selections, explanations, and lesson position have tab-local recovery. Storage failures do not prevent studying. This is not cross-device sync, and practice-exercise answers are not included.
- Drawers move focus inside, wrap keyboard navigation, restore trigger focus, and lock background scrolling.
- Global border defaults restore explicit border utilities with preflight disabled.

Validation completed on 2026-10-15:

- TypeScript passes, the production build succeeds, and all 954 tests pass.
- ESLint is configured and completes with no warnings or errors.
- Signed-in browser checks covered Today → Start learning, creating a one-lesson topic in Next, importing a deterministic lesson, immediate note close/reopen, simulated offline saving and Retry, nested link-dialog focus/Escape behavior, and reload recovery for the current lesson step, an explanation draft, and an unfinished quiz selection.
- The Start learning page and Notes drawer were checked at 390px and 1280px, in light and dark themes. The mobile drawer was raised above the bottom navigation and its footer was made visible.
- Screenshots are in `docs/ux-verification/`. The test-only topic was soft-deleted after verification and can be restored through the app's normal recovery behavior if needed.

Known limits: draft recovery is tab-local rather than cross-device, and practice-exercise answer drafts are not included. Earlier border and entry-point notes in STATUS.md describe the state before this batch.
