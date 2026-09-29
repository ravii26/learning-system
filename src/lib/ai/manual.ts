/**
 * "Use your own ChatGPT / Claude": the learner runs our prompt in their own
 * chat account and pastes the reply back, so big generation steps (plans,
 * lessons, practice days) cost the app nothing. These helpers turn our
 * messages into one pasteable prompt and dig the JSON back out of whatever
 * a chat app returns (prose around it, code fences, smart quotes...).
 */
import type { AIMessage } from './aiClient';

const REPLY_RULE =
  'IMPORTANT: Reply with ONE ```json code block containing the complete JSON, and nothing else before or after it. Do not shorten or leave anything out. If your reply might get too long, keep every field but write more briefly.';

/** One text a person pastes into any chat app. */
export function toChatPrompt(messages: AIMessage[]): string {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content.trim()).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => m.content.trim()).join('\n\n');
  return [system && `ROLE\n${system}`, rest, REPLY_RULE].filter(Boolean).join('\n\n---\n\n');
}

/** Straight quotes for the curly ones chat apps and phones put in, outside of nothing: JSON never needs curly quotes as syntax. */
const straighten = (s: string) => s.replace(/[“”„″]/g, '"').replace(/[‘’′]/g, "'");
const noTrailingCommas = (s: string) => s.replace(/,(\s*[}\]])/g, '$1');

function tryParse(s: string): unknown | null {
  for (const candidate of [s, noTrailingCommas(s), noTrailingCommas(straighten(s))]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next repair
    }
  }
  return null;
}

/** The first balanced {...} or [...] in the text, respecting strings. */
function balanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null; // cut off before it closed
}

export type ExtractResult = { ok: true; value: unknown } | { ok: false; problem: string };

/** Finds and parses the JSON in a pasted chat reply. */
export function extractJson(text: string): ExtractResult {
  const t = (text ?? '').replace(/^﻿/, '').trim();
  if (!t) return { ok: false, problem: 'The reply is empty. Paste the whole answer from the chat.' };

  const fences = Array.from(t.matchAll(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/g)).map((m) => m[1].trim());
  const candidates = [...fences, t];
  for (const c of candidates) {
    const direct = tryParse(c);
    if (direct !== null && typeof direct === 'object') return { ok: true, value: direct };
    const inner = balanced(straighten(c));
    if (inner) {
      const parsed = tryParse(inner);
      if (parsed !== null && typeof parsed === 'object') return { ok: true, value: parsed };
    }
  }
  const opened = /[{[]/.test(t);
  return {
    ok: false,
    problem: opened
      ? 'The reply looks cut off: the JSON never finishes. Chat apps sometimes stop long answers.'
      : 'No JSON found in the reply. Make sure you pasted the chat’s answer, not the prompt.',
  };
}

/** A follow-up the learner sends in the same chat when the import failed. */
export function fixPrompt(problems: string[]): string {
  return `Your last reply could not be used: ${problems.slice(0, 5).join(' ')}
Please send the COMPLETE JSON again, in ONE \`\`\`json code block, with nothing before or after it. Keep every required field. If it is too long, write the text inside the fields more briefly, but do not drop items.`;
}
