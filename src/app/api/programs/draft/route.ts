import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { parseIntake } from '@/lib/program/intake';
import { resolveFieldForUser, trustedResources } from '@/lib/program/library';
import { buildSkeleton } from '@/lib/program/skeleton';
import { buildAdaptMessages, parseAdjustments, EMPTY_ADJUSTMENTS, type Adjustments } from '@/lib/program/adapt';
import { buildMapCritiqueMessages, buildMapDraftMessages, parseMapDraft, pickBetterMap } from '@/lib/program/mapDraft';
import { composeDraft } from '@/lib/program/generate';
import { factualWhy } from '@/lib/program/why';
import { enrichResources } from '@/lib/resources/enrich';
import { searchSyllabi } from '@/lib/resources/search';

/**
 * Builds a draft program. Nothing is saved.
 *   stage "review_map": no topic list for this field in your library or the
 *                       built-in ones, so the AI drafted one (grounded on
 *                       real syllabi when search is set up, then reviewed by
 *                       a second expert pass) for you to edit and approve.
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

    const resolved = await resolveFieldForUser(db, userId, body, intake.goal);
    if (resolved.kind === 'invalid') {
      return NextResponse.json({ error: 'That topic list has problems.', problems: resolved.problems }, { status: 400 });
    }

    if (resolved.kind === 'needs_map') {
      if (!hasAnyAIProviderConfigured()) {
        return NextResponse.json({ error: 'There is no topic list for this field yet, and drafting one needs the AI, which is not configured.' }, { status: 503 });
      }
      const overQuota = await aiQuotaGate(userId);
      if (overQuota) return overQuota;
      const grounding = await searchSyllabi(intake.goal);
      const { content } = await callAIContent(buildMapDraftMessages(intake, grounding), { temperature: 0.2, jsonMode: true });
      const first = parseMapDraft(content, intake.goal);
      if (!first.map) return NextResponse.json({ error: 'Could not draft a topic list for this. Try rewording your goal.', problems: first.problems }, { status: 502 });
      // Expert review pass: keep it only if it's a real improvement.
      let reviewed = false;
      let map = first.map;
      try {
        const { content: critique } = await callAIContent(buildMapCritiqueMessages(intake, first.map), { temperature: 0.2, jsonMode: true });
        const better = pickBetterMap(first.map, parseMapDraft(critique, intake.goal).map);
        map = better.map;
        reviewed = better.improved;
      } catch (e) {
        console.warn('Topic list review pass failed; using the first draft:', e instanceof Error ? e.message : e);
      }
      return NextResponse.json({
        stage: 'review_map', intake, map, reviewed,
        sources: grounding.map((g) => ({ title: g.title, url: g.url })),
      });
    }

    const { map, field, mapQuality, origin } = resolved;
    const trusted = await trustedResources(db, userId, field);
    let adjustments: Adjustments = EMPTY_ADJUSTMENTS;
    let aiUsed = false;
    if (hasAnyAIProviderConfigured()) {
      const overQuota = await aiQuotaGate(userId);
      if (overQuota) return overQuota;
      const skeleton = buildSkeleton(map, intake, { field, mapQuality, trusted });
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
      const first = composeDraft({ map, field, mapQuality, intake, adjustments, trusted });
      const enriched = await enrichResources(first, adjustments);
      adjustments = enriched.adjustments;
      notes = enriched.notes;
    }
    const draft = composeDraft({ map, field, mapQuality, intake, adjustments, trusted });
    draft.warnings.push(...notes);
    return NextResponse.json({ stage: 'draft', draft, adjustments, aiUsed, origin });
  } catch (e) {
    console.error('Failed to draft program:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
