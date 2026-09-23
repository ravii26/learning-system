import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Fetch logs from the last 365 days
    const logs = await db.activityLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: oneYearAgo,
        },
      },
      select: {
        timestamp: true,
        fieldChanged: true,
        newValue: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    return NextResponse.json(logs);
  } catch (e) {
    console.error('Failed to fetch activity logs for analytics:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
