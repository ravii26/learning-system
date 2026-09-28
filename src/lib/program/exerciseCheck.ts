import type { AIMessage } from '@/lib/ai/aiClient';

export interface CheckInput {
  subject: string;
  instruction: string;
  prompt: string;
  modelAnswer: string;
  answer: string;
  /** The answer was spoken and transcribed: ignore punctuation and capitals, and don't blame the transcript for homophones. */
  spoken: boolean;
}

export type CheckVerdict = 'correct' | 'partly' | 'wrong';

export interface CheckResult {
  verdict: CheckVerdict;
  /** 1-3 short sentences: what's right, what exactly is wrong and why. */
  feedback: string;
  /** The learner's answer with the fewest changes that make it right; empty when already right. */
  corrected: string;
}

export function buildCheckMessages(i: CheckInput): AIMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a patient, exact teacher marking one practice answer. You accept any correct answer, not only the model one. You never invent errors. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `Subject: ${i.subject || 'not stated'}
Exercise: ${i.instruction}
${i.prompt}
Model answer (one correct answer, others may also be right): ${i.modelAnswer || 'not given'}

Learner's answer${i.spoken ? ' (spoken, from speech-to-text: ignore punctuation, capitals and obvious transcription slips)' : ''}:
${i.answer}

Mark it:
- "correct" if it does what the exercise asks and has no real mistakes (a different but valid answer is correct),
- "partly" if the idea is right but there are mistakes,
- "wrong" if it doesn't do what was asked.
In "feedback" (1-3 short sentences, plain English, speak to the learner as "you"): name each real mistake and the rule behind it. If correct, say briefly what was good. For a spoken answer to a speaking task, also note any filler words or very long, run-on sentences.
In "corrected": the learner's own answer with the fewest changes that make it right (empty string if already correct).

Return JSON: {"verdict": "correct|partly|wrong", "feedback": "...", "corrected": "..."}`,
    },
  ];
}

export function parseCheck(raw: string): CheckResult | null {
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const verdict: CheckVerdict = ['correct', 'partly', 'wrong'].includes(j?.verdict) ? j.verdict : 'partly';
    const feedback = typeof j?.feedback === 'string' ? j.feedback.trim().slice(0, 800) : '';
    if (!feedback) return null;
    const corrected = typeof j?.corrected === 'string' ? j.corrected.trim().slice(0, 2000) : '';
    return { verdict, feedback, corrected: verdict === 'correct' ? '' : corrected };
  } catch {
    return null;
  }
}
