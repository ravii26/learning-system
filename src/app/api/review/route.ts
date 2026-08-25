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
    const logs = await db.reviewLog.findMany({
      orderBy: { reviewedAt: 'desc' },
      take: 20,
    });

    const lastLog = logs[0] || null;

    return NextResponse.json({
      logs,
      lastReviewDate: lastLog ? lastLog.reviewedAt : null,
    });
  } catch (e) {
    console.error('Failed to get review logs:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { reviews } = body; // Array of { topicId, title, decision: 'continue' | 'pause' | 'drop' | 'maintenance' }

    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json({ error: 'Invalid reviews input' }, { status: 400 });
    }

    // Process each topic review decision
    for (const rev of reviews) {
      const { topicId, decision } = rev;

      const topic = await db.topic.findUnique({ where: { id: topicId } });
      if (!topic) continue;

      let newStatus = topic.status;
      if (decision === 'pause') {
        newStatus = 'paused';
      } else if (decision === 'drop') {
        newStatus = 'dropped';
      } else if (decision === 'maintenance') {
        newStatus = 'maintenance';
      } else if (decision === 'continue') {
        newStatus = 'active';
      }

      if (newStatus !== topic.status) {
        // Enforce Next Action rule if moving to active or paused
        if ((newStatus === 'active' || newStatus === 'paused') && (!topic.nextAction || !topic.nextAction.trim())) {
          return NextResponse.json(
            { error: `Cannot transition "${topic.title}" to ${newStatus} without a Next Action defined.` },
            { status: 400 }
          );
        }

        // Active Topic Limit validation during review
        if (newStatus === 'active' && topic.status !== 'active') {
          const activeCount = await db.topic.count({
            where: { status: 'active' },
          });
          if (activeCount >= 2) {
            return NextResponse.json(
              { error: 'Cannot activate topic. Active topic slots (max 2) are fully occupied.' },
              { status: 400 }
            );
          }
        }

        // Update status
        await db.topic.update({
          where: { id: topicId },
          data: { status: newStatus },
        });

        // Log the activity log
        await db.activityLog.create({
          data: {
            topicId,
            fieldChanged: 'status',
            oldValue: topic.status,
            newValue: newStatus,
          },
        });
      }
    }

    // Save review log
    const log = await db.reviewLog.create({
      data: {
        topicsReviewed: reviews,
      },
    });

    return NextResponse.json(log);
  } catch (e) {
    console.error('Failed to save review:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
