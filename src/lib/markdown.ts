export function renderMarkdown(md: string): string {
  if (!md) return '';
  
  // Escape HTML tags to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```js ... ```
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); padding: 12px; border-radius: var(--radius-sm); font-family: monospace; font-size: 0.85rem; overflow-x: auto; margin: 12px 0; white-space: pre;"><code style="font-family: inherit; color: #fbbf24;">${code.trim()}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; color: #fbbf24;">$1</code>');

  // Headings: ### title
  html = html.replace(/^### (.*?)$/gm, '<h5 style="font-size: 1rem; font-weight: 600; margin-top: 16px; margin-bottom: 6px; color: var(--color-primary-light);">$1</h5>');
  html = html.replace(/^## (.*?)$/gm, '<h4 style="font-size: 1.15rem; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: var(--color-primary-light);">$1</h4>');
  html = html.replace(/^# (.*?)$/gm, '<h3 style="font-size: 1.3rem; font-weight: 700; margin-top: 24px; margin-bottom: 12px; color: #fff;">$1</h3>');

  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: var(--color-primary-light);">$1</a>');

  // Unordered list: - item or * item
  const lines = html.split('\n');
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.substring(2);
      let listOpen = '';
      if (!inList) {
        listOpen = '<ul style="margin: 8px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; list-style-type: disc;">';
        inList = true;
      }
      lines[i] = `${listOpen}<li style="font-size: 0.9rem; color: var(--color-text-primary);">${content}</li>`;
    } else {
      if (inList) {
        lines[i] = '</ul>' + lines[i];
        inList = false;
      }
    }
  }
  if (inList) {
    lines.push('</ul>');
  }
  html = lines.join('\n');

  // Line breaks (replace remaining \n with <br />, except around block tags)
  html = html.replace(/\n/g, '<br />');

  // Clean up empty lines or duplicate <br /> tags
  html = html.replace(/(<br \/>){3,}/g, '<br /><br />');

  return html;
}
