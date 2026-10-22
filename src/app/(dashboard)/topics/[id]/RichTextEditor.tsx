'use client';
import { promptDialog } from '@/components/dialogs';

import { Icon } from '@/components/ui/Icon';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { createNoteAutosave, type SaveStatus } from '@/lib/noteAutosave';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void | Promise<void>;
  draftKey?: string;
  placeholder?: string;
  autoSaveMs?: number;
  showSaveStatus?: boolean;
  minHeight?: number;
}

export default function RichTextEditor({
  content,
  onChange,
  draftKey,
  placeholder = 'Start writing...',
  autoSaveMs = 1500,
  showSaveStatus = true,
  minHeight = 180,
}: RichTextEditorProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const isFirstMount = useRef(true);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [autosave] = useState(() => createNoteAutosave(async (html) => {
    await changeRef.current(html);
    try {
      if (draftKey && sessionStorage.getItem(draftKey) === html) sessionStorage.removeItem(draftKey);
    } catch { /* Storage may be disabled. */ }
  }, setSaveStatus, autoSaveMs, draftKey));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'rte-code-block' } },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'rte-editor',
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      if (isFirstMount.current) return;
      const html = editor.getHTML();
      try { if (draftKey) sessionStorage.setItem(draftKey, html); } catch { /* Storage may be disabled. */ }
      autosave.update(html);
    },
  });

  // Sync external content on first load
  useEffect(() => {
    if (!editor) return;
    let restored = false;
    try {
      const draft = draftKey ? sessionStorage.getItem(draftKey) : null;
      if (draft !== null) {
        restored = true;
        editor.commands.setContent(draft, { emitUpdate: false });
        autosave.update(draft);
      }
    } catch { /* Storage may be disabled. */ }
    if (!restored && editor && content && editor.isEmpty) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    isFirstMount.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (autosave.hasPending()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      void autosave.flush();
    };
  }, [autosave]);

  const setLink = useCallback(async () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = await promptDialog({ title: prev ? 'Edit link' : 'Add link', message: 'Leave it empty to remove the link.', value: prev || 'https://', confirmLabel: 'Save link' });
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const ToolBtn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`rte-tool-btn${active ? ' rte-tool-btn--active' : ''}`}
    >
      {children}
    </button>
  );

  const Divider = () => <span className="rte-divider" />;

  return (
    <div className="rte-wrapper">
      {/* Persistent Toolbar */}
      <div className="rte-toolbar">
        <ToolBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolBtn>
        <ToolBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolBtn>
        <ToolBtn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolBtn>
        <Divider />
        <ToolBtn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolBtn>
        <ToolBtn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolBtn>
        <ToolBtn title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolBtn>
        <ToolBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolBtn>
        <Divider />
        <ToolBtn title="Bullet List" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>≡</ToolBtn>
        <ToolBtn title="Numbered List" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>⊟</ToolBtn>
        <Divider />
        <ToolBtn title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolBtn>
        <ToolBtn title="Inline Code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>{`<>`}</ToolBtn>
        <ToolBtn title="Code Block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>⌨</ToolBtn>
        <Divider />
        <ToolBtn title="Link" active={editor.isActive('link')} onClick={setLink}><Icon name="link" size={15} /></ToolBtn>

        {showSaveStatus && (
          <span className="rte-save-status" role="status" aria-live="polite">
            <span className={`rte-save-dot rte-save-dot--${saveStatus}`} />
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved'}
            {saveStatus === 'error' && <button type="button" onClick={() => void autosave.flush()}>Not saved · Retry</button>}
          </span>
        )}
      </div>

      {/* Editor canvas */}
      <EditorContent editor={editor} className="rte-content-area" />
    </div>
  );
}
