'use client';

import React from 'react';
import { SessionLog, ActivityType } from './SessionDebriefModal';

interface SessionTimelineProps {
  sessionLogs: SessionLog[];
}

const ACTIVITY_META: Record<ActivityType, { icon: string; label: string; color: string }> = {
  read_watch:     { icon: '📖', label: 'Read / Watch',     color: 'var(--ink)' },
  write_practice: { icon: '✍️', label: 'Write / Practice', color: 'var(--color-text-secondary)' },
  speak_converse: { icon: '🗣️', label: 'Speak / Converse', color: 'var(--color-success)' },
  drill_repeat:   { icon: '🎯', label: 'Drill / Repeat',   color: 'var(--color-warning)' },
  course_module:  { icon: '📚', label: 'Course Module',    color: 'var(--color-text-secondary)' },
  free_explore:   { icon: '🔬', label: 'Free Explore',     color: 'var(--color-danger)' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function detectRecurringStruggles(logs: SessionLog[]): Map<string, number> {
  const counts = new Map<string, number>();
  logs.forEach(log => {
    if (!log.whatWasHard) return;
    // Normalise to lowercase words for matching
    const key = log.whatWasHard.toLowerCase().trim().slice(0, 60);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function calcStreak(logs: SessionLog[]): number {
  if (logs.length === 0) return 0;
  const days = Array.from(new Set(logs.map(l => new Date(l.timestamp).toDateString()))).sort().reverse();
  let streak = 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (days[0] !== today && days[0] !== yesterday) return 0;
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toDateString();
    if (days[i] === expected) streak++;
    else break;
  }
  return streak;
}

function mostUsedActivity(logs: SessionLog[]): { icon: string; label: string } | null {
  if (logs.length === 0) return null;
  const counts: Partial<Record<ActivityType, number>> = {};
  logs.forEach(l => { counts[l.activityType] = (counts[l.activityType] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? ACTIVITY_META[top[0] as ActivityType] : null;
}

export default function SessionTimeline({ sessionLogs }: SessionTimelineProps) {
  const sorted = [...sessionLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const totalMins = sessionLogs.reduce((s, l) => s + l.durationMinutes, 0);
  const streak = calcStreak(sessionLogs);
  const topActivity = mostUsedActivity(sessionLogs);
  const struggleCounts = detectRecurringStruggles(sessionLogs);

  if (sessionLogs.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '2.5rem' }}>📅</span>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>No sessions logged yet</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', maxWidth: '300px' }}>
          When you finish a study session, hit the timer or click "Log a Session" to record what you did and what you learned.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Stats bar */}
      <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          📊 <strong style={{ color: 'var(--color-text-primary)' }}>{sessionLogs.length}</strong> sessions
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          ⏱️ <strong style={{ color: 'var(--color-text-primary)' }}>
            {totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${totalMins}m`}
          </strong> total
        </span>
        {streak > 0 && (
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            🔥 <strong style={{ color: 'var(--color-warning)' }}>{streak}-day</strong> streak
          </span>
        )}
        {topActivity && (
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            Most used: <strong style={{ color: 'var(--color-text-primary)' }}>{topActivity.icon} {topActivity.label}</strong>
          </span>
        )}
      </div>

      {/* Timeline entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sorted.map(log => {
          const meta = ACTIVITY_META[log.activityType];
          const hardKey = log.whatWasHard.toLowerCase().trim().slice(0, 60);
          const isRecurring = log.whatWasHard && (struggleCounts.get(hardKey) || 0) >= 3;

          return (
            <div
              key={log.id}
              className="glass-panel"
              style={{
                padding: '14px 18px',
                borderLeft: `3px solid ${meta.color}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Row 1: type + duration + time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1rem' }}>{meta.icon}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: meta.color }}>{meta.label}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', padding: '1px 6px', borderRadius: '9999px', background: 'var(--fill-2)', border: '1px solid var(--border-color)' }}>
                  {log.durationMinutes} min
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{relativeTime(log.timestamp)}</span>
              </div>

              {/* What done */}
              {log.whatDone && (
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>{log.whatDone}</p>
              )}

              {/* Insight */}
              {log.oneInsight && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem' }}>💡</span>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-warning)', fontStyle: 'italic' }}>{log.oneInsight}</p>
                </div>
              )}

              {/* What was hard */}
              {log.whatWasHard && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem' }}>😤</span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{log.whatWasHard}</p>
                  {isRecurring && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-danger)', background: 'var(--danger-tint)', padding: '1px 6px', borderRadius: '9999px', border: '1px solid var(--danger-line)', whiteSpace: 'nowrap' }}>
                      ⚠️ Recurring ({struggleCounts.get(hardKey)}×)
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
