import { describe, expect, it } from 'vitest';
import { extractJson, fixPrompt, toChatPrompt } from './manual';

const val = (text: string) => {
  const r = extractJson(text);
  if (!r.ok) throw new Error(r.problem);
  return r.value;
};

describe('extractJson: replies the way chat apps really send them', () => {
  it('plain JSON', () => expect(val('{"a":1}')).toEqual({ a: 1 }));
  it('```json fence with prose around it', () =>
    expect(val('Sure! Here is your plan:\n```json\n{"title":"Guitar","n":[1,2]}\n```\nGood luck!')).toEqual({ title: 'Guitar', n: [1, 2] }));
  it('fence without a language', () => expect(val('```\n{"a":true}\n```')).toEqual({ a: true }));
  it('no fence, JSON inside prose', () => expect(val('Here you go {"a": {"b": "c}"}} hope it helps')).toEqual({ a: { b: 'c}' } }));
  it('curly quotes from a phone keyboard', () => expect(val('{“title”: “English”}')).toEqual({ title: 'English' }));
  it('trailing commas', () => expect(val('{"a":[1,2,],"b":3,}')).toEqual({ a: [1, 2], b: 3 }));
  it('a top-level array', () => expect(val('```json\n[{"x":1}]\n```')).toEqual([{ x: 1 }]));
  it('escaped quotes inside strings', () => expect(val('{"s":"he said \\"hi\\" {not json}"}')).toEqual({ s: 'he said "hi" {not json}' }));
  it('first fence is prose, second is the JSON', () =>
    expect(val('```\nnot json\n```\nand\n```json\n{"ok":1}\n```')).toEqual({ ok: 1 }));
  it('Windows line endings and a BOM', () => expect(val('﻿```json\r\n{"a":1}\r\n```')).toEqual({ a: 1 }));

  it('cut-off JSON says so', () => {
    const r = extractJson('```json\n{"competencies":[{"title":"A"},{"title":"B"');
    expect(r).toMatchObject({ ok: false });
    expect((r as { problem: string }).problem).toMatch(/cut off/);
  });
  it('no JSON at all says so', () => {
    expect(extractJson('Sorry, I cannot help with that.')).toMatchObject({ ok: false, problem: expect.stringMatching(/No JSON/) });
    expect(extractJson('   ')).toMatchObject({ ok: false, problem: expect.stringMatching(/empty/) });
  });
});

describe('toChatPrompt / fixPrompt', () => {
  it('puts the role first, the task next and the reply rule last', () => {
    const p = toChatPrompt([{ role: 'system', content: 'You are a teacher.' }, { role: 'user', content: 'Make a plan.' }]);
    expect(p.indexOf('You are a teacher.')).toBeLessThan(p.indexOf('Make a plan.'));
    expect(p.trim().endsWith('write more briefly.')).toBe(true);
    expect(p).toMatch(/ONE ```json code block/);
  });
  it('fix message carries the problems', () => expect(fixPrompt(['It was cut off.'])).toMatch(/It was cut off\./));
});
