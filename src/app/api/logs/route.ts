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
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Fetch logs from the last 365 days
    const logs = await db.activityLog.findMany({
      where: {
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
