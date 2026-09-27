import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { parseIntake } from '@/lib/program/intake';
import { resolveMap } from '@/lib/program/resolve';
import { buildSkeleton } from '@/lib/program/skeleton';
import { buildAdaptMessages, parseAdjustments, EMPTY_ADJUSTMENTS, type Adjustments } from '@/lib/program/adapt';
import { buildMapDraftMessages, parseMapDraft } from '@/lib/program/mapDraft';
import { composeDraft } from '@/lib/program/generate';
import { factualWhy } from '@/lib/program/why';
import { enrichResources } from '@/lib/resources/enrich';

/**
 * Builds a draft program. Nothing is saved.
 *   stage "review_map": the field has no curated map; here is an AI draft
 *                       for the learner to edit and approve (then call again
 *                       with customMap).
 *   stage "draft":      the plan, plus the sanitised AI adjustments the
 *                       client sends back on approval.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseIntake(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const intake = parsed.intake;

    const resolved = resolveMap(body, intake.goal);
    if (resolved.kind === 'invalid') {
      return NextResponse.json({ error: 'That topic list has problems.', problems: resolved.problems }, { status: 400 });
    }

    if (resolved.kind === 'needs_map') {
      if (!hasAnyAIProviderConfigured()) {
        return NextResponse.json({ error: 'There is no reviewed plan for this field yet, and drafting one needs the AI, which is not configured.' }, { status: 503 });
      }
      const overQuota = await aiQuotaGate(userId);
      if (overQuota) return overQuota;
      const { content } = await callAIContent(buildMapDraftMessages(intake), { temperature: 0.2, jsonMode: true });
      const { map, problems } = parseMapDraft(content, intake.goal);
      if (!map) return NextResponse.json({ error: 'Could not draft a topic list for this. Try rewording your goal.', problems }, { status: 502 });
      return NextResponse.json({ stage: 'review_map', intake, map });
    }

    const { map, field, mapQuality } = resolved;
    let adjustments: Adjustments = EMPTY_ADJUSTMENTS;
    let aiUsed = false;
    if (hasAnyAIProviderConfigured()) {
      const overQuota = await aiQuotaGate(userId);
      if (overQuota) return overQuota;
      const skeleton = buildSkeleton(map, intake, { field, mapQuality });
      skeleton.whyThisPlan = factualWhy(skeleton);
      try {
        const { content } = await callAIContent(buildAdaptMessages(skeleton, skeleton.whyThisPlan), { temperature: 0.3, jsonMode: true });
        adjustments = parseAdjustments(content, skeleton);
        aiUsed = true;
      } catch (e) {
        // The plan stands without the AI: the skeleton and factual why are complete.
        console.warn('Program adaptation failed; using the skeleton alone:', e instanceof Error ? e.message : e);
      }
    }

    // Books and live search (custom fields and book goals). Needs the item ids of
    // the plan with emphasis applied, so compose once, enrich, then compose again.
    let notes: string[] = [];
    if (mapQuality !== 'curated' || intake.bookTitle) {
      const first = composeDraft({ map, field, mapQuality, intake, adjustments });
      const enriched = await enrichResources(first, adjustments);
      adjustments = enriched.adjustments;
      notes = enriched.notes;
    }
    const draft = composeDraft({ map, field, mapQuality, intake, adjustments });
    draft.warnings.push(...notes);
    return NextResponse.json({ stage: 'draft', draft, adjustments, aiUsed });
  } catch (e) {
    console.error('Failed to draft program:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
