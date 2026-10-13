import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonBlocks } from './LessonBlocks';
import { normalizeLesson } from '@/lib/lessonNormalize';
import { normalizeBlocks, BLOCK_LABEL } from '@/lib/lessonBlocks';
import { extractJson } from '@/lib/ai/manual';

const dir = path.resolve(__dirname, '../../../docs/lesson-test-replies');
const html = (file: string, onRedo?: () => void) => {
  const raw = (extractJson(fs.readFileSync(path.join(dir, file), 'utf8')) as { value: unknown }).value;
  return renderToStaticMarkup(<LessonBlocks blocks={normalizeLesson(raw)!.blocks as never} onRedo={onRedo} />);
};

describe('steps and routine (drill sample)', () => {
  const h = html('drill.json');
  it('numbers the steps and shows how to tell it worked and what goes wrong', () => {
    expect(h).toContain('<ol');
    expect(h).toContain('You will know it worked when:');
    expect(h).toContain('If it goes wrong:');
    expect(h).toContain('Find the shortest path');
  });
  it('totals the session from its parts and shows each part with its target', () => {
    expect(h).toContain('about 13 minutes');
    expect(h).toContain('3 min');
    expect(h).toContain('Target:');
    expect(h).toContain('20 clean changes in a row');
  });
  it('the time bar is described in words', () => {
    expect(h).toContain('aria-label="Warm-up, 3 minutes; Main drill, 6 minutes; Use it for real, 4 minutes"');
  });
});

describe('memory list (memorise sample)', () => {
  const h = html('memorise.json');
  it('lists the items with their memory aids, labelled as aids', () => {
    expect(h).toContain('1 Hydrogen (H)');
    expect(h).toContain('Memory aid:');
    expect(h).toContain('Hooks are memory aids, not facts');
  });
  it('offers a self-test toggle that starts off', () => {
    expect(h).toContain('Hide the answers to test yourself');
    expect(h).toContain('aria-pressed="false"');
  });
});

describe('question patterns (exam sample)', () => {
  const h = html('exam_prep.json');
  it('shows the pattern, the trap and the tip', () => {
    expect(h).toContain('Successive change');
    expect(h).toContain('Trap:');
    expect(h).toContain('Tip:');
  });
  it('says these are general patterns, not real past questions', () => {
    expect(h).toContain('General patterns, not real past questions');
  });
});

describe('study guide (resource sample)', () => {
  const h = html('resource.json');
  it('names the resource and says honestly that it was split by position', () => {
    expect(h).toContain('Book: ');
    expect(h).toContain('Atomic Habits');
    expect(h).toContain('Split by position: its exact chapters are not known here');
  });
  it('has before, per-part and after questions', () => {
    expect(h).toContain('Before you start');
    expect(h).toContain('Answer as you go');
    expect(h).toContain('When you finish');
    expect(h).toContain('The opening third');
  });
  it('a guide claiming real chapters says so instead', () => {
    const raw = { type: 'study_guide', resource: { title: 'X', kind: 'course' }, basis: 'real_structure', parts: [{ label: 'Week 1', focus: 'f' }, { label: 'Week 2', focus: 'g' }] };
    const out = renderToStaticMarkup(<LessonBlocks blocks={normalizeBlocks([raw])} />);
    expect(out).toContain('Based on its real structure');
    expect(out).toContain('Course: ');
  });
});

describe('key ideas (explore sample)', () => {
  const h = html('explore.json');
  it('shows each idea with why it is interesting, plus open questions', () => {
    expect(h).toContain('Bees can see ultraviolet light');
    expect(h).toContain('Things to wonder about');
  });
});

describe('every new section', () => {
  const files = ['drill.json', 'memorise.json', 'exam_prep.json', 'project.json', 'resource.json', 'explore.json'];
  it('uses no colour classes', () => {
    for (const f of files) expect(html(f), f).not.toMatch(/class="[^"]*\b(text|bg|border)-(danger|success|warning|primary|secondary|accent)\b/);
  });
  it('gets a Redo button with a readable name', () => {
    expect(html('drill.json', () => {})).toContain(`aria-label="Redo the ${BLOCK_LABEL.steps.toLowerCase()} section"`);
    expect(html('memorise.json', () => {})).toContain(`aria-label="Redo the ${BLOCK_LABEL.memory_list.toLowerCase()} section"`);
  });
  it('the project sample draws milestones and steps', () => {
    const h = html('project.json');
    expect(h).toContain('Milestones');
    expect(h).toContain('It stores a link');
    expect(h).toContain('Store links in a dictionary');
  });
  it('is wrapped so utility borders draw (the app turns Tailwind preflight off)', () => {
    expect(html('drill.json')).toContain('class="lesson-blocks ');
  });
});
