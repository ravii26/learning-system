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

/**
 * Chat apps often write a real line break or tab inside a text value (long
 * lesson fields especially), which JSON forbids. Inside strings only, turn
 * them into their escaped forms; the structure outside strings is untouched.
 */
function escapeControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
      } else if (ch === '\\') {
        escaped = true;
        out += ch;
      } else if (ch === '"') {
        inString = false;
        out += ch;
      } else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (ch < ' ') out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
      else out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

function tryParse(s: string): unknown | null {
  const repairs = [s, noTrailingCommas(s), noTrailingCommas(straighten(s))];
  for (const candidate of [...repairs, ...repairs.map(escapeControlCharsInStrings)]) {
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
  const asObject = (s: string) => {
    const parsed = tryParse(s);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  };
  // True when some text was a complete {...} that still would not parse: a
  // formatting error, not a reply that stopped early.
  let completeButUnreadable = false;
  const inside = (s: string) => {
    const inner = balanced(straighten(s));
    const parsed = inner ? asObject(inner) : null;
    if (inner && !parsed) completeButUnreadable = true;
    return parsed;
  };

  // 1. A whole candidate that is itself the JSON.
  for (const c of candidates) {
    const direct = asObject(c);
    if (direct) return { ok: true, value: direct };
  }
  // 2. The balanced JSON in the whole reply. This comes before looking inside the fences because a
  //    lesson's strings can hold code fences of their own ("```python ..."), which cut a fence match
  //    short and leave a fragment; a balanced scan respects strings, so it sees the whole object.
  const whole = inside(t);
  if (whole) return { ok: true, value: whole };
  // 3. JSON inside a fence that has prose around it.
  for (const c of fences) {
    const found = inside(c);
    if (found) return { ok: true, value: found };
  }
  const opened = /[{[]/.test(t);
  return {
    ok: false,
    problem: completeButUnreadable
      ? 'The JSON in the reply has a formatting error (for example a broken quote or a stray character), so it could not be read.'
      : opened
        ? 'The reply looks cut off: the JSON never finishes. Chat apps sometimes stop long answers.'
        : 'No JSON found in the reply. Make sure you pasted the chat’s answer, not the prompt.',
  };
}

/** A follow-up the learner sends in the same chat when the import failed. */
export function fixPrompt(problems: string[]): string {
  return `Your last reply could not be used: ${problems.slice(0, 5).join(' ')}
Please send the COMPLETE JSON again, in ONE \`\`\`json code block, with nothing before or after it. Keep every required field. If it is too long, write the text inside the fields more briefly, but do not drop items.`;
}
