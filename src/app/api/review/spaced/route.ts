import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

function checkAuth() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    // 1. Fetch active and maintenance topics
    const topics = await db.topic.findMany({
      where: {
        status: { in: ['active', 'maintenance'] }
      }
    });

    const now = new Date();
    const dueConcepts: any[] = [];

    for (const t of topics) {
      const map = (t.knowledgeMap as any) || { concepts: [] };
      const concepts = map.concepts || [];

      for (const c of concepts) {
        // Skip concepts that are completely unknown and not exposed
        if (c.status === 'Unknown') continue;

        let isDue = false;
        if (!c.nextReviewDate) {
          isDue = true;
        } else {
          const nextDate = new Date(c.nextReviewDate);
          isDue = nextDate <= now;
        }

        if (isDue) {
          dueConcepts.push({
            topicId: t.id,
            topicTitle: t.title,
            topicArea: t.area,
            conceptId: c.id,
            conceptTitle: c.title,
            conceptStatus: c.status,
            difficulty: c.difficulty || 'Medium',
            importance: c.importance || 'Medium',
            lastRecalledAt: c.lastRecalledAt || null,
            reviewIntervalDays: c.reviewIntervalDays || 0,
            consecutiveRecalls: c.consecutiveRecalls || 0,
          });
        }
      }
    }

    return NextResponse.json({ dueConcepts });
  } catch (e) {
    console.error('Failed to get due spaced concepts:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { topicId, conceptId, success, mistakeText, whyMade, howToAvoid } = body;

    if (!topicId || !conceptId) {
      return NextResponse.json({ error: 'topicId and conceptId are required' }, { status: 400 });
    }

    // Load topic
    const topic = await db.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const map = (topic.knowledgeMap as any) || { concepts: [] };
    const concepts = map.concepts || [];
    let conceptFound = false;

    // Spaced repetition scheduler update
    const updatedConcepts = concepts.map((c: any) => {
      if (c.id === conceptId) {
        conceptFound = true;
        const currentInterval = c.reviewIntervalDays || 0;
        const consecutive = c.consecutiveRecalls || 0;

        let nextInterval = 1;
        let nextConsecutive = 0;
        let newStatus = c.status;

        if (success) {
          nextConsecutive = consecutive + 1;
          if (currentInterval === 0) {
            nextInterval = 1;
          } else if (currentInterval === 1) {
            nextInterval = 2;
          } else {
            nextInterval = Math.min(365, currentInterval * 2);
          }

          // Advance status in Mastery Ladder if successful
          const ladder = ['Unknown', 'Exposed', 'Understood', 'Can Recall', 'Can Apply', 'Can Solve', 'Can Explain', 'Can Teach', 'Can Create'];
          const currentIdx = ladder.indexOf(c.status);
          if (currentIdx !== -1 && currentIdx < ladder.indexOf('Can Explain')) {
            newStatus = ladder[currentIdx + 1];
          }
        } else {
          // Reset interval to 1 day on fail
          nextInterval = 1;
          nextConsecutive = 0;
          
          // Revert status to Exposed or Understood
          if (c.status === 'Can Recall' || c.status === 'Can Apply') {
            newStatus = 'Understood';
          }
        }

        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + nextInterval);

        return {
          ...c,
          status: newStatus,
          reviewIntervalDays: nextInterval,
          consecutiveRecalls: nextConsecutive,
          lastRecalledAt: new Date().toISOString(),
          nextReviewDate: nextReview.toISOString(),
        };
      }
      return c;
    });

    if (!conceptFound) {
      return NextResponse.json({ error: 'Concept not found in knowledge map' }, { status: 404 });
    }

    // Handle optional mistake logging to Mistake Bank
    let updatedMistakes = (topic.mistakes as any[]) || [];
    if (!success && mistakeText) {
      const newMistake = {
        id: Math.random().toString(36).substring(2, 9),
        concept: concepts.find((c: any) => c.id === conceptId)?.title || 'General',
        mistake: mistakeText.trim(),
        whyMade: (whyMade || '').trim(),
        correctUnderstanding: 'Verify concept rules and constraints.',
        example: '',
        howToAvoid: (howToAvoid || '').trim(),
        createdAt: new Date().toISOString(),
      };
      updatedMistakes = [...updatedMistakes, newMistake];
    }

    // Save changes
    const updated = await db.topic.update({
      where: { id: topicId },
      data: {
        knowledgeMap: { concepts: updatedConcepts },
        mistakes: updatedMistakes,
        lastTouchedDate: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to log spaced review:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
