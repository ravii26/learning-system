export interface Topic {
  id: string;
  title: string;
  area: string;
  status: string;
  why: string | null;
  depthTarget: string | null;
  nextAction: string | null;
  activeSlotType: string | null;
}

export interface SessionPlanStep {
  label: string;
  durationMin: number;
  type: 'review' | 'learn' | 'recall' | 'practice' | 'project' | 'log';
  description: string;
}

export interface SessionPlan {
  title: string;
  subtitle: string;
  reason: string;
  topicId: string | 'all';
  topicTitle: string;
  totalDurationMin: number;
  steps: SessionPlanStep[];
}

export function generateSessionPlan(
  timeMin: number,
  energy: 'low' | 'normal' | 'high',
  context: 'desk' | 'commute' | 'break' | 'weekend',
  activeTopics: Topic[],
  dueReviewCount: number,
  mistakesCount: number
): SessionPlan {
  // Find primary and secondary active topics
  const primaryTopic = activeTopics.find((t) => t.activeSlotType === 'primary') || activeTopics[0];
  const secondaryTopic = activeTopics.find((t) => t.activeSlotType === 'secondary') || activeTopics[1];

  const targetTopic = primaryTopic || secondaryTopic || null;
  const targetTopicId = targetTopic ? targetTopic.id : 'all';
  const targetTopicTitle = targetTopic ? targetTopic.title : 'All Active Interests';

  // 1. Scenario: 5 Minutes (Micro sessions)
  if (timeMin <= 5) {
    if (mistakesCount > 0 && energy !== 'low') {
      return {
        title: 'Mistake Bank Quick-Fire',
        subtitle: 'Review recent mistakes',
        reason: 'You have a short window. Testing your mistake bank is the highest-leverage way to plug gaps in 5 minutes.',
        topicId: targetTopicId,
        topicTitle: targetTopicTitle,
        totalDurationMin: 5,
        steps: [
          { label: 'Review mistake triggers', durationMin: 2, type: 'review', description: 'Look at 2 mistakes and why you made them.' },
          { label: 'Active recall test', durationMin: 2, type: 'recall', description: 'Write down the correct understanding from memory.' },
          { label: 'Log progress', durationMin: 1, type: 'log', description: 'Confirm review status.' },
        ],
      };
    }

    return {
      title: 'Spaced Recall Flash',
      subtitle: 'Active retrieval practice',
      reason: 'With 5 minutes, a rapid retrieval review of due concepts prevents decay without causing cognitive overload.',
      topicId: 'all',
      topicTitle: 'Spaced Review Queue',
      totalDurationMin: 5,
      steps: [
        { label: 'Active retrieval', durationMin: 4, type: 'recall', description: 'Test yourself on due concepts.' },
        { label: 'Sync memory queue', durationMin: 1, type: 'log', description: 'Update review intervals.' },
      ],
    };
  }

  // 2. Scenario: 15 Minutes
  if (timeMin <= 15) {
    if (energy === 'low') {
      return {
        title: 'Passive-to-Active Consolidation',
        subtitle: 'Review and elaborate',
        reason: 'Low energy is bad for hard problem-solving but great for elaborating on what you already understand.',
        topicId: targetTopicId,
        topicTitle: targetTopicTitle,
        totalDurationMin: 15,
        steps: [
          { label: 'Elaboration practice', durationMin: 6, type: 'review', description: 'Read a resource page or your notes and explain it in your own words.' },
          { label: 'Capture confusion points', durationMin: 5, type: 'review', description: 'Log any concepts that remain fuzzy.' },
          { label: 'Update Next Action', durationMin: 4, type: 'log', description: 'Refine your concrete next step.' },
        ],
      };
    }

    return {
      title: 'Active recall & Concept Check',
      subtitle: 'Micro-study cycle',
      reason: '15 minutes is enough to digest one critical concept and immediately check your recall.',
      topicId: targetTopicId,
      topicTitle: targetTopicTitle,
      totalDurationMin: 15,
      steps: [
        { label: 'Learn new concept', durationMin: 6, type: 'learn', description: 'Study next concept in your Knowledge Map.' },
        { label: 'Explain from memory', durationMin: 4, type: 'recall', description: 'Close notes. Summarize the concept immediately.' },
        { label: 'Apply micro-practice', durationMin: 3, type: 'practice', description: 'Formulate a simple example or solve a quick puzzle.' },
        { label: 'Update contract status', durationMin: 2, type: 'log', description: 'Advance concept level.' },
      ],
    };
  }

  // 3. Scenario: 30 Minutes (Standard Study Session)
  if (timeMin <= 30) {
    if (energy === 'low') {
      return {
        title: 'Spaced Interleaving & Memory Maintenance',
        subtitle: 'Review and clean bank',
        reason: 'Standard duration with low energy is ideal for doing mixed reviews across different maintenance cards.',
        topicId: 'all',
        topicTitle: 'Interleaved Topics',
        totalDurationMin: 30,
        steps: [
          { label: 'Interleaved spaced recall', durationMin: 12, type: 'recall', description: 'Retrieve concepts from multiple topics in random order.' },
          { label: 'Resolve active confusions', durationMin: 10, type: 'review', description: 'Look at your "I don\'t understand" list and clarify one.' },
          { label: 'Review Mistake Bank', durationMin: 6, type: 'review', description: 'Audit mistake avoidance strategies.' },
          { label: 'Log Session Metacognition', durationMin: 2, type: 'log', description: 'Quick self-evaluation.' },
        ],
      };
    }

    return {
      title: 'Socratic Concept-to-Practice Sprint',
      subtitle: 'Standard active learning session',
      reason: 'Perfect duration for a full retrieval learning cycle: study, recall, practice, and check mistakes.',
      topicId: targetTopicId,
      topicTitle: targetTopicTitle,
      totalDurationMin: 30,
      steps: [
        { label: 'Mistake bank warmup', durationMin: 4, type: 'review', description: 'Re-verify recent mistakes to avoid repeating them.' },
        { label: 'Study core concept', durationMin: 10, type: 'learn', description: 'Read explanation and concrete examples.' },
        { label: 'Active recall check', durationMin: 6, type: 'recall', description: 'Close resource. Retrieve explanation from memory.' },
        { label: 'Apply to problem', durationMin: 8, type: 'practice', description: 'Solve a guided scenario or write active code.' },
        { label: 'Document next action', durationMin: 2, type: 'log', description: 'Write a verb-first next action for this topic.' },
      ],
    };
  }

  // 4. Scenario: 60 Minutes (Deep Work Study Block)
  if (timeMin <= 60) {
    if (energy === 'low') {
      return {
        title: 'Resource Audit & Structure Mapping',
        subtitle: 'Restructure knowledge paths',
        reason: 'Use this time to organize and prune resources, update your Knowledge Map, and clarify foundations.',
        topicId: targetTopicId,
        topicTitle: targetTopicTitle,
        totalDurationMin: 60,
        steps: [
          { label: 'Knowledge Map audit', durationMin: 15, type: 'review', description: 'Review your progress. Group concepts and update links.' },
          { label: 'Prerequisite check', durationMin: 15, type: 'review', description: 'Audit foundations and check off skills you have acquired.' },
          { label: 'Resource clean-up', durationMin: 20, type: 'review', description: 'Prune resource list. Keep only high-value ones to prevent overload.' },
          { label: 'Log next active milestone', durationMin: 10, type: 'log', description: 'Detail the next learning milestone.' },
        ],
      };
    }

    return {
      title: 'Full Socratic Immersion & Practice',
      subtitle: 'Deep focus active session',
      reason: 'High duration and energy allow you to tackle difficult concepts and execute independent practice.',
      topicId: targetTopicId,
      topicTitle: targetTopicTitle,
      totalDurationMin: 60,
      steps: [
        { label: 'Prior session recall', durationMin: 8, type: 'recall', description: 'Retrieve everything you remember from last session without looking.' },
        { label: 'Socratic Concept Dive', durationMin: 18, type: 'learn', description: 'Study advanced core mechanisms.' },
        { label: 'Write summary & Connect', durationMin: 10, type: 'recall', description: 'Explain how this concept connects to your prerequisites.' },
        { label: 'Tackle unfamiliar problem', durationMin: 18, type: 'practice', description: 'Attempt to solve an independent challenge.' },
        { label: 'Log mistakes & feedback', durationMin: 6, type: 'log', description: 'Record any gaps uncovered during practice.' },
      ],
    };
  }

  // 5. Scenario: 2+ Hours (Deep Project / Application Block)
  return {
    title: 'Real-World Output & Project Block',
    subtitle: 'Capability demonstration',
    reason: 'A long block is best spent building, creating, or evaluating real-world outputs, which represents the highest rung of the mastery ladder.',
    topicId: targetTopicId,
    topicTitle: targetTopicTitle,
    totalDurationMin: timeMin,
    steps: [
      { label: 'Project planning & design', durationMin: 15, type: 'review', description: 'Map out the project or evaluation parameters.' },
      { label: 'Deep creation/coding/analysis', durationMin: Math.floor(timeMin - 35), type: 'project', description: 'Actively build a script, compile a company report, or shoot/edit footage.' },
      { label: 'Mistake & confusion harvest', durationMin: 12, type: 'review', description: 'Audit what went wrong and log unresolved issues.' },
      { label: 'Capability assessment update', durationMin: 8, type: 'log', description: 'Update contract outcomes and save proof of learning.' },
    ],
  };
}
