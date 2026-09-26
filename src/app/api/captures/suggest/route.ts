import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import {
  buildSuggestMessages,
  isSuggestionUsable,
  keywordSuggestion,
  parseSuggestions,
  MAX_PER_AI_CALL,
  type CaptureSuggestion,
} from '@/lib/captureSuggest';

const MAX_PER_REQUEST = 30;

/**
 * Makes sure every inbox capture has a suggested home, then returns them
 * all as { [captureId]: suggestion }. Only captures without a usable stored
 * suggestion are sent to the AI (up to 10 per call); if the AI is off or
 * fails, keyword matching fills in, so the inbox never waits on it.
 */
export async function POST() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const [captures, topics] = await Promise.all([
      db.captureItem.findMany({
        where: { userId, status: 'inbox' },
        select: { id: true, title: true, rawText: true, url: true, suggestion: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.topic.findMany({
        where: { userId, deletedAt: null, status: { not: 'dropped' } },
        select: { id: true, title: true, area: true, mode: true },
        orderBy: { lastTouchedDate: 'desc' },
      }),
    ]);

    const result: Record<string, CaptureSuggestion> = {};
    const missing = [];
    for (const c of captures) {
      if (isSuggestionUsable(c.suggestion, topics)) result[c.id] = c.suggestion as unknown as CaptureSuggestion;
      else missing.push(c);
    }

    const todo = missing.slice(0, MAX_PER_REQUEST);
    for (let i = 0; i < todo.length; i += MAX_PER_AI_CALL) {
      const batch = todo.slice(i, i + MAX_PER_AI_CALL);
      let suggestions: CaptureSuggestion[];
      if (hasAnyAIProviderConfigured()) {
        try {
          const { content } = await callAIContent(buildSuggestMessages(batch, topics), { temperature: 0.2, jsonMode: true });
          suggestions = parseSuggestions(content, batch, topics);
        } catch (e) {
          console.warn('Capture suggestions: AI unavailable, using keyword matching:', e instanceof Error ? e.message : e);
          suggestions = batch.map((c) => keywordSuggestion(c, topics));
        }
      } else {
        suggestions = batch.map((c) => keywordSuggestion(c, topics));
      }
      await db.$transaction(
        batch.map((c, j) =>
          db.captureItem.update({ where: { id: c.id }, data: { suggestion: suggestions[j] as unknown as Prisma.InputJsonValue } })
        )
      );
      batch.forEach((c, j) => (result[c.id] = suggestions[j]));
    }

    return NextResponse.json({ suggestions: result });
  } catch (e) {
    console.error('Failed to suggest capture homes:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
