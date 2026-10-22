import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNoteAutosave } from './noteAutosave';

afterEach(() => vi.useRealTimers());

describe('note autosave', () => {
  it('does not let buffered edits from a closed editor overwrite newer reopened edits', async () => {
    let release!: () => void;
    const values: string[] = [];
    const oldSave = vi.fn(async (html: string) => {
      values.push(html);
      if (html === 'first') await new Promise<void>((resolve) => { release = resolve; });
    });
    const old = createNoteAutosave(oldSave, vi.fn(), 1500, 'buffered-note');
    old.update('first');
    const oldWrite = old.flush();
    await vi.waitFor(() => expect(oldSave).toHaveBeenCalled());
    old.update('buffered before close');
    const reopened = createNoteAutosave((html) => { values.push(html); }, vi.fn(), 1500, 'buffered-note');
    reopened.update('newest after reopen');
    const newWrite = reopened.flush();
    release();
    await Promise.all([oldWrite, newWrite]);
    expect(values).toEqual(['first', 'newest after reopen']);
  });

  it('keeps writes ordered when a drawer closes and reopens during a save', async () => {
    let release!: () => void;
    const firstSave = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const nextSave = vi.fn().mockResolvedValue(undefined);
    const first = createNoteAutosave(firstSave, vi.fn(), 1500, 'same-note');
    const reopened = createNoteAutosave(nextSave, vi.fn(), 1500, 'same-note');
    first.update('older');
    const oldWrite = first.flush();
    await Promise.resolve();
    await Promise.resolve();
    reopened.update('newer');
    const newWrite = reopened.flush();
    expect(nextSave).not.toHaveBeenCalled();
    release();
    await Promise.all([oldWrite, newWrite]);
    expect(nextSave).toHaveBeenCalledWith('newer');
  });

  it('waits for server confirmation and serializes newer edits behind an in-flight write', async () => {
    let release!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createNoteAutosave(save, status, 1000);
    queue.update('first');
    const saving = queue.flush();
    expect(status).toHaveBeenLastCalledWith('saving');
    queue.update('latest');
    await queue.flush();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await saving;
    expect(save.mock.calls.map(([html]) => html)).toEqual(['first', 'latest']);
    expect(status).toHaveBeenLastCalledWith('saved');
    expect(queue.hasPending()).toBe(false);
  });

  it('retains failed content for an explicit retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createNoteAutosave(save, status, 1000);
    queue.update('important notes');
    await queue.flush();
    expect(status).toHaveBeenLastCalledWith('error');
    expect(queue.hasPending()).toBe(true);
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith('important notes');
    expect(status).toHaveBeenLastCalledWith('saved');
  });

  it('flushes immediately when the editor closes before its debounce expires', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteAutosave(save, vi.fn(), 1500);
    queue.update('draft');
    expect(save).not.toHaveBeenCalled();
    await queue.flush();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('draft');
  });
});
